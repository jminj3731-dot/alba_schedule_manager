/**
 * 이메일 알림 스케줄러
 * 매 5분마다 실행:
 *   1) 출근 1시간 전 (55~65분 전): "오늘 근무 1시간 전입니다" 알림
 *   2) 출근 시간 정각 (0~2분 전): "지금 출근 버튼을 눌러주세요!" 알림 (단 한 번)
 *   3) 퇴근 10분 전 (8~10분 전): "퇴근 버튼을 눌러주세요!" 알림
 */
import { getSchedulesByDateRange, getAllWorkers, getDb, resetDbConnection, getAppSetting, setAppSetting, getStatsByDateRange } from "./db";
import { sendShiftReminderEmail, sendCheckInNowEmail, sendCheckOutNowEmail, sendPaydayEveEmail } from "./email";

// 서버 재시작 시 초기화되는 메모리 캐시 (빠른 중복 체크용)
const memCache = new Set<string>();

// 스케줄러 중복 시작 방지
let schedulerStarted = false;

// DB에서 오늘의 발송 기록 로드
async function loadSentKeys(today: string): Promise<void> {
  try {
    const raw = await getAppSetting(`email_sent_${today}`);
    if (raw) {
      const keys: string[] = JSON.parse(raw);
      keys.forEach(k => memCache.add(k));
    }
  } catch {
    // 로드 실패 시 무시 (발송 중복보다 누락이 낫지 않으므로 계속 진행)
  }
}

// 발송 완료 키를 DB에 저장
async function markSent(key: string, today: string): Promise<void> {
  memCache.add(key);
  try {
    const raw = await getAppSetting(`email_sent_${today}`);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    if (!keys.includes(key)) {
      keys.push(key);
      await setAppSetting(`email_sent_${today}`, JSON.stringify(keys));
    }
  } catch {
    // DB 저장 실패 시 메모리 캐시만 유지
  }
}

// 이미 발송됐는지 확인 (메모리 우선, 없으면 DB 확인)
async function isSent(key: string, today: string): Promise<boolean> {
  if (memCache.has(key)) return true;
  try {
    const raw = await getAppSetting(`email_sent_${today}`);
    if (raw) {
      const keys: string[] = JSON.parse(raw);
      if (keys.includes(key)) {
        memCache.add(key); // 메모리에도 캐싱
        return true;
      }
    }
  } catch {
    // DB 확인 실패 시 메모리 캐시 기준
  }
  return false;
}

// 한국 시간 기준 현재 날짜/시간 반환
function getKSTNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function getKSTDateString(): string {
  return getKSTNow().toISOString().split("T")[0];
}

function getKSTTimeString(): string {
  const kst = getKSTNow();
  const h = kst.getUTCHours().toString().padStart(2, "0");
  const m = kst.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// 기본 타임별 출근/퇴근 시간
const DEFAULT_START_TIMES: Record<string, string> = {
  a: "17:30",
  b: "18:00",
  c: "18:00",
  d: "18:00",
};

const DEFAULT_END_TIMES: Record<string, string> = {
  a: "22:00",
  b: "22:00",
  c: "22:00",
  d: "21:00",
};

/**
 * 두 시간 문자열(HH:MM) 사이의 분 차이 계산
 * timeA - timeB (분 단위, 양수 = timeA가 더 늦음)
 */
function minutesDiff(timeA: string, timeB: string): number {
  const [ah, am] = timeA.split(":").map(Number);
  const [bh, bm] = timeB.split(":").map(Number);
  return (ah * 60 + am) - (bh * 60 + bm);
}

/**
 * DB 연결 상태 확인 및 재연결 시도
 */
async function ensureDbConnection(): Promise<boolean> {
  try {
    const db = await getDb();
    return !!db;
  } catch {
    return false;
  }
}

/**
 * 스케줄 확인 및 이메일 발송 메인 함수
 */
export async function checkAndSendShiftReminders(): Promise<void> {
  // DB 연결 확인
  const dbOk = await ensureDbConnection();
  if (!dbOk) {
    console.warn("[EmailScheduler] DB not available, skipping check");
    return;
  }

  try {
    const today = getKSTDateString();
    const currentTime = getKSTTimeString();

    // 오늘의 발송 기록 DB에서 로드 (서버 재시작 후 첫 실행 시)
    await loadSentKeys(today);

    // 오늘 스케줄 조회
    const todaySchedules = await getSchedulesByDateRange(today, today);
    if (todaySchedules.length === 0) return;

    const schedule = todaySchedules[0];
    if (!schedule.isOperating) return;

    // 모든 알바생 조회
    const allWorkers = await getAllWorkers();
    const workerMap = new Map(allWorkers.map(w => [w.id, w]));

    // 각 타임 슬롯 확인
    const timeSlots: Array<{ slot: "a" | "b" | "c" | "d"; workerId: number | null }> = [
      { slot: "a", workerId: schedule.aTimeWorkerId },
      { slot: "b", workerId: schedule.bTimeWorkerId },
      { slot: "c", workerId: schedule.cTimeWorkerId },
      { slot: "d", workerId: (schedule as any).dTimeWorkerId ?? null },
    ];

    for (const { slot, workerId } of timeSlots) {
      if (!workerId) continue;

      const worker = workerMap.get(workerId);
      if (!worker || !worker.email) continue;

      // 출근/퇴근 시간 결정
      const s = schedule as any;
      const startTime = s[`${slot}TimeStartTime`] || DEFAULT_START_TIMES[slot];
      const endTime = s[`${slot}TimeEndTime`] || DEFAULT_END_TIMES[slot];

      // 이미 출근 기록이 있으면 두 알림 모두 스킵
      if (s[`${slot}TimeActualStartTime`]) continue;

      // 현재 시간과 출근 시간의 차이 (양수 = 출근 시간까지 남은 분)
      const diff = minutesDiff(startTime, currentTime);

      // ── 1시간 전 알림 (55~65분 전) ──
      const key1h = `1h_${today}_${slot}_${workerId}`;
      if (diff >= 55 && diff <= 65 && !(await isSent(key1h, today))) {
        console.log(`[EmailScheduler] Sending 1h reminder to ${worker.name} for ${slot.toUpperCase()}타임 at ${startTime}`);
        const result = await sendShiftReminderEmail({
          to: worker.email,
          workerName: worker.name,
          scheduleDate: today,
          timeSlot: slot.toUpperCase() as "A" | "B" | "C",
          startTime,
          endTime,
        });
        if (result.success) {
          await markSent(key1h, today);
          console.log(`[EmailScheduler] ✅ 1h reminder sent to ${worker.name}, id: ${result.id}`);
        } else {
          console.error(`[EmailScheduler] ❌ 1h reminder failed for ${worker.name}: ${result.error}`);
        }
      }

      // ── 출근 시간 정각 알림 (0~2분 전, 단 한 번) ──
      const keyNow = `now_${today}_${slot}_${workerId}`;
      if (diff >= 0 && diff <= 2 && !(await isSent(keyNow, today))) {
        console.log(`[EmailScheduler] Sending check-in now reminder to ${worker.name} for ${slot.toUpperCase()}타임 at ${startTime}`);
        const result = await sendCheckInNowEmail({
          to: worker.email,
          workerName: worker.name,
          scheduleDate: today,
          timeSlot: slot.toUpperCase() as "A" | "B" | "C",
          startTime,
          endTime,
        });
        if (result.success) {
          await markSent(keyNow, today);
          console.log(`[EmailScheduler] ✅ Check-in now reminder sent to ${worker.name}, id: ${result.id}`);
        } else {
          console.error(`[EmailScheduler] ❌ Check-in now reminder failed for ${worker.name}: ${result.error}`);
        }
      }

      // ── 퇴근 10분 전 알림 (8~10분 전) ──
      // 이미 퇴근 버튼을 눌렀으면 스킵
      if (!s[`${slot}TimeActualEndTime`]) {
        const endDiff = minutesDiff(endTime, currentTime); // 퇴근시간 - 현재시간 (양수 = 남은 분)
        const keyCheckout = `checkout_${today}_${slot}_${workerId}`;
        if (endDiff >= 8 && endDiff <= 10 && !(await isSent(keyCheckout, today))) {
          console.log(`[EmailScheduler] Sending check-out reminder to ${worker.name} for ${slot.toUpperCase()}타임 at ${endTime}`);
          const result = await sendCheckOutNowEmail({
            to: worker.email,
            workerName: worker.name,
            scheduleDate: today,
            timeSlot: slot.toUpperCase() as "A" | "B" | "C",
            startTime,
            endTime,
          });
          if (result.success) {
            await markSent(keyCheckout, today);
            console.log(`[EmailScheduler] ✅ Check-out reminder sent to ${worker.name}, id: ${result.id}`);
          } else {
            console.error(`[EmailScheduler] ❌ Check-out reminder failed for ${worker.name}: ${result.error}`);
          }
        }
      }
    }
  } catch (error: any) {
    console.error("[EmailScheduler] Error:", error);
    // ECONNRESET 등 DB 연결 오류 시 다음 실행에서 재연결 시도
    if (error?.cause?.code === "ECONNRESET" || String(error).includes("ECONNRESET")) {
      console.log("[EmailScheduler] ECONNRESET detected, resetting DB connection for next run");
      resetDbConnection();
    }
  }
}

/**
 * KST 기준 내일 날짜의 day (1~31) 반환
 */
function getKSTTomorrowDay(): number {
  const now = new Date();
  const kstTomorrow = new Date(now.getTime() + 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return kstTomorrow.getUTCDate();
}

/**
 * 급여 기간 계산: 전월 급여일 ~ 당월 급여일 전날
 * 예) 오늘이 13일, 급여일 14일 → 전월 14일 ~ 오늘(13일)
 */
function calcPayPeriod(today: string, payDay: number): { startDate: string; endDate: string } {
  const [y, m, d] = today.split("-").map(Number);
  const endDate = today;
  // 시작일: 전월 급여일
  const startDateObj = new Date(Date.UTC(y, m - 2, payDay)); // 전월 payDay
  const startDate = startDateObj.toISOString().split("T")[0];
  return { startDate, endDate };
}

/**
 * 급여일 전날 급여 이메일 발송
 */
export async function checkAndSendPaydayEveEmails(): Promise<void> {
  const dbOk = await ensureDbConnection();
  if (!dbOk) return;

  try {
    const today = getKSTDateString();
    const tomorrowDay = getKSTTomorrowDay();

    const allWorkers = await getAllWorkers();
    const eligibleWorkers = allWorkers.filter(
      (w) => w.payDay === tomorrowDay && w.email && (w as any).hourlyWage
    );
    if (eligibleWorkers.length === 0) return;

    // 해당 알바생들의 급여 기간 계산 및 이메일 발송
    for (const worker of eligibleWorkers) {
      const keyPayday = `payday_${today}_${worker.id}`;
      if (await isSent(keyPayday, today)) continue;

      const { startDate, endDate } = calcPayPeriod(today, worker.payDay!);
      const allStats = await getStatsByDateRange(startDate, endDate);
      const stat = allStats.find((s) => s.workerId === worker.id);

      const workDays = stat?.workDays ?? 0;
      const totalMinutes = stat?.totalMinutes ?? 0;
      const breakdown = stat?.dailyBreakdown ?? [];
      const hourlyWage = (worker as any).hourlyWage as number;
      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      const totalPay = Math.round(totalHours * hourlyWage);

      console.log(`[EmailScheduler] Sending payday eve email to ${worker.name} (payDay: ${worker.payDay}, wage: ${hourlyWage})`);
      const result = await sendPaydayEveEmail({
        to: worker.email!,
        workerName: worker.name,
        payDay: worker.payDay!,
        periodStart: startDate,
        periodEnd: endDate,
        workDays,
        totalMinutes,
        hourlyWage,
        totalPay,
        breakdown,
      });

      if (result.success) {
        await markSent(keyPayday, today);
        console.log(`[EmailScheduler] ✅ Payday eve email sent to ${worker.name}`);
      } else {
        console.error(`[EmailScheduler] ❌ Payday eve email failed for ${worker.name}: ${result.error}`);
      }
    }
  } catch (error: any) {
    console.error("[EmailScheduler] Payday eve check error:", error);
  }
}

/**
 * 스케줄러 시작 (매 5분마다 실행)
 */
export function startEmailScheduler(): void {
  if (schedulerStarted) {
    console.log("[EmailScheduler] Already started, skipping duplicate start");
    return;
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("[EmailScheduler] GMAIL_USER or GMAIL_APP_PASSWORD not set, email scheduler disabled");
    return;
  }

  schedulerStarted = true;
  console.log("[EmailScheduler] Starting email reminder scheduler (every 5 minutes)");
  console.log("[EmailScheduler] Alerts: 1h before shift + at shift start time + at shift end time");

  // 즉시 한 번 실행
  checkAndSendShiftReminders().catch(console.error);
  checkAndSendPaydayEveEmails().catch(console.error);

  // 5분마다 반복 실행
  setInterval(() => {
    checkAndSendShiftReminders().catch(console.error);
    checkAndSendPaydayEveEmails().catch(console.error);
  }, 5 * 60 * 1000);
}

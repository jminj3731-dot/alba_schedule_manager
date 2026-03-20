/**
 * 이메일 알림 스케줄러
 * 매 5분마다 실행:
 *   1) 출근 1시간 전 (55~65분 전): "오늘 근무 1시간 전입니다" 알림
 *   2) 출근 시간 정각 (0~10분 전): "지금 출근 버튼을 눈러주세요!" 알림
 *   3) 퇴근 시간 정각 (0~10분 전): "퇴근 버튼을 눈러주세요!" 알림
 */
import { getSchedulesByDateRange, getAllWorkers, getDb, resetDbConnection } from "./db";
import { sendShiftReminderEmail, sendCheckInNowEmail, sendCheckOutNowEmail } from "./email";

// 이미 발송된 알림 추적 (메모리 캐시, 서버 재시작 시 초기화)
// key 형식:
//   `1h_${scheduleDate}_${timeSlot}_${workerId}`       → 1시간 전 알림
//   `now_${scheduleDate}_${timeSlot}_${workerId}`      → 출근 시간 정각 알림
//   `checkout_${scheduleDate}_${timeSlot}_${workerId}` → 퇴근 시간 알림
const sentNotifications = new Set<string>();

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
  a: "17:00",
  b: "18:00",
  c: "18:00",
};

const DEFAULT_END_TIMES: Record<string, string> = {
  a: "22:00",
  b: "22:00",
  c: "23:00",
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

    // 오늘 스케줄 조회
    const todaySchedules = await getSchedulesByDateRange(today, today);
    if (todaySchedules.length === 0) return;

    const schedule = todaySchedules[0];
    if (!schedule.isOperating) return;

    // 모든 알바생 조회
    const allWorkers = await getAllWorkers();
    const workerMap = new Map(allWorkers.map(w => [w.id, w]));

    // 각 타임 슬롯 확인
    const timeSlots: Array<{ slot: "a" | "b" | "c"; workerId: number | null }> = [
      { slot: "a", workerId: schedule.aTimeWorkerId },
      { slot: "b", workerId: schedule.bTimeWorkerId },
      { slot: "c", workerId: schedule.cTimeWorkerId },
    ];

    for (const { slot, workerId } of timeSlots) {
      if (!workerId) continue;

      const worker = workerMap.get(workerId);
      if (!worker || !worker.email) continue;

      // 출근/퇴근 시간 결정
      const startTimeKey = `${slot}TimeStartTime` as keyof typeof schedule;
      const endTimeKey = `${slot}TimeEndTime` as keyof typeof schedule;
      const startTime = (schedule[startTimeKey] as string) || DEFAULT_START_TIMES[slot];
      const endTime = (schedule[endTimeKey] as string) || DEFAULT_END_TIMES[slot];

      // 이미 출근 기록이 있으면 두 알림 모두 스킵
      const actualStartKey = `${slot}TimeActualStartTime` as keyof typeof schedule;
      if (schedule[actualStartKey]) continue;

      // 현재 시간과 출근 시간의 차이 (양수 = 출근 시간까지 남은 분)
      const diff = minutesDiff(startTime, currentTime);

      // ── 1시간 전 알림 (55~65분 전) ──
      const key1h = `1h_${today}_${slot}_${workerId}`;
      if (diff >= 55 && diff <= 65 && !sentNotifications.has(key1h)) {
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
          sentNotifications.add(key1h);
          console.log(`[EmailScheduler] ✅ 1h reminder sent to ${worker.name}, id: ${result.id}`);
        } else {
          console.error(`[EmailScheduler] ❌ 1h reminder failed for ${worker.name}: ${result.error}`);
        }
      }

      // ── 출근 시간 정각 알림 (0~10분 전) ──
      const keyNow = `now_${today}_${slot}_${workerId}`;
      if (diff >= 0 && diff <= 10 && !sentNotifications.has(keyNow)) {
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
          sentNotifications.add(keyNow);
          console.log(`[EmailScheduler] ✅ Check-in now reminder sent to ${worker.name}, id: ${result.id}`);
        } else {
          console.error(`[EmailScheduler] ❌ Check-in now reminder failed for ${worker.name}: ${result.error}`);
        }
      }

      // ── 퇴근 시간 알림 (0~10분 전) ──
      // 이미 퇴근 버튼을 눌렀으면 스킵
      const actualEndKey = `${slot}TimeActualEndTime` as keyof typeof schedule;
      if (!schedule[actualEndKey]) {
        const endDiff = minutesDiff(endTime, currentTime); // 퇴근시간 - 현재시간 (양수 = 남은 분)
        const keyCheckout = `checkout_${today}_${slot}_${workerId}`;
        if (endDiff >= 0 && endDiff <= 10 && !sentNotifications.has(keyCheckout)) {
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
            sentNotifications.add(keyCheckout);
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
 * 스케줄러 시작 (매 5분마다 실행)
 */
export function startEmailScheduler(): void {
  if (!process.env.RESEND_API_KEY) {
    console.log("[EmailScheduler] RESEND_API_KEY not set, email scheduler disabled");
    return;
  }

  console.log("[EmailScheduler] Starting email reminder scheduler (every 5 minutes)");
  console.log("[EmailScheduler] Alerts: 1h before shift + at shift start time + at shift end time");

  // 즉시 한 번 실행
  checkAndSendShiftReminders().catch(console.error);

  // 5분마다 반복 실행
  setInterval(() => {
    checkAndSendShiftReminders().catch(console.error);
  }, 5 * 60 * 1000);
}

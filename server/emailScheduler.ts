/**
 * 이메일 알림 스케줄러
 * 매 5분마다 실행하여 1시간 후 근무 시작 예정인 알바생에게 이메일 발송
 */
import { getSchedulesByDateRange, getAllWorkers } from "./db";
import { sendShiftReminderEmail } from "./email";

// 이미 발송된 알림 추적 (메모리 캐시, 서버 재시작 시 초기화)
// key: `${scheduleDate}_${timeSlot}_${workerId}`
const sentNotifications = new Set<string>();

// 한국 시간 기준 현재 날짜/시간 반환
function getKSTNow(): Date {
  const now = new Date();
  // UTC+9
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

// 기본 타임별 출근 시간
const DEFAULT_START_TIMES: Record<string, string> = {
  a: "17:00",
  b: "18:00",
  c: "18:00",
};

// 기본 타임별 퇴근 시간
const DEFAULT_END_TIMES: Record<string, string> = {
  a: "22:00",
  b: "22:00",
  c: "23:00",
};

/**
 * 두 시간 문자열(HH:MM) 사이의 분 차이 계산
 * timeA - timeB (분 단위)
 */
function minutesDiff(timeA: string, timeB: string): number {
  const [ah, am] = timeA.split(":").map(Number);
  const [bh, bm] = timeB.split(":").map(Number);
  return (ah * 60 + am) - (bh * 60 + bm);
}

/**
 * 스케줄 확인 및 이메일 발송 메인 함수
 */
export async function checkAndSendShiftReminders(): Promise<void> {
  try {
    const today = getKSTDateString();
    const currentTime = getKSTTimeString();

    // 오늘 스케줄 조회
    const todaySchedules = await getSchedulesByDateRange(today, today);
    if (todaySchedules.length === 0) return;

    const schedule = todaySchedules[0];
    if (!schedule.isOperating) return;

    // 모든 알바생 조회 (이메일 있는 알바생만 처리)
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

      // 출근 시간 결정 (스케줄에 저장된 값 또는 기본값)
      const startTimeKey = `${slot}TimeStartTime` as keyof typeof schedule;
      const endTimeKey = `${slot}TimeEndTime` as keyof typeof schedule;
      const startTime = (schedule[startTimeKey] as string) || DEFAULT_START_TIMES[slot];
      const endTime = (schedule[endTimeKey] as string) || DEFAULT_END_TIMES[slot];

      // 이미 출근 기록이 있으면 스킵
      const actualStartKey = `${slot}TimeActualStartTime` as keyof typeof schedule;
      if (schedule[actualStartKey]) continue;

      // 현재 시간과 출근 시간의 차이 계산
      const diff = minutesDiff(startTime, currentTime);

      // 55~65분 사이 (1시간 전 ±5분 윈도우)
      if (diff < 55 || diff > 65) continue;

      // 중복 발송 방지
      const notifKey = `${today}_${slot}_${workerId}`;
      if (sentNotifications.has(notifKey)) continue;

      // 이메일 발송
      console.log(`[EmailScheduler] Sending reminder to ${worker.name} (${worker.email}) for ${slot.toUpperCase()}타임 at ${startTime}`);
      const result = await sendShiftReminderEmail({
        to: worker.email,
        workerName: worker.name,
        scheduleDate: today,
        timeSlot: slot.toUpperCase() as "A" | "B" | "C",
        startTime,
        endTime,
      });

      if (result.success) {
        sentNotifications.add(notifKey);
        console.log(`[EmailScheduler] ✅ Sent to ${worker.name} (${worker.email}), id: ${result.id}`);
      } else {
        console.error(`[EmailScheduler] ❌ Failed to send to ${worker.name}: ${result.error}`);
      }
    }
  } catch (error) {
    console.error("[EmailScheduler] Error:", error);
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

  // 즉시 한 번 실행
  checkAndSendShiftReminders().catch(console.error);

  // 5분마다 반복 실행
  setInterval(() => {
    checkAndSendShiftReminders().catch(console.error);
  }, 5 * 60 * 1000);
}

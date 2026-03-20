/**
 * 구글 시트 자동 동기화 스케줄러
 * 매일 자정(KST 00:00 = UTC 15:00)에 모든 스케줄 데이터를 구글 시트로 자동 내보내기
 */
import { exportToGoogleSheets } from "./googleSheets";

// 마지막 동기화 시간 (메모리 저장, 서버 재시작 시 초기화)
let lastSyncTime: Date | null = null;
let lastSyncStatus: "success" | "failed" | "never" = "never";
let lastSyncMessage = "";

export function getLastSyncInfo() {
  return {
    lastSyncTime,
    lastSyncStatus,
    lastSyncMessage,
  };
}

/**
 * 다음 KST 자정까지 남은 밀리초 계산
 * KST = UTC+9, 자정(00:00 KST) = UTC 전날 15:00
 */
function getMsUntilNextMidnightKST(): number {
  const now = new Date();
  // KST 기준 현재 시각
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간
  const nowKST = new Date(now.getTime() + kstOffset);

  // KST 기준 다음 자정
  const nextMidnightKST = new Date(nowKST);
  nextMidnightKST.setUTCHours(0, 0, 0, 0); // KST 자정 = UTC 00:00 (KST 기준)
  nextMidnightKST.setUTCDate(nextMidnightKST.getUTCDate() + 1); // 다음날

  // UTC로 변환하여 실제 대기 시간 계산
  const nextMidnightUTC = new Date(nextMidnightKST.getTime() - kstOffset);
  const msUntil = nextMidnightUTC.getTime() - now.getTime();

  return msUntil > 0 ? msUntil : msUntil + 24 * 60 * 60 * 1000;
}

async function runDailySync() {
  const now = new Date();
  const kstTimeStr = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19) + " KST";

  console.log(`[GoogleSheetsScheduler] Starting daily auto-sync at ${kstTimeStr}`);

  try {
    const result = await exportToGoogleSheets();
    lastSyncTime = now;

    if (result.success) {
      lastSyncStatus = "success";
      lastSyncMessage = result.message;
      console.log(`[GoogleSheetsScheduler] Auto-sync completed successfully: ${result.message}`);
    } else {
      lastSyncStatus = "failed";
      lastSyncMessage = result.message;
      console.error(`[GoogleSheetsScheduler] Auto-sync failed: ${result.message}`);
    }
  } catch (error: any) {
    lastSyncTime = now;
    lastSyncStatus = "failed";
    lastSyncMessage = error?.message || "알 수 없는 오류";
    console.error(`[GoogleSheetsScheduler] Auto-sync error:`, error);
  }
}

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextSync() {
  const msUntil = getMsUntilNextMidnightKST();
  const hoursUntil = Math.round(msUntil / 1000 / 60 / 60 * 10) / 10;

  console.log(`[GoogleSheetsScheduler] Next auto-sync scheduled in ${hoursUntil}h (KST midnight)`);

  schedulerTimer = setTimeout(async () => {
    await runDailySync();
    // 다음 자정 예약 (재귀)
    scheduleNextSync();
  }, msUntil);
}

export function startGoogleSheetsScheduler() {
  // 구글 시트 환경변수가 없으면 스케줄러 시작 안 함
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.log("[GoogleSheetsScheduler] Skipped: Google Sheets env vars not configured");
    return;
  }

  console.log("[GoogleSheetsScheduler] Starting daily auto-sync scheduler (every midnight KST)");
  scheduleNextSync();
}

export function stopGoogleSheetsScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[GoogleSheetsScheduler] Scheduler stopped");
  }
}

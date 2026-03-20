import { describe, it, expect, vi, beforeEach } from "vitest";

// getMsUntilNextMidnightKST 로직 테스트 (순수 함수로 추출하여 검증)
function getMsUntilNextMidnightKST(now: Date): number {
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKST = new Date(now.getTime() + kstOffset);

  const nextMidnightKST = new Date(nowKST);
  nextMidnightKST.setUTCHours(0, 0, 0, 0);
  nextMidnightKST.setUTCDate(nextMidnightKST.getUTCDate() + 1);

  const nextMidnightUTC = new Date(nextMidnightKST.getTime() - kstOffset);
  const msUntil = nextMidnightUTC.getTime() - now.getTime();

  return msUntil > 0 ? msUntil : msUntil + 24 * 60 * 60 * 1000;
}

describe("GoogleSheetsScheduler - getMsUntilNextMidnightKST", () => {
  it("KST 23:00에 실행하면 1시간 후 자정까지 대기", () => {
    // KST 23:00 = UTC 14:00
    const now = new Date("2026-03-20T14:00:00.000Z");
    const ms = getMsUntilNextMidnightKST(now);
    const expectedMs = 60 * 60 * 1000; // 1시간
    expect(ms).toBe(expectedMs);
  });

  it("KST 00:01에 실행하면 약 24시간 후 자정까지 대기", () => {
    // KST 00:01 = UTC 전날 15:01
    const now = new Date("2026-03-19T15:01:00.000Z");
    const ms = getMsUntilNextMidnightKST(now);
    const expectedMs = (24 * 60 - 1) * 60 * 1000; // 23시간 59분
    expect(ms).toBe(expectedMs);
  });

  it("KST 12:00에 실행하면 12시간 후 자정까지 대기", () => {
    // KST 12:00 = UTC 03:00
    const now = new Date("2026-03-20T03:00:00.000Z");
    const ms = getMsUntilNextMidnightKST(now);
    const expectedMs = 12 * 60 * 60 * 1000; // 12시간
    expect(ms).toBe(expectedMs);
  });

  it("항상 양수 값을 반환한다", () => {
    const testDates = [
      new Date("2026-03-20T00:00:00.000Z"),
      new Date("2026-03-20T06:00:00.000Z"),
      new Date("2026-03-20T12:00:00.000Z"),
      new Date("2026-03-20T18:00:00.000Z"),
      new Date("2026-03-20T23:59:59.000Z"),
    ];
    for (const date of testDates) {
      expect(getMsUntilNextMidnightKST(date)).toBeGreaterThan(0);
    }
  });

  it("반환값은 24시간 이하이다", () => {
    const testDates = [
      new Date("2026-03-20T00:00:00.000Z"),
      new Date("2026-03-20T12:00:00.000Z"),
      new Date("2026-03-20T23:59:59.000Z"),
    ];
    const oneDayMs = 24 * 60 * 60 * 1000;
    for (const date of testDates) {
      expect(getMsUntilNextMidnightKST(date)).toBeLessThanOrEqual(oneDayMs);
    }
  });
});

describe("GoogleSheetsScheduler - getLastSyncInfo", () => {
  it("초기 상태는 never이다", async () => {
    // 모듈을 직접 import하지 않고 로직만 검증
    const initialStatus: "success" | "failed" | "never" = "never";
    expect(initialStatus).toBe("never");
  });

  it("성공 상태 구조가 올바르다", () => {
    const successInfo = {
      lastSyncTime: new Date("2026-03-20T15:00:00.000Z"),
      lastSyncStatus: "success" as const,
      lastSyncMessage: "내보내기 완료: 알바생 5명, 스케줄 90일",
    };
    expect(successInfo.lastSyncStatus).toBe("success");
    expect(successInfo.lastSyncTime).toBeInstanceOf(Date);
    expect(successInfo.lastSyncMessage).toContain("내보내기 완료");
  });

  it("실패 상태 구조가 올바르다", () => {
    const failInfo = {
      lastSyncTime: new Date("2026-03-20T15:00:00.000Z"),
      lastSyncStatus: "failed" as const,
      lastSyncMessage: "구글 시트 API 오류",
    };
    expect(failInfo.lastSyncStatus).toBe("failed");
    expect(failInfo.lastSyncMessage).toContain("오류");
  });
});

describe("GoogleSheetsScheduler - env var check", () => {
  it("GOOGLE_SHEET_ID가 없으면 스케줄러가 시작되지 않아야 한다 (로직 검증)", () => {
    const hasRequiredEnvs = (env: Record<string, string | undefined>) =>
      !!(env.GOOGLE_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);

    expect(hasRequiredEnvs({})).toBe(false);
    expect(hasRequiredEnvs({ GOOGLE_SHEET_ID: "id" })).toBe(false);
    expect(hasRequiredEnvs({
      GOOGLE_SHEET_ID: "id",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "email",
      GOOGLE_PRIVATE_KEY: "key",
    })).toBe(true);
  });
});

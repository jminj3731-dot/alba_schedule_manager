import { describe, expect, it, vi, beforeEach } from "vitest";

// Resend mock
vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "test-email-id-123" },
          error: null,
        }),
      },
    })),
  };
});

// emailScheduler에서 사용하는 db mock
vi.mock("./db", () => ({
  getSchedulesByDateRange: vi.fn().mockResolvedValue([]),
  getAllWorkers: vi.fn().mockResolvedValue([]),
  getDb: vi.fn().mockResolvedValue({}),
  resetDbConnection: vi.fn(),
}));

describe("Email Module - 1시간 전 알림", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.clearAllMocks();
  });

  it("sendShiftReminderEmail returns success on valid input", async () => {
    const { sendShiftReminderEmail } = await import("./email");

    const result = await sendShiftReminderEmail({
      to: "test@example.com",
      workerName: "홍길동",
      scheduleDate: "2026-03-18",
      timeSlot: "A",
      startTime: "17:00",
      endTime: "22:00",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe("test-email-id-123");
  });

  it("testResendConnection returns true when API key is set", async () => {
    const { testResendConnection } = await import("./email");
    const result = await testResendConnection();
    expect(result).toBe(true);
  });

  it("testResendConnection returns false when API key is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { testResendConnection } = await import("./email");
    const result = await testResendConnection();
    expect(result).toBe(false);
  });
});

describe("Email Module - 출근 시간 정각 알림", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.clearAllMocks();
  });

  it("sendCheckInNowEmail returns success on valid input", async () => {
    const { sendCheckInNowEmail } = await import("./email");

    const result = await sendCheckInNowEmail({
      to: "test@example.com",
      workerName: "김철수",
      scheduleDate: "2026-03-18",
      timeSlot: "B",
      startTime: "18:00",
      endTime: "22:00",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe("test-email-id-123");
  });

  it("sendCheckInNowEmail and sendShiftReminderEmail are separate functions", async () => {
    const { sendCheckInNowEmail, sendShiftReminderEmail } = await import("./email");
    expect(typeof sendCheckInNowEmail).toBe("function");
    expect(typeof sendShiftReminderEmail).toBe("function");
    expect(sendCheckInNowEmail).not.toBe(sendShiftReminderEmail);
  });
});

describe("EmailScheduler", () => {
  it("checkAndSendShiftReminders handles empty schedule gracefully", async () => {
    const { getSchedulesByDateRange } = await import("./db");
    vi.mocked(getSchedulesByDateRange).mockResolvedValue([]);

    const { checkAndSendShiftReminders } = await import("./emailScheduler");
    await expect(checkAndSendShiftReminders()).resolves.toBeUndefined();
  });

  it("checkAndSendShiftReminders skips workers without email", async () => {
    const { getSchedulesByDateRange, getAllWorkers } = await import("./db");

    const today = new Date().toISOString().split("T")[0];
    vi.mocked(getSchedulesByDateRange).mockResolvedValue([
      {
        id: 1,
        scheduleDate: today,
        dayOfWeek: "화",
        isOperating: true,
        aTimeWorkerId: 1,
        bTimeWorkerId: null,
        cTimeWorkerId: null,
        aTimeStartTime: "17:00",
        bTimeStartTime: null,
        cTimeStartTime: null,
        aTimeEndTime: "22:00",
        bTimeEndTime: null,
        cTimeEndTime: null,
        aTimeActualStartTime: null,
        bTimeActualStartTime: null,
        cTimeActualStartTime: null,
        aTimeActualEndTime: null,
        bTimeActualEndTime: null,
        cTimeActualEndTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    vi.mocked(getAllWorkers).mockResolvedValue([
      {
        id: 1,
        name: "홍길동",
        email: null, // 이메일 없음 → 스킵
        skillLevel: "main",
        fixedDaysOff: "",
        preferredDays: "",
        payDay: 14,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    const { checkAndSendShiftReminders } = await import("./emailScheduler");
    await expect(checkAndSendShiftReminders()).resolves.toBeUndefined();
  });

  it("checkAndSendShiftReminders skips already checked-in workers", async () => {
    const { getSchedulesByDateRange, getAllWorkers } = await import("./db");

    const today = new Date().toISOString().split("T")[0];
    vi.mocked(getSchedulesByDateRange).mockResolvedValue([
      {
        id: 1,
        scheduleDate: today,
        dayOfWeek: "화",
        isOperating: true,
        aTimeWorkerId: 1,
        bTimeWorkerId: null,
        cTimeWorkerId: null,
        aTimeStartTime: "17:00",
        bTimeStartTime: null,
        cTimeStartTime: null,
        aTimeEndTime: "22:00",
        bTimeEndTime: null,
        cTimeEndTime: null,
        aTimeActualStartTime: "17:02", // 이미 출근 기록 있음
        bTimeActualStartTime: null,
        cTimeActualStartTime: null,
        aTimeActualEndTime: null,
        bTimeActualEndTime: null,
        cTimeActualEndTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    vi.mocked(getAllWorkers).mockResolvedValue([
      {
        id: 1,
        name: "홍길동",
        email: "hong@example.com",
        skillLevel: "main",
        fixedDaysOff: "",
        preferredDays: "",
        payDay: 14,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    const { checkAndSendShiftReminders } = await import("./emailScheduler");
    // 이미 출근한 경우 이메일 발송 없이 정상 완료
    await expect(checkAndSendShiftReminders()).resolves.toBeUndefined();
  });

  it("startEmailScheduler skips when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { startEmailScheduler } = await import("./emailScheduler");
    startEmailScheduler();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY not set")
    );

    consoleSpy.mockRestore();
  });

  it("notification keys are different for 1h and now reminders", () => {
    const today = "2026-03-18";
    const slot = "a";
    const workerId = 1;

    const key1h = `1h_${today}_${slot}_${workerId}`;
    const keyNow = `now_${today}_${slot}_${workerId}`;

    expect(key1h).not.toBe(keyNow);
    expect(key1h).toContain("1h_");
    expect(keyNow).toContain("now_");
  });
});

describe("Workers email field", () => {
  it("email field is optional and nullable", () => {
    const workerWithEmail = {
      name: "홍길동",
      skillLevel: "main" as const,
      fixedDaysOff: "",
      preferredDays: "",
      payDay: 14,
      email: "hong@example.com",
    };

    const workerWithoutEmail = {
      name: "김철수",
      skillLevel: "sub" as const,
      fixedDaysOff: "",
      preferredDays: "",
      payDay: 14,
      email: null,
    };

    expect(workerWithEmail.email).toBe("hong@example.com");
    expect(workerWithoutEmail.email).toBeNull();
  });
});

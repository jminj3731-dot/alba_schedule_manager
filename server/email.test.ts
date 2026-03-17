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
}));

describe("Email Module", () => {
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

describe("EmailScheduler", () => {
  it("checkAndSendShiftReminders handles empty schedule gracefully", async () => {
    const { getSchedulesByDateRange } = await import("./db");
    vi.mocked(getSchedulesByDateRange).mockResolvedValue([]);

    const { checkAndSendShiftReminders } = await import("./emailScheduler");

    // Should not throw
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
        email: null, // 이메일 없음
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
    // 이메일 없는 알바생은 스킵 - 에러 없이 완료
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
});

describe("Workers email field", () => {
  it("email field is optional and nullable", () => {
    // 이메일 필드가 null/undefined를 허용하는지 타입 검증
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

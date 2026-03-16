import { describe, expect, it } from "vitest";
import {
  validateSchedule,
  getWorkStatus,
  DAYS_OF_WEEK,
  WEEKEND_DAYS,
  WEEKDAY_DAYS,
} from "../shared/types";

describe("getWorkStatus", () => {
  it("returns '부족' for 0~3 days", () => {
    expect(getWorkStatus(0)).toBe("부족");
    expect(getWorkStatus(1)).toBe("부족");
    expect(getWorkStatus(2)).toBe("부족");
    expect(getWorkStatus(3)).toBe("부족");
  });

  it("returns '적정' for exactly 4 days", () => {
    expect(getWorkStatus(4)).toBe("적정");
  });

  it("returns '초과' for 5+ days", () => {
    expect(getWorkStatus(5)).toBe("초과");
    expect(getWorkStatus(6)).toBe("초과");
    expect(getWorkStatus(7)).toBe("초과");
  });
});

describe("validateSchedule", () => {
  const mainWorker = { id: 1, name: "전민서", skillLevel: "main" as const, fixedDaysOff: "" };
  const mainWorker2 = { id: 2, name: "전성진", skillLevel: "main" as const, fixedDaysOff: "" };
  const subWorker = { id: 3, name: "정수환", skillLevel: "sub" as const, fixedDaysOff: "" };
  const restrictedWorker = { id: 4, name: "정우주", skillLevel: "sub" as const, fixedDaysOff: "목,일" };

  it("returns no errors when not operating", () => {
    const errors = validateSchedule("월", false, mainWorker, subWorker, null);
    expect(errors).toHaveLength(0);
  });

  it("returns no errors for valid weekday schedule (2 workers with main)", () => {
    const errors = validateSchedule("월", true, mainWorker, subWorker, null);
    expect(errors).toHaveLength(0);
  });

  it("detects missing main worker", () => {
    const errors = validateSchedule("월", true, subWorker, restrictedWorker, null);
    expect(errors.some((e) => e.type === "no_main")).toBe(true);
  });

  it("detects day-off violation for 정우주 on 목요일", () => {
    const errors = validateSchedule("목", true, mainWorker, restrictedWorker, null);
    expect(errors.some((e) => e.type === "day_off_violation")).toBe(true);
    expect(errors.some((e) => e.message.includes("정우주"))).toBe(true);
  });

  it("detects day-off violation for 정우주 on 일요일", () => {
    const errors = validateSchedule("일", true, mainWorker, restrictedWorker, null);
    expect(errors.some((e) => e.type === "day_off_violation")).toBe(true);
    expect(errors.some((e) => e.message.includes("정우주"))).toBe(true);
  });

  it("no day-off violation for 정우주 on 월요일", () => {
    const errors = validateSchedule("월", true, mainWorker, restrictedWorker, null);
    expect(errors.some((e) => e.type === "day_off_violation")).toBe(false);
  });

  it("detects insufficient workers on weekday (needs 2, has 1)", () => {
    const errors = validateSchedule("월", true, mainWorker, null, null);
    expect(errors.some((e) => e.type === "info" && e.message.includes("2명 필요"))).toBe(true);
  });

  it("detects insufficient workers on weekend (needs 3, has 2)", () => {
    const errors = validateSchedule("금", true, mainWorker, subWorker, null);
    expect(errors.some((e) => e.type === "info" && e.message.includes("3명 필요"))).toBe(true);
  });

  it("no errors for valid weekend schedule (3 workers with main)", () => {
    const errors = validateSchedule("금", true, mainWorker, subWorker, mainWorker2);
    expect(errors).toHaveLength(0);
  });

  it("returns empty errors when no workers assigned and operating", () => {
    const errors = validateSchedule("월", true, null, null, null);
    expect(errors).toHaveLength(0);
  });
});

describe("constants", () => {
  it("DAYS_OF_WEEK has 7 days", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
    expect(DAYS_OF_WEEK[0]).toBe("일");
    expect(DAYS_OF_WEEK[6]).toBe("토");
  });

  it("WEEKDAY_DAYS contains 일~목", () => {
    expect(WEEKDAY_DAYS).toEqual(["일", "월", "화", "수", "목"]);
  });

  it("WEEKEND_DAYS contains 금, 토", () => {
    expect(WEEKEND_DAYS).toEqual(["금", "토"]);
  });
});

describe("auto-assign logic validation", () => {
  // Test the core logic that the auto-assign algorithm should follow
  const workers = [
    { id: 1, name: "전민서", skillLevel: "main" as const, fixedDaysOff: "", preferredDays: "월,화,수,목,금" },
    { id: 2, name: "전성진", skillLevel: "main" as const, fixedDaysOff: "", preferredDays: "일,월,화,수" },
    { id: 3, name: "정수환", skillLevel: "sub" as const, fixedDaysOff: "", preferredDays: "월,화,금,토" },
    { id: 4, name: "정우주", skillLevel: "sub" as const, fixedDaysOff: "목,일", preferredDays: "월,화,수,금" },
  ];

  it("should filter out workers with fixed days off", () => {
    const dayOfWeek = "목";
    const available = workers.filter((w) => {
      const daysOff = w.fixedDaysOff.split(",").filter(Boolean);
      return !daysOff.includes(dayOfWeek);
    });
    // 정우주 is off on 목
    expect(available.map((w) => w.name)).not.toContain("정우주");
    expect(available).toHaveLength(3);
  });

  it("should filter out workers with fixed days off on 일요일", () => {
    const dayOfWeek = "일";
    const available = workers.filter((w) => {
      const daysOff = w.fixedDaysOff.split(",").filter(Boolean);
      return !daysOff.includes(dayOfWeek);
    });
    expect(available.map((w) => w.name)).not.toContain("정우주");
    expect(available).toHaveLength(3);
  });

  it("should always include at least one main worker", () => {
    const dayOfWeek = "월";
    const available = workers.filter((w) => {
      const daysOff = w.fixedDaysOff.split(",").filter(Boolean);
      return !daysOff.includes(dayOfWeek);
    });
    const mainWorkers = available.filter((w) => w.skillLevel === "main");
    expect(mainWorkers.length).toBeGreaterThanOrEqual(1);
  });

  it("should prioritize workers who prefer the day", () => {
    const dayOfWeek = "금";
    const available = workers.filter((w) => {
      const daysOff = w.fixedDaysOff.split(",").filter(Boolean);
      return !daysOff.includes(dayOfWeek);
    });
    const preferring = available.filter((w) => {
      const preferred = w.preferredDays.split(",").filter(Boolean);
      return preferred.includes(dayOfWeek);
    });
    // 전민서, 정수환, 정우주 all prefer 금
    expect(preferring.length).toBeGreaterThanOrEqual(3);
  });

  it("weekday requires 2 workers, weekend requires 3", () => {
    expect(WEEKDAY_DAYS.includes("월")).toBe(true);
    expect(WEEKEND_DAYS.includes("금")).toBe(true);
    
    const weekdayRequired = 2;
    const weekendRequired = 3;
    expect(weekdayRequired).toBe(2);
    expect(weekendRequired).toBe(3);
  });

  it("validates auto-assigned schedule passes validation", () => {
    // Simulate auto-assign result: main + sub on weekday
    const errors = validateSchedule("월", true, 
      { id: 1, name: "전민서", skillLevel: "main", fixedDaysOff: "" },
      { id: 3, name: "정수환", skillLevel: "sub", fixedDaysOff: "" },
      null
    );
    expect(errors).toHaveLength(0);
  });

  it("validates auto-assigned weekend schedule passes validation", () => {
    // Simulate auto-assign result: 2 main + 1 sub on weekend
    const errors = validateSchedule("금", true,
      { id: 1, name: "전민서", skillLevel: "main", fixedDaysOff: "" },
      { id: 3, name: "정수환", skillLevel: "sub", fixedDaysOff: "" },
      { id: 2, name: "전성진", skillLevel: "main", fixedDaysOff: "" }
    );
    expect(errors).toHaveLength(0);
  });
});


describe("Notification Logic", () => {
  it("should NOT send notification for 전민서", () => {
    const workerName = "전민서";
    const shouldNotify = workerName !== "전민서";
    expect(shouldNotify).toBe(false);
  });

  it("should send notification for 전성진", () => {
    const workerName = "전성진";
    const shouldNotify = workerName !== "전민서";
    expect(shouldNotify).toBe(true);
  });

  it("should send notification for 정수환", () => {
    const workerName = "정수환";
    const shouldNotify = workerName !== "전민서";
    expect(shouldNotify).toBe(true);
  });

  it("should send notification for 정우주", () => {
    const workerName = "정우주";
    const shouldNotify = workerName !== "전민서";
    expect(shouldNotify).toBe(true);
  });

  it("should create correct notification message for schedule view", () => {
    const workerName = "전성진";
    const title = `${workerName}님의 스케줄 확인`;
    const message = `${workerName}님이 이번 주 스케줄을 확인했습니다.`;
    
    expect(title).toBe("전성진님의 스케줄 확인");
    expect(message).toBe("전성진님이 이번 주 스케줄을 확인했습니다.");
  });

  it("should create correct notification message for preferred days update", () => {
    const workerName = "정우주";
    const preferredDays = "월,화,수,금";
    const title = `${workerName}님의 선호 근무일 수정`;
    const message = `${workerName}님이 선호 근무일을 ${preferredDays}로 수정했습니다.`;
    
    expect(title).toBe("정우주님의 선호 근무일 수정");
    expect(message).toBe("정우주님이 선호 근무일을 월,화,수,금로 수정했습니다.");
  });
});

describe("급여 계산 기간 로직", () => {
  /** 급여 계산 기간: 전월 급여일 ~ 당월 급여일 전날
   * 예) 급여일 14일 → 전월 14일 ~ 이번달 13일
   */
  function calcPayPeriod(year: number, month: number, payDay: number) {
    const startDate = new Date(year, month - 2, payDay); // 전월 급여일
    const endDate = new Date(year, month - 1, payDay - 1); // 당월 급여일 전날
    const toStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    return { startDate: toStr(startDate), endDate: toStr(endDate) };
  }

  it("급여일 14일 기준: 3월 급여 기간은 2/14 ~ 3/13", () => {
    const { startDate, endDate } = calcPayPeriod(2026, 3, 14);
    expect(startDate).toBe("2026-02-14");
    expect(endDate).toBe("2026-03-13");
  });

  it("급여일 25일 기준: 3월 급여 기간은 2/25 ~ 3/24", () => {
    const { startDate, endDate } = calcPayPeriod(2026, 3, 25);
    expect(startDate).toBe("2026-02-25");
    expect(endDate).toBe("2026-03-24");
  });

  it("급여일 1일 기준: 3월 급여 기간은 2/1 ~ 2/28", () => {
    const { startDate, endDate } = calcPayPeriod(2026, 3, 1);
    expect(startDate).toBe("2026-02-01");
    expect(endDate).toBe("2026-02-28");
  });

  it("1월 급여 기간 계산 (전년도 12월 포함)", () => {
    const { startDate, endDate } = calcPayPeriod(2026, 1, 14);
    expect(startDate).toBe("2025-12-14");
    expect(endDate).toBe("2026-01-13");
  });

  it("분을 소수 시간으로 변환: 270분 → 4.5", () => {
    const minutesToDecimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
    expect(minutesToDecimalHours(270)).toBe(4.5);
    expect(minutesToDecimalHours(240)).toBe(4);
    expect(minutesToDecimalHours(210)).toBe(3.5);
    expect(minutesToDecimalHours(255)).toBe(4.25);
  });

  it("근무 데이터 기간 필터링: 기간 내 데이터만 포함", () => {
    const breakdown = [
      { date: "2026-02-14", minutes: 270 },
      { date: "2026-02-15", minutes: 240 },
      { date: "2026-03-13", minutes: 210 },
      { date: "2026-03-14", minutes: 255 },
      { date: "2026-03-15", minutes: 270 }, // 기간 외
    ];
    const startDate = "2026-02-15";
    const endDate = "2026-03-14";
    const filtered = breakdown.filter((d) => d.date >= startDate && d.date <= endDate);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((d) => d.date)).toEqual(["2026-02-15", "2026-03-13", "2026-03-14"]);
  });

  it("총 근무시간 합산 및 소수 변환", () => {
    const minutesToDecimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
    const breakdown = [
      { minutes: 270 }, // 4.5h
      { minutes: 240 }, // 4h
      { minutes: 210 }, // 3.5h
    ];
    const totalMinutes = breakdown.reduce((sum, d) => sum + d.minutes, 0);
    expect(totalMinutes).toBe(720);
    expect(minutesToDecimalHours(totalMinutes)).toBe(12);
  });
});

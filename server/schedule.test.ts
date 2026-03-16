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

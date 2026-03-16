/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

/** 요일 한글 표기 */
export const DAYS_OF_WEEK = ["일", "월", "화", "수", "목", "금", "토"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** 평일: 일~목, 주말: 금~토 */
export const WEEKDAY_DAYS: DayOfWeek[] = ["일", "월", "화", "수", "목"];
export const WEEKEND_DAYS: DayOfWeek[] = ["금", "토"];

/** 숙련도 */
export type SkillLevel = "main" | "sub";
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  main: "메인 (숙련도 상)",
  sub: "서브 (숙련도 중)",
};

/** 근무 타임 */
export const TIME_SLOTS = {
  A: { label: "A타임", time: "17:30~22:00" },
  B: { label: "B타임", time: "18:00~22:00" },
  C: { label: "C타임", time: "18:00~22:00" },
} as const;

/** 근무 상태 */
export type WorkStatus = "적정" | "부족" | "초과";

export function getWorkStatus(count: number): WorkStatus {
  if (count <= 3) return "부족";
  if (count === 4) return "적정";
  return "초과";
}

/** 유효성 검사 결과 */
export interface ValidationError {
  type: "no_main" | "day_off_violation" | "info";
  message: string;
}

/**
 * 스케줄 유효성 검사
 */
export function validateSchedule(
  dayOfWeek: DayOfWeek,
  isOperating: boolean,
  aWorker: { id: number; name: string; skillLevel: SkillLevel; fixedDaysOff: string } | null,
  bWorker: { id: number; name: string; skillLevel: SkillLevel; fixedDaysOff: string } | null,
  cWorker: { id: number; name: string; skillLevel: SkillLevel; fixedDaysOff: string } | null
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isOperating) return errors;

  const assignedWorkers = [aWorker, bWorker, cWorker].filter(Boolean) as NonNullable<typeof aWorker>[];

  // 메인 숙련자 최소 1명 체크
  const hasMain = assignedWorkers.some((w) => w.skillLevel === "main");
  if (assignedWorkers.length > 0 && !hasMain) {
    errors.push({
      type: "no_main",
      message: "⚠️ 메인 숙련자가 배정되지 않았습니다!",
    });
  }

  // 고정 휴무 위반 체크
  for (const worker of assignedWorkers) {
    const daysOff = worker.fixedDaysOff?.split(",").map((d) => d.trim()).filter(Boolean) || [];
    if (daysOff.includes(dayOfWeek)) {
      errors.push({
        type: "day_off_violation",
        message: `🚫 ${worker.name}은(는) ${dayOfWeek}요일 근무 불가!`,
      });
    }
  }

  // 평일 2명, 주말 3명 체크
  const isWeekend = WEEKEND_DAYS.includes(dayOfWeek);
  const requiredCount = isWeekend ? 3 : 2;
  if (assignedWorkers.length > 0 && assignedWorkers.length < requiredCount) {
    errors.push({
      type: "info",
      message: `ℹ️ ${isWeekend ? "주말" : "평일"} 최소 ${requiredCount}명 필요 (현재 ${assignedWorkers.length}명)`,
    });
  }

  return errors;
}

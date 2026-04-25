import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, date } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Workers table - 알바생 명단 관리
 * 이름, 숙련도(메인/서브), 고정 휴무 요일
 */
export const workers = mysqlTable("workers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  skillLevel: mysqlEnum("skillLevel", ["main", "sub", "trainee"]).notNull(),
  /** 고정 휴무 요일 - 쉼표로 구분된 요일 문자열 (예: "목,일") */
  fixedDaysOff: varchar("fixedDaysOff", { length: 100 }).default(""),
  /** 선호 근무 요일 - 쉼표로 구분된 요일 문자열 (예: "월,화,수,금") */
  preferredDays: varchar("preferredDays", { length: 100 }).default(""),
  /** 급여일 (1~31, 예: 14 = 매월 14일) */
  payDay: int("payDay").default(14),
  /** 이메일 주소 (출근 예정 알림 발송용) */
  email: varchar("email", { length: 320 }),
  /** 시급 (원, 급여 계산용) */
  hourlyWage: int("hourlyWage"),
  /** 기본 출근 시간 (예: "18:00", Master에서 배정 시 자동 세팅) */
  defaultStartTime: varchar("defaultStartTime", { length: 10 }),
  /** 기본 퇴근 시간 (예: "21:00", Master에서 배정 시 자동 세팅) */
  defaultEndTime: varchar("defaultEndTime", { length: 10 }),
  /** 주간 목표 최소 근무일수 (예: 3) */
  targetDaysMin: int("targetDaysMin").default(3),
  /** 주간 목표 최대 근무일수 (예: 4) */
  targetDaysMax: int("targetDaysMax").default(4),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Worker = typeof workers.$inferSelect;
export type InsertWorker = typeof workers.$inferInsert;

/**
 * Schedules table - 날짜별 스케줄 관리
 * 날짜, 요일, 운영여부, A/B/C 타임 배정
 */
export const schedules = mysqlTable("schedules", {
  id: int("id").autoincrement().primaryKey(),
  /** 근무 날짜 (YYYY-MM-DD) */
  scheduleDate: varchar("scheduleDate", { length: 10 }).notNull().unique(),
  /** 요일 (일, 월, 화, 수, 목, 금, 토) */
  dayOfWeek: varchar("dayOfWeek", { length: 10 }).notNull(),
  /** 운영 여부 (true = 운영, false = 휴무) */
  isOperating: boolean("isOperating").default(true).notNull(),
  /** A타임 배정 알바생 ID (nullable) */
  aTimeWorkerId: int("aTimeWorkerId"),
  /** B타임 배정 알바생 ID (nullable) */
  bTimeWorkerId: int("bTimeWorkerId"),
  /** C타임 배정 알바생 ID (nullable, 주말만 사용) */
  cTimeWorkerId: int("cTimeWorkerId"),
  /** D타임 배정 알바생 ID (nullable, 수습 추가 배정용) */
  dTimeWorkerId: int("dTimeWorkerId"),
  /** E타임 배정 알바생 ID (nullable, 5번째 슬롯) */
  eTimeWorkerId: int("eTimeWorkerId"),
  /** A타임 출근 시간 (예: "17:30", nullable = 기본값 사용) */
  aTimeStartTime: varchar("aTimeStartTime", { length: 10 }),
  /** B타임 출근 시간 (예: "18:00", nullable = 기본값 사용) */
  bTimeStartTime: varchar("bTimeStartTime", { length: 10 }),
  /** C타임 출근 시간 (예: "18:00", nullable = 기본값 사용) */
  cTimeStartTime: varchar("cTimeStartTime", { length: 10 }),
  /** D타임 출근 시간 */
  dTimeStartTime: varchar("dTimeStartTime", { length: 10 }),
  /** E타임 출근 시간 */
  eTimeStartTime: varchar("eTimeStartTime", { length: 10 }),
  /** A타임 퇴근 시간 (예: "22:00", nullable = 기본값 사용) */
  aTimeEndTime: varchar("aTimeEndTime", { length: 10 }),
  /** B타임 퇴근 시간 (예: "22:00", nullable = 기본값 사용) */
  bTimeEndTime: varchar("bTimeEndTime", { length: 10 }),
  /** C타임 퇴근 시간 (예: "22:00", nullable = 기본값 사용) */
  cTimeEndTime: varchar("cTimeEndTime", { length: 10 }),
  /** D타임 퇴근 시간 */
  dTimeEndTime: varchar("dTimeEndTime", { length: 10 }),
  /** E타임 퇴근 시간 */
  eTimeEndTime: varchar("eTimeEndTime", { length: 10 }),
  /** A타임 실제 출근 시간 (알바생이 실제로 입력한 시간, 예: "17:23") */
  aTimeActualStartTime: varchar("aTimeActualStartTime", { length: 10 }),
  /** B타임 실제 출근 시간 */
  bTimeActualStartTime: varchar("bTimeActualStartTime", { length: 10 }),
  /** C타임 실제 출근 시간 */
  cTimeActualStartTime: varchar("cTimeActualStartTime", { length: 10 }),
  /** D타임 실제 출근 시간 */
  dTimeActualStartTime: varchar("dTimeActualStartTime", { length: 10 }),
  /** E타임 실제 출근 시간 */
  eTimeActualStartTime: varchar("eTimeActualStartTime", { length: 10 }),
  /** A타임 실제 퇴근 시간 (알바생이 실제로 입력한 시간, 예: "22:17") */
  aTimeActualEndTime: varchar("aTimeActualEndTime", { length: 10 }),
  /** B타임 실제 퇴근 시간 */
  bTimeActualEndTime: varchar("bTimeActualEndTime", { length: 10 }),
  /** C타임 실제 퇴근 시간 */
  cTimeActualEndTime: varchar("cTimeActualEndTime", { length: 10 }),
  /** D타임 실제 퇴근 시간 */
  dTimeActualEndTime: varchar("dTimeActualEndTime", { length: 10 }),
  /** E타임 실제 퇴근 시간 */
  eTimeActualEndTime: varchar("eTimeActualEndTime", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

/**
 * NotificationLogs table - 알림 로그 기록
 * 알바생별 알림 발송 내역 기록
 */
export const notificationLogs = mysqlTable("notificationLogs", {
  id: int("id").autoincrement().primaryKey(),
  /** 알림을 받는 알바생 ID */
  workerId: int("workerId").notNull(),
  /** 알림 유형 (schedule_view = 스케줄 조회, preferred_days_update = 선호 근무일 수정) */
  notificationType: mysqlEnum("notificationType", ["schedule_view", "preferred_days_update"]).notNull(),
  /** 알림 제목 */
  title: varchar("title", { length: 200 }).notNull(),
  /** 알림 내용 */
  message: text("message").notNull(),
  /** 알림 읽음 여부 */
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;

/**
 * ActivityLogs table - 관리자 활동 로그
 * 알바생의 모든 활동 내역 기록 (\ucd9c퇴근 수정, 선호요일, 휴무요일, 알바생 CRUD 등)
 */
export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  /** 활동을 한 알바생 ID (nullable - 관리자 작업은 null) */
  workerId: int("workerId"),
  /** 활동을 한 알바생 이름 */
  workerName: varchar("workerName", { length: 100 }).notNull(),
  /** 액션 유형 */
  actionType: mysqlEnum("actionType", [
    "end_time_update",        // 퇴근 시간 수정
    "start_time_update",      // 출근 시간 수정
    "preferred_days_update",  // 선호 근무일 변경
    "fixed_days_off_update",  // 휴무요일 변경
    "worker_created",         // 알바생 추가
    "worker_updated",         // 알바생 정보 수정
    "worker_deleted",         // 알바생 삭제
    "attendance_correction",  // 출퇴근 시간 수정
    "correction_skipped",     // 수정 팝업 건너뜀
    "email_notification",     // 이메일 알림 발송
    "push_notification",      // 푸시 알림 발송
    "notification_failed",    // 알림 발송 실패
  ]).notNull(),
  /** 활동 설명 (사람이 읽을 수 있는 텍스트) */
  description: text("description").notNull(),
  /** 추가 메타데이터 (JSON 문자열) */
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

/**
 * AppSettings table - 앱 전역 설정 키/값 저장
 */
export const appSettings = mysqlTable("appSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

/**
 * AttendanceCorrections table - 출퇴근 시간 수정/스킵 이력
 */
export const attendanceCorrections = mysqlTable("attendanceCorrections", {
  id: int("id").autoincrement().primaryKey(),
  workerId: int("workerId"),
  workerName: varchar("workerName", { length: 100 }).notNull(),
  scheduleDate: varchar("scheduleDate", { length: 10 }).notNull(),
  timeSlot: mysqlEnum("timeSlot", ["a", "b", "c", "d", "e"]).notNull(),
  /** 수정 대상: check_in=출근만, check_out=퇴근만, both=출퇴근 모두 */
  correctionType: mysqlEnum("correctionType", ["check_in", "check_out", "both"]).notNull(),
  /** corrected=시간 수정, skipped=그대로 저장 */
  actionType: mysqlEnum("actionType", ["corrected", "skipped"]).notNull(),
  originalCheckInTime: varchar("originalCheckInTime", { length: 10 }),
  correctedCheckInTime: varchar("correctedCheckInTime", { length: 10 }),
  originalCheckOutTime: varchar("originalCheckOutTime", { length: 10 }),
  correctedCheckOutTime: varchar("correctedCheckOutTime", { length: 10 }),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AttendanceCorrection = typeof attendanceCorrections.$inferSelect;
export type InsertAttendanceCorrection = typeof attendanceCorrections.$inferInsert;

/**
 * Push subscriptions - 알바생 웹 푸시 구독 정보
 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  workerId: int("workerId"),
  workerName: varchar("workerName", { length: 100 }).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: varchar("auth", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * Announcements - 관리자 공지사항
 */
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

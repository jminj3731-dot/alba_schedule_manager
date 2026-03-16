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
  skillLevel: mysqlEnum("skillLevel", ["main", "sub"]).notNull(),
  /** 고정 휴무 요일 - 쉼표로 구분된 요일 문자열 (예: "목,일") */
  fixedDaysOff: varchar("fixedDaysOff", { length: 100 }).default(""),
  /** 선호 근무 요일 - 쉼표로 구분된 요일 문자열 (예: "월,화,수,금") */
  preferredDays: varchar("preferredDays", { length: 100 }).default(""),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

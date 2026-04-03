import { eq, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool as mysqlCreatePool } from "mysql2/promise";
import { InsertUser, users, workers, schedules, notificationLogs, activityLogs, appSettings, attendanceCorrections, type InsertWorker, type InsertSchedule, type InsertNotificationLog, type InsertActivityLog, type ActivityLog, type InsertAttendanceCorrection } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

/** DB 커넥션 풀 생성 (ECONNRESET 자동 복구) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPool(): any {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[Database] DATABASE_URL is not set');
    return null;
  }
  try {
    // URI 옵션 대신 URL을 직접 파싱하여 개별 옵션으로 전달 (ssl 설정 충돌 방지)
    const url = new URL(dbUrl);
    const pool = mysqlCreatePool({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      ssl: { rejectUnauthorized: false },
    });
    // ECONNRESET 등 연결 오류 시 풀 자동 재생성
    pool.on('error' as any, (err: any) => {
      console.warn('[Database] Pool error, will recreate on next query:', err.code);
      _db = null;
      _pool = null;
    });
    console.log('[Database] Pool created:', url.hostname, url.pathname.slice(1));
    return pool;
  } catch (error) {
    console.error('[Database] Failed to create pool:', error);
    return null;
  }
}

/** DB 연결을 강제로 다시 생성 (ECONNRESET 등 연결 끊김 시 호출) */
export function resetDbConnection() {
  try { _pool?.end().catch(() => {}); } catch {}
  _db = null;
  _pool = null;
}

export async function getDb() {
  if (!_db) {
    if (!_pool) {
      _pool = createPool();
    }
    if (_pool) {
      try {
        _db = drizzle(_pool as any);
      } catch (error) {
        console.warn('[Database] Failed to create drizzle instance:', error);
        _db = null;
      }
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Workers CRUD ============

export async function getAllWorkers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workers).where(eq(workers.isActive, true));
}

export async function getWorkerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  return result[0];
}

export async function createWorker(data: { name: string; skillLevel: "main" | "sub"; fixedDaysOff: string; preferredDays?: string; payDay?: number; email?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workers).values({
    name: data.name,
    skillLevel: data.skillLevel,
    fixedDaysOff: data.fixedDaysOff || "",
    preferredDays: data.preferredDays || "",
    payDay: data.payDay ?? 14,
    email: data.email ?? null,
  });
  return { id: result[0].insertId };
}

export async function updateWorker(id: number, data: { name?: string; skillLevel?: "main" | "sub"; fixedDaysOff?: string; preferredDays?: string; payDay?: number; email?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (data.name !== undefined) updateSet.name = data.name;
  if (data.skillLevel !== undefined) updateSet.skillLevel = data.skillLevel;
  if (data.fixedDaysOff !== undefined) updateSet.fixedDaysOff = data.fixedDaysOff;
  if (data.preferredDays !== undefined) updateSet.preferredDays = data.preferredDays;
  if (data.payDay !== undefined) updateSet.payDay = data.payDay;
  if (data.email !== undefined) updateSet.email = data.email;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(workers).set(updateSet).where(eq(workers.id, id));
}

export async function deleteWorker(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete
  await db.update(workers).set({ isActive: false }).where(eq(workers.id, id));
}

// ============ Schedules CRUD ============

export async function getSchedulesByDateRange(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(schedules)
    .where(and(gte(schedules.scheduleDate, startDate), lte(schedules.scheduleDate, endDate)));
}

export async function getScheduleByDate(date: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(schedules).where(eq(schedules.scheduleDate, date)).limit(1);
  return result[0];
}

// 타임별 기본 근무 시간 (담당자 배정 시 시간이 없으면 자동 채움)
const DEFAULT_TIMES = {
  a: { start: "17:30", end: "22:00" },
  b: { start: "18:00", end: "22:00" },
  c: { start: "18:00", end: "22:00" },
};

export async function upsertSchedule(data: {
  scheduleDate: string;
  dayOfWeek: string;
  isOperating: boolean;
  aTimeWorkerId: number | null;
  bTimeWorkerId: number | null;
  cTimeWorkerId: number | null;
  dTimeWorkerId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getScheduleByDate(data.scheduleDate);
  if (existing) {
    // 기존 레코드 업데이트: 담당자가 새로 배정되면서 시간이 비어있으면 기본값 채우기
    const updateFields: Record<string, unknown> = {
      dayOfWeek: data.dayOfWeek,
      isOperating: data.isOperating,
      aTimeWorkerId: data.aTimeWorkerId,
      bTimeWorkerId: data.bTimeWorkerId,
      cTimeWorkerId: data.cTimeWorkerId,
    };
    if (data.dTimeWorkerId !== undefined) updateFields.dTimeWorkerId = data.dTimeWorkerId;
    // A타임: 담당자가 있는데 시간이 없으면 기본값 채우기
    if (data.aTimeWorkerId && !existing.aTimeStartTime) {
      updateFields.aTimeStartTime = DEFAULT_TIMES.a.start;
      updateFields.aTimeEndTime = DEFAULT_TIMES.a.end;
    }
    if (!data.aTimeWorkerId) {
      updateFields.aTimeStartTime = null;
      updateFields.aTimeEndTime = null;
    }
    // B타임
    if (data.bTimeWorkerId && !existing.bTimeStartTime) {
      updateFields.bTimeStartTime = DEFAULT_TIMES.b.start;
      updateFields.bTimeEndTime = DEFAULT_TIMES.b.end;
    }
    if (!data.bTimeWorkerId) {
      updateFields.bTimeStartTime = null;
      updateFields.bTimeEndTime = null;
    }
    // C타임
    if (data.cTimeWorkerId && !(existing as any).cTimeStartTime) {
      updateFields.cTimeStartTime = DEFAULT_TIMES.c.start;
      updateFields.cTimeEndTime = DEFAULT_TIMES.c.end;
    }
    if (!data.cTimeWorkerId) {
      updateFields.cTimeStartTime = null;
      updateFields.cTimeEndTime = null;
    }
    // D타임
    if (data.dTimeWorkerId !== undefined) {
      if (data.dTimeWorkerId && !(existing as any).dTimeStartTime) {
        updateFields.dTimeStartTime = DEFAULT_TIMES.c.start;
        updateFields.dTimeEndTime = DEFAULT_TIMES.c.end;
      }
      if (!data.dTimeWorkerId) {
        updateFields.dTimeStartTime = null;
        updateFields.dTimeEndTime = null;
      }
    }
    await db.update(schedules).set(updateFields as any).where(eq(schedules.id, existing.id));
    return { id: existing.id };
  } else {
    // 신규 레코드: 담당자가 있으면 기본 시간 자동 채우기
    const result = await db.insert(schedules).values({
      scheduleDate: data.scheduleDate,
      dayOfWeek: data.dayOfWeek,
      isOperating: data.isOperating,
      aTimeWorkerId: data.aTimeWorkerId,
      bTimeWorkerId: data.bTimeWorkerId,
      cTimeWorkerId: data.cTimeWorkerId,
      dTimeWorkerId: data.dTimeWorkerId ?? null,
      aTimeStartTime: data.aTimeWorkerId ? DEFAULT_TIMES.a.start : null,
      aTimeEndTime: data.aTimeWorkerId ? DEFAULT_TIMES.a.end : null,
      bTimeStartTime: data.bTimeWorkerId ? DEFAULT_TIMES.b.start : null,
      bTimeEndTime: data.bTimeWorkerId ? DEFAULT_TIMES.b.end : null,
      cTimeStartTime: data.cTimeWorkerId ? DEFAULT_TIMES.c.start : null,
      cTimeEndTime: data.cTimeWorkerId ? DEFAULT_TIMES.c.end : null,
      dTimeStartTime: data.dTimeWorkerId ? DEFAULT_TIMES.c.start : null,
      dTimeEndTime: data.dTimeWorkerId ? DEFAULT_TIMES.c.end : null,
    } as any);
    return { id: result[0].insertId };
  }
}

export async function updateScheduleEndTime(data: {
  scheduleDate: string;
  timeSlot: "a" | "b" | "c";
  endTime: string;
  actualEndTime?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getScheduleByDate(data.scheduleDate);
  if (!existing) throw new Error("Schedule not found for date: " + data.scheduleDate);

  const updateField =
    data.timeSlot === "a" ? { aTimeEndTime: data.endTime, aTimeActualEndTime: data.actualEndTime || data.endTime } :
    data.timeSlot === "b" ? { bTimeEndTime: data.endTime, bTimeActualEndTime: data.actualEndTime || data.endTime } :
    { cTimeEndTime: data.endTime, cTimeActualEndTime: data.actualEndTime || data.endTime };

  await db.update(schedules).set(updateField).where(eq(schedules.id, existing.id));

  // 알림용 workerName 및 scheduledEndTime 조회
  let workerName: string | null = null;
  let scheduledEndTime: string | null = null;
  try {
    const workerId =
      data.timeSlot === "a" ? existing.aTimeWorkerId
      : data.timeSlot === "b" ? existing.bTimeWorkerId
      : existing.cTimeWorkerId;
    if (workerId) {
      const w = await getWorkerById(workerId);
      workerName = w?.name ?? null;
    }
    // 예정 퇴근 시간 (수정 전 기존값)
    scheduledEndTime =
      data.timeSlot === "a" ? existing.aTimeEndTime
      : data.timeSlot === "b" ? existing.bTimeEndTime
      : existing.cTimeEndTime;
  } catch {}

  return { success: true, workerName, scheduledEndTime };
}

export async function updateScheduleTime(data: {
  scheduleDate: string;
  timeSlot: "a" | "b" | "c" | "d";
  startTime?: string;
  endTime?: string;
  actualStartTime?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getScheduleByDate(data.scheduleDate);
  if (!existing) throw new Error("Schedule not found for date: " + data.scheduleDate);

  const updateField: Record<string, string> = {};
  if (data.startTime !== undefined) {
    if (data.timeSlot === "a") updateField.aTimeStartTime = data.startTime;
    else if (data.timeSlot === "b") updateField.bTimeStartTime = data.startTime;
    else if (data.timeSlot === "c") updateField.cTimeStartTime = data.startTime;
    else updateField.dTimeStartTime = data.startTime;
  }
  if (data.endTime !== undefined) {
    if (data.timeSlot === "a") updateField.aTimeEndTime = data.endTime;
    else if (data.timeSlot === "b") updateField.bTimeEndTime = data.endTime;
    else if (data.timeSlot === "c") updateField.cTimeEndTime = data.endTime;
    else updateField.dTimeEndTime = data.endTime;
  }
  if (data.actualStartTime !== undefined) {
    if (data.timeSlot === "a") updateField.aTimeActualStartTime = data.actualStartTime;
    else if (data.timeSlot === "b") updateField.bTimeActualStartTime = data.actualStartTime;
    else if (data.timeSlot === "c") updateField.cTimeActualStartTime = data.actualStartTime;
    else updateField.dTimeActualStartTime = data.actualStartTime;
  }

  if (Object.keys(updateField).length === 0) return { success: true, workerName: null };
  await db.update(schedules).set(updateField as any).where(eq(schedules.id, existing.id));

  let workerName: string | null = null;
  try {
    const workerId =
      data.timeSlot === "a" ? existing.aTimeWorkerId
      : data.timeSlot === "b" ? existing.bTimeWorkerId
      : data.timeSlot === "c" ? existing.cTimeWorkerId
      : (existing as any).dTimeWorkerId;
    if (workerId) {
      const w = await getWorkerById(workerId);
      workerName = w?.name ?? null;
    }
  } catch {}

  return { success: true, workerName };
}

export async function getWorkerByName(name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workers)
    .where(and(eq(workers.name, name), eq(workers.isActive, true)))
    .limit(1);
  return result[0];
}

export async function getSchedulesForWorker(workerId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  const allSchedules = await db.select().from(schedules)
    .where(and(
      gte(schedules.scheduleDate, startDate),
      lte(schedules.scheduleDate, endDate),
      eq(schedules.isOperating, true)
    ));
  return allSchedules.filter(s =>
    s.aTimeWorkerId === workerId || s.bTimeWorkerId === workerId || s.cTimeWorkerId === workerId
  );
}

export async function getWeeklyWorkerCounts(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return {};

  const allSchedules = await db.select().from(schedules)
    .where(and(
      gte(schedules.scheduleDate, startDate),
      lte(schedules.scheduleDate, endDate),
      eq(schedules.isOperating, true)
    ));

  const counts: Record<number, number> = {};
  for (const s of allSchedules) {
    const workerIds = [s.aTimeWorkerId, s.bTimeWorkerId, s.cTimeWorkerId].filter(Boolean) as number[];
    for (const wId of workerIds) {
      counts[wId] = (counts[wId] || 0) + 1;
    }
  }
  return counts;
}

// ============ Notification Logs CRUD ============

export async function createNotification(data: InsertNotificationLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notificationLogs).values(data);
  return { id: result[0].insertId };
}

export async function getNotificationsByWorkerId(workerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationLogs)
    .where(eq(notificationLogs.workerId, workerId))
    .orderBy((t) => t.createdAt);
}

export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notificationLogs).set({ isRead: true }).where(eq(notificationLogs.id, notificationId));
}

export async function notifyWorkerOnScheduleView(workerId: number, workerName: string) {
  return createNotification({
    workerId,
    notificationType: "schedule_view",
    title: `${workerName}님의 스케줄 확인`,
    message: `${workerName}님이 이번 주 스케줄을 확인했습니다.`,
  });
}

export async function notifyWorkerOnPreferredDaysUpdate(workerId: number, workerName: string, preferredDays: string) {
  return createNotification({
    workerId,
    notificationType: "preferred_days_update",
    title: `${workerName}님의 선호 근무일 수정`,
    message: `${workerName}님이 선호 근무일을 ${preferredDays}로 수정했습니다.`,
  });
}

// ============ Monthly Statistics ============

/**
 * 근무 시간 문자열("17:30")을 분(minutes)으로 변환
 */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 두 시간 문자열 사이의 근무 시간(분) 계산
 */
function calcWorkMinutes(start: string, end: string): number {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  return diff > 0 ? diff : 0;
}

export interface MonthlyWorkerStat {
  workerId: number;
  workerName: string;
  skillLevel: string;
  workDays: number;
  totalMinutes: number;
  aTimeDays: number;
  bTimeDays: number;
  cTimeDays: number;
  dailyBreakdown: { date: string; dayOfWeek: string; timeSlot: string; startTime: string; endTime: string; minutes: number }[];
}

async function buildStats(allWorkers: any[], rangeSchedules: any[]): Promise<MonthlyWorkerStat[]> {
  const stats: MonthlyWorkerStat[] = allWorkers.map((w) => ({
    workerId: w.id,
    workerName: w.name || "",
    skillLevel: w.skillLevel || "sub",
    workDays: 0,
    totalMinutes: 0,
    aTimeDays: 0,
    bTimeDays: 0,
    cTimeDays: 0,
    dailyBreakdown: [],
  }));

  for (const s of rangeSchedules) {
    const slots: { slot: "a" | "b" | "c"; workerId: number | null; start: string; end: string }[] = [
      { slot: "a", workerId: s.aTimeWorkerId, start: (s as any).aTimeStartTime || "17:30", end: (s as any).aTimeEndTime || "22:00" },
      { slot: "b", workerId: s.bTimeWorkerId, start: (s as any).bTimeStartTime || "18:00", end: (s as any).bTimeEndTime || "22:00" },
      { slot: "c", workerId: s.cTimeWorkerId, start: (s as any).cTimeStartTime || "18:00", end: (s as any).cTimeEndTime || "22:00" },
      { slot: "d", workerId: (s as any).dTimeWorkerId, start: (s as any).dTimeStartTime || "18:00", end: (s as any).dTimeEndTime || "21:00" },
    ];

    for (const { slot, workerId, start, end } of slots) {
      if (!workerId) continue;
      const stat = stats.find((st) => st.workerId === workerId);
      if (!stat) continue;

      const minutes = calcWorkMinutes(start, end);
      stat.workDays += 1;
      stat.totalMinutes += minutes;
      if (slot === "a") stat.aTimeDays += 1;
      else if (slot === "b") stat.bTimeDays += 1;
      else stat.cTimeDays += 1;

      stat.dailyBreakdown.push({
        date: s.scheduleDate,
        dayOfWeek: s.dayOfWeek,
        timeSlot: slot.toUpperCase(),
        startTime: start,
        endTime: end,
        minutes,
      });
    }
  }

  return stats;
}

export async function getMonthlyStats(year: number, month: number): Promise<MonthlyWorkerStat[]> {
  const db = await getDb();
  if (!db) return [];

  // 해당 월의 시작/끝 날짜 계산
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [allWorkers, monthSchedules] = await Promise.all([
    db.select().from(workers).orderBy(workers.id),
    db.select().from(schedules)
      .where(
        and(
          gte(schedules.scheduleDate, startDate),
          lte(schedules.scheduleDate, endDate),
          eq(schedules.isOperating, true)
        )
      )
      .orderBy(schedules.scheduleDate),
  ]);

  return buildStats(allWorkers, monthSchedules);
}

export async function getStatsByDateRange(startDate: string, endDate: string): Promise<MonthlyWorkerStat[]> {
  const db = await getDb();
  if (!db) return [];

  const [allWorkers, rangeSchedules] = await Promise.all([
    db.select().from(workers).orderBy(workers.id),
    db.select().from(schedules)
      .where(
        and(
          gte(schedules.scheduleDate, startDate),
          lte(schedules.scheduleDate, endDate),
          eq(schedules.isOperating, true)
        )
      )
      .orderBy(schedules.scheduleDate),
  ]);

  return buildStats(allWorkers, rangeSchedules);
}

// ─── Activity Logs ─────────────────────────────────────────────────────────

export async function createActivityLog(data: InsertActivityLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLogs).values(data);
}

export interface ActivityLogFilter {
  workerId?: number;
  actionType?: ActivityLog["actionType"];
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit?: number;
}

export async function getActivityLogs(filter: ActivityLogFilter = {}): Promise<ActivityLog[]> {
  const db = await getDb();
  if (!db) return [];

  const { limit = 200 } = filter;

  // 날짜 범위 필터를 위한 타임스탬프 변환
  const conditions = [];
  if (filter.workerId !== undefined) {
    conditions.push(eq(activityLogs.workerId, filter.workerId));
  }
  if (filter.actionType) {
    conditions.push(eq(activityLogs.actionType, filter.actionType));
  }
  if (filter.startDate) {
    const start = new Date(filter.startDate + "T00:00:00");
    conditions.push(gte(activityLogs.createdAt, start));
  }
  if (filter.endDate) {
    const end = new Date(filter.endDate + "T23:59:59");
    conditions.push(lte(activityLogs.createdAt, end));
  }

  const query = db
    .select()
    .from(activityLogs)
    .orderBy(activityLogs.createdAt)
    .limit(limit);

  if (conditions.length > 0) {
    const rows = await db
      .select()
      .from(activityLogs)
      .where(and(...conditions))
      .orderBy(activityLogs.createdAt)
      .limit(limit);
    // 최신순 정렬
    return rows.reverse();
  }

  const rows = await query;
  return rows.reverse();
}

// ============ App Settings ============

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

// ============ Attendance Corrections ============

function calcCheckInTimeServer(actualTimeStr: string, scheduledTimeStr: string): string {
  const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const actualMins = toMins(actualTimeStr);
  const scheduledMins = toMins(scheduledTimeStr);
  if (actualMins <= scheduledMins) return scheduledTimeStr;
  const remainder = actualMins % 30;
  const ceilMins = remainder === 0 ? actualMins : actualMins + (30 - remainder);
  const h = Math.floor(ceilMins / 60) % 24;
  const m = ceilMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function roundTimeToNearest30MinServer(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  let roundedMinutes = minutes;
  let roundedHours = hours;
  if (minutes < 15) roundedMinutes = 0;
  else if (minutes < 45) roundedMinutes = 30;
  else { roundedMinutes = 0; roundedHours = (hours + 1) % 24; }
  return `${String(roundedHours).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

export async function updateScheduleActualTimes(data: {
  scheduleDate: string;
  timeSlot: "a" | "b" | "c";
  correctedCheckInTime?: string;
  correctedCheckOutTime?: string;
  scheduledCheckInTime?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getScheduleByDate(data.scheduleDate);
  if (!existing) throw new Error("Schedule not found for date: " + data.scheduleDate);

  const updateFields: Record<string, string> = {};
  const slot = data.timeSlot;

  if (data.correctedCheckInTime) {
    const scheduled = data.scheduledCheckInTime || (slot === "a" ? "17:30" : "18:00");
    const displayTime = calcCheckInTimeServer(data.correctedCheckInTime, scheduled);
    if (slot === "a") { updateFields.aTimeActualStartTime = data.correctedCheckInTime; updateFields.aTimeStartTime = displayTime; }
    else if (slot === "b") { updateFields.bTimeActualStartTime = data.correctedCheckInTime; updateFields.bTimeStartTime = displayTime; }
    else { updateFields.cTimeActualStartTime = data.correctedCheckInTime; updateFields.cTimeStartTime = displayTime; }
  }

  if (data.correctedCheckOutTime) {
    const displayTime = roundTimeToNearest30MinServer(data.correctedCheckOutTime);
    if (slot === "a") { updateFields.aTimeActualEndTime = data.correctedCheckOutTime; updateFields.aTimeEndTime = displayTime; }
    else if (slot === "b") { updateFields.bTimeActualEndTime = data.correctedCheckOutTime; updateFields.bTimeEndTime = displayTime; }
    else { updateFields.cTimeActualEndTime = data.correctedCheckOutTime; updateFields.cTimeEndTime = displayTime; }
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schedules).set(updateFields).where(eq(schedules.id, existing.id));
  }
}

export async function createAttendanceCorrection(data: InsertAttendanceCorrection): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(attendanceCorrections).values(data);
}

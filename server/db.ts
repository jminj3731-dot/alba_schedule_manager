import { eq, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, workers, schedules, notificationLogs, type InsertWorker, type InsertSchedule, type InsertNotificationLog } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
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

export async function createWorker(data: { name: string; skillLevel: "main" | "sub"; fixedDaysOff: string; preferredDays?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workers).values({
    name: data.name,
    skillLevel: data.skillLevel,
    fixedDaysOff: data.fixedDaysOff || "",
    preferredDays: data.preferredDays || "",
  });
  return { id: result[0].insertId };
}

export async function updateWorker(id: number, data: { name?: string; skillLevel?: "main" | "sub"; fixedDaysOff?: string; preferredDays?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (data.name !== undefined) updateSet.name = data.name;
  if (data.skillLevel !== undefined) updateSet.skillLevel = data.skillLevel;
  if (data.fixedDaysOff !== undefined) updateSet.fixedDaysOff = data.fixedDaysOff;
  if (data.preferredDays !== undefined) updateSet.preferredDays = data.preferredDays;
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

export async function upsertSchedule(data: {
  scheduleDate: string;
  dayOfWeek: string;
  isOperating: boolean;
  aTimeWorkerId: number | null;
  bTimeWorkerId: number | null;
  cTimeWorkerId: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getScheduleByDate(data.scheduleDate);
  if (existing) {
    await db.update(schedules).set({
      dayOfWeek: data.dayOfWeek,
      isOperating: data.isOperating,
      aTimeWorkerId: data.aTimeWorkerId,
      bTimeWorkerId: data.bTimeWorkerId,
      cTimeWorkerId: data.cTimeWorkerId,
    }).where(eq(schedules.id, existing.id));
    return { id: existing.id };
  } else {
    const result = await db.insert(schedules).values({
      scheduleDate: data.scheduleDate,
      dayOfWeek: data.dayOfWeek,
      isOperating: data.isOperating,
      aTimeWorkerId: data.aTimeWorkerId,
      bTimeWorkerId: data.bTimeWorkerId,
      cTimeWorkerId: data.cTimeWorkerId,
    });
    return { id: result[0].insertId };
  }
}

export async function updateScheduleEndTime(data: {
  scheduleDate: string;
  timeSlot: "a" | "b" | "c";
  endTime: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getScheduleByDate(data.scheduleDate);
  if (!existing) throw new Error("Schedule not found for date: " + data.scheduleDate);

  const updateField =
    data.timeSlot === "a" ? { aTimeEndTime: data.endTime } :
    data.timeSlot === "b" ? { bTimeEndTime: data.endTime } :
    { cTimeEndTime: data.endTime };

  await db.update(schedules).set(updateField).where(eq(schedules.id, existing.id));
  return { success: true };
}

export async function updateScheduleTime(data: {
  scheduleDate: string;
  timeSlot: "a" | "b" | "c";
  startTime?: string;
  endTime?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getScheduleByDate(data.scheduleDate);
  if (!existing) throw new Error("Schedule not found for date: " + data.scheduleDate);

  const updateField: Record<string, string> = {};
  if (data.startTime !== undefined) {
    if (data.timeSlot === "a") updateField.aTimeStartTime = data.startTime;
    else if (data.timeSlot === "b") updateField.bTimeStartTime = data.startTime;
    else updateField.cTimeStartTime = data.startTime;
  }
  if (data.endTime !== undefined) {
    if (data.timeSlot === "a") updateField.aTimeEndTime = data.endTime;
    else if (data.timeSlot === "b") updateField.bTimeEndTime = data.endTime;
    else updateField.cTimeEndTime = data.endTime;
  }

  if (Object.keys(updateField).length === 0) return { success: true };
  await db.update(schedules).set(updateField).where(eq(schedules.id, existing.id));
  return { success: true };
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

  for (const s of monthSchedules) {
    const slots: { slot: "a" | "b" | "c"; workerId: number | null; start: string; end: string }[] = [
      { slot: "a", workerId: s.aTimeWorkerId, start: (s as any).aTimeStartTime || "17:30", end: (s as any).aTimeEndTime || "22:00" },
      { slot: "b", workerId: s.bTimeWorkerId, start: (s as any).bTimeStartTime || "18:00", end: (s as any).bTimeEndTime || "22:00" },
      { slot: "c", workerId: s.cTimeWorkerId, start: (s as any).cTimeStartTime || "18:00", end: (s as any).cTimeEndTime || "22:00" },
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

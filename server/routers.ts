import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { sendShiftReminderEmail, sendCheckOutNotifyToAdmin, sendAttendanceCorrectionToAdmin, sendTestEmail, sendScheduleReadyEmail } from "./email";
import { savePushSubscription, deletePushSubscription, sendPushToAll, sendPushToWorker, getSubscriptionsByWorkerName, VAPID_PUBLIC_KEY } from "./push";
import { checkAndSendShiftReminders } from "./emailScheduler";
import { exportToGoogleSheets, testGoogleSheetsConnection } from "./googleSheets";
import { getLastSyncInfo } from "./googleSheetsScheduler";
import {
  getAllWorkers,
  getWorkerById,
  getWorkerByName,
  createWorker,
  updateWorker,
  deleteWorker,
  getSchedulesByDateRange,
  getSchedulesForWorker,
  upsertSchedule,
  getWeeklyWorkerCounts,
  getNotificationsByWorkerId,
  markNotificationAsRead,
  notifyWorkerOnScheduleView,
  notifyWorkerOnPreferredDaysUpdate,
  createAnnouncement,
  getActiveAnnouncements,
  deactivateAnnouncement,
  getAllAnnouncements,
  updateScheduleEndTime,
  updateScheduleTime,
  getMonthlyStats,
  getStatsByDateRange,
  createActivityLog,
  getActivityLogs,
  getAppSetting,
  setAppSetting,
  createAttendanceCorrection,
  updateScheduleActualTimes,
} from "./db";

const WEEKEND_DAYS = ["금", "토"];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

function splitDays(value?: string | null) {
  return (value || "").split(",").map((day) => day.trim()).filter(Boolean);
}

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTargetMin(worker: any) {
  return worker.targetDaysMin ?? 3;
}

function getTargetMax(worker: any) {
  return Math.max(worker.targetDaysMax ?? 4, getTargetMin(worker));
}

function getSoftWeeklyCap(worker: any) {
  return Math.max(getTargetMax(worker), 5);
}

function getConsecutiveDays(workerId: number, date: Date, assignedDates: Record<number, Set<string>>) {
  const assigned = assignedDates[workerId];
  if (!assigned) return 0;

  let streak = 0;
  const cursor = new Date(date);
  while (true) {
    cursor.setDate(cursor.getDate() - 1);
    if (!assigned.has(toLocalDateStr(cursor))) break;
    streak++;
  }
  return streak;
}

function scoreAutoAssignWorker(
  worker: any,
  dayName: string,
  date: Date,
  weekCounts: Record<number, number>,
  assignedDates: Record<number, Set<string>>,
  options?: {
    requireMain?: boolean;
    preferSub?: boolean;
  },
) {
  const preferredDays = splitDays(worker.preferredDays);
  const count = weekCounts[worker.id] || 0;
  const min = getTargetMin(worker);
  const max = getTargetMax(worker);
  const consecutiveDays = getConsecutiveDays(worker.id, date, assignedDates);

  let score = 0;

  if (preferredDays.includes(dayName)) score += 80;
  score += Math.max(min - count, 0) * 28;
  score += Math.max(max - count, 0) * 8;
  score -= Math.max(count - max + 1, 0) * 18;
  score += Math.max(0, 5 - count) * 4;

  if (consecutiveDays >= 1) score -= 18;
  if (consecutiveDays >= 2) score -= 26;
  if (consecutiveDays >= 3) score -= 36;

  if (options?.requireMain && worker.skillLevel === "main") score += 24;
  if (options?.preferSub && worker.skillLevel === "sub") score += 14;
  if (options?.preferSub && worker.skillLevel === "main") score -= 6;

  return {
    worker,
    score,
    preferred: preferredDays.includes(dayName),
    count,
    consecutiveDays,
    max,
  };
}

function rankAutoAssignWorkers(
  workers: any[],
  dayName: string,
  date: Date,
  weekCounts: Record<number, number>,
  assignedDates: Record<number, Set<string>>,
  options?: {
    requireMain?: boolean;
    preferSub?: boolean;
  },
) {
  return workers
    .map((worker) => scoreAutoAssignWorker(worker, dayName, date, weekCounts, assignedDates, options))
    .sort((a, b) =>
      b.score - a.score ||
      a.count - b.count ||
      a.consecutiveDays - b.consecutiveDays ||
      Number(b.preferred) - Number(a.preferred) ||
      a.worker.name.localeCompare(b.worker.name, "ko"),
    );
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  workers: router({
    list: publicProcedure.query(async () => {
      return getAllWorkers();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getWorkerById(input.id);
      }),

    getByName: publicProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        return getWorkerByName(input.name);
      }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        skillLevel: z.enum(["main", "sub", "trainee"]),
        fixedDaysOff: z.string().default(""),
        preferredDays: z.string().default(""),
        payDay: z.number().min(1).max(31).optional().nullable(),
        email: z.string().email().optional().nullable(),
        hourlyWage: z.number().int().min(0).optional().nullable(),
        defaultStartTime: z.string().optional().nullable(),
        defaultEndTime: z.string().optional().nullable(),
        targetDaysMin: z.number().int().min(1).max(7).optional().nullable(),
        targetDaysMax: z.number().int().min(1).max(7).optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        return createWorker(input);
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        skillLevel: z.enum(["main", "sub", "trainee"]).optional(),
        fixedDaysOff: z.string().optional(),
        preferredDays: z.string().optional(),
        payDay: z.number().min(1).max(31).optional(),
        email: z.string().email().optional().nullable(),
        hourlyWage: z.number().int().min(0).optional().nullable(),
        defaultStartTime: z.string().optional().nullable(),
        defaultEndTime: z.string().optional().nullable(),
        targetDaysMin: z.number().int().min(1).max(7).optional().nullable(),
        targetDaysMax: z.number().int().min(1).max(7).optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateWorker(id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteWorker(input.id);
        return { success: true };
      }),
  }),

  schedules: router({
    getByDateRange: publicProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return getSchedulesByDateRange(input.startDate, input.endDate);
      }),

    getForWorker: publicProcedure
      .input(z.object({
        workerId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return getSchedulesForWorker(input.workerId, input.startDate, input.endDate);
      }),

    upsert: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        dayOfWeek: z.string(),
        isOperating: z.boolean(),
        aTimeWorkerId: z.number().nullable(),
        bTimeWorkerId: z.number().nullable(),
        cTimeWorkerId: z.number().nullable(),
        dTimeWorkerId: z.number().nullable().optional(),
        eTimeWorkerId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        return upsertSchedule(input);
      }),

    updateEndTime: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c", "d", "e"]),
        endTime: z.string(),
        actualEndTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return updateScheduleEndTime(input);
      }),

    updateTime: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c", "d", "e"]),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return updateScheduleTime(input);
      }),

    checkIn: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c", "d", "e"]),
        startTime: z.string(),       // 30분 반올림된 시간
        actualStartTime: z.string(), // 실제 입력 시간
      }))
      .mutation(async ({ input }) => {
        const result = await updateScheduleTime({
          scheduleDate: input.scheduleDate,
          timeSlot: input.timeSlot,
          startTime: input.startTime,
          actualStartTime: input.actualStartTime,
        });
        // 출근 알림 전송 + activity log
        if (result?.workerName) {
          const timeSlotLabel = input.timeSlot.toUpperCase() + "타임";
          await notifyOwner({
            title: `${result.workerName}님이 출근했습니다`,
            content: `📍 ${input.scheduleDate} ${timeSlotLabel}\n⏰ 실제 출근: ${input.actualStartTime} → 기록: ${input.startTime}`,
          }).catch(() => {});
          await createActivityLog({
            workerId: result.workerId ?? null,
            workerName: result.workerName,
            actionType: "start_time_update",
            description: `${result.workerName}님이 ${input.scheduleDate} 출근 버튼을 눌렀습니다. 실제 시간 ${input.actualStartTime} → ${input.startTime}으로 기록`,
            metadata: JSON.stringify({ scheduleDate: input.scheduleDate, timeSlot: input.timeSlot, actualStartTime: input.actualStartTime, displayStartTime: input.startTime }),
          }).catch(() => {});
        }
        return result;
      }),

    checkOut: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c", "d", "e"]),
        endTime: z.string(),         // 30분 반올림된 시간
        actualEndTime: z.string(),   // 실제 입력 시간
      }))
      .mutation(async ({ input }) => {
        const result = await updateScheduleEndTime({
          scheduleDate: input.scheduleDate,
          timeSlot: input.timeSlot,
          endTime: input.endTime,
          actualEndTime: input.actualEndTime,
        });
        // 관리자에게 퇴근 완료 이메일 발송
        if (result?.workerName && result?.scheduledEndTime) {
          const adminEmails = [
            process.env.ADMIN_EMAIL,
            process.env.ADMIN_EMAIL2,
          ].filter(Boolean) as string[];
          for (const adminEmail of adminEmails) {
            await sendCheckOutNotifyToAdmin({
              to: adminEmail,
              workerName: result.workerName,
              scheduleDate: input.scheduleDate,
              timeSlot: input.timeSlot.toUpperCase() as "A" | "B" | "C",
              scheduledEndTime: result.scheduledEndTime,
              actualEndTime: input.actualEndTime,
            }).catch(() => {}); // 이메일 실패해도 퇴근 처리는 성공
          }
          // 앱 알림도 발송
          await notifyOwner({
            title: `${result.workerName}님이 퇴근했습니다`,
            content: `🏁 ${input.scheduleDate} ${input.timeSlot.toUpperCase()}타임\n⏰ 실제 퇴근: ${input.actualEndTime} → 기록: ${input.endTime}`,
          }).catch(() => {});
          await createActivityLog({
            workerId: result.workerId ?? null,
            workerName: result.workerName,
            actionType: "end_time_update",
            description: `${result.workerName}님이 ${input.scheduleDate} 퇴근 버튼을 눌렀습니다. 실제 시간 ${input.actualEndTime} → ${input.endTime}으로 기록`,
            metadata: JSON.stringify({ scheduleDate: input.scheduleDate, timeSlot: input.timeSlot, actualEndTime: input.actualEndTime, displayEndTime: input.endTime }),
          }).catch(() => {});
        }
        return result;
      }),

    weeklyWorkerCounts: publicProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return getWeeklyWorkerCounts(input.startDate, input.endDate);
      }),

    /** 자동 배정: 선호 근무일 기반으로 주간 스케줄 자동 생성 */
    autoAssign: publicProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .mutation(async ({ input }) => {
        const allWorkers = await getAllWorkers();
        if (allWorkers.length === 0) return { success: false, message: "등록된 알바생이 없습니다." };

        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const results: { date: string; assigned: boolean }[] = [];

        const weekCounts: Record<number, number> = {};
        const assignedDates: Record<number, Set<string>> = {};
        allWorkers.forEach((worker) => {
          weekCounts[worker.id] = 0;
          assignedDates[worker.id] = new Set<string>();
        });

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = toLocalDateStr(d);
          const dayName = DAY_NAMES[d.getDay()];
          const isWeekend = WEEKEND_DAYS.includes(dayName);
          const requiredCount = isWeekend ? 3 : 2;

          const available = allWorkers.filter((w) => {
            if (w.skillLevel === "trainee") return false;
            const daysOff = splitDays(w.fixedDaysOff);
            return !daysOff.includes(dayName);
          });

          const availableTrainees = allWorkers.filter((w) => {
            if (w.skillLevel !== "trainee") return false;
            const daysOff = splitDays(w.fixedDaysOff);
            return !daysOff.includes(dayName);
          });

          const assigned: typeof allWorkers = [];
          const mainCandidates = available.filter((worker) => worker.skillLevel === "main");

          if (mainCandidates.length > 0) {
            const rankedMain = rankAutoAssignWorkers(
              mainCandidates,
              dayName,
              d,
              weekCounts,
              assignedDates,
              { requireMain: true },
            );
            const mainPick =
              rankedMain.find(({ worker, count }) => count < getSoftWeeklyCap(worker))?.worker ??
              rankedMain[0]?.worker;
            if (mainPick) assigned.push(mainPick);
          }

          while (assigned.length < requiredCount) {
            const remainingWorkers = available.filter(
              (worker) => !assigned.some((assignedWorker) => assignedWorker.id === worker.id),
            );
            if (remainingWorkers.length === 0) break;

            const rankedRemaining = rankAutoAssignWorkers(
              remainingWorkers,
              dayName,
              d,
              weekCounts,
              assignedDates,
              { preferSub: assigned.length >= 1 },
            );

            const nextPick =
              rankedRemaining.find(({ worker, count }) => count < getSoftWeeklyCap(worker))?.worker ??
              rankedRemaining[0]?.worker;
            if (!nextPick) break;
            assigned.push(nextPick);
          }

          let dTimeWorkerId: number | null = null;
          const rankedTrainees = rankAutoAssignWorkers(
            availableTrainees,
            dayName,
            d,
            weekCounts,
            assignedDates,
          );
          const traineePick =
            rankedTrainees.find(({ worker, count }) => count < getSoftWeeklyCap(worker))?.worker ??
            rankedTrainees[0]?.worker;
          if (traineePick) {
            dTimeWorkerId = traineePick.id;
          }

          assigned.forEach((worker) => {
            weekCounts[worker.id] = (weekCounts[worker.id] || 0) + 1;
            assignedDates[worker.id].add(dateStr);
          });
          if (dTimeWorkerId) {
            weekCounts[dTimeWorkerId] = (weekCounts[dTimeWorkerId] || 0) + 1;
            assignedDates[dTimeWorkerId].add(dateStr);
          }

          await upsertSchedule({
            scheduleDate: dateStr,
            dayOfWeek: dayName,
            isOperating: true,
            aTimeWorkerId: assigned[0]?.id ?? null,
            bTimeWorkerId: assigned[1]?.id ?? null,
            cTimeWorkerId: isWeekend ? (assigned[2]?.id ?? null) : null,
            dTimeWorkerId,
          });

          results.push({ date: dateStr, assigned: assigned.length >= requiredCount });
        }

        return { success: true, results };
      }),

    copyFromPrevWeek: publicProcedure
      .input(z.object({
        startDate: z.string(), // 이번 주 시작일
        endDate: z.string(),   // 이번 주 종료일
      }))
      .mutation(async ({ input }) => {
        // 전주 날짜 범위 계산
        const prevStart = new Date(input.startDate);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(input.endDate);
        prevEnd.setDate(prevEnd.getDate() - 7);
        const prevStartStr = toLocalDateStr(prevStart);
        const prevEndStr = toLocalDateStr(prevEnd);

        const prevSchedules = await getSchedulesByDateRange(prevStartStr, prevEndStr);
        if (prevSchedules.length === 0) return { success: false, message: "전주 스케줄이 없습니다." };

        let copied = 0;
        for (const prev of prevSchedules) {
          // 전주 날짜 → 이번 주 날짜로 변환 (+7일)
          const prevDate = new Date(prev.scheduleDate);
          prevDate.setDate(prevDate.getDate() + 7);
          const newDateStr = toLocalDateStr(prevDate);
          const dayName = DAY_NAMES[prevDate.getDay()];

          await upsertSchedule({
            scheduleDate: newDateStr,
            dayOfWeek: dayName,
            isOperating: prev.isOperating,
            aTimeWorkerId: prev.aTimeWorkerId,
            bTimeWorkerId: prev.bTimeWorkerId,
            cTimeWorkerId: prev.cTimeWorkerId,
            dTimeWorkerId: (prev as any).dTimeWorkerId ?? null,
          });
          copied++;
        }

        return { success: true, copied };
      }),
  }),

  notifications: router({
    getByWorkerId: publicProcedure
      .input(z.object({ workerId: z.number() }))
      .query(async ({ input }) => {
        return getNotificationsByWorkerId(input.workerId);
      }),

    markAsRead: publicProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input }) => {
        await markNotificationAsRead(input.notificationId);
        return { success: true };
      }),

    notifyScheduleView: publicProcedure
      .input(z.object({ workerId: z.number(), workerName: z.string() }))
      .mutation(async ({ input }) => {
        // 전민서는 알림 발송 안 함
        if (input.workerName === "전민서") {
          return { success: true, skipped: true };
        }
        await notifyWorkerOnScheduleView(input.workerId, input.workerName);
        return { success: true };
      }),

    notifyPreferredDaysUpdate: publicProcedure
      .input(z.object({ workerId: z.number(), workerName: z.string(), preferredDays: z.string() }))
      .mutation(async ({ input }) => {
        // 전민서는 알림 발송 안 함
        if (input.workerName === "전민서") {
          return { success: true, skipped: true };
        }
        await notifyWorkerOnPreferredDaysUpdate(input.workerId, input.workerName, input.preferredDays);
        return { success: true };
      }),
  }),

  statistics: router({
    monthly: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input }) => {
        return getMonthlyStats(input.year, input.month);
      }),

    byDateRange: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        return getStatsByDateRange(input.startDate, input.endDate);
      }),
  }),

  activityLogs: router({
    create: publicProcedure
      .input(z.object({
        workerId: z.number().nullable().optional(),
        workerName: z.string(),
        actionType: z.enum([
          "end_time_update",
          "start_time_update",
          "preferred_days_update",
          "fixed_days_off_update",
          "worker_created",
          "worker_updated",
          "worker_deleted",
          "email_notification",
          "push_notification",
          "notification_failed",
        ]),
        description: z.string(),
        metadata: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await createActivityLog({
          workerId: input.workerId ?? null,
          workerName: input.workerName,
          actionType: input.actionType,
          description: input.description,
          metadata: input.metadata ?? null,
        });
        return { success: true };
      }),

    list: publicProcedure
      .input(z.object({
        workerId: z.number().optional(),
        actionType: z.enum([
          "end_time_update",
          "start_time_update",
          "preferred_days_update",
          "fixed_days_off_update",
          "worker_created",
          "worker_updated",
          "worker_deleted",
          "email_notification",
          "push_notification",
          "notification_failed",
        ]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return getActivityLogs(input);
      }),
  }),

  googleSheets: router({
    /** 구글 시트로 전체 데이터 내보내기 */
    export: publicProcedure
      .input(z.object({
        startDate: z.string().optional(), // YYYY-MM-DD
        endDate: z.string().optional(),   // YYYY-MM-DD
      }).optional())
      .mutation(async ({ input }) => {
        return exportToGoogleSheets(input || {});
      }),
    /** 구글 시트 연결 상태 확인 */
    testConnection: publicProcedure
      .query(async () => {
        const connected = await testGoogleSheetsConnection();
        return { connected };
      }),
    /** 마지막 자동 동기화 정보 조회 */
    lastSyncInfo: publicProcedure
      .query(async () => {
        const info = getLastSyncInfo();
        return {
          lastSyncTime: info.lastSyncTime ? info.lastSyncTime.toISOString() : null,
          lastSyncStatus: info.lastSyncStatus,
          lastSyncMessage: info.lastSyncMessage,
        };
      }),
  }),
  email: router({
    /** 수동으로 특정 알바생에게 시프트 알림 이메일 발송 (테스트용) */
    sendTestReminder: publicProcedure
      .input(z.object({
        to: z.string().email(),
        workerName: z.string(),
        scheduleDate: z.string(),
        timeSlot: z.enum(["A", "B", "C"]),
        startTime: z.string(),
        endTime: z.string(),
      }))
      .mutation(async ({ input }) => {
        return sendShiftReminderEmail(input);
      }),

    /** 스케줄러 수동 실행 (관리자 전용) */
    triggerCheck: publicProcedure
      .mutation(async () => {
        await checkAndSendShiftReminders();
        return { success: true };
      }),
  }),

  settings: router({
    get: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        const value = await getAppSetting(input.key);
        return { value };
      }),

    set: publicProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await setAppSetting(input.key, input.value);
        return { success: true };
      }),

    verifyAdminPassword: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        const stored = await getAppSetting("adminPassword") ?? "0000";
        return { ok: input.password === stored };
      }),
  }),

  attendanceCorrections: router({
    create: publicProcedure
      .input(z.object({
        workerId: z.number().nullable().optional(),
        workerName: z.string(),
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c", "d", "e"]),
        correctionType: z.enum(["check_in", "check_out", "both"]),
        actionType: z.enum(["corrected", "skipped"]),
        originalCheckInTime: z.string().optional(),
        correctedCheckInTime: z.string().optional(),
        scheduledCheckInTime: z.string().optional(),
        originalCheckOutTime: z.string().optional(),
        correctedCheckOutTime: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.actionType === "corrected") {
          // 스케줄 실제 시간 업데이트
          await updateScheduleActualTimes({
            scheduleDate: input.scheduleDate,
            timeSlot: input.timeSlot,
            correctedCheckInTime: input.correctedCheckInTime,
            correctedCheckOutTime: input.correctedCheckOutTime,
            scheduledCheckInTime: input.scheduledCheckInTime,
          });

          // 관리자 이메일 발송 (settings 우선, 없으면 env fallback)
          const settingsEmail = await getAppSetting("adminNotificationEmail");
          const adminEmailStr = settingsEmail || process.env.ADMIN_NOTIFICATION_EMAIL || "";
          const adminEmails = adminEmailStr.split(",").map((e: string) => e.trim()).filter(Boolean);
          for (const email of adminEmails) {
            await sendAttendanceCorrectionToAdmin({
              to: email,
              workerName: input.workerName,
              scheduleDate: input.scheduleDate,
              timeSlot: input.timeSlot.toUpperCase(),
              correctionType: input.correctionType,
              originalCheckInTime: input.originalCheckInTime,
              correctedCheckInTime: input.correctedCheckInTime,
              originalCheckOutTime: input.originalCheckOutTime,
              correctedCheckOutTime: input.correctedCheckOutTime,
              reason: input.reason || "",
            }).catch(() => {});
          }
        }

        // 수정/스킵 이력 저장
        await createAttendanceCorrection({
          workerId: input.workerId ?? null,
          workerName: input.workerName,
          scheduleDate: input.scheduleDate,
          timeSlot: input.timeSlot,
          correctionType: input.correctionType,
          actionType: input.actionType,
          originalCheckInTime: input.originalCheckInTime,
          correctedCheckInTime: input.correctedCheckInTime,
          originalCheckOutTime: input.originalCheckOutTime,
          correctedCheckOutTime: input.correctedCheckOutTime,
          reason: input.reason,
        });

        // activityLogs 기록
        const typeLabel = input.correctionType === "check_in" ? "출근" : input.correctionType === "check_out" ? "퇴근" : "출퇴근";
        await createActivityLog({
          workerId: input.workerId ?? null,
          workerName: input.workerName,
          actionType: input.actionType === "corrected" ? "attendance_correction" : "correction_skipped",
          description: input.actionType === "corrected"
            ? `${input.workerName}님이 ${input.scheduleDate} ${typeLabel} 시간을 수정했습니다. 사유: ${input.reason}`
            : `${input.workerName}님이 ${input.scheduleDate} 출퇴근 시간 수정 팝업을 건너뛰었습니다.`,
          metadata: JSON.stringify(input),
        });

        return { success: true };
      }),
  }),

  announcements: router({
    getActive: publicProcedure.query(async () => {
      return getActiveAnnouncements();
    }),

    getAll: publicProcedure.query(async () => {
      return getAllAnnouncements();
    }),

    create: publicProcedure
      .input(z.object({ title: z.string(), content: z.string() }))
      .mutation(async ({ input }) => {
        console.log(`[Announcement] Creating: "${input.title}"`);
        const result = await createAnnouncement(input);
        console.log(`[Announcement] Saved to DB, id=${result.id}. Sending push...`);
        try {
          await sendPushToAll(`📢 ${input.title}`, input.content, "/");
        } catch (err: any) {
          console.error("[Announcement] Push failed:", err.message);
        }
        return { success: true, id: result.id };
      }),

    deactivate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deactivateAnnouncement(input.id);
        return { success: true };
      }),
  }),

  push: router({
    getVapidPublicKey: publicProcedure.query(() => {
      return { publicKey: VAPID_PUBLIC_KEY };
    }),

    subscribe: publicProcedure
      .input(z.object({
        workerId: z.number().nullable(),
        workerName: z.string(),
        endpoint: z.string(),
        p256dh: z.string(),
        auth: z.string(),
      }))
      .mutation(async ({ input }) => {
        await savePushSubscription(input);
        return { success: true };
      }),

    unsubscribe: publicProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ input }) => {
        await deletePushSubscription(input.endpoint);
        return { success: true };
      }),
  }),

  notification: router({
    test: publicProcedure
      .mutation(async () => {
        const TARGET_WORKER = "전민서";
        const TEST_EMAIL = "jminj3731@gmail.com";

        // 1. 푸시 알림 발송
        let pushSuccess = false;
        let pushMessage = "";
        try {
          const subs = await getSubscriptionsByWorkerName(TARGET_WORKER);
          if (subs.length === 0) {
            pushMessage = `${TARGET_WORKER}님의 푸시 구독이 없습니다`;
          } else {
            await sendPushToWorker(TARGET_WORKER, "알림 테스트", "푸시 알림이 정상 작동합니다!");
            pushSuccess = true;
            pushMessage = `${TARGET_WORKER}님에게 푸시 발송 완료 (구독 ${subs.length}건)`;
          }
        } catch (err: any) {
          pushMessage = `푸시 발송 실패: ${err.message}`;
        }

        // 2. 이메일 발송
        const emailResult = await sendTestEmail({ to: TEST_EMAIL, workerName: TARGET_WORKER });

        return {
          push: { success: pushSuccess, message: pushMessage },
          email: { success: emailResult.success, message: emailResult.success ? `${TEST_EMAIL}로 이메일 발송 완료` : `이메일 발송 실패: ${emailResult.error}` },
        };
      }),

    scheduleReady: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .mutation(async ({ input }) => {
        // 주차 레이블 계산 (이번 주 / 다음 주 / M/D~M/D)
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const dayOfWeek = now.getDay();
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(now.getDate() - dayOfWeek);
        thisWeekStart.setHours(0, 0, 0, 0);
        const nextWeekStart = new Date(thisWeekStart);
        nextWeekStart.setDate(thisWeekStart.getDate() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

        const toMMDD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        const startD = new Date(input.startDate + "T00:00:00");
        const endD = new Date(input.endDate + "T00:00:00");
        const startMMDD = toMMDD(startD);
        const endMMDD = toMMDD(endD);

        let weekLabel: string;
        if (input.startDate === toLocalDateStr(thisWeekStart)) {
          weekLabel = `이번 주(${startMMDD}~${endMMDD})`;
        } else if (input.startDate === toLocalDateStr(nextWeekStart)) {
          weekLabel = `다음 주(${startMMDD}~${endMMDD})`;
        } else {
          weekLabel = `${startMMDD}~${endMMDD}`;
        }

        const allWorkers = await getAllWorkers();
        let pushCount = 0;
        let emailCount = 0;
        let failCount = 0;

        for (const worker of allWorkers) {
          try {
            const subs = await getSubscriptionsByWorkerName(worker.name);
            if (subs.length > 0) {
              await sendPushToWorker(
                worker.name,
                `📅 ${weekLabel} 스케줄 등록`,
                "앱에서 확인해주세요."
              );
              pushCount++;
            } else if (worker.email) {
              await sendScheduleReadyEmail({ to: worker.email, workerName: worker.name, weekLabel });
              emailCount++;
            }
          } catch {
            failCount++;
          }
        }

        return { success: true, pushCount, emailCount, failCount, weekLabel };
      }),
  }),
});

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export type AppRouter = typeof appRouter;

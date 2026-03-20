import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { sendShiftReminderEmail, sendCheckOutNotifyToAdmin } from "./email";
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
  updateScheduleEndTime,
  updateScheduleTime,
  getMonthlyStats,
  getStatsByDateRange,
  createActivityLog,
  getActivityLogs,
} from "./db";

const WEEKEND_DAYS = ["금", "토"];

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
        skillLevel: z.enum(["main", "sub"]),
        fixedDaysOff: z.string().default(""),
        preferredDays: z.string().default(""),
        payDay: z.number().min(1).max(31).default(14),
        email: z.string().email().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        return createWorker(input);
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        skillLevel: z.enum(["main", "sub"]).optional(),
        fixedDaysOff: z.string().optional(),
        preferredDays: z.string().optional(),
        payDay: z.number().min(1).max(31).optional(),
        email: z.string().email().optional().nullable(),
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
      }))
      .mutation(async ({ input }) => {
        return upsertSchedule(input);
      }),

    updateEndTime: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c"]),
        endTime: z.string(),
        actualEndTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return updateScheduleEndTime(input);
      }),

    updateTime: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c"]),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return updateScheduleTime(input);
      }),

    checkIn: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c"]),
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
        // 출근 알림 전송 (workerName은 result에서 가져옴)
        if (result?.workerName) {
          const timeSlotLabel = input.timeSlot.toUpperCase() + "타임";
          await notifyOwner({
            title: `${result.workerName}님이 출근했습니다`,
            content: `📍 ${input.scheduleDate} ${timeSlotLabel}\n⏰ 실제 출근: ${input.actualStartTime} → 기록: ${input.startTime}`,
          }).catch(() => {}); // 알림 실패해도 출근 처리는 성공
        }
        return result;
      }),

    checkOut: publicProcedure
      .input(z.object({
        scheduleDate: z.string(),
        timeSlot: z.enum(["a", "b", "c"]),
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
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
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

        const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const results: { date: string; assigned: boolean }[] = [];

        // Track how many days each worker is assigned this week
        const weekCounts: Record<number, number> = {};
        allWorkers.forEach(w => { weekCounts[w.id] = 0; });

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          const dayName = DAY_NAMES[d.getDay()];
          const isWeekend = WEEKEND_DAYS.includes(dayName);
          const requiredCount = isWeekend ? 3 : 2;

          // Get available workers for this day (not on fixed day off)
          const available = allWorkers.filter(w => {
            const daysOff = (w.fixedDaysOff || "").split(",").map(s => s.trim()).filter(Boolean);
            return !daysOff.includes(dayName);
          });

          // Score workers: prefer those who listed this day as preferred, then balance counts
          const scored = available.map(w => {
            const preferred = (w.preferredDays || "").split(",").map(s => s.trim()).filter(Boolean);
            const prefScore = preferred.includes(dayName) ? 100 : 0;
            const balanceScore = 10 - (weekCounts[w.id] || 0); // fewer shifts = higher score
            return { worker: w, score: prefScore + balanceScore };
          }).sort((a, b) => b.score - a.score);

          // Ensure at least one main worker
          const mainWorkers = scored.filter(s => s.worker.skillLevel === "main");
          const subWorkers = scored.filter(s => s.worker.skillLevel === "sub");

          const assigned: typeof allWorkers = [];

          // First pick: guarantee a main worker for A-time
          if (mainWorkers.length > 0) {
            assigned.push(mainWorkers[0].worker);
          }

          // Fill remaining slots from scored list (excluding already assigned)
          const remaining = scored.filter(s => !assigned.find(a => a.id === s.worker.id));
          for (const s of remaining) {
            if (assigned.length >= requiredCount) break;
            // Target 4 days per week
            if ((weekCounts[s.worker.id] || 0) >= 5) continue;
            assigned.push(s.worker);
          }

          // If still not enough, relax the 5-day limit
          if (assigned.length < requiredCount) {
            for (const s of remaining) {
              if (assigned.length >= requiredCount) break;
              if (!assigned.find(a => a.id === s.worker.id)) {
                assigned.push(s.worker);
              }
            }
          }

          // Update week counts
          assigned.forEach(w => { weekCounts[w.id] = (weekCounts[w.id] || 0) + 1; });

          await upsertSchedule({
            scheduleDate: dateStr,
            dayOfWeek: dayName,
            isOperating: true,
            aTimeWorkerId: assigned[0]?.id ?? null,
            bTimeWorkerId: assigned[1]?.id ?? null,
            cTimeWorkerId: isWeekend ? (assigned[2]?.id ?? null) : null,
          });

          results.push({ date: dateStr, assigned: assigned.length >= requiredCount });
        }

        return { success: true, results };
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
    export: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(), // YYYY-MM-DD
        endDate: z.string().optional(),   // YYYY-MM-DD
      }).optional())
      .mutation(async ({ input }) => {
        return exportToGoogleSheets(input || {});
      }),
    /** 구글 시트 연결 상태 확인 */
    testConnection: protectedProcedure
      .query(async () => {
        const connected = await testGoogleSheetsConnection();
        return { connected };
      }),
    /** 마지막 자동 동기화 정보 조회 */
    lastSyncInfo: protectedProcedure
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
});
export type AppRouter = typeof appRouter;

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getAllWorkers,
  getWorkerById,
  createWorker,
  updateWorker,
  deleteWorker,
  getSchedulesByDateRange,
  upsertSchedule,
  getWeeklyWorkerCounts,
} from "./db";

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

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        skillLevel: z.enum(["main", "sub"]),
        fixedDaysOff: z.string().default(""),
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

    weeklyWorkerCounts: publicProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return getWeeklyWorkerCounts(input.startDate, input.endDate);
      }),
  }),
});

export type AppRouter = typeof appRouter;

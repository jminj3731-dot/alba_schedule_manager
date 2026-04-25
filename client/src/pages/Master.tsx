import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Wand2, Clock, Plus, X, Copy, Bell } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];
const NONE_VALUE = "__none__";

const START_TIMES = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
const END_TIMES = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];

// 기본 출근/퇴근 시간
const DEFAULT_START: Record<string, string> = { a: "17:30", b: "18:00", c: "18:00" };
const DEFAULT_END = "22:00";
const SLOT_TIME_DEFAULTS: Record<"a" | "b" | "c" | "d" | "e", { start: string; end: string }> = {
  a: { start: "17:30", end: "22:00" },
  b: { start: "18:00", end: "22:00" },
  c: { start: "18:00", end: "22:00" },
  d: { start: "18:00", end: "22:00" },
  e: { start: "18:00", end: "22:00" },
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDates(offset: number): { date: Date; dateStr: string; dayName: string }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + offset * 7);
  startOfWeek.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    dates.push({
      date: d,
      dateStr: toLocalDateStr(d),
      dayName: DAY_NAMES[d.getDay()],
    });
  }
  return dates;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface ScheduleRow {
  scheduleDate: string;
  dayOfWeek: string;
  isOperating: boolean;
  aTimeWorkerId: number | null;
  bTimeWorkerId: number | null;
  cTimeWorkerId: number | null;
  dTimeWorkerId?: number | null;
  eTimeWorkerId?: number | null;
  aTimeStartTime?: string | null;
  bTimeStartTime?: string | null;
  cTimeStartTime?: string | null;
  dTimeStartTime?: string | null;
  eTimeStartTime?: string | null;
  aTimeEndTime?: string | null;
  bTimeEndTime?: string | null;
  cTimeEndTime?: string | null;
  dTimeEndTime?: string | null;
  eTimeEndTime?: string | null;
}

function validateRow(row: ScheduleRow, workers: any[]): { type: string; message: string }[] {
  const errors: { type: string; message: string }[] = [];
  if (!row.isOperating) return errors;

  const getWorker = (id: number | null) => workers.find((w) => w.id === id) || null;
  const aW = getWorker(row.aTimeWorkerId);
  const bW = getWorker(row.bTimeWorkerId);
  const cW = getWorker(row.cTimeWorkerId);
  const assigned = [aW, bW, cW].filter(Boolean);

  if (assigned.length > 0 && !assigned.some((w: any) => w.skillLevel === "main")) {
    errors.push({ type: "no_main", message: "메인 숙련자 미배정" });
  }

  for (const w of assigned) {
    if (!w) continue;
    const daysOff = (w.fixedDaysOff || "").split(",").filter(Boolean);
    if (daysOff.includes(row.dayOfWeek)) {
      errors.push({ type: "day_off", message: `${w.name} ${row.dayOfWeek}요일 근무 불가` });
    }
  }

  const coreAssigned = [aW, bW].filter(Boolean);
  if (coreAssigned.length > 0 && coreAssigned.length < 2) {
    errors.push({ type: "info", message: `A/B타임 2명 필요 (현재 ${coreAssigned.length}명)` });
  }

  return errors;
}

function isDayOffViolation(workerId: number | null, dayOfWeek: string, workers: any[]): boolean {
  if (!workerId) return false;
  const worker = workers.find((w) => w.id === workerId);
  if (!worker) return false;
  const daysOff = (worker.fixedDaysOff || "").split(",").filter(Boolean);
  return daysOff.includes(dayOfWeek);
}

function resolveWorkerTimesForSlot(
  worker: any,
  slot: "a" | "b" | "c" | "d" | "e",
): { slot: "a" | "b" | "c" | "d" | "e"; startTime?: string; endTime?: string } | undefined {
  if (!worker) return undefined;

  const defaults = SLOT_TIME_DEFAULTS[slot];
  if (slot === "a") {
    return {
      slot,
      startTime: worker.defaultStartTime ?? defaults.start,
      endTime: worker.defaultEndTime ?? defaults.end,
    };
  }

  return {
    slot,
    startTime: defaults.start,
    endTime: worker.skillLevel === "trainee"
      ? worker.defaultEndTime ?? defaults.end
      : defaults.end,
  };
}

export default function Master() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [autoAssignDialogOpen, setAutoAssignDialogOpen] = useState(false);
  const [expandedCSlots, setExpandedCSlots] = useState<Set<string>>(new Set());
  const [expandedDSlots, setExpandedDSlots] = useState<Set<string>>(new Set());
  const [expandedESlots, setExpandedESlots] = useState<Set<string>>(new Set());
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const startDate = weekDates[0].dateStr;
  const endDate = weekDates[6].dateStr;

  const utils = trpc.useUtils();
  const { data: workers = [] } = trpc.workers.list.useQuery();
  const { data: existingSchedules = [] } = trpc.schedules.getByDateRange.useQuery({ startDate, endDate });

  const upsertMutation = trpc.schedules.upsert.useMutation({
    onSuccess: () => {
      utils.schedules.getByDateRange.invalidate({ startDate, endDate });
      utils.schedules.weeklyWorkerCounts.invalidate();
    },
  });

  const updateTimeMutation = trpc.schedules.updateTime.useMutation({
    onSuccess: () => {
      utils.schedules.getByDateRange.invalidate({ startDate, endDate });
      toast.success("시간이 저장되었습니다.");
    },
    onError: () => {
      toast.error("시간 저장에 실패했습니다.");
    },
  });

  const autoAssignMutation = trpc.schedules.autoAssign.useMutation({
    onSuccess: (result) => {
      utils.schedules.getByDateRange.invalidate({ startDate, endDate });
      utils.schedules.weeklyWorkerCounts.invalidate();
      setAutoAssignDialogOpen(false);
      if (result.success) {
        toast.success("자동 배정이 완료되었습니다.");
      } else {
        toast.error(result.message || "자동 배정에 실패했습니다.");
      }
    },
    onError: () => {
      toast.error("자동 배정 중 오류가 발생했습니다.");
    },
  });

  const scheduleReadyMutation = trpc.notification.scheduleReady.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.weekLabel} 스케줄 알림 발송 완료! (푸시 ${result.pushCount}건, 이메일 ${result.emailCount}건)`);
    },
    onError: () => {
      toast.error("알림 발송 중 오류가 발생했습니다.");
    },
  });

  const copyPrevWeekMutation = trpc.schedules.copyFromPrevWeek.useMutation({
    onSuccess: (result) => {
      utils.schedules.getByDateRange.invalidate({ startDate, endDate });
      utils.schedules.weeklyWorkerCounts.invalidate();
      if (result.success) {
        toast.success(`전주 스케줄 ${result.copied}일 복사 완료!`);
      } else {
        toast.error(result.message || "전주 스케줄 복사에 실패했습니다.");
      }
    },
    onError: () => {
      toast.error("전주 스케줄 복사 중 오류가 발생했습니다.");
    },
  });

  const scheduleMap = useMemo(() => {
    const map: Record<string, ScheduleRow> = {};
    for (const d of weekDates) {
      const existing = existingSchedules.find((s) => s.scheduleDate === d.dateStr);
      map[d.dateStr] = existing
        ? {
            scheduleDate: existing.scheduleDate,
            dayOfWeek: existing.dayOfWeek,
            isOperating: existing.isOperating,
            aTimeWorkerId: existing.aTimeWorkerId,
            bTimeWorkerId: existing.bTimeWorkerId,
            cTimeWorkerId: existing.cTimeWorkerId,
            aTimeStartTime: (existing as any).aTimeStartTime,
            bTimeStartTime: (existing as any).bTimeStartTime,
            cTimeStartTime: (existing as any).cTimeStartTime,
            dTimeStartTime: (existing as any).dTimeStartTime,
            eTimeStartTime: (existing as any).eTimeStartTime,
            aTimeEndTime: (existing as any).aTimeEndTime,
            bTimeEndTime: (existing as any).bTimeEndTime,
            cTimeEndTime: (existing as any).cTimeEndTime,
            dTimeEndTime: (existing as any).dTimeEndTime,
            eTimeEndTime: (existing as any).eTimeEndTime,
            dTimeWorkerId: (existing as any).dTimeWorkerId ?? null,
            eTimeWorkerId: (existing as any).eTimeWorkerId ?? null,
          }
        : {
            scheduleDate: d.dateStr,
            dayOfWeek: d.dayName,
            isOperating: true,
            aTimeWorkerId: null,
            bTimeWorkerId: null,
            cTimeWorkerId: null,
            dTimeWorkerId: null,
            eTimeWorkerId: null,
          };
    }
    return map;
  }, [weekDates, existingSchedules]);

  function saveSchedule(dateStr: string, updates: Partial<ScheduleRow>, workerDefaultTimes?: { slot: "a" | "b" | "c" | "d" | "e"; startTime?: string; endTime?: string }) {
    const current = scheduleMap[dateStr];
    if (!current) return;
    const row = { ...current, ...updates };
    upsertMutation.mutate({
      scheduleDate: row.scheduleDate,
      dayOfWeek: row.dayOfWeek,
      isOperating: row.isOperating,
      aTimeWorkerId: row.aTimeWorkerId,
      bTimeWorkerId: row.bTimeWorkerId,
      cTimeWorkerId: row.cTimeWorkerId,
      dTimeWorkerId: row.dTimeWorkerId ?? null,
      eTimeWorkerId: row.eTimeWorkerId ?? null,
    });
    // 알바생 기본 시간이 있으면 자동 세팅
    if (workerDefaultTimes && (workerDefaultTimes.startTime || workerDefaultTimes.endTime)) {
      updateTimeMutation.mutate({
        scheduleDate: dateStr,
        timeSlot: workerDefaultTimes.slot,
        startTime: workerDefaultTimes.startTime,
        endTime: workerDefaultTimes.endTime,
      });
    }
  }

  function handleUpdateTime(dateStr: string, timeSlot: "a" | "b" | "c" | "d" | "e", startTime?: string, endTime?: string) {
    updateTimeMutation.mutate({ scheduleDate: dateStr, timeSlot, startTime, endTime });
  }

  function handleAutoAssign() {
    autoAssignMutation.mutate({ startDate, endDate });
  }

  const weekLabel = useMemo(() => {
    const s = weekDates[0].date;
    const e = weekDates[6].date;
    return `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
  }, [weekDates]);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Master</h2>
            <p className="hidden sm:block text-sm text-muted-foreground">스케줄 관리 (관리자용)</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent"
              disabled={copyPrevWeekMutation.isPending}
              onClick={() => copyPrevWeekMutation.mutate({ startDate, endDate })}
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{copyPrevWeekMutation.isPending ? "복사 중..." : "전주 복사"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent"
              disabled={scheduleReadyMutation.isPending}
              onClick={() => scheduleReadyMutation.mutate({ startDate, endDate })}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{scheduleReadyMutation.isPending ? "발송 중..." : "알림"}</span>
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setAutoAssignDialogOpen(true)}
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">자동 배정</span>
            </Button>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setWeekOffset((p) => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">{weekLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setWeekOffset((p) => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Schedule Table */}
        <Card className="border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              {/* 슬롯 헤더 */}
              <thead>
                <tr className="border-b border-border/30">
                  <th className="w-24 p-2 text-left text-muted-foreground/50 font-normal"></th>
                  {(["a", "b", "c", "d", "e"] as const).map((slot) => (
                    <th key={slot} className="p-1.5 text-center min-w-[44px] max-w-[44px]">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                        slot === "a" ? "bg-primary/30 text-primary" : "bg-secondary text-secondary-foreground"
                      }`}>
                        {slot.toUpperCase()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 날짜별 행 */}
                {weekDates.map((d) => {
                  const row = scheduleMap[d.dateStr];
                  const isWeekend = WEEKEND_DAYS.includes(d.dayName);
                  const errors = row ? validateRow(row, workers) : [];
                  const hasErrors = errors.some((e) => e.type === "no_main" || e.type === "day_off");
                  const isOperating = row?.isOperating ?? true;

                  return (
                    <tr key={d.dateStr} className="border-b border-border/50 last:border-0">
                      {/* 날짜 + 스위치 */}
                      <th className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`text-sm font-bold ${isWeekend ? "text-primary" : "text-foreground/70"}`}>
                            {d.dayName}
                          </span>
                          <span className={`text-base font-bold ${hasErrors ? "text-destructive" : isWeekend ? "text-primary/80" : "text-foreground"}`}>
                            {d.date.getDate()}
                          </span>
                          <Switch
                            checked={isOperating}
                            onCheckedChange={(checked) => saveSchedule(d.dateStr, { isOperating: checked })}
                            className="scale-90 data-[state=checked]:bg-primary"
                          />
                        </div>
                      </th>
                      {/* A/B/C/D/E 슬롯 셀 */}
                      {(["a", "b", "c", "d", "e"] as const).map((slot) => {
                        const slotLabel = slot.toUpperCase();
                        const workerKey = `${slot}TimeWorkerId` as keyof ScheduleRow;
                        const startKey = `${slot}TimeStartTime` as keyof ScheduleRow;
                        const endKey = `${slot}TimeEndTime` as keyof ScheduleRow;
                        const defaultStart = DEFAULT_START[slot] ?? "18:00";

                        const workerId = (row?.[workerKey] as number | null) ?? null;
                        const worker = workers.find((w) => w.id === workerId);
                        const startTime = (row?.[startKey] as string | null) || defaultStart;
                        const endTime = (row?.[endKey] as string | null) || DEFAULT_END;
                        const hasSchedule = !!existingSchedules.find((s) => s.scheduleDate === d.dateStr);
                        const isViolation = isDayOffViolation(workerId, d.dayName, workers);

                        // C/D/E 타임: 평일은 배정 없고 미확장이면 + 버튼
                        const showCAdd = slot === "c" && !isWeekend && !workerId && !expandedCSlots.has(d.dateStr);
                        const showDAdd = slot === "d" && !workerId && !expandedDSlots.has(d.dateStr);
                        const showEAdd = slot === "e" && !workerId && !expandedESlots.has(d.dateStr);

                        if (!isOperating) {
                          return <td key={slot} className="p-1.5 text-center text-muted-foreground/20 text-sm">-</td>;
                        }

                        if (showCAdd || showDAdd || showEAdd) {
                          return (
                            <td key={slot} className="p-1.5 text-center">
                              <button
                                onClick={() => slot === "c"
                                  ? setExpandedCSlots((prev) => new Set(prev).add(d.dateStr))
                                  : slot === "e"
                                  ? setExpandedESlots((prev) => new Set(prev).add(d.dateStr))
                                  : setExpandedDSlots((prev) => new Set(prev).add(d.dateStr))
                                }
                                className="w-full flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground border border-dashed border-border/20 hover:border-border/50 rounded py-2.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={slot} className="p-1.5">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className={`w-full rounded px-1 py-2.5 text-center text-xs font-medium transition-colors border ${
                                  isViolation
                                    ? "bg-destructive/15 border-destructive/30 text-destructive"
                                    : workerId
                                    ? "bg-primary/10 border-primary/25 text-foreground hover:bg-primary/20"
                                    : "bg-secondary/30 border-border/20 text-muted-foreground/40 hover:bg-secondary/60"
                                }`}>
                                  {worker ? worker.name.slice(-2) : "+"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2 bg-card border-border" align="center" side="bottom">
                                <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">{d.dayName} {formatDate(d.dateStr)} · {slotLabel}타임</p>
                                {/* 알바생 선택 */}
                                <Select
                                  value={workerId ? String(workerId) : NONE_VALUE}
                                  onValueChange={(v) => {
                                    const id = v === NONE_VALUE ? null : Number(v);
                                    const w = workers.find((ww) => ww.id === id);
                                    saveSchedule(d.dateStr, { [workerKey]: id } as any, resolveWorkerTimesForSlot(w, slot));
                                    if (!id) {
                                      if (slot === "c" && !isWeekend) setExpandedCSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                      if (slot === "d") setExpandedDSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                      if (slot === "e") setExpandedESlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-secondary/50 mb-1.5">
                                    <SelectValue placeholder="알바생 선택" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-card border-border">
                                    <SelectItem value={NONE_VALUE} className="text-xs">미배정</SelectItem>
                                    {workers.filter((w) => w.isActive).map((w) => (
                                      <SelectItem key={w.id} value={String(w.id)} className="text-xs">
                                        {w.name}
                                        {isDayOffViolation(w.id, d.dayName, workers) && " ⚠️"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {/* 시간 선택 */}
                                <div className="flex items-center gap-1">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded border transition-colors ${
                                        hasSchedule ? "border-border/60 bg-secondary/30 hover:bg-secondary/60" : "border-border/20 text-muted-foreground cursor-not-allowed"
                                      }`} disabled={!hasSchedule}>
                                        <Clock className="w-3 h-3" />{startTime}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-32 p-1 bg-card border-border">
                                      <p className="text-[10px] text-muted-foreground px-1 py-0.5">출근</p>
                                      <div className="grid grid-cols-2 gap-0.5">
                                        {START_TIMES.map((t) => (
                                          <button key={t} onClick={() => handleUpdateTime(d.dateStr, slot, t, undefined)}
                                            className={`text-xs px-1 py-1 rounded transition-colors ${t === startTime ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{t}</button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <span className="text-muted-foreground/40">~</span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded border transition-colors ${
                                        hasSchedule ? "border-border/60 bg-secondary/30 hover:bg-secondary/60" : "border-border/20 text-muted-foreground cursor-not-allowed"
                                      }`} disabled={!hasSchedule}>
                                        <Clock className="w-3 h-3" />{endTime}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-32 p-1 bg-card border-border">
                                      <p className="text-[10px] text-muted-foreground px-1 py-0.5">퇴근</p>
                                      <div className="grid grid-cols-2 gap-0.5">
                                        {END_TIMES.map((t) => (
                                          <button key={t} onClick={() => handleUpdateTime(d.dateStr, slot, undefined, t)}
                                            className={`text-xs px-1 py-1 rounded transition-colors ${t === endTime ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{t}</button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                {/* C/D/E 제거 버튼 */}
                                {((slot === "c" && !isWeekend) || slot === "d" || slot === "e") && workerId && (
                                  <button
                                    onClick={() => {
                                      saveSchedule(d.dateStr, { [workerKey]: null } as any);
                                      if (slot === "c") setExpandedCSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                      if (slot === "d") setExpandedDSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                      if (slot === "e") setExpandedESlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                                    }}
                                    className="mt-1.5 w-full text-[10px] text-muted-foreground/50 hover:text-destructive flex items-center justify-center gap-1 transition-colors"
                                  >
                                    <X className="w-3 h-3" /> {slotLabel}타임 제거
                                  </button>
                                )}
                              </PopoverContent>
                            </Popover>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 유효성 에러 요약 */}
          {weekDates.some((d) => {
            const row = scheduleMap[d.dateStr];
            return row && validateRow(row, workers).some((e) => e.type === "no_main" || e.type === "day_off");
          }) && (
            <div className="border-t border-border/30 px-3 py-2 space-y-1">
              {weekDates.map((d) => {
                const row = scheduleMap[d.dateStr];
                if (!row) return null;
                const errors = validateRow(row, workers).filter((e) => e.type === "no_main" || e.type === "day_off");
                if (errors.length === 0) return null;
                return errors.map((err, i) => (
                  <div key={`${d.dateStr}-${i}`} className="flex items-center gap-1.5 text-[11px] text-destructive">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{d.dayName}{d.date.getDate()} · {err.message}</span>
                  </div>
                ));
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Auto-assign confirmation dialog */}
      <Dialog open={autoAssignDialogOpen} onOpenChange={setAutoAssignDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              자동 배정
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{weekLabel}</span> 주간 스케줄을 자동으로 배정합니다.
            </p>
            <p className="text-sm text-muted-foreground">
              알바생들의 선호 근무일과 고정 휴무를 반영하여 최적의 배정안을 생성합니다.
            </p>
            <p className="text-xs text-yellow-500">
              기존 배정 내용이 덮어씌워집니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setAutoAssignDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAutoAssign} disabled={autoAssignMutation.isPending} className="gap-1.5">
              <Wand2 className="w-4 h-4" />
              {autoAssignMutation.isPending ? "배정 중..." : "자동 배정 실행"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── TimeSlotRow ──────────────────────────────────────────────────────────────
function TimeSlotRow({
  label,
  timeSlot,
  startTime,
  endTime,
  workerId,
  workers,
  dayOfWeek,
  scheduleDate,
  hasSchedule,
  onWorkerChange,
  onTimeChange,
  onRemove,
}: {
  label: string;
  timeSlot: "a" | "b" | "c" | "d";
  startTime: string;
  endTime: string;
  workerId: number | null;
  workers: any[];
  dayOfWeek: string;
  scheduleDate: string;
  hasSchedule: boolean;
  onWorkerChange: (id: number | null) => void;
  onTimeChange: (dateStr: string, slot: "a" | "b" | "c" | "d", startTime?: string, endTime?: string) => void;
  onRemove?: () => void;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const isViolation = isDayOffViolation(workerId, dayOfWeek, workers);

  return (
    <div className="space-y-1">
      {/* 타임 라벨 + 시간 편집 */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 ${
            label === "A" ? "bg-primary/30 text-primary" : "bg-secondary text-secondary-foreground"
          }`}
        >
          {label}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="C타임 제거"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* 출근 시간 선택 */}
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                hasSchedule
                  ? "border-border/60 bg-secondary/30 hover:bg-secondary/60 text-foreground cursor-pointer"
                  : "border-border/30 bg-muted/20 text-muted-foreground cursor-not-allowed"
              }`}
              disabled={!hasSchedule}
              title={hasSchedule ? "출근 시간 수정" : "먼저 알바생을 배정하세요"}
            >
              <Clock className="w-3 h-3" />
              <span>{startTime}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1 bg-card border-border" align="start">
            <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">출근 시간</p>
            <div className="grid grid-cols-2 gap-0.5">
              {START_TIMES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onTimeChange(scheduleDate, timeSlot, t, undefined);
                    setStartOpen(false);
                  }}
                  className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
                    t === startTime
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-[10px] text-muted-foreground">~</span>

        {/* 퇴근 시간 선택 */}
        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                hasSchedule
                  ? "border-border/60 bg-secondary/30 hover:bg-secondary/60 text-foreground cursor-pointer"
                  : "border-border/30 bg-muted/20 text-muted-foreground cursor-not-allowed"
              }`}
              disabled={!hasSchedule}
              title={hasSchedule ? "퇴근 시간 수정" : "먼저 알바생을 배정하세요"}
            >
              <Clock className="w-3 h-3" />
              <span>{endTime}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1 bg-card border-border" align="start">
            <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">퇴근 시간</p>
            <div className="grid grid-cols-2 gap-0.5">
              {END_TIMES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onTimeChange(scheduleDate, timeSlot, undefined, t);
                    setEndOpen(false);
                  }}
                  className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
                    t === endTime
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 알바생 선택 드롭다운 */}
      <Select
        value={workerId ? String(workerId) : NONE_VALUE}
        onValueChange={(v) => onWorkerChange(v === NONE_VALUE ? null : Number(v))}
      >
        <SelectTrigger
          className={`h-8 text-xs ml-7 ${
            isViolation
              ? "bg-destructive/20 border-destructive/50 text-destructive"
              : "bg-secondary/50"
          }`}
        >
          <SelectValue placeholder="미배정" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>미배정</SelectItem>
          {workers.map((w) => {
            const daysOff = (w.fixedDaysOff || "").split(",").filter(Boolean);
            const restricted = daysOff.includes(dayOfWeek);
            return (
              <SelectItem key={w.id} value={String(w.id)}>
                <span className={restricted ? "text-destructive" : ""}>
                  {w.name}
                  {w.skillLevel === "main" ? " (메인)" : w.skillLevel === "trainee" ? " (수습)" : " (서브)"}
                  {restricted ? " - 근무불가" : ""}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

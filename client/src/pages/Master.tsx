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
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Wand2, Clock, Plus, X } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];
const NONE_VALUE = "__none__";

const START_TIMES = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
const END_TIMES = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];

// 기본 출근/퇴근 시간
const DEFAULT_START: Record<string, string> = { a: "17:30", b: "18:00", c: "18:00" };
const DEFAULT_END = "22:00";

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
  aTimeStartTime?: string | null;
  bTimeStartTime?: string | null;
  cTimeStartTime?: string | null;
  dTimeStartTime?: string | null;
  aTimeEndTime?: string | null;
  bTimeEndTime?: string | null;
  cTimeEndTime?: string | null;
  dTimeEndTime?: string | null;
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

export default function Master() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [autoAssignDialogOpen, setAutoAssignDialogOpen] = useState(false);
  const [expandedCSlots, setExpandedCSlots] = useState<Set<string>>(new Set());
  const [expandedDSlots, setExpandedDSlots] = useState<Set<string>>(new Set());
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
            aTimeEndTime: (existing as any).aTimeEndTime,
            bTimeEndTime: (existing as any).bTimeEndTime,
            cTimeEndTime: (existing as any).cTimeEndTime,
            dTimeEndTime: (existing as any).dTimeEndTime,
            dTimeWorkerId: (existing as any).dTimeWorkerId ?? null,
          }
        : {
            scheduleDate: d.dateStr,
            dayOfWeek: d.dayName,
            isOperating: true,
            aTimeWorkerId: null,
            bTimeWorkerId: null,
            cTimeWorkerId: null,
            dTimeWorkerId: null,
          };
    }
    return map;
  }, [weekDates, existingSchedules]);

  function saveSchedule(dateStr: string, updates: Partial<ScheduleRow>, workerDefaultTimes?: { slot: "a" | "b" | "c" | "d"; startTime?: string; endTime?: string }) {
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

  function handleUpdateTime(dateStr: string, timeSlot: "a" | "b" | "c" | "d", startTime?: string, endTime?: string) {
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Master</h2>
            <p className="text-sm text-muted-foreground">스케줄 관리 (관리자용)</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setAutoAssignDialogOpen(true)}
          >
            <Wand2 className="w-4 h-4" />
            자동 배정
          </Button>
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

        {/* Schedule rows */}
        <div className="space-y-2">
          {weekDates.map((d) => {
            const row = scheduleMap[d.dateStr];
            if (!row) return null;
            const isWeekend = WEEKEND_DAYS.includes(d.dayName);
            const errors = validateRow(row, workers);
            const hasErrors = errors.some((e) => e.type === "no_main" || e.type === "day_off");

            return (
              <Card
                key={d.dateStr}
                className={`border-border transition-colors ${
                  !row.isOperating
                    ? "opacity-50 bg-muted/30"
                    : hasErrors
                    ? "border-destructive/50 bg-destructive/5"
                    : "bg-card"
                }`}
              >
                <CardContent className="p-3 space-y-2.5">
                  {/* Date header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center ${
                          isWeekend ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {d.dayName}
                      </span>
                      <span className="text-sm font-medium">{formatDate(d.dateStr)}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
                        {isWeekend ? "주말" : "평일"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {row.isOperating ? "운영" : "휴무"}
                      </span>
                      <Switch
                        checked={row.isOperating}
                        onCheckedChange={(checked) => saveSchedule(d.dateStr, { isOperating: checked })}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>

                  {/* Time slots */}
                  {row.isOperating && (
                    <div className="space-y-2">
                      <TimeSlotRow
                        label="A"
                        timeSlot="a"
                        startTime={row.aTimeStartTime || DEFAULT_START.a}
                        endTime={row.aTimeEndTime || DEFAULT_END}
                        workerId={row.aTimeWorkerId}
                        workers={workers}
                        dayOfWeek={d.dayName}
                        scheduleDate={d.dateStr}
                        hasSchedule={!!existingSchedules.find((s) => s.scheduleDate === d.dateStr)}
                        onWorkerChange={(id) => {
                          const w = workers.find((w) => w.id === id);
                          saveSchedule(d.dateStr, { aTimeWorkerId: id }, w?.defaultStartTime || w?.defaultEndTime ? { slot: "a", startTime: w.defaultStartTime ?? undefined, endTime: w.defaultEndTime ?? undefined } : undefined);
                        }}
                        onTimeChange={handleUpdateTime}
                      />
                      <TimeSlotRow
                        label="B"
                        timeSlot="b"
                        startTime={row.bTimeStartTime || DEFAULT_START.b}
                        endTime={row.bTimeEndTime || DEFAULT_END}
                        workerId={row.bTimeWorkerId}
                        workers={workers}
                        dayOfWeek={d.dayName}
                        scheduleDate={d.dateStr}
                        hasSchedule={!!existingSchedules.find((s) => s.scheduleDate === d.dateStr)}
                        onWorkerChange={(id) => {
                          const w = workers.find((w) => w.id === id);
                          saveSchedule(d.dateStr, { bTimeWorkerId: id }, w?.defaultStartTime || w?.defaultEndTime ? { slot: "b", startTime: w.defaultStartTime ?? undefined, endTime: w.defaultEndTime ?? undefined } : undefined);
                        }}
                        onTimeChange={handleUpdateTime}
                      />
                      {/* C타임: 금/토 기본 표시, 평일은 + 버튼 */}
                      {isWeekend || row.cTimeWorkerId || expandedCSlots.has(d.dateStr) ? (
                        <TimeSlotRow
                          label="C"
                          timeSlot="c"
                          startTime={row.cTimeStartTime || DEFAULT_START.c}
                          endTime={row.cTimeEndTime || DEFAULT_END}
                          workerId={row.cTimeWorkerId}
                          workers={workers}
                          dayOfWeek={d.dayName}
                          scheduleDate={d.dateStr}
                          hasSchedule={!!existingSchedules.find((s) => s.scheduleDate === d.dateStr)}
                          onWorkerChange={(id) => {
                            const w = workers.find((w) => w.id === id);
                            saveSchedule(d.dateStr, { cTimeWorkerId: id }, w?.defaultStartTime || w?.defaultEndTime ? { slot: "c", startTime: w.defaultStartTime ?? undefined, endTime: w.defaultEndTime ?? undefined } : undefined);
                            if (!id && !isWeekend) setExpandedCSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                          }}
                          onTimeChange={handleUpdateTime}
                          onRemove={!isWeekend ? () => {
                            saveSchedule(d.dateStr, { cTimeWorkerId: null });
                            setExpandedCSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                          } : undefined}
                        />
                      ) : (
                        <button
                          onClick={() => setExpandedCSlots((prev) => new Set(prev).add(d.dateStr))}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-border rounded-md px-2 py-1.5 w-full transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          C타임 추가
                        </button>
                      )}

                      {/* D타임: 모든 요일에 수습 추가 슬롯 */}
                      {row.dTimeWorkerId || expandedDSlots.has(d.dateStr) ? (
                        <TimeSlotRow
                          label="D"
                          timeSlot="d"
                          startTime={row.dTimeStartTime || "18:00"}
                          endTime={row.dTimeEndTime || "21:00"}
                          workerId={row.dTimeWorkerId ?? null}
                          workers={workers}
                          dayOfWeek={d.dayName}
                          scheduleDate={d.dateStr}
                          hasSchedule={!!existingSchedules.find((s) => s.scheduleDate === d.dateStr)}
                          onWorkerChange={(id) => {
                            const w = workers.find((w) => w.id === id);
                            saveSchedule(d.dateStr, { dTimeWorkerId: id }, w?.defaultStartTime || w?.defaultEndTime ? { slot: "d", startTime: w.defaultStartTime ?? undefined, endTime: w.defaultEndTime ?? undefined } : undefined);
                            if (!id) setExpandedDSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                          }}
                          onTimeChange={handleUpdateTime}
                          onRemove={() => {
                            saveSchedule(d.dateStr, { dTimeWorkerId: null });
                            setExpandedDSlots((prev) => { const next = new Set(prev); next.delete(d.dateStr); return next; });
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setExpandedDSlots((prev) => new Set(prev).add(d.dateStr))}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-border rounded-md px-2 py-1.5 w-full transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          수습 추가
                        </button>
                      )}
                    </div>
                  )}

                  {/* Validation errors */}
                  {row.isOperating && errors.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      {errors.map((err, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-1.5 text-[11px] ${
                            err.type === "no_main" || err.type === "day_off"
                              ? "text-destructive"
                              : "text-yellow-500"
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{err.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All good indicator */}
                  {row.isOperating && errors.length === 0 &&
                    (row.aTimeWorkerId || row.bTimeWorkerId) && (
                      <div className="flex items-center gap-1.5 text-[11px] text-green-500 pt-1 border-t border-border/50">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>정상 배정</span>
                      </div>
                    )}
                </CardContent>
              </Card>
            );
          })}
        </div>
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

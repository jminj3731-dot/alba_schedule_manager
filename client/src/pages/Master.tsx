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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];
const NONE_VALUE = "__none__";

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
}

function validateRow(
  row: ScheduleRow,
  workers: any[]
): { type: string; message: string }[] {
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

  const isWeekend = WEEKEND_DAYS.includes(row.dayOfWeek);
  const required = isWeekend ? 3 : 2;
  if (assigned.length > 0 && assigned.length < required) {
    errors.push({ type: "info", message: `${isWeekend ? "주말" : "평일"} ${required}명 필요 (현재 ${assigned.length}명)` });
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
          }
        : {
            scheduleDate: d.dateStr,
            dayOfWeek: d.dayName,
            isOperating: true,
            aTimeWorkerId: null,
            bTimeWorkerId: null,
            cTimeWorkerId: null,
          };
    }
    return map;
  }, [weekDates, existingSchedules]);

  function saveSchedule(dateStr: string, updates: Partial<ScheduleRow>) {
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
    });
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
                        {isWeekend ? "주말 3명" : "평일 2명"}
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
                    <div className="space-y-1.5">
                      <TimeSlotSelect
                        label="A타임"
                        time="17:30~22:00"
                        value={row.aTimeWorkerId}
                        workers={workers}
                        dayOfWeek={d.dayName}
                        onChange={(id) => saveSchedule(d.dateStr, { aTimeWorkerId: id })}
                      />
                      <TimeSlotSelect
                        label="B타임"
                        time="18:00~22:00"
                        value={row.bTimeWorkerId}
                        workers={workers}
                        dayOfWeek={d.dayName}
                        onChange={(id) => saveSchedule(d.dateStr, { bTimeWorkerId: id })}
                      />
                      {isWeekend && (
                        <TimeSlotSelect
                          label="C타임"
                          time="18:00~22:00"
                          value={row.cTimeWorkerId}
                          workers={workers}
                          dayOfWeek={d.dayName}
                          onChange={(id) => saveSchedule(d.dateStr, { cTimeWorkerId: id })}
                        />
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
                    [row.aTimeWorkerId, row.bTimeWorkerId, row.cTimeWorkerId].some(Boolean) && (
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

function TimeSlotSelect({
  label,
  time,
  value,
  workers,
  dayOfWeek,
  onChange,
}: {
  label: string;
  time: string;
  value: number | null;
  workers: any[];
  dayOfWeek: string;
  onChange: (id: number | null) => void;
}) {
  const isViolation = isDayOffViolation(value, dayOfWeek, workers);

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 shrink-0">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground block">{time}</span>
      </div>
      <Select
        value={value ? String(value) : NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? null : Number(v))}
      >
        <SelectTrigger
          className={`h-9 text-xs flex-1 ${
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
                  {w.skillLevel === "main" ? " (메인)" : " (서브)"}
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

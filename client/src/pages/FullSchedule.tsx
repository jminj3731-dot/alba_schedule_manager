import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Coffee,
  Users,
  AlertTriangle,
} from "lucide-react";
import { useLocation } from "wouter";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];

function getWeekDates(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + offset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    dates.push({
      date: d,
      dateStr: d.toISOString().split("T")[0],
      dayName: DAY_NAMES[d.getDay()],
    });
  }
  return dates;
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split("T")[0];
}

export default function FullSchedule() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [, navigate] = useLocation();

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const startDate = weekDates[0].dateStr;
  const endDate = weekDates[6].dateStr;

  const { data: workers = [] } = trpc.workers.list.useQuery();
  const { data: schedules = [] } = trpc.schedules.getByDateRange.useQuery({ startDate, endDate });

  const weekLabel = useMemo(() => {
    const s = weekDates[0].date;
    const e = weekDates[6].date;
    return `${s.getFullYear()}. ${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
  }, [weekDates]);

  // 날짜별 스케줄 맵
  const scheduleMap = useMemo(() => {
    const map: Record<string, typeof schedules[0]> = {};
    schedules.forEach((s) => { map[s.scheduleDate] = s; });
    return map;
  }, [schedules]);

  // 워커 맵
  const workerMap = useMemo(() => {
    const map: Record<number, typeof workers[0]> = {};
    workers.forEach((w) => { map[w.id] = w; });
    return map;
  }, [workers]);

  function getWorkerName(id: number | null) {
    if (!id) return null;
    return workerMap[id]?.name ?? null;
  }

  function getWorkerSkill(id: number | null) {
    if (!id) return null;
    return workerMap[id]?.skillLevel ?? null;
  }

  function hasMainWorker(schedule: typeof schedules[0]) {
    const ids = [schedule.aTimeWorkerId, schedule.bTimeWorkerId, schedule.cTimeWorkerId].filter(Boolean);
    return ids.some((id) => workerMap[id!]?.skillLevel === "main");
  }

  function isRestrictedAssignment(schedule: typeof schedules[0]) {
    // 정우주가 목요일 또는 일요일에 배치된 경우
    const wooJuWorker = workers.find((w) => w.name === "정우주");
    if (!wooJuWorker) return false;
    const dayName = schedule.dayOfWeek?.trim();
    // 목요일(목) 또는 일요일(일)에만 경고 표시
    if (dayName !== "목" && dayName !== "일") {
      return false;
    }
    // 정우주가 이 날짜에 배치되었는지 확인
    const isAssigned = (
      schedule.aTimeWorkerId === wooJuWorker.id ||
      schedule.bTimeWorkerId === wooJuWorker.id ||
      schedule.cTimeWorkerId === wooJuWorker.id
    );
    return isAssigned;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-primary">전체</span>
              <span className="ml-1">스케줄</span>
            </h1>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary text-xs gap-1">
            <Users className="w-3 h-3" />
            {workers.length}명
          </Badge>
        </div>
      </header>

      <main className="flex-1 container py-4 pb-8">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-transparent"
              onClick={() => setWeekOffset((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium">{weekLabel}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-transparent"
              onClick={() => setWeekOffset((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* 날짜별 카드 */}
          <div className="space-y-3">
            {weekDates.map((d) => {
              const schedule = scheduleMap[d.dateStr];
              const isWeekend = WEEKEND_DAYS.includes(d.dayName);
              const today = isToday(d.dateStr);
              const isOff = schedule && !schedule.isOperating;
              const noSchedule = !schedule;
              const hasError = schedule && schedule.isOperating && !hasMainWorker(schedule);
              const hasWarning = schedule && schedule.isOperating && isRestrictedAssignment(schedule);

              if (isOff) {
                return (
                  <Card key={d.dateStr} className="bg-muted/20 border-border/50 opacity-60">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} variant="off" />
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Coffee className="w-4 h-4" />
                          <span className="text-sm">휴무일</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              if (noSchedule) {
                return (
                  <Card key={d.dateStr} className="bg-card border-border/50">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} variant="normal" />
                        <span className="text-sm text-muted-foreground">스케줄 미등록</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const slots = [
                { label: "A", time: "17:30~22:00", workerId: schedule.aTimeWorkerId },
                { label: "B", time: "18:00~22:00", workerId: schedule.bTimeWorkerId },
                ...(isWeekend ? [{ label: "C", time: "18:00~22:00", workerId: schedule.cTimeWorkerId }] : []),
              ];

              return (
                <Card
                  key={d.dateStr}
                  className={`border transition-all ${
                    hasError
                      ? "border-destructive/60 bg-destructive/5"
                      : hasWarning
                      ? "border-yellow-500/60 bg-yellow-500/5"
                      : today
                      ? "border-primary/40 bg-card"
                      : "border-border bg-card"
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <DayBadge
                        dayName={d.dayName}
                        date={d.date}
                        isWeekend={isWeekend}
                        isToday={today}
                        variant={hasError ? "error" : "normal"}
                      />
                      <div className="flex-1 space-y-2">
                        {/* 경고 메시지 */}
                        {hasError && (
                          <div className="flex items-center gap-1.5 text-destructive text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>메인 숙련자 없음 — 오류 확인 필요</span>
                          </div>
                        )}
                        {hasWarning && !hasError && (
                          <div className="flex items-center gap-1.5 text-yellow-500 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>정우주 근무 제한 요일 배치</span>
                          </div>
                        )}

                        {/* 타임별 배치 */}
                        <div className="space-y-1.5">
                          {slots.map((slot) => {
                            const name = getWorkerName(slot.workerId);
                            const skill = getWorkerSkill(slot.workerId);
                            const isMain = skill === "main";
                            const isEmpty = !name;

                            return (
                              <div key={slot.label} className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 ${
                                    isMain
                                      ? "bg-primary text-primary-foreground"
                                      : isEmpty
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-secondary text-secondary-foreground"
                                  }`}
                                >
                                  {slot.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground w-20 shrink-0">
                                  {slot.time}
                                </span>
                                {isEmpty ? (
                                  <span className="text-xs text-muted-foreground/50">미배정</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium">{name}</span>
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] px-1 py-0 h-4 ${
                                        isMain
                                          ? "border-primary/50 text-primary"
                                          : "border-border text-muted-foreground"
                                      }`}
                                    >
                                      {isMain ? "메인" : "서브"}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 총 인원 */}
                        <div className="flex items-center gap-1 pt-0.5">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            총 {slots.filter((s) => s.workerId).length}명 근무
                            {isWeekend ? " (주말)" : " (평일)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 범례 */}
          <Card className="bg-card border-border/50">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium mb-2">범례</p>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary text-primary-foreground">A</span>
                  <span>A타임 17:30~22:00</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-secondary text-secondary-foreground">B</span>
                  <span>B타임 18:00~22:00</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                  <span>메인 부재 오류</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  <span>배치 제한 경고</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function DayBadge({
  dayName,
  date,
  isWeekend,
  isToday,
  variant,
}: {
  dayName: string;
  date: Date;
  isWeekend: boolean;
  isToday: boolean;
  variant: "normal" | "off" | "error";
}) {
  const base = "flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0";
  const cls =
    variant === "error"
      ? `${base} bg-destructive/20 text-destructive`
      : variant === "off"
      ? `${base} bg-muted/30 text-muted-foreground`
      : isToday
      ? `${base} bg-secondary text-secondary-foreground ring-1 ring-primary/30`
      : isWeekend
      ? `${base} bg-primary/15 text-primary`
      : `${base} bg-secondary text-secondary-foreground`;

  return (
    <div className={cls}>
      <span className="text-[10px] font-medium">{dayName}</span>
      <span className="text-sm font-bold">{date.getDate()}</span>
    </div>
  );
}

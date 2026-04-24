import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, List, ChevronLeft, ChevronRight, Clock, User, Coffee } from "lucide-react";

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

export default function WorkerView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"calendar" | "card">("card");
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const startDate = weekDates[0].dateStr;
  const endDate = weekDates[6].dateStr;

  const { data: workers = [] } = trpc.workers.list.useQuery();
  const { data: schedules = [] } = trpc.schedules.getByDateRange.useQuery({ startDate, endDate });

  const getWorkerName = (id: number | null) => {
    if (!id) return null;
    return workers.find((w) => w.id === id);
  };

  const weekLabel = useMemo(() => {
    const s = weekDates[0].date;
    const e = weekDates[6].date;
    return `${s.getFullYear()}. ${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
  }, [weekDates]);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold">Worker View</h2>
          <p className="text-sm text-muted-foreground">이번 주 스케줄 확인</p>
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

        {/* View mode toggle */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "calendar" | "card")}>
          <TabsList className="w-full bg-secondary/50">
            <TabsTrigger value="card" className="flex-1 gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <List className="w-3.5 h-3.5" />
              카드 뷰
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-1 gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CalendarDays className="w-3.5 h-3.5" />
              달력 뷰
            </TabsTrigger>
          </TabsList>

          {/* Card View */}
          <TabsContent value="card" className="mt-3 space-y-2">
            {weekDates.map((d) => {
              const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
              const isWeekend = WEEKEND_DAYS.includes(d.dayName);
              const today = isToday(d.dateStr);

              if (schedule && !schedule.isOperating) {
                return (
                  <Card key={d.dateStr} className="bg-muted/20 border-border/50 opacity-60">
                    <CardContent className="p-3 flex items-center gap-3">
                      <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} />
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Coffee className="w-4 h-4" />
                        <span className="text-sm">휴무</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const aWorker = getWorkerName(schedule?.aTimeWorkerId ?? null);
              const bWorker = getWorkerName(schedule?.bTimeWorkerId ?? null);
              const cWorker = getWorkerName(schedule?.cTimeWorkerId ?? null);
              const dWorker = getWorkerName((schedule as any)?.dTimeWorkerId ?? null);
              const eWorker = getWorkerName((schedule as any)?.eTimeWorkerId ?? null);

              return (
                <Card
                  key={d.dateStr}
                  className={`border-border transition-all ${
                    today ? "border-primary/50 bg-primary/5" : "bg-card"
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} />
                      <div className="flex-1 space-y-1.5">
                        {/* A Time */}
                        <TimeSlotBadge
                          label="A"
                          time="17:30~22:00"
                          worker={aWorker}
                        />
                        {/* B Time */}
                        <TimeSlotBadge
                          label="B"
                          time="18:00~22:00"
                          worker={bWorker}
                        />
                        {/* C Time (weekend only) */}
                        {isWeekend && (
                          <TimeSlotBadge
                            label="C"
                            time="18:00~22:00"
                            worker={cWorker}
                          />
                        )}
                        {/* D/E Time (optional) */}
                        {dWorker && (
                          <TimeSlotBadge
                            label="D"
                            time={`${(schedule as any)?.dTimeStartTime || "18:00"}~${(schedule as any)?.dTimeEndTime || "21:00"}`}
                            worker={dWorker}
                          />
                        )}
                        {eWorker && (
                          <TimeSlotBadge
                            label="E"
                            time={`${(schedule as any)?.eTimeStartTime || "18:00"}~${(schedule as any)?.eTimeEndTime || "21:00"}`}
                            worker={eWorker}
                          />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Calendar View */}
          <TabsContent value="calendar" className="mt-3">
            <Card className="bg-card border-border">
              <CardContent className="p-3">
                {/* Calendar header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAY_NAMES.map((day) => (
                    <div
                      key={day}
                      className={`text-center text-[10px] font-medium py-1 ${
                        day === "일" ? "text-destructive" : day === "토" ? "text-blue-400" : "text-muted-foreground"
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                {/* Calendar body */}
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map((d) => {
                    const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
                    const today = isToday(d.dateStr);
                    const isOff = schedule && !schedule.isOperating;

                    const aW = getWorkerName(schedule?.aTimeWorkerId ?? null);
                    const bW = getWorkerName(schedule?.bTimeWorkerId ?? null);
                    const cW = getWorkerName(schedule?.cTimeWorkerId ?? null);
                    const dW = getWorkerName((schedule as any)?.dTimeWorkerId ?? null);
                    const eW = getWorkerName((schedule as any)?.eTimeWorkerId ?? null);

                    return (
                      <div
                        key={d.dateStr}
                        className={`rounded-lg p-1.5 min-h-[80px] text-center border transition-colors ${
                          today
                            ? "border-primary/60 bg-primary/10"
                            : isOff
                            ? "border-border/30 bg-muted/20 opacity-50"
                            : "border-border/30 bg-secondary/20"
                        }`}
                      >
                        <div
                          className={`text-xs font-bold mb-1 ${
                            today ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {d.date.getDate()}
                        </div>
                        {isOff ? (
                          <span className="text-[9px] text-muted-foreground">휴무</span>
                        ) : (
                          <div className="space-y-0.5">
                            {aW && (
                              <div className="text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary truncate">
                                {aW.name}
                              </div>
                            )}
                            {bW && (
                              <div className="text-[9px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground truncate">
                                {bW.name}
                              </div>
                            )}
                            {cW && (
                              <div className="text-[9px] px-1 py-0.5 rounded bg-accent text-accent-foreground truncate">
                                {cW.name}
                              </div>
                            )}
                            {dW && (
                              <div className="text-[9px] px-1 py-0.5 rounded bg-secondary/80 text-secondary-foreground truncate">
                                {dW.name}
                              </div>
                            )}
                            {eW && (
                              <div className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground truncate">
                                {eW.name}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary/15" />
                <span className="text-[10px] text-muted-foreground">A타임</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-secondary" />
                <span className="text-[10px] text-muted-foreground">B타임</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-accent" />
                <span className="text-[10px] text-muted-foreground">C타임</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function DayBadge({
  dayName,
  date,
  isWeekend,
  isToday,
}: {
  dayName: string;
  date: Date;
  isWeekend: boolean;
  isToday: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
        isToday
          ? "bg-primary text-primary-foreground"
          : isWeekend
          ? "bg-primary/15 text-primary"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      <span className="text-[10px] font-medium">{dayName}</span>
      <span className="text-sm font-bold">{date.getDate()}</span>
    </div>
  );
}

function TimeSlotBadge({
  label,
  time,
  worker,
}: {
  label: string;
  time: string;
  worker: any;
}) {
  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 shrink-0 w-7 justify-center ${
          label === "A"
            ? "border-primary/50 text-primary"
            : "border-border text-muted-foreground"
        }`}
      >
        {label}
      </Badge>
      <div className="flex items-center gap-1.5 flex-1">
        {worker ? (
          <>
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium">{worker.name}</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                worker.skillLevel === "main"
                  ? "border-primary/40 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {worker.skillLevel === "main" ? "메인" : "서브"}
            </Badge>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">미배정</span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}

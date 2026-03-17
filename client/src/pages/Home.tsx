import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  User,
  Coffee,
  Clock,
  Search,
  Lock,
  LogOut,
  CalendarCheck,
  Users,
  Pencil,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];
const ADMIN_PASSWORD = "대한한우";

function roundTimeToNearest30Min(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  let roundedMinutes = minutes;
  let roundedHours = hours;
  if (minutes < 15) {
    roundedMinutes = 0;
  } else if (minutes < 45) {
    roundedMinutes = 30;
  } else {
    roundedMinutes = 0;
    roundedHours = (hours + 1) % 24;
  }
  return `${String(roundedHours).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

function getCurrentTimeStr(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDates(offset: number) {
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

function isToday(dateStr: string) {
  return dateStr === toLocalDateStr(new Date());
}

export default function Home() {
  const [workerName, setWorkerName] = useState("");
  const [loggedInName, setLoggedInName] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"card" | "calendar">("card");
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [prefDialogOpen, setPrefDialogOpen] = useState(false);
  const [prefDays, setPrefDays] = useState<string[]>([]);
  const [, navigate] = useLocation();

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const startDate = weekDates[0].dateStr;
  const endDate = weekDates[6].dateStr;

  const { data: workers = [] } = trpc.workers.list.useQuery();
  const { data: schedules = [] } = trpc.schedules.getByDateRange.useQuery({ startDate, endDate });
  const utils = trpc.useUtils();

  const notifyScheduleViewMutation = trpc.notifications.notifyScheduleView.useMutation();
  const notifyPreferredDaysUpdateMutation = trpc.notifications.notifyPreferredDaysUpdate.useMutation();
  const createActivityLogMutation = trpc.activityLogs.create.useMutation();

  const updateEndTimeMutation = trpc.schedules.updateEndTime.useMutation({
    onSuccess: (_data, variables) => {
      utils.schedules.getByDateRange.invalidate();
      toast.success("퇴근 시간이 수정되었습니다.");
      if (loggedInName) {
        const worker = workers.find((w) => w.name === loggedInName);
        const actualTimeStr = variables.actualEndTime || variables.endTime;
        createActivityLogMutation.mutate({
          workerId: worker?.id ?? null,
          workerName: loggedInName,
          actionType: "end_time_update",
          description: `${loggedInName}님이 ${variables.scheduleDate} ${variables.timeSlot.toUpperCase()}타임 실제 퇴근 시간 ${actualTimeStr}을 직접 입력하여 ${variables.endTime}으로 기록되었습니다.`,
          metadata: JSON.stringify({ scheduleDate: variables.scheduleDate, timeSlot: variables.timeSlot, actualEndTime: actualTimeStr, displayEndTime: variables.endTime }),
        });
      }
    },
    onError: () => {
      toast.error("퇴근 시간 수정에 실패했습니다.");
    },
  });

  const END_TIMES = [
    "19:00", "19:30", "20:00", "20:30",
    "21:00", "21:30", "22:00", "22:30",
    "23:00", "23:30",
  ];

  const updateMutation = trpc.workers.update.useMutation({
    onSuccess: () => {
      utils.workers.list.invalidate();
      toast.success("선호 근무일이 저장되었습니다.");
      if (currentWorker) {
        notifyPreferredDaysUpdateMutation.mutate({
          workerId: currentWorker.id,
          workerName: currentWorker.name,
          preferredDays: prefDays.join(","),
        });
        const daysStr = prefDays.length > 0 ? prefDays.join(", ") : "없음";
        createActivityLogMutation.mutate({
          workerId: currentWorker.id,
          workerName: currentWorker.name,
          actionType: "preferred_days_update",
          description: `${currentWorker.name}님이 선호 근무일을 변경했습니다: ${daysStr}`,
          metadata: JSON.stringify({ preferredDays: prefDays }),
        });
      }
      setPrefDialogOpen(false);
    },
  });

  const currentWorker = useMemo(() => {
    if (!loggedInName) return null;
    return workers.find((w) => w.name === loggedInName) || null;
  }, [loggedInName, workers]);

  const mySchedules = useMemo(() => {
    if (!currentWorker) return [];
    return schedules.filter(
      (s) =>
        s.isOperating &&
        (s.aTimeWorkerId === currentWorker.id ||
          s.bTimeWorkerId === currentWorker.id ||
          s.cTimeWorkerId === currentWorker.id)
    );
  }, [currentWorker, schedules]);

  function getMyTimeSlot(schedule: any) {
    if (!currentWorker) return null;
    if (schedule.aTimeWorkerId === currentWorker.id) {
      const startTime = schedule.aTimeStartTime || "17:30";
      const endTime = schedule.aTimeEndTime || "22:00";
      return { label: "A", slot: "a" as const, startTime, endTime, time: `${startTime}~${endTime}` };
    }
    if (schedule.bTimeWorkerId === currentWorker.id) {
      const startTime = schedule.bTimeStartTime || "18:00";
      const endTime = schedule.bTimeEndTime || "22:00";
      return { label: "B", slot: "b" as const, startTime, endTime, time: `${startTime}~${endTime}` };
    }
    if (schedule.cTimeWorkerId === currentWorker.id) {
      const startTime = schedule.cTimeStartTime || "18:00";
      const endTime = schedule.cTimeEndTime || "22:00";
      return { label: "C", slot: "c" as const, startTime, endTime, time: `${startTime}~${endTime}` };
    }
    return null;
  }

  function handleLogin() {
    const name = workerName.trim();
    if (!name) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    const found = workers.find((w) => w.name === name);
    if (!found) {
      toast.error("등록된 알바생이 아닙니다.");
      return;
    }
    setLoggedInName(name);
    setPrefDays(found.preferredDays ? found.preferredDays.split(",").filter(Boolean) : []);
    if (name !== "전민서") {
      notifyScheduleViewMutation.mutate({
        workerId: found.id,
        workerName: name,
      });
    }
  }

  function handleLogout() {
    setLoggedInName(null);
    setWorkerName("");
    setWeekOffset(0);
  }

  function handleAdminAccess() {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminDialogOpen(false);
      setAdminPassword("");
      navigate("/settings");
    } else {
      toast.error("비밀번호가 올바르지 않습니다.");
    }
  }

  function handleSavePreferredDays() {
    if (!currentWorker) return;
    updateMutation.mutate({
      id: currentWorker.id,
      preferredDays: prefDays.join(","),
    });
  }

  function togglePrefDay(day: string) {
    setPrefDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  const weekLabel = useMemo(() => {
    const s = weekDates[0].date;
    const e = weekDates[6].date;
    return `${s.getFullYear()}. ${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
  }, [weekDates]);

  // ========== 이름 입력 화면 ==========
  if (!loggedInName) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm space-y-8">
            {/* Logo */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="text-primary">ALBA</span> Schedule
              </h1>
              <p className="text-sm text-muted-foreground">
                이름을 입력하여 내 스케줄을 확인하세요
              </p>
            </div>

            {/* Name input */}
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="이름 입력 (예: 전민서)"
                  className="pl-10 h-12 bg-secondary/50 text-base"
                />
              </div>
              <Button onClick={handleLogin} className="w-full h-12 text-base gap-2">
                <Search className="w-4 h-4" />
                내 스케줄 확인
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/full-schedule")}
                className="w-full h-11 text-sm gap-2 bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
              >
                <Users className="w-4 h-4" />
                전체 스케줄 확인
              </Button>
            </div>

            {/* Hidden admin access - very subtle */}
            <div className="text-center pt-8">
              <button
                onClick={() => setAdminDialogOpen(true)}
                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                관리자
              </button>
            </div>
          </div>
        </div>

        {/* Admin password dialog */}
        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent className="sm:max-w-xs bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                관리자 인증
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdminAccess()}
                placeholder="비밀번호 입력"
                className="bg-secondary/50"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" className="bg-transparent" onClick={() => setAdminDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAdminAccess}>확인</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ========== 로그인 후 개인 스케줄 화면 ==========
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-primary">ALBA</span>
            <span className="ml-1">Schedule</span>
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary text-xs gap-1">
              <User className="w-3 h-3" />
              {loggedInName}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-4 pb-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Worker info card */}
          {currentWorker && (
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{currentWorker.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            currentWorker.skillLevel === "main"
                              ? "border-primary/50 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {currentWorker.skillLevel === "main" ? "메인" : "서브"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        이번 주 근무: {mySchedules.length}일
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 bg-transparent text-xs"
                    onClick={() => setPrefDialogOpen(true)}
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    선호 근무일
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "card" | "calendar")}>
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
                const isOff = schedule && !schedule.isOperating;
                const mySlot = schedule ? getMyTimeSlot(schedule) : null;
                const isMyDay = !!mySlot;

                if (isOff) {
                  return (
                    <Card key={d.dateStr} className="bg-muted/20 border-border/50 opacity-60">
                      <CardContent className="p-3 flex items-center gap-3">
                        <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} isMyDay={false} />
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Coffee className="w-4 h-4" />
                          <span className="text-sm">휴무</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <Card
                    key={d.dateStr}
                    className={`border-border transition-all ${
                      isMyDay
                        ? "border-primary/60 bg-primary/5"
                        : today
                        ? "border-border bg-card"
                        : "bg-card"
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <DayBadge dayName={d.dayName} date={d.date} isWeekend={isWeekend} isToday={today} isMyDay={isMyDay} />
                        <div className="flex-1">
                          {isMyDay && mySlot ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5">
                                {mySlot.label}타임
                              </Badge>
                              <span className="text-sm font-medium">{mySlot.time}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">근무 없음</span>
                          )}
                        </div>
                        {isMyDay && mySlot && schedule && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="퇴근 시간 수정"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2 bg-card border-border" align="end">
                              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">퇴근 시간 선택</p>
                              <div className="grid grid-cols-2 gap-1">
                                {END_TIMES.map((t) => (
                                  <button
                                    key={t}
                                    onClick={() => {
                                      const actualTime = getCurrentTimeStr();
                                      const roundedTime = roundTimeToNearest30Min(actualTime);
                                      updateEndTimeMutation.mutate({
                                        scheduleDate: d.dateStr,
                                        timeSlot: mySlot.slot,
                                        endTime: roundedTime,
                                        actualEndTime: actualTime,
                                      });
                                    }}
                                    className={`text-xs py-1.5 px-2 rounded-md transition-colors ${
                                      mySlot.endTime === t
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "hover:bg-primary/10 text-foreground"
                                    }`}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
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
                  <div className="grid grid-cols-7 gap-1">
                    {weekDates.map((d) => {
                      const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
                      const today = isToday(d.dateStr);
                      const isOff = schedule && !schedule.isOperating;
                      const mySlot = schedule ? getMyTimeSlot(schedule) : null;
                      const isMyDay = !!mySlot;

                      return (
                        <div
                          key={d.dateStr}
                          className={`rounded-lg p-1.5 min-h-[80px] text-center border transition-colors ${
                            isMyDay
                              ? "border-primary/60 bg-primary/10"
                              : today
                              ? "border-border bg-secondary/20"
                              : isOff
                              ? "border-border/30 bg-muted/20 opacity-50"
                              : "border-border/30 bg-secondary/20"
                          }`}
                        >
                          <div className={`text-xs font-bold mb-1 ${isMyDay ? "text-primary" : "text-foreground"}`}>
                            {d.date.getDate()}
                          </div>
                          {isOff ? (
                            <span className="text-[9px] text-muted-foreground">휴무</span>
                          ) : isMyDay && mySlot ? (
                            <div className="space-y-0.5">
                              <div className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-medium">
                                {mySlot.label}타임
                              </div>
                              <div className="text-[8px] text-muted-foreground">
                                {mySlot.time}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[9px] text-muted-foreground">-</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Hidden admin access at bottom */}
          <div className="text-center pt-4">
            <button
              onClick={() => setAdminDialogOpen(true)}
              className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors"
            >
              관리자
            </button>
          </div>
        </div>
      </main>

      {/* Admin password dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="sm:max-w-xs bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              관리자 인증
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminAccess()}
              placeholder="비밀번호 입력"
              className="bg-secondary/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setAdminDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAdminAccess}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preferred days dialog */}
      <Dialog open={prefDialogOpen} onOpenChange={setPrefDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" />
              선호 근무일 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              근무를 선호하는 요일을 선택하세요. 자동 배정 시 반영됩니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((day) => {
                const isOff = currentWorker?.fixedDaysOff?.split(",").filter(Boolean).includes(day);
                return (
                  <label
                    key={day}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                      isOff
                        ? "bg-muted/30 border-border/50 text-muted-foreground/50 cursor-not-allowed"
                        : prefDays.includes(day)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Checkbox
                      checked={prefDays.includes(day)}
                      onCheckedChange={() => !isOff && togglePrefDay(day)}
                      disabled={isOff}
                      className="hidden"
                    />
                    {day}
                    {isOff && <span className="text-[9px]">(휴무)</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setPrefDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSavePreferredDays} disabled={updateMutation.isPending}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayBadge({
  dayName,
  date,
  isWeekend,
  isToday,
  isMyDay,
}: {
  dayName: string;
  date: Date;
  isWeekend: boolean;
  isToday: boolean;
  isMyDay: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
        isMyDay
          ? "bg-primary text-primary-foreground"
          : isToday
          ? "bg-secondary text-secondary-foreground ring-1 ring-primary/30"
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

import { useState, useMemo, useRef, useEffect } from "react";
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
  ChevronUp,
  ChevronDown,
  User,
  Coffee,
  Clock,
  Search,
  LogOut,
  LogIn,
  CalendarCheck,
  Users,
  Pencil,
  BookOpen,
  CheckCircle,
  Bell,
  BellOff,
  Megaphone,
  X,
} from "lucide-react";
import { usePushNotification } from "@/hooks/usePushNotification";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKEND_DAYS = ["금", "토"];

// 가게 위치: 경기도 동두천시 어수로 113-1 (대한한우숯불구이)
const STORE_LAT = 37.902136;
const STORE_LNG = 127.0552767;
const STORE_RADIUS_M = 100; // 허용 반경 100m

// Haversine 공식으로 두 좌표 간 거리(m) 계산
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반지름 (m)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

// 출근 시간 계산: 예정 시간 이전/정시 → 예정 시간, 예정 시간 이후 → 다음 30분 올림
function calcCheckInTime(actualTimeStr: string, scheduledTimeStr: string): string {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const actualMins = toMinutes(actualTimeStr);
  const scheduledMins = toMinutes(scheduledTimeStr);
  // 예정 시간 이전이거나 정시면 예정 시간으로 기록
  if (actualMins <= scheduledMins) {
    return scheduledTimeStr;
  }
  // 예정 시간 이후면 다음 30분 단위로 올림
  const remainder = actualMins % 30;
  const ceilMins = remainder === 0 ? actualMins : actualMins + (30 - remainder);
  const h = Math.floor(ceilMins / 60) % 24;
  const m = ceilMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
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
  const [loggedInName, setLoggedInName] = useState<string | null>(() => localStorage.getItem("loggedInName"));
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"card" | "calendar">("card");
  const [prefDialogOpen, setPrefDialogOpen] = useState(false);
  const [prefDays, setPrefDays] = useState<string[]>([]);
  const [, navigate] = useLocation();
  // GPS 위치 상태
  const [locationChecking, setLocationChecking] = useState(false);

  // 출퇴근 수정 다이얼로그 상태
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionCtx, setCorrectionCtx] = useState<{
    type: "check_in" | "check_out" | "both";
    scheduleDate: string;
    timeSlot: "a" | "b" | "c" | "d";
    originalCheckInTime?: string;
    originalCheckOutTime?: string;
    scheduledCheckInTime?: string;
  } | null>(null);
  const [corrCheckInTime, setCorrCheckInTime] = useState("");
  const [corrCheckOutTime, setCorrCheckOutTime] = useState("");
  const [corrReason, setCorrReason] = useState("");

  // 수정 감지를 위한 refs (mutation onSuccess에서 사용)
  const scheduledStartRef = useRef<string>("");
  const checkedInTimeRef = useRef<string>("");

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const startDate = weekDates[0].dateStr;
  const endDate = weekDates[6].dateStr;

  const monthRange = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
    return {
      start: toLocalDateStr(firstDay),
      end: toLocalDateStr(lastDay),
      label: `${firstDay.getFullYear()}년 ${firstDay.getMonth() + 1}월`,
      firstDayOfWeek: firstDay.getDay(),
      daysInMonth: lastDay.getDate(),
      year: firstDay.getFullYear(),
      month: firstDay.getMonth(),
    };
  }, [monthOffset]);

  const { data: workers = [] } = trpc.workers.list.useQuery();

  // 자동 로그인: workers 로드 후 localStorage에 저장된 이름으로 prefDays 세팅
  useEffect(() => {
    if (loggedInName && workers.length > 0 && prefDays.length === 0) {
      const found = workers.find((w) => w.name === loggedInName);
      if (found?.preferredDays) {
        setPrefDays(found.preferredDays.split(",").filter(Boolean));
      }
    }
  }, [workers, loggedInName]);
  const { data: schedules = [] } = trpc.schedules.getByDateRange.useQuery({ startDate, endDate });
  const { data: monthSchedules = [] } = trpc.schedules.getByDateRange.useQuery(
    { startDate: monthRange.start, endDate: monthRange.end },
    { enabled: viewMode === "calendar" }
  );
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

  const checkInMutation = trpc.schedules.checkIn.useMutation({
    onSuccess: (_data, variables) => {
      utils.schedules.getByDateRange.invalidate();
      toast.success(`출근 완료! ${variables.startTime} 출근 처리되었습니다.`);
      // 예정 출근 시간보다 15분 이상 늦은 경우 수정 팝업
      const actualMins = timeToMinutes(variables.actualStartTime);
      const scheduledMins = timeToMinutes(scheduledStartRef.current);
      if (scheduledMins > 0 && actualMins - scheduledMins >= 15) {
        setCorrectionCtx({
          type: "check_in",
          scheduleDate: variables.scheduleDate,
          timeSlot: variables.timeSlot,
          originalCheckInTime: variables.actualStartTime,
          scheduledCheckInTime: scheduledStartRef.current,
        });
        setCorrCheckInTime(variables.actualStartTime);
        setCorrectionOpen(true);
      }
    },
    onError: () => {
      toast.error("출근 처리에 실패했습니다.");
    },
  });

  const checkOutMutation = trpc.schedules.checkOut.useMutation({
    onSuccess: (_data, variables) => {
      utils.schedules.getByDateRange.invalidate();
      toast.success(`퇴근 완료! ${variables.endTime} 퇴근 처리되었습니다.`);
      // 출근/퇴근 간격 3분 이하 → 동시 누름으로 판단, 수정 팝업
      const checkOutMins = timeToMinutes(variables.actualEndTime);
      const checkInMins = timeToMinutes(checkedInTimeRef.current);
      if (checkInMins > 0 && checkOutMins - checkInMins <= 3) {
        setCorrectionCtx({
          type: "both",
          scheduleDate: variables.scheduleDate,
          timeSlot: variables.timeSlot,
          originalCheckInTime: checkedInTimeRef.current,
          originalCheckOutTime: variables.actualEndTime,
        });
        setCorrCheckInTime(checkedInTimeRef.current);
        setCorrCheckOutTime(variables.actualEndTime);
        setCorrectionOpen(true);
      }
    },
    onError: () => {
      toast.error("퇴근 처리에 실패했습니다.");
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

  const correctTimeMutation = trpc.attendanceCorrections.create.useMutation({
    onSuccess: () => {
      utils.schedules.getByDateRange.invalidate();
      toast.success("시간이 수정되었습니다.");
      setCorrectionOpen(false);
      setCorrectionCtx(null);
      setCorrReason("");
      setCorrCheckInTime("");
      setCorrCheckOutTime("");
    },
    onError: () => {
      toast.error("수정에 실패했습니다. 다시 시도해주세요.");
    },
  });

  function handleSkipCorrection() {
    if (!correctionCtx || !loggedInName) return;
    const worker = workers.find((w) => w.name === loggedInName);
    correctTimeMutation.mutate({
      workerId: worker?.id ?? null,
      workerName: loggedInName,
      scheduleDate: correctionCtx.scheduleDate,
      timeSlot: correctionCtx.timeSlot,
      correctionType: correctionCtx.type,
      actionType: "skipped",
      originalCheckInTime: correctionCtx.originalCheckInTime,
      originalCheckOutTime: correctionCtx.originalCheckOutTime,
    });
  }

  function handleCorrect() {
    if (!correctionCtx || !loggedInName || !corrReason.trim()) return;
    const worker = workers.find((w) => w.name === loggedInName);
    correctTimeMutation.mutate({
      workerId: worker?.id ?? null,
      workerName: loggedInName,
      scheduleDate: correctionCtx.scheduleDate,
      timeSlot: correctionCtx.timeSlot,
      correctionType: correctionCtx.type,
      actionType: "corrected",
      originalCheckInTime: correctionCtx.originalCheckInTime,
      correctedCheckInTime: correctionCtx.type !== "check_out" ? corrCheckInTime : undefined,
      scheduledCheckInTime: correctionCtx.scheduledCheckInTime,
      originalCheckOutTime: correctionCtx.originalCheckOutTime,
      correctedCheckOutTime: correctionCtx.type !== "check_in" ? corrCheckOutTime : undefined,
      reason: corrReason.trim(),
    });
  }

  const currentWorker = useMemo(() => {
    if (!loggedInName) return null;
    return workers.find((w) => w.name === loggedInName) || null;
  }, [loggedInName, workers]);

  const { isSupported: pushSupported, permission: pushPermission, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotification(
    currentWorker?.id ?? null,
    loggedInName
  );

  const mySchedules = useMemo(() => {
    if (!currentWorker) return [];
    return schedules.filter(
      (s) =>
        s.isOperating &&
        (s.aTimeWorkerId === currentWorker.id ||
          s.bTimeWorkerId === currentWorker.id ||
          s.cTimeWorkerId === currentWorker.id ||
          (s as any).dTimeWorkerId === currentWorker.id)
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
    if ((schedule as any).dTimeWorkerId === currentWorker.id) {
      const startTime = (schedule as any).dTimeStartTime || "18:00";
      const endTime = (schedule as any).dTimeEndTime || "21:00";
      return { label: "D", slot: "d" as const, startTime, endTime, time: `${startTime}~${endTime}` };
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
    localStorage.setItem("loggedInName", name);
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
    localStorage.removeItem("loggedInName");
    setWorkerName("");
    setWeekOffset(0);
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
                <span className="text-primary">대한한우</span> 스케줄
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
                onClick={() => navigate("/settings")}
                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                관리자
              </button>
            </div>
          </div>
        </div>

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
            <span className="text-primary">대한한우</span>
            <span className="ml-1">스케줄</span>
          </h1>
          <div className="flex items-center gap-2">
            {pushSupported && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={pushSubscribed ? unsubscribePush : subscribePush}
                title={pushSubscribed ? "알림 켜짐 (클릭하여 해제)" : "알림 꺼짐 (클릭하여 허용)"}
              >
                {pushSubscribed
                  ? <Bell className="w-4 h-4 text-green-500" />
                  : <BellOff className="w-4 h-4 text-muted-foreground" />
                }
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-4 pb-6">
        <div className="max-w-2xl mx-auto space-y-2.5">
          {/* 1. 푸시 알림 배너 */}
          {pushSupported && !pushSubscribed && pushPermission !== "denied" && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-primary/10 border border-primary/30">
              <Bell className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary">출근 알림 받기</p>
                <p className="text-[11px] text-muted-foreground">우측 상단 종 아이콘을 탭해주세요</p>
              </div>
            </div>
          )}

          {/* 2. 공지사항 배너 */}
          <AnnouncementBanner />

          {/* 3. 프로필 + 오늘 출퇴근 통합 카드 */}
          {currentWorker && (() => {
            const todayStr = toLocalDateStr(new Date());
            const todaySchedule = schedules.find((s) => s.scheduleDate === todayStr);
            const todaySlot = todaySchedule ? getMyTimeSlot(todaySchedule) : null;
            const todayIsOff = todaySchedule && !todaySchedule.isOperating;
            const checkedInTime = todaySlot && todaySchedule ? (
              todaySlot.slot === "a" ? (todaySchedule as any).aTimeActualStartTime :
              todaySlot.slot === "b" ? (todaySchedule as any).bTimeActualStartTime :
              (todaySchedule as any).cTimeActualStartTime
            ) : null;
            const checkedOutTime = todaySlot && todaySchedule ? (
              todaySlot.slot === "a" ? (todaySchedule as any).aTimeActualEndTime :
              todaySlot.slot === "b" ? (todaySchedule as any).bTimeActualEndTime :
              (todaySchedule as any).cTimeActualEndTime
            ) : null;

            return (
              <Card className="bg-card border-primary/30 border">
                <CardContent className="px-4 py-3">
                  {/* 프로필 행 */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{currentWorker.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            currentWorker.skillLevel === "main"
                              ? "border-primary/50 text-primary"
                              : currentWorker.skillLevel === "trainee"
                              ? "border-orange-500/50 text-orange-400"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {currentWorker.skillLevel === "main" ? "메인" : currentWorker.skillLevel === "trainee" ? "수습" : "서브"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">· 이번 주 {mySchedules.length}일</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 border-white/30 text-white hover:bg-white/10"
                        onClick={() => setPrefDialogOpen(true)}
                        title="선호 근무일 지정"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 border-white/30 text-white hover:bg-white/10"
                        onClick={() => window.open("https://tattered-sulfur-16b.notion.site/332ca0ddb8cf81f29814f2f5e2e3975a", "_blank")}
                        title="매뉴얼"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* 구분선 */}
                  <div className="border-t border-border/40 mb-2.5" />

                  {/* 오늘 출퇴근 행 */}
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">오늘 출퇴근</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date().toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
                    </span>
                  </div>

                  {todayIsOff ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Coffee className="w-4 h-4" />
                      <span className="text-sm">오늘 휴무</span>
                    </div>
                  ) : !todaySlot ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm">오늘 근무 없음</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5">
                          {todaySlot.label}타임
                        </Badge>
                        <span className="text-sm font-medium">{todaySlot.time}</span>
                      </div>
                      <div className="flex gap-2">
                        {checkedInTime ? (
                          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/30">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-sm font-medium text-green-500">출근 {checkedInTime}</span>
                          </div>
                        ) : (
                          <Button
                            className="flex-1 h-9 gap-1.5 bg-transparent border border-green-500/60 text-green-400 hover:bg-green-500/10 text-sm"
                            disabled={checkInMutation.isPending || locationChecking}
                            onClick={() => {
                              scheduledStartRef.current = todaySlot.startTime;
                              if (!navigator.geolocation) {
                                toast.error("위치 서비스를 지원하지 않는 브라우저입니다.");
                                return;
                              }
                              setLocationChecking(true);
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  setLocationChecking(false);
                                  const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, STORE_LAT, STORE_LNG);
                                  if (dist > STORE_RADIUS_M) {
                                    toast.error(`가게 반경 ${STORE_RADIUS_M}m 밖에 있습니다. (현재 거리: ${Math.round(dist)}m)\n가게 근처에서만 출근할 수 있습니다.`);
                                    return;
                                  }
                                  const actualTime = getCurrentTimeStr();
                                  const roundedTime = calcCheckInTime(actualTime, todaySlot.startTime);
                                  checkInMutation.mutate({
                                    scheduleDate: todayStr,
                                    timeSlot: todaySlot.slot,
                                    startTime: roundedTime,
                                    actualStartTime: actualTime,
                                  });
                                },
                                (err) => {
                                  setLocationChecking(false);
                                  if (err.code === 1 || err.code === 3) {
                                    toast.error("위치 권한이 거부되었거나 응답이 없습니다.\n카카오톡 인앱 브라우저에서는 위치 권한이 제한될 수 있어요.\nSafari 또는 Chrome으로 열어서 다시 시도해주세요.", { duration: 6000 });
                                  } else {
                                    toast.error("위치를 확인할 수 없습니다. 다시 시도해주세요.");
                                  }
                                },
                                { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
                              );
                            }}
                          >
                            {locationChecking ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                위치 확인 중...
                              </>
                            ) : (
                              <>
                                <LogIn className="w-4 h-4" />
                                출근
                              </>
                            )}
                          </Button>
                        )}
                        {checkedOutTime ? (
                          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                            <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-sm font-medium text-blue-400">퇴근 {checkedOutTime}</span>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="flex-1 h-9 gap-1.5 bg-transparent border border-primary/60 text-primary hover:bg-primary/10 text-sm"
                            disabled={checkOutMutation.isPending || !checkedInTime || locationChecking}
                            onClick={() => {
                              checkedInTimeRef.current = checkedInTime || "";
                              if (!navigator.geolocation) {
                                toast.error("위치 서비스를 지원하지 않는 브라우저입니다.");
                                return;
                              }
                              setLocationChecking(true);
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  setLocationChecking(false);
                                  const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, STORE_LAT, STORE_LNG);
                                  if (dist > STORE_RADIUS_M) {
                                    toast.error(`가게 반경 ${STORE_RADIUS_M}m 밖에 있습니다. (현재 거리: ${Math.round(dist)}m)\n가게 근처에서만 퇴근할 수 있습니다.`);
                                    return;
                                  }
                                  const actualTime = getCurrentTimeStr();
                                  const roundedTime = roundTimeToNearest30Min(actualTime);
                                  checkOutMutation.mutate({
                                    scheduleDate: todayStr,
                                    timeSlot: todaySlot.slot,
                                    endTime: roundedTime,
                                    actualEndTime: actualTime,
                                  });
                                },
                                (err) => {
                                  setLocationChecking(false);
                                  if (err.code === 1) {
                                    toast.error("위치 권한이 거부되었습니다.\n브라우저 설정에서 위치 권한을 허용해주세요.");
                                  } else {
                                    toast.error("위치를 확인할 수 없습니다. 다시 시도해주세요.");
                                  }
                                },
                                { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
                              );
                            }}
                          >
                            {locationChecking ? (
                              <>
                                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                위치 확인 중...
                              </>
                            ) : (
                              <>
                                <LogOut className="w-4 h-4" />
                                퇴근
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {!checkedInTime && (
                        <p className="text-[10px] text-muted-foreground text-center mt-1.5">출근 버튼을 먼저 눌러주세요 (가게 반경 100m 내에서만 가능)</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}


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
            <TabsContent value="card" className="mt-3">
              {/* Week navigation */}
              <div className="flex items-center justify-between mb-2">
                <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setWeekOffset((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium">{weekLabel}</span>
                <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setWeekOffset((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* 7일 블럭 그리드 */}
              <div className="grid grid-cols-7 gap-1.5">
                {weekDates.map((d) => {
                  const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
                  const isWeekend = WEEKEND_DAYS.includes(d.dayName);
                  const today = isToday(d.dateStr);
                  const isOff = schedule && !schedule.isOperating;
                  const mySlot = schedule ? getMyTimeSlot(schedule) : null;
                  const isMyDay = !!mySlot;

                  const checkedInTime = mySlot && schedule ? (
                    mySlot.slot === "a" ? (schedule as any).aTimeActualStartTime :
                    mySlot.slot === "b" ? (schedule as any).bTimeActualStartTime :
                    (schedule as any).cTimeActualStartTime
                  ) : null;

                  return (
                    <div
                      key={d.dateStr}
                      className={`flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-xl border transition-all ${
                        isOff
                          ? "bg-muted/10 border-border/20 opacity-40"
                          : isMyDay
                          ? "bg-primary/10 border-primary/40"
                          : today
                          ? "bg-secondary/50 border-border/30"
                          : "bg-card/30 border-border/15"
                      }`}
                    >
                      {/* 요일 */}
                      <span className={`text-[11px] font-medium leading-none ${
                        isMyDay ? "text-primary" : isWeekend ? "text-primary/50" : "text-muted-foreground/50"
                      }`}>{d.dayName}</span>

                      {/* 날짜 */}
                      <span className={`text-base font-bold leading-none ${
                        today ? "text-primary" : isMyDay ? "text-foreground" : "text-muted-foreground/50"
                      }`}>{d.date.getDate()}</span>

                      {/* 상태 */}
                      <div className="h-4 flex items-center justify-center">
                        {isOff ? (
                          <Coffee className="w-3 h-3 text-muted-foreground/40" />
                        ) : isMyDay && mySlot ? (
                          <span className="text-[9px] font-bold text-primary leading-none">{mySlot.label}타임</span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/25 leading-none">-</span>
                        )}
                      </div>

                      {/* 출근 체크 표시 */}
                      {isMyDay && checkedInTime && (
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 선택된 날 상세 정보 (근무일만) */}
              {weekDates.some((d) => {
                const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
                return schedule ? !!getMyTimeSlot(schedule) : false;
              }) && (
                <Card className="mt-2 border-border/30">
                  <CardContent className="p-3 space-y-0.5">
                    {weekDates.map((d) => {
                      const schedule = schedules.find((s) => s.scheduleDate === d.dateStr);
                      const isOff = schedule && !schedule.isOperating;
                      const mySlot = schedule ? getMyTimeSlot(schedule) : null;
                      if (!mySlot || isOff) return null;
                      const today = isToday(d.dateStr);

                      const checkedInTime = (
                        mySlot.slot === "a" ? (schedule as any).aTimeActualStartTime :
                        mySlot.slot === "b" ? (schedule as any).bTimeActualStartTime :
                        (schedule as any).cTimeActualStartTime
                      );
                      const checkedOutTime = (
                        mySlot.slot === "a" ? (schedule as any).aTimeActualEndTime :
                        mySlot.slot === "b" ? (schedule as any).bTimeActualEndTime :
                        (schedule as any).cTimeActualEndTime
                      );

                      return (
                        <div key={d.dateStr} className={`flex items-center gap-1.5 py-3.5 ${today ? "text-foreground" : "text-foreground/80"}`}>
                          <div className={`shrink-0 w-9 flex flex-col items-center leading-tight ${today ? "text-primary" : "text-muted-foreground"}`}>
                            <span className="text-xs font-medium">{d.dayName}</span>
                            <span className="text-base font-bold">{d.date.getDate()}</span>
                          </div>
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[11px] px-2 py-0 h-5 shrink-0">
                            {mySlot.label}
                          </Badge>
                          <span className="text-base font-bold text-foreground/80 shrink-0">{mySlot.time}</span>
                          <div className="flex-1 flex items-center justify-end gap-1 min-w-0">
                            {checkedInTime && checkedOutTime ? (
                              <>
                                <span className="text-[10px] text-muted-foreground/50 tabular-nums">{checkedInTime}~{checkedOutTime}</span>
                                <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] px-1.5 py-0 h-4 shrink-0">기록완료</Badge>
                              </>
                            ) : checkedInTime ? (
                              <>
                                <span className="text-[10px] text-green-500 tabular-nums">{checkedInTime}</span>
                                <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 text-[10px] px-1.5 py-0 h-4 shrink-0">출근완료</Badge>
                              </>
                            ) : null}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground/30 hover:text-primary transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2 bg-card border-border" align="end">
                              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">퇴근 시간 수정</p>
                              <div className="grid grid-cols-2 gap-1">
                                {END_TIMES.map((t) => (
                                  <button
                                    key={t}
                                    onClick={() => {
                                      updateEndTimeMutation.mutate({
                                        scheduleDate: d.dateStr,
                                        timeSlot: mySlot.slot,
                                        endTime: t,
                                        actualEndTime: t,
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
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Calendar View - 월간 */}
            <TabsContent value="calendar" className="mt-3">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setMonthOffset((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold">{monthRange.label}</span>
                <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={() => setMonthOffset((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* 이번 달 근무 요약 */}
              {(() => {
                const myMonthDays = monthSchedules.filter((s) => {
                  if (!s.isOperating) return false;
                  return getMyTimeSlot(s) !== null;
                });
                return myMonthDays.length > 0 ? (
                  <div className="flex items-center justify-center gap-1.5 mb-3 py-1.5 px-3 rounded-lg bg-primary/10 border border-primary/20">
                    <CalendarCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-primary font-medium">이번 달 내 근무: {myMonthDays.length}일</span>
                  </div>
                ) : null;
              })()}

              <Card className="bg-card border-border">
                <CardContent className="p-3">
                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
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

                  {/* 날짜 그리드 */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* 첫째 날 전 빈 셀 */}
                    {Array.from({ length: monthRange.firstDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {/* 날짜 셀 */}
                    {Array.from({ length: monthRange.daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${monthRange.year}-${String(monthRange.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const schedule = monthSchedules.find((s) => s.scheduleDate === dateStr);
                      const today = isToday(dateStr);
                      const isOff = schedule && !schedule.isOperating;
                      const mySlot = schedule ? getMyTimeSlot(schedule) : null;
                      const isMyDay = !!mySlot;
                      const dayOfWeek = new Date(monthRange.year, monthRange.month, day).getDay();
                      const isSun = dayOfWeek === 0;
                      const isSat = dayOfWeek === 6;

                      return (
                        <div
                          key={dateStr}
                          className={`rounded-lg p-1 min-h-[60px] text-center border transition-colors ${
                            isMyDay
                              ? "border-primary/60 bg-primary/10"
                              : today
                              ? "border-primary/30 bg-secondary/30"
                              : isOff
                              ? "border-border/20 bg-muted/10 opacity-40"
                              : "border-border/20 bg-transparent"
                          }`}
                        >
                          <div className={`text-[11px] font-bold mb-0.5 ${
                            isMyDay ? "text-primary" : today ? "text-primary" : isSun ? "text-destructive" : isSat ? "text-blue-400" : "text-foreground"
                          }`}>
                            {day}
                          </div>
                          {isOff ? (
                            <span className="text-[8px] text-muted-foreground/60">휴무</span>
                          ) : isMyDay && mySlot ? (
                            <div className="space-y-0.5">
                              <div className="text-[8px] px-0.5 py-0.5 rounded bg-primary/20 text-primary font-semibold leading-tight">
                                {mySlot.label}타임
                              </div>
                              <div className="text-[7px] text-muted-foreground leading-tight">
                                {mySlot.startTime}~{mySlot.endTime}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* 범례 */}
              <div className="flex items-center gap-3 mt-2 px-1">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border border-primary/60 bg-primary/10" />
                  <span className="text-[10px] text-muted-foreground">내 근무일</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border border-primary/30 bg-secondary/30" />
                  <span className="text-[10px] text-muted-foreground">오늘</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Hidden admin access at bottom */}
          <div className="text-center pt-4">
            <button
              onClick={() => navigate("/settings")}
              className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors"
            >
              관리자
            </button>
          </div>
        </div>
      </main>

      {/* 출퇴근 시간 수정 다이얼로그 */}
      <Dialog open={correctionOpen} onOpenChange={(open) => {
        if (!open) {
          setCorrectionOpen(false);
          setCorrectionCtx(null);
          setCorrReason("");
          setCorrCheckInTime("");
          setCorrCheckOutTime("");
        }
      }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              출퇴근 시간 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              {correctionCtx?.type === "check_in"
                ? "출근 시간보다 늦게 입력되었어요. 실제 출근 시간으로 수정하시겠어요?"
                : "출퇴근이 거의 동시에 입력되었어요. 실제 시간으로 수정하시겠어요?"}
            </p>
            {correctionCtx?.type !== "check_out" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">실제 출근 시간</Label>
                <input
                  type="time"
                  value={corrCheckInTime}
                  onChange={(e) => setCorrCheckInTime(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {correctionCtx?.originalCheckInTime && (
                  <p className="text-[10px] text-muted-foreground">기록된 시간: {correctionCtx.originalCheckInTime}</p>
                )}
              </div>
            )}
            {correctionCtx?.type !== "check_in" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">실제 퇴근 시간</Label>
                <input
                  type="time"
                  value={corrCheckOutTime}
                  onChange={(e) => setCorrCheckOutTime(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {correctionCtx?.originalCheckOutTime && (
                  <p className="text-[10px] text-muted-foreground">기록된 시간: {correctionCtx.originalCheckOutTime}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">
                수정 사유 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                placeholder="실제 출근/퇴근 시간과 다른 이유를 입력해 주세요"
                className="bg-secondary/50 resize-none text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={handleSkipCorrection}
              disabled={correctTimeMutation.isPending}
            >
              그대로 저장
            </Button>
            <Button
              onClick={handleCorrect}
              disabled={!corrReason.trim() || correctTimeMutation.isPending}
            >
              수정하기
            </Button>
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

function AnnouncementBanner() {
  const { data: announcements = [] } = trpc.announcements.getActive.useQuery();
  const [dismissed, setDismissed] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("dismissed_announcements") || "[]"); } catch { return []; }
  });
  const [index, setIndex] = useState(0);

  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  const current = visible[Math.min(index, visible.length - 1)];

  function dismiss(id: number) {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("dismissed_announcements", JSON.stringify(next));
    setIndex((i) => Math.max(0, i - 1));
  }

  return (
    <Card className="bg-primary/10 border-primary/30">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <Megaphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">{current.title}</p>
            <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{current.content}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {visible.length > 1 && (
              <div className="flex items-center gap-0.5">
                <button
                  className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground">{index + 1}/{visible.length}</span>
                <button
                  className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20"
                  disabled={index === visible.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button className="text-muted-foreground/50 hover:text-muted-foreground" onClick={() => dismiss(current.id)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
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

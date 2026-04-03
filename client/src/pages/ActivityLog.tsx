import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  CalendarDays,
  User,
  Filter,
  RefreshCw,
  LogIn,
  LogOut,
  Star,
  CalendarOff,
  UserPlus,
  UserMinus,
  UserCog,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type ActionType =
  | "end_time_update"
  | "start_time_update"
  | "preferred_days_update"
  | "fixed_days_off_update"
  | "worker_created"
  | "worker_updated"
  | "worker_deleted"
  | "attendance_correction"
  | "correction_skipped";

const ACTION_LABELS: Record<ActionType, { label: string; color: string; icon: React.ReactNode }> = {
  end_time_update: {
    label: "퇴근 시간 수정",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: <LogOut className="w-3.5 h-3.5" />,
  },
  start_time_update: {
    label: "출근 시간 수정",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <LogIn className="w-3.5 h-3.5" />,
  },
  preferred_days_update: {
    label: "선호 근무일 변경",
    color: "bg-green-500/15 text-green-400 border-green-500/30",
    icon: <Star className="w-3.5 h-3.5" />,
  },
  fixed_days_off_update: {
    label: "휴무요일 변경",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: <CalendarOff className="w-3.5 h-3.5" />,
  },
  worker_created: {
    label: "알바생 추가",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <UserPlus className="w-3.5 h-3.5" />,
  },
  worker_updated: {
    label: "알바생 정보 수정",
    color: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <UserCog className="w-3.5 h-3.5" />,
  },
  worker_deleted: {
    label: "알바생 삭제",
    color: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: <UserMinus className="w-3.5 h-3.5" />,
  },
  attendance_correction: {
    label: "출퇴근 시간 수정",
    color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  correction_skipped: {
    label: "수정 팝업 건너뜀",
    color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: <ChevronDown className="w-3.5 h-3.5" />,
  },
};

function formatDateTime(date: Date | string): { date: string; time: string } {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return {
    date: `${year}.${month}.${day}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

function groupByDate(logs: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  logs.forEach((log) => {
    const { date } = formatDateTime(log.createdAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  });
  return groups;
}

function getDayOfWeek(dateStr: string): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const [y, m, d] = dateStr.split(".").map(Number);
  const date = new Date(y, m - 1, d);
  return days[date.getDay()];
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  return dateStr === today;
}

function isYesterday(dateStr: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}.${String(yesterday.getMonth() + 1).padStart(2, "0")}.${String(yesterday.getDate()).padStart(2, "0")}`;
  return dateStr === yStr;
}

export default function ActivityLog() {
  const [filterWorker, setFilterWorker] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);

  const { data: workers = [] } = trpc.workers.list.useQuery();

  const queryInput = useMemo(() => {
    const input: any = { limit: 300 };
    if (filterWorker !== "all") input.workerId = Number(filterWorker);
    if (filterAction !== "all") input.actionType = filterAction;
    if (filterStartDate) input.startDate = filterStartDate;
    if (filterEndDate) input.endDate = filterEndDate;
    return input;
  }, [filterWorker, filterAction, filterStartDate, filterEndDate]);

  const { data: logs = [], isLoading, refetch } = trpc.activityLogs.list.useQuery(queryInput);

  const grouped = useMemo(() => groupByDate(logs), [logs]);
  const sortedDates = useMemo(() => Object.keys(grouped).sort((a, b) => b.localeCompare(a)), [grouped]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function resetFilters() {
    setFilterWorker("all");
    setFilterAction("all");
    setFilterStartDate("");
    setFilterEndDate("");
  }

  const hasActiveFilter = filterWorker !== "all" || filterAction !== "all" || filterStartDate || filterEndDate;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-3 py-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">활동 로그</h1>
              <p className="text-xs text-muted-foreground">알바생 활동 내역 전체 기록</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              title="새로고침"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant={showFilter ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setShowFilter((v) => !v)}
            >
              <Filter className="w-3.5 h-3.5" />
              필터
              {hasActiveFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
              )}
            </Button>
          </div>
        </div>

        {/* 필터 패널 */}
        {showFilter && (
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* 알바생 필터 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">알바생</label>
                  <Select value={filterWorker} onValueChange={setFilterWorker}>
                    <SelectTrigger className="h-9 bg-secondary/30 text-sm">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={w.id.toString()}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 액션 타입 필터 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">활동 유형</label>
                  <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="h-9 bg-secondary/30 text-sm">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {(Object.entries(ACTION_LABELS) as [ActionType, any][]).map(([key, val]) => (
                        <SelectItem key={key} value={key}>
                          {val.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 날짜 범위 필터 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">시작 날짜</label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="h-9 bg-secondary/30 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">종료 날짜</label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="h-9 bg-secondary/30 text-sm"
                  />
                </div>
              </div>

              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-muted-foreground"
                  onClick={resetFilters}
                >
                  필터 초기화
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* 로그 카운트 요약 */}
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-muted-foreground">
            {isLoading ? "불러오는 중..." : `총 ${logs.length}건`}
          </span>
          {sortedDates.length > 0 && (
            <span className="text-xs text-muted-foreground">{sortedDates.length}일간 기록</span>
          )}
        </div>

        {/* 로그 없음 */}
        {!isLoading && logs.length === 0 && (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">활동 기록이 없습니다.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                알바생이 출퇴근 시간을 수정하거나 선호 요일을 변경하면 여기에 기록됩니다.
              </p>
            </CardContent>
          </Card>
        )}

        {/* 날짜별 그룹 */}
        {sortedDates.map((dateStr) => {
          const dayLogs = grouped[dateStr];
          const isExpanded = expandedDates.has(dateStr);
          const dayOfWeek = getDayOfWeek(dateStr);
          const todayFlag = isToday(dateStr);
          const yesterdayFlag = isYesterday(dateStr);

          return (
            <div key={dateStr} className="space-y-1.5">
              {/* 날짜 헤더 */}
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors"
                onClick={() => toggleDate(dateStr)}
              >
                <div className="flex items-center gap-2.5">
                  <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">
                    {dateStr}
                    <span
                      className={`ml-1.5 text-xs font-normal ${
                        dayOfWeek === "일"
                          ? "text-destructive"
                          : dayOfWeek === "토"
                          ? "text-blue-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      ({dayOfWeek})
                    </span>
                  </span>
                  {todayFlag && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary/20 text-primary border-primary/30">
                      오늘
                    </Badge>
                  )}
                  {yesterdayFlag && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      어제
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{dayLogs.length}건</span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* 해당 날짜 로그 목록 */}
              {isExpanded && (
                <div className="space-y-1.5 pl-2">
                  {dayLogs.map((log) => {
                    const { time } = formatDateTime(log.createdAt);
                    const actionInfo = ACTION_LABELS[log.actionType as ActionType];
                    return (
                      <Card key={log.id} className="border-border/40 bg-card/60">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            {/* 시간 */}
                            <div className="shrink-0 text-right w-16">
                              <span className="text-xs font-mono text-muted-foreground">{time}</span>
                            </div>

                            {/* 구분선 */}
                            <div className="shrink-0 flex flex-col items-center pt-1">
                              <div className="w-2 h-2 rounded-full bg-primary/60" />
                              <div className="w-px h-full bg-border/50 mt-1" />
                            </div>

                            {/* 내용 */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] h-5 px-1.5 gap-1 ${actionInfo?.color ?? ""}`}
                                >
                                  {actionInfo?.icon}
                                  {actionInfo?.label ?? log.actionType}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-xs font-medium">{log.workerName}</span>
                                </div>
                              </div>
                              <p className="text-sm text-foreground leading-relaxed">
                                {log.description}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 로딩 스켈레톤 */}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-secondary/30 animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

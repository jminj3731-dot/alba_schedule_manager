import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, BarChart3, Clock, Calendar, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

const SKILL_COLORS: Record<string, string> = {
  main: "#CC0000",
  sub: "#666666",
};

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export default function Statistics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedWorker, setSelectedWorker] = useState<number | null>(null);

  const { data: stats = [], isLoading } = trpc.statistics.monthly.useQuery({ year, month });

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedWorker(null);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedWorker(null);
  }

  // 차트 데이터 — 근무 일수
  const daysChartData = useMemo(() =>
    stats.map((s) => ({
      name: s.workerName,
      근무일수: s.workDays,
      skillLevel: s.skillLevel,
    })), [stats]);

  // 차트 데이터 — 근무 시간
  const hoursChartData = useMemo(() =>
    stats.map((s) => ({
      name: s.workerName,
      근무시간: Math.round(s.totalMinutes / 60 * 10) / 10,
      skillLevel: s.skillLevel,
    })), [stats]);

  // 타임별 집계 차트
  const timeSlotData = useMemo(() =>
    stats.map((s) => ({
      name: s.workerName,
      "A타임": s.aTimeDays,
      "B타임": s.bTimeDays,
      "C타임": s.cTimeDays,
    })), [stats]);

  const selectedStat = selectedWorker !== null ? stats.find((s) => s.workerId === selectedWorker) : null;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              월간 근무 통계
            </h2>
            <p className="text-sm text-muted-foreground">알바생별 근무 일수 및 시간 집계</p>
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold">{year}년 {MONTH_NAMES[month - 1]}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            통계를 불러오는 중...
          </div>
        ) : stats.length === 0 || stats.every((s) => s.workDays === 0) ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              이 달에 등록된 근무 데이터가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-2">
              {stats.map((s) => (
                <Card
                  key={s.workerId}
                  className={`border cursor-pointer transition-all ${
                    selectedWorker === s.workerId
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedWorker(selectedWorker === s.workerId ? null : s.workerId)}
                >
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{s.workerName}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          s.skillLevel === "main"
                            ? "border-primary/50 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {s.skillLevel === "main" ? "메인" : "서브"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span className="font-medium text-foreground">{s.workDays}일</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="font-medium text-foreground">{minutesToHHMM(s.totalMinutes)}</span>
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {s.aTimeDays > 0 && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">A×{s.aTimeDays}</span>
                      )}
                      {s.bTimeDays > 0 && (
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">B×{s.bTimeDays}</span>
                      )}
                      {s.cTimeDays > 0 && (
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">C×{s.cTimeDays}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 근무 일수 바 차트 */}
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  근무 일수 비교
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={daysChartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#999" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#999" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#fff" }}
                      formatter={(v: number) => [`${v}일`, "근무일수"]}
                    />
                    <Bar dataKey="근무일수" radius={[4, 4, 0, 0]}>
                      {daysChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.skillLevel === "main" ? "#CC0000" : "#555"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 근무 시간 바 차트 */}
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  총 근무 시간 비교
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={hoursChartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#999" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#999" }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#fff" }}
                      formatter={(v: number) => [`${v}시간`, "근무시간"]}
                    />
                    <Bar dataKey="근무시간" radius={[4, 4, 0, 0]}>
                      {hoursChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.skillLevel === "main" ? "#CC0000" : "#555"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 타임별 분포 차트 */}
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  타임별 근무 분포
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={timeSlotData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#999" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#999" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#fff" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
                    <Bar dataKey="A타임" fill="#CC0000" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="B타임" fill="#555" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="C타임" fill="#888" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 선택된 알바생 상세 내역 */}
            {selectedStat && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {selectedStat.workerName} 상세 근무 내역
                    <Badge variant="outline" className="text-[10px] border-primary/50 text-primary ml-auto">
                      총 {selectedStat.workDays}일 · {minutesToHHMM(selectedStat.totalMinutes)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {selectedStat.dailyBreakdown.map((d, i) => {
                      const dateObj = new Date(d.date + "T00:00:00");
                      const mmdd = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                      return (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-12">{mmdd} ({d.dayOfWeek})</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                d.timeSlot === "A"
                                  ? "bg-primary/20 text-primary"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                            >
                              {d.timeSlot}타임
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{d.startTime}~{d.endTime}</span>
                            <span className="font-medium text-foreground">{minutesToHHMM(d.minutes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

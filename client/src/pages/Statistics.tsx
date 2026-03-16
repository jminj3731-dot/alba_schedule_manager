import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Clock,
  Calendar,
  TrendingUp,
  Download,
  FileSpreadsheet,
  Calculator,
} from "lucide-react";
import * as XLSX from "xlsx";
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

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 분을 소수 시간으로 변환 (예: 270분 → 4.5) */
function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** YYYY-MM-DD 형식으로 날짜 반환 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 급여 계산 기간 계산: 전월 급여일 다음날 ~ 당월 급여일 */
function calcPayPeriod(year: number, month: number, payDay: number): { startDate: string; endDate: string; label: string } {
  // 당월 급여일
  const endDate = new Date(year, month - 1, payDay);
  // 전월 급여일 다음날
  const startDate = new Date(year, month - 2, payDay + 1);

  return {
    startDate: toDateStr(startDate),
    endDate: toDateStr(endDate),
    label: `${startDate.getMonth() + 1}/${startDate.getDate()} ~ ${endDate.getMonth() + 1}/${endDate.getDate()}`,
  };
}

interface WorkerPayConfig {
  workerId: number;
  workerName: string;
  payDay: number; // 급여일 (1~31)
}

export default function Statistics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedWorker, setSelectedWorker] = useState<number | null>(null);

  // 내보내기 다이얼로그 상태
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "excel">("excel");
  // 각 알바생별 급여일 설정 (기본값 14일)
  const [payConfigs, setPayConfigs] = useState<Record<number, number>>({});

  const { data: stats = [], isLoading } = trpc.statistics.monthly.useQuery({ year, month });

  // 급여 계산용 날짜 범위 쿼리 (다이얼로그 열릴 때만 사용)
  // 모든 알바생의 급여 기간을 커버하는 최대 범위로 조회
  const payPeriodRange = useMemo(() => {
    if (!exportDialogOpen || stats.length === 0) return null;
    // 가장 이른 시작일 ~ 가장 늦은 종료일
    let minStart = "";
    let maxEnd = "";
    stats.forEach((s) => {
      const day = payConfigs[s.workerId] ?? 14;
      const { startDate, endDate } = calcPayPeriod(year, month, day);
      if (!minStart || startDate < minStart) minStart = startDate;
      if (!maxEnd || endDate > maxEnd) maxEnd = endDate;
    });
    return { startDate: minStart, endDate: maxEnd };
  }, [exportDialogOpen, stats, payConfigs, year, month]);

  const { data: rangeStats = [] } = trpc.statistics.byDateRange.useQuery(
    { startDate: payPeriodRange?.startDate ?? "", endDate: payPeriodRange?.endDate ?? "" },
    { enabled: !!payPeriodRange }
  );

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

  function openExportDialog(format: "csv" | "excel") {
    setExportFormat(format);
    // 기본 급여일 설정 (아직 없으면 14일로)
    const defaults: Record<number, number> = {};
    stats.forEach((s) => {
      defaults[s.workerId] = payConfigs[s.workerId] ?? 14;
    });
    setPayConfigs(defaults);
    setExportDialogOpen(true);
  }

  function handleExport() {
    if (exportFormat === "csv") {
      doExportCSV();
    } else {
      doExportExcel();
    }
    setExportDialogOpen(false);
  }

  /** 각 알바생의 급여 기간에 해당하는 근무 데이터만 필터링 */
  function getWorkerPeriodData(workerId: number, workerName: string) {
    const day = payConfigs[workerId] ?? 14;
    const { startDate, endDate } = calcPayPeriod(year, month, day);
    const workerStat = rangeStats.find((s) => s.workerId === workerId);
    if (!workerStat) return { startDate, endDate, breakdown: [], totalMinutes: 0, workDays: 0 };

    // 해당 기간 내 데이터만 필터
    const breakdown = workerStat.dailyBreakdown.filter(
      (d) => d.date >= startDate && d.date <= endDate
    );
    const totalMinutes = breakdown.reduce((sum, d) => sum + d.minutes, 0);
    return { startDate, endDate, breakdown, totalMinutes, workDays: breakdown.length };
  }

  function doExportCSV() {
    const bom = "\uFEFF";
    const rows: string[][] = [];

    // 급여 계산 섹션
    rows.push(["=== 급여 계산 ===", "", "", "", "", "", "", ""]);
    rows.push(["이름", "급여 기간", "근무일수", "총근무시간(h)", "시급(원)", "총급여(원)", "", ""]);

    stats.forEach((s) => {
      const { startDate, endDate, totalMinutes, workDays } = getWorkerPeriodData(s.workerId, s.workerName);
      const totalHours = minutesToDecimalHours(totalMinutes);
      rows.push([
        s.workerName,
        `${startDate} ~ ${endDate}`,
        String(workDays),
        String(totalHours),
        "", // 시급 직접 입력
        "", // 총급여 직접 계산
        "",
        "",
      ]);
    });

    rows.push(["", "", "", "", "", "", "", ""]);

    // 상세 내역 섹션
    rows.push(["=== 근무 상세 내역 ===", "", "", "", "", "", "", ""]);
    rows.push(["이름", "급여기간", "날짜", "요일", "타임", "출근", "퇴근", "근무시간(h)"]);

    stats.forEach((s) => {
      const { startDate, endDate, breakdown } = getWorkerPeriodData(s.workerId, s.workerName);
      const periodLabel = `${startDate} ~ ${endDate}`;
      breakdown.forEach((d) => {
        rows.push([
          s.workerName,
          periodLabel,
          d.date,
          d.dayOfWeek,
          d.timeSlot + "타임",
          d.startTime,
          d.endTime,
          String(minutesToDecimalHours(d.minutes)),
        ]);
      });
    });

    const csvContent = bom + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `급여계산_${year}년${String(month).padStart(2, "0")}월.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doExportExcel() {
    const wb = XLSX.utils.book_new();

    // ── 시트 1: 급여 계산 ──
    const payRows: (string | number)[][] = [];
    payRows.push(["이름", "급여 기간 시작", "급여 기간 종료", "근무일수", "총 근무시간(h)", "시급(원)", "총 급여(원)"]);

    stats.forEach((s) => {
      const { startDate, endDate, totalMinutes, workDays } = getWorkerPeriodData(s.workerId, s.workerName);
      const totalHours = minutesToDecimalHours(totalMinutes);
      // 총급여 수식: =E{row}*F{row}
      const rowNum = payRows.length + 1; // 헤더가 1행이므로 데이터는 2행부터
      payRows.push([
        s.workerName,
        startDate,
        endDate,
        workDays,
        totalHours,
        0, // 시급 입력 셀 (기본값 0)
        { f: `E${rowNum + 1}*F${rowNum + 1}` } as any, // 총급여 수식
      ]);
    });

    const wsPayroll = XLSX.utils.aoa_to_sheet(payRows);

    // 열 너비 설정
    wsPayroll["!cols"] = [
      { wch: 10 }, // 이름
      { wch: 14 }, // 시작일
      { wch: 14 }, // 종료일
      { wch: 10 }, // 근무일수
      { wch: 14 }, // 총근무시간
      { wch: 12 }, // 시급
      { wch: 14 }, // 총급여
    ];

    XLSX.utils.book_append_sheet(wb, wsPayroll, "급여계산");

    // ── 시트 2: 상세 내역 ──
    const detailRows: (string | number)[][] = [];
    detailRows.push(["이름", "급여 기간", "날짜", "요일", "타임", "출근", "퇴근", "근무시간(h)"]);

    stats.forEach((s) => {
      const { startDate, endDate, breakdown } = getWorkerPeriodData(s.workerId, s.workerName);
      const periodLabel = `${startDate} ~ ${endDate}`;
      breakdown.forEach((d) => {
        detailRows.push([
          s.workerName,
          periodLabel,
          d.date,
          d.dayOfWeek,
          d.timeSlot + "타임",
          d.startTime,
          d.endTime,
          minutesToDecimalHours(d.minutes),
        ]);
      });
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail["!cols"] = [
      { wch: 10 },
      { wch: 24 },
      { wch: 12 },
      { wch: 6 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, wsDetail, "상세내역");

    XLSX.writeFile(wb, `급여계산_${year}년${String(month).padStart(2, "0")}월.xlsx`);
  }

  // 차트 데이터
  const daysChartData = useMemo(() =>
    stats.map((s) => ({ name: s.workerName, 근무일수: s.workDays, skillLevel: s.skillLevel })),
    [stats]);

  const hoursChartData = useMemo(() =>
    stats.map((s) => ({
      name: s.workerName,
      근무시간: Math.round(s.totalMinutes / 60 * 10) / 10,
      skillLevel: s.skillLevel,
    })),
    [stats]);

  const timeSlotData = useMemo(() =>
    stats.map((s) => ({
      name: s.workerName,
      "A타임": s.aTimeDays,
      "B타임": s.bTimeDays,
      "C타임": s.cTimeDays,
    })),
    [stats]);

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
          {/* 내보내기 버튼 */}
          {stats.length > 0 && stats.some((s) => s.workDays > 0) && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-border hover:border-primary/50"
                onClick={() => openExportDialog("csv")}
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-border hover:border-primary/50"
                onClick={() => openExportDialog("excel")}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                엑셀
              </Button>
            </div>
          )}
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

      {/* 급여 계산 내보내기 다이얼로그 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calculator className="w-4 h-4 text-primary" />
              급여 계산 기간 설정
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              각 알바생의 급여일을 입력하면 전월 급여일 다음날부터 당월 급여일까지의 근무를 집계합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {stats.filter((s) => s.workDays > 0).map((s) => {
              const day = payConfigs[s.workerId] ?? 14;
              const { startDate, endDate } = calcPayPeriod(year, month, day);
              const startD = new Date(startDate + "T00:00:00");
              const endD = new Date(endDate + "T00:00:00");
              const periodLabel = `${startD.getMonth() + 1}/${startD.getDate()} ~ ${endD.getMonth() + 1}/${endD.getDate()}`;

              return (
                <div key={s.workerId} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{s.workerName}</Label>
                    <span className="text-xs text-muted-foreground">{periodLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">급여일</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={day}
                      onChange={(e) => {
                        const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1));
                        setPayConfigs((prev) => ({ ...prev, [s.workerId]: v }));
                      }}
                      className="h-8 text-sm w-20 bg-background border-border"
                    />
                    <span className="text-xs text-muted-foreground">일</span>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 flex-row justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-border"
              onClick={() => setExportDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="text-xs bg-primary hover:bg-primary/90 gap-1.5"
              onClick={handleExport}
            >
              {exportFormat === "csv" ? (
                <><Download className="w-3.5 h-3.5" /> CSV 다운로드</>
              ) : (
                <><FileSpreadsheet className="w-3.5 h-3.5" /> 엑셀 다운로드</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

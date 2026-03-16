import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  Banknote,
  User,
} from "lucide-react";

/** YYYY-MM-DD 형식으로 날짜 반환 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 급여 계산 기간: 전월 급여일 ~ 당월 급여일 전날
 * 예) 급여일 14일 → 전월 14일 ~ 이번달 13일
 */
function calcPayPeriod(year: number, month: number, payDay: number) {
  const startDate = new Date(year, month - 2, payDay);
  const endDate = new Date(year, month - 1, payDay - 1);
  return {
    startDate: toDateStr(startDate),
    endDate: toDateStr(endDate),
    label: `${startDate.getFullYear()}년 ${startDate.getMonth() + 1}월 ${startDate.getDate()}일 ~ ${endDate.getFullYear()}년 ${endDate.getMonth() + 1}월 ${endDate.getDate()}일`,
  };
}

/** 분을 소수 시간으로 변환 */
function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** 분을 HH시간 MM분 형식으로 변환 */
function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

const PRESET_WAGES = [
  { label: "10,320원", value: 10320 },
  { label: "11,000원", value: 11000 },
  { label: "12,000원", value: 12000 },
];

const now = new Date();

export default function PayCalculator() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [payDay, setPayDay] = useState(14);
  const [hourlyWage, setHourlyWage] = useState(10320);
  const [customWage, setCustomWage] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // 알바생 목록 조회
  const { data: workers = [] } = trpc.workers.list.useQuery();

  // 급여 기간 계산
  const payPeriod = useMemo(() => calcPayPeriod(year, month, payDay), [year, month, payDay]);

  // 날짜 범위 기반 근무 데이터 조회 (알바생 선택 + 기간 확정 시)
  const { data: rangeStats = [], isLoading: isLoadingStats } = trpc.statistics.byDateRange.useQuery(
    { startDate: payPeriod.startDate, endDate: payPeriod.endDate },
    { enabled: selectedWorkerId !== null }
  );

  // 선택된 알바생의 해당 기간 근무 데이터
  const workerStat = useMemo(() => {
    if (!selectedWorkerId) return null;
    return rangeStats.find((s) => s.workerId === selectedWorkerId) ?? null;
  }, [rangeStats, selectedWorkerId]);

  const breakdown = useMemo(() => {
    if (!workerStat) return [];
    return workerStat.dailyBreakdown.filter(
      (d) => d.date >= payPeriod.startDate && d.date <= payPeriod.endDate
    );
  }, [workerStat, payPeriod]);

  const totalMinutes = useMemo(() => breakdown.reduce((sum, d) => sum + d.minutes, 0), [breakdown]);
  const totalHours = minutesToDecimalHours(totalMinutes);
  const effectiveWage = isCustom ? (parseInt(customWage.replace(/,/g, ""), 10) || 0) : hourlyWage;
  const totalPay = Math.round(totalHours * effectiveWage);

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);

  function handleCalculate() {
    setCalculated(true);
    setDetailOpen(false);
  }

  function handleWageSelect(value: number) {
    setHourlyWage(value);
    setIsCustom(false);
    setCustomWage("");
  }

  function handleCustomWageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setCustomWage(raw ? Number(raw).toLocaleString() : "");
    setIsCustom(true);
  }

  // 월 선택 옵션 생성 (현재 월 기준 ±12개월)
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = -12; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return opts;
  }, []);

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4 py-2">
        {/* 페이지 헤더 */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">급여 계산기</h1>
            <p className="text-xs text-muted-foreground">급여 기간별 예상 급여를 확인하세요</p>
          </div>
        </div>

        {/* 설정 카드 */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              계산 설정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 알바생 선택 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">알바생 선택</Label>
              <Select
                value={selectedWorkerId?.toString() ?? ""}
                onValueChange={(v) => {
                  setSelectedWorkerId(Number(v));
                  setCalculated(false);
                }}
              >
                <SelectTrigger className="h-11 bg-secondary/30">
                  <SelectValue placeholder="알바생을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      <span className="flex items-center gap-2">
                        {w.name}
                        <Badge variant="outline" className="text-[10px] h-4">
                          {w.skillLevel === "main" ? "메인" : "서브"}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 급여 지급 월 + 급여일 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">급여 지급 월</Label>
                <Select
                  value={`${year}-${month}`}
                  onValueChange={(v) => {
                    const [y, m] = v.split("-").map(Number);
                    setYear(y);
                    setMonth(m);
                    setCalculated(false);
                  }}
                >
                  <SelectTrigger className="h-11 bg-secondary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                        {o.year}년 {o.month}월
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">급여일</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={payDay}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(31, parseInt(e.target.value) || 14));
                      setPayDay(v);
                      setCalculated(false);
                    }}
                    className="h-11 bg-secondary/30 text-center text-base"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">일</span>
                </div>
              </div>
            </div>

            {/* 급여 기간 미리보기 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">급여 계산 기간:</span>
              <span className="text-xs font-semibold text-primary">{payPeriod.label}</span>
            </div>

            {/* 시급 선택 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">시급 선택</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_WAGES.map((p) => (
                  <Button
                    key={p.value}
                    variant={!isCustom && hourlyWage === p.value ? "default" : "outline"}
                    size="sm"
                    className="h-9 text-sm"
                    onClick={() => handleWageSelect(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="직접 입력 (원)"
                  value={customWage}
                  onChange={handleCustomWageChange}
                  className={`h-10 bg-secondary/30 ${isCustom ? "border-primary ring-1 ring-primary/30" : ""}`}
                />
                {isCustom && customWage && (
                  <span className="text-xs text-primary shrink-0 font-medium">
                    {Number(customWage.replace(/,/g, "")).toLocaleString()}원
                  </span>
                )}
              </div>
            </div>

            {/* 계산하기 버튼 */}
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={handleCalculate}
              disabled={!selectedWorkerId || isLoadingStats}
            >
              <Calculator className="w-4 h-4 mr-2" />
              {isLoadingStats ? "데이터 불러오는 중..." : "계산하기"}
            </Button>
          </CardContent>
        </Card>

        {/* 계산 결과 */}
        {calculated && selectedWorker && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="pt-5 pb-4 space-y-4">
              {/* 결과 헤더 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-base">{selectedWorker.name}님 예상 급여</span>
                </div>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  {payPeriod.label.split(" ~ ")[0].replace(/년 /g, ".").replace(/월 /g, ".").replace(/일/, "")} ~{" "}
                  {payPeriod.label.split(" ~ ")[1].replace(/년 /g, ".").replace(/월 /g, ".").replace(/일/, "")}
                </Badge>
              </div>

              {/* 핵심 수치 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-secondary/40">
                  <p className="text-xs text-muted-foreground mb-1">근무일수</p>
                  <p className="text-xl font-bold">{breakdown.length}</p>
                  <p className="text-xs text-muted-foreground">일</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-secondary/40">
                  <p className="text-xs text-muted-foreground mb-1">총 근무시간</p>
                  <p className="text-xl font-bold">{totalHours}</p>
                  <p className="text-xs text-muted-foreground">시간</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-secondary/40">
                  <p className="text-xs text-muted-foreground mb-1">시급</p>
                  <p className="text-xl font-bold">{effectiveWage.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">원</p>
                </div>
              </div>

              {/* 총 급여 */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium">예상 총 급여</span>
                <span className="text-2xl font-bold text-primary">
                  {totalPay.toLocaleString()}원
                </span>
              </div>

              {breakdown.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  해당 기간에 근무 기록이 없습니다.
                </p>
              )}

              {/* 상세보기 토글 */}
              {breakdown.length > 0 && (
                <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full h-9 text-sm text-muted-foreground hover:text-foreground">
                      <Clock className="w-4 h-4 mr-1.5" />
                      상세 근무 내역 {detailOpen ? "접기" : "보기"}
                      {detailOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-1.5 max-h-80 overflow-y-auto">
                      {breakdown.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-20 shrink-0">{d.date}</span>
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                              {d.dayOfWeek}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{d.timeSlot}타임</span>
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            <span className="text-xs text-muted-foreground">
                              {d.startTime} ~ {d.endTime}
                            </span>
                            <span className="font-medium text-primary w-14 text-right">
                              {minutesToHHMM(d.minutes)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {/* 합계 행 */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm font-semibold mt-2">
                        <span>합계</span>
                        <span className="text-primary">{minutesToHHMM(totalMinutes)} ({totalHours}h)</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Users, BarChart3, CalendarCheck, Bell, Save, Megaphone, X, FlaskConical } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 6=토
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek); // 이번 주 일요일
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // 이번 주 토요일
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

function getWorkStatus(count: number) {
  if (count <= 3) return { label: "부족", color: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" };
  if (count === 4) return { label: "적정", color: "bg-green-600/20 text-green-400 border-green-600/30" };
  return { label: "초과", color: "bg-red-600/20 text-red-400 border-red-600/30" };
}

export default function Settings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);
  const [formName, setFormName] = useState("");
  const [formSkillLevel, setFormSkillLevel] = useState<"main" | "sub" | "trainee">("sub");
  const [formDaysOff, setFormDaysOff] = useState<string[]>([]);
  const [formPreferredDays, setFormPreferredDays] = useState<string[]>([]);
  const [formPayDay, setFormPayDay] = useState<number>(14);
  const [formEmail, setFormEmail] = useState<string>("");
  const [formDefaultStartTime, setFormDefaultStartTime] = useState<string>("");
  const [formDefaultEndTime, setFormDefaultEndTime] = useState<string>("");
  const [formHourlyWage, setFormHourlyWage] = useState<string>("");

  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");

  const utils = trpc.useUtils();
  const { data: workers = [], isLoading } = trpc.workers.list.useQuery();
  const weekRange = useMemo(() => getWeekRange(), []);
  const { data: weekCounts = {} } = trpc.schedules.weeklyWorkerCounts.useQuery(weekRange);
  const { data: allAnnouncements = [] } = trpc.announcements.getAll.useQuery();
  const createActivityLogMutation = trpc.activityLogs.create.useMutation();

  const createAnnouncementMutation = trpc.announcements.create.useMutation({
    onSuccess: () => {
      utils.announcements.getAll.invalidate();
      utils.announcements.getActive.invalidate();
      setAnnouncementTitle("");
      setAnnouncementContent("");
      toast.success("공지가 전송되었습니다.");
    },
    onError: () => toast.error("공지 전송에 실패했습니다."),
  });

  const deactivateAnnouncementMutation = trpc.announcements.deactivate.useMutation({
    onSuccess: () => {
      utils.announcements.getAll.invalidate();
      utils.announcements.getActive.invalidate();
    },
  });

  const testNotificationMutation = trpc.notification.test.useMutation({
    onSuccess: (data) => {
      const pushMsg = data.push.success ? `푸시 ✅` : `푸시 ❌ (${data.push.message})`;
      const emailMsg = data.email.success ? `이메일 ✅` : `이메일 ❌ (${data.email.message})`;
      toast.success(`알림 테스트 완료: ${pushMsg} / ${emailMsg}`);
    },
    onError: () => toast.error("알림 테스트에 실패했습니다."),
  });

  const createMutation = trpc.workers.create.useMutation({
    onSuccess: (_data, variables) => {
      utils.workers.list.invalidate();
      toast.success("알바생이 추가되었습니다.");
      createActivityLogMutation.mutate({
        workerId: null,
        workerName: "관리자",
        actionType: "worker_created",
        description: `알바생 ${variables.name}님이 추가되었습니다. (스킬: ${variables.skillLevel === "main" ? "메인" : "서브"}, 휴무요일: ${variables.fixedDaysOff || "없음"})`,
        metadata: JSON.stringify(variables),
      });
      resetForm();
    },
  });

  const updateMutation = trpc.workers.update.useMutation({
    onSuccess: (_data, variables) => {
      utils.workers.list.invalidate();
      toast.success("알바생 정보가 수정되었습니다.");
      const worker = workers.find((w) => w.id === variables.id);
      const workerName = worker?.name ?? "알 수 없음";
      // 휴무요일 변경이 있는 경우
      if (variables.fixedDaysOff !== undefined) {
        const oldDaysOff = worker?.fixedDaysOff || "";
        const newDaysOff = variables.fixedDaysOff || "";
        if (oldDaysOff !== newDaysOff) {
          createActivityLogMutation.mutate({
            workerId: variables.id,
            workerName,
            actionType: "fixed_days_off_update",
            description: `${workerName}님의 휴무요일이 변경되었습니다: ${newDaysOff || "없음"}`,
            metadata: JSON.stringify({ before: oldDaysOff, after: newDaysOff }),
          });
        }
      }
      createActivityLogMutation.mutate({
        workerId: variables.id,
        workerName,
        actionType: "worker_updated",
        description: `${workerName}님의 정보가 수정되었습니다.`,
        metadata: JSON.stringify(variables),
      });
      resetForm();
    },
  });

  const deleteMutation = trpc.workers.delete.useMutation({
    onSuccess: (_data, variables) => {
      const worker = workers.find((w) => w.id === variables.id);
      utils.workers.list.invalidate();
      toast.success("알바생이 삭제되었습니다.");
      createActivityLogMutation.mutate({
        workerId: null,
        workerName: "관리자",
        actionType: "worker_deleted",
        description: `알바생 ${worker?.name ?? variables.id}님이 삭제되었습니다.`,
        metadata: JSON.stringify({ workerId: variables.id, workerName: worker?.name }),
      });
    },
  });

  function resetForm() {
    setFormName("");
    setFormSkillLevel("sub");
    setFormDaysOff([]);
    setFormPreferredDays([]);
    setFormPayDay(14);
    setFormEmail("");
    setFormDefaultStartTime("");
    setFormDefaultEndTime("");
    setFormHourlyWage("");
    setEditingWorker(null);
    setDialogOpen(false);
  }

  function openEditDialog(worker: any) {
    setEditingWorker(worker);
    setFormName(worker.name);
    setFormSkillLevel(worker.skillLevel);
    setFormDaysOff(worker.fixedDaysOff ? worker.fixedDaysOff.split(",").filter(Boolean) : []);
    setFormPreferredDays(worker.preferredDays ? worker.preferredDays.split(",").filter(Boolean) : []);
    setFormPayDay(worker.payDay ?? 14);
    setFormEmail(worker.email ?? "");
    setFormDefaultStartTime(worker.defaultStartTime ?? "");
    setFormDefaultEndTime(worker.defaultEndTime ?? "");
    setFormHourlyWage(worker.hourlyWage ? String(worker.hourlyWage) : "");
    setDialogOpen(true);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formName.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    const daysOffStr = formDaysOff.join(",");
    const preferredStr = formPreferredDays.join(",");
    const emailVal = formEmail.trim() || null;
    const defaultStartVal = formDefaultStartTime.trim() || null;
    const defaultEndVal = formDefaultEndTime.trim() || null;
    const hourlyWageVal = formHourlyWage ? parseInt(formHourlyWage.replace(/,/g, ""), 10) || null : null;
    if (editingWorker) {
      updateMutation.mutate({
        id: editingWorker.id,
        name: formName.trim(),
        skillLevel: formSkillLevel,
        fixedDaysOff: daysOffStr,
        preferredDays: preferredStr,
        payDay: formPayDay,
        email: emailVal,
        hourlyWage: hourlyWageVal,
        defaultStartTime: defaultStartVal,
        defaultEndTime: defaultEndVal,
      });
    } else {
      createMutation.mutate({
        name: formName.trim(),
        skillLevel: formSkillLevel,
        fixedDaysOff: daysOffStr,
        preferredDays: preferredStr,
        payDay: formPayDay,
        email: emailVal,
        hourlyWage: hourlyWageVal,
        defaultStartTime: defaultStartVal,
        defaultEndTime: defaultEndVal,
      });
    }
  }

  function toggleDayOff(day: string) {
    setFormDaysOff((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    // If day is added to days off, remove from preferred
    if (!formDaysOff.includes(day)) {
      setFormPreferredDays((prev) => prev.filter((d) => d !== day));
    }
  }

  function togglePreferredDay(day: string) {
    if (formDaysOff.includes(day)) return; // Can't prefer a day off
    setFormPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  const mainWorkers = workers.filter((w) => w.skillLevel === "main");
  const subWorkers = workers.filter((w) => w.skillLevel === "sub");
  const traineeWorkers = workers.filter((w) => w.skillLevel === "trainee");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Settings</h2>
            <p className="text-sm text-muted-foreground">알바생 명단 및 주간 통계</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={() => setAnnouncementDialogOpen(true)}>
              <Megaphone className="w-3.5 h-3.5" />
              공지
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent"
              disabled={testNotificationMutation.isPending}
              onClick={() => testNotificationMutation.mutate()}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {testNotificationMutation.isPending ? "발송 중..." : "알림테스트"}
            </Button>
            <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              추가
            </Button>
          </div>
        </div>

        {/* Weekly Stats */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                이번 주 근무 현황
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {weekRange.startDate.slice(5).replace("-", "/")} (일) ~ {weekRange.endDate.slice(5).replace("-", "/")} (토)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {workers.map((w) => {
                const count = (weekCounts as Record<string, number>)[String(w.id)] || 0;
                const status = getWorkStatus(count);
                return (
                  <div key={w.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{w.name}</span>
                      <span className="text-xs text-muted-foreground">{count}일</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${status.color}`}>
                      {status.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Worker List - Main */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              메인 (숙련도 상)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mainWorkers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">메인 알바생이 없습니다.</p>
            )}
            {mainWorkers.map((w) => (
              <WorkerRow key={w.id} worker={w} onEdit={() => openEditDialog(w)} onDelete={() => deleteMutation.mutate({ id: w.id })} />
            ))}
          </CardContent>
        </Card>

        {/* Worker List - Sub */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              서브 (숙련도 중)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {subWorkers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">서브 알바생이 없습니다.</p>
            )}
            {subWorkers.map((w) => (
              <WorkerRow key={w.id} worker={w} onEdit={() => openEditDialog(w)} onDelete={() => deleteMutation.mutate({ id: w.id })} />
            ))}
          </CardContent>
        </Card>

        {/* Worker List - Trainee */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              수습 (숙련도 하)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {traineeWorkers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">수습 알바생이 없습니다.</p>
            )}
            {traineeWorkers.map((w) => (
              <WorkerRow key={w.id} worker={w} onEdit={() => openEditDialog(w)} onDelete={() => deleteMutation.mutate({ id: w.id })} />
            ))}
          </CardContent>
        </Card>

        {/* 알림 설정 */}
        <AdminNotificationSettings />

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle>{editingWorker ? "알바생 수정" : "알바생 추가"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>이름</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="이름 입력"
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label>숙련도</Label>
                <Select value={formSkillLevel} onValueChange={(v) => setFormSkillLevel(v as "main" | "sub" | "trainee")}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">메인 (숙련도 상)</SelectItem>
                    <SelectItem value="sub">서브 (숙련도 중)</SelectItem>
                    <SelectItem value="trainee">수습 (숙련도 하)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>고정 휴무 요일</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <label
                      key={day}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                        formDaysOff.includes(day)
                          ? "bg-destructive/20 border-destructive/50 text-destructive"
                          : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <Checkbox
                        checked={formDaysOff.includes(day)}
                        onCheckedChange={() => toggleDayOff(day)}
                        className="hidden"
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarCheck className="w-3.5 h-3.5 text-primary" />
                  선호 근무 요일
                </Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const isOff = formDaysOff.includes(day);
                    return (
                      <label
                        key={day}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          isOff
                            ? "bg-muted/30 border-border/50 text-muted-foreground/40 cursor-not-allowed"
                            : formPreferredDays.includes(day)
                            ? "bg-primary/20 border-primary/50 text-primary cursor-pointer"
                            : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30 cursor-pointer"
                        }`}
                      >
                        <Checkbox
                          checked={formPreferredDays.includes(day)}
                          onCheckedChange={() => togglePreferredDay(day)}
                          disabled={isOff}
                          className="hidden"
                        />
                        {day}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">자동 배정 시 선호 요일이 우선 반영됩니다.</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  급여일
                  <span className="text-[10px] text-muted-foreground font-normal">(매월 몇 일에 급여를 받는지)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={formPayDay}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 31) setFormPayDay(v);
                    }}
                    className="bg-secondary/50 w-24"
                    placeholder="14"
                  />
                  <span className="text-sm text-muted-foreground">일</span>
                </div>
                <p className="text-[10px] text-muted-foreground">급여 계산기에서 자동으로 불러옵니다.</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  시급
                  <span className="text-[10px] text-muted-foreground font-normal">(급여 자동 계산 및 급여일 전날 이메일 발송용)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={formHourlyWage}
                    onChange={(e) => setFormHourlyWage(e.target.value)}
                    className="bg-secondary/50 w-32"
                    placeholder="10030"
                  />
                  <span className="text-sm text-muted-foreground">원</span>
                  {formHourlyWage && (
                    <span className="text-xs text-primary">{Number(formHourlyWage).toLocaleString()}원</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  이메일
                  <span className="text-[10px] text-muted-foreground font-normal">(출근 예정 알림 수신용, 선택)</span>
                </Label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="bg-secondary/50"
                />
                <p className="text-[10px] text-muted-foreground">입력 시 근무 1시간 전에 자동으로 알림 이메일이 발송됩니다.</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  기본 근무 시간
                  <span className="text-[10px] text-muted-foreground font-normal">(Master에서 배정 시 자동 적용)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={formDefaultStartTime}
                    onChange={(e) => setFormDefaultStartTime(e.target.value)}
                    className="bg-secondary/50 flex-1"
                    placeholder="18:00"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">~</span>
                  <Input
                    type="time"
                    value={formDefaultEndTime}
                    onChange={(e) => setFormDefaultEndTime(e.target.value)}
                    className="bg-secondary/50 flex-1"
                    placeholder="21:00"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">미입력 시 타임별 기본값 사용 (A: 17:30, B/C: 18:00 ~ 22:00)</p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" className="bg-transparent">취소</Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingWorker ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 공지사항 다이얼로그 */}
        <Dialog open={announcementDialogOpen} onOpenChange={setAnnouncementDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" />
                공지사항
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Input
                  placeholder="제목 (예: 오늘 단체 예약 있어요)"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="bg-secondary/50 h-9 text-sm"
                />
                <Textarea
                  placeholder="내용을 입력하세요"
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  className="bg-secondary/50 text-sm resize-none"
                  rows={3}
                />
                <Button
                  className="w-full gap-1.5"
                  disabled={!announcementTitle.trim() || !announcementContent.trim() || createAnnouncementMutation.isPending}
                  onClick={() => createAnnouncementMutation.mutate({ title: announcementTitle, content: announcementContent })}
                >
                  <Bell className="w-3.5 h-3.5" />
                  {createAnnouncementMutation.isPending ? "전송 중..." : "공지 전송"}
                </Button>
              </div>

              {/* 공지 목록 */}
              {allAnnouncements.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-border/50 max-h-60 overflow-y-auto">
                  <p className="text-[10px] text-muted-foreground font-medium">공지 내역</p>
                  {allAnnouncements.slice().reverse().map((a) => (
                    <div key={a.id} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${a.isActive ? "border-primary/30 bg-primary/5" : "border-border/30 bg-secondary/20 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium truncate">{a.title}</span>
                          {a.isActive && <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/20 text-primary border-primary/30">활성</Badge>}
                        </div>
                        <p className="text-muted-foreground text-[11px] line-clamp-2">{a.content}</p>
                        <p className="text-muted-foreground/50 text-[10px] mt-0.5">{new Date(a.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      {a.isActive && (
                        <button
                          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                          onClick={() => deactivateAnnouncementMutation.mutate({ id: a.id })}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

/** 급여일 기준 정산 기간 계산 (client-side) */
function calcPayPeriod(payDay: number): { startDate: string; endDate: string } {
  const now = new Date();
  const today = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();

  let periodStart: Date;
  let periodEnd: Date;

  if (today >= payDay) {
    periodStart = new Date(year, month, payDay);
    periodEnd = new Date(year, month + 1, payDay - 1);
  } else {
    periodStart = new Date(year, month - 1, payDay);
    periodEnd = new Date(year, month, payDay - 1);
  }

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(periodStart), endDate: fmt(periodEnd) };
}

function AdminNotificationSettings() {
  const [emailInput, setEmailInput] = useState("");
  const { data, isLoading } = trpc.settings.get.useQuery({ key: "adminNotificationEmail" });
  const setMutation = trpc.settings.set.useMutation({
    onSuccess: () => toast.success("관리자 알림 이메일이 저장되었습니다."),
    onError: () => toast.error("저장에 실패했습니다."),
  });

  // 서버에서 불러온 값을 input에 반영
  const loadedValue = data?.value ?? "";
  const [initialized, setInitialized] = useState(false);
  if (!initialized && !isLoading) {
    setEmailInput(loadedValue);
    setInitialized(true);
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          알림 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            관리자 알림 이메일
            <span className="ml-1 text-[10px] text-muted-foreground/60">(출퇴근 수정 시 알림 발송)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="admin@example.com, admin2@example.com"
              className="bg-secondary/50 text-sm flex-1"
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={() => setMutation.mutate({ key: "adminNotificationEmail", value: emailInput.trim() })}
              disabled={setMutation.isPending || isLoading}
              className="gap-1.5 shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              저장
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            쉼표로 구분하여 여러 명에게 발송 가능 · 미입력 시 환경변수 ADMIN_NOTIFICATION_EMAIL 사용
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerRow({
  worker,
  onEdit,
  onDelete,
}: {
  worker: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const daysOff = worker.fixedDaysOff ? worker.fixedDaysOff.split(",").filter(Boolean) : [];
  const preferred = worker.preferredDays ? worker.preferredDays.split(",").filter(Boolean) : [];

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{worker.name}</span>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              worker.skillLevel === "main"
                ? "border-primary/50 text-primary"
                : worker.skillLevel === "trainee"
                ? "border-orange-500/50 text-orange-400"
                : "border-muted-foreground/30 text-muted-foreground"
            }`}
          >
            {worker.skillLevel === "main" ? "메인" : worker.skillLevel === "trainee" ? "수습" : "서브"}
          </Badge>
        </div>
        {daysOff.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">휴무:</span>
            {daysOff.map((d: string) => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                {d}
              </span>
            ))}
          </div>
        )}
        {preferred.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">선호:</span>
            {preferred.map((d: string) => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {d}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground">급여일:</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            매월 {worker.payDay ?? 14}일
          </span>
          {worker.hourlyWage && (
            <>
              <span className="text-[10px] text-muted-foreground ml-1">시급:</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                {Number(worker.hourlyWage).toLocaleString()}원
              </span>
            </>
          )}
        </div>
        {worker.email && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">이메일:</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
              {worker.email}
            </span>
          </div>
        )}
        {(worker.defaultStartTime || worker.defaultEndTime) && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">기본 시간:</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
              {worker.defaultStartTime || "?"} ~ {worker.defaultEndTime || "?"}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

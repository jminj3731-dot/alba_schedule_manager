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
import { Plus, Pencil, Trash2, Users, BarChart3, CalendarCheck } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
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
  const [formSkillLevel, setFormSkillLevel] = useState<"main" | "sub">("sub");
  const [formDaysOff, setFormDaysOff] = useState<string[]>([]);
  const [formPreferredDays, setFormPreferredDays] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const { data: workers = [], isLoading } = trpc.workers.list.useQuery();
  const weekRange = useMemo(() => getWeekRange(), []);
  const { data: weekCounts = {} } = trpc.schedules.weeklyWorkerCounts.useQuery(weekRange);

  const createMutation = trpc.workers.create.useMutation({
    onSuccess: () => {
      utils.workers.list.invalidate();
      toast.success("알바생이 추가되었습니다.");
      resetForm();
    },
  });

  const updateMutation = trpc.workers.update.useMutation({
    onSuccess: () => {
      utils.workers.list.invalidate();
      toast.success("알바생 정보가 수정되었습니다.");
      resetForm();
    },
  });

  const deleteMutation = trpc.workers.delete.useMutation({
    onSuccess: () => {
      utils.workers.list.invalidate();
      toast.success("알바생이 삭제되었습니다.");
    },
  });

  function resetForm() {
    setFormName("");
    setFormSkillLevel("sub");
    setFormDaysOff([]);
    setFormPreferredDays([]);
    setEditingWorker(null);
    setDialogOpen(false);
  }

  function openEditDialog(worker: any) {
    setEditingWorker(worker);
    setFormName(worker.name);
    setFormSkillLevel(worker.skillLevel);
    setFormDaysOff(worker.fixedDaysOff ? worker.fixedDaysOff.split(",").filter(Boolean) : []);
    setFormPreferredDays(worker.preferredDays ? worker.preferredDays.split(",").filter(Boolean) : []);
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
    if (editingWorker) {
      updateMutation.mutate({
        id: editingWorker.id,
        name: formName.trim(),
        skillLevel: formSkillLevel,
        fixedDaysOff: daysOffStr,
        preferredDays: preferredStr,
      });
    } else {
      createMutation.mutate({
        name: formName.trim(),
        skillLevel: formSkillLevel,
        fixedDaysOff: daysOffStr,
        preferredDays: preferredStr,
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Settings</h2>
            <p className="text-sm text-muted-foreground">알바생 명단 및 주간 통계</p>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            추가
          </Button>
        </div>

        {/* Weekly Stats */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              이번 주 근무 현황
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
                <Select value={formSkillLevel} onValueChange={(v) => setFormSkillLevel(v as "main" | "sub")}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">메인 (숙련도 상)</SelectItem>
                    <SelectItem value="sub">서브 (숙련도 중)</SelectItem>
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
      </div>
    </AppLayout>
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
                : "border-muted-foreground/30 text-muted-foreground"
            }`}
          >
            {worker.skillLevel === "main" ? "메인" : "서브"}
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

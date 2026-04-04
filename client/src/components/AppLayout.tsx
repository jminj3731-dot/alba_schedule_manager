import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Settings, CalendarDays, Lock, Home, BarChart3, Calculator, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ADMIN_PASSWORD = "대한한우";

const tabs = [
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/master", label: "Master", icon: CalendarDays },
  { path: "/statistics", label: "통계", icon: BarChart3 },
  { path: "/pay-calculator", label: "계산기", icon: Calculator },
  { path: "/activity-log", label: "로그", icon: ClipboardList },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("admin_auth") === "true";
  });
  const [password, setPassword] = useState("");

  function handleAuth() {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      setPassword("");
    } else {
      toast.error("비밀번호가 올바르지 않습니다.");
    }
  }

  // 비밀번호 미인증 시 잠금 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">관리자 인증</h2>
            <p className="text-sm text-muted-foreground">
              이 페이지는 관리자만 접근할 수 있습니다.
            </p>
          </div>
          <div className="space-y-3">
            <Input
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="h-12 bg-secondary/50 text-base input-masked"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              placeholder="비밀번호 입력"
            />
            <Button onClick={handleAuth} className="w-full h-12">
              확인
            </Button>
          </div>
          <div className="text-center">
            <Link href="/">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                ← 메인으로 돌아가기
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          <Link href="/">
            <h1 className="text-lg font-bold tracking-tight cursor-pointer">
              <span className="text-primary">ALBA</span>
              <span className="text-foreground ml-1">Schedule</span>
            </h1>
          </Link>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {tabs.map((tab) => {
              const isActive = location === tab.path;
              return (
                <Link key={tab.path} href={tab.path}>
                  <span
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </nav>
          {/* 메인 버튼 - 우상단 */}
          <Link href="/">
            <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-1.5 h-8">
              <Home className="w-3.5 h-3.5" />
              메인
            </Button>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-4 pb-24 sm:pb-4">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {/* 메인 버튼 - 모바일에서는 첫 번째 위치 */}
          <Link href="/">
            <span
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
                location === "/" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium">메인</span>
            </span>
          </Link>
          {tabs.map((tab) => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <Link key={tab.path} href={tab.path}>
                <span
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

import { useLocation, Link } from "wouter";
import { Settings, CalendarDays, Home, BarChart3, Calculator, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

const tabs = [
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/master", label: "Master", icon: CalendarDays },
  { path: "/statistics", label: "통계", icon: BarChart3 },
  { path: "/pay-calculator", label: "계산기", icon: Calculator },
  { path: "/activity-log", label: "로그", icon: ClipboardList },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          <Link href="/">
            <h1 className="text-lg font-bold tracking-tight cursor-pointer">
              <span className="text-primary">대한한우</span>
              <span className="text-foreground ml-1">스케줄</span>
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
                    isActive ? "text-primary" : "text-muted-foreground"
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

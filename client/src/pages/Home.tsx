import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Settings, CalendarDays, Eye, Clock, Users, AlertTriangle } from "lucide-react";

export default function Home() {
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Hero */}
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Clock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            알바생 스케줄 관리
          </h2>
          <p className="text-muted-foreground text-sm">
            효율적인 근무 스케줄 관리 및 시각화 시스템
          </p>
        </div>

        {/* Quick access cards */}
        <div className="grid gap-3">
          <Link href="/settings">
            <Card className="border-border hover:border-primary/50 transition-colors cursor-pointer bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <Settings className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-card-foreground">Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    알바생 명단, 숙련도, 고정 휴무 관리 및 주간 통계
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/master">
            <Card className="border-border hover:border-primary/50 transition-colors cursor-pointer bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <CalendarDays className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-card-foreground">Master</h3>
                  <p className="text-sm text-muted-foreground">
                    날짜별 스케줄 입력, A/B/C 타임 배정 및 오류 체크
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/worker">
            <Card className="border-border hover:border-primary/50 transition-colors cursor-pointer bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <Eye className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-card-foreground">Worker View</h3>
                  <p className="text-sm text-muted-foreground">
                    이번 주 스케줄 확인, 달력/카드 뷰 (모바일 최적화)
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Info section */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-card-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" />
              운영 규칙 요약
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-primary/60 shrink-0" />
                <span>평일(일~목) 2명, 주말(금~토) 3명 근무</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 mt-0.5 text-primary/60 shrink-0" />
                <span>A타임 17:30~22:00 / B,C타임 18:00~22:00</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-primary/60 shrink-0" />
                <span>모든 시간대에 메인 숙련자 최소 1명 필수</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

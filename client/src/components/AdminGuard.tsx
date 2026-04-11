import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "adminAuthenticated";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );
  const [password, setPassword] = useState("");

  const verifyMutation = trpc.settings.verifyAdminPassword.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        localStorage.setItem(STORAGE_KEY, "true");
        setAuthenticated(true);
      } else {
        toast.error("비밀번호가 틀렸습니다.");
        setPassword("");
      }
    },
    onError: () => toast.error("오류가 발생했습니다."),
  });

  if (authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-xs space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              <span className="text-primary">대한한우</span> 스케줄
            </h1>
            <p className="text-sm text-muted-foreground mt-1">관리자 비밀번호를 입력하세요</p>
          </div>
        </div>

        <div className="space-y-3">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) verifyMutation.mutate({ password });
            }}
            placeholder="비밀번호"
            className="bg-secondary/50 text-center tracking-widest text-lg h-12"
            autoFocus
          />
          <Button
            className="w-full h-11"
            disabled={!password || verifyMutation.isPending}
            onClick={() => verifyMutation.mutate({ password })}
          >
            {verifyMutation.isPending ? "확인 중..." : "입력"}
          </Button>
        </div>
      </div>
    </div>
  );
}

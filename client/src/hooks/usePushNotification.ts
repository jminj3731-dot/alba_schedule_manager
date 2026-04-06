import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function usePushNotification(workerId: number | null, workerName: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: vapidData } = trpc.push.getVapidPublicKey.useQuery(undefined, {
    enabled: !!workerName,
  });
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  const isSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!isSupported || !workerName) return;
    setPermission(Notification.permission);
    // 현재 구독 여부 확인
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    }).catch(() => {});
  }, [workerName, isSupported]);

  async function subscribe() {
    if (!isSupported || !workerName || !vapidData?.publicKey) return;
    setIsLoading(true);
    try {
      // 서비스 워커 등록
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 알림 권한 요청
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setIsLoading(false);
        return;
      }

      // 기존 구독 해지 후 새로 구독
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      const json = sub.toJSON();
      await subscribeMutation.mutateAsync({
        workerId,
        workerName,
        endpoint: json.endpoint!,
        p256dh: (json.keys as any).p256dh,
        auth: (json.keys as any).auth,
      });

      setIsSubscribed(true);
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribe() {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("[Push] Unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}

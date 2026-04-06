import webpush from "web-push";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.GMAIL_USER || "admin@example.com";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export async function savePushSubscription(data: {
  workerId: number | null;
  workerName: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 같은 endpoint가 있으면 업데이트, 없으면 삽입
  const existing = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, data.endpoint)).limit(1);
  if (existing.length > 0) {
    await db.update(pushSubscriptions)
      .set({ workerId: data.workerId, workerName: data.workerName, p256dh: data.p256dh, auth: data.auth })
      .where(eq(pushSubscriptions.endpoint, data.endpoint));
  } else {
    await db.insert(pushSubscriptions).values(data as any);
  }
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getSubscriptionsByWorkerName(workerName: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.workerName, workerName));
}

export async function sendPushToWorker(workerName: string, title: string, body: string, url = "/"): Promise<void> {
  if (!ensureVapid()) return;
  const subs = await getSubscriptionsByWorkerName(workerName);
  const db = await getDb();
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url, tag: `shift-${Date.now()}` })
      );
    } catch (err: any) {
      // 410 Gone = 구독 만료 → DB에서 삭제
      if (err.statusCode === 410 && db) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      }
      console.error(`[Push] Failed to send to ${workerName}:`, err.message);
    }
  }
}

export { VAPID_PUBLIC_KEY };

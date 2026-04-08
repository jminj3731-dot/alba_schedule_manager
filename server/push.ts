import webpush from "web-push";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.BREVO_FROM_EMAIL || process.env.BREVO_SMTP_USER || "admin@example.com";

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

async function sendToSubscription(sub: { endpoint: string; p256dh: string; auth: string }, payload: object): Promise<boolean> {
  const db = await getDb();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    if ((err.statusCode === 410 || err.statusCode === 404) && db) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      console.log(`[Push] Removed expired subscription`);
    } else {
      console.error(`[Push] Send failed (status=${err.statusCode}):`, err.message);
    }
    return false;
  }
}

export async function sendPushToWorker(workerName: string, title: string, body: string, url = "/"): Promise<void> {
  if (!ensureVapid()) {
    console.warn("[Push] VAPID not configured, skipping push");
    return;
  }
  const subs = await getSubscriptionsByWorkerName(workerName);
  if (subs.length === 0) return;
  for (const sub of subs) {
    const ok = await sendToSubscription(sub, { title, body, url, tag: `shift-${Date.now()}` });
    if (ok) console.log(`[Push] ✅ Sent to ${workerName}`);
  }
}

export async function sendPushToAll(title: string, body: string, url = "/"): Promise<void> {
  if (!ensureVapid()) {
    console.warn("[Push] VAPID not configured, skipping push");
    return;
  }
  const db = await getDb();
  if (!db) return;
  const subs = await db.select().from(pushSubscriptions);
  console.log(`[Push] Sending announcement to ${subs.length} subscribers`);
  let success = 0;
  for (const sub of subs) {
    const ok = await sendToSubscription(sub, { title, body, url, tag: "announcement" });
    if (ok) success++;
  }
  console.log(`[Push] ✅ Announcement sent to ${success}/${subs.length}`);
}

export { VAPID_PUBLIC_KEY };

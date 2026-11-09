import { supabase } from "./supabase";

// اشتراك المتصفح في إشعارات الويب وحفظه في جدول push_subscriptions.
// المفتاح العام يُجلب من دالة get-vapid-public-key؛ المفتاح الخاص يبقى في الخادم.

export function pushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registerWorker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

// "unsupported" | "denied" | "subscribed" | "off"
export async function getPushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "subscribed" : "off";
}

export async function enablePush(userId) {
  if (!pushSupported()) throw new Error("المتصفح لا يدعم الإشعارات.");

  setOptOut(false);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("لم يتم السماح بالإشعارات من إعدادات المتصفح.");
  }

  const { data, error } = await supabase.functions.invoke(
    "get-vapid-public-key"
  );
  if (error || !data?.publicKey) {
    throw new Error("تعذر تجهيز الإشعارات. حاول لاحقاً.");
  }

  const reg = await registerWorker();

  // اشتراك قديم بمفتاح مختلف لا يصلح؛ نبدأ من جديد
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  const json = sub.toJSON();
  const { error: saveError } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );

  if (saveError) {
    await sub.unsubscribe();
    throw new Error("تعذر حفظ اشتراك الإشعارات.");
  }
}

// الحفاظ على اختيار المستخدم: إن أوقف الإشعارات بنفسه فلا نعيد تفعيلها تلقائياً
const OPT_OUT_KEY = "miad-push-off";
export function setOptOut(value) {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // التخزين غير متاح: لا مشكلة
  }
}
function isOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

async function saveSubscription(userId, sub) {
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  return !error;
}

// يُستدعى عند فتح التطبيق: إن كان الإذن ممنوحاً نتأكد أن الجهاز مشترك ومحفوظ في القاعدة،
// ونعيد الاشتراك بصمت إذا ضاع (انتهاء الاشتراك، حذف بيانات الموقع، تحديث المتصفح...)
export async function syncPush(userId) {
  if (!pushSupported()) return;
  if (Notification.permission !== "granted" || isOptedOut()) return;

  const reg = await registerWorker();
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    const { data, error } = await supabase.functions.invoke("get-vapid-public-key");
    if (error || !data?.publicKey) return;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }
  await saveSubscription(userId, sub);
}

export async function disablePush() {
  if (!pushSupported()) return;

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;

  // يجب الحذف قبل تسجيل الخروج لأن سياسة RLS تسمح للمستخدم بحذف صفه فقط
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

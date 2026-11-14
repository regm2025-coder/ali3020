import { createClient } from "@supabase/supabase-js";

// القيمتان عامتان بطبيعتهما (رابط المشروع والمفتاح القابل للنشر يصلان لكل متصفح).
// نستخدمهما كاحتياط حتى لا يتعطل التطبيق كله إذا كانت أسرار البناء ناقصة أو مكتوبة بشكل خاطئ.
const FALLBACK_URL = "https://utugolyziunrvkmmopal.supabase.co";
const FALLBACK_KEY = "sb_publishable_-_8NW4tATpHzvvrTyvhwog_yb0Mogld";

function cleanEnv(value) {
  // تنظيف المسافات والأسطر الجديدة والاقتباسات التي تُلصق أحياناً مع الأسرار
  return String(value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

function validUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const envUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const envKey = cleanEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const useEnv = validUrl(envUrl) && envKey.length > 20;
const supabaseUrl = useEnv ? envUrl : FALLBACK_URL;
const supabaseKey = useEnv ? envKey : FALLBACK_KEY;

let client = null;
let initError = null;
try {
  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} catch (err) {
  // لا نرمي الخطأ عند تحميل الملف: يعرض التطبيق رسالة واضحة بدل شاشة بيضاء
  initError = err;
}

export const supabase = client;
export const isSupabaseConfigured = Boolean(client);
export const supabaseInitError = initError;

// معلومات تشخيصية تظهر في شاشة الخطأ (بلا أي مفاتيح)
try {
  window.__miadEnv = {
    configured: isSupabaseConfigured,
    source: useEnv ? "أسرار البناء" : "القيم الاحتياطية",
    host: new URL(supabaseUrl).host,
  };
} catch {
  // لا شيء
}

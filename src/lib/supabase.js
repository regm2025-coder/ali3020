import { createClient } from "@supabase/supabase-js";

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

// لا توجد قاعدة بيانات احتياطية: إذا كانت الإعدادات خاطئة نعرض رسالة واضحة ولا نتصل بأي خادم.
let configProblem = null;
if (!envUrl) {
  configProblem = "السر VITE_SUPABASE_URL فارغ أو غير موجود.";
} else if (!validUrl(envUrl)) {
  configProblem = "السر VITE_SUPABASE_URL ليس رابطاً صحيحاً (المطلوب: https://xxxx.supabase.co).";
} else if (envKey.length <= 20) {
  configProblem = "السر VITE_SUPABASE_PUBLISHABLE_KEY فارغ أو غير مكتمل.";
}

let client = null;
let initError = null;
if (!configProblem) {
  try {
    client = createClient(envUrl, envKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    // لا نرمي الخطأ عند تحميل الملف: يعرض التطبيق رسالة واضحة بدل شاشة بيضاء
    initError = err;
    configProblem = "تعذّر تهيئة الاتصال: " + (err && err.message ? err.message : String(err));
  }
}

export const supabase = client;
export const isSupabaseConfigured = Boolean(client);
export const supabaseInitError = initError;
export const supabaseConfigProblem = configProblem;

// معلومات تشخيصية تظهر في شاشة الخطأ (بلا أي مفاتيح)
try {
  window.__miadEnv = {
    configured: isSupabaseConfigured,
    source: "أسرار البناء",
    host: validUrl(envUrl) ? new URL(envUrl).host : "-",
    problem: configProblem,
  };
} catch {
  // لا شيء
}

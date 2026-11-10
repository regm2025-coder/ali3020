import { useState, useEffect } from "react";
import { RefreshCw, Download, Smartphone, Check, LogOut, Building2, History, KeyRound, Copy } from "lucide-react";
import NotificationsButton from "./NotificationsButton";
import { Sheet } from "./ui";
import { supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/format";

const VERBS = { create: "أنشأ", update: "عدّل", delete: "حذف" };
const NOUNS = { meeting: "اجتماع", task: "مهمة", member: "عضوية", organization: "اسم المؤسسة" };

function describe(entry) {
  const who = entry.actor_name || "مستخدم";
  const what = NOUNS[entry.entity] || "عنصر";
  return `${who} ${VERBS[entry.action] || ""} ${what} «${entry.entity_title || "—"}»`;
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// تحديث التطبيق: نفحص نسخة جديدة من الـ Service Worker، ونمسح الذاكرة المؤقتة، ثم نعيد التشغيل
async function refreshApp() {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}

export default function Settings({ session, membership, orgId, onLogout }) {
  const [updating, setUpdating] = useState(false);
  const [installReady, setInstallReady] = useState(Boolean(window.__miadInstallPrompt));
  const [installed, setInstalled] = useState(isStandalone());

  const isManager = membership.role === "manager";
  const [orgName, setOrgName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showName, setShowName] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("organizations")
      .select("name, join_code")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        setOrgName(data?.name || "");
        setJoinCode(data?.join_code || "");
      });
  }, [orgId]);

  async function saveName(event) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    const { data, error: err } = await supabase
      .from("organizations")
      .update({ name })
      .eq("id", orgId)
      .select("name");
    setSaving(false);
    if (err || !data?.length) {
      setError("تعذر حفظ الاسم. حاول مرة أخرى.");
      return;
    }
    setOrgName(data[0].name);
    setShowName(false);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // المتصفح منع النسخ: الرمز ظاهر ويمكن نسخه يدوياً
    }
  }

  async function openLog() {
    setShowLog(true);
    setLog(null);
    const { data } = await supabase
      .from("activity_log")
      .select("id, actor_name, action, entity, entity_title, details, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLog(data || []);
  }

  useEffect(() => {
    const sync = () => {
      setInstallReady(Boolean(window.__miadInstallPrompt));
      setInstalled(isStandalone());
    };
    window.addEventListener("miad-install-ready", sync);
    return () => window.removeEventListener("miad-install-ready", sync);
  }, []);

  async function handleUpdate() {
    setUpdating(true);
    await refreshApp();
  }

  async function handleInstall() {
    const prompt = window.__miadInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    window.__miadInstallPrompt = null;
    setInstallReady(false);
    setInstalled(isStandalone());
  }

  const name = membership.display_name || membership.username || "—";
  const roleLabel = membership.role === "manager" ? "مدير" : "موظف";

  let installText = "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
  if (installed) installText = "يعمل الآن من الشاشة الرئيسية.";
  else if (installReady) installText = "أضفه إلى شاشتك الرئيسية ليفتح مثل أي تطبيق.";
  else if (isIOS()) installText = "في Safari اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».";

  return (
    <section className="page">
      <div className="profile">
        <span className="avatar">{name.charAt(0).toUpperCase()}</span>
        <div>
          <strong>{name}</strong>
          <small>{orgName ? `${roleLabel} · ${orgName}` : roleLabel}</small>
        </div>
      </div>

      <div className="group">
        <div className="row-wrap">
          <div className="row">
            <span className="row-icon">
              <RefreshCw size={20} />
            </span>
            <div className="row-text">
              <strong>تحديث التطبيق</strong>
              <small>يجلب آخر نسخة ثم يعيد تشغيل التطبيق.</small>
            </div>
            <button className="btn btn-primary btn-sm" disabled={updating} onClick={handleUpdate}>
              {updating ? "جاري التحديث" : "تحديث"}
            </button>
          </div>
        </div>

        <div className="row-wrap">
          <div className="row">
            <span className={installed ? "row-icon is-on" : "row-icon"}>
              {installed ? <Check size={20} /> : <Smartphone size={20} />}
            </span>
            <div className="row-text">
              <strong>{installed ? "التطبيق مثبّت" : "تثبيت التطبيق"}</strong>
              <small>{installText}</small>
            </div>
            {!installed && installReady && (
              <button className="btn btn-primary btn-sm" onClick={handleInstall}>
                <Download size={16} />
                تثبيت
              </button>
            )}
          </div>
        </div>

        <NotificationsButton userId={session.user.id} />
      </div>

      {isManager && (
        <div className="group">
          <div className="row-wrap">
            <div className="row">
              <span className="row-icon">
                <Building2 size={20} />
              </span>
              <div className="row-text">
                <strong>اسم المؤسسة</strong>
                <small>{orgName || "—"}</small>
              </div>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setNameDraft(orgName);
                  setError("");
                  setShowName(true);
                }}
              >
                تعديل
              </button>
            </div>
          </div>
          <div className="row-wrap">
            <div className="row">
              <span className="row-icon">
                <KeyRound size={20} />
              </span>
              <div className="row-text">
                <strong>رمز الانضمام</strong>
                <small>
                  أعطه لأعضائك ليطلبوا الانضمام: <span className="join-code">{joinCode || "—"}</span>
                </small>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={copyCode} disabled={!joinCode}>
                <Copy size={16} />
                {copied ? "تم النسخ" : "نسخ"}
              </button>
            </div>
          </div>
          <div className="row-wrap">
            <div className="row">
              <span className="row-icon">
                <History size={20} />
              </span>
              <div className="row-text">
                <strong>سجل النشاط</strong>
                <small>من أنشأ أو عدّل أو حذف.</small>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={openLog}>
                عرض
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="btn btn-danger btn-block" onClick={onLogout}>
        <LogOut size={18} />
        تسجيل الخروج
      </button>

      {showName && (
        <Sheet title="اسم المؤسسة" onClose={() => setShowName(false)}>
          <form className="form" onSubmit={saveName}>
            <label className="field">
              <span>الاسم</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                required
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? "جاري الحفظ" : "حفظ الاسم"}
            </button>
          </form>
        </Sheet>
      )}

      {showLog && (
        <Sheet title="سجل النشاط" onClose={() => setShowLog(false)}>
          {log === null ? (
            <p className="log-empty">جاري التحميل</p>
          ) : log.length === 0 ? (
            <p className="log-empty">لا توجد عمليات مسجّلة بعد. ستظهر هنا كل عملية إنشاء أو تعديل أو حذف.</p>
          ) : (
            <ul className="log-list">
              {log.map((e) => (
                <li key={e.id} data-action={e.action}>
                  <strong>{describe(e)}</strong>
                  {e.details && <span>{e.details}</span>}
                  <time>{formatDateTime(e.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </section>
  );
}

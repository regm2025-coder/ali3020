import { useState, useEffect } from "react";
import { RefreshCw, Download, Smartphone, Check, LogOut } from "lucide-react";
import NotificationsButton from "./NotificationsButton";

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

export default function Settings({ session, membership, onLogout }) {
  const [updating, setUpdating] = useState(false);
  const [installReady, setInstallReady] = useState(Boolean(window.__miadInstallPrompt));
  const [installed, setInstalled] = useState(isStandalone());

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

  const name = membership.username || "—";
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
          <small>{roleLabel}</small>
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

      <button className="btn btn-danger btn-block" onClick={onLogout}>
        <LogOut size={18} />
        تسجيل الخروج
      </button>
    </section>
  );
}

import { useState, useEffect } from "react";
import { getPushState, enablePush, disablePush } from "../lib/push";

export default function NotificationsButton({ userId }) {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError("");
    try {
      await enablePush(userId);
      setState("subscribed");
    } catch (err) {
      setError(err.message || "تعذر تفعيل الإشعارات.");
      setState(await getPushState().catch(() => "off"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError("");
    try {
      await disablePush();
      setState("off");
    } catch {
      setError("تعذر إيقاف الإشعارات.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <div className="notify-bar">
      {state === "unsupported" && (
        <span className="notify-text">
          متصفحك لا يدعم الإشعارات. على الآيفون أضف التطبيق إلى الشاشة الرئيسية أولاً.
        </span>
      )}

      {state === "denied" && (
        <span className="notify-text">
          الإشعارات محجوبة. فعّلها من إعدادات المتصفح لهذا الموقع.
        </span>
      )}

      {state === "off" && (
        <button className="primary-btn" disabled={busy} onClick={handleEnable}>
          {busy ? "جاري التفعيل..." : "🔔 تفعيل إشعارات التذكير"}
        </button>
      )}

      {state === "subscribed" && (
        <>
          <span className="notify-text">🔔 إشعارات التذكير مفعّلة على هذا الجهاز</span>
          <button className="link-btn" disabled={busy} onClick={handleDisable}>
            إيقاف
          </button>
        </>
      )}

      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

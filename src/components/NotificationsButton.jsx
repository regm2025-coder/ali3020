import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { getPushState, enablePush, disablePush, setOptOut } from "../lib/push";

const STATE_TEXT = {
  unsupported: "غير مدعومة في هذا المتصفح. على الآيفون ثبّت التطبيق أولاً.",
  denied: "محجوبة. فعّلها من إعدادات المتصفح لهذا الموقع.",
  off: "فعّلها لتصلك تذكيرات المهام والاجتماعات.",
  subscribed: "مفعّلة على هذا الجهاز.",
};

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
      setOptOut(true);
      setState("off");
    } catch {
      setError("تعذر إيقاف الإشعارات.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <div className="row-wrap">
      <div className="row">
        <span className={state === "subscribed" ? "row-icon is-on" : "row-icon"}>
          <Bell size={20} />
        </span>
        <div className="row-text">
          <strong>إشعارات التذكير</strong>
          <small>{STATE_TEXT[state]}</small>
        </div>
        {state === "off" && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleEnable}>
            {busy ? "جاري التفعيل" : "تفعيل"}
          </button>
        )}
        {state === "subscribed" && (
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={handleDisable}>
            إيقاف
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

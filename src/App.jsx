import { useState, useEffect, useCallback } from "react";
import { ListChecks, CalendarDays, Users, User, Clock, X } from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { disablePush, syncPush } from "./lib/push";
import Tasks from "./components/Tasks";
import Meetings from "./components/Meetings";
import Settings from "./components/Settings";
import { Empty } from "./components/ui";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_EMAIL = "admin@miad.invalid";

// supabase-js يرمي رسالة عامة عند أي رد غير 2xx؛ نقرأ رسالة الخادم الفعلية بدلاً منها
async function functionErrorMessage(error, fallback) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // نتجاهل ونعرض الرسالة الاحتياطية
  }
  return fallback;
}

function BrandMark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0E3B36" />
      <rect x="132" y="146" width="248" height="236" rx="40" fill="#FFFFFF" />
      <path d="M132 186a40 40 0 0 1 40-40h168a40 40 0 0 1 40 40v38H132z" fill="#E0A02E" />
      <rect x="188" y="114" width="28" height="64" rx="14" fill="#FFFFFF" stroke="#0E3B36" strokeWidth="8" />
      <rect x="296" y="114" width="28" height="64" rx="14" fill="#FFFFFF" stroke="#0E3B36" strokeWidth="8" />
      <path d="M200 304l40 40 74-84" fill="none" stroke="#0E3B36" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null);

  const [authView, setAuthView] = useState("login");
  const [loginMode, setLoginMode] = useState("employee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [pendingMembers, setPendingMembers] = useState([]);
  const [pendingAction, setPendingAction] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");

  // الإشعار يفتح التطبيق على صفحة معيّنة: /?tab=meetings&meeting=ID&rsvp=attending
  const parseTarget = (href) => {
    const q = new URL(href, window.location.origin).searchParams;
    const rsvp = q.get("rsvp");
    return {
      tab: q.get("tab") === "meetings" ? "meetings" : "tasks",
      meetingId: q.get("meeting"),
      rsvp: rsvp === "attending" || rsvp === "absent" ? rsvp : null,
    };
  };

  const [tab, setTab] = useState(() => parseTarget(window.location.href).tab);
  const [intent, setIntent] = useState(() => {
    const t = parseTarget(window.location.href);
    return t.meetingId ? { meetingId: t.meetingId, rsvp: t.rsvp } : null;
  });

  // التطبيق مفتوح وضُغط على إشعار: ينتقل إلى الصفحة المعنية
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type !== "NAVIGATE") return;
      const t = parseTarget(event.data.url);
      setTab(t.tab);
      setIntent(t.meetingId ? { meetingId: t.meetingId, rsvp: t.rsvp } : null);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const restoreMembership = useCallback(async (user) => {
    if (!user) {
      setMembership(null);
      return;
    }
    const { data, error } = await supabase
      .from("memberships")
      .select("role, status, username")
      .eq("user_id", user.id)
      .eq("organization_id", ORG_ID)
      .single();

    if (error || !data) {
      setMembership(null);
      return;
    }
    setMembership(data);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        restoreMembership(data.session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          restoreMembership(newSession.user);
        } else {
          setMembership(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [restoreMembership]);

  const loadPendingMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from("memberships")
      .select("user_id, username, created_at")
      .eq("organization_id", ORG_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!error) setPendingMembers(data || []);
  }, []);

  useEffect(() => {
    if (membership?.status === "approved" && membership.role === "manager") {
      loadPendingMembers();
    }
  }, [membership, loadPendingMembers]);

  // نضمن أن الجهاز مشترك في الإشعارات عند كل فتح للتطبيق (إن كان الإذن ممنوحاً)
  useEffect(() => {
    if (session && membership?.status === "approved") {
      syncPush(session.user.id).catch(() => {});
    }
  }, [session, membership]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      if (loginMode === "admin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password,
        });
        if (error) throw new Error("كلمة المرور غير صحيحة");
      } else {
        const { data, error } = await supabase.functions.invoke(
          "username-auth",
          { body: { username, password } }
        );
        if (error) {
          throw new Error(
            await functionErrorMessage(error, "تعذر تسجيل الدخول")
          );
        }
        if (data?.error) throw new Error(data.error);

        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      setUsername("");
      setPassword("");
    } catch (err) {
      setAuthError(err.message || "تعذر تسجيل الدخول");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "register-member",
        { body: { username, password } }
      );
      if (error) {
        throw new Error(
          await functionErrorMessage(error, "تعذر إتمام التسجيل")
        );
      }
      if (data?.error) throw new Error(data.error);

      setAuthView("login");
      setLoginMode("employee");
      setPassword("");
      setAuthError("تم التسجيل بنجاح. بانتظار موافقة المدير.");
    } catch (err) {
      setAuthError(err.message || "تعذر إتمام التسجيل");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    // نزيل اشتراك هذا الجهاز قبل الخروج حتى لا تصل إشعارات المستخدم لمن يستخدم الجهاز بعده
    try {
      await disablePush();
    } catch {
      // لا نمنع تسجيل الخروج بسبب فشل إلغاء الاشتراك
    }
    await supabase.auth.signOut();
    setSession(null);
    setMembership(null);
    setPendingMembers([]);
    setTab("tasks");
  }

  async function updateMemberApproval(userId, status) {
    setPendingAction(userId);
    setPendingMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-membership",
        { body: { user_id: userId, status } }
      );
      if (error) {
        throw new Error(
          await functionErrorMessage(error, "تعذر تحديث طلب العضوية.")
        );
      }
      if (data?.error) throw new Error(data.error);

      setPendingMembers((current) =>
        current.filter((m) => m.user_id !== userId)
      );
      setPendingMessage(
        status === "approved"
          ? "تمت الموافقة على العضو."
          : "تم رفض طلب العضوية."
      );
    } catch (err) {
      setPendingMessage(err.message || "تعذر تحديث طلب العضوية.");
    } finally {
      setPendingAction("");
    }
  }

  // ---------- شاشات الحالة ----------

  if (!isSupabaseConfigured) {
    return (
      <div className="state-screen">
        <p>إعدادات Supabase غير مكتملة. تحقق من ملف .env</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="state-screen">
        <BrandMark size={64} />
        <p>جاري التحميل</p>
      </div>
    );
  }

  // ---------- شاشة الدخول والتسجيل ----------

  if (!session) {
    return (
      <div className="auth">
        <div className="auth-hero">
          <BrandMark size={72} />
          <h1>مِيعاد</h1>
          <p>اجتماعاتك ومهامك وتذكيراتها في مكان واحد</p>
        </div>

        <div className="auth-sheet">
          <div className="segmented" role="tablist">
            <button
              role="tab"
              aria-selected={authView === "login"}
              className={authView === "login" ? "is-active" : ""}
              onClick={() => { setAuthView("login"); setAuthError(""); }}
            >
              تسجيل الدخول
            </button>
            <button
              role="tab"
              aria-selected={authView === "register"}
              className={authView === "register" ? "is-active" : ""}
              onClick={() => { setAuthView("register"); setAuthError(""); }}
            >
              عضو جديد
            </button>
          </div>

          {authView === "login" && (
            <>
              <div className="segmented is-small" role="tablist">
                <button
                  role="tab"
                  aria-selected={loginMode === "employee"}
                  className={loginMode === "employee" ? "is-active" : ""}
                  onClick={() => setLoginMode("employee")}
                >
                  موظف
                </button>
                <button
                  role="tab"
                  aria-selected={loginMode === "admin"}
                  className={loginMode === "admin" ? "is-active" : ""}
                  onClick={() => setLoginMode("admin")}
                >
                  مدير
                </button>
              </div>

              <form onSubmit={handleLogin} className="form">
                {loginMode === "employee" && (
                  <label className="field">
                    <span>اسم المستخدم</span>
                    <input
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </label>
                )}
                <label className="field">
                  <span>كلمة المرور</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {authError && <p className="field-error">{authError}</p>}
                <button type="submit" className="btn btn-primary btn-block" disabled={authLoading}>
                  {authLoading ? "جاري الدخول" : "دخول"}
                </button>
              </form>
            </>
          )}

          {authView === "register" && (
            <form onSubmit={handleRegister} className="form">
              <label className="field">
                <span>اسم المستخدم</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
                <small>أحرف إنجليزية صغيرة وأرقام، من 3 أحرف.</small>
              </label>
              <label className="field">
                <span>كلمة المرور</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <small>6 أحرف على الأقل.</small>
              </label>
              {authError && <p className="field-error">{authError}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={authLoading}>
                {authLoading ? "جاري الإرسال" : "إرسال طلب العضوية"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="state-screen">
        <h2>لا توجد عضوية مرتبطة بحسابك</h2>
        <p>تواصل مع المدير ليضيفك إلى النظام.</p>
        <button className="btn btn-primary" onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  if (membership.status === "pending") {
    return (
      <div className="state-screen">
        <span className="state-icon"><Clock size={30} /></span>
        <h2>طلبك قيد المراجعة</h2>
        <p>سيصلك الوصول بمجرد موافقة المدير على عضويتك.</p>
        <button className="btn btn-primary" onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  if (membership.status === "rejected") {
    return (
      <div className="state-screen">
        <span className="state-icon is-danger"><X size={30} /></span>
        <h2>لم تتم الموافقة على طلبك</h2>
        <p>تواصل مع المدير لمعرفة السبب.</p>
        <button className="btn btn-primary" onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  // ---------- التطبيق (مدير أو موظف) ----------

  const isManager = membership.role === "manager";

  const tabs = [
    { id: "tasks", label: isManager ? "المهام" : "مهامي", Icon: ListChecks },
    { id: "meetings", label: "الاجتماعات", Icon: CalendarDays },
    ...(isManager
      ? [{ id: "members", label: "الأعضاء", Icon: Users, badge: pendingMembers.length }]
      : []),
    { id: "account", label: "حسابي", Icon: User },
  ];

  const titles = {
    tasks: isManager ? "المهام" : "مهامي",
    meetings: "الاجتماعات",
    members: "طلبات العضوية",
    account: "حسابي",
  };

  const today = new Date().toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{titles[tab]}</h1>
          <p>{today}</p>
        </div>
        <BrandMark size={40} />
      </header>

      <main>
        {tab === "tasks" && (
          <Tasks session={session} orgId={ORG_ID} isManager={isManager} />
        )}
        {tab === "meetings" && (
          <Meetings
            session={session}
            orgId={ORG_ID}
            isManager={isManager}
            intent={intent}
            onIntentDone={() => {
              setIntent(null);
              window.history.replaceState(null, "", "/");
            }}
          />
        )}

        {tab === "members" && isManager && (
          <section className="page">
            {pendingMessage && <p className="notice notice-ok">{pendingMessage}</p>}

            {pendingMembers.length === 0 ? (
              <Empty
                icon={Users}
                title="لا توجد طلبات معلقة"
                hint="سيظهر هنا كل عضو جديد ينتظر موافقتك."
              />
            ) : (
              <ul className="list">
                {pendingMembers.map((m) => (
                  <li key={m.user_id} className="member">
                    <span className="avatar">{m.username.charAt(0).toUpperCase()}</span>
                    <div className="member-info">
                      <strong>{m.username}</strong>
                      <small>{new Date(m.created_at).toLocaleDateString("ar", { day: "numeric", month: "long" })}</small>
                    </div>
                    <div className="member-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={pendingAction === m.user_id}
                        onClick={() => updateMemberApproval(m.user_id, "approved")}
                      >
                        موافقة
                      </button>
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={pendingAction === m.user_id}
                        onClick={() => updateMemberApproval(m.user_id, "rejected")}
                      >
                        رفض
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "account" && (
          <Settings session={session} membership={membership} orgId={ORG_ID} onLogout={handleLogout} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <div className="bottom-nav-inner">
          {tabs.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              className={tab === id ? "nav-item is-active" : "nav-item"}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              <span className="nav-pill">
                <Icon size={22} />
                {badge > 0 && <span className="nav-badge">{badge.toLocaleString("ar")}</span>}
              </span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import Tasks from "./components/Tasks";
import Meetings from "./components/Meetings";
import NotificationsButton from "./components/NotificationsButton";
import { disablePush } from "./lib/push";

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

  const [tab, setTab] = useState("tasks");

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
          ? "تمت الموافقة على العضو بنجاح."
          : "تم رفض طلب العضوية."
      );
    } catch (err) {
      setPendingMessage(err.message || "تعذر تحديث طلب العضوية.");
    } finally {
      setPendingAction("");
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="centered-screen">
        <p>⚠️ إعدادات Supabase غير مكتملة. تحقق من ملف .env</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="centered-screen">
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h1>مِيعاد</h1>
          <p className="subtitle">إدارة الاجتماعات والمهام</p>

          <div className="tabs">
            <button
              className={authView === "login" ? "tab active" : "tab"}
              onClick={() => { setAuthView("login"); setAuthError(""); }}
            >
              تسجيل الدخول
            </button>
            <button
              className={authView === "register" ? "tab active" : "tab"}
              onClick={() => { setAuthView("register"); setAuthError(""); }}
            >
              تسجيل عضو جديد
            </button>
          </div>

          {authView === "login" && (
            <>
              <div className="tabs secondary">
                <button
                  className={loginMode === "employee" ? "tab active" : "tab"}
                  onClick={() => setLoginMode("employee")}
                >
                  دخول موظف
                </button>
                <button
                  className={loginMode === "admin" ? "tab active" : "tab"}
                  onClick={() => setLoginMode("admin")}
                >
                  دخول مدير
                </button>
              </div>

              <form onSubmit={handleLogin} className="auth-form">
                {loginMode === "employee" && (
                  <input
                    type="text"
                    placeholder="اسم المستخدم"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                )}
                <input
                  type="password"
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {authError && <p className="error-text">{authError}</p>}
                <button type="submit" disabled={authLoading}>
                  {authLoading ? "جاري الدخول..." : "دخول"}
                </button>
              </form>
            </>
          )}

          {authView === "register" && (
            <form onSubmit={handleRegister} className="auth-form">
              <input
                type="text"
                placeholder="اختر اسم مستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
              />
              <input
                type="password"
                placeholder="اختر كلمة مرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              {authError && <p className="error-text">{authError}</p>}
              <button type="submit" disabled={authLoading}>
                {authLoading ? "جاري التسجيل..." : "تسجيل"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="centered-screen">
        <p>لا يوجد لديك عضوية مرتبطة بالنظام.</p>
        <button onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  if (membership.status === "pending") {
    return (
      <div className="centered-screen">
        <h2>⏳ حسابك قيد المراجعة</h2>
        <p>بانتظار موافقة المدير على طلب عضويتك.</p>
        <button onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  if (membership.status === "rejected") {
    return (
      <div className="centered-screen">
        <h2>❌ تم رفض طلب عضويتك</h2>
        <p>تواصل مع المدير لمزيد من المعلومات.</p>
        <button onClick={handleLogout}>تسجيل الخروج</button>
      </div>
    );
  }

  if (membership.role === "manager") {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>مِيعاد — لوحة المدير</h1>
          <button onClick={handleLogout}>تسجيل الخروج</button>
        </header>

        <NotificationsButton userId={session.user.id} />

        <nav className="tabs main-tabs">
          <button
            className={tab === "tasks" ? "tab active" : "tab"}
            onClick={() => setTab("tasks")}
          >
            المهام
          </button>
          <button
            className={tab === "meetings" ? "tab active" : "tab"}
            onClick={() => setTab("meetings")}
          >
            الاجتماعات
          </button>
          <button
            className={tab === "members" ? "tab active" : "tab"}
            onClick={() => setTab("members")}
          >
            الأعضاء
            {pendingMembers.length > 0 && (
              <span className="count-dot">{pendingMembers.length}</span>
            )}
          </button>
        </nav>

        {tab === "tasks" && (
          <Tasks session={session} orgId={ORG_ID} isManager />
        )}
        {tab === "meetings" && (
          <Meetings session={session} orgId={ORG_ID} isManager />
        )}

        {tab === "members" && (
        <section className="panel">
          <h2>طلبات العضوية المعلقة ({pendingMembers.length})</h2>

          {pendingMessage && <p className="info-text">{pendingMessage}</p>}

          {pendingMembers.length === 0 ? (
            <p>لا توجد طلبات معلقة حالياً.</p>
          ) : (
            <table className="members-table">
              <thead>
                <tr>
                  <th>اسم المستخدم</th>
                  <th>تاريخ الطلب</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {pendingMembers.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.username}</td>
                    <td>{new Date(m.created_at).toLocaleDateString("ar")}</td>
                    <td>
                      <button
                        className="approve-btn"
                        disabled={pendingAction === m.user_id}
                        onClick={() => updateMemberApproval(m.user_id, "approved")}
                      >
                        موافقة
                      </button>
                      <button
                        className="reject-btn"
                        disabled={pendingAction === m.user_id}
                        onClick={() => updateMemberApproval(m.user_id, "rejected")}
                      >
                        رفض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>مِيعاد — مرحباً {membership.username}</h1>
        <button onClick={handleLogout}>تسجيل الخروج</button>
      </header>

      <NotificationsButton userId={session.user.id} />

      <nav className="tabs main-tabs">
        <button
          className={tab === "tasks" ? "tab active" : "tab"}
          onClick={() => setTab("tasks")}
        >
          مهامي
        </button>
        <button
          className={tab === "meetings" ? "tab active" : "tab"}
          onClick={() => setTab("meetings")}
        >
          الاجتماعات
        </button>
      </nav>

      {tab === "tasks" && (
        <Tasks session={session} orgId={ORG_ID} isManager={false} />
      )}
      {tab === "meetings" && (
        <Meetings session={session} orgId={ORG_ID} isManager={false} />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import Tasks from "./components/Tasks";
import Meetings from "./components/Meetings";
import NotificationsButton from "./components/NotificationsButton";
import { disablePush } from "./lib/push";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_EMAIL = "admin@miad.invalid";

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
        if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";

const taskStatusLabel = (status) => ({ new: "جديدة", in_progress: "قيد التنفيذ", completed: "مكتملة" }[status] || "جديدة");

const formatDate = (value) => {
  if (!value) return "لم يحدد بعد";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const navItems = [
  { id: "home", label: "الرئيسية", icon: LayoutDashboard },
  { id: "meetings", label: "الاجتماعات", icon: CalendarDays },
  { id: "tasks", label: "المهام", icon: ClipboardList },
  { id: "team", label: "الفريق", icon: Users },
];

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");
  const [active, setActive] = useState("home");
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [pendingAction, setPendingAction] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  async function restoreMembership(user) {
    if (!supabase || !user) {
      setAuthChecking(false);
      return;
    }
    const { data: member, error } = await supabase
      .from("memberships")
      .select("id, user_id, organization_id, username, role, status")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (error || !member) {
      await supabase.auth.signOut();
      setAuthUser(null);
      setMembership(null);
      setLoginError("لم نعثر على عضوية معتمدة لهذا الحساب.");
      setAuthChecking(false);
      return;
    }

    const { data: organization } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", member.organization_id)
      .maybeSingle();

    const activeMembership = { ...member, organization_name: organization?.name ?? "مؤسستك" };
    setAuthUser(user);
    setMembership(activeMembership);
    setAuthChecking(false);
    await loadWorkspaceData(activeMembership);
  }

  async function loadWorkspaceData(activeMembership = membership) {
    if (!supabase || !activeMembership?.organization_id) return;
    setDataLoading(true);
    setDataError("");
    const [taskResult, meetingResult, memberResult, pendingResult] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, title, description, assigned_to, due_date, status, created_at")
        .eq("organization_id", activeMembership.organization_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("meetings")
        .select("id, title, description, meeting_date, created_at")
        .eq("organization_id", activeMembership.organization_id)
        .order("meeting_date", { ascending: true }),
      supabase
        .from("memberships")
        .select("user_id, username, role")
        .eq("organization_id", activeMembership.organization_id)
        .eq("status", "approved"),
      activeMembership.role === "manager"
        ? supabase.from("memberships").select("user_id, username, created_at").eq("organization_id", activeMembership.organization_id).eq("status", "pending").order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (memberResult.error) {
      setDataError(memberResult.error.message);
    } else {
      const approvedMembers = memberResult.data || [];
      setTeamMembers(approvedMembers);
      if (activeMembership.role === "manager") {
        if (pendingResult.error) setDataError(pendingResult.error.message);
        else setPendingMembers(pendingResult.data || []);
      }
      setTaskAssignedTo((current) => current && approvedMembers.some((member) => member.user_id === current)
        ? current
        : (approvedMembers.find((member) => member.role === "employee")?.user_id || activeMembership.user_id));
    }
    if (taskResult.error || meetingResult.error) {
      setDataError(taskResult.error?.message || meetingResult.error?.message || "تعذر تحميل بيانات المؤسسة.");
    } else {
      setTasks((taskResult.data || []).map((task) => ({
        ...task,
        project: "عام",
        due: formatDate(task.due_date),
        status: task.status || "new",
      })));
      setMeetings((meetingResult.data || []).map((meeting) => ({
        ...meeting,
        date: formatDate(meeting.meeting_date),
        time: "",
        people: "",
      })));
    }
    setDataLoading(false);
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthChecking(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) restoreMembership(session.user);
      else setAuthChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthUser(null);
        setMembership(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    if (!isSupabaseConfigured || !supabase) {
      setLoginError("الاتصال بقاعدة البيانات غير مضبوط.");
      return;
    }
    setLoginLoading(true);
    try {
      const username = loginUsername.trim().toLowerCase();
      if (username === "admin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: "admin@miad.invalid",
          password: loginPassword,
        });
        if (error) throw error;
        await restoreMembership(data.user);
      } else {
        const { data, error } = await supabase.functions.invoke("username-auth", {
          body: { username, password: loginPassword },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.session) throw new Error("تعذر إنشاء جلسة الدخول.");
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        await restoreMembership(sessionData.user);
      }
      setLoginPassword("");
      setActive("home");
    } catch (error) {
      setLoginError(error?.message || "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجددًا.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setRegisterMessage("");
    if (!supabase) {
      setRegisterMessage("الاتصال بقاعدة البيانات غير مضبوط.");
      return;
    }
    setRegisterLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-member", {
        body: { username: registerUsername.trim().toLowerCase(), password: registerPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRegisterMessage(data?.message || "تم إرسال طلب العضوية. انتظر موافقة المدير قبل تسجيل الدخول.");
      setRegisterUsername("");
      setRegisterPassword("");
    } catch (error) {
      setRegisterMessage(error?.message || "تعذر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      setRegisterLoading(false);
    }
  }

  async function updateMemberApproval(userId, status) {
    setPendingAction(userId);
    setPendingMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("manage-membership", {
        body: { user_id: userId, status },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPendingMembers((current) => current.filter((member) => member.user_id !== userId));
      if (status === "approved") await loadWorkspaceData(membership);
      setPendingMessage(status === "approved" ? "تمت الموافقة على العضو بنجاح." : "تم رفض طلب العضوية.");
    } catch (error) {
      setPendingMessage(error?.message || "تعذر تحديث طلب العضوية.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    setAuthUser(null);
    setMembership(null);
    setActive("home");
  }

  const completed = tasks.filter((task) => task.status === "completed").length;
  const pending = tasks.length - completed;

  async function addTask(event) {
    event.preventDefault();
    if (!taskTitle.trim() || !taskAssignedTo || !authUser || !membership) return;
    setTaskSaving(true);
    setDataError("");
    const { data, error } = await supabase
      .from("assignments")
      .insert({
        organization_id: membership.organization_id,
        title: taskTitle.trim(),
        assigned_to: taskAssignedTo,
        created_by: authUser.id,
        status: "new",
      })
      .select("id, title, description, assigned_to, due_date, status, created_at")
      .single();
    if (error) {
      setDataError(error.message);
      setTaskSaving(false);
      return;
    }
    setTasks((current) => [{
      ...data,
      project: "عام",
      due: formatDate(data.due_date),
    }, ...current]);
    setTaskTitle("");
    setShowTaskForm(false);
    setTaskSaving(false);
    setActive("tasks");
  }

  async function addMeeting(event) {
    event.preventDefault();
    if (!meetingTitle.trim() || !meetingDate || !authUser || !membership) return;
    setMeetingSaving(true);
    setDataError("");
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        organization_id: membership.organization_id,
        title: meetingTitle.trim(),
        description: meetingDescription.trim() || null,
        meeting_date: new Date(meetingDate).toISOString(),
        created_by: authUser.id,
      })
      .select("id, title, description, meeting_date, created_at")
      .single();
    if (error) {
      setDataError(error.message);
    } else {
      setMeetings((current) => [...current, {
        ...data,
        date: formatDate(data.meeting_date),
      }].sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)));
      setMeetingTitle("");
      setMeetingDescription("");
      setMeetingDate("");
      setShowMeetingForm(false);
    }
    setMeetingSaving(false);
  }

  async function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const nextStatus = task.status === "completed" ? "in_progress" : "completed";
    const { error } = await supabase
      .from("assignments")
      .update({ status: nextStatus })
      .eq("id", id)
      .eq("organization_id", membership.organization_id);
    if (error) {
      setDataError(error.message);
      return;
    }
    setTasks((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
  }

  if (authChecking) {
    return <main className="auth-screen"><section className="auth-card"><div className="auth-logo">م</div><h1>مِيعاد</h1><p>جارٍ التحقق من جلسة الدخول...</p></section></main>;
  }

  if (!authUser) {
    return (
      <main className="auth-screen">
        {!showRegister ? (
          <form className="auth-card" onSubmit={handleLogin}>
            <div className="auth-logo">م</div>
            <span className="eyebrow">مجلس الشورى</span>
            <h1>تسجيل الدخول إلى مِيعاد</h1>
            <p className="auth-description">أدخل اسم المستخدم وكلمة المرور للمتابعة.</p>
            <label htmlFor="login-username">اسم المستخدم</label>
            <input id="login-username" autoComplete="username" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} placeholder="اسم المستخدم" required />
            <label htmlFor="login-password">كلمة المرور</label>
            <input id="login-password" type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="كلمة المرور" required />
            {loginError && <div className="auth-error" role="alert">{loginError}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={loginLoading}>{loginLoading ? "جارٍ تسجيل الدخول..." : "دخول"}</button>
            <span className="auth-footnote">الدخول متاح للحسابات المعتمدة من الإدارة.</span>
            <button type="button" className="text-link auth-register-link" onClick={() => { setShowRegister(true); setLoginError(""); setRegisterMessage(""); }}>تسجيل عضو جديد</button>
          </form>
        ) : (
          <form className="auth-card" onSubmit={handleRegister}>
            <div className="auth-logo">م</div>
            <span className="eyebrow">مجلس الشورى</span>
            <h1>طلب عضوية جديدة</h1>
            <p className="auth-description">أنشئ طلب انضمام. لن تتمكن من الدخول إلا بعد موافقة المدير.</p>
            <label htmlFor="register-username">اسم المستخدم</label>
            <input id="register-username" autoComplete="username" value={registerUsername} onChange={(event) => setRegisterUsername(event.target.value)} placeholder="3 إلى 32 حرفًا إنجليزيًا أو رقمًا" minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" required />
            <label htmlFor="register-password">كلمة المرور</label>
            <input id="register-password" type="password" autoComplete="new-password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} placeholder="8 أحرف على الأقل" minLength={8} maxLength={128} required />
            {registerMessage && <div className="auth-error" role="status">{registerMessage}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={registerLoading}>{registerLoading ? "جارٍ إرسال الطلب..." : "إرسال طلب العضوية"}</button>
            <button type="button" className="text-link auth-register-link" onClick={() => { setShowRegister(false); setRegisterMessage(""); }}>العودة إلى تسجيل الدخول</button>
          </form>
        )}
      </main>
    );
  }

  const pageTitle = navItems.find((item) => item.id === active)?.label || "الرئيسية";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">م</div>
          <div>
            <div className="brand-name">مِيعاد</div>
            <div className="brand-caption">{membership?.organization_name || "إدارة الاجتماعات والمهام"}</div>
          </div>
          <button className="icon-button close-menu" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة"><X size={19} /></button>
        </div>

        <div className="workspace-label">القائمة الرئيسية</div>
        <nav className="nav-list">
          {navItems.filter((item) => item.id !== "team" || membership?.role === "manager").map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${active === id ? "active" : ""}`} onClick={() => { setActive(id); setMobileMenu(false); }}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "tasks" && <span className="nav-count">{pending}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setActive("settings")}><Settings size={19} /><span>الإعدادات</span></button>
          <button className="nav-item" onClick={handleLogout}><X size={19} /><span>تسجيل الخروج</span></button>
          <div className="profile-card">
            <div className="avatar">م</div>
            <div className="profile-info"><strong>{membership?.username || "المستخدم"}</strong><span>{membership?.role === "manager" ? "مدير معتمد" : "موظف معتمد"}</span></div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="sidebar-scrim" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-right">
            <button className="icon-button menu-trigger" onClick={() => setMobileMenu(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
            <div>
              <div className="breadcrumb">مِيعاد <ChevronLeft size={13} /> {pageTitle}</div>
              <h1>{active === "home" ? "مرحبًا بك 👋" : pageTitle}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button search-button" aria-label="بحث"><Search size={19} /></button>
            <button className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} /><i /></button>
            <div className="topbar-date"><CalendarDays size={16} /> الخميس، ٦ نوفمبر ٢٠٢٦</div>
          </div>
        </header>

        {active === "home" && (
          <div className="page-content">
            <section className="welcome-banner">
              <div>
                <span className="eyebrow">لوحة التحكم</span>
                <h2>نظّم وقتك، وأنجز أهدافك.</h2>
                <p>تابع اجتماعاتك ومهامك اليومية من مكان واحد.</p>
              </div>
              <div className="banner-decoration"><CalendarDays size={76} strokeWidth={1} /></div>
            </section>

            {dataError && <div className="auth-error" role="alert">{dataError}</div>}
            {dataLoading && <p className="data-message">جارٍ تحميل بيانات المؤسسة...</p>}
            <section className="stats-grid">
              <StatCard icon={CalendarDays} label="الاجتماعات المسجلة" value={String(meetings.length)} note="من قاعدة البيانات" />
              <StatCard icon={ClipboardList} label="إجمالي المهام" value={String(tasks.length)} note="كل المهام المسجلة" />
              <StatCard icon={Clock3} label="مهام قيد الإنجاز" value={String(pending)} note="تحتاج إلى متابعة" />
              <StatCard icon={CheckCircle2} label="مهام مكتملة" value={String(completed)} note="أحسنت، استمر!" />
            </section>

            <div className="content-grid">
              <section className="panel tasks-panel">
                <div className="panel-heading">
                  <div><span className="section-kicker">متابعة العمل</span><h3>المهام الأخيرة</h3></div>
                  <button className="text-link" onClick={() => setActive("tasks")}>عرض الكل <ChevronLeft size={15} /></button>
                </div>
                <div className="task-list">
                  {tasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}
                  {!dataLoading && tasks.length === 0 && <p className="data-message">لا توجد مهام مسجلة حتى الآن.</p>}
                </div>
              </section>

              <section className="panel meetings-panel">
                <div className="panel-heading">
                  <div><span className="section-kicker">مواعيدك القادمة</span><h3>الاجتماعات</h3></div>
                  <button className="text-link" onClick={() => setActive("meetings")}>عرض الكل <ChevronLeft size={15} /></button>
                </div>
                <div className="meeting-list">
                  {meetings.slice(0, 4).map((meeting) => (
                    <div className="meeting-row" key={meeting.id}>
                      <div className="meeting-date"><CalendarDays size={17} /></div>
                      <div className="meeting-info"><strong>{meeting.title}</strong><span><Clock3 size={13} /> {meeting.date}</span></div>
                      <ChevronLeft className="meeting-arrow" size={17} />
                    </div>
                  ))}
                </div>
                <div className="meeting-note"><Bell size={15} /> ستظهر تذكيرات الاجتماعات هنا</div>
              </section>
            </div>

            <section className="quick-actions">
              <div><h3>ابدأ بسرعة</h3><p>أضف ما تحتاج إلى متابعته اليوم.</p></div>
              <button className="primary-button" onClick={() => setShowTaskForm(true)}><Plus size={18} /> إضافة مهمة جديدة</button>
            </section>
          </div>
        )}

        {active === "tasks" && (
          <div className="page-content">
            <div className="page-heading-row"><div><span className="section-kicker">تنظيم العمل</span><h2>كل المهام</h2><p>تابع المهام وحدّث حالة إنجازها.</p></div><button className="primary-button" onClick={() => setShowTaskForm(true)}><Plus size={18} /> إضافة مهمة</button></div>
            {dataError && <div className="auth-error" role="alert">{dataError}</div>}
            <section className="panel full-panel"><div className="task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}{!dataLoading && tasks.length === 0 && <p className="data-message">لا توجد مهام مسجلة حتى الآن.</p>}</div></section>
          </div>
        )}

        {active === "meetings" && (
          <div className="page-content">
            <div className="page-heading-row"><div><span className="section-kicker">المواعيد</span><h2>الاجتماعات</h2><p>نظرة على الاجتماعات المجدولة.</p></div><button className="primary-button" onClick={() => setShowMeetingForm(true)}><Plus size={18} /> اجتماع جديد</button></div>
            {dataError && <div className="auth-error" role="alert">{dataError}</div>}
            <section className="panel full-panel"><div className="meeting-list">{meetings.map((meeting) => <div className="meeting-row" key={meeting.id}><div className="meeting-date"><CalendarDays size={17} /></div><div className="meeting-info"><strong>{meeting.title}</strong><span><Clock3 size={13} /> {meeting.date}</span></div><span className="status-pill upcoming">مسجل</span></div>)}{!dataLoading && meetings.length === 0 && <p className="data-message">لا توجد اجتماعات مسجلة حتى الآن.</p>}</div></section>
          </div>
        )}

        {active === "team" && membership?.role === "manager" && (
          <div className="page-content">
            <div className="page-heading-row"><div><span className="section-kicker">إدارة الأعضاء</span><h2>طلبات العضوية</h2><p>راجع طلبات الانضمام ووافق على الموظفين أو ارفض الطلب.</p></div><span className="status-pill upcoming">{pendingMembers.length} طلبات معلّقة</span></div>
            {pendingMessage && <div className={pendingMessage.startsWith("تعذر") ? "auth-error" : "meeting-note"} role="status">{pendingMessage}</div>}
            <section className="panel full-panel">
              <div className="panel-heading"><div><span className="section-kicker">بانتظار المراجعة</span><h3>طلبات الموظفين</h3></div><button className="text-link" onClick={() => loadWorkspaceData(membership)}>تحديث القائمة</button></div>
              {pendingMembers.map((member) => (
                <div className="meeting-row" key={member.user_id}>
                  <div className="meeting-date"><Users size={18} /></div>
                  <div className="meeting-info"><strong>{member.username}</strong><span>طلب انضمام جديد</span></div>
                  <button className="primary-button" disabled={!!pendingAction} onClick={() => updateMemberApproval(member.user_id, "approved")}>{pendingAction === member.user_id ? "جارٍ..." : "موافقة"}</button>
                  <button className="secondary-button" disabled={!!pendingAction} onClick={() => updateMemberApproval(member.user_id, "rejected")}>رفض</button>
                </div>
              ))}
              {!dataLoading && pendingMembers.length === 0 && <p className="data-message">لا توجد طلبات عضوية معلّقة حاليًا.</p>}
            </section>
          </div>
        )}
        {active === "settings" && <PlaceholderPage title="الإعدادات" description="إعدادات الحساب والتنبيهات ستتوفر في مرحلة لاحقة." icon={Settings} />}
      </main>

      {showMeetingForm && (
        <div className="modal-backdrop" onClick={() => setShowMeetingForm(false)}>
          <form className="task-modal" onSubmit={addMeeting} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="section-kicker">اجتماع جديد</span><h3>جدولة اجتماع</h3></div><button type="button" className="icon-button" onClick={() => setShowMeetingForm(false)} aria-label="إغلاق"><X size={19} /></button></div>
            <label htmlFor="meeting-title">عنوان الاجتماع</label>
            <input id="meeting-title" autoFocus value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="اكتب عنوان الاجتماع..." required />
            <label htmlFor="meeting-description">الوصف (اختياري)</label>
            <textarea id="meeting-description" value={meetingDescription} onChange={(event) => setMeetingDescription(event.target.value)} placeholder="تفاصيل الاجتماع..." rows="3" />
            <label htmlFor="meeting-date">موعد الاجتماع</label>
            <input id="meeting-date" type="datetime-local" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} required />
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowMeetingForm(false)}>إلغاء</button><button className="primary-button" type="submit" disabled={meetingSaving}><Plus size={17} /> {meetingSaving ? "جارٍ الحفظ..." : "حفظ الاجتماع"}</button></div>
          </form>
        </div>
      )}

      {showTaskForm && (
        <div className="modal-backdrop" onClick={() => setShowTaskForm(false)}>
          <form className="task-modal" onSubmit={addTask} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="section-kicker">مهمة جديدة</span><h3>أضف مهمة إلى قائمتك</h3></div><button type="button" className="icon-button" onClick={() => setShowTaskForm(false)} aria-label="إغلاق"><X size={19} /></button></div>
            <label htmlFor="task-title">عنوان المهمة</label>
            <input id="task-title" autoFocus value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="اكتب عنوان المهمة..." required />
            <label htmlFor="task-assignee">إسناد المهمة إلى</label>
            <select id="task-assignee" value={taskAssignedTo} onChange={(event) => setTaskAssignedTo(event.target.value)} required>
              <option value="" disabled>اختر الموظف المسؤول</option>
              {teamMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.username}{member.role === "manager" ? " (المدير)" : ""}</option>)}
            </select>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>إلغاء</button><button className="primary-button" type="submit" disabled={taskSaving || !taskAssignedTo}><Plus size={17} /> {taskSaving ? "جارٍ الحفظ..." : "إضافة المهمة"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={19} /></div></div><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>;
}

function TaskRow({ task, onToggle }) {
  const done = task.status === "completed";
  return <div className={`task-row ${done ? "task-done" : ""}`}>
    <button className={`task-check ${done ? "checked" : ""}`} onClick={() => onToggle(task.id)} aria-label={done ? "إلغاء إكمال المهمة" : "إكمال المهمة"}>{done && <CheckCircle2 size={17} />}</button>
    <div className="task-main"><strong>{task.title}</strong><span>{task.project} <i /> {task.due}</span></div>
    <span className={`status-pill ${done ? "completed" : task.status === "in_progress" ? "in-progress" : "new"}`}>{taskStatusLabel(task.status)}</span>
  </div>;
}

function PlaceholderPage({ title, description, icon: Icon }) {
  return <div className="page-content"><section className="panel placeholder-panel"><div className="placeholder-icon"><Icon size={30} /></div><h2>{title}</h2><p>{description}</p><span className="coming-soon">قريبًا</span></section></div>;
}

export default App;
import { useState } from "react";
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

const initialTasks = [
  { id: 1, title: "إعداد ملخص الاجتماع الأسبوعي", project: "الإدارة", due: "اليوم، ٢:٠٠ م", status: "قيد التنفيذ" },
  { id: 2, title: "مراجعة خطة العمل للفريق", project: "فريق العمل", due: "غدًا، ١٠:٠٠ ص", status: "جديدة" },
  { id: 3, title: "إرسال تقرير الإنجاز", project: "التقارير", due: "الأحد، ١٢:٠٠ م", status: "مكتملة" },
];

const meetings = [
  { id: 1, title: "الاجتماع الأسبوعي", date: "اليوم", time: "١٠:٠٠ صباحًا", people: "٦ مشاركين" },
  { id: 2, title: "مراجعة خطة المشاريع", date: "غدًا", time: "١١:٣٠ صباحًا", people: "٤ مشاركين" },
];

const navItems = [
  { id: "home", label: "الرئيسية", icon: LayoutDashboard },
  { id: "meetings", label: "الاجتماعات", icon: CalendarDays },
  { id: "tasks", label: "المهام", icon: ClipboardList },
  { id: "team", label: "الفريق", icon: Users },
];

function App() {
  const [active, setActive] = useState("home");
  const [tasks, setTasks] = useState(initialTasks);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  const completed = tasks.filter((task) => task.status === "مكتملة").length;
  const pending = tasks.length - completed;

  function addTask(event) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setTasks((current) => [
      { id: Date.now(), title: taskTitle.trim(), project: "عام", due: "لم يحدد بعد", status: "جديدة" },
      ...current,
    ]);
    setTaskTitle("");
    setShowTaskForm(false);
    setActive("tasks");
  }

  function toggleTask(id) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, status: task.status === "مكتملة" ? "قيد التنفيذ" : "مكتملة" }
          : task
      )
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
            <div className="brand-caption">إدارة الاجتماعات والمهام</div>
          </div>
          <button className="icon-button close-menu" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة"><X size={19} /></button>
        </div>

        <div className="workspace-label">القائمة الرئيسية</div>
        <nav className="nav-list">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${active === id ? "active" : ""}`} onClick={() => { setActive(id); setMobileMenu(false); }}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "tasks" && <span className="nav-count">{pending}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setActive("settings")}><Settings size={19} /><span>الإعدادات</span></button>
          <div className="profile-card">
            <div className="avatar">م</div>
            <div className="profile-info"><strong>مدير النظام</strong><span>حساب تجريبي</span></div>
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

            <section className="stats-grid">
              <StatCard icon={CalendarDays} label="اجتماعات هذا الأسبوع" value="٤" note="موعدان قادمان" />
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
                </div>
              </section>

              <section className="panel meetings-panel">
                <div className="panel-heading">
                  <div><span className="section-kicker">مواعيدك القادمة</span><h3>الاجتماعات</h3></div>
                  <button className="text-link" onClick={() => setActive("meetings")}>عرض الكل <ChevronLeft size={15} /></button>
                </div>
                <div className="meeting-list">
                  {meetings.map((meeting) => (
                    <div className="meeting-row" key={meeting.id}>
                      <div className="meeting-date"><strong>{meeting.date === "اليوم" ? "٠٦" : "٠٧"}</strong><span>نوفمبر</span></div>
                      <div className="meeting-info"><strong>{meeting.title}</strong><span><Clock3 size={13} /> {meeting.time} · {meeting.people}</span></div>
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
            <section className="panel full-panel"><div className="task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}</div></section>
          </div>
        )}

        {active === "meetings" && (
          <div className="page-content">
            <div className="page-heading-row"><div><span className="section-kicker">المواعيد</span><h2>الاجتماعات</h2><p>نظرة على الاجتماعات المجدولة.</p></div><button className="primary-button" onClick={() => alert("سيتم تفعيل إنشاء الاجتماعات في المرحلة التالية.")}><Plus size={18} /> اجتماع جديد</button></div>
            <section className="panel full-panel"><div className="meeting-list">{meetings.map((meeting) => <div className="meeting-row" key={meeting.id}><div className="meeting-date"><strong>{meeting.date === "اليوم" ? "٠٦" : "٠٧"}</strong><span>نوفمبر</span></div><div className="meeting-info"><strong>{meeting.title}</strong><span><Clock3 size={13} /> {meeting.time} · {meeting.people}</span></div><span className="status-pill upcoming">قادم</span></div>)}</div></section>
          </div>
        )}

        {active === "team" && <PlaceholderPage title="الفريق" description="ستتمكن هنا من إدارة أعضاء الفريق وصلاحياتهم بعد ربط قاعدة البيانات." icon={Users} />}
        {active === "settings" && <PlaceholderPage title="الإعدادات" description="إعدادات الحساب والتنبيهات ستتوفر في مرحلة لاحقة." icon={Settings} />}
      </main>

      {showTaskForm && (
        <div className="modal-backdrop" onClick={() => setShowTaskForm(false)}>
          <form className="task-modal" onSubmit={addTask} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="section-kicker">مهمة جديدة</span><h3>أضف مهمة إلى قائمتك</h3></div><button type="button" className="icon-button" onClick={() => setShowTaskForm(false)} aria-label="إغلاق"><X size={19} /></button></div>
            <label htmlFor="task-title">عنوان المهمة</label>
            <input id="task-title" autoFocus value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="اكتب عنوان المهمة..." />
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>إلغاء</button><button className="primary-button" type="submit"><Plus size={17} /> إضافة المهمة</button></div>
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
  const done = task.status === "مكتملة";
  return <div className={`task-row ${done ? "task-done" : ""}`}>
    <button className={`task-check ${done ? "checked" : ""}`} onClick={() => onToggle(task.id)} aria-label={done ? "إلغاء إكمال المهمة" : "إكمال المهمة"}>{done && <CheckCircle2 size={17} />}</button>
    <div className="task-main"><strong>{task.title}</strong><span>{task.project} <i /> {task.due}</span></div>
    <span className={`status-pill ${done ? "completed" : task.status === "قيد التنفيذ" ? "in-progress" : "new"}`}>{task.status}</span>
  </div>;
}

function PlaceholderPage({ title, description, icon: Icon }) {
  return <div className="page-content"><section className="panel placeholder-panel"><div className="placeholder-icon"><Icon size={30} /></div><h2>{title}</h2><p>{description}</p><span className="coming-soon">قريبًا</span></section></div>;
}

export default App;
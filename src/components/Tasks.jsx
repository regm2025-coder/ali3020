import { useState, useEffect, useCallback } from "react";
import { Plus, User, CalendarDays, Clock, Bell, Trash2, ListChecks } from "lucide-react";
import { supabase } from "../lib/supabase";
import { STATUS_LABELS, formatDateTime, localToISO } from "../lib/format";
import { Sheet, Empty, ConfirmDialog } from "./ui";

const EMPTY_FORM = {
  title: "",
  description: "",
  assigned_to: "",
  meeting_id: "",
  due_date: "",
  remind_at: "",
};

export default function Tasks({ session, orgId, isManager }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const userId = session.user.id;

  const load = useCallback(async () => {
    let query = supabase
      .from("assignments")
      .select(
        "id, title, description, status, due_date, remind_at, assigned_to, meeting_id, created_at"
      )
      .order("created_at", { ascending: false });

    // الموظف يرى مهامه فقط (RLS يضمن ذلك أيضاً)
    if (!isManager) query = query.eq("assigned_to", userId);

    const { data, error } = await query;
    if (error) {
      setMessage({ type: "error", text: "تعذر تحميل المهام. اسحب لتحديث الصفحة وحاول مرة أخرى." });
      return;
    }
    setTasks(data || []);
  }, [isManager, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isManager) return;
    supabase
      .from("memberships")
      .select("user_id, username")
      .eq("organization_id", orgId)
      .eq("status", "approved")
      .eq("role", "employee")
      .order("username")
      .then(({ data }) => setMembers(data || []));
    supabase
      .from("meetings")
      .select("id, title, meeting_date")
      .eq("organization_id", orgId)
      .order("meeting_date", { ascending: false })
      .then(({ data }) => setMeetings(data || []));
  }, [isManager, orgId]);

  const usernameOf = (id) =>
    members.find((m) => m.user_id === id)?.username || "—";
  const meetingOf = (id) => meetings.find((m) => m.id === id)?.title;

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function closeForm() {
    setShowForm(false);
  }

  async function handleCreate(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    if (!form.assigned_to) {
      setMessage({ type: "error", text: "اختر الموظف المكلَّف بالمهمة." });
      return;
    }

    setBusy("create");
    try {
      const remindISO = localToISO(form.remind_at);

      const { data: created, error } = await supabase
        .from("assignments")
        .insert({
          organization_id: orgId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          assigned_to: form.assigned_to,
          meeting_id: form.meeting_id || null,
          due_date: localToISO(form.due_date),
          remind_at: remindISO,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      let reminderFailed = false;
      if (remindISO) {
        const { error: reminderError } = await supabase.from("reminders").insert({
          organization_id: orgId,
          user_id: form.assigned_to,
          assignment_id: created.id,
          title: `تذكير بمهمة: ${form.title.trim()}`,
          body: form.description.trim() || null,
          remind_at: remindISO,
          channel: "push",
          created_by: userId,
        });
        reminderFailed = Boolean(reminderError);
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage(
        reminderFailed
          ? { type: "error", text: "أُنشئت المهمة لكن تعذر إنشاء التذكير." }
          : { type: "success", text: "تمت إضافة المهمة." }
      );
      await load();
    } catch {
      setMessage({ type: "error", text: "تعذر إضافة المهمة. تحقق من البيانات وحاول مرة أخرى." });
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(task, status) {
    setBusy(task.id);
    setMessage({ type: "", text: "" });
    const { error } = await supabase
      .from("assignments")
      .update({ status })
      .eq("id", task.id);
    if (error) {
      setMessage({ type: "error", text: "تعذر تحديث حالة المهمة." });
    } else {
      setTasks((current) =>
        current.map((t) => (t.id === task.id ? { ...t, status } : t))
      );
    }
    setBusy("");
  }

  async function handleDelete(task) {
    setBusy(task.id);
    setMessage({ type: "", text: "" });

    // التذكيرات المرتبطة تُحذف أولاً حتى لا يمنع المفتاح الأجنبي حذف المهمة
    await supabase.from("reminders").delete().eq("assignment_id", task.id);
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", task.id);

    if (error) {
      setMessage({ type: "error", text: "تعذر حذف المهمة." });
    } else {
      setTasks((current) => current.filter((t) => t.id !== task.id));
    }
    setBusy("");
    setToDelete(null);
  }

  const visible =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const count = (status) => tasks.filter((t) => t.status === status).length;

  const isOverdue = (t) =>
    t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date();

  const filters = [
    ["all", "الكل", tasks.length],
    ["new", STATUS_LABELS.new, count("new")],
    ["in_progress", STATUS_LABELS.in_progress, count("in_progress")],
    ["completed", STATUS_LABELS.completed, count("completed")],
  ];

  return (
    <section className="page">
      {message.text && (
        <p className={message.type === "error" ? "notice notice-error" : "notice notice-ok"}>
          {message.text}
        </p>
      )}

      <div className="chips" role="tablist" aria-label="تصفية المهام">
        {filters.map(([value, label, n]) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "chip is-active" : "chip"}
            onClick={() => setFilter(value)}
          >
            {label}
            <span className="chip-count">{n.toLocaleString("ar")}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        tasks.length === 0 ? (
          <Empty
            icon={ListChecks}
            title={isManager ? "لا توجد مهام بعد" : "لا توجد مهام مسندة لك"}
            hint={
              isManager
                ? "اضغط زر «+» لتكليف أحد الموظفين بأول مهمة."
                : "ستظهر هنا المهام التي يكلّفك بها المدير."
            }
          />
        ) : (
          <Empty icon={ListChecks} title="لا توجد مهام بهذه الحالة" hint="جرّب تصفية أخرى من الأعلى." />
        )
      ) : (
        <ul className="list">
          {visible.map((t) => (
            <li key={t.id} className="task" data-status={t.status}>
              <h3>{t.title}</h3>
              {t.description && <p className="task-desc">{t.description}</p>}

              <div className="meta">
                {isManager && (
                  <span className="meta-item">
                    <User size={14} />
                    {usernameOf(t.assigned_to)}
                  </span>
                )}
                {t.meeting_id && meetingOf(t.meeting_id) && (
                  <span className="meta-item">
                    <CalendarDays size={14} />
                    {meetingOf(t.meeting_id)}
                  </span>
                )}
                {t.due_date && (
                  <span className={isOverdue(t) ? "meta-item is-late" : "meta-item"}>
                    <Clock size={14} />
                    {formatDateTime(t.due_date)}
                    {isOverdue(t) && " (متأخرة)"}
                  </span>
                )}
                {t.remind_at && (
                  <span className="meta-item">
                    <Bell size={14} />
                    {formatDateTime(t.remind_at)}
                  </span>
                )}
              </div>

              <div className="task-foot">
                <div className="status-control" role="group" aria-label="حالة المهمة">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={t.status === value ? "status-btn is-active" : "status-btn"}
                      data-status={value}
                      aria-pressed={t.status === value}
                      disabled={busy === t.id}
                      onClick={() => t.status !== value && changeStatus(t, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {isManager && (
                  <button
                    className="icon-btn is-danger"
                    aria-label={`حذف المهمة ${t.title}`}
                    disabled={busy === t.id}
                    onClick={() => setToDelete(t)}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isManager && (
        <button className="fab" onClick={() => setShowForm(true)} aria-label="مهمة جديدة">
          <Plus size={26} />
        </button>
      )}

      {toDelete && (
        <ConfirmDialog
          title="حذف المهمة؟"
          message={`«${toDelete.title}»`}
          busy={busy === toDelete.id}
          onConfirm={() => handleDelete(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}

      {isManager && showForm && (
        <Sheet title="مهمة جديدة" onClose={closeForm}>
          <form className="form" onSubmit={handleCreate}>
            <label className="field">
              <span>عنوان المهمة</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>الوصف (اختياري)</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </label>
            <label className="field">
              <span>المكلَّف</span>
              <select
                value={form.assigned_to}
                onChange={(e) => setField("assigned_to", e.target.value)}
                required
              >
                <option value="">اختر موظفاً</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الاجتماع المرتبط (اختياري)</span>
              <select
                value={form.meeting_id}
                onChange={(e) => setField("meeting_id", e.target.value)}
              >
                <option value="">بدون اجتماع</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label className="field">
                <span>موعد التسليم</span>
                <input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setField("due_date", e.target.value)}
                />
              </label>
              <label className="field">
                <span>موعد التذكير</span>
                <input
                  type="datetime-local"
                  value={form.remind_at}
                  onChange={(e) => setField("remind_at", e.target.value)}
                />
              </label>
            </div>
            {message.type === "error" && message.text && (
              <p className="field-error">{message.text}</p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy === "create"}>
              {busy === "create" ? "جاري الحفظ" : "حفظ المهمة"}
            </button>
          </form>
        </Sheet>
      )}
    </section>
  );
}

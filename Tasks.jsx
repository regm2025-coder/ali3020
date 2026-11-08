import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { STATUS_LABELS, formatDateTime, localToISO } from "../lib/format";

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
      setMessage({ type: "error", text: "تعذر تحميل المهام." });
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
        if (reminderError) {
          setMessage({
            type: "error",
            text: "أُنشئت المهمة لكن تعذر إنشاء التذكير.",
          });
          setForm(EMPTY_FORM);
          setShowForm(false);
          await load();
          return;
        }
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage({ type: "success", text: "تمت إضافة المهمة بنجاح." });
      await load();
    } catch {
      setMessage({ type: "error", text: "تعذر إضافة المهمة." });
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
    if (!window.confirm(`حذف المهمة «${task.title}»؟`)) return;
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
  }

  const visible =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const isOverdue = (t) =>
    t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{isManager ? "المهام" : "مهامي"} ({tasks.length})</h2>
        {isManager && (
          <button
            className="primary-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "إغلاق" : "+ مهمة جديدة"}
          </button>
        )}
      </div>

      {message.text && (
        <p className={message.type === "error" ? "error-text" : "info-text"}>
          {message.text}
        </p>
      )}

      {isManager && showForm && (
        <form className="item-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="عنوان المهمة"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            required
          />
          <textarea
            placeholder="وصف المهمة (اختياري)"
            rows={3}
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
          <label>
            المكلَّف
            <select
              value={form.assigned_to}
              onChange={(e) => setField("assigned_to", e.target.value)}
              required
            >
              <option value="">— اختر موظفاً —</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            الاجتماع المرتبط (اختياري)
            <select
              value={form.meeting_id}
              onChange={(e) => setField("meeting_id", e.target.value)}
            >
              <option value="">— بدون —</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              موعد التسليم
              <input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setField("due_date", e.target.value)}
              />
            </label>
            <label>
              موعد التذكير
              <input
                type="datetime-local"
                value={form.remind_at}
                onChange={(e) => setField("remind_at", e.target.value)}
              />
            </label>
          </div>
          <button type="submit" className="primary-btn" disabled={busy === "create"}>
            {busy === "create" ? "جاري الحفظ..." : "حفظ المهمة"}
          </button>
        </form>
      )}

      <div className="chips">
        {[
          ["all", "الكل"],
          ["new", STATUS_LABELS.new],
          ["in_progress", STATUS_LABELS.in_progress],
          ["completed", STATUS_LABELS.completed],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "chip active" : "chip"}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="empty-text">
          {tasks.length === 0
            ? isManager
              ? "لا توجد مهام بعد. أضف أول مهمة."
              : "لا توجد مهام مسندة لك حالياً."
            : "لا توجد مهام بهذه الحالة."}
        </p>
      ) : (
        <ul className="assignments-list">
          {visible.map((t) => (
            <li key={t.id} className={`assignment-item status-${t.status}`}>
              <div className="item-top">
                <strong>{t.title}</strong>
                <span className={`badge badge-${t.status}`}>
                  {STATUS_LABELS[t.status]}
                </span>
              </div>
              {t.description && <p>{t.description}</p>}
              <div className="item-meta">
                {isManager && <span>المكلَّف: {usernameOf(t.assigned_to)}</span>}
                {t.meeting_id && meetingOf(t.meeting_id) && (
                  <span>الاجتماع: {meetingOf(t.meeting_id)}</span>
                )}
                {t.due_date && (
                  <span className={isOverdue(t) ? "overdue" : ""}>
                    التسليم: {formatDateTime(t.due_date)}
                    {isOverdue(t) && " (متأخرة)"}
                  </span>
                )}
                {t.remind_at && <span>🔔 {formatDateTime(t.remind_at)}</span>}
              </div>
              <div className="item-actions">
                <select
                  value={t.status}
                  disabled={busy === t.id}
                  onChange={(e) => changeStatus(t, e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {isManager && (
                  <button
                    className="reject-btn"
                    disabled={busy === t.id}
                    onClick={() => handleDelete(t)}
                  >
                    حذف
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { formatDateTime, localToISO } from "../lib/format";

const EMPTY_FORM = {
  title: "",
  description: "",
  meeting_date: "",
  remind: true,
};

// قبل كم دقيقة من الاجتماع يصل التذكير
const REMIND_BEFORE_MINUTES = 60;

export default function Meetings({ session, orgId, isManager }) {
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  const userId = session.user.id;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, description, meeting_date")
      .eq("organization_id", orgId)
      .order("meeting_date", { ascending: true });

    if (error) {
      setMessage({ type: "error", text: "تعذر تحميل الاجتماعات." });
      return;
    }
    setMeetings(data || []);
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setBusy("create");

    try {
      const dateISO = localToISO(form.meeting_date);

      const { data: created, error } = await supabase
        .from("meetings")
        .insert({
          organization_id: orgId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          meeting_date: dateISO,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      let reminderNote = "";
      const remindAt = new Date(
        new Date(dateISO).getTime() - REMIND_BEFORE_MINUTES * 60 * 1000
      );

      // تذكير جميع الأعضاء المعتمدين قبل الاجتماع (إن كان الوقت لم يفت)
      if (form.remind && remindAt > new Date()) {
        const { data: people } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("organization_id", orgId)
          .eq("status", "approved");

        if (people?.length) {
          const { error: reminderError } = await supabase
            .from("reminders")
            .insert(
              people.map((p) => ({
                organization_id: orgId,
                user_id: p.user_id,
                meeting_id: created.id,
                title: `اجتماع قريب: ${form.title.trim()}`,
                body: `يبدأ الاجتماع ${formatDateTime(dateISO)}`,
                remind_at: remindAt.toISOString(),
                channel: "push",
                created_by: userId,
              }))
            );
          reminderNote = reminderError
            ? " (تعذر إنشاء التذكيرات)"
            : " وسيصل تذكير للجميع قبل ساعة.";
        }
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage({
        type: "success",
        text: `تمت إضافة الاجتماع${reminderNote}`,
      });
      await load();
    } catch {
      setMessage({ type: "error", text: "تعذر إضافة الاجتماع." });
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(meeting) {
    if (!window.confirm(`حذف الاجتماع «${meeting.title}»؟`)) return;
    setBusy(meeting.id);
    setMessage({ type: "", text: "" });

    // فك ارتباط المهام وحذف التذكيرات حتى لا تمنع المفاتيح الأجنبية الحذف
    await supabase
      .from("assignments")
      .update({ meeting_id: null })
      .eq("meeting_id", meeting.id);
    await supabase.from("reminders").delete().eq("meeting_id", meeting.id);

    const { error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", meeting.id);

    if (error) {
      setMessage({ type: "error", text: "تعذر حذف الاجتماع." });
    } else {
      setMeetings((current) => current.filter((m) => m.id !== meeting.id));
    }
    setBusy("");
  }

  const now = new Date();
  const upcoming = meetings.filter((m) => new Date(m.meeting_date) >= now);
  const past = meetings
    .filter((m) => new Date(m.meeting_date) < now)
    .reverse();

  const renderList = (list) => (
    <ul className="assignments-list">
      {list.map((m) => (
        <li key={m.id} className="assignment-item">
          <div className="item-top">
            <strong>{m.title}</strong>
            <span className="badge">{formatDateTime(m.meeting_date)}</span>
          </div>
          {m.description && <p>{m.description}</p>}
          {isManager && (
            <div className="item-actions">
              <button
                className="reject-btn"
                disabled={busy === m.id}
                onClick={() => handleDelete(m)}
              >
                حذف
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>الاجتماعات ({meetings.length})</h2>
        {isManager && (
          <button
            className="primary-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "إغلاق" : "+ اجتماع جديد"}
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
            placeholder="عنوان الاجتماع"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            required
          />
          <textarea
            placeholder="الوصف أو جدول الأعمال (اختياري)"
            rows={3}
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
          <label>
            موعد الاجتماع
            <input
              type="datetime-local"
              value={form.meeting_date}
              onChange={(e) => setField("meeting_date", e.target.value)}
              required
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.remind}
              onChange={(e) => setField("remind", e.target.checked)}
            />
            تذكير جميع الأعضاء قبل الاجتماع بساعة
          </label>
          <button type="submit" className="primary-btn" disabled={busy === "create"}>
            {busy === "create" ? "جاري الحفظ..." : "حفظ الاجتماع"}
          </button>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="empty-text">
          {isManager ? "لا توجد اجتماعات بعد. أضف أول اجتماع." : "لا توجد اجتماعات مجدولة."}
        </p>
      ) : (
        <>
          <h3 className="list-title">القادمة ({upcoming.length})</h3>
          {upcoming.length ? renderList(upcoming) : <p className="empty-text">لا توجد اجتماعات قادمة.</p>}
          {past.length > 0 && (
            <>
              <h3 className="list-title">السابقة ({past.length})</h3>
              {renderList(past)}
            </>
          )}
        </>
      )}
    </section>
  );
}

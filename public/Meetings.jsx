import { useState, useEffect, useCallback } from "react";
import { Plus, Clock, CalendarDays, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDateTime, localToISO } from "../lib/format";
import { Sheet, Empty } from "./ui";

const EMPTY_FORM = {
  title: "",
  description: "",
  meeting_date: "",
  remind: true,
};

// قبل كم دقيقة من الاجتماع يصل التذكير
const REMIND_BEFORE_MINUTES = 60;

const num = (n) => n.toLocaleString("ar");

// «بعد ساعتين»، «بعد ٣ أيام»... بصيغ العدد الصحيحة في العربية
function unit(n, one, two, few, many) {
  if (n === 1) return `بعد ${one}`;
  if (n === 2) return `بعد ${two}`;
  if (n <= 10) return `بعد ${num(n)} ${few}`;
  return `بعد ${num(n)} ${many}`;
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.round((new Date(value) - new Date()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return unit(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return unit(hours, "ساعة", "ساعتين", "ساعات", "ساعة");
  const days = Math.round(hours / 24);
  return unit(days, "يوم", "يومين", "أيام", "يوماً");
}

const dayOf = (v) => new Date(v).toLocaleDateString("ar", { day: "numeric" });
const monthOf = (v) => new Date(v).toLocaleDateString("ar", { month: "short" });
const timeOf = (v) =>
  new Date(v).toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" });

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
      setMessage({ type: "error", text: "تعذر تحميل الاجتماعات. حاول مرة أخرى بعد قليل." });
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

  function closeForm() {
    setShowForm(false);
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
            ? " لكن تعذر إنشاء التذكيرات."
            : " وسيصل تذكير للجميع قبله بساعة.";
        }
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage({
        type: reminderNote.includes("تعذر") ? "error" : "success",
        text: `تمت إضافة الاجتماع${reminderNote}`,
      });
      await load();
    } catch {
      setMessage({ type: "error", text: "تعذر إضافة الاجتماع. تحقق من البيانات وحاول مرة أخرى." });
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
  const next = upcoming[0];
  const later = upcoming.slice(1);

  const renderItem = (m, isPast) => (
    <li key={m.id} className={isPast ? "meeting is-past" : "meeting"}>
      <div className="date-block" aria-hidden="true">
        <strong>{dayOf(m.meeting_date)}</strong>
        <span>{monthOf(m.meeting_date)}</span>
      </div>
      <div className="meeting-body">
        <h3>{m.title}</h3>
        <div className="meta">
          <span className="meta-item">
            <Clock size={14} />
            {timeOf(m.meeting_date)}
          </span>
        </div>
        {m.description && <p className="task-desc">{m.description}</p>}
      </div>
      {isManager && (
        <button
          className="icon-btn is-danger"
          aria-label={`حذف الاجتماع ${m.title}`}
          disabled={busy === m.id}
          onClick={() => handleDelete(m)}
        >
          <Trash2 size={18} />
        </button>
      )}
    </li>
  );

  return (
    <section className="page">
      {message.text && (
        <p className={message.type === "error" ? "notice notice-error" : "notice notice-ok"}>
          {message.text}
        </p>
      )}

      {meetings.length === 0 && (
        <Empty
          icon={CalendarDays}
          title="لا توجد اجتماعات مجدولة"
          hint={
            isManager
              ? "اضغط زر «+» لجدولة أول اجتماع، وسيصل تذكير للجميع قبله."
              : "ستظهر هنا الاجتماعات التي يجدولها المدير."
          }
        />
      )}

      {next && (
        <article className="next-card">
          <span className="next-when">{relativeTime(next.meeting_date)}</span>
          <h3>{next.title}</h3>
          <p className="next-time">
            <Clock size={16} />
            {formatDateTime(next.meeting_date)}
          </p>
          {next.description && <p className="next-desc">{next.description}</p>}
          {isManager && (
            <button
              className="next-delete"
              aria-label={`حذف الاجتماع ${next.title}`}
              disabled={busy === next.id}
              onClick={() => handleDelete(next)}
            >
              <Trash2 size={18} />
            </button>
          )}
        </article>
      )}

      {later.length > 0 && (
        <>
          <h2 className="section-title">القادمة</h2>
          <ul className="list">{later.map((m) => renderItem(m, false))}</ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-title">السابقة</h2>
          <ul className="list">{past.map((m) => renderItem(m, true))}</ul>
        </>
      )}

      {isManager && (
        <button className="fab" onClick={() => setShowForm(true)} aria-label="اجتماع جديد">
          <Plus size={26} />
        </button>
      )}

      {isManager && showForm && (
        <Sheet title="اجتماع جديد" onClose={closeForm}>
          <form className="form" onSubmit={handleCreate}>
            <label className="field">
              <span>عنوان الاجتماع</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>الوصف أو جدول الأعمال (اختياري)</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </label>
            <label className="field">
              <span>موعد الاجتماع</span>
              <input
                type="datetime-local"
                value={form.meeting_date}
                onChange={(e) => setField("meeting_date", e.target.value)}
                required
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.remind}
                onChange={(e) => setField("remind", e.target.checked)}
              />
              <span>تذكير جميع الأعضاء قبل الاجتماع بساعة</span>
            </label>
            {message.type === "error" && message.text && (
              <p className="field-error">{message.text}</p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy === "create"}>
              {busy === "create" ? "جاري الحفظ" : "حفظ الاجتماع"}
            </button>
          </form>
        </Sheet>
      )}
    </section>
  );
}

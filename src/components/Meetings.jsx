import { useState, useEffect, useCallback } from "react";
import { Plus, Clock, CalendarDays, Trash2, Check, X, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDateTime, localToISO, isoToLocal } from "../lib/format";
import { Sheet, Empty, ConfirmDialog } from "./ui";

const EMPTY_FORM = {
  title: "",
  description: "",
  meeting_date: "",
  minutes: "",
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

export default function Meetings({ session, orgId, isManager, intent, onIntentDone }) {
  const [meetings, setMeetings] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [people, setPeople] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const userId = session.user.id;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, description, meeting_date, minutes")
      .eq("organization_id", orgId)
      .order("meeting_date", { ascending: true });

    if (error) {
      setMessage({ type: "error", text: "تعذر تحميل الاجتماعات. حاول مرة أخرى بعد قليل." });
      return;
    }
    setMeetings(data || []);

    // ردود الحضور: العضو يرى ردّه فقط، والمدير يرى الجميع (RLS يضمن ذلك)
    const { data: replies } = await supabase
      .from("meeting_attendance")
      .select("meeting_id, user_id, response");
    setAttendance(replies || []);
    setLoaded(true);
  }, [orgId]);

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
      .then(({ data }) => setPeople(data || []));
  }, [isManager, orgId]);

  const myReply = (meetingId) =>
    attendance.find((a) => a.meeting_id === meetingId && a.user_id === userId)?.response;

  async function respond(meeting, response) {
    setMessage({ type: "", text: "" });
    setBusy(`rsvp-${meeting.id}`);
    const { error } = await supabase.from("meeting_attendance").upsert(
      {
        meeting_id: meeting.id,
        user_id: userId,
        organization_id: orgId,
        response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id,user_id" }
    );
    if (error) {
      setMessage({ type: "error", text: "تعذر تسجيل ردّك. حاول مرة أخرى." });
    } else {
      setAttendance((cur) => [
        ...cur.filter((a) => !(a.meeting_id === meeting.id && a.user_id === userId)),
        { meeting_id: meeting.id, user_id: userId, response },
      ]);
      setMessage({
        type: "success",
        text: response === "attending" ? "تم تسجيل حضورك." : "تم تسجيل اعتذارك.",
      });
    }
    setBusy("");
  }

  // الضغط على زر في الإشعار يفتح هنا مع الرد المختار، فيكفي تأكيد واحد
  const target = intent ? meetings.find((m) => m.id === intent.meetingId) : null;

  useEffect(() => {
    // الاجتماع غير موجود (حُذف مثلاً) أو لا يوجد رد مختار: لا شيء ننتظره
    if (loaded && intent && (!target || !intent.rsvp)) onIntentDone?.();
  }, [loaded, intent, target, onIntentDone]);

  async function confirmIntent() {
    await respond(target, intent.rsvp);
    onIntentDone?.();
  }

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  function openNew() {
    setMessage({ type: "", text: "" });
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(m) {
    setMessage({ type: "", text: "" });
    setForm({
      title: m.title,
      description: m.description || "",
      meeting_date: isoToLocal(m.meeting_date),
      minutes: m.minutes || "",
      remind: true,
    });
    setEditing(m);
    setShowForm(true);
  }

  // تذكير جميع الأعضاء المعتمدين قبل الاجتماع بساعة (إن كان الوقت لم يفت)
  async function createReminders(meetingId, title, dateISO) {
    const remindAt = new Date(new Date(dateISO).getTime() - REMIND_BEFORE_MINUTES * 60 * 1000);
    if (remindAt <= new Date()) return "";

    const { data: people } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("status", "approved");
    if (!people?.length) return "";

    const { error } = await supabase.from("reminders").insert(
      people.map((p) => ({
        organization_id: orgId,
        user_id: p.user_id,
        meeting_id: meetingId,
        title: `اجتماع قريب: ${title}`,
        body: `يبدأ الاجتماع ${formatDateTime(dateISO)}`,
        remind_at: remindAt.toISOString(),
        channel: "push",
        created_by: userId,
      }))
    );
    return error ? " لكن تعذر إنشاء التذكيرات." : " وسيصل تذكير للجميع قبله بساعة.";
  }

  async function handleSave(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setBusy("create");

    try {
      const dateISO = localToISO(form.meeting_date);
      const title = form.title.trim();
      let reminderNote = "";

      if (editing) {
        const { error } = await supabase
          .from("meetings")
          .update({
            title,
            description: form.description.trim() || null,
            meeting_date: dateISO,
            minutes: form.minutes.trim() || null,
          })
          .eq("id", editing.id);
        if (error) throw error;

        // تغيّر الموعد أو العنوان: نستبدل التذكيرات التي لم تُرسل بعد
        const changed =
          new Date(dateISO).getTime() !== new Date(editing.meeting_date).getTime() ||
          title !== editing.title;
        if (changed) {
          await supabase.from("reminders").delete().eq("meeting_id", editing.id).is("sent_at", null);
          if (form.remind) reminderNote = await createReminders(editing.id, title, dateISO);
        }
      } else {
        const { data: created, error } = await supabase
          .from("meetings")
          .insert({
            organization_id: orgId,
            title,
            description: form.description.trim() || null,
            meeting_date: dateISO,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw error;

        if (form.remind) reminderNote = await createReminders(created.id, title, dateISO);
      }

      const wasEditing = Boolean(editing);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditing(null);
      setMessage({
        type: reminderNote.includes("تعذر") ? "error" : "success",
        text: `${wasEditing ? "تم تحديث الاجتماع" : "تمت إضافة الاجتماع"}${reminderNote}`,
      });
      await load();
    } catch {
      setMessage({ type: "error", text: "تعذر حفظ الاجتماع. تحقق من البيانات وحاول مرة أخرى." });
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(meeting) {
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
    setToDelete(null);
  }

  const now = new Date();
  const upcoming = meetings.filter((m) => new Date(m.meeting_date) >= now);
  const past = meetings
    .filter((m) => new Date(m.meeting_date) < now)
    .reverse();
  const next = upcoming[0];
  const later = upcoming.slice(1);

  const renderRsvp = (m) => {
    const mine = myReply(m.id);
    const working = busy === `rsvp-${m.id}`;
    const replies = attendance.filter((a) => a.meeting_id === m.id);
    const yes = replies.filter((a) => a.response === "attending");
    const no = replies.filter((a) => a.response === "absent");
    const nameOf = (id) => people.find((p) => p.user_id === id)?.username || "—";
    const waiting = people.filter((p) => !replies.some((a) => a.user_id === p.user_id));

    return (
      <div className="rsvp">
        <div className="rsvp-buttons" role="group" aria-label="الرد على الاجتماع">
          <button
            type="button"
            className={mine === "attending" ? "rsvp-btn is-yes is-active" : "rsvp-btn is-yes"}
            aria-pressed={mine === "attending"}
            disabled={working}
            onClick={() => mine !== "attending" && respond(m, "attending")}
          >
            <Check size={16} />
            سأحضر
          </button>
          <button
            type="button"
            className={mine === "absent" ? "rsvp-btn is-no is-active" : "rsvp-btn is-no"}
            aria-pressed={mine === "absent"}
            disabled={working}
            onClick={() => mine !== "absent" && respond(m, "absent")}
          >
            <X size={16} />
            أعتذر
          </button>
        </div>
        {isManager && (
          <details className="rsvp-summary">
            <summary>
              {yes.length.toLocaleString("ar")} حاضر · {no.length.toLocaleString("ar")} معتذر ·{" "}
              {waiting.length.toLocaleString("ar")} لم يردّوا
            </summary>
            <ul>
              {yes.map((a) => (
                <li key={a.user_id} className="is-yes">{nameOf(a.user_id)} — سيحضر</li>
              ))}
              {no.map((a) => (
                <li key={a.user_id} className="is-no">{nameOf(a.user_id)} — يعتذر</li>
              ))}
              {waiting.map((p) => (
                <li key={p.user_id}>{p.username} — لم يردّ</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  };

  const renderMinutes = (m) =>
    m.minutes ? (
      <details className="minutes">
        <summary>محضر الاجتماع</summary>
        <p>{m.minutes}</p>
      </details>
    ) : null;

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
        {!isPast && renderRsvp(m)}
        {renderMinutes(m)}
      </div>
      {isManager && (
        <button
          className="icon-btn"
          aria-label={`تعديل الاجتماع ${m.title}`}
          onClick={() => openEdit(m)}
        >
          <Pencil size={18} />
        </button>
      )}
      {isManager && (
        <button
          className="icon-btn is-danger"
          aria-label={`حذف الاجتماع ${m.title}`}
          disabled={busy === m.id}
          onClick={() => setToDelete(m)}
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

      {target && intent?.rsvp && (
        <div className="confirm-bar" role="alert">
          <p>
            تأكيد ردّك على «{target.title}»:{" "}
            <strong>{intent.rsvp === "attending" ? "سأحضر" : "أعتذر"}</strong>
          </p>
          <div className="confirm-actions">
            <button className="btn btn-primary btn-sm" disabled={busy !== ""} onClick={confirmIntent}>
              تأكيد
            </button>
            <button className="btn btn-quiet btn-sm" onClick={() => onIntentDone?.()}>
              إلغاء
            </button>
          </div>
        </div>
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
          {renderRsvp(next)}
          {renderMinutes(next)}
          {isManager && (
            <button
              className="next-delete next-edit"
              aria-label={`تعديل الاجتماع ${next.title}`}
              onClick={() => openEdit(next)}
            >
              <Pencil size={18} />
            </button>
          )}
          {isManager && (
            <button
              className="next-delete"
              aria-label={`حذف الاجتماع ${next.title}`}
              disabled={busy === next.id}
              onClick={() => setToDelete(next)}
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
        <button className="fab" onClick={openNew} aria-label="اجتماع جديد">
          <Plus size={26} />
        </button>
      )}

      {toDelete && (
        <ConfirmDialog
          title="حذف الاجتماع؟"
          message={`«${toDelete.title}»`}
          busy={busy === toDelete.id}
          onConfirm={() => handleDelete(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}

      {isManager && showForm && (
        <Sheet title={editing ? "تعديل الاجتماع" : "اجتماع جديد"} onClose={closeForm}>
          <form className="form" onSubmit={handleSave}>
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
            {editing && (
              <label className="field">
                <span>محضر الاجتماع (اختياري)</span>
                <textarea
                  rows={5}
                  value={form.minutes}
                  onChange={(e) => setField("minutes", e.target.value)}
                  placeholder="القرارات والملاحظات وما تم الاتفاق عليه"
                />
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={form.remind}
                onChange={(e) => setField("remind", e.target.checked)}
              />
              <span>
                {editing
                  ? "إعادة جدولة تذكير الأعضاء قبل الاجتماع بساعة"
                  : "تذكير جميع الأعضاء قبل الاجتماع بساعة"}
              </span>
            </label>
            {message.type === "error" && message.text && (
              <p className="field-error">{message.text}</p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy === "create"}>
              {busy === "create" ? "جاري الحفظ" : editing ? "حفظ التعديلات" : "حفظ الاجتماع"}
            </button>
          </form>
        </Sheet>
      )}
    </section>
  );
}

export const STATUS_LABELS = {
  new: "جديدة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
};

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// تحويل قيمة <input type="datetime-local"> إلى ISO أو null
export function localToISO(value) {
  return value ? new Date(value).toISOString() : null;
}

// تحويل ISO إلى قيمة <input type="datetime-local"> بالتوقيت المحلي
export function isoToLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

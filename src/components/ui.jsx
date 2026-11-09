import { useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";

// نافذة تصعد من أسفل الشاشة (للنماذج). الزر الرئيسي يكون في أسفلها دائماً.
export function Sheet({ title, onClose, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// حالة الفراغ: تشرح ما الذي يمكن فعله بدل أن تكتفي بقول «لا يوجد شيء»
export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

// نافذة تأكيد الحذف: بديل أنيق لنافذة المتصفح الافتراضية
export function ConfirmDialog({ title, message, confirmLabel = "حذف", busy, onConfirm, onCancel }) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="dialog-icon">
          <Trash2 size={26} />
        </span>
        <h2>{title}</h2>
        <p className="dialog-name">{message}</p>
        <p className="dialog-hint">لا يمكن التراجع عن هذا الإجراء.</p>
        <div className="dialog-actions">
          <button className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            إلغاء
          </button>
          <button className="btn btn-delete" onClick={onConfirm} disabled={busy}>
            {busy ? "جاري الحذف" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

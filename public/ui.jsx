import { useEffect, useRef } from "react";
import { X } from "lucide-react";

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

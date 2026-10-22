import { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons.jsx';

/**
 * Bottom sheet on phones, centred panel on wider screens. Uses <dialog> for focus handling and Esc.
 * `blocking` sheets (the agent is waiting on the user) can't be dismissed by tapping outside.
 */
export default function Sheet({ open, title, onClose, children, blocking = false, tall = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet${tall ? ' sheet-tall' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!blocking) onClose?.();
      }}
      onClick={(e) => {
        if (!blocking && e.target === ref.current) onClose?.();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="بستن">
              <CloseIcon size={18} />
            </button>
          )}
        </header>
        <div className="sheet-content">{children}</div>
      </div>
    </dialog>
  );
}

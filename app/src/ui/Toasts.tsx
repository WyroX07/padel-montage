// Messages brefs en bas de l'écran.

import { useCallback, useMemo, useRef, useState } from "react";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
  action?: { label: string; run(): void };
}

export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (text: string, tone: Toast["tone"] = "info", action?: Toast["action"]) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, text, tone, action }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : action ? 7000 : 4000);
    },
    [dismiss],
  );
  return useMemo(() => ({ items, push, dismiss }), [items, push, dismiss]);
}

export function Toasts({ items, dismiss }: { items: Toast[]; dismiss(id: number): void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

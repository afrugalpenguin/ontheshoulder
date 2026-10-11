import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

type Show = (message: string, action?: ToastAction) => void;

// Outside a provider (a component test, say) showing a toast does nothing.
const ToastContext = createContext<Show>(() => undefined);

/** How long a toast stays up. */
export const TOAST_MS = 4000;

/** Holds the toasts and draws them above the tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback<Show>(
    (message, action) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, ...(action ? { action } : {}) }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" role="status">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a function that shows a short message, with an optional action such as Undo. */
export const useToast = (): Show => useContext(ToastContext);

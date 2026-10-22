// Menu contextuel (clic droit) : liste d'actions positionnée sous la souris.

import { useEffect, useRef } from "react";

export type ContextItem = { label: string; action: () => void; disabled?: boolean } | "separator";

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  // Reste dans la fenêtre.
  const style = { left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - items.length * 26 - 10) };
  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      {items.map((it, i) =>
        it === "separator" ? <hr key={i} /> : (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={() => (it.action(), onClose())}>{it.label}</button>
        ),
      )}
    </div>
  );
}

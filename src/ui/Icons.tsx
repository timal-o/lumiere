// Icônes SVG (trait 1,5 px, couleur du texte).

import type { ReactNode } from "react";

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const icons = {
  select: <Icon><path d="M5 3l13 7-6 1.5L9 18z" /></Icon>,
  node: <Icon><path d="M4 19C8 6 16 18 20 5" /><rect x="2" y="17" width="4" height="4" fill="currentColor" /><rect x="18" y="3" width="4" height="4" fill="currentColor" /><path d="M12 12l5-2" /><circle cx="17" cy="10" r="1.5" /></Icon>,
  measure: <Icon><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></Icon>,
  trim: <Icon><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8 16L19 3M16 16L5 3" /></Icon>,
  tab: <Icon><path d="M3 12h7M14 12h7" /><path d="M10 9v6M14 9v6" /><rect x="3" y="5" width="18" height="14" rx="1" strokeDasharray="2 2" /></Icon>,
  position: <Icon><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></Icon>,
  magnet: <Icon><path d="M6 3v8a6 6 0 0 0 12 0V3" /><path d="M6 7h4M14 7h4" /></Icon>,
  line: <Icon><path d="M4 18l5-9 5 5 6-10" /><circle cx="4" cy="18" r="1.2" /><circle cx="9" cy="9" r="1.2" /><circle cx="14" cy="14" r="1.2" /><circle cx="20" cy="4" r="1.2" /></Icon>,
  rect: <Icon><rect x="4" y="6" width="16" height="12" rx="1" /></Icon>,
  ellipse: <Icon><ellipse cx="12" cy="12" rx="8.5" ry="6.5" /></Icon>,
  polygon: <Icon><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" /></Icon>,
  star: <Icon><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z" /></Icon>,
  text: <Icon><path d="M5 6V4h14v2M12 4v16M9 20h6" /></Icon>,
  undo: <Icon><path d="M9 7H4V2" /><path d="M4 7a8 8 0 1 1-1.5 7" /></Icon>,
  redo: <Icon><path d="M15 7h5V2" /><path d="M20 7a8 8 0 1 0 1.5 7" /></Icon>,
  rotL: <Icon><rect x="10" y="10" width="10" height="10" rx="1" /><path d="M4 14V8a4 4 0 0 1 4-4h6" /><path d="M11 1l3 3-3 3" /></Icon>,
  rotR: <Icon><rect x="4" y="10" width="10" height="10" rx="1" /><path d="M20 14V8a4 4 0 0 0-4-4h-6" /><path d="M13 1l-3 3 3 3" /></Icon>,
  mirrorH: <Icon><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 6L3 18h6zM15 6l6 12h-6z" /></Icon>,
  mirrorV: <Icon><path d="M3 12h18" strokeDasharray="2 2" /><path d="M6 9L18 3v6zM6 15l12 6v-6z" /></Icon>,
  alignLeft: <Icon><path d="M4 3v18" /><rect x="7" y="6" width="12" height="4" /><rect x="7" y="14" width="7" height="4" /></Icon>,
  alignCenterX: <Icon><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" /><rect x="8" y="14" width="8" height="4" /></Icon>,
  alignRight: <Icon><path d="M20 3v18" /><rect x="5" y="6" width="12" height="4" /><rect x="10" y="14" width="7" height="4" /></Icon>,
  alignTop: <Icon><path d="M3 4h18" /><rect x="6" y="7" width="4" height="12" /><rect x="14" y="7" width="4" height="7" /></Icon>,
  alignCenterY: <Icon><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" /><rect x="14" y="8" width="4" height="8" /></Icon>,
  alignBottom: <Icon><path d="M3 20h18" /><rect x="6" y="5" width="4" height="12" /><rect x="14" y="10" width="4" height="7" /></Icon>,
  distX: <Icon><path d="M3 3v18M21 3v18" /><rect x="9" y="8" width="6" height="8" /></Icon>,
  distY: <Icon><path d="M3 3h18M3 21h18" /><rect x="8" y="9" width="8" height="6" /></Icon>,
  group: <Icon><rect x="3" y="3" width="18" height="18" strokeDasharray="3 2" /><rect x="6" y="6" width="6" height="6" /><circle cx="15" cy="15" r="3" /></Icon>,
  ungroup: <Icon><rect x="4" y="4" width="7" height="7" /><circle cx="16" cy="16" r="4" /></Icon>,
  center: <Icon><rect x="3" y="3" width="18" height="18" /><rect x="9" y="9" width="6" height="6" /></Icon>,
  duplicate: <Icon><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Icon>,
  trash: <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>,
  lock: <Icon><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>,
  unlock: <Icon><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></Icon>,
  chevron: <Icon size={12}><path d="M6 9l6 6 6-6" /></Icon>,
};

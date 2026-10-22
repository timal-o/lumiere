// Raccourcis clavier personnalisables (Fichier → Préférences → Modifier les raccourcis clavier).
//
// Un raccourci s'écrit comme un accélérateur Tauri : « CmdOrCtrl+Shift+N », « Alt+X », « F12 »,
// « ; ». Ceux qui utilisent ⌘ (ou une touche de fonction) sont portés par le menu natif ;
// les autres (⌥ seul, touche seule) sont gérés par l'interface, hors des champs de saisie,
// pour ne pas empêcher la frappe de caractères comme « ~ » ou « { ».

/** Raccourcis gérés par l'interface, par défaut (comme LightBurn). */
export const INTERFACE_DEFAULTS: Record<string, string> = {
  exportSvg: "Alt+X",
  pasteInPlace: "Alt+V",
  join: "Alt+J",
  simplify: "Alt+Shift+O",
  deleteDuplicates: "Alt+D",
  "tool:measure": "Alt+M",
  offset: "Alt+O",
  union: "Alt+=",
  difference: "Alt+-",
  intersection: "Alt+8",
  cutShapes: "Alt+Shift+C",
  adjustImage: "Alt+I",
  trace: "Alt+T",
  rotateCw: ";",
  rotateCcw: ",",
  arrayGrid: "Alt+A",
  breakApart: "Alt+B",
  combine: "Alt+C",
  machine: "Alt+Shift+D",
  preview: "Alt+P",
  "view:toggle": "Alt+Shift+W",
  "together:x": "Alt+Shift+H",
  "together:y": "Alt+Shift+V",
  printCut: "Alt+0",
  "pc:first": "Alt+1",
  "pc:second": "Alt+2",
  "pc:align": "Alt+3",
  "pc:alignNoScale": "Alt+4",
};

const KEY = "lumiere.hotkeys";

/** Raccourcis modifiés par l'utilisateur (identifiant → accélérateur, "" = aucun). */
export function overrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function setOverrides(map: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // stockage indisponible
  }
  window.dispatchEvent(new Event("lumiere:menu-refresh"));
}

/** Porté par le menu natif (avec ⌘ ou touche de fonction), sinon par l'interface. */
export const isNative = (accel: string) => /(^|\+)(CmdOrCtrl|Cmd|Ctrl|Super)(\+|$)/.test(accel) || /(^|\+)F\d{1,2}$/.test(accel);

/** Raccourci effectif d'une commande, d'après celui du menu (`menuDefault`). */
export function effective(id: string, menuDefault = ""): string {
  const o = overrides();
  return id in o ? o[id] : menuDefault || INTERFACE_DEFAULTS[id] || "";
}

/** Raccourcis gérés par l'interface : accélérateur → commande. */
export function interfaceMap(): Map<string, string> {
  const map = new Map<string, string>();
  const o = overrides();
  for (const [id, accel] of Object.entries(INTERFACE_DEFAULTS)) if (!(id in o)) map.set(accel, id);
  for (const [id, accel] of Object.entries(o)) if (accel && !isNative(accel)) map.set(accel, id);
  return map;
}

/** Paramètres du menu natif : raccourcis personnalisés natifs, et rappels des raccourcis de l'interface. */
export function menuParams(): { shortcuts: Record<string, string>; hints: Record<string, string> } {
  const shortcuts: Record<string, string> = {};
  for (const [id, accel] of Object.entries(overrides())) shortcuts[id] = isNative(accel) ? accel : "";
  const hints: Record<string, string> = {};
  for (const [accel, id] of interfaceMap()) hints[id] = symbols(accel);
  return { shortcuts, hints };
}

const CODE_KEYS: Record<string, string> = {
  Equal: "=", Minus: "-", NumpadAdd: "=", NumpadSubtract: "-", NumpadMultiply: "8", Comma: ",", Period: ".",
  Semicolon: ";", Slash: "/", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Space: "Space", Enter: "Enter",
  Backspace: "Backspace", Delete: "Delete", Tab: "Tab", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};

/**
 * Accélérateur d'un événement clavier. Avec un modificateur, la touche est lue à sa position
 * (indépendante de la disposition, comme le menu natif) ; seule, c'est le caractère tapé.
 */
export function eventAccel(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;
  const mods = [e.metaKey || e.ctrlKey ? "CmdOrCtrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^(Digit|Numpad)\d$/.test(e.code)) key = e.code.slice(-1);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else key = CODE_KEYS[e.code] ?? e.key;
  // Ponctuation sans modificateur : le caractère tapé (« ; » sur un clavier AZERTY ou QWERTY).
  if (!mods.length && e.key.length === 1 && !/[a-z0-9]/i.test(e.key)) key = e.key;
  return [...mods, key].join("+");
}

const SYMBOLS: Record<string, string> = { CmdOrCtrl: "⌘", Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Up: "↑", Down: "↓", Left: "←", Right: "→", Backspace: "⌫", Delete: "⌦", Enter: "↩", Space: "␣", Tab: "⇥" };

/** Affichage à la manière de macOS : « ⌥⇧O ». */
export function symbols(accel: string): string {
  if (!accel) return "";
  const parts = accel.split("+").filter((p, i, a) => p || i === a.length - 1);
  const key = parts.pop() || "+";
  const order = ["Ctrl", "Alt", "Shift", "CmdOrCtrl", "Cmd"];
  const mods = parts.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => SYMBOLS[m] ?? m).join("");
  return mods + (SYMBOLS[key] ?? key.toUpperCase());
}

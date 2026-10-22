// Fichier → Préférences → Modifier les raccourcis clavier.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { notify } from "../actions";
import { isTauri } from "../backend";
import { eventAccel, INTERFACE_DEFAULTS, overrides, setOverrides, symbols } from "../hotkeys";
import { t } from "../i18n";
import { Modal } from "./Menu";

interface Command {
  section: string;
  id: string;
  label: string;
  accel: string;
}

/** Suspend les raccourcis du menu natif pendant l'enregistrement (sinon ⌘S enregistrerait le projet). */
async function suspend(on: boolean) {
  if (!isTauri()) return;
  await invoke("suspend_shortcuts", { on }).catch(() => {});
  window.dispatchEvent(new Event("lumiere:menu-refresh"));
}

export function HotkeysDialog({ onClose }: { onClose: () => void }) {
  const [commands, setCommands] = useState<Command[] | null>(null);
  const [custom, setCustom] = useState(overrides);
  const [recording, setRecording] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!isTauri()) {
      setCommands(Object.keys(INTERFACE_DEFAULTS).map((id) => ({ section: "", id, label: id, accel: "" })));
      return;
    }
    invoke<Command[]>("menu_catalog").then((list) => {
      // Une même commande peut apparaître dans deux menus : une seule ligne.
      const seen = new Set<string>();
      setCommands(list.filter((c) => !seen.has(c.id) && seen.add(c.id)));
    });
  }, []);

  const current = (c: Command) => (c.id in custom ? custom[c.id] : c.accel || INTERFACE_DEFAULTS[c.id] || "");

  const save = (next: Record<string, string>) => {
    setCustom(next);
    setOverrides(next);
  };

  useEffect(() => {
    if (!recording || !commands) return;
    suspend(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") return setRecording(null);
      const accel = e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey ? "" : eventAccel(e);
      if (accel === null) return; // modificateur seul : on attend la touche
      const next = { ...custom, [recording]: accel };
      // Un raccourci ne sert qu'à une commande : il est retiré de l'ancienne.
      const other = accel && commands.find((c) => c.id !== recording && current(c) === accel);
      if (other) {
        next[other.id] = "";
        notify(t("{shortcut} retiré de « {command} »", { shortcut: symbols(accel), command: other.label }));
      }
      save(next);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      suspend(false);
    };
  }, [recording]);

  const sections = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const map = new Map<string, Command[]>();
    for (const c of commands ?? []) {
      if (f && !c.label.toLowerCase().includes(f) && !symbols(current(c)).toLowerCase().includes(f)) continue;
      map.set(c.section, [...(map.get(c.section) ?? []), c]);
    }
    return [...map];
  }, [commands, filter, custom]);

  return (
    <Modal title={t("Modifier les raccourcis clavier")} onClose={onClose} width={620}>
      <input type="search" className="grow" placeholder={t("Rechercher une commande ou un raccourci")} value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      <div className="hotkeys">
        {sections.map(([section, list]) => (
          <section key={section}>
            {section && <h3 className="settings-title">{section}</h3>}
            {list.map((c) => {
              const accel = current(c);
              const changed = c.id in custom && custom[c.id] !== (c.accel || INTERFACE_DEFAULTS[c.id] || "");
              return (
                <div key={c.id} className="hotkey-row">
                  <span className="grow">{c.label}</span>
                  <button className={`hotkey ${recording === c.id ? "recording" : ""} ${changed ? "changed" : ""}`} onClick={() => setRecording(recording === c.id ? null : c.id)}>
                    {recording === c.id ? t("Tapez le raccourci…") : symbols(accel) || "—"}
                  </button>
                  <button className="small" disabled={!(c.id in custom)} title={t("Raccourci par défaut")}
                    onClick={() => {
                      const { [c.id]: _gone, ...rest } = custom;
                      save(rest);
                    }}>↺</button>
                </div>
              );
            })}
          </section>
        ))}
        {!commands && <p className="hint">{t("Chargement…")}</p>}
      </div>
      <p className="hint">{t("Cliquez un raccourci puis tapez la nouvelle combinaison ; ⌫ l'efface, Échap annule. Les raccourcis sans ⌘ ne s'appliquent pas pendant la saisie de texte.")}</p>
      <div className="row end">
        <button onClick={() => save({})}>{t("Tout rétablir")}</button>
        <span className="grow" />
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}

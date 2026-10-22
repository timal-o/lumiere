import { Fragment, useEffect, useState } from "react";
import {
  copySelection, cutSelection, deleteSelection, duplicateSelection, group, importFiles, nudge, openProject, paste, saveProject,
  selectAll, ungroup, autosave, offerRecovery, startFromPreview,
} from "./actions";
import { isTauri } from "./backend";
import { handleMenu, installMenu, syncMenuCheck } from "./menu";
import { eventAccel, interfaceMap } from "./hotkeys";
import type { Pt } from "./model";
import { getState, redo, setState, subscribe, undo, useBar, useStore, type Tool } from "./store";
import { formatDuration } from "./toolpath";
import {
  ArrayDialog, LibraryDialog, MaterialTestDialog, OffsetDialog, openDialog, QrDialog, takePendingDialog, ToolDialog, TraceDialog, type DialogName,
} from "./ui/Dialogs";
import { CameraDialog } from "./ui/CameraDialog";
import { GuideDialog } from "./ui/GuideDialog";
import { SettingsDialog } from "./ui/SettingsDialog";
import { PagesBar } from "./ui/PagesBar";
import { HotkeysDialog } from "./ui/HotkeysDialog";
import { OptimizationDialog } from "./ui/OptimizationDialog";
import { CenterFinderDialog } from "./ui/CenterFinderDialog";
import { DepthMapDialog } from "./ui/DepthMapDialog";
import { PcbImportDialog } from "./ui/PcbImportDialog";
import { NewDeviceWizard } from "./ui/NewDeviceWizard";
import { ConsoleDialog } from "./ui/ConsoleDialog";
import { MM_PER_INCH, useInches } from "./units";
import { LicenseDialog, UsageDataDialog } from "./ui/HelpDialogs";
import { AdjustImageDialog, BooleanAssistantDialog, CloseToleranceDialog, HistoryDialog, ChecklistDialog, CircleSelectDialog, MultiTraceDialog, PrefsBackupsDialog, ProfilesDialog, SlotResizerDialog, TaperWarpDialog } from "./ui/EditDialogs";
import { LaserPanel } from "./ui/LaserPanel";
import { LayersPanel } from "./ui/LayersPanel";
import { MachineDialog } from "./ui/MachineDialog";
import { Modal } from "./ui/Menu";
import { ArtLibraryDialog, BarcodeDialog, GrblSettingsDialog, MacrosDialog, NotesDialog, PrintCutDialog } from "./ui/ProductionDialogs";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { ArrangeBar, ToolPalette, Toolbar } from "./ui/Toolbar";
import { Workspace } from "./ui/Workspace";
import { renderToolpathPng } from "./ui/previewDraw";
import { layerColor } from "./model";
import { version } from "../package.json";
import appIcon from "../app-icon.svg";
import { t, tk, translateMessage } from "./i18n";

function PreviewBar() {
  const preview = useStore((s) => s.preview);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  // Lecture : avance proportionnelle à la durée estimée (× vitesse choisie).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const p = getState().preview;
      if (!p) return setPlaying(false);
      const perSecond = (p.toolpath.count / Math.max(1, p.result.stats.estimatedSeconds)) * speed;
      const shown = Math.min(p.toolpath.count, p.shown + Math.max(1, Math.round((perSecond * (now - last)) / 1000)));
      last = now;
      setState({ preview: { ...p, shown } });
      if (shown >= p.toolpath.count) return setPlaying(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);
  if (!preview) return null;
  const { stats } = preview.result;
  return (
    <div className="preview-bar">
      <strong>{t("Aperçu")}</strong>
      <span>{t("Durée estimée : {duration}", { duration: formatDuration(stats.estimatedSeconds) })}</span>
      <span>{t("Découpe : {m} m", { m: (stats.cutLength / 1000).toFixed(2) })}</span>
      <span>{t("Déplacements : {m} m", { m: (stats.travelLength / 1000).toFixed(2) })}</span>
      <span>{t("{n} lignes", { n: stats.lines })}</span>
      {stats.layers.length > 1 && (
        <details className="layer-times">
          <summary>{t("Par calque")}</summary>
          {stats.layers.map((l, i) => <div key={i}>{l.name} : {formatDuration(l.seconds)}</div>)}
        </details>
      )}
      <button
        onClick={() => {
          if (!playing && preview.shown >= preview.toolpath.count) setState({ preview: { ...preview, shown: 0 } });
          setPlaying(!playing);
        }}
        aria-label={playing ? t("Pause") : t("Lecture")}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title={t("Vitesse de lecture")}>
        {[1, 5, 20, 100, 500].map((v) => <option key={v} value={v}>×{v}</option>)}
      </select>
      <input
        type="range"
        min={0}
        max={preview.toolpath.count}
        value={preview.shown}
        onChange={(e) => setState({ preview: { ...preview, shown: Number(e.target.value) } })}
        title={t("Simulation")}
      />
      <button disabled={preview.shown >= preview.toolpath.count} onClick={() => startFromPreview(false)}
        title={t("Lance le travail sur le laser à partir du point affiché")}>{t("Démarrer ici")}</button>
      <button disabled={preview.shown >= preview.toolpath.count} onClick={() => startFromPreview(true)}
        title={t("Enregistre le G-code à partir du point affiché, pour plus tard")}>{t("Enregistrer à partir d'ici…")}</button>
      <PreviewOptions />
      <button onClick={(e) => void savePreviewImage(e.shiftKey)} title={t("Enregistre l'aperçu en image (Maj : fond transparent)")}>{t("Enregistrer l'image…")}</button>
      <button onClick={() => setState({ preview: null })}>{t("Fermer")}</button>
      {preview.warnings.length > 0 && <div className="warnings">{preview.warnings.map((w) => <div key={w}>⚠ {translateMessage(w)}</div>)}</div>}
    </div>
  );
}

/** Options d'affichage de l'aperçu (préférences). */
function PreviewOptions() {
  const o = useStore((s) => s.toolOptions);
  const toggle = (key: "previewShade" | "previewInvert" | "previewTravel", label: string, title: string) => (
    <label className="check" title={title}>
      <input type="checkbox" checked={o[key]} onChange={(e) => setState({ toolOptions: { ...getState().toolOptions, [key]: e.target.checked } })} />
      {label}
    </label>
  );
  return (
    <>
      {toggle("previewShade", t("Teinte selon la puissance"), t("Les traits sont plus ou moins foncés selon la puissance appliquée"))}
      {toggle("previewInvert", t("Inverser"), t("Gravure en blanc sur noir, utile pour juger une gravure d'image"))}
      {toggle("previewTravel", t("Déplacements"), t("Affiche les déplacements à vide"))}
    </>
  );
}

async function savePreviewImage(transparent: boolean) {
  const st = getState();
  const p = st.preview;
  if (!p) return;
  const css = getComputedStyle(document.documentElement);
  const byName = new Map(st.project.layers.map((l) => [l.name, l.id]));
  const layerColors = p.toolpath.layers.map((n) => {
    const id = byName.get(n) ?? byName.get(n.split(" · ")[0]);
    return id == null ? "#000000" : layerColor(id);
  });
  const o = st.toolOptions;
  const blob = await renderToolpathPng(p.toolpath, st.machine.bedWidth, st.machine.bedHeight, {
    layerColors, burn: "#000000", travel: css.getPropertyValue("--travel").trim() || "#bbbbbb",
    shade: o.previewShade, invert: o.previewInvert, showTravel: o.previewTravel, lineWidth: 1,
  }, transparent);
  if (!blob) return;
  if (!isTauri()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "apercu.png";
    a.click();
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: t("apercu.png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_binary_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-path": encodeURIComponent(path) } });
}

function Toasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = Math.random();
      setItems((it) => [...it, { id, msg: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((it) => it.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("lumiere:toast", on);
    return () => window.removeEventListener("lumiere:toast", on);
  }, []);
  return (
    <div className="toasts" role="status">
      {items.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["V / N / M", tk("Sélection / Nœuds / Mesurer")],
  ["L / R / E / P / S / T", tk("Ligne / Rectangle / Ellipse / Polygone / Étoile / Texte")],
  ["⌘L / ⌘R / ⌘E / ⌘T / ⌘K", tk("Dessiner des lignes / Rectangle / Ellipse / Texte / Rogner les formes")],
  ["⌘N / ⌘O / ⌘S / ⇧⌘S", tk("Nouveau / Ouvrir / Enregistrer / Enregistrer sous")],
  ["⌘I / ⌥X / ⇧⌘E", tk("Importer / Exporter / Enregistrer le G-code")],
  ["⌥⌘N", tk("Afficher les notes")],
  ["⌘Z / ⇧⌘Z", tk("Annuler / Rétablir")],
  ["⌘X / ⌘C / ⌘V / ⌥V", tk("Couper / Copier / Coller / Coller sur place")],
  ["⌘D / ⌫", tk("Dupliquer / Supprimer")],
  ["⌘A / ⇧⌘I", tk("Tout sélectionner / Inverser la sélection")],
  ["⌘G / ⌘U", tk("Grouper / Dissocier")],
  ["⇧⌘H / ⇧⌘V", tk("Retourner horizontalement / verticalement")],
  ["; / ,", tk("Rotation de 90° horaire / antihoraire")],
  ["⌘W / ⌥+ / ⌥- / ⌥*", tk("Souder / Union / Soustraction / Intersection")],
  ["⌥O / ⌥A / ⇧⌘N", tk("Décaler / Tableau / Imbrication")],
  ["⌥B / ⌥C / ⌥J / ⌥D", tk("Rompre / Combiner / Joindre automatiquement / Supprimer les doublons")],
  ["⌥⇧O / ⌥T", tk("Optimiser les formes / Tracer l'image")],
  ["⇧⌘C / ⇧⌘B", tk("Convertir en chemin / en bitmap")],
  ["⇧⌘↑ / ⇧⌘↓", tk("Pousser vers l'avant / vers l'arrière")],
  ["⌥P", tk("Aperçu")],
  ["⌘= / ⌘- / ⌘0 / ⇧⌘A / F", tk("Zoom avant / arrière / sur la page / sur la sélection")],
  [tk("Flèches (+Maj)"), tk("Déplacer de 1 mm (10 mm) ; en mode Nœuds : 0,1 mm (1 mm)")],
  [tk("Maj (glisser)"), tk("Contraindre / libérer les proportions")],
  [tk("⌥ (glisser)"), tk("Ignorer le magnétisme ; casser la symétrie d'une poignée")],
  [tk("Nœuds : D I B L C S J P"), tk("Supprimer, insérer, couper, droite, courbe, lisse, joindre, point de départ")],
  ["⇧⌘R / ⇧⌘K", tk("Unité rotative / Caméras")],
  ["⌘B / ⌥⇧C / ⌥I", tk("Assistant booléen / Découper les formes / Ajuster l'image")],
  ["⌘2", tk("Rotation/échelle à deux points")],
  ["⇧⌘M / ⌥⇧H / ⌥⇧V", tk("Miroir selon une ligne / Déplacer H, V ensemble")],
  ["⌘↑ / ⌘↓", tk("Avancer / reculer d'un niveau")],
  ["⌥⌘ ← ↑ → ↓", tk("Déplacer le laser d'un pas")],
  ["⌥0 … ⌥4", tk("Imprimer et couper : assistant, repères, alignement")],
  ["⌘P / ⇧⌘P", tk("Imprimer en noir / en couleurs")],
  ["⌥⇧W / F12", tk("Filaire ou rempli / panneaux latéraux")],
  ["⌘,", tk("Paramètres")],
  ["⌘. ", tk("Arrêter le laser")],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("Raccourcis clavier")} onClose={onClose} width={620}>
      <p className="hint">{t("Raccourcis par défaut. Pour les changer : Fichier → Préférences → Modifier les raccourcis clavier.")}</p>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}><td><kbd>{t(k)}</kbd></td><td>{t(v)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="row end">
        <button onClick={() => (onClose(), openDialog("hotkeys"))}>{t("Modifier les raccourcis clavier…")}</button>
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("À propos de Lumière")} onClose={onClose} width={460}>
      <div className="about">
        <img src={appIcon} width={72} height={72} alt="" />
        <h2>Lumière</h2>
        <p className="about-version">{t("Version {version}", { version })}</p>
        <p>{t("Logiciel libre pour préparer et piloter la gravure et la découpe laser.")}</p>
        <p className="hint">
          {t("Distribué sous licence GNU GPL v3.0. Projet indépendant, sans lien avec un éditeur de logiciel laser commercial.")}
        </p>
        <p className="hint about-url">github.com/timal-o/lumiere</p>
      </div>
      <div className="row end">
        <button onClick={() => { onClose(); window.dispatchEvent(new Event("lumiere:shortcuts")); }}>{t("Raccourcis clavier")}</button>
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}

export type Panel = "properties" | "layers" | "laser";
/** Ordre par défaut des panneaux (constante : un sélecteur doit renvoyer une valeur stable). */
const DEFAULT_PANEL_ORDER: Panel[] = ["properties", "layers", "laser"];

const TOOL_KEYS: Record<string, Tool> = { v: "select", n: "node", m: "measure", l: "line", r: "rect", e: "ellipse", p: "polygon", s: "star", t: "text" };

export function App() {
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [dialog, setDialog] = useState<DialogName | null>(takePendingDialog);
  const [dropping, setDropping] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [panels, setPanels] = useState<Record<Panel, boolean>>({ properties: true, layers: true, laser: true });
  const showMain = useBar("main"), showNumeric = useBar("numeric"), showArrange = useBar("arrange"), showCreation = useBar("creation");
  // Panneaux latéraux : côté et ordre choisis dans les Paramètres.
  const panelSide = useStore((s) => s.toolOptions.panelSide ?? "right");
  const panelOrder = useStore((s) => s.toolOptions.panelOrder) ?? DEFAULT_PANEL_ORDER;
  // Apparence choisie dans les Paramètres.
  const theme = useStore((s) => s.toolOptions.theme), iconSize = useStore((s) => s.toolOptions.iconSize);
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    root.setAttribute("data-icons", iconSize ?? "normal");
  }, [theme, iconSize]);
  const showPages = useBar("pages");
  const inches = useInches();

  useEffect(installMenu, []);
  // Sauvegarde automatique : quelques secondes après chaque modification.
  useEffect(() => {
    offerRecovery();
    let timer = 0;
    let last = getState().project;
    const off = subscribe(() => {
      const st = getState();
      if (st.project === last && st.dirty) return;
      last = st.project;
      clearTimeout(timer);
      const delay = getState().toolOptions.autosaveDelay;
      if (delay > 0) timer = window.setTimeout(autosave, delay * 1000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const onPanel = (e: Event) => {
      const p = (e as CustomEvent<Panel>).detail;
      setPanels((cur) => {
        const next = { ...cur, [p]: !cur[p] };
        syncMenuCheck(`panel:${p}`, next[p]);
        return next;
      });
    };
    // Fenêtre → Afficher/masquer les panneaux latéraux, Rétablir la mise en page par défaut.
    const onPanels = (e: Event) => {
      const kind = (e as CustomEvent<"toggle" | "reset">).detail;
      setPanels((cur) => {
        const show = kind === "reset" || !Object.values(cur).some(Boolean);
        const next = { properties: show, layers: show, laser: show };
        for (const [k, v] of Object.entries(next)) syncMenuCheck(`panel:${k}`, v);
        return next;
      });
    };
    const onShortcuts = () => setShortcuts(true);
    // Le menu natif reconstruit (changement de langue) repart des coches par défaut.
    const onRebuilt = () => setPanels((cur) => {
      for (const [k, v] of Object.entries(cur)) syncMenuCheck(`panel:${k}`, v);
      return cur;
    });
    window.addEventListener("lumiere:menu-rebuilt", onRebuilt);
    window.addEventListener("lumiere:panel", onPanel);
    window.addEventListener("lumiere:panels", onPanels);
    window.addEventListener("lumiere:shortcuts", onShortcuts);
    return () => {
      window.removeEventListener("lumiere:panel", onPanel);
      window.removeEventListener("lumiere:panels", onPanels);
      window.removeEventListener("lumiere:shortcuts", onShortcuts);
      window.removeEventListener("lumiere:menu-rebuilt", onRebuilt);
    };
  }, []);
  const filePath = useStore((s) => s.filePath);
  const dirty = useStore((s) => s.dirty);

  useEffect(() => {
    document.title = `${filePath?.split("/").pop() ?? "Sans titre"}${dirty ? " •" : ""} — Lumière`;
  }, [filePath, dirty]);

  useEffect(() => {
    const on = (e: Event) => setDialog((e as CustomEvent<DialogName>).detail);
    window.addEventListener("lumiere:dialog", on);
    return () => window.removeEventListener("lumiere:dialog", on);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || document.querySelector(".modal")) return;
      const mod = e.metaKey || e.ctrlKey;
      // L'outil Nœuds a ses propres raccourcis (gérés par le plan de travail).
      if (!mod && getState().tool === "node" && e.key !== "v" && e.key !== "n") return;
      const k = e.key.toLowerCase();
      const o = getState().toolOptions;
      const step = e.shiftKey ? o.arrowStepLarge : e.altKey ? o.arrowStepSmall : o.arrowStep;
      const run = (f: () => unknown) => (f(), true);
      const handled = (() => {
        // Dans l'application, ces raccourcis sont portés par la barre de menus native.
        // Couper/copier/coller y sont natifs : la touche n'arrive ici que hors champ texte.
        if (mod && isTauri()) {
          switch (k) {
            case "c": return run(copySelection);
            case "x": return run(cutSelection);
            case "v": return e.shiftKey ? false : run(paste);
          }
          return false;
        }
        if (mod) {
          switch (k) {
            case "z": return run(e.shiftKey ? redo : undo);
            case "y": return run(redo);
            case "s": return run(saveProject);
            case "o": return run(() => openProject());
            case "i": return run(() => importFiles());
            case "a": return run(selectAll);
            case "d": return run(duplicateSelection);
            case "c": return run(copySelection);
            case "x": return run(cutSelection);
            case "v": return run(paste);
            case "g": return run(e.shiftKey ? ungroup : group);
            case "u": return run(ungroup);
          }
          return false;
        }
        // Raccourcis gérés par l'interface (⌥ seul, touche seule), personnalisables :
        // le menu natif les intercepterait aussi pendant la saisie de texte.
        const accel = eventAccel(e);
        const command = accel ? interfaceMap().get(accel) : undefined;
        if (command) return run(() => handleMenu(command));
        if (e.altKey) return false;
        if (k === "delete" || k === "backspace") return run(deleteSelection);
        if (k === "escape") return run(() => setState({ selection: [], tool: "select" }));
        if (k === "f") return run(() => window.dispatchEvent(new Event("lumiere:fit")));
        if (TOOL_KEYS[k]) return run(() => setState({ tool: TOOL_KEYS[k] }));
        if (k === "arrowleft") return run(() => nudge(-step, 0));
        if (k === "arrowright") return run(() => nudge(step, 0));
        if (k === "arrowup") return run(() => nudge(0, -step));
        if (k === "arrowdown") return run(() => nudge(0, step));
        return false;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setDialog(null);

  return (
    <div
      className={`app ${dropping ? "dropping" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {(showMain || showNumeric) && <Toolbar />}
      {showArrange && <ArrangeBar />}
      <main>
        {showCreation && <ToolPalette />}
        <div className="center">
          {showPages && <PagesBar />}
          <Workspace onCursor={setCursor} />
          <PreviewBar />
          <footer className="statusbar">
            <span className="mono">{cursor ? (inches
              ? `x ${(cursor[0] / MM_PER_INCH).toFixed(3)}  y ${(cursor[1] / MM_PER_INCH).toFixed(3)} in`
              : `x ${cursor[0].toFixed(1)}  y ${cursor[1].toFixed(1)} mm`) : ""}</span>
            <span>{t("Molette : zoom · Espace ou clic droit : déplacer · F : ajuster · Maj : sélection multiple / contrainte")}</span>
            {!isTauri() && <span className="warn">{t("Mode navigateur : connexion laser, polices et génération indisponibles")}</span>}
          </footer>
        </div>
        {(panels.properties || panels.layers || panels.laser) && (
          <aside style={panelSide === "left" ? { order: -1 } : undefined} className={panelSide === "left" ? "left" : ""}>
            {panelOrder.map((p) => panels[p] && <Fragment key={p}>{p === "properties" ? <PropertiesPanel /> : p === "layers" ? <LayersPanel /> : <LaserPanel />}</Fragment>)}
          </aside>
        )}
      </main>
      {dialog === "machine" && <MachineDialog onClose={close} />}
      {dialog === "offset" && <OffsetDialog onClose={close} />}
      {dialog === "array" && <ArrayDialog onClose={close} />}
      {dialog === "qr" && <QrDialog onClose={close} />}
      {dialog === "trace" && <TraceDialog onClose={close} />}
      {dialog === "materialTest" && <MaterialTestDialog onClose={close} />}
      {dialog === "library" && <LibraryDialog onClose={close} />}
      {dialog && ["fillet", "join", "simplify", "nest", "alongPath", "bitmap", "outline"].includes(dialog) && <ToolDialog name={dialog} onClose={close} />}
      {dialog === "barcode" && <BarcodeDialog onClose={close} />}
      {dialog === "notes" && <NotesDialog onClose={close} />}
      {dialog === "macros" && <MacrosDialog onClose={close} />}
      {dialog === "grbl" && <GrblSettingsDialog onClose={close} />}
      {dialog === "printCut" && <PrintCutDialog onClose={close} />}
      {dialog === "art" && <ArtLibraryDialog onClose={close} />}
      {dialog === "camera" && <CameraDialog onClose={close} />}
      {dialog === "guide" && <GuideDialog onClose={close} />}
      {dialog === "about" && <AboutDialog onClose={close} />}
      {dialog === "settings" && <SettingsDialog onClose={close} />}
      {dialog === "closeTol" && <CloseToleranceDialog onClose={close} />}
      {dialog === "boolean" && <BooleanAssistantDialog onClose={close} />}
      {dialog === "adjustImage" && <AdjustImageDialog onClose={close} />}
      {dialog === "history" && <HistoryDialog onClose={close} />}
      {dialog === "prefsBackups" && <PrefsBackupsDialog onClose={close} />}
      {dialog === "taper" && <TaperWarpDialog onClose={close} />}
      {dialog === "slots" && <SlotResizerDialog onClose={close} />}
      {dialog === "multiTrace" && <MultiTraceDialog onClose={close} />}
      {dialog === "hotkeys" && <HotkeysDialog onClose={close} />}
      {dialog === "optimization" && <OptimizationDialog onClose={close} />}
      {dialog === "centerFinder" && <CenterFinderDialog onClose={close} />}
      {dialog === "depthMap" && <DepthMapDialog onClose={close} />}
      {dialog === "checklist" && <ChecklistDialog onClose={close} />}
      {dialog === "circleSelect" && <CircleSelectDialog onClose={close} />}
      {dialog === "pcb" && <PcbImportDialog onClose={close} />}
      {dialog === "newDevice" && <NewDeviceWizard onClose={close} />}
      {dialog === "console" && <ConsoleDialog onClose={close} />}
      {dialog === "profiles" && <ProfilesDialog onClose={close} />}
      {dialog === "license" && <LicenseDialog onClose={close} />}
      {dialog === "usageData" && <UsageDataDialog onClose={close} />}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      <Toasts />
    </div>
  );
}

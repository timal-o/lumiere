import { useEffect, useMemo, useRef, useState } from "react";
import {
  bakeVariableTexts, clearTabs, convertToPath, detachTextFromPath, refreshVariableTexts, removeMask, saveProcessedBitmap, setPrimitive, updateImage,
  updateText,
} from "../actions";
import { DEFAULT_ADJUST, type FontRef, type ImageShape, type Primitive, type Shape, type TextAlignY, type TextShape, type VectorShape } from "../model";
import { getState, selectedShapes, setState, updateShapes, useStore } from "../store";
import { hasVariables, listFonts, parseCsv, stepVariables } from "../text";
import { openDialog } from "./Dialogs";
import { NumField } from "./NumField";
import { applyImagePreset, BUILT_IN, deleteImagePreset, saveImagePreset, useImagePresets } from "../imagePresets";
import { t, tk } from "../i18n";

function useFonts() {
  const [fonts, setFonts] = useState<FontRef[]>([]);
  useEffect(() => {
    listFonts().then(setFonts).catch(() => setFonts([]));
  }, []);
  return fonts;
}

function TextProps({ shape }: { shape: TextShape }) {
  const fonts = useFonts();
  const families = useMemo(() => [...new Set(fonts.map((f) => f.family))], [fonts]);
  const styles = fonts.filter((f) => f.family === shape.font.family);
  const [text, setText] = useState(shape.text);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(shape.text), [shape.id]);
  useEffect(() => {
    const focus = () => {
      area.current?.focus();
      area.current?.select();
    };
    window.addEventListener("lumiere:edit-text", focus);
    return () => window.removeEventListener("lumiere:edit-text", focus);
  }, []);
  const set = (patch: Partial<TextShape>) => updateText(shape.id, patch);

  return (
    <>
      <textarea
        ref={area}
        value={text}
        rows={Math.min(6, Math.max(2, text.split("\n").length))}
        onChange={(e) => {
          setText(e.target.value);
          set({ text: e.target.value });
        }}
        spellCheck={false}
      />
      <div className="row">
        <label className="field">
          <span>{t("Police")}</span>
          <select
            value={shape.font.family}
            onChange={(e) => {
              const same = fonts.filter((f) => f.family === e.target.value);
              const f = same.find((x) => x.style === shape.font.style) ?? same.find((x) => /regular|normal/i.test(x.style)) ?? same[0];
              if (f) set({ font: f });
            }}
          >
            {!families.includes(shape.font.family) && <option>{shape.font.family}</option>}
            {families.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("Style")}</span>
          <select value={shape.font.style} onChange={(e) => {
            const f = styles.find((x) => x.style === e.target.value);
            if (f) set({ font: f });
          }}>
            {styles.length === 0 && <option>{shape.font.style}</option>}
            {styles.map((f) => <option key={f.style}>{f.style}</option>)}
          </select>
        </label>
        <div className="row">
          {(["bold", "italic"] as const).map((k) => {
            const isBold = /bold|black|heavy|semibold|demi/i.test(shape.font.style), isItalic = /italic|oblique/i.test(shape.font.style);
            const on = k === "bold" ? isBold : isItalic;
            // Style voulu : gras et / ou italique selon les deux boutons.
            const want = { bold: k === "bold" ? !isBold : isBold, italic: k === "italic" ? !isItalic : isItalic };
            const pick = styles.find((f) => /bold/i.test(f.style) === want.bold && /italic|oblique/i.test(f.style) === want.italic && !/semi|demi|light|thin|black|heavy|medium|condensed|narrow/i.test(f.style))
              ?? styles.find((f) => /bold/i.test(f.style) === want.bold && /italic|oblique/i.test(f.style) === want.italic);
            return (
              <button key={k} className={`small ${on ? "active" : ""}`} disabled={!pick} aria-pressed={on} onClick={() => pick && set({ font: pick })}
                title={k === "bold" ? t("Gras") : t("Italique")} style={k === "bold" ? { fontWeight: 700 } : { fontStyle: "italic" }}>
                {k === "bold" ? t("G") : t("I")}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid2">
        <NumField label={t("Hauteur")} unit="mm" value={shape.height} min={0.5} max={1000} step={0.5} onChange={(height) => set({ height })} />
        <NumField label={t("Interlettre")} unit="mm" value={shape.letterSpacing} min={-50} max={100} step={0.1} onChange={(letterSpacing) => set({ letterSpacing })} />
        <NumField label={t("Interligne")} unit="×" value={shape.lineSpacing} min={0.5} max={5} step={0.1} onChange={(lineSpacing) => set({ lineSpacing })} />
        <label className="field">
          <span>{t("Alignement")}</span>
          <select value={shape.align} onChange={(e) => set({ align: e.target.value as TextShape["align"] })}>
            <option value="left">{t("Gauche")}</option>
            <option value="center">{t("Centré")}</option>
            <option value="right">{t("Droite")}</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>{t("Alignement vertical")}</span>
          <select value={shape.alignY ?? "baseline"} onChange={(e) => set({ alignY: e.target.value as TextAlignY })}>
            <option value="baseline">{t("Ligne de base")}</option>
            <option value="top">{t("Haut")}</option>
            <option value="middle">{t("Milieu")}</option>
            <option value="bottom">{t("Bas")}</option>
          </select>
        </label>
        <NumField label={t("Largeur max.")} unit="mm" value={shape.maxWidth ?? 0} min={0} max={10000} step={1} onChange={(maxWidth) => set({ maxWidth })} />
      </div>
      {!shape.onPath && (
        <label className="field" title={t("Courbe le texte en arc : vers le haut (positif) ou vers le bas (négatif)")}>
          <span>{t("Courber : {pct} %", { pct: shape.bend ?? 0 })}</span>
          <input type="range" min={-100} max={100} step={1} value={shape.bend ?? 0} onChange={(e) => set({ bend: Number(e.target.value) })} />
        </label>
      )}
      <div className="row">
        <label className="check" title={t("Force le texte en majuscules")}>
          <input type="checkbox" checked={!!shape.upperCase} onChange={(e) => set({ upperCase: e.target.checked })} />
          {t("Majuscules")}
        </label>
        <label className="check" title={t("Pour l'hébreu ou l'arabe")}>
          <input type="checkbox" checked={!!shape.rtl} onChange={(e) => set({ rtl: e.target.checked })} />
          {t("De droite à gauche")}
        </label>
        <label className="check" title={t("Au-delà de la largeur max., resserrer le texte (sinon le réduire en entier)")}>
          <input type="checkbox" checked={shape.squeeze !== false} disabled={!shape.maxWidth} onChange={(e) => set({ squeeze: e.target.checked })} />
          {t("Resserrer")}
        </label>
      </div>
      <VariableText text={text} />
      {hasVariables(text) && (
        <div className="row">
          <NumField label={t("Décalage")} value={shape.varOffset ?? 0} min={-100000} max={100000} digits={0} onChange={(varOffset) => set({ varOffset })} />
          <label className="check" title={t("Une ligne dont les variables sont vides est retirée")}>
            <input type="checkbox" checked={!!shape.ignoreEmptyVars} onChange={(e) => set({ ignoreEmptyVars: e.target.checked })} />
            {t("Ignorer les variables vides")}
          </label>
          <button onClick={bakeVariableTexts} title={t("Remplace les variables par leur valeur actuelle")}>{t("Figer")}</button>
        </div>
      )}
      {shape.onPath && (
        <div className="row">
          <NumField label={t("Départ sur le chemin")} unit="mm" value={shape.onPath.offset} min={-10000} max={10000} step={1}
            onChange={(offset) => set({ onPath: { ...shape.onPath!, offset } })} />
          <label className="check" title={t("Déforme légèrement les lettres pour qu'elles épousent la courbe")}>
            <input type="checkbox" checked={!!shape.onPath.distort} onChange={(e) => set({ onPath: { ...shape.onPath!, distort: e.target.checked } })} />
            {t("Déformer")}
          </label>
          <button onClick={() => detachTextFromPath(shape.id)}>{t("Détacher du chemin")}</button>
        </div>
      )}
      <div className="row">
        <label className="check" title={t("Fusionne les lettres qui se chevauchent (écritures cursives) pour éviter les trous aux jonctions")}>
          <input type="checkbox" checked={shape.weld} onChange={(e) => set({ weld: e.target.checked })} />
          {t("Souder les lettres")}
        </label>
        <span className="grow" />
        <button onClick={convertToPath}>{t("Convertir en tracés")}</button>
      </div>
    </>
  );
}

/** Réglages du numéro de série quand le texte contient des variables. */
function VariableText({ text }: { text: string }) {
  const v = useStore((s) => s.textVars);
  const set = (patch: Partial<typeof v>) => {
    setState({ textVars: { ...getState().textVars, ...patch } });
    refreshVariableTexts();
  };
  const importCsv = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) set({ csv: { ...parseCsv(await f.text()), row: 0 } });
    };
    input.click();
  };
  const csvHint = v.csv?.headers.length ? <> · CSV : {v.csv.headers.map((h) => <code key={h}>{`{${h}}`}</code>)}</> : null;
  return (
    <>
      <p className="hint">
        {t("Variables :")} <code>{"{n}"}</code> {t("numéro de série")} · <code>{"{date}"}</code> · <code>{"{time}"}</code>{csvHint}
      </p>
      {hasVariables(text) && (
        <div className="grid2">
          <NumField label={t("N° actuel")} value={v.serial} min={-1e9} max={1e9} digits={0} onChange={(serial) => set({ serial })} />
          <NumField label={t("Avance / travail")} value={v.step} min={-1000} max={1000} digits={0} onChange={(step) => set({ step })} />
          <NumField label={t("Chiffres")} value={v.digits} min={1} max={12} digits={0} onChange={(digits) => set({ digits })} />
          {v.csv && (
            <NumField label={t("Ligne CSV (sur {n})", { n: v.csv.rows.length })} value={v.csv.row + 1} min={1} max={Math.max(1, v.csv.rows.length)} digits={0}
              onChange={(r) => set({ csv: { ...v.csv!, row: r - 1 } })} />
          )}
          <NumField label={t("Début")} value={v.start ?? 0} min={-1e9} max={1e9} digits={0} onChange={(start) => set({ start })} />
          <NumField label={t("Fin (0 = aucune)")} value={v.end ?? 0} min={-1e9} max={1e9} digits={0} onChange={(end) => set({ end })} />
        </div>
      )}
      {hasVariables(text) && (
        <div className="row">
          <label className="check" title={t("Avance automatiquement le numéro après chaque travail envoyé")}>
            <input type="checkbox" checked={v.autoAdvance !== false} onChange={(e) => set({ autoAdvance: e.target.checked })} />
            {t("Avance automatique")}
          </label>
          <button onClick={() => set(stepVariables(getState().textVars, -1))} title={t("Précédent")}>◀</button>
          <button onClick={() => set(stepVariables(getState().textVars, 1))} title={t("Suivant")}>▶</button>
          <button onClick={() => set({ serial: v.start ?? 0, csv: v.csv && { ...v.csv, row: 0 } })} title={t("Revenir au début de la séquence")}>{t("Réinitialiser")}</button>
        </div>
      )}
      <div className="row">
        <button onClick={importCsv}>{v.csv ? t("Changer de fichier CSV…") : t("Fusion CSV…")}</button>
        {v.csv && <button onClick={() => set({ csv: undefined })}>{t("Retirer le CSV")}</button>}
      </div>
    </>
  );
}

/** Préréglages d'image : choix, enregistrement et suppression. */
function ImagePresets({ shape }: { shape: ImageShape }) {
  const user = useImagePresets();
  const [name, setName] = useState("");
  const all = [...BUILT_IN, ...user];
  return (
    <div className="row">
      <select value="" onChange={(e) => {
        const p = all.find((x) => x.name === e.target.value);
        if (p) applyImagePreset(p, shape);
      }} aria-label={t("Préréglages d'image")}>
        <option value="">{t("Préréglages d'image…")}</option>
        <optgroup label={t("Fournis")}>{BUILT_IN.map((p) => <option key={p.name} value={p.name}>{t(p.name)}</option>)}</optgroup>
        {user.length > 0 && <optgroup label={t("Mes préréglages")}>{user.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</optgroup>}
      </select>
      <input type="text" className="grow" placeholder={t("Nom du préréglage")} value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={!name.trim()} onClick={() => (saveImagePreset(name.trim(), shape), setName(""))} title={t("Enregistrer les réglages de l'image et de son calque")}>{t("Enregistrer")}</button>
      {user.some((p) => p.name === name.trim()) && <button onClick={() => deleteImagePreset(name.trim())} title={t("Supprimer")}>−</button>}
    </div>
  );
}

export function ImageProps({ shape }: { shape: ImageShape }) {
  const a = shape.adjust;
  const slider = (label: string, key: "brightness" | "contrast" | "gamma" | "enhanceAmount" | "enhanceRadius" | "denoise", min: number, max: number, step: number) => (
    <label className="field">
      <span>{label} : {a[key] ?? DEFAULT_ADJUST[key]}</span>
      <input type="range" min={min} max={max} step={step} value={a[key] ?? DEFAULT_ADJUST[key]} onChange={(e) => updateImage(shape.id, { adjust: { ...a, [key]: Number(e.target.value) } })} />
    </label>
  );
  return (
    <>
      <ImagePresets shape={shape} />
      {slider(t("Luminosité"), "brightness", -100, 100, 1)}
      {slider(t("Contraste"), "contrast", -100, 100, 1)}
      {slider(t("Gamma"), "gamma", 0.2, 5, 0.05)}
      {slider(t("Accentuation"), "enhanceAmount", 0, 300, 5)}
      {slider(t("Rayon d'accentuation (mm)"), "enhanceRadius", 0.1, 5, 0.1)}
      {slider(t("Réduction du bruit"), "denoise", 0, 100, 5)}
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={a.invert} onChange={(e) => updateImage(shape.id, { adjust: { ...a, invert: e.target.checked } })} />
          {t("Inverser")}
        </label>
        <span className="grow" />
        <button onClick={() => updateImage(shape.id, { adjust: { ...DEFAULT_ADJUST } })}>{t("Réinitialiser")}</button>
        <button onClick={() => openDialog("trace")}>{t("Vectoriser…")}</button>
      </div>
      <div className="row">
        {shape.mask && <button onClick={() => removeMask(shape.id)}>{t("Retirer le masque")}</button>}
        <button onClick={saveProcessedBitmap}>{t("Enregistrer l'image traitée…")}</button>
      </div>
      <p className="hint">{t("L'aperçu tramé suit le mode de tramage et le pas du calque.")}</p>
    </>
  );
}

const PRIMITIVE_NAME: Record<Primitive["type"], string> = {
  rect: tk("Rectangle"), ellipse: tk("Ellipse"), polygon: tk("Polygone"), star: tk("Étoile"), dualStar: tk("Double étoile"),
};

/** Paramètres d'une forme de base restée paramétrique. */
function PrimitiveProps({ shape }: { shape: VectorShape & { primitive: Primitive } }) {
  const p = shape.primitive;
  const set = (patch: Partial<Primitive>) => setPrimitive(shape.id, patch);
  return (
    <div className="grid2">
      {p.type === "rect" && <NumField label={t("Rayon des angles")} unit="mm" value={p.radius} min={0} max={Math.min(p.w, p.h) / 2} step={0.5} onChange={(radius) => set({ radius })} />}
      {p.type === "polygon" && <NumField label={t("Côtés")} value={p.sides} min={3} max={64} digits={0} onChange={(sides) => set({ sides })} />}
      {(p.type === "star" || p.type === "dualStar") && (
        <>
          <NumField label={t("Branches")} value={p.points} min={3} max={64} digits={0} onChange={(points) => set({ points })} />
          <NumField label={t("Rayon intérieur")} unit="%" value={Math.round(p.ratio * 100)} min={5} max={95} digits={0} onChange={(v) => set({ ratio: v / 100 })} />
          {p.type === "dualStar" && (
            <NumField label={t("Pointes courtes")} unit="%" value={Math.round(p.ratio2 * 100)} min={5} max={100} digits={0} onChange={(v) => set({ ratio2: v / 100 })} />
          )}
          <NumField label={t("Bombé")} unit="%" value={Math.round((p.bulge ?? 0) * 100)} min={-100} max={100} digits={0} onChange={(v) => set({ bulge: v / 100 })} />
        </>
      )}
      {p.type === "ellipse" && <p className="hint">{t("Ellipse paramétrique : dimensions dans la barre d'outils.")}</p>}
    </div>
  );
}

/** Priorité de découpe (Paramètres d'optimisation → Trier par priorité), pour toute la sélection. */
function PriorityField({ shapes }: { shapes: Shape[] }) {
  const values = new Set(shapes.map((s) => s.priority ?? 0));
  return (
    <NumField label={t("Priorité")} value={values.size === 1 ? [...values][0] : null} min={-999} max={999} digits={0}
      onChange={(priority) => updateShapes(shapes.map((s) => s.id), (s) => ({ ...s, priority }))} />
  );
}

export function PropertiesPanel() {
  useStore((s) => s.project);
  useStore((s) => s.selection);
  const byPriority = useStore((s) => s.project.optimization?.order === "priority");
  const sel = selectedShapes();
  const priority = byPriority && sel.length > 0 ? <PriorityField shapes={sel} /> : null;
  const priorityOnly = priority && <section className="panel"><h2>{t("Priorité")}</h2>{priority}</section>;
  if (sel.length !== 1) return priorityOnly;
  const s = sel[0];
  if (s.kind === "vector") {
    if (!s.primitive && !s.tabs?.length) return priorityOnly;
    return (
      <section className="panel">
        <h2>{s.primitive ? t(PRIMITIVE_NAME[s.primitive.type]) : t("Forme")}</h2>
        {s.primitive && <PrimitiveProps shape={s as VectorShape & { primitive: Primitive }} />}
        {!!s.tabs?.length && (
          <div className="row">
            <span className="hint grow">{t("{n} attache(s) manuelle(s)", { n: s.tabs.length })}</span>
            <button onClick={clearTabs}>{t("Retirer les attaches")}</button>
          </div>
        )}
        {priority}
      </section>
    );
  }
  return (
    <section className="panel">
      <h2>{s.kind === "text" ? t("Texte") : t("Image")}</h2>
      {s.kind === "text" ? <TextProps key={s.id} shape={s} /> : <ImageProps shape={s} />}
      {priority}
    </section>
  );
}

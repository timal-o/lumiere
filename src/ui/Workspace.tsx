import { useEffect, useRef, useState } from "react";
import { t, tk } from "../i18n";
import { addText, curvesOf, editCurves, moveLaserTo, nodeTarget, notify, primitiveCurve, toggleTab, trimShapeAt } from "../actions";
import { flattenBez, fromPolylines, type BezPath } from "../bezier";
import {
  apply, bedToMachine, boxOfPoints, hitShape, imageCorners, invert, mul, rotateAbout, scaleAbout, shapeBox, translate,
  unionBoxes, worldPaths, type Box,
} from "../geometry";
import { cachedImage, onImageLoaded } from "../images";
import { useLaser } from "../laser";
import { hasPaths, layerColor, uid, workpieceRect, type Mat, type Primitive, type Pt, type Shape } from "../model";
import {
  breakAt, deleteNodes, insertNode, joinEnds, moveHandle, moveNodes, nodeKey, parseKey, segmentToCurve, segmentToLine,
  setStartNode, toggleSmooth,
} from "../nodeedit";
import { drawNodeMode, hitTest, nodesInBox, worldCurves, type NodeHit } from "./nodeMode";
import { CANVAS_TOOLS } from "./canvasTools";
import { MeasurePanel } from "./MeasurePanel";
import { drawToolpath } from "./previewDraw";
import { segmentInfo, setMeasureInfo, shapeStats } from "../measure";
import { clipToMask, ditherPreview, onPreviewReady } from "../raster";
import { useCamera } from "../camera";
import { addShapes, checkpoint, getState, setState, updateShapes, useStore, withGroups } from "../store";

interface View {
  scale: number; // px par mm
  ox: number;
  oy: number;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { kind: "move"; start: Pt; orig: Map<string, Mat>; moved: boolean; exclude: Set<string>; wasSelected: boolean }
  | { kind: "scale"; handle: number; box: Box; orig: Map<string, Mat> }
  | { kind: "marquee"; start: Pt; cur: Pt; add: boolean }
  | { kind: "create"; start: Pt; cur: Pt }
  | { kind: "nodes"; start: Pt; inv: Mat; moved: boolean }
  | { kind: "measure" }
  | { kind: "rotate"; center: Pt; start: number; orig: Map<string, Mat> }
  | { kind: "shear"; handle: number; box: Box; start: Pt; orig: Map<string, Mat> }
  | { kind: "handle"; key: string; which: "c1" | "c2"; inv: Mat };

const HANDLE = 5; // demi-taille des poignées en px
const RULER = 18; // épaisseur des règles en px

/** Règles graduées (mm ou pouces) en haut et à gauche, avec la position du curseur. */
function drawRulers(
  ctx: CanvasRenderingContext2D, w: number, h: number, view: View, cursor: Pt | null,
  c: { band: string; text: string; line: string; accent: string }, inches: boolean,
) {
  // Graduations dans l'unité affichée : l'échelle passe en pixels par pouce.
  const u = inches ? 25.4 : 1;
  const v = { ...view, scale: view.scale * u };
  cursor = cursor && [cursor[0] / u, cursor[1] / u];
  // Pas des graduations : le plus petit pas « rond » qui laisse au moins 50 px entre deux libellés.
  const steps = inches ? [0.125, 0.25, 0.5, 1, 2, 5, 10, 20, 50] : [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const major = steps.find((s) => s * v.scale >= 50) ?? steps[steps.length - 1];
  const lead = String(major).replace(/^0\.?0*/, "")[0];
  const minor = major / (lead === "5" ? 5 : lead === "2" ? 4 : lead === "1" && major < 1 ? 2 : 10);
  const label = (x: number) => String(Number(x.toFixed(3)));
  ctx.save();
  ctx.fillStyle = c.band;
  ctx.fillRect(0, 0, w, RULER);
  ctx.fillRect(0, 0, RULER, h);
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.text;
  ctx.font = "9px -apple-system, sans-serif";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = Math.floor(-v.ox / v.scale / minor) * minor, x1 = (w - v.ox) / v.scale;
  for (let mm = x0; mm <= x1; mm += minor) {
    const x = Math.round(v.ox + mm * v.scale) + 0.5;
    if (x < RULER) continue;
    const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
    ctx.moveTo(x, RULER);
    ctx.lineTo(x, isMajor ? 4 : RULER - 5);
    if (isMajor) ctx.fillText(label(mm), x + 2, 10);
  }
  const y0 = Math.floor(-v.oy / v.scale / minor) * minor, y1 = (h - v.oy) / v.scale;
  for (let mm = y0; mm <= y1; mm += minor) {
    const y = Math.round(v.oy + mm * v.scale) + 0.5;
    if (y < RULER) continue;
    const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
    ctx.moveTo(RULER, y);
    ctx.lineTo(isMajor ? 4 : RULER - 5, y);
    if (isMajor) {
      ctx.save();
      ctx.translate(10, y + 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label(mm), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  if (cursor) {
    ctx.strokeStyle = c.accent;
    ctx.beginPath();
    const cx = v.ox + cursor[0] * v.scale, cy = v.oy + cursor[1] * v.scale;
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, RULER);
    ctx.moveTo(0, cy);
    ctx.lineTo(RULER, cy);
    ctx.stroke();
  }
  ctx.fillStyle = c.band;
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.restore();
}
const CLOSE_DIST = 8; // px : clic sur le premier point pour fermer une polyligne

/** Poignées : 4 coins puis milieux haut, droite, bas, gauche. */
function handles(b: Box): Pt[] {
  const { x, y, w, h } = b;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
}
const OPPOSITE = [2, 3, 0, 1, 6, 7, 4, 5];
const CURSORS = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize", "ns-resize", "ew-resize", "ns-resize", "ew-resize"];
const SHAPE_NAMES = { rect: tk("Rectangle"), ellipse: tk("Ellipse"), polygon: tk("Polygone"), star: tk("Étoile"), dualStar: tk("Double étoile") } as const;

/** Forme paramétrique créée par glisser, dans un repère local (0, 0)–(w, h). */
function createdPrimitive(tool: keyof typeof SHAPE_NAMES, w: number, h: number): Primitive {
  const o = getState().toolOptions;
  switch (tool) {
    case "rect": return { type: "rect", w, h, radius: o.cornerRadius };
    case "ellipse": return { type: "ellipse", w, h };
    case "polygon": return { type: "polygon", w, h, sides: o.polygonSides };
    case "star": return { type: "star", w, h, points: o.starPoints, ratio: o.starRatio };
    case "dualStar": return { type: "dualStar", w, h, points: o.starPoints, ratio: o.starRatio, ratio2: 0.7 };
  }
}

const createdCurve = (tool: keyof typeof SHAPE_NAMES, w: number, h: number): BezPath => primitiveCurve(createdPrimitive(tool, w, h));

/** Forme vectorielle à courbes, positionnée en (x, y). */
function curveShape(curves: BezPath[], x: number, y: number, name: string, primitive?: Primitive): Shape {
  return {
    id: uid(), kind: "vector", name, layerId: getState().currentLayer, matrix: translate(x, y), curves,
    paths: flattenBez(curves, 0.02), primitive,
  };
}

/** Points d'accroche d'une forme : coins et centre de sa boîte, nœuds, ou points s'ils sont peu nombreux. */
const snapCache = new WeakMap<Shape, Pt[]>();
function snapCandidates(s: Shape): Pt[] {
  let pts = snapCache.get(s);
  if (!pts) {
    const b = shapeBox(s);
    pts = b ? [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]] : [];
    if (s.kind === "vector" && s.curves) pts.push(...worldCurves(s).flatMap((c) => c.nodes.map((n) => n.p)));
    else if (s.kind !== "image") {
      const all = worldPaths(s).flatMap((p) => p.pts);
      if (all.length <= 400) pts.push(...all);
    }
    snapCache.set(s, pts);
  }
  return pts;
}

/** Partie linéaire d'une matrice inverse : convertit un déplacement plateau en déplacement local. */
const localDelta = (inv: Mat, d: Pt): Pt => [inv[0] * d[0] + inv[2] * d[1], inv[1] * d[0] + inv[3] * d[1]];

export function Workspace({ onCursor }: { onCursor: (p: Pt | null) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const drag = useRef<Drag | null>(null);
  const pen = useRef<{ pts: Pt[]; hover: Pt | null }>({ pts: [], hover: null });
  const nodeHover = useRef<NodeHit | null>(null);
  const cursorRef = useRef<Pt | null>(null);
  // Second clic sur la sélection : poignées de rotation (comme LightBurn).
  const rotateMode = useRef(false);
  const snapMark = useRef<Pt | null>(null);
  const measure = useRef<{ a: Pt; b: Pt } | null>(null);
  const space = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, redraw] = useState(0);
  const [cursor, setCursor] = useState("default");
  // Modifier → Faire clignoter les formes du calque actuel.
  const flash = useRef<{ ids: Set<string>; until: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      flash.current = { ids: new Set((e as CustomEvent<string[]>).detail), until: Date.now() + 1600 };
      clearInterval(timer);
      timer = window.setInterval(() => {
        if (flash.current && Date.now() > flash.current.until) {
          flash.current = null;
          clearInterval(timer);
        }
        redraw((n) => n + 1);
      }, 100);
    };
    window.addEventListener("lumiere:flash", on);
    return () => {
      window.removeEventListener("lumiere:flash", on);
      clearInterval(timer);
    };
  }, []);

  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const machine = useStore((s) => s.machine);
  const toolOptions = useStore((s) => s.toolOptions);
  const preview = useStore((s) => s.preview);
  const nodeSel = useStore((s) => s.nodeSel);
  const status = useLaser((s) => s.status);
  const lastPos = useLaser((s) => s.lastPos);
  const camera = useCamera((s) => s);

  const toBed = (px: number, py: number): Pt => [(px - view.current.ox) / view.current.scale, (py - view.current.oy) / view.current.scale];
  const toScreen = ([x, y]: Pt): Pt => [view.current.ox + x * view.current.scale, view.current.oy + y * view.current.scale];
  const bump = () => redraw((t) => t + 1);

  /** Magnétisme : points des objets d'abord, puis grille. ⌥ le désactive. */
  const snap = (p: Pt, alt: boolean, exclude?: Set<string>): Pt => {
    snapMark.current = null;
    const st = getState();
    const o = st.toolOptions;
    if (alt) return p;
    if (o.snapObjects) {
      const tol = o.snapDistance / view.current.scale;
      const visible = new Set(st.project.layers.filter((l) => l.visible).map((l) => l.id));
      let best: Pt | null = null, bd = tol;
      for (const s of st.project.shapes) {
        if (exclude?.has(s.id) || !visible.has(s.layerId)) continue;
        const b = shapeBox(s);
        if (!b || p[0] < b.x - tol || p[0] > b.x + b.w + tol || p[1] < b.y - tol || p[1] > b.y + b.h + tol) continue;
        for (const q of snapCandidates(s)) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < bd) [bd, best] = [d, q];
        }
      }
      if (best) return (snapMark.current = best);
    }
    if (o.snapGrid && o.gridSize > 0) {
      const g = o.gridSize;
      return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
    }
    return p;
  };

  const fit = () => {
    const { w, h } = size;
    if (!w || !h) return;
    const scale = Math.min((w - 60) / machine.bedWidth, (h - 60) / machine.bedHeight);
    view.current = { scale, ox: (w - machine.bedWidth * scale) / 2, oy: (h - machine.bedHeight * scale) / 2 };
    bump();
  };

  /** Termine la polyligne en cours. */
  const finishPen = (closed: boolean) => {
    const pts = pen.current.pts;
    pen.current = { pts: [], hover: null };
    if (pts.length >= 2) {
      const b = boxOfPoints(pts)!;
      const curves = fromPolylines([{ closed: closed && pts.length >= 3, pts: pts.map(([x, y]): Pt => [x - b.x, y - b.y]) }]);
      addShapes([curveShape(curves, b.x, b.y, closed ? t("Polygone") : t("Ligne"))]);
    }
    bump();
  };

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(fit, [size.w > 0, machine.bedWidth, machine.bedHeight]);
  useEffect(() => onImageLoaded(bump), []);
  useEffect(() => onPreviewReady(bump), []);
  useEffect(() => {
    if (tool !== "line" && pen.current.pts.length) finishPen(false);
    if (tool === "node") {
      const sel = getState().project.shapes.filter((s) => getState().selection.includes(s.id));
      if (sel.length === 1 && sel[0].kind === "text") notify(t("Convertissez le texte en chemin pour éditer ses nœuds (Modifier → Convertir en chemin)"));
      else if (sel.length > 1) setState({ selection: [] });
    }
    setState({ nodeSel: [] });
    nodeHover.current = null;
    measure.current = null;
    // Outils interactifs (deux points, déformations) : sans sélection valable, retour à la sélection.
    const ct = CANVAS_TOOLS[tool];
    if (ct && !ct.start()) setState({ tool: "select" });
  }, [tool]);
  useEffect(() => {
    const onFit = () => fit();
    const onZoom = (e: Event) => {
      const kind = (e as CustomEvent<"in" | "out" | "selection">).detail;
      const v = view.current;
      if (kind === "selection") {
        const b = unionBoxes(getState().project.shapes.filter((x) => getState().selection.includes(x.id)).map(shapeBox));
        if (!b) return;
        const scale = Math.min(200, (size.w - 80) / Math.max(b.w, 1), (size.h - 80) / Math.max(b.h, 1));
        view.current = { scale, ox: size.w / 2 - (b.x + b.w / 2) * scale, oy: size.h / 2 - (b.y + b.h / 2) * scale };
      } else {
        // Zoom autour du centre de la vue.
        const k = kind === "in" ? 1.4 : 1 / 1.4;
        const scale = Math.min(200, Math.max(0.05, v.scale * k));
        const [cx, cy] = [size.w / 2, size.h / 2];
        view.current = { scale, ox: cx - ((cx - v.ox) / v.scale) * scale, oy: cy - ((cy - v.oy) / v.scale) * scale };
      }
      bump();
    };
    window.addEventListener("lumiere:fit", onFit);
    window.addEventListener("lumiere:zoom", onZoom);
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (CANVAS_TOOLS[getState().tool]?.key(e.key)) {
        e.preventDefault();
        bump();
        return;
      }
      if (e.code === "Space") space.current = true;
      if (getState().tool === "node" && !e.metaKey && !e.ctrlKey && nodeKeys(e)) e.preventDefault();
      if (pen.current.pts.length && e.key === "Enter") finishPen(false);
      if (pen.current.pts.length && e.key === "Escape") {
        pen.current = { pts: [], hover: null };
        bump();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("lumiere:fit", onFit);
      window.removeEventListener("lumiere:zoom", onZoom);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  const selected = project.shapes.filter((s) => selection.includes(s.id));
  const selBox = unionBoxes(selected.map(shapeBox));

  // ------------------------------------------------------------- Rendu
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d")!;
    const { scale, ox, oy } = view.current;
    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(v).trim();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = color("--canvas");
    ctx.fillRect(0, 0, size.w, size.h);

    // Plateau et grille.
    const bw = machine.bedWidth * scale, bh = machine.bedHeight * scale;
    ctx.fillStyle = color("--bed");
    ctx.fillRect(ox, oy, bw, bh);
    // Image redressée de la caméra, sous la grille et le dessin.
    if (camera.overlay && camera.visible) {
      ctx.globalAlpha = camera.opacity;
      ctx.drawImage(camera.overlay, ox, oy, bw, bh);
      ctx.globalAlpha = 1;
    }
    // Grille visuelle : pas choisi dans les Paramètres, ×5 quand elle devient trop serrée.
    const g = Math.max(0.1, toolOptions.gridSpacing);
    const step = scale * g >= 8 ? g : g * 5;
    ctx.lineWidth = 1;
    for (let mm = 0; mm <= Math.max(machine.bedWidth, machine.bedHeight); mm += step) {
      ctx.strokeStyle = Math.abs(mm % 100) < 1e-6 || Math.abs((mm % 100) - 100) < 1e-6 ? color("--grid-major") : color("--grid");
      ctx.beginPath();
      if (mm <= machine.bedWidth) {
        const x = Math.round(ox + mm * scale) + 0.5;
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + bh);
      }
      if (mm <= machine.bedHeight) {
        const y = Math.round(oy + mm * scale) + 0.5;
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + bw, y);
      }
      ctx.stroke();
    }
    // Pièce de la page (mise en page) : rectangle en pointillés.
    const wp = project.workpieces?.[project.page ?? 0];
    if (wp) {
      const r = workpieceRect(wp, machine.bedWidth, machine.bedHeight);
      const [x0, y0] = toScreen([r.x, r.y]);
      ctx.strokeStyle = color("--accent");
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, r.w * scale, r.h * scale);
      ctx.setLineDash([]);
    }
    // Croix au centre du plateau (Paramètres → Affichage).
    if (toolOptions.centerCross) {
      const [cx, cy] = toScreen([machine.bedWidth / 2, machine.bedHeight / 2]);
      ctx.strokeStyle = color("--grid-major");
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
    const [mx, my] = toScreen(bedToMachine([0, 0], machine.origin, machine.bedWidth, machine.bedHeight));
    ctx.fillStyle = "#ff5a36";
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fill();

    // Formes.
    const layers = new Map(project.layers.map((l) => [l.id, l]));
    const { viewFilled: filled, viewSmooth: smooth } = toolOptions;
    for (const s of project.shapes) {
      const layer = layers.get(s.layerId);
      if (layer && !layer.visible) continue;
      const c = layerColor(s.layerId);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.kind === "image") {
        const dithered = layer?.mode === "image" ? ditherPreview(s, layer) : null;
        const img = dithered ?? cachedImage(s.src);
        ctx.save();
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
        ctx.transform(...s.matrix);
        ctx.imageSmoothingEnabled = !dithered && smooth;
        if (s.mask?.length && !dithered) clipToMask(ctx, s.mask);
        if (img) ctx.drawImage(img, 0, 0, s.width, s.height);
        ctx.restore();
        ctx.strokeStyle = c;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const p of [[0, 0], [s.width, 0], [s.width, s.height], [0, s.height]] as Pt[]) {
          const [x, y] = toScreen(apply(s.matrix, p));
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      for (const path of worldPaths(s)) {
        // Style « grossier » : points à moins de 2 px du précédent ignorés (tracé plus rapide).
        let last: [number, number] | null = null;
        path.pts.forEach((p, i) => {
          const [x, y] = toScreen(p);
          if (i === 0) ctx.moveTo(x, y);
          else if (smooth || !last || Math.abs(x - last[0]) + Math.abs(y - last[1]) >= 2 || i === path.pts.length - 1) ctx.lineTo(x, y);
          else return;
          last = [x, y];
        });
        if (path.closed) ctx.closePath();
      }
      if (filled && (layer?.mode === "fill" || layer?.mode === "offsetFill")) {
        ctx.fillStyle = c + "40";
        ctx.fill("evenodd");
      }
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      // Attaches manuelles : petits traits perpendiculaires.
      if (s.tabs?.length) {
        ctx.fillStyle = color("--warn");
        for (const t of s.tabs) {
          const [x, y] = toScreen(apply(s.matrix, t));
          ctx.fillRect(x - 3, y - 3, 6, 6);
        }
      }
    }

    // Formes qui clignotent (une demi-période sur deux).
    if (flash.current && Math.floor(Date.now() / 200) % 2 === 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      for (const s of project.shapes) {
        if (!flash.current.ids.has(s.id)) continue;
        const paths = hasPaths(s) ? worldPaths(s) : [{ closed: true, pts: imageCorners(s) }];
        for (const path of paths) {
          path.pts.forEach((p, i) => {
            const [x, y] = toScreen(p);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          if (path.closed) ctx.closePath();
        }
      }
      ctx.strokeStyle = color("--accent");
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Aperçu de trajectoire : déplacements en gris, découpes à la couleur de leur calque.
    if (preview) {
      const { segs, layers: names } = preview.toolpath;
      const byName = new Map(project.layers.map((l) => [l.name, l.id]));
      // « C01 · 2 » (sous-calque) prend la couleur de C01.
      const colorOf = names.map((n) => {
        const id = byName.get(n) ?? byName.get(n.split(" · ")[0]);
        return id == null ? color("--burn") : layerColor(id);
      });
      const po = getState().toolOptions;
      if (po.previewInvert) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(ox, oy, machine.bedWidth * scale, machine.bedHeight * scale);
      }
      drawToolpath(ctx, preview.toolpath, preview.shown, (x, y) => [ox + x * scale, oy + y * scale], {
        layerColors: colorOf, burn: color("--burn"), travel: color("--travel"),
        shade: po.previewShade, invert: po.previewInvert, showTravel: po.previewTravel, lineWidth: 1.2,
      });
      if (preview.shown > 0 && preview.shown < preview.toolpath.count) {
        const i = preview.shown - 1;
        ctx.fillStyle = color("--burn");
        ctx.beginPath();
        ctx.arc(ox + segs[i * 4 + 2] * scale, oy + segs[i * 4 + 3] * scale, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Repère de l'outil interactif en cours.
    const ct = CANVAS_TOOLS[tool];
    if (ct) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ct.draw(ctx, toScreen, { accent: color("--accent"), text: color("--text") });
    }

    // Édition de nœuds ou cadre de sélection.
    const target = tool === "node" ? nodeTarget() : null;
    if (target) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawNodeMode(ctx, worldCurves(target), toScreen, nodeSel, nodeHover.current, {
        accent: color("--accent"), surface: color("--surface"), text: color("--text"),
      });
    } else if (selBox && tool !== "node") {
      const [x0, y0] = toScreen([selBox.x, selBox.y]);
      const [x1, y1] = toScreen([selBox.x + selBox.w, selBox.y + selBox.h]);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color("--accent");
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
      ctx.setLineDash([]);
      ctx.fillStyle = color("--surface");
      if (rotateMode.current) {
        // Poignées de rotation : arcs aux quatre coins, croix au centre.
        for (const h of handles(selBox).slice(0, 4)) {
          const [hx, hy] = toScreen(h);
          ctx.beginPath();
          ctx.arc(hx, hy, HANDLE + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Poignées de cisaillement : losanges au milieu des côtés.
        for (const h of handles(selBox).slice(4)) {
          const [hx, hy] = toScreen(h);
          ctx.beginPath();
          ctx.moveTo(hx, hy - HANDLE);
          ctx.lineTo(hx + HANDLE, hy);
          ctx.lineTo(hx, hy + HANDLE);
          ctx.lineTo(hx - HANDLE, hy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        const [cx, cy] = toScreen([selBox.x + selBox.w / 2, selBox.y + selBox.h / 2]);
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy + 6);
        ctx.stroke();
      } else {
        for (const h of handles(selBox)) {
          const [hx, hy] = toScreen(h);
          ctx.fillRect(hx - HANDLE, hy - HANDLE, HANDLE * 2, HANDLE * 2);
          ctx.strokeRect(hx - HANDLE + 0.5, hy - HANDLE + 0.5, HANDLE * 2 - 1, HANDLE * 2 - 1);
        }
      }
    }

    // Cadre de sélection ou forme en cours de création.
    const d = drag.current;
    if (d && (d.kind === "marquee" || d.kind === "create")) {
      const [x0, y0] = toScreen(d.start);
      const [x1, y1] = toScreen(d.cur);
      ctx.strokeStyle = color("--accent");
      ctx.setLineDash(d.kind === "marquee" ? [4, 3] : []);
      ctx.beginPath();
      if (d.kind === "create" && tool in SHAPE_NAMES) {
        const [path] = flattenBez([createdCurve(tool as keyof typeof SHAPE_NAMES, Math.abs(x1 - x0) / scale, Math.abs(y1 - y0) / scale)], 0.05);
        const [bx, by] = [Math.min(x0, x1), Math.min(y0, y1)];
        path.pts.forEach(([x, y], i) => (i ? ctx.lineTo(bx + x * scale, by + y * scale) : ctx.moveTo(bx + x * scale, by + y * scale)));
        ctx.closePath();
      } else ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Polyligne en cours.
    if (pen.current.pts.length) {
      const pts = pen.current.hover ? [...pen.current.pts, pen.current.hover] : pen.current.pts;
      ctx.strokeStyle = layerColor(getState().currentLayer);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toScreen(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = color("--accent");
      for (const p of pen.current.pts) {
        const [x, y] = toScreen(p);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }

    // Mesure.
    if (measure.current) {
      const { a, b } = measure.current;
      const [ax, ay] = toScreen(a), [bx, by] = toScreen(b);
      ctx.strokeStyle = color("--warn");
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const label = `${Math.hypot(dx, dy).toFixed(2)} mm · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)} · ${((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1)}°`;
      ctx.font = "12px -apple-system, sans-serif";
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = color("--surface");
      ctx.fillRect(bx + 10, by + 10, w, 22);
      ctx.fillStyle = color("--text");
      ctx.fillText(label, bx + 16, by + 25);
    }

    // Point d'accroche du magnétisme.
    if (snapMark.current) {
      const [x, y] = toScreen(snapMark.current);
      ctx.strokeStyle = "#ff3dbb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.stroke();
    }

    // Curseur en lignes plein écran.
    if (toolOptions.fullCursor && cursorRef.current) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [cx, cy] = toScreen(cursorRef.current);
      ctx.strokeStyle = color("--accent");
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, 0);
      ctx.lineTo(Math.round(cx) + 0.5, size.h);
      ctx.moveTo(0, Math.round(cy) + 0.5);
      ctx.lineTo(size.w, Math.round(cy) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawRulers(ctx, size.w, size.h, view.current, cursorRef.current, {
      band: color("--surface"), text: color("--muted"), line: color("--border"), accent: color("--accent"),
    }, toolOptions.units === "in");

    // Dernière position connue de la tête (laser déconnecté), en pointillés.
    if (!status && lastPos && toolOptions.showLastPos !== false) {
      const [hx, hy] = toScreen(bedToMachine(lastPos, machine.origin, machine.bedWidth, machine.bedHeight));
      ctx.strokeStyle = "#ff3b30";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Position physique de la tête laser.
    if (status) {
      const [hx, hy] = toScreen(bedToMachine([status.mpos[0], status.mpos[1]], machine.origin, machine.bedWidth, machine.bedHeight));
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 10, hy);
      ctx.lineTo(hx + 10, hy);
      ctx.moveTo(hx, hy - 10);
      ctx.lineTo(hx, hy + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // ------------------------------------------------------- Interaction
  const local = (e: React.PointerEvent | React.WheelEvent | React.MouseEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const handleAt = (px: number, py: number) => {
    if (!selBox) return -1;
    return handles(selBox).findIndex((h) => {
      const [hx, hy] = toScreen(h);
      return Math.abs(px - hx) <= HANDLE + 2 && Math.abs(py - hy) <= HANDLE + 2;
    });
  };

  const shapeAt = (p: Pt): Shape | undefined => {
    const st = getState();
    const visible = new Set(st.project.layers.filter((l) => l.visible).map((l) => l.id));
    const tol = st.toolOptions.clickTolerance / view.current.scale;
    return [...st.project.shapes].reverse().find((s) => visible.has(s.layerId) && hitShape(s, p, tol));
  };

  /** Outil Mesure : forme et segment sous le curseur (sinon la sélection), trait de mesure. */
  const publishMeasure = (p: Pt) => {
    const st = getState();
    const target = shapeAt(p) ?? (st.selection.length === 1 ? st.project.shapes.find((s) => s.id === st.selection[0]) : undefined);
    const curves = !target ? null : target.kind === "vector" ? worldCurves(target) : hasPaths(target) ? fromPolylines(worldPaths(target)) : null;
    setMeasureInfo({
      shape: curves ? shapeStats(curves) : null,
      segment: curves ? segmentInfo(curves, p, st.toolOptions.clickTolerance / view.current.scale) : null,
      line: measure.current && Math.hypot(measure.current.b[0] - measure.current.a[0], measure.current.b[1] - measure.current.a[1]) > 1e-9 ? measure.current : null,
    });
  };

  /** Clic en mode nœuds : nœud, poignée, autre forme ou cadre de sélection de nœuds. */
  const nodePointerDown = (p: Pt, shift: boolean) => {
    const st = getState();
    const target = nodeTarget();
    const hit = target ? hitTest(worldCurves(target), st.nodeSel, p, 6 / view.current.scale) : null;
    if (target && hit?.kind === "handle") {
      checkpoint(t("Modifier les nœuds"));
      drag.current = { kind: "handle", key: nodeKey(hit.ref), which: hit.which, inv: invert(target.matrix) };
      return;
    }
    if (target && hit?.kind === "node") {
      const key = nodeKey(hit.ref);
      let sel = st.nodeSel;
      if (shift) sel = sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key];
      else if (!sel.includes(key)) sel = [key];
      setState({ nodeSel: sel });
      drag.current = { kind: "nodes", start: p, inv: invert(target.matrix), moved: false };
      return;
    }
    if (hit?.kind === "segment") {
      if (!shift) setState({ nodeSel: [] });
      return;
    }
    const other = shapeAt(p);
    if (other && other.id !== target?.id) {
      if (other.kind === "text") notify(t("Convertissez le texte en tracés pour éditer ses nœuds"));
      setState({ selection: other.kind === "vector" ? [other.id] : [], nodeSel: [] });
      return;
    }
    drag.current = { kind: "marquee", start: p, cur: p, add: shift };
    if (!shift) setState({ nodeSel: [] });
  };

  /** Raccourcis de l'outil Nœuds (comme LightBurn), appliqués au nœud ou segment survolé. */
  const nodeKeys = (e: KeyboardEvent): boolean => {
    const target = nodeTarget();
    if (!target) return false;
    const st = getState();
    const hover = nodeHover.current;
    const refs = st.nodeSel.map(parseKey);
    const hoveredNode = hover?.kind === "node" ? hover.ref : refs.length === 1 ? refs[0] : null;
    const edit = (f: Parameters<typeof editCurves>[1], nodeSel: string[] = []) => {
      editCurves(target.id, f);
      nodeHover.current = null;
      setState({ nodeSel });
    };
    switch (e.key.toLowerCase()) {
      case "d":
      case "delete":
      case "backspace": {
        const kill = refs.length ? refs : hoveredNode ? [hoveredNode] : [];
        if (kill.length) edit((c) => deleteNodes(c, kill));
        return true;
      }
      case "i":
        if (hover?.kind === "segment") edit((c) => insertNode(c, hover.path, hover.seg, hover.t), [nodeKey({ path: hover.path, node: hover.seg + 1 })]);
        return true;
      case "b":
        if (hoveredNode) edit((c) => breakAt(c, hoveredNode));
        return true;
      case "l":
        if (hover?.kind === "segment") edit((c) => segmentToLine(c, hover.path, hover.seg));
        return true;
      case "c":
        if (hover?.kind === "segment") edit((c) => segmentToCurve(c, hover.path, hover.seg));
        return true;
      case "s":
        if (hoveredNode) edit((c) => toggleSmooth(c, hoveredNode), [nodeKey(hoveredNode)]);
        return true;
      case "p":
        // Point de départ de la découpe (respecté avec l'option « Conserver le départ »).
        if (hoveredNode) edit((c) => setStartNode(c, hoveredNode), [nodeKey({ path: hoveredNode.path, node: 0 })]);
        return true;
      case "j":
        if (refs.length === 2) {
          const joined = joinEnds(curvesOf(target), refs[0], refs[1]);
          if (joined) edit(() => joined);
          else notify(t("Sélectionnez deux extrémités de tracés ouverts"));
        }
        return true;
      case "arrowleft":
      case "arrowright":
      case "arrowup":
      case "arrowdown": {
        if (!refs.length) return true;
        const step = e.shiftKey ? 1 : 0.1;
        const k = e.key.toLowerCase();
        const d: Pt = [k === "arrowleft" ? -step : k === "arrowright" ? step : 0, k === "arrowup" ? -step : k === "arrowdown" ? step : 0];
        editCurves(target.id, (c) => moveNodes(c, refs, localDelta(invert(target.matrix), d)));
        return true;
      }
      case "escape":
        if (st.nodeSel.length) setState({ nodeSel: [] });
        else setState({ tool: "select" });
        return true;
    }
    return false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const [px, py] = local(e);
    const p = toBed(px, py);
    const st = getState();
    if (e.button === 1 || e.button === 2 || space.current) {
      drag.current = { kind: "pan", sx: px, sy: py, ox: view.current.ox, oy: view.current.oy };
      return;
    }
    const ct = CANVAS_TOOLS[st.tool];
    if (ct) {
      ct.down(p, { alt: e.altKey, shift: e.shiftKey }, { snap, scale: view.current.scale });
      bump();
      return;
    }
    if (st.tool === "tab") {
      const hit = shapeAt(p);
      if (hit && hit.kind !== "image") toggleTab(hit, p, e.shiftKey, 8 / view.current.scale);
      return;
    }
    if (st.tool === "trim") {
      const hit = shapeAt(p);
      if (hit && hit.kind !== "image") trimShapeAt(hit, p);
      return;
    }
    if (st.tool === "position") {
      moveLaserTo(snap(p, e.altKey));
      return;
    }
    if (st.tool === "measure") {
      const q = snap(p, e.altKey);
      measure.current = { a: q, b: q };
      drag.current = { kind: "measure" };
      return;
    }
    if (st.tool === "line") {
      const first = pen.current.pts[0];
      if (first && pen.current.pts.length >= 3) {
        const [fx, fy] = toScreen(first);
        if (Math.hypot(px - fx, py - fy) <= CLOSE_DIST) return finishPen(true);
      }
      pen.current.pts.push(snap(p, e.altKey));
      bump();
      return;
    }
    if (st.tool === "node") return nodePointerDown(p, e.shiftKey);
    if (st.tool === "text") {
      addText(p);
      setState({ tool: "select" });
      return;
    }
    if (st.tool !== "select") {
      const q = snap(p, e.altKey);
      drag.current = { kind: "create", start: q, cur: q };
      return;
    }
    const allow = st.toolOptions;
    const h = handleAt(px, py);
    if (h >= 0 && selBox && rotateMode.current && h < 4 && allow.dragRotate !== false) {
      checkpoint(t("Faire pivoter"));
      const center: Pt = [selBox.x + selBox.w / 2, selBox.y + selBox.h / 2];
      drag.current = { kind: "rotate", center, start: Math.atan2(p[1] - center[1], p[0] - center[0]), orig: new Map(selected.filter((s) => !s.locked).map((s) => [s.id, s.matrix])) };
      return;
    }
    if (h >= 4 && selBox && rotateMode.current && allow.dragShear !== false) {
      checkpoint(t("Cisailler"));
      drag.current = { kind: "shear", handle: h, box: selBox, start: p, orig: new Map(selected.filter((s) => !s.locked).map((s) => [s.id, s.matrix])) };
      return;
    }
    if (h >= 0 && selBox && !rotateMode.current && allow.dragScale !== false) {
      checkpoint(t("Redimensionner"));
      drag.current = { kind: "scale", handle: h, box: selBox, orig: new Map(selected.filter((s) => !s.locked).map((s) => [s.id, s.matrix])) };
      return;
    }
    const hit = shapeAt(p);
    if (!hit) {
      rotateMode.current = false;
      drag.current = { kind: "marquee", start: p, cur: p, add: e.shiftKey };
      if (!e.shiftKey) setState({ selection: [] });
      return;
    }
    const members = withGroups([hit.id], st.project.shapes);
    const wasSelected = st.selection.includes(hit.id);
    if (!wasSelected) rotateMode.current = false;
    let sel = st.selection;
    if (e.shiftKey) sel = sel.includes(hit.id) ? sel.filter((id) => !members.includes(id)) : [...sel, ...members];
    else if (!sel.includes(hit.id)) sel = members;
    setState({ selection: sel, currentLayer: hit.layerId });
    // Déplacement à la souris désactivé : la sélection change, les formes restent en place.
    const orig = new Map(allow.dragMove === false ? [] : st.project.shapes.filter((s) => sel.includes(s.id) && !s.locked).map((s) => [s.id, s.matrix]));
    drag.current = { kind: "move", start: p, orig, moved: false, exclude: new Set(sel), wasSelected };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = local(e);
    const p = toBed(px, py);
    onCursor(p);
    cursorRef.current = p;
    const d = drag.current;
    const tool = getState().tool;
    const ct = CANVAS_TOOLS[tool];
    if (ct && !d) {
      ct.move(p, { alt: e.altKey, shift: e.shiftKey }, { snap, scale: view.current.scale });
      bump();
      return;
    }
    if (!d) {
      if (tool === "node") {
        const target = nodeTarget();
        const hit = target ? hitTest(worldCurves(target), getState().nodeSel, p, 6 / view.current.scale) : null;
        if (JSON.stringify(hit) !== JSON.stringify(nodeHover.current)) {
          nodeHover.current = hit;
          bump();
        }
        setCursor(hit?.kind === "node" || hit?.kind === "handle" ? "pointer" : hit ? "copy" : shapeAt(p) ? "pointer" : "default");
        return;
      }
      if (tool === "measure") publishMeasure(p);
      // Outils de dessin et de mesure : montre le point d'accroche sous le curseur.
      if (tool !== "select" && tool !== "text") {
        const had = snapMark.current;
        const q = snap(p, e.altKey);
        if (tool === "line" && pen.current.pts.length) pen.current.hover = q;
        if (had !== snapMark.current || (tool === "line" && pen.current.pts.length)) bump();
      }
      const h = tool === "select" ? handleAt(px, py) : -1;
      setCursor(h >= 0 && rotateMode.current ? (h < 4 ? "grab" : h % 2 === 0 ? "col-resize" : "row-resize") : h >= 0 ? CURSORS[h] : tool === "text" ? "text" : tool === "trim" ? (shapeAt(p) ? "pointer" : "default") : tool !== "select" ? "crosshair" : shapeAt(p) ? "move" : "default");
      return;
    }
    switch (d.kind) {
      case "pan":
        view.current = { ...view.current, ox: d.ox + px - d.sx, oy: d.oy + py - d.sy };
        bump();
        break;
      case "measure":
        measure.current = { ...measure.current!, b: snap(p, e.altKey) };
        publishMeasure(p);
        bump();
        break;
      case "rotate": {
        let deg = ((Math.atan2(p[1] - d.center[1], p[0] - d.center[0]) - d.start) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15; // Maj : pas de 15°
        const r = rotateAbout(deg, d.center);
        updateShapes([...d.orig.keys()], (s) => ({ ...s, matrix: mul(r, d.orig.get(s.id)!) }), false);
        break;
      }
      case "move": {
        const q = snap(p, e.altKey, d.exclude);
        let dx = q[0] - d.start[0], dy = q[1] - d.start[1];
        if (!d.moved) {
          if (Math.hypot(dx, dy) * view.current.scale < 3) return;
          checkpoint(t("Déplacer"));
          d.moved = true;
        }
        // Maj : déplacement contraint à l'horizontale ou à la verticale.
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        const shift = translate(dx, dy);
        updateShapes([...d.orig.keys()], (s) => ({ ...s, matrix: mul(shift, d.orig.get(s.id)!) }), false);
        break;
      }
      case "shear": {
        // Côtés haut et bas : cisaillement horizontal autour du côté opposé ; côtés droit et gauche : vertical.
        const { box, handle } = d;
        const anchor = handles(box)[OPPOSITE[handle]];
        const grab = handles(box)[handle];
        let m: Mat;
        if (handle === 4 || handle === 6) {
          const k = (p[0] - d.start[0]) / (grab[1] - anchor[1] || 1);
          m = [1, 0, k, 1, -k * anchor[1], 0];
        } else {
          const k = (p[1] - d.start[1]) / (grab[0] - anchor[0] || 1);
          m = [1, k, 0, 1, 0, -k * anchor[0]];
        }
        updateShapes([...d.orig.keys()], (s) => ({ ...s, matrix: mul(m, d.orig.get(s.id)!) }), false);
        break;
      }
      case "scale": {
        const { box, handle } = d;
        const anchor = handles(box)[OPPOSITE[handle]];
        const grab = handles(box)[handle];
        let sx = box.w > 1e-9 ? (p[0] - anchor[0]) / (grab[0] - anchor[0] || 1) : 1;
        let sy = box.h > 1e-9 ? (p[1] - anchor[1]) / (grab[1] - anchor[1] || 1) : 1;
        if (handle === 4 || handle === 6) sx = 1;
        if (handle === 5 || handle === 7) sy = 1;
        if (handle < 4 && !e.shiftKey) sx = sy = Math.max(sx, sy); // coins : proportions conservées (Maj pour libérer)
        sx = Math.max(sx, 0.01);
        sy = Math.max(sy, 0.01);
        const m = scaleAbout(sx, sy, anchor);
        updateShapes([...d.orig.keys()], (s) => ({ ...s, matrix: mul(m, d.orig.get(s.id)!) }), false);
        break;
      }
      case "marquee":
        d.cur = p;
        bump();
        break;
      case "nodes": {
        const target = nodeTarget();
        if (!target) break;
        const q = snap(p, e.altKey, new Set([target.id]));
        const delta = localDelta(d.inv, [q[0] - d.start[0], q[1] - d.start[1]]);
        if (!d.moved) {
          if (Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) * view.current.scale < 2) return;
          checkpoint(t("Modifier les nœuds"));
          d.moved = true;
        }
        d.start = q;
        const refs = getState().nodeSel.map(parseKey);
        editCurves(target.id, (c) => moveNodes(c, refs, delta), false);
        break;
      }
      case "handle": {
        const target = nodeTarget();
        if (!target) break;
        const local = apply(d.inv, p);
        // Alt : casse la symétrie du nœud lisse.
        editCurves(target.id, (c) => moveHandle(c, parseKey(d.key), d.which, local, e.altKey), false);
        break;
      }
      case "create": {
        const q = snap(p, e.altKey);
        // Maj : forme carrée / cercle.
        if (e.shiftKey) {
          const side = Math.max(Math.abs(q[0] - d.start[0]), Math.abs(q[1] - d.start[1]));
          d.cur = [d.start[0] + Math.sign(q[0] - d.start[0] || 1) * side, d.start[1] + Math.sign(q[1] - d.start[1] || 1) * side];
        } else d.cur = q;
        bump();
        break;
      }
    }
  };

  const onPointerUp = () => {
    CANVAS_TOOLS[getState().tool]?.up();
    const d = drag.current;
    drag.current = null;
    snapMark.current = null;
    if (!d) return;
    const st = getState();
    // Clic simple (sans déplacement) sur une forme déjà sélectionnée : bascule rotation / échelle.
    if (d.kind === "move" && !d.moved && d.wasSelected) rotateMode.current = !rotateMode.current;
    if (d.kind === "marquee" && st.tool === "node") {
      const target = nodeTarget();
      const b = boxOfPoints([d.start, d.cur])!;
      if (target) {
        const keys = nodesInBox(worldCurves(target), b.x, b.y, b.x + b.w, b.y + b.h);
        setState({ nodeSel: d.add ? [...new Set([...st.nodeSel, ...keys])] : keys });
      }
    } else if (d.kind === "marquee") {
      const b = boxOfPoints([d.start, d.cur])!;
      const inside = st.project.shapes
        .filter((s) => {
          const sb = shapeBox(s);
          return sb && sb.x >= b.x && sb.y >= b.y && sb.x + sb.w <= b.x + b.w && sb.y + sb.h <= b.y + b.h;
        })
        .map((s) => s.id);
      const ids = withGroups(inside, st.project.shapes);
      setState({ selection: d.add ? [...new Set([...st.selection, ...ids])] : ids });
    } else if (d.kind === "create" && st.tool in SHAPE_NAMES) {
      const b = boxOfPoints([d.start, d.cur])!;
      const shapeTool = st.tool as keyof typeof SHAPE_NAMES;
      if (b.w * view.current.scale > 2 && b.h * view.current.scale > 2) {
        const primitive = createdPrimitive(shapeTool, b.w, b.h);
        addShapes([curveShape([primitiveCurve(primitive)], b.x, b.y, t(SHAPE_NAMES[shapeTool]), primitive)]);
      }
      if (st.toolOptions.selectAfterDraw) setState({ tool: "select" });
    }
    bump();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = getState();
    if (st.tool === "node") {
      // Double-clic sur un segment : insère un nœud.
      const hit = nodeHover.current;
      const target = nodeTarget();
      if (target && hit?.kind === "segment") {
        editCurves(target.id, (c) => insertNode(c, hit.path, hit.seg, hit.t));
        setState({ nodeSel: [nodeKey({ path: hit.path, node: hit.seg + 1 })] });
      }
      return;
    }
    if (st.tool === "line") {
      // Le double-clic a déjà ajouté deux fois le même point.
      pen.current.pts.pop();
      return finishPen(false);
    }
    const [px, py] = local(e);
    const hit = shapeAt(toBed(px, py));
    if (hit?.kind === "text") {
      setState({ selection: [hit.id] });
      window.dispatchEvent(new Event("lumiere:edit-text"));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const [px, py] = local(e);
    const v = view.current;
    // Pincement (ctrlKey) ou molette de souris : zoom. Défilement à deux doigts : déplacement.
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const dir = getState().toolOptions.invertWheel && !e.ctrlKey ? -1 : 1;
      const k = Math.exp(-dir * e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const scale = Math.min(200, Math.max(0.05, v.scale * k));
      const [bx, by] = toBed(px, py);
      view.current = { scale, ox: px - bx * scale, oy: py - by * scale };
    } else {
      view.current = { ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY };
    }
    bump();
  };

  return (
    <div ref={wrapRef} className="workspace" data-tick={tick}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onCursor(null);
          cursorRef.current = null;
          bump();
        }}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {tool === "measure" && <MeasurePanel />}
    </div>
  );
}

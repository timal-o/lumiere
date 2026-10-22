// Actions du menu contextuel des calques (clic droit dans la liste, comme LightBurn).

import type { Layer } from "./model";
import { commit, getState, pruneLayers } from "./store";

type Flag = "output" | "visible" | "airAssist";

function updateLayers(f: (l: Layer) => Partial<Layer>) {
  commit((p) => ({ ...p, layers: p.layers.map((l) => ({ ...l, ...f(l) })) }));
}

/** Tous les calques à `on`. */
export const setAll = (flag: Flag, on: boolean) => updateLayers(() => ({ [flag]: on }));
/** Seul ce calque reste actif (sortie) ou visible. */
export const only = (flag: Flag, id: number) => updateLayers((l) => ({ [flag]: l.id === id }));
export const invert = (flag: Flag) => updateLayers((l) => ({ [flag]: !l[flag] }));
export const toggle = (flag: Flag, id: number) => updateLayers((l) => (l.id === id ? { [flag]: !l[flag] } : {}));

/** Supprime le calque et toutes ses formes (annulable). */
export function deleteLayer(id: number) {
  const st = getState();
  const next = st.project.layers.find((l) => l.id !== id)?.id ?? 0;
  commit(
    (p) => pruneLayers({ ...p, shapes: p.shapes.filter((s) => s.layerId !== id), layers: p.layers.filter((l) => l.id !== id) }, next),
    { selection: st.selection.filter((sid) => st.project.shapes.find((s) => s.id === sid)?.layerId !== id), currentLayer: next },
  );
}

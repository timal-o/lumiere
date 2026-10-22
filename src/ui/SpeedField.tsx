import { useStore } from "../store";
import { NumField } from "./NumField";

/** Vitesse stockée en mm/min, affichée par minute ou par seconde (en pouces si choisi, voir NumField). */
export function SpeedField({ label, value, onChange, min = 1, max = 100000, width }: {
  label?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; width?: number;
}) {
  const unit = useStore((s) => s.toolOptions.speedUnit);
  const k = unit === "mm/s" ? 60 : 1;
  return (
    <NumField label={label} unit={unit} value={value / k} min={min / k} max={max / k} step={unit === "mm/s" ? 1 : 100}
      digits={unit === "mm/s" ? 1 : 0} width={width} onChange={(v) => onChange(v * k)} />
  );
}

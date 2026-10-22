import { useEffect, useState } from "react";
import { displayUnit, useInches } from "../units";

interface Props {
  label?: string;
  value: number | null;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  disabled?: boolean;
  width?: number;
}

/**
 * Champ numérique validé à l'Entrée ou à la perte du focus. Les valeurs en millimètres
 * s'affichent en pouces si l'utilisateur l'a choisi (Paramètres) ; elles restent stockées en mm.
 */
export function NumField(props: Props) {
  const inches = useInches();
  const { k, unit } = displayUnit(props.unit, inches);
  if (k === 1) return <BaseField {...props} />;
  const scaled = (v: number | undefined) => (v == null ? v : v / k);
  return (
    <BaseField {...props} unit={unit} value={props.value == null ? null : props.value / k} min={scaled(props.min)} max={scaled(props.max)}
      step={Math.max(0.001, (props.step ?? 1) / k > 0.5 ? 0.1 : 0.01)} digits={Math.max(3, (props.digits ?? 2) + 1)}
      onChange={(v) => props.onChange(v * k)} />
  );
}

function BaseField({ label, value, onChange, unit, min, max, step = 1, digits = 2, disabled, width = 72 }: Props) {
  const fmt = (v: number | null) => (v == null ? "" : String(Number(v.toFixed(digits))));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) {
      const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
      if (c !== value) onChange(c);
      setText(fmt(c));
    } else setText(fmt(value));
  };

  return (
    <label className="num">
      {label && <span className="num-label">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled || value == null}
        style={{ width }}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = parseFloat(text.replace(",", ".")) || 0;
            const next = base + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
            setText(fmt(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))));
          }
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </label>
  );
}

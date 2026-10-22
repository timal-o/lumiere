# Project file format (`.lum`)

A Lumière project is a UTF-8 JSON document. Images are embedded as data URLs, so files are
self-contained. The authoritative definitions are the TypeScript types in
[`src/model.ts`](../src/model.ts); this page summarises them.

```json
{
  "format": "lumiere",
  "version": 1,
  "notes": "Plywood 3 mm, 2 passes",
  "layers": [ … ],
  "shapes": [ … ]
}
```

| Field | Type | Description |
|---|---|---|
| `format` | `"lumiere"` | Identifies the file |
| `version` | `1` | Format version |
| `notes` | string, optional | Free text |
| `pages`, `page` | optional | Several pages: each `{ "name", "shapes" }`; `page` is the one shown (its shapes are also in `shapes`) |
| `optimization` | object, optional | Optimization settings (order, travel, start points, cuts last…) |
| `arrays` | object, optional | Editable arrays by id: grid or circular settings and the ids of their source shapes; copies carry `arrayCopy` |
| `workpieces` | array, optional | Per page: `{ "w", "h", "anchor" }` workpiece shown on the bed, or `null` |
| `layers` | Layer[] | In output (burn) order |
| `shapes` | Shape[] | In stacking order (last drawn on top) |

Missing fields are filled with defaults when a file is opened (`migrateProject`), so older
files keep working when new settings are added.

## Units and coordinates

- Lengths are millimetres; speeds are mm/min; powers are percentages (0–100).
- Coordinates are bed coordinates: origin at the top-left of the bed, Y pointing down.
- `matrix` is an affine transform `[a, b, c, d, e, f]` from the shape's local coordinates to the
  bed: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
- A point is `[x, y]`. A polyline is `{ "pts": [[x, y], …], "closed": true }` (a closed polyline
  does not repeat its first point).

## Layer

| Field | Type | Description |
|---|---|---|
| `id` | integer 0–19 | Palette index, also the layer identity |
| `name` | string | Display name |
| `output`, `visible` | boolean | Burn the layer / show it |
| `mode` | `"line"`, `"fill"`, `"offsetFill"`, `"image"` | Processing mode |
| `speed`, `power`, `minPower`, `passes`, `interval` | number | Basic settings (`minPower` for grayscale images) |
| `bidirectional`, `overscan` | boolean, mm | Scanning (fill, image) |
| `fillAngle`, `crossHatch`, `fillIndividually` | °, boolean, boolean | Fill options |
| `dither`, `halftoneLpi`, `halftoneAngle`, `imageSlices` | | Image options |
| `kerf`, `tabCount`, `tabSize`, `perforate`, `perfOn`, `perfOff` | | Line options |
| `overcut`, `rampLength`, `rampMin`, `dotMode`, `dotTime`, `dotSpacing` | | Line options |
| `direction` | `"any"`, `"cw"`, `"ccw"` | Contour direction |
| `keepStart`, `innerFirst`, `removeOverlaps` | boolean | Ordering options |
| `airAssist`, `zOffset`, `zStep` | | Air assist, Z per layer and per pass |
| `subLayers` | SubLayer[] | Extra settings applied to the same shapes; each has the same cut fields plus `enabled` |
| `libraryLink` | { id, label }? | Material library entry the layer is linked to; its settings are reloaded from the library when the project opens |

`dither` is one of `threshold`, `ordered`, `floydSteinberg`, `jarvis`, `stucki`, `atkinson`,
`halftone`, `grayscale`.

## Shapes

All shapes share:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `kind` | `"vector"`, `"text"`, `"image"` | Shape type |
| `layerId` | integer | Layer the shape belongs to |
| `matrix` | number[6] | Local → bed transform |
| `name` | string | Display name |
| `groupId` | string, optional | Shapes with the same value are selected together |
| `tabs` | Point[], optional | Manual tab positions (local coordinates) |

### `vector`

| Field | Description |
|---|---|
| `paths` | Polylines in local coordinates (always present; derived from `curves` when they exist) |
| `curves` | Optional Bézier paths: `{ "closed": bool, "nodes": [{ "p": [x, y], "c1": [x, y]?, "c2": [x, y]?, "smooth": bool? }] }`. The segment from node *i* to node *i+1* is a cubic with control points `p(i), c2(i), c1(i+1), p(i+1)`; without handles it is a straight line. |
| `primitive` | Optional parametric definition: `rect` (`w`, `h`, `radius`), `ellipse` (`w`, `h`), `polygon` (`w`, `h`, `sides`), `star` (`w`, `h`, `points`, `ratio`) |

### `text`

| Field | Description |
|---|---|
| `text` | Content; may contain `{n}`, `{date}`, `{time}` and CSV column variables |
| `font` | `{ "family", "style", "path", "index" }` — `path` is the font file on the computer that created the project |
| `height`, `letterSpacing`, `lineSpacing`, `align`, `weld` | Layout |
| `onPath` | Optional `{ "pts", "closed", "offset", "distort"? }` path followed by the text (local coordinates); `distort` bends the letters along it |
| `paths` | Generated outline (local coordinates), used as-is if the font is unavailable |

### `image`

| Field | Description |
|---|---|
| `src` | Data URL of the original image |
| `width`, `height` | Size in local millimetres |
| `adjust` | `{ "brightness", "contrast", "gamma", "invert" }` |
| `mask` | Optional polylines (local coordinates, even-odd) limiting the engraved area |

## Other files

- **Material library export** (`.json`): `{ "format": "lumiere-materials", "version": 1, "presets": [ { "material", "thickness", "description", "settings" } ] }`
  where `settings` uses the layer cut fields.
- **G-code**: plain text, with `; Calque <name>` comments marking each layer.

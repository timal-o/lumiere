# Architecture

Lumière is a [Tauri 2](https://v2.tauri.app) desktop application:

- the **interface** (`src/`) is React + TypeScript, rendered in the system webview. It holds the
  document model, all geometry and editing, the importers and the job preparation;
- the **core** (`src-tauri/src/`) is Rust. It generates G-code, dithers images, talks to the
  controllers (serial, TCP, UDP), lists system fonts and builds the native menu.

The two sides communicate through Tauri commands (`invoke`) and events (`listen`). Large binary
payloads (dithering, fonts, files) use raw IPC bodies instead of JSON.

```
┌──────────────────────────── Interface (TypeScript) ────────────────────────────┐
│  UI components ──► actions.ts ──► store.ts (project, selection, undo history)  │
│        │               │                                                        │
│        │               ├── geometry, bezier, pathops (Clipper), nodeedit,       │
│        │               │   tools, text (opentype.js), trace, raster, camera     │
│        │               └── job.ts : project → Job (bed coordinates, mm)         │
└────────┼───────────────────────────────────┬───────────────────────────────────┘
         │ events (status, progress, menu)   │ invoke (generate_gcode, connect…)
┌────────┴───────────────────────────────────▼───────────────────────────────────┐
│  Core (Rust)   gcode.rs : Job → G-code + stats   dither.rs   fonts.rs          │
│                grbl.rs : streaming over serial/TCP   ruida.rs : UDP / .rd      │
│                menu.rs : native menu bar                                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Coordinate system

Everything is in **millimetres in bed coordinates**: origin at the top-left corner of the bed,
X to the right, Y down — the same orientation as the screen. Conversion to machine coordinates
happens only when G-code is written (`MachineSettings::to_machine` in Rust, `bedToMachine` in
TypeScript) according to the origin corner. That conversion is its own inverse, which is also
used to map machine positions back onto the canvas.

Each shape has an affine matrix `[a, b, c, d, e, f]` (`x' = a·x + c·y + e`,
`y' = b·x + d·y + f`) from its local coordinates to the bed. Moving, scaling, rotating and
mirroring only change the matrix.

## Document model (`src/model.ts`)

- **Project**: layers, shapes, notes. Serialised as-is in `.lum` files
  ([file-format.md](file-format.md)).
- **Layer**: an id (its index in the 20-colour palette), output/visibility flags, cut settings
  and optional sub-layers (more cut settings applied to the same shapes).
- **Shapes**:
  - `vector`: polylines (`paths`) plus optional Bézier curves (`curves`, the source of truth when
    present) and an optional parametric definition (`primitive`);
  - `text`: text, font reference and layout options; its outline is regenerated from the font
    when they change;
  - `image`: a data URL, its size in mm, adjustments and an optional mask.

`worldPaths(shape)` returns a shape's outline in bed coordinates. Curves are transformed first
and flattened afterwards (tolerance 0.01 mm), so precision does not depend on the scale.

## State and history (`src/store.ts`)

A small external store used through `useSyncExternalStore`. Project changes go through
`commit()` (with an undo point) or `checkpoint()` + `mutate()` for continuous drags. Settings
such as machine profiles, tool options, macros and text variables are persisted in
`localStorage`; the project itself is saved to files, with an autosave copy for recovery.

## From project to G-code

1. `actions.generate()` picks the shapes (all, or the selection), applies the print-and-cut
   alignment and computes the job-origin offset.
2. `job.ts / buildJob()` turns each output layer and sub-layer into a `JobLayer`:
   - vector modes: world paths, kerf offset, concentric fill rings, overlap removal, manual tabs;
   - image mode: each image is rendered on a grid of one pixel per scan interval, rotation and
     mask included, with adjustments applied (`raster.ts`);
   - rotary scaling and the job offset are applied last.
3. `gcode.rs / generate()` writes the G-code:
   - lines: contour ordering (inner shapes first, nearest neighbour), direction, start points,
     tabs, perforation, overcut, ramps, dot mode;
   - fills: even-odd scanlines in a frame rotated by the fill angle, per island when requested,
     bidirectional with overscan and scan offset;
   - images: dithering (`dither.rs`) then runs of equal power; sliced relief as repeated passes;
   - statistics: lengths, and a duration from a GRBL-like planner (junction deviation, forward
     and backward passes, trapezoidal profiles) when an acceleration is set.
4. The G-code is previewed (`toolpath.ts` parses it back) or streamed to the controller.

## Machine communication (`src-tauri/src/grbl.rs`)

One thread owns the link (serial port or TCP socket):
- outgoing lines are queued as *job*, *manual* or *silent* (automatic polling);
- GRBL uses character counting against its 128-byte receive buffer; Smoothieware and Marlin get
  one line per `ok`;
- status reports (`<Idle|MPos:…|FS:…|Ov:…>`, or `M114` on Marlin) are parsed and emitted as
  events, together with progress and console lines;
- real-time bytes (`?`, `!`, `~`, soft reset, overrides) bypass the queue.

The Ruida driver (`ruida.rs`) translates the generated G-code into the Ruida command stream and
sends it by UDP or writes a scrambled `.rd` file.

## Notable modules

| Module | Role |
|---|---|
| `bezier.ts` | Cubic paths, flattening, splitting, nearest point, arcs → cubics |
| `nodeedit.ts` | Pure node-editing operations (move, insert, break, join, fillet…) |
| `pathops.ts` | Offsets and booleans with Clipper 6 (integer micrometres) |
| `tools.ts` | Simplification, nesting (skyline), copy along path, convex hull, trim, SVG export |
| `text.ts` | System fonts, layout with kerning, welding, text on path, variables and CSV |
| `trace.ts` | Bitmap tracing: pixel-edge contours, simplification, smoothing |
| `camera.ts` | Homography, lens distortion, rectification of camera frames |
| `import/` | SVG (path parser → Bézier), DXF, HPGL |
| `ui/Workspace.tsx` | Canvas rendering and all pointer interactions |
| `menu.ts` / `menu.rs` | Native menu definition and dispatch of menu events |

## Testing

- TypeScript (`src/__tests__`, vitest): geometry, importers, node editing, Clipper operations,
  text layout (with a system font when available), job building, tools, camera maths.
- Rust (`cargo test`): G-code generation for every layer option, dithering, planner, GRBL and
  Marlin status parsing, font discovery, Ruida encoding.

UI interactions and hardware behaviour are not covered by automated tests.

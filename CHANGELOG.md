# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/) (pre-1.0: minor versions may break compatibility).

## [Unreleased]

## [0.6.1] — 2026-10-22

### Fixed
- 0.6.0 showed an empty window at start-up (the side-panel order setting made React loop); the job checklist had the same flaw.

### Added
- Open `.lum` and LightBurn projects from the Finder (file associations) or from the command line.

## [0.6.0] — 2026-10-22

### Added
- Multilingual interface: English, Spanish and Simplified Chinese alongside French, including the
  native menu bar, dialogs, notifications and controller messages. The language follows the
  system and can be changed in the *Language* menu or in *Edit → Settings…* (⌘,).
- One JSON file per language in `src/locales/`, discovered automatically; `npm run i18n` reports
  missing and unused strings and lists texts that bypass translation. CI fails on missing strings.
- *Edit → Settings…* (⌘,): language, speed unit, snapping and grid step.
- Align centres, distribute spaced or centred, move the selection to the page centre, a corner or
  an edge, select all shapes in the current layer, toggle side panels, reset the layout.
- README and user guide in English, French, Spanish and Simplified Chinese;
  [translating guide](docs/translating.md).

### Changed
- The menu bar follows the usual laser software layout: *File, Edit, Tools, Arrange, Laser Tools,
  Window, Language, Help*, with the matching item names and shortcuts (⌘U ungroup, ⇧⌘H / ⇧⌘V flip, ⌘W weld,
  ⌥X export, ⌥V paste in place, ⌘L / ⌘R / ⌘E / ⌘T / ⌘K drawing tools, ⇧⌘N nesting, ⇧⌘A zoom to
  selection). The material and art libraries moved to *Window* and lost their shortcuts.

- The rest of the usual laser software menus:
  - *File*: new window, recent projects and templates, save as template, import / export
    preferences with daily backups, bundles (devices, macros, material library), print at 1:1
    scale in black or in colour, save the camera background capture.
  - *Edit*: undo history, generate path from cut, close paths (with tolerance), reverse
    direction, more selections (open shapes set to fill, contained, smaller, circles), flash the
    current layer, replace an image.
  - *Tools*: triangle, pentagon, octagon, boolean assistant, cut shapes, adjust image, crop image.
  - *Arrange*: auto-group, mirror across a line, dock, move together, move and jog the laser,
    rubber band outline, push forward / backward one step, lock shapes.
  - *Laser Tools*: Print and Cut steps from the menu, taper warp.
  - *Window*: wireframe / filled and coarse / smooth view styles, toolbars, F12.
  - *Help*: license, support forum, feature requests, online documentation, usage data, bug
    report, support data, update check, debug log.
- Pages: several designs per project, as tabs above the workspace (layers are shared).
- Edit Hotkeys: every menu command's shortcut can be changed; ⌥-only shortcuts are shown in the
  menus and kept out of text fields.
- Two-point rotate/scale (⌘2), warp selection (4 points), deform selection (16 points).
- Dual star and star bulge, tangent circles to three circles, resize slots and tabs for a new
  material thickness, multi-file trace, refresh an image from its file.
- Inch units; layer context menu (enable / show / air assist for one, all, all but this, invert).
- Optimization settings: order by layer, group or priority, direction order, travel, start points,
  corners, direction, hide backlash.
- Cut settings: lead-in/out, start/end pauses, constant power per layer, fill angle increment,
  fill groups together, tab options; images: negative, Newsprint and Sketch modes, enhance and
  denoise, trace cutoff.
- Text options: upper case, vertical alignment, right-to-left, max width, variable offset,
  ignore empty variables, bake.
- Machine control: center finder, Z jog, go to position, test fire, saved positions, finish
  position, job repeat, framing per shape or continuous, start or save from the preview.
- Imports: PDF, STL 3D models as depth maps, Gerber and Excellon PCB files.
- PCB import wizard: several Gerber and drill files at once, roles and sides detected from the
  file names, copper inversion by the board outline, bottom layers mirrored.
- Settings: snap and click tolerances, arrow steps, auto-save delay, wheel direction, default font,
  visual grid, centre cross, full-screen cursor, import options.
- Device settings: home on connect, `$J` or `G0` jogging, `S` on every `G1`, G0 overscan,
  out-of-bounds warning, pointer offset, Z reverse / relative, start delay, job checklist,
  optional test-fire button.
- Layer *Make Default* / *Reset to Default*, dot width correction, select circles by size, round
  corners tool, art library files, named undo steps, center-line trace, editable arrays, image
  presets, shear handles.
- Fill ramp for stamps: power ramps down near the edges of filled shapes, optionally on the outer
  edge too.
- Material library link: a layer linked to a library entry follows its settings; entries can be
  replaced by the current layer's settings.
- Measure panel: shape size, nodes, lines, curves, perimeter and area; segment points, length,
  angle, arc centre and radius; measured distance; mm / inch toggle.
- Text on a path: *Distort* bends the letters along the curve.
- SHX fonts (AutoCAD single-line fonts, shapes and unifont formats) from a folder set in Settings.
- Lens calibration wizard: dot grid pattern, automatic dot detection and numbering, lens correction
  computed from several captures.
- Grid array options: centre-to-centre spacing, fill bed, row / column shift, shift by half, reverse,
  alternate mirroring, random orientation, grouping, variable text increment, non-virtual arrays.
- Preview: shade by power, invert, hide traversal moves, save as PNG.
- Variable text: start / end of the sequence, auto-advance toggle, previous / next / reset.
- Calibrate axis: steps per mm from a measured move, written to GRBL.
- Material library: import and export LightBurn `.clb` libraries.
- Open LightBurn projects (`.lbrn`, `.lbrn2`): layers and cut settings, shapes, groups, images; texts stay editable when their font is installed.
- Export to DXF (R12) and PDF / AI, besides SVG.
- Sub-layers can be cloned and named.
- Option to ignore shapes outside the bed.
- Side panels on the left or right, in a chosen order.
- Job counter with Stop At.
- 3D sliced images: cleanup pass every N slices.
- Profiles (complete preference sets); bundles carry all material libraries.
- Last known head position shown after disconnecting (option in Settings).
- Page setup: workpiece size per page.
- Console window with command history, clear and save.
- Appearance: theme, icon size, palette labels.
- Art libraries: several libraries, import files directly, thumbnail size.
- Several material libraries; merge with rules for duplicates.
- Material test: title, border, user presets with export / import.
- QR codes: Wi-Fi, contact, e-mail, phone and URL modes, centre logo; DataMatrix (ECC200); barcode text underneath.
- Trace: live preview (fade image, show points), sketch trace.
- Camera: image settings, calibration export / import, capture then trace.
- Rotary: roller or chuck, Y or A axis, mirrored output.
- Continuous jog, Z in saved positions, auto-focus G-code button.
- Machine: backlash compensation, swap X / Y, Z focus offset, DTR, read settings on connect, custom error codes.
- Tool layers T1 / T2 (never engraved); framing by bounds, hull or contour, tool layers only, image non-white area.
- Sort cuts last, global speed scale, elapsed / remaining time while running, job log export.
- Nesting: lock inner objects, overflow onto new pages; insert page, import pages.
- Text: bold / italic buttons, bend into an arc.
- Recover arcs and lines from segmented shapes.
- Generate Outline around shapes and images.
- Arrays: add to, remove from, duplicate.
- Numeric edits with a 3 × 3 reference point; offset both ways / outer shapes only; copy along path spacing; circular array start angle, step, centre from last selected, grouping; variable text increments.
- Cut settings: global passes, tabs by spacing with min / max, air assist only when cutting, copy to all layers.
- Beginner Mode: simpler interface with only the common cut settings.
- Camera alignment with 9 marks (least squares), undo last click.
- Scanning offsets by speed (interpolated table).
- New Device wizard with USB auto-detection of GRBL, Marlin and Smoothieware controllers.
- Flood Fill: fill layers scanned region by region.
- Switches to allow or block moving, rotating, scaling and shearing with the mouse.
- Import Adobe Illustrator (`.ai`, PDF-based or legacy PostScript) and EPS files, and OBJ / 3MF 3D models.

### Fixed
- *Edit → Undo* was shown as "Cancel" in English, Spanish and Chinese.
- The test grid dialog overflowed; the recovery prompt always formatted its date in French.

## [0.5.0] — 2026-10-20

First public version. Nothing has been validated on real hardware yet.

### Design
- Vector canvas with Bézier curves, selection, scale and rotation handles, snapping, rulers.
- Node editing: move, insert, delete, break, join, smooth/corner, line ↔ curve, start point.
- Parametric rectangle, ellipse, polygon and star; line/polyline tool; measure tool.
- Text with system fonts, welded script fonts, text on a path, variable text and CSV merge.
- Offset, weld, booleans, fillets/chamfers, trim, auto-join, simplify, delete duplicates.
- Arrays, copy along a path, nesting, alignment, distribution, groups, art library.
- QR codes and 1D barcodes.

### Import / export
- SVG, DXF, HPGL and bitmap import; SVG, G-code, processed bitmap and experimental Ruida export.
- `.lum` project format, autosave and recovery.

### Layers and engraving
- Line, fill, concentric fill and image modes; sub-layers; output order.
- Kerf, automatic and manual tabs, perforation, overcut, power ramps, dot mode, cut direction,
  start points, inner-first ordering, overlapping line removal.
- Fill angle, cross-hatch, per-shape fill; scan offset compensation.
- Image adjustments, masks, eight dithering modes including halftone, 3D sliced relief, tracing.
- Material library and configurable test grids (material, interval, focus).

### Machine control
- GRBL / FluidNC / grblHAL, Smoothieware and Marlin over USB serial or TCP.
- Streaming with live status, jog, homing, user origin, job origin with 9-point anchor.
- Framing (box, convex hull, low power), pause/resume/stop, speed and power overrides, macros,
  GRBL settings editor, explained error and alarm codes, external G-code files.
- Preview with per-layer colours, animated simulation, acceleration-aware time estimate.
- Camera overlay with perspective and lens calibration, print & cut, rotary, Z per pass.
- Experimental Ruida UDP driver.
- Native menu bar, machine profiles, keyboard shortcuts, built-in quick start guide.

[Unreleased]: https://github.com/timal-o/lumiere/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/timal-o/lumiere/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/timal-o/lumiere/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/timal-o/lumiere/releases/tag/v0.5.0

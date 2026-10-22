# User guide

[English](user-guide.md) · [Français](user-guide.fr.md) · [Español](user-guide.es.md) · [简体中文](user-guide.zh-CN.md)

Menu and button names below are those of the English interface. Change the language in the
*Language* menu or in
*Edit → Settings…* (⌘,).

- [Quick start](#quick-start)
- [The workspace](#the-workspace)
- [Drawing and editing](#drawing-and-editing)
- [Text, QR codes and barcodes](#text-qr-codes-and-barcodes)
- [Importing and exporting](#importing-and-exporting)
- [Layers and cut settings](#layers-and-cut-settings)
- [Images](#images)
- [Preview and time estimate](#preview-and-time-estimate)
- [Running a job](#running-a-job)
- [Camera](#camera)
- [Print and cut](#print-and-cut)
- [Production tools](#production-tools)
- [More menu commands](#more-menu-commands)
- [Keyboard shortcuts](#keyboard-shortcuts)

## Quick start

1. **Configure the machine** — *Laser Tools → Device Settings…*: bed size, origin corner, `S max`
   (GRBL `$30`), controller and acceleration.
2. **Connect** — in the *Laser* panel, choose *USB* or *Network*, pick the port or type the IP
   address, then *Connect*.
3. **Draw or import** — *File → Import…* (⌘I) or the tool palette on the left.
4. **Set the layer** — select shapes, click a colour in the palette below the *Layers* list, then
   set mode, speed and power.
5. **Check** — *Preview* (⌥P) shows the toolpath and the estimated time.
6. **Frame** — *Frame* moves the head around the job so you can check its position.
7. **Burn** — *Start*. *Stop* (⌘.) halts the controller immediately.

> [!CAUTION]
> Lasers are dangerous, and every machine is different. Start with a test without material, at
> low power, and never leave the machine unattended.

## The workspace

| Area | Contents |
|---|---|
| Menu bar | *File, Edit, Tools, Arrange, Laser Tools, Window, Language, Help* |
| Top toolbar | Undo/redo, position and size of the selection (X, Y, W, H, lock ratio, rotation), *Preview*, *Export G-code* |
| Arrange bar | Rotate, mirror, align, distribute, group, centre, duplicate, delete, snapping; options of the active drawing tool |
| Tool palette | Selection, nodes, measure, trim, tabs, position laser, line, rectangle, ellipse, polygon, star, text |
| Canvas | The bed (grid every 10 mm), machine origin (orange dot), laser head (red cross), rulers |
| Right panels | *Properties*, *Layers*, *Laser* |

Coordinates are in millimetres from the **top-left corner of the bed**. Lumière converts them to
machine coordinates according to the origin corner of the machine profile.

**Units**: *Edit → Settings…* switches every length, speed and the rulers to inches (projects stay in millimetres).

**Navigation**: wheel or pinch to zoom, two-finger scroll / Space+drag / right-drag to pan, `F` to
fit the bed, ⌘= / ⌘- to zoom, ⌘0 to zoom to the page, ⇧⌘A to zoom to the selection.

**Snapping**: *Objects* snaps to corners, centres and nodes of other shapes, *Grid* to a grid of
the chosen step. Hold ⌥ while dragging to ignore snapping.

## Drawing and editing

### Selection (V)
- Click to select, Shift+click to add or remove, drag on empty space for a selection box.
- Drag to move (Shift constrains horizontally or vertically); arrow keys move by 1 mm (Shift: 10 mm).
- Corner handles scale proportionally (Shift: free), edge handles scale one axis.
- **Click again on a selected shape** to show rotation handles; Shift rotates in 15° steps.

### Shapes
- *Rectangle (R), Ellipse (E), Polygon (P), Star (S)*: drag to draw, Shift for a square or circle.
  Corner radius, sides and points stay editable in *Properties* until the nodes are edited.
- *Line / polyline (L)*: click to add points, double-click or Enter to finish, click the first
  point to close, Esc to cancel.

### Edit nodes (N)
Select a vector shape, then drag nodes or handles (⌥ breaks a smooth node's symmetry), drag on
empty space to select several nodes, double-click a segment to insert a node. Hover a node or a
segment and press **D** delete, **I** insert, **B** break, **L** line, **C** curve, **S**
smooth/corner, **J** join two selected ends, **P** start point. Arrow keys move the selected
nodes by 0.1 mm (Shift: 1 mm). Texts must first be converted (*Edit → Convert to Path*, ⇧⌘C).

### Geometry (*Tools* and *Arrange* menus)
| Item | Effect |
|---|---|
| *Tools → Offset Shapes…* (⌥O) | Outward or inward, with round, sharp or chamfered corners |
| *Tools → Weld Shapes* (⌘W) and booleans (⌥+, ⌥-, ⌥*) | Union, subtract (first selected minus the others), intersection, exclusion |
| *Tools → Fillets and chamfers…* | All corners, or only the nodes selected in node mode |
| *Arrange → Grid / Array…* (⌥A), *Circular Array…* | Copies in a grid or around a centre |
| *Arrange → Copy Along Path…* | Copies along the last selected shape, optionally following its tangent |
| *Arrange → Nesting…* (⇧⌘N) | Packs shapes on the bed (groups stay together), optional 90° rotation |
| *Trim Shapes* tool (⌘K) | Click a segment to delete it up to the nearest intersections |
| *Add Tabs* tool | Click an outline to add a tab, Shift+click to remove it |

The *Edit* menu also has *Auto-Join Selected Shapes…* (⌥J), *Optimize Selected Shapes…* (⌥⇧O),
*Delete Duplicates* (⌥D), *Select Open Shapes*, *Select All Shapes in Current Layer*,
*Invert Selection* and *Convert to Bitmap…* (⇧⌘B). Offsets, booleans and simplification produce
point-based outlines (no Bézier curves).

### Arrange
Group (⌘G), ungroup (⌘U), flip horizontal / vertical (⇧⌘H / ⇧⌘V), rotate 90° (`;` and `,`), align,
distribute (spaced or centred), *Move Selected Objects* (page centre, corners, edges), break apart
(⌥B), combine (⌥C), push to front / back (⇧⌘↑ / ⇧⌘↓).

## Text, QR codes and barcodes

- *Text (T)*: click on the canvas, then type in the *Text* panel: font, style, height, letter and
  line spacing, alignment. *Weld letters* (on by default) merges overlapping glyphs of script fonts.
- **Text on a path**: select a text and a path, then *Tools → Apply Path to Text*; *Start on path*
  moves it along the path.
- **Variable text**: `{n}` serial number, `{date}`, `{time}`. Set the current number, the
  increment per job and the digits in the *Text* panel. *CSV merge…* loads a CSV file: each
  column becomes `{Column name}` and the row advances after each job.
- *Tools → Create Bar Code…* and *Create QR Code…* create vector codes; put them on a *Fill* layer.

## Importing and exporting

| Format | Import | Export |
|---|---|---|
| SVG | Paths and shapes with transforms and units, one layer per stroke colour. Texts and `<use>` are skipped. | *File → Export…* (⌥X) (curves kept); also DXF and PDF / AI |
| DXF (ASCII) | Lines, arcs, circles, ellipses, polylines with bulges, splines; segments joined automatically | — |
| HPGL (`.plt`) | PU/PD/PA/PR, one layer per pen | — |
| PNG, JPEG, BMP, GIF, WebP | 0.1 mm per pixel, scaled to fit the bed | *File → Save Processed Bitmap…* |
| G-code | *Laser Tools → Run a G-code file…* | *File → Save G-code…* |
| Ruida `.rd` | — | *File → Export for Ruida…* (experimental) |
| PDF | Vector paths of the first page, one layer per colour (texts and images are skipped) | — |
| STL (3D model) | Converted to a depth map image (view, resolution, width, depth cutoff, equalize, invert) for *3D relief: slices* | — |
| Gerber, Excellon | Copper, silkscreen, mask and outline layers as filled outlines (put them on a *Fill* layer); drill holes as circles | — |
| AI, EPS | Illustrator files (PDF-based or legacy PostScript) and EPS: vector paths, one layer per colour (texts and images skipped) | — |
| OBJ, 3MF (3D models) | Converted to a depth map image, like STL | — |

Files can be dropped onto the window. Projects are `.lum` files ([format](file-format.md)); an
automatic copy is offered for recovery if the app closes with unsaved changes.

## Layers and cut settings

Each palette colour is a layer. Clicking a colour assigns the selection to it (or sets the layer
of new shapes). The list shows the burn order (▲▼), *Output* and *Visible* toggle each layer.

**Modes**: *Line* (outlines), *Fill* (scan lines inside closed shapes; interval, overscan,
bidirectional, angle, cross-hatch, *Fill each shape separately*), *Offset fill* (concentric
outlines), *Image*.

**Line options**: *Kerf*, *Tabs*, *Overcut*, *Ramp* / *Ramp start*, *Contour direction*,
*Cut inner shapes first*, *Keep start points*, *Remove overlapping lines*, *Dot mode*,
*Perforation*. With a motorised Z axis: *Z offset* and *Step down/pass*.

**Sub-layers**: the *+* tab adds another setting applied to the same shapes (e.g. fill then
outline).

**Material library** (*Window → Material Library…*): save the current layer's settings by material and thickness, apply
them later, import and export as JSON.

**Test grids**: *Laser Tools → Material Test…* (also *Interval Test…* and *Focus Test…*) varies two parameters among power, speed, interval,
passes and Z offset, with engraved labels; presets cover material, interval and focus tests.

**More cut settings**: lead-in and lead-out (line or arc, outward or inward), pauses at the start and end of each path with their own power (cut-through mode), *Constant Power Mode (M3)* per layer, fill angle increment per pass, *Fill Groups Together*, tabs skipped on inner shapes and *Tab Cut Power* (partial cut). For images: *Negative Image*, *Newsprint* and *Sketch* modes, and in the image panel *Enhance Amount*, *Enhance Radius* and denoise.

**Layer menu**: right-click a layer to enable, show or set air assist for one layer, all of them, all but this one, or invert; move or delete a layer.

## Images

Imported images go to an *Image* layer. In the *Image* panel: brightness, contrast, gamma,
invert, *Trace…*, *Save processed bitmap…*. *Tools → Apply Mask to Image* keeps only the part
inside a closed shape. In the layer: *Interval* (resolution), *Dithering* (threshold, ordered,
Floyd-Steinberg, Jarvis, Stucki, Atkinson, halftone, grayscale) and *3D relief: slices*.

## Preview and time estimate

*Preview* (⌥P) draws the job: cuts in their layer colour, travel moves in grey. The bar shows the
estimated time (also per layer), cut and travel lengths, a slider and a play button. The estimate
models acceleration like GRBL's planner when an acceleration is set in the machine profile.

## Running a job

The *Laser* panel contains the connection, status and position, the jog pad, *Home ($H)*,
*Unlock ($X)*, *Go to selection*, and:
- **Start from**: *Absolute coordinates*, *Current position* (the anchor point goes to the head)
  or *User origin* (set with *Set origin here*); the 3×3 grid selects the anchor point;
- *Frame* along the bounding box or the outline (*Tight frame*), optionally with the laser on;
- *Start, Pause, Stop*, *Selection only*; speed and power overrides while the job runs;
- macros and a console; GRBL errors and alarms are explained.

The *Position laser* tool moves the head to the clicked point.

**Optimization Settings** (*Laser Tools* or the *Laser* panel): order by layer, by group or by shape priority (set in *Properties*), cut in direction order, reduce travel moves, best starting point (corners if possible), best direction, hide backlash.

**More machine control** in the *Laser* panel: Z jog, *Go* to an X/Y position and *Get Position*, test *Fire* while the button is held, saved positions, *Set Finish Position*, *Repeat* the job several times, frame each shape individually or continuously. *Laser Tools → Center Finder…* finds the centre of a round object from three points on its edge. In the preview, *Start here* and *Save from here…* resume a job at the point shown.

## Camera

*Laser Tools → Manage Cameras…*: choose the camera, *Burn the target*, click the four
crosses in the order shown, adjust *Lens correction*, *Save calibration*, then *Update image* to
show the corrected view under the design. The camera must not move relative to the bed.

**Lens calibration wizard** (in the camera dialog): add a grid of solid dots to the project and engrave it (or print it), lay it under the camera, capture it several times in different positions, then *Calculate correction*: the lens correction is set automatically. Afterwards, redo the four marks and save the calibration.

**9-mark alignment**: in the camera dialog, choose *9 marks* to engrave and click a 3 × 3 grid of crosses; the alignment is fitted by least squares, which averages out click errors. *Undo Last* removes the last click.

**Camera image and files**: *Camera image settings* shows the brightness, contrast, exposure, white balance, focus and zoom controls the camera offers; the calibration can be exported and imported as a file; *Capture then Trace* adds the straightened capture to the project and opens the trace window.

## Print and cut

*Laser Tools → Print and Cut → Start Wizard…*: select two marks in the design, jog the laser onto each mark of the real
piece and record it, then *Apply*. The job is rotated, scaled and moved to match until the
alignment is disabled.

## Production tools

- **Machine profiles**: several machines with their own bed, origin, controller, connection,
  rotary, scan offset, start/end G-code and air assist command.
- **Macros**: buttons of the *Laser* panel that send G-code lines.
- **GRBL settings ($$)**: read, edit and write the controller settings; copy bed size, `S max`,
  speeds and acceleration into the machine profile.
- **Project notes**, **Art library** (*Window → Art Library…*), **Rotary** (*Laser Tools → Rotary Setup…*, with
  *Start from: Current position*).

## More menu commands

| Menu | Commands |
|---|---|
| *File* | *New Window*; *Recent Projects* and *Recent Templates*; *Save As Template…* (a template opens as a new untitled project); *Preferences*: import, export, load a backup (one is made each day); *Bundles*: devices, macros and material library in one file; *Print (Black Only)…* (⌘P) or *(Keep Colors)…* (⇧⌘P), at 1:1 scale; *Save Background Capture…* (camera); *Preferences* → *Edit Hotkeys…*: change any shortcut |
| *Edit* | *Undo History…*; *Generate Path from Cut* (turns the computed toolpath into shapes); *Close Path*, *Close Selected Paths With Tolerance…*; *Reverse Shape Direction*; select open shapes set to fill, contained shapes, shapes smaller than the selection, circles; *Flash Shapes in Current Layer*; *Image options*: replace the image (same scale, or to fit); *Refresh Image* reloads an image from its file |
| *Tools* | Triangle, pentagon, octagon; *Boolean Assistant…* (⌘B); *Cut Shapes* (⌥⇧C): the last selected shape splits the others into inside and outside parts; *Adjust Image…* (⌥I); *Crop Image* to another selected shape; *Dual Star*; *Warp Selection (4 points)* and *Deform Selection (16 points)*: drag the handles, Enter applies; *Resize Slots in Selection…* (slots or tabs, for a new material thickness); *Generate Tangent Circle* (circles tangent to three selected circles); *Multi-File Trace Image…* |
| *Arrange* | *Auto-Group* (shapes with the shapes inside them); *Mirror Across Line* (⇧⌘M, the line is selected last); *Dock* against the nearest shape or the bed edge; *Move H-Together* / *V-Together* (⌥⇧H / ⌥⇧V); *Move Laser to Selection* and jog (⌥⌘ arrows); rubber band outline; push forward / backward one step (⌘↑ / ⌘↓); lock and unlock shapes (a locked shape cannot be moved); *Two-Point Rotate / Scale* (⌘2): click the centre, a reference point, then its new position (Shift also scales) |
| *Laser Tools* | *Print and Cut* steps (⌥0 to ⌥4) and reset; *Taper Warp…* for tapered rotary objects |
| *Window* | *View Style*: wireframe or filled, coarse or smooth (⌥⇧W); toggle side panels (F12) and each toolbar; *Pages*: tabs above the workspace to keep several designs in one project (layers are shared, the job uses the page shown) |
| *Help* | License, support forum, feature request, online documentation, usage data (none is collected), bug report, support data file, update check, debug log |

## More editing and machine options

- **Settings** (⌘,): snap and click tolerances, arrow-key steps, auto-save delay, select new shapes after drawing, mouse-wheel direction, default font and height, visual grid, centre cross, full-screen cursor, import centring and grouping, SVG DPI, HPGL precision.
- **Device settings** (*Laser Tools*): home on connect, jog with `$J` or `G0`, `S` on every `G1`, G0 overscan, warning when the job leaves the bed, red-dot pointer offset, reversed or relative Z, start delay, a checklist shown before each job, and an optional test-fire button.
- **Layers**: *Make Default* / *Reset to Default* in the layer menu; *Dot Width Correction* for fills; *Edit → Select Circles by Size…*.
- **Round Corners** tool: click a corner to round it (Shift: chamfer), the radius is in the options bar.
- **Art library**: import and export libraries as files.
- **Undo History** names each step (the menu command, or move / resize / rotate / edit nodes).
- **Trace**: *Center line* mode follows the middle of dark strokes (line art, handwriting).
- **Editable arrays**: grid and circular arrays stay linked to their source; *Edit Array* changes them, *Flatten Array* turns them into ordinary shapes.
- **Image presets**: built-in starting points and your own presets for an image and its layer settings.
- **Fill ramp** (stamps): on a *Fill* layer, *Ramp* lowers the power near the edges for sloped sides; *Ramp Outer Edge* also ramps the outermost outline (leave it off for stamps so the frame stays sharp).
- **Library link**: in the material library, *Link* ties the current layer to an entry; its settings become read-only and follow the library (also when a project is opened). ↻ replaces an entry with the current layer's settings, and every linked layer follows. *Unlink* in the layer makes it editable again.
- **Measure** (M): a panel shows the shape under the cursor (or the selected shape): size, nodes, lines, curves, open or closed, perimeter, area; the segment under the cursor: start and end points, length, angle, and the centre and radius of a curve; while dragging, the measured distance. Its unit button switches between mm and inches.
- **Distort** (text on a path): bends the letters so they follow the curve instead of only turning each one.
- **SHX fonts**: choose a folder of AutoCAD `.shx` fonts in *Settings*; they appear in the font list. They are single-line fonts (open strokes), ideal for fast engraving on a *Line* layer. Big fonts (Asian) are not supported.
- **Grid array options**: spacing between edges or centre to centre, fill the bed width / height, X shift per row and Y shift per column, shift by half, reverse direction, mirror alternate rows or columns, random orientation, group results, variable text increment per copy, and *Create Virtual Array* (off: plain copies).
- **Preview options**: *Shade according to power*, *Invert* (white on black, to judge image engraving), show or hide *Traversal moves*, and *Save Image…* (Shift: transparent background).
- **Variable text sequence**: *Start* and *End* (the number goes back to the start after the end), *Auto-Advance* after each job, ◀ / ▶ to step back or forward, *Reset*.
- **Calibrate Axis** (in *GRBL settings*): enter the distance requested and the distance actually moved; the new steps per mm ($100 / $101 / $102) is computed and written to the controller.
- **LightBurn libraries**: the material library imports LightBurn `.clb` files (speeds are converted from mm/s, entries with several cut settings become sub-layers) and exports to `.clb`.
- **LightBurn projects**: *File → Open* (or drag and drop) reads `.lbrn` and `.lbrn2` files: layers with their cut settings, rectangles, ellipses, polygons, stars, paths, groups, images, and texts: editable when their font is installed, otherwise as curves (from the path LightBurn saves with them). Saving writes a Lumière project.
- **Export formats**: *File → Export…* writes SVG, DXF (R12, one DXF layer per layer) or PDF / AI (PDF-compatible), chosen by the file type. Curves are flattened in DXF and PDF; images are only exported in SVG.
- **Drag switches** (right of the arrange bar): ✥ move, ⟳ rotate, ⤡ scale, ▱ shear. Turn one off to stop the mouse from doing it by accident; numeric edits still work.
- **Flood Fill** (Fill layers): each region is scanned completely before the nearest next one, instead of sweeping across the whole design line by line — much less travel on letters and scattered shapes.
- **Sub-layers**: ⧉ clones the setting shown (main layer or sub-layer) into a new sub-layer; a sub-layer can be named, and its tab shows the name.
- **Find My Laser** (*Laser Tools*, or *Wizard…* in the machine settings): searches the USB ports for a GRBL, Marlin or Smoothieware controller, reads its work area and `S` max, then asks for a name, the origin corner and auto-homing. Network and Ruida devices are set up by hand in the same wizard.
- **Scanning offsets by speed** (machine settings): a table of speeds and offsets for bidirectional scanning, interpolated for each layer's speed; the single scan offset applies when the table is empty.
- **Beginner Mode** (*Window* menu or *Settings*): the cut settings only show the common options (mode, speed, power, passes, interval, angle, air assist), and sub-layer tabs, layer defaults and the drag switches are hidden. Hidden settings keep their values.
- **More cut options**: *Global Passes* repeats a layer and its sub-layers together; tabs by spacing with a minimum and maximum per shape; *Air assist only when cutting* (off during travel); *Copy to All Layers*.
- **Arrange options**: the X / Y fields use a 3 × 3 reference point (also used when resizing); *Offset Shapes* can go both ways and work on outer shapes only; *Copy Along Path* has a fixed spacing and a variable text increment; *Circular Array* has a start angle, an editable step, a centre taken from the last selected shape, grouping and a variable text increment.
- **Array editing** (*Arrange*): *Add to Array* (select the array and the new shapes), *Remove from Array* (select original shapes), *Duplicate Array*.
- **Generate Outline** (*Tools*): an outline without holes around the selection, at a given distance; images follow their non-white pixels (cut-out stickers).
- **Recover Arcs and Lines** (*Edit*): replaces shapes made of many small segments (DXF, PDF, traces) with straight lines and true circular arcs, editable by nodes.
- **Text style and bend**: *B* and *I* switch to the bold and italic styles of the font; *Bend* curves the text into an arc (up to a full circle, up or down).
- **Nesting and pages**: nesting keeps inner shapes with the shape around them and can put what does not fit on new pages; the page bar can insert a page after the current one (↳) and import the pages of another project (⇩).
- **Job output**: *Sort cuts last* (optimization settings) runs Line layers after engraving; *Global Speed Scale* (machine settings) scales every layer's speed; while a job runs, the Laser panel shows the elapsed and estimated remaining time; *Laser Tools → Export Job Log…* saves the history of jobs (start, duration, lines, errors) as CSV.
- **Tool layers and framing**: *T1* and *T2* (after the colour palette) are tool layers, never engraved — for guides and framing. In the Laser panel, *Framing* follows the bounds, the hull (rubber band) or the contour of the shapes; *Tool Layers Only* frames only T1 / T2 shapes; *Images: non-white area* frames only the inked part of images.
- **More machine options**: backlash compensation in X and Y, swap X / Y output, Z focus offset, DTR signal on connect, read the GRBL settings ($$) on connect, and custom error / alarm descriptions.
- **Move panel**: *Continuous Jog* moves while an arrow is held (stops on release, up to the bed edge); saved positions keep Z on machines with a Z axis; an *Auto-focus* button runs the focusing G-code set in the machine settings.
- **Rotary types**: roller (roller diameter) or chuck (object diameter), on the Y axis (mm per rotation) or the A axis (degrees), with mirrored output.
- **Trace window**: a live preview shows the result over the image (*Fade Image*, *Show Points*); *Sketch Trace* traces the edges of a photo as lines.
- **QR codes and barcodes**: QR codes can hold a Wi-Fi network, a contact, an e-mail, a phone number or a web address (filled in field by field); 1D barcodes can show their text underneath; a QR code can carry an SVG logo in its centre; the same window also makes DataMatrix codes (ECC200).
- **Material test**: an engraved title, a border cut last (with its own power and speed), and your own presets (save, delete, export, import).
- **Several material libraries**: open a file as a new library, switch between libraries, rename or unload them; *Merge…* adds a file to the current library with a rule for duplicates (keep, replace, rename the new or the original entry). Linked layers find their entry in any loaded library.
- **Art libraries**: several libraries can be loaded, renamed and unloaded; *Import Files…* adds SVG, DXF, PDF or image files directly (one item per file); a slider sets the thumbnail size.
- **Appearance** (*Settings*): light, dark or system theme; toolbar icon size; layer numbers on the palette buttons.
- **Console window** (*Window → Console…*): a larger console with command history (↑ / ↓), clear and save.
- **Page setup** (⚙ in the page bar): the workpiece size of each page and its corner on the bed, shown as a dashed rectangle.
- **Profiles** (*File → Preferences → Profile Manager…*): complete sets of preferences (devices, libraries, shortcuts, settings) — for example one per workshop or per user; switching restarts the interface. Bundles now carry all material libraries.
- **3D relief cleanup**: with *3D relief: slices*, a cleanup pass every N slices goes over the area already dug (or the whole image) to even out the bottom.
- **Job counter** (Laser panel): counts completed jobs; *Stop At* blocks *Start* once the count is reached, for series production.
- **Panel layout** (*Settings*): the side panels can sit on the left or right of the window, in the order you choose (▲ moves a panel up).
- **Out-of-bounds shapes**: *Settings → Ignore Out-of-Bounds Shapes* leaves shapes entirely outside the bed out of the job.
- **Shear**: in rotate mode (click the selection again), the side handles shear it.
- **PCB import** (*File → Import PCB…*): add the Gerber and drill files of a board; each file's role (copper, silkscreen, mask, paste, outline, drill) and side are detected from its name. Options: invert the copper using the board outline (isolation engraving), mirror the bottom layers, put copper, silkscreen and mask on *Fill* layers. Each file gets its own layer, and the board is centred on the bed.

## Keyboard shortcuts

The full list is in *Help → Keyboard shortcuts* (⌘/).

| Keys | Action |
|---|---|
| V, N, M, L, R, E, P, S, T | Selection, nodes, measure, line, rectangle, ellipse, polygon, star, text |
| ⌘L, ⌘R, ⌘E, ⌘T, ⌘K | Draw lines, rectangle, ellipse, text, trim shapes |
| ⌘N, ⌘O, ⌘S, ⇧⌘S | New, open, save, save as |
| ⌘I, ⌥X, ⇧⌘E | Import, export, save G-code |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⌘C, ⌘X, ⌘V, ⌥V, ⌘D | Copy, cut, paste, paste in place, duplicate |
| ⌘G, ⌘U | Group, ungroup |
| ⇧⌘H, ⇧⌘V, `;`, `,` | Flip horizontal, flip vertical, rotate 90° clockwise, counter-clockwise |
| ⌘W, ⌥+, ⌥-, ⌥* | Weld, union, subtract, intersection |
| ⌥O, ⌥A, ⇧⌘N, ⌥B, ⌥C, ⌥J, ⌥D | Offset, array, nesting, break apart, combine, auto-join, delete duplicates |
| ⌥P, ⌘0, ⇧⌘A | Preview, zoom to page, zoom to selection |
| ⌘, | Settings |
| ⌘. | Stop the laser |

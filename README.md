<p align="center">
  <img src="docs/assets/banner.svg" alt="Lumière — open-source laser engraving and cutting software" width="100%">
</p>

<p align="center">
  <a href="https://github.com/timal-o/lumiere/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/timal-o/lumiere?style=flat-square&color=ff5a36&label=release"></a>
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-2ea44f?style=flat-square"></a>
  <a href="https://github.com/timal-o/lumiere/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/timal-o/lumiere/ci.yml?style=flat-square&label=CI"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square">
  <a href="https://github.com/timal-o/lumiere/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/timal-o/lumiere/total?style=flat-square&color=blue"></a>
  <a href="https://github.com/timal-o/lumiere/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/timal-o/lumiere?style=flat-square&color=f5a524"></a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-core-000000?style=flat-square&logo=rust&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-UI-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="Tests" src="https://img.shields.io/badge/tests-226%20passing-2ea44f?style=flat-square">
  <img alt="Languages" src="https://img.shields.io/badge/UI-EN%20%C2%B7%20FR%20%C2%B7%20ES%20%C2%B7%20%E4%B8%AD%E6%96%87-8a63d2?style=flat-square">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.fr.md">Français</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <b>Draw it, frame it, burn it.</b> A complete, modern and free workflow for diode and CO₂ lasers —<br>
  from the first sketch to the last pass, in one fast desktop app you can read, fix and extend.
</p>

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="Lumière: a coaster and a QR label on the workspace, with the layers panel" width="92%">
</p>

| 🎯 | **What you get** |
|:-:|---|
| 🖊️ | A real vector editor — Bézier curves, node editing, booleans, offsets, arrays, nesting |
| 🔥 | Every cut setting you expect — fill, line, image, flood fill, ramps, tabs, lead-ins, sub-layers |
| 🔌 | Direct control of **GRBL**, **Marlin** and **Smoothieware** over USB or network |
| 📂 | Opens **SVG · DXF · AI · EPS · PDF · HPGL · Gerber · STL · OBJ · 3MF** and **LightBurn** projects |
| 🌍 | Interface in **English, Français, Español, 简体中文** — a new language is a single JSON file |
| 🆓 | **GPL-3.0** — no licence key, no subscription, no telemetry |

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🖊️ Design
- Bézier curves with full node editing
- Rectangle, ellipse, polygon, star, dual star — kept parametric
- Weld, subtract, intersect, exclude, boolean assistant
- Offset (in, out, both), fillets, chamfers, round-corner tool
- Grid & circular arrays — virtual and editable
- Copy along path, nesting (multi-sheet), mirror across a line
- Warp, deform, shear, two-point rotate/scale
- Generate outline around shapes and images
- Recover arcs and lines from segmented imports

</td>
<td width="50%" valign="top">

### 🔤 Text & codes
- System fonts and AutoCAD **SHX** single-line fonts
- Text on a path (with letter distortion), bend into an arc
- Variable text: serial numbers, date, time, **CSV merge**
- **QR codes** (Wi-Fi, contact, e-mail, URL, centre logo)
- **DataMatrix** ECC200
- 1D barcodes: Code 128, Code 39, EAN, UPC, ITF-14, Codabar

</td>
</tr>
<tr>
<td valign="top">

### 🔥 Layers & cut settings
- Line, fill, offset fill and image modes, with sub-layers
- Flood fill, cross-hatch, angle increment per pass
- Kerf, tabs (manual or by spacing), perforation, overcut
- Power ramps, stamp ramps, lead-in/out, cut-through pauses
- Global passes, constant power (M3), air only while cutting
- Material libraries — and LightBurn `.clb` import/export
- Material, interval and focus test grids with presets

</td>
<td valign="top">

### 🖼️ Images
- Dithering: threshold, ordered, Floyd–Steinberg, Jarvis, Stucki, Atkinson, halftone, newsprint, sketch, grayscale
- Brightness, contrast, gamma, enhance, denoise, negative
- 3D relief from slices, STL / OBJ / 3MF depth maps
- Trace with live preview: outline, centre line, sketch
- Masks, crop, image presets

</td>
</tr>
<tr>
<td valign="top">

### 🎛️ Machine control
- USB serial or TCP, auto-detection of the controller
- Jog (step or continuous), homing, user origin, saved positions
- Framing: bounding box, hull or contour, laser on or off
- Live speed / power overrides, pause, resume, stop
- Toolpath preview with time estimates that model acceleration
- Start from any point of the preview
- Rotary (roller or chuck, Y or A axis), Z per pass, backlash compensation

</td>
<td valign="top">

### 🏭 Production
- Camera overlay with lens calibration and 9-mark alignment
- Print & cut, center finder, taper warp
- Job counter, job log, pre-job checklist
- Pages, art libraries, macros, profiles, bundles
- Beginner mode, light & dark themes, editable shortcuts
- Exports SVG, DXF, PDF/AI, G-code and Ruida `.rd`

</td>
</tr>
</table>

> **Coming from LightBurn?** Lumière uses the same menu layout, the same names and the same
> shortcuts, opens your `.lbrn` / `.lbrn2` projects (layers, settings, shapes, editable text) and
> imports your `.clb` material libraries.

<p align="center">
  <img src="docs/assets/screenshot-light.png" alt="Lumière in the light theme" width="80%">
</p>

## 🚀 Quick start

**Download** — the easiest way is the website: **[timal-o.github.io/lumiere](https://timal-o.github.io/lumiere/)** picks the right installer for your computer. All files are also on the [Releases](https://github.com/timal-o/lumiere/releases) page.

| 🪟 Windows | 🐧 Linux | 🍎 macOS |
|:-:|:-:|:-:|
| `.msi` · `.exe` | `.deb` · `.rpm` · `.AppImage` | `.dmg` (Apple Silicon · Intel) |

> [!NOTE]
> **Mac:** the app is not notarized by Apple yet, so recent macOS versions call the downloaded `.dmg` “damaged”.
> Install with one line in Terminal instead — it downloads the right version and opens it:
> ```sh
> curl -fsSL https://timal-o.github.io/lumiere/install.sh | bash
> ```

**Build from source** — you need [Node.js](https://nodejs.org) 18+, [Rust](https://rustup.rs) (stable)
and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
git clone https://github.com/timal-o/lumiere.git
cd lumiere
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # build an installer (.dmg, .msi, .deb / .AppImage)
```

Then: **Laser Tools → Find My Laser…** to set up your machine, draw or import a design, pick a
layer, **Frame**, **Start**. The [quick start guide](docs/user-guide.md#quick-start) walks through it.

## 🔌 Hardware

| Controller | Connection | Status |
|---|---|---|
| **GRBL 1.1**, FluidNC, grblHAL | USB serial, TCP | ✅ Used for real engraving and cutting jobs |
| **Smoothieware** | USB serial, TCP | 🧪 Implemented and unit-tested, awaiting hardware reports |
| **Marlin** (laser mode) | USB serial, TCP | 🧪 Implemented and unit-tested, awaiting hardware reports |
| **Ruida** (CO₂ DSP) | UDP, `.rd` file | ⚠️ Experimental |
| Galvo (EZCad / JCZ) | — | 🗺️ Planned |

> [!WARNING]
> Lasers are dangerous. Wear the right eye protection, never leave a running job unattended and
> keep a fire extinguisher nearby. Test new settings at low power first.

Tested Lumière on a machine that is not listed? [Tell us how it went](docs/hardware.md) — hardware
reports are the most valuable contribution right now.

## 📂 File formats

| | Formats |
|---|---|
| **Open** | `.lum` (Lumière), `.lbrn` / `.lbrn2` (LightBurn) |
| **Import vectors** | SVG, DXF, AI, EPS, PDF, HPGL / PLT, Gerber (RS-274X) + Excellon drills |
| **Import images** | PNG, JPEG, BMP, GIF, WebP |
| **Import 3D** | STL, OBJ, 3MF → depth map |
| **Export** | SVG, DXF (R12), PDF / AI, G-code, processed bitmap, Ruida `.rd` |
| **Libraries** | Materials (`.json`, LightBurn `.clb`), art, image and test presets, bundles |

## 📚 Documentation

| | |
|---|---|
| 📖 [User guide](docs/user-guide.md) | Every tool and menu — also in [Français](docs/user-guide.fr.md), [Español](docs/user-guide.es.md), [简体中文](docs/user-guide.zh-CN.md) |
| 🔧 [Hardware setup](docs/hardware.md) | Controllers, connection, GRBL settings, safety |
| 🌍 [Translating](docs/translating.md) | Add a language with one JSON file |
| 🏗️ [Architecture](docs/architecture.md) | How the code is organised and how a job is generated |
| 🗂️ [File format](docs/file-format.md) | The `.lum` JSON schema |
| 🛠️ [Development](docs/development.md) | Building, testing, releasing |

## 🗺️ Roadmap

- [x] Vector editor, layers, cut settings, image engraving
- [x] GRBL / Marlin / Smoothieware control, camera, print & cut, rotary
- [x] LightBurn projects and libraries, PCB, 3D depth maps
- [ ] Hardware reports for Marlin and Smoothieware
- [ ] Galvo lasers (EZCad2 / JCZ)
- [ ] Signed and notarized installers, automatic updates
- [ ] More interface languages — [contributions welcome](docs/translating.md)

## 🤝 Contributing

Bug reports, hardware results, translations and pull requests are all welcome — start with
[CONTRIBUTING.md](CONTRIBUTING.md). Please follow the [code of conduct](CODE_OF_CONDUCT.md) and
report security issues privately as described in [SECURITY.md](SECURITY.md).

<p align="center">
  <a href="https://star-history.com/#timal-o/lumiere&Date">
    <img src="https://api.star-history.com/svg?repos=timal-o/lumiere&type=Date" alt="Star history" width="70%">
  </a>
</p>

## 📄 License

Lumière is free software under the [GNU General Public License v3.0](LICENSE): use it, study it,
change it and share it — modified versions you distribute stay under the same licence.

<sub>Lumière is an independent project. It is not affiliated with or endorsed by any commercial laser
software vendor, and it contains none of their code. Product names belong to their respective owners.</sub>

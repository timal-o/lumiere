# Development

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later (22 LTS recommended) and npm
- [Rust](https://rustup.rs) stable
- Tauri system dependencies — see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft C++ Build Tools and WebView2
  - **Linux** (Debian/Ubuntu): `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev`

## Common commands

```sh
npm install              # install JavaScript dependencies
npm run tauri dev        # run the app with hot reload
npm run dev              # interface only, in a browser (no laser, fonts or G-code)
npx tsc                  # type-check
npm test                 # TypeScript tests (vitest)
npm run i18n             # translation coverage report (see translating.md)
cd src-tauri && cargo test    # Rust tests
npm run tauri build      # release build and installers
npm run tauri build -- --debug --bundles app   # quick debug .app on macOS
```

Release artefacts are written to `src-tauri/target/release/bundle/`.

## Project layout

```
src/                     Interface (TypeScript, React)
  __tests__/             vitest tests
  i18n/                  t(), language detection, Rust message patterns
  import/                SVG, DXF, HPGL importers
  locales/               One JSON file per language (French text is the key)
  ui/                    React components (canvas, panels, dialogs)
src-tauri/
  src/                   Rust core (G-code, dithering, drivers, fonts, menu)
  capabilities/          Tauri permissions
  icons/                 Application icons (generated from app-icon.svg)
  Info.plist             macOS permission strings (camera, local network)
  tauri.conf.json        Tauri configuration
docs/                    Documentation
scripts/i18n.mjs         Extracts translatable strings and checks the locale files
```

See [architecture.md](architecture.md) for how the pieces fit together.

## Tests

Prefer testing pure functions: geometry, importers, job building and the G-code engine are where
regressions are most dangerous. Rust tests in `gcode.rs` re-measure the burnt length from the
generated G-code, which is a convenient way to check tabs, ramps, fills and so on.

The text layout tests use Arial from macOS when it is present and are skipped otherwise.

## Icons

Icons are generated from `app-icon.svg`:

```sh
npx tauri icon app-icon.svg
```

Mobile icon folders (`src-tauri/icons/android`, `ios`) are not needed and can be deleted.

## Continuous integration

GitHub Actions runs the type-check and TypeScript tests on Linux, and the Rust tests and build
on Linux and Windows for every push and pull request. macOS is not in the matrix because hosted
macOS runners are frequently unavailable on free plans; build and test on a Mac before releasing.

## Releasing

1. Update the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Move the *Unreleased* entries of [CHANGELOG.md](../CHANGELOG.md) under the new version.
3. Tag the commit (`git tag v0.6.0`) and push the tag.
4. Build on each platform with `npm run tauri build` and attach the installers to a GitHub
   release. macOS builds must be signed and notarised to open without warnings.

## Debugging

- The webview inspector is available in debug builds (right-click → *Inspect*).
- Controller traffic appears in the *Laser* panel console; real-time status reports are not
  echoed.
- `RUST_LOG` is not used yet; add `eprintln!` in the Rust core and run `npm run tauri dev` from
  a terminal to see the output.

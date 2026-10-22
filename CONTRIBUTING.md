# Contributing to Lumière

Thanks for your interest! Lumière is a young project and every kind of help counts: hardware
test reports, bug reports, translations, documentation and code.

Please follow the [code of conduct](CODE_OF_CONDUCT.md) in all project spaces.

## Ways to help

- **Test on your machine.** GRBL is used for real jobs; Marlin, Smoothieware and Ruida still need hardware reports. A report saying
  "it works on my Ortur LM3 with GRBL 1.1h" is extremely valuable. Use the *Hardware report*
  issue template and follow the safety advice in [docs/hardware.md](docs/hardware.md).
- **Report bugs.** Include your OS, Lumière version, controller, steps to reproduce and, when
  possible, the project file (`.lum`) or the generated G-code.
- **Translate.** The interface is available in French, English, Spanish and Simplified Chinese.
  Adding a language is a single JSON file: see [docs/translating.md](docs/translating.md).
- **Write code.** Look for issues labelled `good first issue` or `help wanted`, or open an issue
  to discuss a larger change before you invest time in it.

## Development setup

See [docs/development.md](docs/development.md). In short:

```sh
npm install
npm run tauri dev       # desktop app
npm test                # TypeScript tests (vitest)
cd src-tauri && cargo test   # Rust tests
```

## Pull requests

1. Fork the repository and create a branch from `main` (`feature/…`, `fix/…`).
2. Keep each pull request focused on one change.
3. Add or update tests: geometry, importers and the G-code engine are expected to be covered.
4. Make sure these all pass before opening the PR:
   ```sh
   npx tsc
   npm test
   npm run i18n
   cd src-tauri && cargo test && cargo build
   ```
5. Describe what the change does and how you tested it. For anything that drives a laser,
   say whether it was tried on real hardware, and on which machine.

## Code style

- Match the surrounding code: naming, structure and comment density.
- TypeScript is `strict`; avoid `any` (the untyped `clipper-lib` port is the only exception).
- Rust code should build without warnings.
- Code comments and source UI strings are written in **French**; every UI string goes through
  `t()` (see [docs/translating.md](docs/translating.md#for-developers)). Contributions in English
  are welcome; reviewers will help with wording if needed.
- Prefer pure, testable functions for geometry and job generation (`src/*.ts`,
  `src-tauri/src/gcode.rs`), and keep UI components thin.

## Safety-related changes

Changes to the G-code generator, streaming or machine control can damage equipment or cause
fires. Such PRs need:

- unit tests demonstrating the generated commands;
- a description of the behaviour on interruptions (pause, stop, disconnection);
- ideally, a test on real hardware at low power.

## Commit messages

Use short, imperative subjects (`Add dot mode to line layers`, `Fix DXF bulge direction`), with
a body explaining *why* when it isn't obvious.

## License of contributions

By contributing, you agree that your contributions are licensed under the
[GNU GPL v3.0](LICENSE), like the rest of the project. Only submit code you wrote yourself or
that comes from a GPL-compatible source, and mention its origin.

Do not submit code, assets or protocol data copied from proprietary software.

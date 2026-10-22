# Hardware setup

> [!CAUTION]
> The GRBL driver is used for real jobs; Marlin and Smoothieware still await hardware reports. For your first tests on a new machine: remove the material,
> set a low power (≤ 5 %), keep the enclosure closed or wear eye protection rated for your
> laser's wavelength, and keep your hand near the emergency stop.

## Supported controllers

| Controller | Setting in the machine profile | Link | Streaming | Status |
|---|---|---|---|---|
| GRBL 1.1 (most diode lasers), FluidNC, grblHAL | *GRBL 1.1 / FluidNC / grblHAL* | USB serial, TCP (telnet, port 23) | Character counting (127-byte buffer), `?` status every 200 ms, real-time commands | Untested on hardware |
| Smoothieware | *Smoothieware* | USB serial, TCP | One line per `ok`, `?` status | Untested on hardware |
| Marlin with `LASER_FEATURE` | *Marlin (laser)* | USB serial, TCP | One line per `ok`, `M114` polled when idle; pause is local, stop sends `M410` + `M5` | Untested on hardware |
| Ruida (CO2) | *Ruida — CO2, réseau (expérimental)* | UDP 50200 / 40200 | Job sent as a file stream with checksums and acknowledgements | Experimental |

## GRBL

### Required settings
Check them in *Laser → Réglages GRBL ($$)…*:

| Setting | Value | Why |
|---|---|---|
| `$32` | `1` | **Laser mode.** Without it the laser stays on during travel moves (G0) and stops at every direction change. |
| `$30` | your maximum `S` value (often 1000 or 255) | Must match *S max* in the machine profile, otherwise power percentages are wrong. |
| `$130`, `$131` | bed size | Copied to the machine profile with *Reprendre dans les réglages machine*. |
| `$120`, `$121` | acceleration | Used for accurate time estimates. |

### Laser modes
- **M4 (dynamic, recommended)**: GRBL scales power with the actual speed, so corners are not
  over-burnt.
- **M3 (constant)**: constant power; needed by some controllers and for dot mode.

### Origin and coordinates
Set the corner where your machine homes in *Origine machine*. Lumière works in bed coordinates
(top-left, Y down) and converts to machine coordinates at the last moment.

*Coordonnées absolues* assumes the work coordinate system matches the machine coordinates. If you
use a user origin (`G10 L20`), choose *Départ depuis : origine utilisateur*, or clear it with
*Effacer* before running absolute jobs.

### Network (FluidNC, grblHAL)
Choose *Réseau* in the *Laser* panel and enter the controller's IP address. FluidNC listens on
port 23 (telnet) by default. On macOS the first connection triggers a "local network" permission
prompt.

## Smoothieware
Lines are sent one at a time; status uses `?`. Make sure the laser module is enabled in the
Smoothie configuration and that `S` values match *S max*.

## Marlin
Marlin needs `LASER_FEATURE` (or `SPINDLE_FEATURE`) for `M3`/`M4`/`M5`. Lumière polls the
position with `M114` when nothing is being sent. Marlin has no real-time pause: *Pause* stops
sending new lines (the planner buffer still empties), and *Arrêter* sends `M410` (quick stop)
then `M5`.

## Ruida (experimental)
Implemented from public descriptions of the protocol:
- bytes are scrambled ("swizzled") with the key `0x88`;
- coordinates are absolute micrometres on five 7-bit bytes, power is 14-bit;
- packets are sent by UDP to port 50200 from port 40200, prefixed with a 16-bit checksum, and
  acknowledged by `0xC6`.

The encoding and framing are unit-tested, but the file header has not been checked against a
real controller and the jog/frame commands are not implemented: use the machine's panel for
those. Please report results — successful or not — with the controller model (RDC6442G,
RDC6445G…) and firmware version.

## Other settings in the machine profile

| Setting | Use |
|---|---|
| *Décalage de balayage* | Shifts right-to-left scan lines to fix jagged edges in bidirectional fills (typically 0.05–0.3 mm) |
| *Assistance d'air* | `M8` (flood) or `M7` (mist) to turn air assist on; `M9` turns it off |
| *Rotatif à rouleaux* | Scales the Y axis by *mm par tour* / (π × object diameter) |
| *Axe Z motorisé* | Enables Z offset and Z step per pass on layers |
| *G-code de début / de fin* | Lines inserted at the start and end of every job |
| *Revenir à l'origine* | Ends the job with `G0 X0 Y0` |

## Reporting hardware results

Open an issue with the **Hardware report** template and include:
- machine brand and model, controller board and firmware (`$I` on GRBL);
- connection type (USB or network) and operating system;
- what you tested (jog, homing, framing, line, fill, image…) and what happened;
- the generated G-code (*Fichier → Enregistrer le G-code…*) for anything that went wrong.

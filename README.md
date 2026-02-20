# AMPS CCMC Submission Interface — v3

**Advanced Magnetospheric Particle Simulator**  
NASA Community Coordinated Modeling Center · Runs-on-Request

---

## Quick Start

### Modular version (development / hosting)
Serve the project root with any static HTTP server:
```bash
python3 -m http.server 8080   # then open http://localhost:8080/index.html
```
Do **not** open `index.html` directly via `file://` — browsers block
cross-origin CSS/JS file loading.

### Standalone version (single-file deploy)
Open `AMPS_Interface_v3_part1.html` directly in any browser — no server needed.

---

## Repository Layout

```
amps-v3/
├── index.html                      modular entry point
├── AMPS_Interface_v3_part1.html    standalone single-file (offline / backup)
├── css/
│   ├── 01-tokens.css               CSS design tokens (colours, fonts, radii)
│   ├── 02-layout.css               topbar, header, wizard, two-column grid
│   ├── 03-components.css           fields, cards, toggles, badges, KW-strip
│   └── 04-diagrams.css             SVG boundary, efield schematic, spectrum canvas
├── js/
│   ├── 01-state.js                 global state S + $ + SVG constants
│   ├── 02-wizard.js                step navigation + accordion
│   ├── 03-bgfield.js               Steps 1-3: run info, particle, field model
│   ├── 04-boundary.js              Step 4: BOX / Shue boundary + SVG renderer
│   ├── 05-efield.js                Step 5: corotation + Volland-Stern + Weimer
│   ├── 06-temporal.js              Step 6: temporal modes + OMNIWeb pipeline
│   ├── 07-spectrum-output.js       Steps 7-9: spectrum, output domain, energy bins
│   ├── 08-review.js                Step 10: AMPS_PARAM.in builder + submit
│   └── 09-init.js                  DOMContentLoaded bootstrap (load last)
└── examples/
    ├── ts05_driving_sample.txt
    ├── trajectory_sample.txt
    └── AMPS_PARAM_Sep2017_storm.in
```

---

## Wizard Steps

| # | Step | Key choices |
|---|------|-------------|
| 1 | Run Info | run name, PI, science goal |
| 2 | Particle | H+, He2+, e-, CNO, Fe |
| 3 | Bkg B-Field | TS05 · T04s · T95m · T15 · BATSRUS · GAMERA |
| 4 | Boundary | BOX (GSM cuboid) · Shue 1998 (magnetopause surface) |
| 5 | E-Field | Corotation · Volland-Stern (Kp) · Weimer 2005 (IMF) |
| 6 | Temporal | STEADY_STATE · TIME_SERIES · MHD_COUPLED |
| 7 | Spectrum | Power-law · Band · Table upload |
| 8 | Output Domain | Trajectory · 3-D / 2-D / 1-D grid |
| 9 | Output Options | energy bins, flux type, format, coordinates |
| 10 | Review & Submit | AMPS_PARAM.in preview, download, CCMC submit |

---

## Background Field Models

| Model | Drivers required | Notes |
|-------|-----------------|-------|
| **TS05** | Dst, Pdyn, Bz, Vx, Nsw, By, Bx, epoch | Default. Drives Shue auto-compute + Weimer auto-mode |
| T04s | same 8 | Tsyganenko 2004s; legacy |
| **T95m** | Dst, Kp | Simple surveys |
| **T15** | + GOES |B| | Most complete empirical model |
| **BATSRUS** | .cdf / .h5 upload | CCMC 3-D MHD output |
| **GAMERA** | .h5 upload | High-res curvilinear MHD; beta |

---

## Electric Field Models

| Model | Parameterisation | Notes |
|-------|-----------------|-------|
| Corotation | always | default ON; disabling incorrect for L < 6 RE |
| **Volland-Stern** | Kp (auto from Dst or manual) | Recommended default |
| **Weimer 2005** | Bz, By, Pdyn, Vx | Event-realistic |

---

## Extending

- **New field model**: add `.model-sel-card` in HTML Step 3 + handler in `js/03-bgfield.js` + keyword in `js/08-review.js`
- **Re-skin**: edit `css/01-tokens.css` only
- **New E-field model**: add card in Step 5 HTML + handler in `js/05-efield.js` + `drawEfieldSchematic()` branch

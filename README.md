# AMPS v2025 — CCMC Runs-on-Request Web Interface

Complete 9-step submission wizard for configuring SEP/GCR transport simulation runs at CCMC.

## Quick Start

Open `index.html` in any modern browser — no server needed, fully self-contained.

## File Structure

```
amps-ccmc/
├── index.html               ← Main application (start here)
├── README.md
├── css/
│   ├── tokens.css           ← Design tokens & CSS variables
│   ├── layout.css           ← Page structure & grid
│   ├── components.css       ← UI components (fields, cards, tables)
│   └── diagrams.css         ← Format diagrams & SVG boundary styles
├── js/
│   ├── app.js               ← Complete application logic (self-contained)
│   ├── core.js              ← Shared utilities (ES module)
│   ├── wizard.js            ← Step navigation (ES module)
│   ├── param-builder.js     ← AMPS_PARAM.in generator (ES module)
│   └── steps/               ← Step-specific handlers (ES modules)
└── examples/
    ├── AMPS_PARAM_Sep2017_storm.in
    ├── ts05_driving_sample.txt
    └── trajectory_sample.txt
```

## Wizard Steps

1. **Run Info** — Name, PI, institution, science goal
2. **Particle** — Species (H⁺, He²⁺, e⁻, O, Fe, custom), charge, mass
3. **Background Field** — TS05: Dst, Pdyn, Bz, Vx, Nsw, By, Bx
4. **Domain Boundary** — BOX (rectangular GSM) or SHUE (Shue 1998 magnetopause) with live SVG
5. **Temporal** — STEADY_STATE / TIME_SERIES (OMNIWeb) / COUPLED_MHD (Y2)
6. **Spectrum** — Power law / Band function / Table file
7. **Output Domain** — Points / Trajectory (NAIRAS) / Spherical shells
8. **Output Options** — Flux type, energy bins, NetCDF4/HDF5/ASCII, coordinates
9. **Review & Submit** — Validation, AMPS_PARAM.in preview, download, submit

## Physics

- **TS05**: Tsyganenko & Sitnov (2005), JGR 110, A12208
- **Shue boundary**: Shue et al. (1998), JGR 103, 17691 — r(θ)=r₀·(2/(1+cosθ))^α
- **Sep 2017 default**: Dst=−142 nT, Pdyn=3.5 nPa, Bz=−18.5 nT → r₀≈8.56 RE

# AMPS Geospace Cutoff/Flux Wizard (Static Website)

This repository contains a **static, client-side** wizard used to configure runs for
**geomagnetic cutoff rigidity** and **SEP/GCR flux** calculations in geospace, and to
export a plain-text run configuration file (`AMPS_PARAM.in`) suitable for downstream tools.

The site is designed to be **easy to run locally** (no build step required) and to be
robust during development via clean separation of concerns (HTML layout + CSS tokens +
small JS modules).

---

## Quick start

### Option A: open locally (recommended: serve with a tiny HTTP server)
Some browsers enforce stricter policies when opening files via `file://` URLs.
To avoid surprises, serve the directory:

```bash
cd <repo_root>
python -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`

### Option B: open directly
You can usually double-click `index.html`, but if any browser security policies block
resources, use Option A instead.

---

## What the wizard configures

### A) What to compute
You can choose one or both:

- **Cutoff Rigidity**
- **Flux (SEP/GCR)**

### B) Field evaluation mode
Two execution modes are supported at the configuration level:

1) **Gridless**  
   - Background **magnetic field** is evaluated directly from **empirical models**
     (e.g., Tsyganenko family + internal field such as IGRF) at the particle location.
   - **Electric field is disabled** by design (typical for many cutoff workflows).

2) **3-D Grid (interpolated)**  
   - A 3-D field grid is used for interpolation to particle location.
   - Intended for **MHD fields** and/or **time-dependent E-fields**.

> Note: The website enforces basic consistency. For example, Gridless mode disables
> electric-field inputs and disallows MHD background sources that require gridded fields.

### C) Cutoff-rigidity scanning controls
When **Cutoff Rigidity** is selected, the UI exposes:

- **Energy min/max** for the particle scan (MeV)
- **Maximum particles per point** (hard cap for injected trajectories per point)

### D) Output domain specification
The site supports output domains as:

- **Individual points** (POINTS)
- **Trajectories** (file-based)
- **Spherical shells** (SHELLS)

For spherical shells, the **angular resolution** options include:
`1×1`, `2×2`, `5×5`, `10×10`, `15×15`, `20×20` degrees.

The Review/Export step writes the domain parameters into the generated `AMPS_PARAM.in`.

---

## Documentation (Docs menu)

The site ships **paper-style documentation** as PDF files in `doc/`, with LaTeX sources
in `doc/latex/`. The top-bar **Docs** menu links directly to the PDFs.

Current docs include:

- `doc/overview_calculation_pipeline.pdf`
- `doc/cutoff_rigidity.pdf`
- `doc/flux_and_spectrum_definitions.pdf`
- `doc/goes18_19_spectrum_reconstruction.pdf`
- `doc/electric_field_models.pdf`
- `doc/magnetic_field_models.pdf`
- `doc/temporal_setup.pdf`
- `doc/output_domains_and_trajectories.pdf`
- `doc/rigidity_cutoff_methods_survey.pdf`

### Rebuilding the PDFs
From the repo root:

```bash
cd doc/latex
pdflatex rigidity_cutoff_methods_survey.tex
# repeat for other .tex files, or write a small loop
```

> `doc/view.html` is a small optional PDF viewer wrapper. Docs links currently point
> directly to PDFs; whether they open inside the browser or in an external viewer is
> controlled by the browser/user settings.

---

## Repository layout

```
index.html                  Main entry point (modular site)
panel_boundary.html         Reference panel markup (may not be dynamically loaded)
panel_temporal.html         Reference panel markup (may not be dynamically loaded)

css/
  01-tokens.css             Design tokens (colors, sizes)
  02-layout.css             Layout primitives (grid/topbar/sections)
  03-components.css         Buttons/cards/inputs styling
  04-diagrams.css           Diagram/SVG styling

js/
  01-state.js               Global state object + helpers
  02-wizard.js              Step navigation + section expand/collapse logic
  03-bgfield.js             Particle/background field selection logic
  04-boundary.js            Boundary selection + diagram support
  05-efield.js              Electric-field model UI and constraints
  06-temporal.js            Steady-state vs time-varying (time series) UI logic
  07-spectrum-output.js     Spectrum model UI + output-domain UI helpers
  08-review.js              Builds `AMPS_PARAM.in` preview + sidebar summary
  09-init.js                Initialization, event wiring, first render
  10-help.js                Help menu (Physics Models / Input File / Parameters)
  11-docs.js                Docs menu controller (PDF links)

doc/
  *.pdf                     Compiled documentation PDFs
  latex/*.tex               LaTeX sources for the PDFs
```

---

## Output: `AMPS_PARAM.in`

The **Review** step generates a single text output intended to be copy/pasted or saved
as `AMPS_PARAM.in`. It includes blocks for:

- Run info and selected calculations
- Particle selection
- Background magnetic field model selection
- Boundary selection
- Electric field selection (disabled in Gridless mode)
- Temporal setup (steady-state or time series)
- Spectrum model selection and parameters
- Output domain (POINTS / TRAJECTORY / SHELLS)
- Output options

---

## Development notes

### Style and maintainability
- The codebase is intentionally **vanilla HTML/CSS/JS** for easy portability.
- Comments are considered part of the interface contract:
  **do not remove existing comments**; add new comments close to the logic they explain.

### Recommended automated testing (future)
For robust regression protection during development, consider:
- **Playwright** (E2E) smoke tests: step navigation, spectrum preview, export output
- **Vitest/Jest** for unit tests of param serialization and spectrum math
- **html-validate** to catch malformed HTML that can break later steps

---

## License
This repository is a UI/configuration front-end. Any embedded scientific/model content
should be attributed in the relevant PDFs under `doc/`.

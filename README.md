# AMPS v2025 — CCMC Runs-on-Request Web Wizard

## Project Structure

```
index.html              Main page — all step panels, topbar, sidebar
css/
  01-tokens.css         Design tokens (colours, fonts, spacing)
  02-layout.css         Page grid, topbar, header, wizard strip
  03-components.css     Cards, fields, toggles, badges, KW strip
  04-diagrams.css       SVG/canvas diagram styles
js/
  01-state.js           Shared state object S and utility functions
  02-wizard.js          ★ Wizard navigation — WIZARD_STEPS config lives here
  02a-calcmode.js       Calculation mode constraints
  03-bgfield.js         Background B-field model handlers
  04-boundary.js        BOX / Shue boundary logic
  05-efield.js          Electric field model handlers
  06-temporal.js        Temporal variability options
  07-spectrum-output.js Particle spectrum + output domain
  08-review.js          AMPS_PARAM.in builder, sidebar, validation
  09-init.js            Initialisation sequence (runs on DOMContentLoaded)
  10-help.js            Help modal
  11-docs.js            Documentation panel
  12-load.js            AMPS_PARAM.in file parser / loader
img/
  AMPS_logo.png         Logo (transparent background)
```


---

## Adding / Removing Wizard Steps

The wizard step bar is **data-driven**.  All step definitions live in
a single JavaScript array called `WIZARD_STEPS` at the top of
`js/02-wizard.js`.  The step bar HTML, step numbering, Next/Prev
navigation, and the progress bar all derive from this array
automatically — there are no hardcoded step counts anywhere.


### How WIZARD_STEPS works

```js
// js/02-wizard.js  (abbreviated)

const WIZARD_STEPS = [
  { panel: 'panel-1',  label: 'Run Info' },
  { panel: 'panel-2',  label: 'Calc Mode' },
  { panel: 'panel-3',  label: 'Particle' },
  { panel: 'panel-4',  label: 'Bkg B-Field' },
  { panel: 'panel-5',  label: 'Boundary' },
  { panel: 'panel-6',  label: 'E-Field',
    skipWhen: () => S.fieldMethod === 'GRIDLESS' },
  { panel: 'panel-7',  label: 'Temporal' },
  { panel: 'panel-8',  label: 'Spectrum' },
  { panel: 'panel-9',  label: 'Output Domain' },
  // { panel: 'panel-10', label: 'Output Options' },   ← disabled
  { panel: 'panel-11', label: 'Review & Submit', isReview: true },
];
```

Each entry has:

| Field      | Required? | Description |
|------------|-----------|-------------|
| `panel`    | yes       | The `id` of the HTML `<div class="step-panel">` that this step shows/hides. Must already exist in `index.html`. |
| `label`    | yes       | Short text shown in the wizard strip (1–2 words). |
| `skipWhen` | no        | A function that returns `true` when this step should be skipped by the Next/Prev buttons. The step is still reachable by clicking its label in the strip. |
| `isReview` | no        | Set to `true` for the terminal "Review & Submit" step. Triggers `buildReview()` on entry. Excluded from the progress bar denominator. Should be the last entry. |

Step numbers in the UI (the circled digits 1, 2, 3 …) are the
**array indices + 1**, assigned automatically.  There is no need to
manually number anything.


### Step-by-step: adding a new wizard step

Suppose you want to add a "Diagnostics" step between Output Domain
and Review.

#### 1. Create the panel HTML in `index.html`

Add a new `<div id="panel-XX" class="step-panel">` anywhere inside
`<div class="main-col">`.  Pick any unused panel id (e.g. `panel-12`):

```html
<div id="panel-12" class="step-panel">
  <div class="sect" id="s-diagnostics">
    <div class="sect-hd" onclick="toggleSection('s-diagnostics')">
      <div class="sect-icon" style="background:rgba(139,111,247,.15)">🔧</div>
      <div>
        <div class="sect-title">Diagnostics</div>
        <div class="sect-sub">Optional diagnostic outputs</div>
      </div>
      <span class="chevron">▼</span>
    </div>
    <div class="sect-body">
      <!-- your controls here -->
    </div>
  </div>
</div>
```

#### 2. Add the entry to WIZARD_STEPS in `js/02-wizard.js`

Insert it at the desired position in the array:

```js
const WIZARD_STEPS = [
  { panel: 'panel-1',  label: 'Run Info' },
  { panel: 'panel-2',  label: 'Calc Mode' },
  { panel: 'panel-3',  label: 'Particle' },
  { panel: 'panel-4',  label: 'Bkg B-Field' },
  { panel: 'panel-5',  label: 'Boundary' },
  { panel: 'panel-6',  label: 'E-Field',
    skipWhen: () => S.fieldMethod === 'GRIDLESS' },
  { panel: 'panel-7',  label: 'Temporal' },
  { panel: 'panel-8',  label: 'Spectrum' },
  { panel: 'panel-9',  label: 'Output Domain' },
  { panel: 'panel-12', label: 'Diagnostics' },         // ← NEW
  { panel: 'panel-11', label: 'Review & Submit', isReview: true },
];
```

**That's it.**  The step bar, numbering, Next/Prev navigation, and
progress bar all update automatically.  "Diagnostics" will appear as
step 10, and "Review & Submit" will become step 11.

#### 3. (Optional) Add state properties and param output

If the new step has configurable parameters:

- Add default values to the state object `S` in `js/01-state.js`.
- Add param-file output lines in the `buildReview()` template
  literal in `js/08-review.js`.
- Add keyword-map entries in `js/12-load.js` so the loader can
  parse them back.
- Add sidebar display in `updateSidebar()` in `js/08-review.js`.
- Add validation checks in the `checks` array in `buildReview()`.

#### 4. (Optional) Make the step conditional

If the step should be skipped in certain modes, add a `skipWhen`:

```js
{ panel: 'panel-12', label: 'Diagnostics',
  skipWhen: () => S.calcQuantity === 'CUTOFF_RIGIDITY' },
```

When `skipWhen` returns `true`, the Next/Prev buttons will jump over
this step.  The user can still reach it by clicking its label.


### Removing a step

To remove a step from the wizard bar, simply **comment out or delete**
its entry from WIZARD_STEPS.  The panel HTML can stay in `index.html`
(it will just never be shown) or you can delete it.

Example — Output Options was removed like this:

```js
  // { panel: 'panel-10', label: 'Output Options' },
```

No other code changes are needed.


### Re-enabling Output Options

To bring back the Output Options step, uncomment the line in
WIZARD_STEPS:

```js
  { panel: 'panel-10', label: 'Output Options' },
```

It will appear in the strip at whatever position you place it.


---

## How the wizard navigation works internally

### Initialisation flow (js/09-init.js)

```
DOMContentLoaded
  → init()
    → … (state, handlers, constraints)
    → buildWizardStrip()     ← generates step bar HTML
    → goStep(1)              ← activates step 1
```

`buildWizardStrip()` reads WIZARD_STEPS and creates one
`<div class="wz-step">` per entry inside `<div id="wizard-strip">`.
Step numbers are assigned as array index + 1.

### Navigation functions

| Function         | Called by                  | Behaviour |
|------------------|----------------------------|-----------|
| `goStep(n)`      | All navigation paths       | Shows panel for step n, updates strip styling, manages Prev/Next/Submit buttons, calls `buildReview()` if review step |
| `nextStep()`     | "Next Step →" button       | Advances by 1, skipping steps whose `skipWhen` returns true |
| `prevStep()`     | "← Previous" button        | Retreats by 1, skipping steps whose `skipWhen` returns true |
| `wizClick(n)`    | Clicking a step in the bar | Random access — calls `goStep(n)` directly |
| `goToReview()`   | "Review & Submit" button   | Finds the step with `isReview: true` and navigates to it |

### Progress bar

The progress bar denominator is `completableSteps()`, which returns
the count of WIZARD_STEPS entries where `isReview` is not true.
This adapts automatically when steps are added or removed.

```
progress % = S.done.size / completableSteps() × 100
```

### Panel id decoupling

Step numbers in the UI (1, 2, 3 …) are array indices, NOT panel ids.
Panel ids (`panel-1`, `panel-11`, etc.) are stable HTML anchors that
never change.  This means:

- You can reorder steps without renaming panels.
- You can have gaps in panel ids (e.g. no panel-10 in the strip).
- You can add panel-12, panel-13, etc. without disrupting anything.


---

## Files modified for wizard data-driven refactor

| File | Change |
|------|--------|
| `js/02-wizard.js` | Complete rewrite: WIZARD_STEPS config array, buildWizardStrip(), data-driven goStep/nextStep/prevStep/goToReview, helper functions |
| `js/08-review.js` | Progress bar uses `completableSteps()` instead of hardcoded `10` |
| `js/09-init.js` | Added `buildWizardStrip()` call before `goStep(1)` |
| `index.html` | Replaced 11 hardcoded `<div class="wz-step">` elements with empty `<div id="wizard-strip">` container |

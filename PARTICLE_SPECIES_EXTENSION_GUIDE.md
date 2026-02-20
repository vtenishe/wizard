# AMPS Particle Species Extension Guide

**Version:** 3.0  
**Last Updated:** February 2026  
**Maintainers:** AMPS Development Team  

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start: Adding a New Species](#quick-start-adding-a-new-species)
3. [Detailed Step-by-Step Instructions](#detailed-step-by-step-instructions)
4. [Common Species Reference](#common-species-reference)
5. [Physics Considerations](#physics-considerations)
6. [Testing Your Addition](#testing-your-addition)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Customization](#advanced-customization)

---

## Overview

### What Are Particle Species in AMPS?

The AMPS (Advanced Magnetospheric Particle Simulator) interface allows users to select which particle species to simulate. Each simulation run traces ONE particle species backward in time through Earth's magnetosphere to determine accessibility maps, cutoff rigidities, and flux distributions.

### Current Implementation

As of v3.0, the interface provides three particle options:

1. **H⁺ Proton** — Most common SEP (Solar Energetic Particle) species
2. **He²⁺ Alpha** — Second most abundant heavy ion
3. **Custom Ion** — Manual input of any charge/mass combination

### Why Extend?

You may want to add more predefined species for:
- **Electrons** (e⁻) — Relativistic electron belt studies
- **Heavy ions** (O⁸⁺, Fe²⁶⁺, etc.) — SEP composition analysis
- **Partially stripped ions** (O⁶⁺, Fe¹⁸⁺) — Solar wind composition
- **Custom research particles** — Theoretical or sensitivity studies

This guide shows you exactly how to add new species cards to the interface.

---

## Quick Start: Adding a New Species

### Prerequisites
- Basic understanding of HTML, CSS, and JavaScript
- Text editor (VS Code, Sublime, Atom, etc.)
- Local copy of AMPS interface files

### 5-Minute Addition (Example: Adding Electrons)

**Step 1:** Open `js/03-bgfield.js` and find the `SPECIES` object (around line 120)

**Step 2:** Add this entry (uncomment if already present):
```javascript
electron: {
  Z: -1,              // Charge: -1 elementary charge
  A: 0.000549,        // Mass: electron mass in AMU
  label: 'e⁻ Electron'  // Display name
},
```

**Step 3:** Open `index.html` and find the particle cards section (around line 160)

**Step 4:** Add this HTML card after the helium card:
```html
<div class="opt-card" id="sp-electron" onclick="selectSpecies('electron',this)">
  <div class="oc-icon">&#128995;</div> <!-- 🔵 Blue circle -->
  <div class="oc-title">e⁻ Electron</div>
  <div class="oc-sub">
    Relativistic electrons. Drift periods &lt;1 min at L=4. 
    Requires enhanced integrator.
  </div>
</div>
```

**Step 5:** Save both files and reload the interface. The electron card should now appear!

---

## Detailed Step-by-Step Instructions

### Part 1: Understanding the Architecture

Before adding species, understand how the system works:

```
User clicks card → selectSpecies('key',card) → Updates S.species/charge/mass → 
Updates UI highlights → Recalculates rigidity → Updates sidebar
```

**Key Files:**
- `index.html` — Contains the visual species cards (Step 2 panel)
- `js/03-bgfield.js` — Contains species data and selection logic
- `js/01-state.js` — Global state object S (stores current species)
- `js/08-review.js` — Generates AMPS_PARAM.in file (uses S.species)

### Part 2: Adding Species Data (JavaScript)

#### Location
Open `js/03-bgfield.js` and scroll to the `SPECIES` object (approximately line 120).

#### Structure
Each species entry has this structure:
```javascript
key: {
  Z:     <charge>,    // Integer: charge state in elementary charges
  A:     <mass>,      // Float: mass in atomic mass units (AMU)
  label: '<name>'     // String: display name with Unicode superscripts
}
```

#### Example: Adding Oxygen (O⁸⁺)

**Physical Parameters:**
- Element: Oxygen
- Charge state: +8 (fully ionized, all 8 electrons removed)
- Mass: 15.999 AMU (O-16 isotope)

**Code to add:**
```javascript
oxygen: {
  Z: 8,              // Charge state: +8 elementary charges
  A: 15.999,         // Mass: 15.999 AMU (O-16 isotope)
  label: 'O⁸⁺ Oxygen'  // Display name with superscript
},
```

**Where to place it:**
- Add after `helium` entry and before `custom`
- Alphabetical ordering is optional but recommended
- Don't forget the trailing comma!

#### Unicode Superscripts for Charge States

Use these Unicode characters for charge notation:
```
⁺ (superscript plus)  — U+207A
⁻ (superscript minus) — U+207B
⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹  — U+2070 through U+2079
```

Examples:
- H⁺ (copy: H⁺)
- He²⁺ (copy: He²⁺)
- O⁸⁺ (copy: O⁸⁺)
- Fe²⁶⁺ (copy: Fe²⁶⁺)
- e⁻ (copy: e⁻)

You can copy these directly from this document or use an HTML entity:
```html
<div class="oc-title">O&#8312;&#8314; Oxygen</div>
<!-- &#8312; = ⁸, &#8314; = ⁺ -->
```

### Part 3: Adding Visual Card (HTML)

#### Location
Open `index.html` and navigate to the Step 2 panel (search for `id="panel-2"`).

Scroll down to find the particle cards grid (around line 160):
```html
<div class="opt-grid c3">
  <!-- Existing cards here -->
</div>
```

#### Card Template
Copy this template and modify:
```html
<!-- ────────────────────────────────────────────────────────────────────────
     [SPECIES NAME] CARD ([Chemical Formula])
     
     PARAMETERS:
       Species key: '[key]'
       Charge (Z):  [+/-X] elementary charge[s]
       Mass (A):    [X.XXX] atomic mass units (AMU)
     
     PHYSICS NOTES:
       - [Brief description of particle properties]
       - [Typical applications or use cases]
       - [Relevant physics considerations]
──────────────────────────────────────────────────────────────────────── -->
<div class="opt-card" id="sp-[key]" onclick="selectSpecies('[key]',this)">
  <div class="oc-icon">[emoji]</div>
  <div class="oc-title">[Display Name]</div>
  <div class="oc-sub">
    [Description text: mass, charge, physics notes]
  </div>
  <!-- Optional badge -->
  <span class="oc-badge badge-[color]">[BADGE TEXT]</span>
</div>
```

#### Detailed Template Fields

**1. ID Attribute:**
```html
id="sp-[key]"
```
- Must be `sp-` followed by the exact key used in SPECIES object
- Example: `id="sp-oxygen"` matches `oxygen: {...}` in JavaScript
- Used by JavaScript to find and manipulate the card

**2. onclick Handler:**
```html
onclick="selectSpecies('[key]',this)"
```
- Must match the SPECIES object key exactly
- `this` passes the card element for styling
- Example: `onclick="selectSpecies('oxygen',this)"`

**3. Icon (.oc-icon):**
```html
<div class="oc-icon">[emoji]</div>
```
- Use a relevant emoji or Unicode symbol
- Color suggestions:
  - Protons: 🔵 (blue) `&#128309;`
  - Alphas: 🟡 (yellow) `&#128993;`
  - Electrons: 🔵 (blue) `&#128995;`
  - Heavy ions: 🟢 (green) `&#128992;` or 🔴 (red) `&#128308;`
  - Custom: ⚙ (gear) `&#9881;`

**4. Title (.oc-title):**
```html
<div class="oc-title">[Chemical Symbol][Charge] [Name]</div>
```
- Use Unicode superscripts for charge
- Examples:
  - `H⁺ Proton`
  - `He²⁺ Alpha`
  - `O⁸⁺ Oxygen`
  - `Fe²⁶⁺ Iron`
  - `e⁻ Electron`

**5. Description (.oc-sub):**
```html
<div class="oc-sub">
  [Brief description]. Mass = [X.XXX] AMU, charge = [+/-X]e. 
  [Additional physics notes or applications].
</div>
```
- Keep concise (2-3 sentences max)
- Include mass and charge for reference
- Mention key physics considerations

**6. Optional Badge:**
```html
<span class="oc-badge badge-[color]">[TEXT]</span>
```
- Only use for special designations
- Available colors:
  - `badge-green` — Default/recommended
  - `badge-blue` — Standard
  - `badge-orange` — Warning/caution
  - `badge-purple` — Advanced/experimental

### Part 4: Complete Example — Adding Iron (Fe²⁶⁺)

**JavaScript Addition (js/03-bgfield.js):**
```javascript
iron: {
  Z: 26,             // Charge: +26 (fully ionized iron nucleus)
  A: 55.845,         // Mass: 55.845 AMU (weighted average of isotopes)
  label: 'Fe²⁶⁺ Iron'  // Display name
},
```

**HTML Card Addition (index.html):**
```html
<!-- ────────────────────────────────────────────────────────────────────────
     IRON CARD (Fe²⁶⁺)
     
     PARAMETERS:
       Species key: 'iron'
       Charge (Z):  +26 elementary charges
       Mass (A):    55.845 atomic mass units (AMU)
     
     PHYSICS NOTES:
       - Heaviest ion commonly observed in SEP events
       - Very high magnetic rigidity
       - Can penetrate deeper into magnetosphere than lighter ions
       - Fe/O ratio diagnostic for coronal vs. flare material
──────────────────────────────────────────────────────────────────────── -->
<div class="opt-card" id="sp-iron" onclick="selectSpecies('iron',this)">
  <div class="oc-icon">&#128308;</div> <!-- 🔴 Red circle -->
  <div class="oc-title">Fe²⁶⁺ Iron</div>
  <div class="oc-sub">
    Heaviest common SEP species. Mass = 55.8 AMU, charge = +26e. 
    High rigidity — penetrates deep into magnetosphere.
  </div>
</div>
```

**Where to Insert:**
- JavaScript: After `helium` entry, before `custom`
- HTML: After helium card, before custom card
- Maintains logical ordering from light to heavy

---

## Common Species Reference

### Recommended Species to Add

Here's a reference table of commonly simulated particle species:

| Species | Key | Z | A (AMU) | Label | Use Cases |
|---------|-----|---|---------|-------|-----------|
| **Electron** | `electron` | -1 | 0.000549 | `e⁻ Electron` | Radiation belt studies, wave-particle interactions |
| **Proton** | `proton` | +1 | 1.0073 | `H⁺ Proton` | SEP events, cutoff rigidity, radiation dose |
| **Alpha** | `helium` | +2 | 4.0026 | `He²⁺ Alpha` | Heavy ion SEP, composition studies |
| **Carbon** | `carbon` | +6 | 12.011 | `C⁶⁺ Carbon` | CNO group, impulsive SEP events |
| **Nitrogen** | `nitrogen` | +7 | 14.007 | `N⁷⁺ Nitrogen` | CNO group |
| **Oxygen** | `oxygen` | +8 | 15.999 | `O⁸⁺ Oxygen` | Most abundant heavy ion (after He) |
| **Neon** | `neon` | +10 | 20.180 | `Ne¹⁰⁺ Neon` | Rare heavy ion |
| **Magnesium** | `magnesium` | +12 | 24.305 | `Mg¹²⁺ Magnesium` | M-region elements |
| **Silicon** | `silicon` | +14 | 28.085 | `Si¹⁴⁺ Silicon` | M-region elements |
| **Iron** | `iron` | +26 | 55.845 | `Fe²⁶⁺ Iron` | Heaviest common SEP ion |

### Copy-Paste Ready Code Blocks

#### Electron
```javascript
// JavaScript (js/03-bgfield.js)
electron: {
  Z: -1,
  A: 0.000549,
  label: 'e⁻ Electron'
},
```
```html
<!-- HTML (index.html) -->
<div class="opt-card" id="sp-electron" onclick="selectSpecies('electron',this)">
  <div class="oc-icon">&#128995;</div>
  <div class="oc-title">e⁻ Electron</div>
  <div class="oc-sub">
    Relativistic electrons. Mass = 0.000549 AMU, charge = -1e. 
    Drift periods &lt;1 min at L=4. Requires enhanced integrator.
  </div>
</div>
```

#### Oxygen (O⁸⁺)
```javascript
// JavaScript (js/03-bgfield.js)
oxygen: {
  Z: 8,
  A: 15.999,
  label: 'O⁸⁺ Oxygen'
},
```
```html
<!-- HTML (index.html) -->
<div class="opt-card" id="sp-oxygen" onclick="selectSpecies('oxygen',this)">
  <div class="oc-icon">&#128992;</div>
  <div class="oc-title">O⁸⁺ Oxygen</div>
  <div class="oc-sub">
    Heavy SEP ion — dominant in impulsive events. Mass = 16.0 AMU, charge = +8e. 
    Part of CNO group; important for composition studies.
  </div>
</div>
```

#### Iron (Fe²⁶⁺)
```javascript
// JavaScript (js/03-bgfield.js)
iron: {
  Z: 26,
  A: 55.845,
  label: 'Fe²⁶⁺ Iron'
},
```
```html
<!-- HTML (index.html) -->
<div class="opt-card" id="sp-iron" onclick="selectSpecies('iron',this)">
  <div class="oc-icon">&#128308;</div>
  <div class="oc-title">Fe²⁶⁺ Iron</div>
  <div class="oc-sub">
    Heaviest common SEP species. Mass = 55.8 AMU, charge = +26e. 
    High rigidity — can penetrate deep into magnetosphere.
  </div>
</div>
```

---

## Physics Considerations

### Charge State Selection

**Fully Ionized (Recommended):**
- Use charge = atomic number Z
- Examples: H⁺ (Z=1), He²⁺ (Z=2), O⁸⁺ (Z=8), Fe²⁶⁺ (Z=26)
- Appropriate for high-energy SEP events where all electrons are stripped

**Partially Stripped:**
- Use charge < atomic number
- Examples: O⁶⁺ (Z=6 for oxygen with 2 bound electrons), Fe¹⁸⁺
- Appropriate for solar wind studies or lower-energy particles
- Requires "Custom Ion" or adding specific entries

### Mass Selection

**Standard Isotopes:**
Use the most abundant natural isotope mass:
- H: 1.0073 AMU (protium, ¹H)
- He: 4.0026 AMU (helium-4, ⁴He)
- O: 15.999 AMU (oxygen-16, ¹⁶O)
- Fe: 55.845 AMU (weighted average of ⁵⁴Fe, ⁵⁶Fe, ⁵⁷Fe, ⁵⁸Fe)

**Rare Isotopes:**
For isotope-specific studies, use the exact isotope mass:
- ³He: 3.0160 AMU (rare helium isotope)
- ¹³C: 13.003 AMU (carbon-13)
- ¹⁸O: 17.999 AMU (oxygen-18)

**Where to find masses:**
- NIST Atomic Weights: https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl
- Periodic Table databases
- Use "Custom Ion" for non-standard isotopes

### Rigidity Calculation

The interface displays magnetic rigidity at 100 MeV/nucleon:
```
R = p / (q·e)
```

Where:
- p = relativistic momentum
- q = charge in elementary charges
- e = elementary charge

**Interpretation:**
- Higher rigidity → harder to deflect in magnetic field
- Lower rigidity → easier to deflect, higher cutoff

**Examples at 100 MeV/n:**
- H⁺: R ≈ 1.09 GV
- He²⁺: R ≈ 0.92 GV (higher momentum but also higher charge)
- O⁸⁺: R ≈ 0.72 GV
- Fe²⁶⁺: R ≈ 0.95 GV

---

## Testing Your Addition

### Checklist Before Deploying

**Step 1: Visual Inspection**
- [ ] Card appears in the grid layout
- [ ] Icon displays correctly
- [ ] Title uses proper Unicode superscripts
- [ ] Description text is readable and accurate
- [ ] Card aligns with other cards (no layout issues)

**Step 2: Interaction Testing**
- [ ] Clicking card highlights it (adds blue border)
- [ ] Previous selection unhighlights (only one card selected)
- [ ] Rigidity display updates correctly
- [ ] Sidebar summary shows correct species name
- [ ] AMPS_PARAM.in preview updates (Step 10)

**Step 3: Parameter Verification**
- [ ] Charge value is correct (check SPECIES object)
- [ ] Mass value is accurate (verify against reference)
- [ ] Rigidity calculation produces expected value
- [ ] No JavaScript console errors

**Step 4: Cross-Browser Testing**
Test in:
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (if on macOS)
- [ ] Edge

### Expected Console Output
When you select a species, you should NOT see errors. If you see:
```
Unknown species key: [key]
```
Then the JavaScript key doesn't match the HTML onclick parameter.

### Debugging Tips

**Card doesn't appear:**
- Check HTML syntax (closing tags, quotes)
- Verify the card is inside `<div class="opt-grid c3">`
- Clear browser cache and hard reload (Ctrl+Shift+R)

**Card appears but doesn't highlight when clicked:**
- Check onclick syntax: `onclick="selectSpecies('key',this)"`
- Verify quotes are correct (single quotes inside double quotes)
- Check browser console for JavaScript errors

**Rigidity shows NaN or incorrect value:**
- Verify SPECIES object has numeric Z and A
- Check for typos: `Z:26` not `Z:'26'` (no quotes for numbers)
- Ensure trailing commas are present in SPECIES object

**Species doesn't appear in AMPS_PARAM.in preview:**
- Check that js/08-review.js is loaded
- Verify S.species is being set correctly
- Use browser DevTools console to check: `console.log(S.species, S.charge, S.mass)`

---

## Advanced Customization

### Adding Custom Icons

Instead of emoji, you can use:

**Font Awesome Icons:**
```html
<div class="oc-icon"><i class="fas fa-atom"></i></div>
```

**Custom SVG Icons:**
```html
<div class="oc-icon">
  <svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="currentColor"/>
  </svg>
</div>
```

### Conditional Display (Advanced)

Hide certain species based on field model:
```javascript
function selectFieldModel(model) {
  // ... existing code ...
  
  // Hide electron option unless using BATSRUS/GAMERA
  const electronCard = document.getElementById('sp-electron');
  if (electronCard) {
    electronCard.style.display = 
      (model === 'BATSRUS' || model === 'GAMERA') ? 'block' : 'none';
  }
}
```

### Custom Validation

Add warnings for certain species + field model combinations:
```javascript
function selectSpecies(key, card) {
  // ... existing code ...
  
  // Warn if user selects electron with empirical field model
  if (key === 'electron' && S.fieldModel !== 'BATSRUS' && S.fieldModel !== 'GAMERA') {
    alert('Warning: Electron simulations with empirical field models may have reduced accuracy. Consider using BATSRUS or GAMERA for relativistic electrons.');
  }
}
```

### Adding Help Tooltips

Add info icon with tooltip:
```html
<div class="oc-title">
  O⁸⁺ Oxygen 
  <span class="info-icon" title="Most abundant heavy ion in impulsive SEP events">ℹ️</span>
</div>
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Species card not showing"
**Symptoms:** Added code but card doesn't appear in UI

**Solutions:**
1. Check HTML is inside `<div class="opt-grid c3">` container
2. Verify no syntax errors (missing `>`, unclosed tags)
3. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
4. Check browser DevTools Console for errors
5. Verify file is saved (some editors don't auto-save)

#### Issue 2: "Card shows but clicking does nothing"
**Symptoms:** Card visible but doesn't highlight or update state

**Solutions:**
1. Check onclick attribute syntax: `onclick="selectSpecies('key',this)"`
2. Verify SPECIES object has matching key in JavaScript
3. Check browser console for errors like "SPECIES is not defined"
4. Ensure js/03-bgfield.js is loaded (check Network tab)
5. Test with: `console.log(SPECIES)` in browser console

#### Issue 3: "Rigidity shows NaN"
**Symptoms:** Rigidity display shows "R = NaN GV"

**Solutions:**
1. Check SPECIES object has numeric values (no quotes): `Z:8` not `Z:'8'`
2. Verify mass is not zero: `A:15.999` not `A:0`
3. Test calculation manually:
   ```javascript
   const q = Math.abs(8);
   const A = 15.999;
   const E = 100, mp = 938.272;
   const Etot = E*A + A*mp;
   const p = Math.sqrt(Etot**2 - (A*mp)**2);
   const R = p / (q * 1000);
   console.log(R); // Should be ~0.718
   ```

#### Issue 4: "Superscripts not displaying"
**Symptoms:** Title shows `O8+` instead of `O⁸⁺`

**Solutions:**
1. Use Unicode superscripts, not regular digits
2. Copy from this guide or use HTML entities:
   - `⁺` = `&#8314;` (superscript plus)
   - `⁸` = `&#8312;` (superscript 8)
3. Ensure UTF-8 encoding in HTML: `<meta charset="UTF-8"/>`
4. Some fonts don't support all superscripts — test in multiple browsers

#### Issue 5: "Layout breaks with new card"
**Symptoms:** Grid becomes misaligned or cards overlap

**Solutions:**
1. Ensure card follows exact template structure
2. Check for missing closing `</div>` tags
3. Validate HTML structure (use validator.w3.org)
4. Inspect with DevTools to find layout issues
5. Test with only 3 total cards to verify grid works

---

## Summary

### Checklist for Adding a New Species

1. **JavaScript (js/03-bgfield.js)**
   - [ ] Add entry to SPECIES object
   - [ ] Set correct Z (charge) value
   - [ ] Set correct A (mass) value
   - [ ] Use proper Unicode in label

2. **HTML (index.html)**
   - [ ] Copy card template
   - [ ] Set unique id="sp-{key}"
   - [ ] Set onclick="selectSpecies('{key}',this)"
   - [ ] Choose appropriate icon emoji
   - [ ] Write descriptive title and text
   - [ ] Add physics notes if relevant

3. **Testing**
   - [ ] Visual inspection
   - [ ] Click interaction
   - [ ] Rigidity calculation
   - [ ] Parameter preview
   - [ ] No console errors

4. **Documentation**
   - [ ] Add comments explaining physics
   - [ ] Note any special considerations
   - [ ] Update this guide if needed

### File Change Summary

| File | Changes Required | Lines to Modify |
|------|------------------|-----------------|
| `js/03-bgfield.js` | Add SPECIES entry | ~5 lines |
| `index.html` | Add card HTML | ~10-15 lines |
| **Total** | | **~15-20 lines** |

---

## Contact and Support

**Questions?** Contact the AMPS development team or submit an issue on the project repository.

**Contributing:** If you add useful species or improvements, consider submitting a pull request to share with the community!

---

**End of Guide**  
*This document is maintained as part of the AMPS v3 interface package.*

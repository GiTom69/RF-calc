# RF Calculator: source

The deliverable is the single offline file `../rf-calculator.html`. Open it in any browser; it needs no internet and no install.

## Layout
- `src/core.js`: constants, input parsing and formatting, complex and matrix math, root finding, and the "last unknown is calculated" solver engine
- `src/data.js`: reference data (cables, substrates, conductors, bands, waveguides, connectors, E-series)
- `src/rf.js`: RF formulas (microstrip, S-parameter analysis and conversions, cascade, L-network, attenuators)
- `src/calcs.js`: phase-1 calculator definitions (variables plus equations, or `custom` for forward-only ones) and the category list
- `src/charts.js`: SVG charts (power bar, |S| heatmap, Smith chart, polar plot, line chart) with tooltips
- `src/ui.js`, `src/style.css`, `src/template.html`: the page
- Phase-2 batches, each optional and self-contained:
  - `src/bN.js`: pure code (formulas, data, `CALCS.push(...)`)
  - `src/bN-ui.js`: DOM code (`CUSTOM.<id> = ...` cards, charts)
  - `src/bN.css`: styles
  - `test/bN.test.js`, `test/ui-bN.js`: tests
  - Top-level names are prefixed `bN` so nothing collides in the single script.
- `test/calcs.test.js`, `test/ui-calcs.js`: regression tests for the phase-1 calculators (always run)

## Commands
```
node build.js                                   # writes ../rf-calculator.html with everything
node build.js --only=b1 --out=build/b1.html     # base app plus one batch (or --only=none)
node test/test.js [--only=b1]                   # engine + reference-value tests
node test/ui-test.js                            # headless Chrome test, screenshots in test/shots/
#   env: FILE=build/b1.html PORT=9341 SHOTS=test/shots-b1 BATCHES=b1
```

## Phase 2 batches
- **b1:** SNR / Eb/N0 ↔ BER (BPSK … 4096-QAM, AWGN) and the EW & Interference category (probability of intercept, J/S and burn-through, SINR and desensitization, reciprocal mixing, anti-jam margin, follower jammer, intercept range vs radar range)
- **b2:** two-tone IP3 / SFDR, ADC, phase noise → jitter, spur and harmonic table, LC filter prototypes
- **b3:** remaining Extended items (field strength, PAPR, directivity error, 2-port cascade, matching, waveguide, propagation, radar, antennas, G/T, pads, Wilkinson)
- **b4:** mismatch uncertainty, terminated line and stub matching, stripline / CPW / coupled microstrip

## Adding a solver calculator
Add an entry to `CALCS` (or `CALCS.push(...)` in a batch file) with `vars` and `eqs: [E(out, ins, fn, inverses)]`. Inverses are optional; any variable without one is solved numerically. Give example values (`def`) to exactly `vars-in-equations − equations` variables. `test/test.js` checks this automatically and round-trips every field.

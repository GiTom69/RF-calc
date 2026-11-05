// Batch 3 reference-value tests. Loaded by test/test.js (node test/test.js --only=b3).
module.exports = function (T) {
  const { ok, near, byId, A } = T;
  // absolute tolerance, for values that can be close to 0 (dB, degrees)
  const nearAbs = T.nearAbs || ((a, b, tol, name) => ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b));
  const fn = name => T.evalIn(name);
  const C = 299792458, ETA = 376.730313668, KBz = 1.380649e-23;
  const init = id => A.calcInit(byId(id));

  // ---- ITU-R P.838-3: equations vs. Table 5 of the Recommendation ---------
  const p838 = fn('b3P838');
  const table5 = [ // f GHz, kH, aH, kV, aV
    [1, 0.0000259, 0.9691, 0.0000308, 0.8592],
    [10, 0.01217, 1.2571, 0.01129, 1.2156],
    [20, 0.09164, 1.0568, 0.09611, 0.9847],
    [30, 0.2403, 0.9485, 0.2291, 0.9129],
    [60, 0.8606, 0.7656, 0.8515, 0.7486],
  ];
  for (const [f, kH, aH, kV, aV] of table5) {
    const c = p838(f, 0, 0);
    near(c.kH, kH, 1.5e-3, 'P.838-3 kH at ' + f + ' GHz');
    near(c.kV, kV, 1.5e-3, 'P.838-3 kV at ' + f + ' GHz');
    ok(Math.abs(c.aH - aH) < 1.5e-4, 'P.838-3 αH at ' + f + ' GHz', c.aH + ' vs ' + aH);
    ok(Math.abs(c.aV - aV) < 1.5e-4, 'P.838-3 αV at ' + f + ' GHz', c.aV + ' vs ' + aV);
  }
  const cc = p838(20, 0, 45), ch = p838(20, 0, 0);
  near(cc.k, (ch.kH + ch.kV) / 2, 1e-12, 'P.838-3 circular k = (kH + kV)/2');
  near(p838(20, 0, 90).k, ch.kV, 1e-12, 'P.838-3 vertical k = kV');
  {
    const st = init('rain');
    near(st.vals.gamma, 0.09164 * Math.pow(25, 1.0568), 3e-3, 'rain: γ at 20 GHz, 25 mm/h (H)');
    near(st.vals.A, st.vals.gamma * 5, 1e-12, 'rain: total over 5 km');
  }

  // ---- RF exposure limits (ICNIRP 2020 Table 5, 47 CFR 1.1310 Table 1) -----
  const lim = fn('b3Limit');
  near(lim('icnirp-gp', 900e6).S, 4.5, 1e-12, 'ICNIRP GP 900 MHz = f/200');
  near(lim('icnirp-gp', 100e6).S, 2, 1e-12, 'ICNIRP GP 100 MHz = 2 W/m²');
  near(lim('icnirp-gp', 10e9).S, 10, 1e-12, 'ICNIRP GP 10 GHz = 10 W/m²');
  near(lim('icnirp-occ', 1e9).S, 25, 1e-12, 'ICNIRP occupational 1 GHz = f/40');
  near(lim('icnirp-occ', 100e6).E, 61, 1e-12, 'ICNIRP occupational E 30-400 MHz');
  near(lim('icnirp-gp', 10e6).E, 300 / Math.pow(10, 0.7), 1e-12, 'ICNIRP GP E at 10 MHz');
  near(lim('fcc-gp', 900e6).S, 6, 1e-12, 'FCC GP 900 MHz = f/1500 mW/cm²');
  near(lim('fcc-gp', 2.4e9).S, 10, 1e-12, 'FCC GP above 1.5 GHz = 1 mW/cm²');
  near(lim('fcc-gp', 100e6).S, 2, 1e-12, 'FCC GP 30-300 MHz = 0.2 mW/cm²');
  near(lim('fcc-occ', 10e6).S, 90, 1e-12, 'FCC occupational 10 MHz = 900/f² mW/cm²');
  near(lim('fcc-occ', 5e9).S, 50, 1e-12, 'FCC occupational above 1.5 GHz = 5 mW/cm²');
  ok(lim('fcc-gp', 200e9) === null && lim('icnirp-gp', 50e3) === null, 'limits: out of range is null');
  {
    const st = init('rfexposure');
    near(st.vals.S, 100 / (4 * Math.PI * 100), 1e-12, 'exposure: S at 10 m for 100 W EIRP');
    near(st.vals.dsafe, Math.sqrt(100 / (4 * Math.PI * 4.5)), 1e-12, 'exposure: ICNIRP GP compliance distance');
    near(st.vals.pct, 100 * st.vals.S / 4.5, 1e-12, 'exposure: % of limit');
  }

  // ---- field strength ----------------------------------------------------
  {
    const st = init('fieldstr');
    near(st.vals.dBuVm, 120, 1e-12, 'field: 1 V/m = 120 dBµV/m');
    near(st.vals.S, 1 / ETA, 1e-12, 'field: S = E²/η₀');
    near(st.vals.AF, 20 * Math.log10(9.7305 / (C / 1e9)), 2e-5, 'field: AF ≈ 9.73/(λ√G) at 1 GHz');
    const prW = 1e-3 * Math.pow(10, st.vals.Pr / 10), vW = 1e-6 * Math.pow(10, st.vals.Vrx / 20);
    near(vW * vW / 50, prW, 1e-9, 'field: V²/Z equals the received power');
  }

  // ---- PAPR, directivity --------------------------------------------------
  {
    const c = byId('papr'); const st = A.calcInit(c);
    near(st.vals.ppk, 40, 1e-12, 'PAPR: peak = average + PAPR');
    st.cfg.sig = '2tone';
    A.calcSetMany(c, st, c.cfg[0].set('2tone'));
    near(st.vals.papr, 3.0103, 1e-4, 'PAPR: two-tone preset 3.01 dB');
    near(st.vals.cfdb, 6.0206, 1e-4, 'PAPR: RF crest factor = PAPR + 3.01 dB');
    // complex-Gaussian power CCDF e^(−z): PAPR at 1e-4 = 10·log10(ln 1e4) = 9.642757 dB
    near(fn('B3_PAPR').find(p => p[0] === 'gauss4')[2], 10 * Math.log10(Math.log(1e4)), 1e-12, 'PAPR: Gaussian at 0.01 % = 9.64 dB');
    near(fn('B3_PAPR').find(p => p[0] === 'gauss3')[2], 10 * Math.log10(Math.log(1e3)), 1e-12, 'PAPR: Gaussian at 0.1 % = 8.39 dB');
  }
  const calcValues = fn('calcValues');
  const outs = (c, st) => { const v = calcValues(c, st); const o = {}; for (const x of c.outputs) { try { o[x.label] = x.fn(v); } catch (e) { o[x.label] = 'ERR'; } } return o; };
  const warnOf = (c, st) => c.warn ? c.warn(calcValues(c, st)) : null;
  {
    const st = init('directivity');
    near(st.vals.rlw, -20 * Math.log10(0.1 + Math.pow(10, -1.5)), 1e-12, 'directivity: worst true RL 17.61 dB');
    near(st.vals.rlw, 17.61338, 1e-5, 'directivity: 17.61 dB');
    near(st.vals.rlb, 23.3018, 1e-5, 'directivity: best true RL 23.30 dB');
    const c = byId('directivity');
    ok(!warnOf(c, st), 'directivity: no warning at D = 30 dB, RL = 20 dB');
    // D = 10 dB, RLm = 3 dB: |Γm| + |εD| = 1.024 > 1, a passive DUT stops at |Γ| = 1
    A.calcEdit(c, st, 'D', 10); A.calcEdit(c, st, 'rlm', 3);
    nearAbs(st.vals.rlw, 0, 1e-12, 'directivity: worst case clamps at total reflection (RL 0 dB)');
    ok(st.status.rlw === 'calc' && !st.msg, 'directivity: clamped worst case is a valid result', st.status.rlw + ' ' + st.msg);
    const o = outs(c, st);
    ok(/^-3 … \+5\.141 dB$/.test(o['Measurement error range']), 'directivity: error range lower bound is −RLm', o['Measurement error range']);
    ok(/… ∞$/.test(o['True VSWR range']), 'directivity: VSWR upper bound ∞ (not 2000000)', o['True VSWR range']);
    ok(/total reflection/.test(warnOf(c, st) || ''), 'directivity: warning when the worst case reaches |Γ| = 1', warnOf(c, st));
    A.calcEdit(c, st, 'D', 0); A.calcEdit(c, st, 'rlm', 0);
    nearAbs(st.vals.rlw, 0, 1e-12, 'directivity: D = 0, RLm = 0 gives worst RL 0 dB (not −6 dB)');
  }

  // ---- waveguide ------------------------------------------------------------
  {
    const st = init('waveguide');
    near(st.vals.fc, C / (2 * 0.02286), 1e-12, 'WR-90 TE10 cutoff 6.557 GHz');
    near(st.vals.lg, 0.039707, 1e-4, 'WR-90 guide wavelength at 10 GHz = 39.7 mm');
    const loss = fn('b3WgLoss')(Object.assign({}, st.vals, { $: st.cfg }));
    ok(loss > 0.09 && loss < 0.13, 'WR-90 copper loss at 10 GHz ≈ 0.11 dB/m', loss);
    // textbook form α = Rs/(η·b·√(1 − (fc/f)²))·(1 + 2b/a·(fc/f)²), annealed copper ρ = 1.724e-8 Ω·m
    const a = 0.02286, b = 0.01016, f = 10e9, fc = C / (2 * a), Rs = Math.sqrt(Math.PI * f * 4e-7 * Math.PI * 1.724e-8);
    const al = Rs / (ETA * b * Math.sqrt(1 - Math.pow(fc / f, 2))) * (1 + 2 * b / a * Math.pow(fc / f, 2)) * 20 / Math.log(10);
    near(loss, al, 1e-4, 'WR-90 copper loss uses annealed Cu 1.724e-8 Ω·m');
    ok(byId('waveguide').outputs.some(o => o.label.includes('annealed Cu, 1.724e-8 Ω·m')), 'waveguide: loss label names the copper resistivity');
  }

  // ---- two-ray ---------------------------------------------------------------
  {
    const st = init('tworay');
    near(st.vals.dc, 4 * Math.PI * 30 * 1.5 * 900e6 / C, 1e-12, 'two-ray: crossover distance');
    near(st.vals.L, 40 * Math.log10(5000) - 20 * Math.log10(30) - 20 * Math.log10(1.5), 1e-12, 'two-ray: plane-earth loss 114.89 dB');
    const ex = fn('b3TwoRayExact'), fs = fn('fsplDb'), pe = fn('b3PlaneEarth');
    ok(Math.abs(ex(900e6, 50e3, 30, 1.5) - pe(50e3, 30, 1.5)) < 0.05, 'two-ray: exact → plane earth far away');
    const dc = st.vals.dc;
    near(fs(900e6, dc), pe(dc, 30, 1.5), 1e-9, 'two-ray: free space = plane earth at the crossover');
    const c = byId('tworay');
    A.calcEdit(c, st, 'L', 130);
    near(st.vals.d, Math.pow(10, (130 + 20 * Math.log10(30) + 20 * Math.log10(1.5)) / 40), 1e-9, 'two-ray: distance for 130 dB');
  }
  {
    const ex = fn('b3TwoRayExact'), dist = fn('b3TwoRayDist'), pe = fn('b3PlaneEarth'), nul = fn('b3TwoRayNull'), lam = f => C / f;
    // cancellation-free forward model: plane earth is its far-field limit even at 1e7 … 1e8 m
    nearAbs(ex(50e6, 1e8, 1, 1), pe(1e8, 1, 1), 1e-3, 'two-ray exact: 1e8 m, 50 MHz, 1 m/1 m = plane earth 320 dB');
    nearAbs(ex(50e6, 1e7, 1, 1), pe(1e7, 1, 1), 1e-3, 'two-ray exact: 1e7 m = plane earth 280 dB');
    // the exact-model inverse works for long paths (it failed above ≈ 165 dB)
    let fails = [];
    for (const [f, ht, hr] of [[900e6, 30, 1.5], [2.4e9, 10, 10], [50e6, 1, 1]]) {
      for (let L = 100; L <= 250; L += 1) {
        if (L > ex(f, 1e8, ht, hr)) break;
        const d = dist('exact', f, L, ht, hr);
        if (!(Math.abs(ex(f, d, ht, hr) - L) < 1e-9)) fails.push(f + '/' + ht + '/' + hr + ': ' + L + ' dB → ' + d);
      }
    }
    ok(fails.length === 0, 'two-ray exact: distance found for every loss up to the 1e8 m limit', fails.slice(0, 5));
    near(dist('exact', 900e6, 170, 30, 1.5), 119290.1, 1e-5, 'two-ray exact: 170 dB at 900 MHz, 30/1.5 m → 119.29 km');
    // the farthest of several solutions in the ripple region (brute force: 104.219, 10.710, 6.2995 m)
    for (const [f, d0, ht, hr, far] of [[900e6, 100, 30, 1.5, 104.2189], [900e6, 10, 30, 1.5, 10.7100], [2.4e9, 5.62, 10, 10, 6.2995]]) {
      const L = ex(f, d0, ht, hr), d = dist('exact', f, L, ht, hr);
      near(d, far, 1e-4, 'two-ray exact: farthest distance for the loss at ' + d0 + ' m (' + f / 1e6 + ' MHz)');
      // no larger distance gives this loss: the loss stays above L on a fine grid out to 1e8 m
      let below = 0;
      for (let i = 1; i <= 200000; i++) { const x = d * Math.pow(1e8 / d, i / 200000); if (ex(f, x, ht, hr) < L) below++; }
      ok(below === 0, 'two-ray exact: no farther solution than ' + d.toFixed(4) + ' m', below);
    }
    // near-tangent cases: L only a few mdB below a ripple peak, so the loss dips under L over a phase
    // interval narrower than a fixed march step (these returned 91.54 m, 129.40 m and 7942.06 m)
    const fLx = 7467695281.297549, htx = 2.682204890524244, hrx = 7.127477428053918;
    for (const [f, ht, hr, L, far] of [[fLx, htx, hrx, ex(fLx, 99.92, htx, hrx), 99.92], [7.47e9, 2.68, 7.13, 87.20169, 146.0932], [100e9, 1000, 100, 144.497, 7943.9935]]) {
      const d = dist('exact', f, L, ht, hr);
      near(d, far, 1e-6, 'two-ray exact: near-tangent farthest root at ' + far + ' m (' + f / 1e9 + ' GHz)');
      nearAbs(ex(f, d, ht, hr), L, 1e-9, 'two-ray exact: near-tangent root reproduces L = ' + L.toFixed(5) + ' dB');
      let below = 0;
      for (let i = 1; i <= 100000; i++) { const x = d * (1 + 0.2 * i / 100000); if (ex(f, x, ht, hr) < L) below++; }
      ok(below === 0, 'two-ray exact: near-tangent, no farther solution than ' + d.toFixed(4) + ' m (fine scan)', below);
    }
    ok(isNaN(dist('exact', 900e6, 0, 30, 1.5)), 'two-ray exact: a loss below the minimum possible gives no distance');
    // last null: exact r2 − r1 = λ, none if 2·min(ht, hr) ≤ λ
    const dn = nul(900e6, 30, 1.5);
    near(dn, 268.512, 1e-5, 'two-ray: last null at 900 MHz, 30/1.5 m = 268.51 m (not 2·ht·hr/λ = 270.19 m)');
    nearAbs(Math.sqrt(dn * dn + 31.5 * 31.5) - Math.sqrt(dn * dn + 28.5 * 28.5), lam(900e6), 1e-9, 'two-ray: path difference at the last null = λ');
    near(nul(30e6, 30, 10), 51.283, 1e-4, 'two-ray: last null at 30 MHz, 30/10 m = 51.28 m');
    ok(typeof nul(50e6, 30, 1.5) === 'string' && /None/.test(nul(50e6, 30, 1.5)), 'two-ray: no null when 2·min(h) < λ', nul(50e6, 30, 1.5));
    ok([nul(NaN, 30, 1.5), nul(900e6, NaN, 1.5), nul(900e6, 30, NaN), nul(900e6, 0, 1.5)].every(x => typeof x === 'number' && isNaN(x)),
      'two-ray: last null is NaN (shown as —), not "None", when f or a height is missing');
    // plane-earth model below the crossover is flagged
    const c = byId('tworay'), st = A.calcInit(c);
    ok(!warnOf(c, st), 'two-ray: no warning at the defaults');
    st.cfg.model = 'plane';
    A.calcEdit(c, st, 'd', 10);
    near(st.vals.L, 40 - 20 * Math.log10(45), 1e-12, 'two-ray: plane earth at 10 m = 6.94 dB');
    ok(/not valid/.test(warnOf(c, st) || ''), 'two-ray: plane earth below the crossover is flagged', warnOf(c, st));
    st.cfg.model = 'auto'; A.calcEdit(c, st, 'd', 10);
    ok(!warnOf(c, st), 'two-ray: auto model below the crossover is not flagged');
  }

  // ---- radar equation, Doppler ------------------------------------------------
  {
    const c = byId('radareq'); const st = A.calcInit(c);
    const kT = 10 * Math.log10(KBz * 290 * 1e6 * 1000);
    near(st.vals.smin, kT + 3 + 13, 1e-12, 'radar: Smin = kTB + NF + SNR');
    A.calcEdit(c, st, 'sigma', 5);
    A.calcEdit(c, st, 'ls', 0);
    A.calcEdit(c, st, 'smin', -97);
    ok(st.status.R === 'calc', 'radar: R recalculated after entering Smin', JSON.stringify(st.status));
    near(st.vals.R, 58042.4, 1e-5, 'radar: 100 kW, 35 dBi, 10 GHz, 5 m², -97 dBm → 58.04 km');
  }
  {
    const c = byId('doppler'); const st = A.calcInit(c);
    near(st.vals.fd, 2 * 100 * 10e9 / C, 1e-12, 'Doppler: radar 100 m/s at 10 GHz = 6.67 kHz');
    st.cfg.mode = 'oneway';
    A.calcEdit(c, st, 'v', 100);
    near(st.vals.fd, 100 * 10e9 / C, 1e-12, 'Doppler: one-way');
    A.calcEdit(c, st, 'ang', 60);
    near(st.vals.vr, 50, 1e-12, 'Doppler: radial speed at 60°');
    ok(!warnOf(c, st), 'Doppler: no warning at 100 m/s');
    A.calcEdit(c, st, 'ang', 0); A.calcEdit(c, st, 'v', 1e7);
    ok(/first-order/.test(warnOf(c, st) || ''), 'Doppler: warning above 10⁶ m/s', warnOf(c, st));
    A.calcEdit(c, st, 'v', 5e8);
    ok(st.status.fd === 'err' && !isFinite(st.vals.fd) && /out of range/.test(st.msg), 'Doppler: speeds above c are rejected', JSON.stringify(st.status) + ' ' + st.msg);
    A.calcEdit(c, st, 'v', 0);
    ok(st.vals.fd === 0 && st.status.fd === 'calc', 'Doppler: a stationary target (v = 0) is a valid input', st.vals.fd + ' ' + st.msg);
    ok(byId('doppler').vars.find(d => d.id === 'v').max <= C && byId('doppler').vars.find(d => d.id === 'vr').max <= C, 'Doppler: speed limits ≤ c');
  }

  // ---- polarization mismatch -----------------------------------------------
  {
    const plf = fn('b3Plf');
    near(plf(Infinity, Infinity, 45, false), 0.5, 1e-12, 'PLF linear-linear 45° = 0.5');
    near(plf(Infinity, Infinity, 0, false), 1, 1e-12, 'PLF linear-linear aligned = 1');
    ok(Math.abs(plf(Infinity, Infinity, 90, false)) < 1e-12, 'PLF linear-linear crossed = 0');
    near(plf(0, Infinity, 30, false), 0.5, 1e-12, 'PLF circular-linear = 0.5');
    near(plf(0, 0, 0, false), 1, 1e-12, 'PLF circular same sense = 1');
    ok(Math.abs(plf(0, 0, 0, true)) < 1e-12, 'PLF circular opposite sense = 0');
    // 3 dB AR vs same-sense circular: (1+ρ)²/(2(1+ρ²))
    const r = Math.pow(10, -3 / 20);
    near(plf(3, 0, 0, false), Math.pow(1 + r, 2) / (2 * (1 + r * r)), 1e-12, 'PLF 3 dB AR vs circular');
    const st = init('polmis');
    near(st.vals.loss, -10 * Math.log10(st.vals.plf / 100), 1e-12, 'polmis: loss from PLF');
    // independent sum-of-squares form [(1 + ρ1ρ2)²cos²Δτ + (ρ1 + ρ2)²sin²Δτ] / [(1 + ρ1²)(1 + ρ2²)]
    const sq = (a1, a2, dt, opp) => { const r1 = Math.pow(10, -a1 / 20), r2 = (opp ? -1 : 1) * Math.pow(10, -a2 / 20), t = dt * Math.PI / 180;
      return (Math.pow(1 + r1 * r2, 2) * Math.cos(t) ** 2 + Math.pow(r1 + r2, 2) * Math.sin(t) ** 2) / ((1 + r1 * r1) * (1 + r2 * r2)); };
    near(plf(3, 6, 30, false), sq(3, 6, 30, false), 1e-12, 'PLF 3/6 dB at 30°, same sense = 0.92752');
    near(plf(3, 6, 30, true), sq(3, 6, 30, true), 1e-12, 'PLF 3/6 dB at 30°, opposite sense = 0.17191');
    near(plf(3, 6, 30, false), 0.927525, 1e-5, 'PLF 3/6 dB at 30° (Jones)');
    // orthogonal states (equal AR, opposite sense, 90°): exactly 0, so the loss is ∞ (was −1e-16 → error, or ≈ 158 dB)
    const c = byId('polmis'); st.cfg.sense = 'opp';
    const bad = [];
    for (let i = 1; i < 600; i++) {
      const a = i / 10;
      if (plf(a, a, 90, true) !== 0) bad.push(a);
      A.calcEdit(c, st, 'ar1', a); A.calcEdit(c, st, 'ar2', a); A.calcEdit(c, st, 'dt', 90);
      if (st.vals.loss !== Infinity || st.status.loss === 'err') bad.push(a + ' (solver)');
    }
    ok(bad.length === 0, 'polmis: orthogonal elliptical states give PLF 0 and loss ∞', bad.slice(0, 8));
    ok(/^[\d.e+-]+ … ∞ dB$/.test(outs(c, st)['Loss range over all tilt angles']), 'polmis: loss range ends at ∞ for orthogonal states', outs(c, st)['Loss range over all tilt angles']);
    nearAbs(outs(c, st)['Linear-equivalent: cos²Δτ'], 0, 0, 'polmis: cos²90° is exactly 0');
  }

  // ---- G/T --------------------------------------------------------------------
  {
    const st = init('gt');
    const L = Math.pow(10, 0.05), te = 290 * (Math.pow(10, 0.1) - 1), tr = 290 * (10 - 1);
    const ts = 50 + (L - 1) * 290 + L * (te + tr / 1000);
    near(st.vals.te, te, 1e-12, 'G/T: LNA Te from NF 1 dB = 75.1 K');
    near(st.vals.tsys, ts, 1e-12, 'G/T: system temperature');
    near(st.vals.gt, 40 - 10 * Math.log10(ts), 1e-12, 'G/T: 40 dBi antenna');
    // Friis for feed (L at 290 K) + LNA + rest, referred to the antenna terminals (excludes Ta)
    const F = L + L * (Math.pow(10, 0.1) - 1) + L * (10 - 1) / 1000;
    const o = outs(byId('gt'), st);
    near(o['Receive-chain noise figure (feed + LNA + rest, excl. antenna)'], 10 * Math.log10(F), 1e-9, 'G/T: receive-chain NF 1.531 dB (Friis, antenna excluded)');
    near(o['Operating noise factor T<sub>sys</sub>/T₀'], 10 * Math.log10(ts / 290), 1e-9, 'G/T: operating noise factor Tsys/T0 = −2.25 dB');
    const c = byId('gt');
    A.calcEdit(c, st, 'ta', 290); A.calcEdit(c, st, 'lf', 0);
    near(outs(c, st)['Receive-chain noise figure (feed + LNA + rest, excl. antenna)'], 10 * Math.log10(Math.pow(10, 0.1) + 9 / 1000), 1e-9, 'G/T: chain NF independent of Ta (1.03 dB, not 3.56 dB)');
  }

  // ---- components ---------------------------------------------------------------
  {
    const c = byId('minloss'); const st = A.calcInit(c);
    near(st.vals.r1, 43.3013, 1e-5, 'min-loss pad 75→50: R1 43.30 Ω');
    near(st.vals.r2, 86.6025, 1e-5, 'min-loss pad 75→50: R2 86.60 Ω');
    near(st.vals.loss, 5.7195, 1e-4, 'min-loss pad 75→50: 5.72 dB');
    A.calcEdit(c, st, 'zh', NaN); A.calcEdit(c, st, 'zl', NaN);
    A.calcEdit(c, st, 'r1', 43.3013); A.calcEdit(c, st, 'r2', 86.6025);
    near(st.vals.zh, 75, 1e-5, 'min-loss pad: impedances from the resistors (Z_high)');
    near(st.vals.zl, 50, 1e-5, 'min-loss pad: impedances from the resistors (Z_low)');
    // R2 with one impedance, ratios close to 1 (the numerical solve failed below ≈ 1.1)
    for (const [zh, zl] of [[100, 99], [100, 95], [51, 50], [75, 70], [75, 50], [1000, 1]]) {
      const r2 = zl / Math.sqrt(1 - zl / zh);
      let s = A.calcInit(c); A.calcEdit(c, s, 'zl', NaN); A.calcEdit(c, s, 'zh', zh); A.calcEdit(c, s, 'r2', r2);
      near(s.vals.zl, zl, 1e-9, 'min-loss pad: Z_low from Z_high = ' + zh + ' and R2 (' + zh + '/' + zl + ')');
      s = A.calcInit(c); A.calcEdit(c, s, 'zh', NaN); A.calcEdit(c, s, 'zl', zl); A.calcEdit(c, s, 'r2', r2);
      near(s.vals.zh, zh, 1e-9, 'min-loss pad: Z_high from Z_low = ' + zl + ' and R2 (' + zh + '/' + zl + ')');
    }
    const s = A.calcInit(c); A.calcEdit(c, s, 'zh', NaN); A.calcEdit(c, s, 'zl', 50); A.calcEdit(c, s, 'r2', 40);
    ok(!(s.vals.zh > 0), 'min-loss pad: R2 < Z_low has no solution (no negative Z_high)', s.vals.zh);
  }
  {
    const c = byId('wilkinson'); const st = A.calcInit(c);
    near(st.vals.z02, 50 * Math.SQRT2, 1e-12, 'Wilkinson equal: 70.71 Ω');
    near(st.vals.r, 100, 1e-12, 'Wilkinson equal: 100 Ω');
    near(st.vals.len, C / 4e9, 1e-12, 'Wilkinson: λ/4 = 74.9 mm at 1 GHz in air');
    A.calcEdit(c, st, 'ratio', 10 * Math.log10(2));
    const K = Math.SQRT2, Z0 = 50;
    const zin2 = st.vals.z02 * st.vals.z02 / (Z0 * K), zin3 = st.vals.z03 * st.vals.z03 / (Z0 / K);
    near(zin2 * zin3 / (zin2 + zin3), 50, 1e-12, 'Wilkinson 2:1: input matched');
    near(zin2 / zin3, 2, 1e-12, 'Wilkinson 2:1: P3/P2 = 2 from the line impedances');
  }
  {
    const st = init('aircoil');
    const c = byId('aircoil');
    A.calcEdit(c, st, 'd', 0.0254); A.calcEdit(c, st, 'len', 0.0254);
    near(st.vals.L, 100 / 58 * 1e-6, 1e-12, 'Wheeler: 10 turns, 1 in × 1 in = 1.724 µH');
    A.calcEdit(c, st, 'd', NaN);
    near(st.vals.d, 0.0254, 1e-9, 'Wheeler: diameter from L (quadratic inverse)');
  }

  // ---- Pi / T matching ----------------------------------------------------------
  {
    const piT = fn('b3PiT');
    for (const topo of ['pi-lp', 'pi-hp', 't-lp', 't-hp']) {
      for (const [Rs, RL, Q] of [[50, 10, 5], [50, 300, 8], [75, 75, 3]]) {
        const r = piT(topo, Rs, RL, Q, 100e6);
        ok(!r.err && Math.abs(r.zin.re - Rs) < 1e-9 * Rs && Math.abs(r.zin.im) < 1e-9 * Rs, topo + ': Zin = Rs for ' + Rs + '→' + RL + ' Ω, Q ' + Q, r.err || JSON.stringify(r.zin));
      }
      ok(!!piT(topo, 50, 10, 1.5, 100e6).err, topo + ': Q below the minimum is rejected');
    }
    const lp = piT('pi-lp', 50, 10, 5, 100e6);
    ok(lp.els[0].kind === 'C' && lp.els[1].kind === 'L' && lp.els[2].kind === 'C', 'Pi low-pass is C–L–C');
    const hp = piT('t-hp', 50, 10, 5, 100e6);
    ok(hp.els[0].kind === 'C' && hp.els[1].kind === 'L' && hp.els[2].kind === 'C', 'T high-pass is C–L–C');
  }

  // ---- 2-port cascade --------------------------------------------------------------
  {
    const casc = fn('b3Cascade');
    const wc = 2 * Math.PI * 1e9;
    const lpf = [{ type: 'sl', v: { L: String(50 / wc) } }, { type: 'shc', v: { C: String(2 / (50 * wc)) } }, { type: 'sl', v: { L: String(50 / wc) } }];
    const r = casc(lpf, 1e9, 50);
    near(20 * Math.log10(A.cabs(r.S[1][0])), -3.0103, 1e-4, 'cascade: 3rd-order Butterworth is -3.01 dB at cutoff');
    const pad = casc([{ type: 'shr', v: { R: '96.2475' } }, { type: 'sr', v: { R: '71.1512' } }, { type: 'shr', v: { R: '96.2475' } }], 1e9, 50);
    near(20 * Math.log10(A.cabs(pad.S[1][0])), -10, 1e-5, 'cascade: Pi pad from resistors = 10 dB');
    ok(A.cabs(pad.S[0][0]) < 1e-5, 'cascade: Pi pad is matched');
    const q = casc([{ type: 'line', v: { zc: '50', deg: '90', loss: '0' } }], 1e9, 50);
    const S25 = A.abcdToS(q.abcd, 25);
    near(A.cabs(S25[0][0]), 0.6, 1e-12, 'renormalise: 50 Ω λ/4 line seen at 25 Ω has |S11| = 0.6');
    const two8 = casc([{ type: 'line', v: { zc: '70', deg: '45', loss: '1' } }, { type: 'line', v: { zc: '70', deg: '45', loss: '1' } }], 1e9, 50);
    const one4 = casc([{ type: 'line', v: { zc: '70', deg: '90', loss: '2' } }], 1e9, 50);
    ok(A.mMaxAbs(A.mSub(two8.S, one4.S)) < 1e-12, 'cascade: two λ/8 lossy lines = one λ/4 line');
    near(20 * Math.log10(A.cabs(one4.S[1][0])) <= -2 ? 1 : 0, 1, 0, 'cascade: lossy line has at least its loss');
    const sb = casc([{ type: 's', v: { s11: '-15', a11: '30', s21: '-2', a21: '-60', s12: '-25', a12: '10', s22: '-12', a22: '-100' } }], 1e9, 50);
    near(20 * Math.log10(A.cabs(sb.S[1][0])), -2, 1e-9, 'cascade: S block round trip |S21|');
    near(A.cdeg(sb.S[0][0]), 30, 1e-9, 'cascade: S block round trip ∠S11');
    ok(!!casc([{ type: 'sl', v: { L: 'abc' } }], 1e9, 50).err, 'cascade: invalid parameter reported');
  }
};

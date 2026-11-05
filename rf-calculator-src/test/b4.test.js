// Batch 4 reference tests. FD = independent 2-D finite-difference field solution
// (energy method, Richardson-extrapolated; validated against Hammerstad–Jensen
// microstrip to ~0.3 % and against Cohn's exact stripline to 0.01 %).
// The coupled-microstrip even-mode references are open-boundary values (enclosure
// ≥ 100h, the consensus of three independent FD/FEM solvers, about ±0.2 %): the even
// mode carries net charge, so a small grounded box biases Z0e and εeff,e low.
// near() is relative; nearAbs() is used for dB values and fractions of λ.
module.exports = function (T) {
  const { ok, near, nearAbs, byId, A } = T;
  const ev = T.evalIn;
  const PI = Math.PI;
  const cx = (re, im) => ({ re, im: im || 0 });
  const b4KK = ev('b4KK'), b4Agm = ev('b4Agm');
  const b4Zin = ev('b4Zin'), b4ZlFromZin = ev('b4ZlFromZin'), b4StubMatch = ev('b4StubMatch');
  const b4Stripline = ev('b4Stripline'), b4StriplineCohn = ev('b4StriplineCohn');
  const b4Cpw = ev('b4Cpw'), b4Gcpw = ev('b4Gcpw'), b4Coupled = ev('b4Coupled'), microstrip = ev('microstrip');

  // ---------------------------------------------------------- elliptic ---
  near(PI / (2 * b4Agm(1, 0.6)), 1.9953027776647297, 1e-12, 'K(0.8) = 1.99530 via AGM');
  near(b4KK(Math.SQRT1_2), 1, 1e-14, 'K(k)/K(k\') = 1 at k = 1/√2');
  near(b4KK(0.3) * b4KK(Math.sqrt(1 - 0.09)), 1, 1e-12, 'K ratio reciprocity');

  // ------------------------------------------------- mismatch uncertainty -
  {
    const c = byId('mmunc'); const st = A.calcInit(c);
    near(st.vals.gp, 0.2 / 3, 1e-12, 'mmunc: |Γ1Γ2| for VSWR 1.5 and 2');
    near(st.vals.up, 20 * Math.log10(1 + 0.2 / 3), 1e-12, 'mmunc: upper limit');
    near(st.vals.mlnom, -10 * Math.log10(0.96 * (1 - 1 / 9)), 1e-12, 'mmunc: ML ignoring phase');
    ok(st.vals.mlmin >= 0 && st.vals.mlmin < st.vals.mlnom && st.vals.mlmax > st.vals.mlnom, 'mmunc: ML limits bracket the nominal', [st.vals.mlmin, st.vals.mlmax]);
    // classic power-sensor example: sensor VSWR 1.15, source VSWR 1.5 -> +0.120 / -0.122 dB
    A.calcEdit(c, st, 'vswr1', 1.5); A.calcEdit(c, st, 'vswr2', 1.15);
    nearAbs(st.vals.up, 0.12036, 2e-5, 'mmunc: 1.15 / 1.5 upper +0.120 dB');
    nearAbs(st.vals.lo, -0.12205, 2e-5, 'mmunc: 1.15 / 1.5 lower -0.122 dB');
    // exact: brute-force over phase
    const g1 = 0.2, g2 = 0.15 / 2.15;
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < 3600; k++) {
      const ph = k * PI / 1800, m = Math.hypot(1 - g1 * g2 * Math.cos(ph), g1 * g2 * Math.sin(ph));
      const ml = -10 * Math.log10((1 - g1 * g1) * (1 - g2 * g2) / (m * m));
      mn = Math.min(mn, ml); mx = Math.max(mx, ml);
    }
    nearAbs(st.vals.mlmin, mn, 1e-9, 'mmunc: best case equals brute-force phase sweep');
    nearAbs(st.vals.mlmax, mx, 1e-9, 'mmunc: worst case equals brute-force phase sweep');
  }

  // ------------------------------------------------- terminated line -----
  {
    const q = b4Zin(50, cx(100, 0), 90);
    near(q.re, 25, 1e-9, 'Zin: λ/4 transforms 100 Ω to 25 Ω'); ok(Math.abs(q.im) < 1e-9, 'Zin: λ/4 real');
    const h = b4Zin(50, cx(30, -40), 180);
    near(h.re, 30, 1e-9, 'Zin: λ/2 repeats the load (R)'); near(h.im, -40, 1e-9, 'Zin: λ/2 repeats the load (X)');
    const z = b4Zin(50, cx(100, 50), 36), back = b4ZlFromZin(50, z, 36);
    near(back.re, 100, 1e-12, 'Zin inverse R'); near(back.im, 50, 1e-12, 'Zin inverse X');
    // independent check with the Γ rotation: Γin = ΓL e^{-j2θ}
    const gl = A.zToGamma(cx(100, 50), 50), th = 36 * PI / 180;
    const gin = { re: gl.re * Math.cos(2 * th) + gl.im * Math.sin(2 * th), im: gl.im * Math.cos(2 * th) - gl.re * Math.sin(2 * th) };
    const g2 = A.zToGamma(z, 50);
    ok(Math.abs(g2.re - gin.re) < 1e-12 && Math.abs(g2.im - gin.im) < 1e-12, 'Zin agrees with Γ rotation');
    const c = byId('linezin'); const st = A.calcInit(c);
    const th0 = 360 * 0.03 * 1e9 / 299792458;
    near(st.vals.deg, th0, 1e-12, 'linezin: 30 mm at 1 GHz in air = 36.025°');
    const z0d = b4Zin(50, cx(100, 50), th0);
    near(st.vals.Rin, z0d.re, 1e-9, 'linezin: Rin'); near(st.vals.Xin, z0d.im, 1e-9, 'linezin: Xin');
    // backwards: enter Zin, solve the load (2x2 block)
    A.calcEdit(c, st, 'Rin', 40); A.calcEdit(c, st, 'Xin', 20);
    ok(st.status.RL === 'calc' && st.status.XL === 'calc' && st.status.len === 'in', 'linezin: entering Zin solves the load', JSON.stringify(st.status));
    const zl = b4ZlFromZin(50, cx(40, 20), th0);
    near(st.vals.RL, zl.re, 1e-6, 'linezin: solved RL'); near(st.vals.XL, zl.im, 1e-6, 'linezin: solved XL');
  }

  // ------------------------------------------------------ stub matching --
  {
    const L = s => s.map(o => [o.bd / (2 * PI), o.bl / (2 * PI)]);
    // Pozar Example 5.2: ZL = 60 − j80, Z0 = 50, short-circuited shunt stubs: d = 0.110/0.260 λ, ℓ = 0.095/0.405 λ
    const a = L(b4StubMatch(50, cx(60, -80), 50, 'shunt-short'));
    nearAbs(a[0][0], 0.110, 0.001, 'Pozar 5.2 d1'); nearAbs(a[0][1], 0.095, 0.001, 'Pozar 5.2 l1');
    nearAbs(a[1][0], 0.260, 0.001, 'Pozar 5.2 d2'); nearAbs(a[1][1], 0.405, 0.001, 'Pozar 5.2 l2');
    // Pozar Example 5.3: ZL = 100 + j80, series open stub: d = 0.120/0.463 λ, ℓ = 0.397/0.103 λ
    const b = L(b4StubMatch(50, cx(100, 80), 50, 'series-open')).sort((p, q) => p[0] - q[0]);
    nearAbs(b[0][0], 0.120, 0.001, 'Pozar 5.3 d1'); nearAbs(b[0][1], 0.397, 0.001, 'Pozar 5.3 l1');
    nearAbs(b[1][0], 0.463, 0.001, 'Pozar 5.3 d2'); nearAbs(b[1][1], 0.103, 0.001, 'Pozar 5.3 l2');
    for (const ty of ['shunt-short', 'shunt-open', 'series-short', 'series-open']) {
      for (const [r, x, zs] of [[60, -80, 50], [10, 30, 75], [200, 0, 50], [50, 40, 100], [25, -10, 50]]) {
        const sols = b4StubMatch(50, cx(r, x), zs, ty);
        ok(sols.length === 2 && sols.every(s => s.gres < 1e-9 && s.bd >= 0 && s.bd <= PI && s.bl >= 0 && s.bl <= PI),
          'stub ' + ty + ' ZL=' + r + (x < 0 ? '' : '+') + x + 'j zs=' + zs + ' matches', sols.map(s => s.gres));
      }
    }
  }

  // ---------------------------------------------------------- stripline --
  {
    // zero thickness vs Cohn's exact formula
    for (const wb of [0.2, 0.5, 1, 2, 4]) near(b4Stripline(wb, 1, 0, 2.2), b4StriplineCohn(wb, 1, 2.2), 0.006, 'stripline t=0 W/b=' + wb + ' vs Cohn (±0.6 %)');
    // with thickness vs FD (air, Z0 in ohm)
    for (const [wb, tb, fd] of [[0.5, 0.1, 83.108], [1, 0.05, 59.947], [0.25, 0.2, 94.454], [1.5, 0.1, 41.934]]) {
      near(b4Stripline(wb, 1, tb, 1), fd, 0.006, 'stripline W/b=' + wb + ' t/b=' + tb + ' vs FD (±0.6 %)');
    }
    // Pozar Example 3.? : 50 Ω stripline, b = 3.2 mm, εr = 2.2 -> W ≈ 2.66 mm (Pozar's approximate formula)
    const c = byId('stripline'); const st = A.calcInit(c);
    A.calcEdit(c, st, 'b', 3.2e-3); A.calcEdit(c, st, 't', 0); A.calcEdit(c, st, 'er', 2.2);
    ok(st.status.W === 'calc', 'stripline: width is the solved quantity', JSON.stringify(st.status));
    near(st.vals.W, 2.66e-3, 0.015, 'stripline: Pozar 50 Ω width 2.66 mm (±1.5 %)');
  }

  // ----------------------------------------------------------- CPW -------
  {
    near(b4Cpw(1, (1 / Math.SQRT1_2 - 1) / 2, 1e6, 1).z0, 30 * PI, 1e-9, 'CPW in air, k = 1/√2: Z0 = 30π');
    const thick = b4Cpw(1, 0.3, 1e4, 9);
    near(thick.ee, 5, 1e-9, 'CPW on very thick substrate: εeff = (εr+1)/2');
    for (const [W, s, h, er, z, e, tol] of [[1, 0.2, 1.6, 4.4, 57.07, 2.6454, 0.01], [0.5, 0.25, 0.5, 10, 54.07, 4.9142, 0.012],
      [1, 0.5, 4, 4.4, 73.37, 2.6797, 0.01], [2, 0.5, 0.8, 3.55, 70.82, 1.9401, 0.025]]) {
      const r = b4Cpw(W, s, h, er);
      near(r.z0, z, tol, 'CPW W=' + W + ' s=' + s + ' h=' + h + ' vs FD Z0 (±' + tol * 100 + ' %)');
      near(r.ee, e, tol, 'CPW W=' + W + ' s=' + s + ' h=' + h + ' vs FD εeff');
    }
    for (const [W, s, h, er, z, e] of [[1, 0.2, 1.6, 4.4, 54.19, 2.7530], [0.5, 0.25, 0.5, 10, 42.50, 6.0570], [2, 0.5, 0.8, 3.55, 42.84, 2.6423], [1, 0.5, 4, 4.4, 72.18, 2.7153]]) {
      const r = b4Gcpw(W, s, h, er);
      near(r.z0, z, 0.007, 'GCPW W=' + W + ' s=' + s + ' h=' + h + ' vs FD Z0 (±0.7 %)');
      near(r.ee, e, 0.007, 'GCPW W=' + W + ' s=' + s + ' h=' + h + ' vs FD εeff');
    }
    // GCPW with a far-away ground approaches CPW on a thick substrate
    near(b4Gcpw(1, 0.2, 200, 4.4).z0, b4Cpw(1, 0.2, 200, 4.4).z0, 0.002, 'GCPW → CPW as h → ∞');
  }

  // ------------------------------------------------- coupled microstrip --
  {
    for (const [u, g, er, ze, zo, ee, eo] of [[1, 0.2, 4.4, 92.12, 43.77, 3.368, 2.7813], [1, 1, 4.4, 80.66, 60.62, 3.391, 2.8835],
      [0.5, 0.4, 10, 84.42, 45.71, 6.849, 5.6245], [2, 0.2, 2.2, 80.71, 43.71, 1.918, 1.6730], [1, 0.4, 9.8, 60.72, 35.70, 7.130, 5.6787]]) {
      const k = b4Coupled(u, g, 1, er);
      const tag = ' u=' + u + ' g=' + g + ' εr=' + er + ' vs FD';
      near(k.ze, ze, 0.01, 'coupled Z0e' + tag + ' (±1 %)');
      near(k.zo, zo, 0.01, 'coupled Z0o' + tag + ' (±1 %)');
      near(k.eee, ee, 0.01, 'coupled εeff,e' + tag + ' (±1 %)');
      near(k.eeo, eo, 0.01, 'coupled εeff,o' + tag + ' (±1 %)');
    }
    const far = b4Coupled(1, 8, 1, 4.4), single = microstrip(1, 1, 0, 4.4);
    near(far.ze, single.z0, 0.02, 'coupled: widely spaced Z0e → single line');
    near(far.zo, single.z0, 0.02, 'coupled: widely spaced Z0o → single line');
    // coupler synthesis: 10 dB, 50 Ω on 1.6 mm FR-4
    const c = byId('coupledms'); const st = A.calcInit(c);
    A.calcEdit(c, st, 'Zc', 50); A.calcEdit(c, st, 'cdb', 10);
    ok(st.status.W === 'calc' && st.status.s === 'calc', 'coupledms: Z0 and coupling solve W and s', JSON.stringify(st.status) + ' ' + st.msg);
    near(st.vals.Z0e * st.vals.Z0o, 2500, 1e-6, 'coupledms: Z0e·Z0o = Z0²');
    near((st.vals.Z0e - st.vals.Z0o) / (st.vals.Z0e + st.vals.Z0o), Math.pow(10, -0.5), 1e-6, 'coupledms: 10 dB coupling');
    near(st.vals.Z0e, 50 * Math.sqrt((1 + Math.pow(10, -0.5)) / (1 - Math.pow(10, -0.5))), 1e-6, 'coupledms: Z0e = 69.37 Ω');
  }

  // ===================================================== audit regressions ==
  const valsOf = (c, st) => T.evalIn('calcValues')(c, st);
  const outOf = (c, st, lab) => { const o = c.outputs.find(x => x.label.startsWith(lab)); return o ? o.fn(valsOf(c, st)) : undefined; };
  // stub at the load: a load already on the r = 1 / g = 1 circle gives d = 0 exactly
  {
    const s1 = b4StubMatch(50, cx(50, -30), 50, 'series-open');
    ok(s1.some(s => s.bd === 0) && s1.every(s => s.gres < 1e-9), 'stub d = 0: 50 − j30 series open has a solution at the load (not λ/2)', s1.map(s => s.bd));
    ok(b4StubMatch(50, cx(50, 30), 50, 'series-open').some(s => s.bd === 0), 'stub d = 0: 50 + j30 series open gives exactly 0 (no 3e-17 λ residue)');
    ok(b4StubMatch(50, cx(50, -80), 50, 'series-short').some(s => s.bd === 0), 'stub d = 0: 50 − j80 series short');
    ok(b4StubMatch(50, cx(40, -20), 50, 'shunt-short').some(s => s.bd === 0), 'stub d = 0: Y = 0.02 + j0.01 S (g = 1) shunt short');
    // the shortest pair (d + ℓ) is then the one at the load
    const tot = s1.map(s => s.bd + s.bl);
    ok(s1[tot.indexOf(Math.min(...tot))].bd === 0, 'stub d = 0: shortest d + ℓ is the solution at the load', tot);
    let bad = 0;
    for (const ty of ['series-open', 'series-short']) for (let x = -200; x <= 200; x += 1) {
      if (x === 0) continue;
      const sols = b4StubMatch(50, cx(50, x), 50, ty);
      if (!sols.some(s => s.bd === 0) || sols.some(s => s.gres > 1e-9 || (s.bd > 0 && s.bd < 1e-9) || s.bd > PI - 1e-9)) bad++;
    }
    ok(bad === 0, 'stub d = 0: RL = Z0 sweep X = −200…200 Ω, series stubs: one root exactly 0, none at λ/2', bad);
    // Pozar order and values unchanged by the cancellation-free roots
    const p = b4StubMatch(50, cx(60, -80), 50, 'shunt-short');
    nearAbs(p[0].bd / (2 * PI), 0.11042, 1e-5, 'stub roots: Pozar 5.2 first root order kept');
  }
  // mismatch uncertainty: labelled limits and the delivered-power range in dB
  {
    const c = byId('mmunc'); const st = A.calcInit(c);
    A.calcEdit(c, st, 'g1', 0.2); A.calcEdit(c, st, 'g2', 0.5);
    ok(outOf(c, st, 'Mismatch uncertainty limits 20·log(1 ± |Γ₁Γ₂|)') === '-0.9151 … +0.8279 dB', 'mmunc labels: uncertainty limits row says what it measures', outOf(c, st, 'Mismatch uncertainty limits'));
    ok(outOf(c, st, 'Delivered power vs. phase-ignored value, dB') === '-0.8279 … +0.9151 dB', 'mmunc labels: delivered power in dB matches the % row', outOf(c, st, 'Delivered power vs. phase-ignored value, dB'));
    ok(outOf(c, st, 'Delivered power vs. phase-ignored value, %') === '-17.36 … +23.46 %', 'mmunc labels: delivered power in %', outOf(c, st, 'Delivered power vs. phase-ignored value, %'));
    nearAbs(st.vals.mlmin, st.vals.mlnom + st.vals.lo, 1e-12, 'mmunc labels: best-phase loss = nominal + lower limit');
  }
  // mismatch uncertainty: one port from a total (best / worst phase) loss
  {
    const c = byId('mmunc'); let st = A.calcInit(c);
    A.calcEdit(c, st, 'mlmax', 3);
    near(st.vals.g2, Math.tanh(Math.acosh(Math.pow(10, 0.15)) - Math.atanh(0.2)), 1e-9, 'mmunc inverse: worst-phase 3 dB with VSWR 1.5 gives |Γ₂| = 0.5895');
    ok(st.status.g2 === 'calc' && st.msg === '', 'mmunc inverse: mlmax + port 1 solves without a message', st.msg);
    st = A.calcInit(c); const m0 = st.vals.mlmax;
    A.calcEdit(c, st, 'mlmax', m0);
    near(st.vals.g2, 1 / 3, 1e-9, 'mmunc inverse: own mlmax value recovers |Γ₂| = 1/3');
    st = A.calcInit(c); A.calcEdit(c, st, 'g1', 0.2); A.calcEdit(c, st, 'mlmin', 0.5);
    near(st.vals.g2, Math.tanh(Math.atanh(0.2) + Math.acosh(Math.pow(10, 0.025))), 1e-6, 'mmunc inverse: best-phase 0.5 dB with |Γ₁| = 0.2 (only root above |Γ₁|)');
    st = A.calcInit(c); A.calcEdit(c, st, 'mlmin', 0.05);
    near(st.vals.g2, Math.tanh(Math.atanh(0.2) + Math.acosh(Math.pow(10, 0.0025))), 1e-6, 'mmunc inverse: of two best-phase roots the one nearer the previous |Γ₂| is kept');
    st = A.calcInit(c); A.calcEdit(c, st, 'mlmax', 0.1);
    ok(isNaN(st.vals.g2) && st.msgLevel === 'err', 'mmunc inverse: worst-phase loss below port 1 alone has no solution', st.msg);
    st = A.calcInit(c); A.calcEdit(c, st, 'vswr2', Infinity);
    ok(st.vals.g2 === 1 && st.vals.mlmax === Infinity && st.msgLevel !== 'err', 'mmunc: VSWR ∞ gives |Γ₂| = 1 and infinite loss', st.vals.g2 + ' ' + st.msg);
  }
  // terminated line: short / reactive load gives VSWR ∞ without an error
  {
    const c = byId('linezin'); let st = A.calcInit(c);
    A.calcEdit(c, st, 'RL', 0); A.calcEdit(c, st, 'XL', 0);
    ok(st.vals.gin === 1 && st.vals.vswr === Infinity && st.status.vswr === 'calc' && st.msgLevel !== 'err', 'linezin short: |Γ| = 1, VSWR ∞, no error', st.vals.vswr + ' ' + st.msg);
    near(st.vals.Xin, 50 * Math.tan(360 * 0.03 * 1e9 / 299792458 * PI / 180), 1e-12, 'linezin short: Zin = jZ0·tan θ');
    A.calcEdit(c, st, 'XL', 50);
    ok(st.vals.vswr === Infinity && st.msgLevel !== 'err', 'linezin reactive load: VSWR ∞, no error', st.msg);
    ok(!st.badIn.length, 'linezin: RL = 0 (short) is a valid input');
    st = A.calcInit(c); A.calcEdit(c, st, 'RL', 1e-12); A.calcEdit(c, st, 'XL', 0);
    ok(st.status.vswr === 'calc' && st.vals.vswr > 1e13 && st.msgLevel !== 'err', 'linezin RL = 1e-12: large finite VSWR, no error', st.vals.vswr + ' ' + st.msg);
    st = A.calcInit(c); A.calcEdit(c, st, 'vswr', Infinity); A.calcEdit(c, st, 'ang', 30);
    ok(st.vals.gin === 1 && Math.abs(st.vals.RL) < 1e-6 && st.msgLevel !== 'err', 'linezin: VSWR ∞ entered solves a reactive load', st.vals.RL + ' ' + st.msg);
    st = A.calcInit(c);
    ok(Math.abs(st.vals.vswr - 2.618) < 1e-3, 'linezin: 100 + j50 load still gives VSWR 2.618', st.vals.vswr);
  }
  // terminated line: a half-wave line repeats the load exactly (no fH / kF residue)
  {
    for (const deg of [180, 360, 540, 179.99999999999997]) {
      const z = b4Zin(50, cx(100, 0), deg);
      ok(z.re === 100 && z.im === 0, 'λ/2 exact: θ = ' + deg + '° repeats 100 Ω', z.re + ' ' + z.im);
    }
    ok(b4Zin(50, cx(1e9, 0), 180).im === 0 && b4Zin(50, cx(1e-12, 0), 180).im === 0, 'λ/2 exact: very large and very small loads');
    const back = b4ZlFromZin(50, cx(30, -40), 360);
    ok(back.re === 30 && back.im === -40, 'λ/2 exact: inverse repeats the input');
    const c = byId('linezin'); const st = A.calcInit(c);
    A.calcEdit(c, st, 'XL', 0); A.calcEdit(c, st, 'deg', 180);
    ok(outOf(c, st, 'Z<sub>in</sub> reactance') === 'no reactance', 'λ/2 exact: L/C row says no reactance at 180°', outOf(c, st, 'Z<sub>in</sub> reactance'));
    A.calcEdit(c, st, 'RL', 1e9);
    ok(outOf(c, st, 'Z<sub>in</sub> reactance') === 'no reactance', 'λ/2 exact: also for RL = 1 GΩ');
    const z36 = b4Zin(50, cx(100, 50), 36), z216 = b4Zin(50, cx(100, 50), 216);
    ok(Math.abs(z36.re - z216.re) < 1e-12 && Math.abs(z36.im - z216.im) < 1e-12, 'λ/2 exact: other angles keep the 180° period');
  }
  // GCPW / CPW: wide strips (k → 1) and huge W/h
  {
    // exact values from the closed-form k3' (log form), Simons §2.4
    for (const [W, z] of [[20, 8.41518], [22, 7.75008], [24, 7.18333], [26, 6.69448], [30, 5.89375], [50, 3.69403]]) {
      near(b4Gcpw(W, 0.2, 1, 3.55).z0, z, 2e-5, 'GCPW wide strip W/h = ' + W + ': Z0 = ' + z + ' Ω (no cancellation in k3\')');
    }
    ok([1e4, 1e5, 1e8].every(W => { const r = b4Gcpw(W, 0.2, 1, 3.55); return isFinite(r.z0) && r.z0 > 0 && Math.abs(r.ee - 3.55) < 1e-2; }), 'GCPW very wide strip: finite Z0, εeff → εr');
    near(b4Gcpw(1e8, 0.2, 1, 3.55).z0, 376.730313 / Math.sqrt(3.55) / 1e8, 1e-3, 'GCPW W/h = 1e8: parallel-plate limit η0·h/(W·√εr)');
    near(b4Gcpw(1, 0.2, 1.6, 4.4).z0, 54.19, 0.007, 'GCPW normal geometry unchanged');
    const c = byId('gcpw'); const st = A.calcInit(c);
    A.calcEdit(c, st, 'Z0', 10);
    ok(st.status.W === 'calc' && Math.abs(b4Gcpw(st.vals.W * 1e3, 0.2, 0.508, 3.55).z0 - 10) < 1e-6, 'GCPW design: Z0 = 10 Ω solves W (about 8.55 mm)', st.vals.W + ' ' + st.msg);
    A.calcEdit(c, st, 'Z0', 5);
    ok(st.status.W === 'calc', 'GCPW design: Z0 = 5 Ω solves W', st.msg);
    // CPW: sinh no longer overflows; compare with k1 = e^(a−b)·expm1(−2a)/expm1(−2b)
    const W = 10, s = 0.001, h = 0.01, er = 4.4, a = PI * W / (4 * h), b = PI * (W + 2 * s) / (4 * h);
    const k1 = Math.exp(a - b) * Math.expm1(-2 * a) / Math.expm1(-2 * b);
    const ee = 1 + (er - 1) / 2 * b4KK(k1) / b4KK(W / (W + 2 * s));
    near(b4Cpw(W, s, h, er).ee, ee, 1e-6, 'CPW W/h = 1000: εeff from the substrate is kept (not 1)');
    near(b4Cpw(1, 0.2, 1.6, 4.4).z0, 57.07, 0.01, 'CPW normal geometry unchanged');
  }
  // GCPW: warning for wide gaps (model above microstrip), CPW: thin substrate
  {
    const c = byId('gcpw'); let st = A.calcInit(c);
    ok(c.warn(valsOf(c, st)) === null, 'GCPW warn: none for the default 0.2 mm gap on 0.508 mm');
    A.calcEdit(c, st, 'h', 0.2e-3); A.calcEdit(c, st, 's', 1e-3); A.calcEdit(c, st, 'W', 0.2e-3);
    ok(st.vals.Z0 > outOf(c, st, 'Microstrip with') && /above the plain microstrip/.test(c.warn(valsOf(c, st)) || ''), 'GCPW warn: s = 5h flags Z0 above microstrip', c.warn(valsOf(c, st)));
    st = A.calcInit(c); A.calcEdit(c, st, 's', 0.5e-3);
    ok(/Gap wider than h\/2/.test(c.warn(valsOf(c, st)) || ''), 'GCPW warn: s ≈ h flags overestimated Z0', c.warn(valsOf(c, st)));
    ok(/s ≤ h\/2/.test(c.note), 'GCPW note: states the accuracy range');
    const p = byId('cpw'); const sp = A.calcInit(p);
    ok(p.warn(valsOf(p, sp)) === null, 'CPW warn: none for 1.6 mm FR-4 default');
    A.calcEdit(p, sp, 'h', 0.2e-3); A.calcEdit(p, sp, 's', 1e-3);
    ok(/Thin substrate/.test(p.warn(valsOf(p, sp)) || ''), 'CPW warn: thin substrate h < (W+2s)/4');
    ok(/6\.5 %/.test(p.note) && !/about 2 % when h is smaller/.test(p.note), 'CPW note: thin-substrate error stated (up to 6.5 % in εeff)');
  }
  // substrate preset: Custom option (the UI switches to it after an edit)
  for (const id of ['stripline', 'cpw', 'gcpw', 'coupledms']) {
    const cfg = byId(id).cfg.find(x => x.id === 'sub');
    ok(cfg.options.some(o => o[0] === 'custom') && JSON.stringify(cfg.set('custom')) === '{}' && cfg.set(cfg.def).er > 1, id + ': substrate preset has a Custom option that sets nothing');
  }
  // dielectric loss at εr = 1: continuous, and the CPW limit is the geometric filling factor
  {
    for (const id of ['cpw', 'gcpw', 'stripline']) {
      const c = byId(id); const st = A.calcInit(c);
      A.calcEdit(c, st, 'tand', 0.01); A.calcEdit(c, st, 'er', 1.000001);
      const a = outOf(c, st, 'Dielectric loss');
      A.calcEdit(c, st, 'er', 1);
      const b = outOf(c, st, 'Dielectric loss');
      near(b, a, 1e-5, id + ': dielectric loss is continuous at εr = 1 (' + a + ' dB/m)');
    }
    const W = 1e-3, s = 0.2e-3, h = 1.6e-3;
    const q = 0.5 * b4KK(Math.sinh(PI * W / (4 * h)) / Math.sinh(PI * (W + 2 * s) / (4 * h))) / b4KK(W / (W + 2 * s));
    const loss = T.evalIn('b4LossD');
    near(loss(1e9, 1, e => b4Cpw(W, s, h, e).ee, 0.01), 20 / Math.LN10 * PI * 1e9 / 299792458 * q * 0.01, 1e-6, 'CPW loss at εr = 1 uses q = ½·K(k1)K(k0\')/(K(k1\')K(k0))');
    ok(loss(1e9, 1, e => e, 0) === 0, 'air line with tanδ = 0: zero dielectric loss (not NaN)');
    // εr just below 1 is admitted by the range tolerance: the loss stays finite and continuous
    for (const id of ['cpw', 'gcpw', 'stripline']) {
      const c = byId(id); const st = A.calcInit(c);
      A.calcEdit(c, st, 'tand', 0.01); A.calcEdit(c, st, 'er', 1);
      const a = outOf(c, st, 'Dielectric loss');
      A.calcEdit(c, st, 'er', 1 - 5e-10);
      const b = outOf(c, st, 'Dielectric loss');
      ok(st.vals.er < 1 && isFinite(b) && Math.abs(b - a) <= 1e-6 * a, id + ': dielectric loss at εr = 1 − 5e-10 is finite and equals the εr = 1 value', a + ' / ' + b);
    }
    ok(isFinite(loss(1e9, 1 - 5e-10, e => b4Cpw(W, s, h, e).ee, 0.01)) && isNaN(loss(1e9, 0, e => e, 0.01)), 'b4LossD: finite just below εr = 1, NaN only for εr ≤ 0');
  }
  // stub card load |Γ|: a passive load never rounds above 1 (no false "active" VSWR tag)
  {
    const gm = T.evalIn('b4GammaMag');
    let worst = 0;
    for (const R of [0, 1e-300, 1e-12, 1e-6]) for (let X = -500; X <= 500; X += 7) for (const z0 of [50, 75, 37.3]) worst = Math.max(worst, gm(R, X, z0));
    ok(worst <= 1, 'stubmatch: |Γ| of R ≥ 0 loads is ≤ 1 after rounding (max ' + worst + ')');
  }
  // substrate presets hold finite values, so the Custom switch tolerance test is well defined
  for (const id of ['stripline', 'cpw', 'gcpw', 'coupledms']) {
    const cfg = byId(id).cfg.find(x => x.id === 'sub');
    ok(cfg.options.filter(o => o[0] !== 'custom').every(o => Object.values(cfg.set(o[0])).every(x => isFinite(x) && x >= 0)), id + ': every substrate preset sets finite values');
  }
};

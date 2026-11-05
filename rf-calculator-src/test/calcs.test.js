// Regression tests for the phase-1 calculators (src/calcs.js, src/rf.js, src/data.js).
// Works as a test module, require(...)(T) with T = { A, ok, evalIn, byId } like the batch
// modules, or standalone: node test/calcs.test.js
module.exports = function (T) {
  const { ok, A } = T;
  const ev = T.evalIn;
  const byId = T.byId || (id => A.CALCS.find(c => c.id === id));
  // local comparisons, independent of how the harness defines near()
  const rel = (a, b, tol, name) => ok(Math.abs(a - b) <= tol * Math.abs(b) || (b === 0 && Math.abs(a) <= tol), name, a + ' vs ' + b);
  const abs = (a, b, tol, name) => ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b);
  const KB = 1.380649e-23, C0 = 299792458, PI = Math.PI;
  const dbp = x => 10 * Math.log10(x), fromDbp = d => Math.pow(10, d / 10);
  // fresh state with exactly the given inputs entered (in this order)
  const only = (id, inputs) => {
    const c = byId(id); const st = A.calcInit(c);
    for (const k of c.eqVars) { st.status[k] = 'empty'; st.vals[k] = NaN; }
    for (const k in inputs) A.calcEdit(c, st, k, inputs[k]);
    return { c, st };
  };
  const vals = (c, st) => ev('calcValues')(c, st);
  const warnOf = (c, st) => c.warn ? c.warn(vals(c, st)) : null;
  const outRow = (c, st, label) => { const o = c.outputs.find(x => x.label.indexOf(label) === 0); return o ? o.fn(vals(c, st)) : undefined; };

  // ------------------------------------------------------------- data ---
  {
    const S = ev('SUBSTRATES'), K = ev('CONDUCTORS'), CB = ev('CABLES'), B = ev('COMMON_BANDS');
    const sub = n => S.find(s => s.name === n);
    ok(sub('Rogers RO3006').er === 6.5 && sub('Rogers RO3010').er === 11.2, 'data: RO3006 / RO3010 use the design Dk (6.50 / 11.2)');
    ok(!!sub('Isola 370HR (~2 GHz)'), 'data: Isola 370HR is labelled with its 2 GHz basis');
    const cond = n => K.find(c => c.name === n);
    ok(cond('Gold').rho === 2.21e-8 && cond('Gold (electroplated, typ.)').rho === 2.44e-8, 'data: gold 2.21e-8 (CRC 20 °C) plus an electroplated entry');
    ok(cond('Tin').rho === 1.24e-7, 'data: tin 1.24e-7 at 20 °C (above the 0 °C 1.15e-7)');
    ok(cond('Tungsten').rho === 5.28e-8, 'data: tungsten 5.28e-8 (CRC 20 °C)');
    ok(/below ~100 MHz/.test(K.find(c => c.mur === 100).name), 'data: nickel μr = 100 is labelled as low-frequency only');
    ok(K[1].name === 'Copper (pure)' && K[K.length - 1].name === 'Gold (electroplated, typ.)', 'data: new conductor appended, preset indices unchanged');
    ok(CB.find(c => c.name === 'RG-174').fmax === 1 && CB.find(c => c.name === 'RG-58 C/U').fmax === 1, 'data: RG-174 / RG-58 rated to 1 GHz (MIL-DTL-17)');
    const ism = B.find(b => b[3] === 'ISM' && b[1] === 2400e6);
    ok(ism && ism[2] === 2500e6 && B.some(b => b[1] === 2400e6 && b[2] === 2483.5e6 && b[3] === ''), 'data: ISM 2.45 GHz is 2400–2500 MHz; 2400–2483.5 MHz is the SRD band');
  }

  // ------------------------------------------------- vswrOf, Γ = 1 ---
  {
    const vswrOf = ev('vswrOf');
    ok(vswrOf(1.2) === Infinity && vswrOf(1) === Infinity && isNaN(vswrOf(NaN)), 'vswrOf: |Γ| ≥ 1 gives ∞ (never negative), NaN stays NaN');
    rel(vswrOf(1 / 3), 2, 1e-12, 'vswrOf: |Γ| = 1/3 gives 2');
    let bad = 0;
    for (const X of [0.1, -0.1, 5, -5, 30, -30, 200, -200, 1, 25]) {
      const { c, st } = only('zgamma', { Z0: 50, R: 0, X: X, f: 1e9 });
      if (!(st.status.vswr === 'calc' && st.vals.vswr === Infinity && st.vals.g === 1 && st.vals.rl === 0 && !st.msg)) bad++;
    }
    ok(bad === 0, 'zgamma: R = 0 (pure reactance) gives |Γ| = 1, VSWR = ∞, RL = 0 dB without an error', bad + ' failures');
    const z = byId('zgamma');
    ok(z.byId.R.inMin === 0, 'zgamma: R = 0 is a valid input');
    const { st } = only('vswr', { rl: 1e-14 });
    ok(st.status.vswr === 'calc' && st.vals.vswr > 1e14, 'vswr: |Γ| just below 1 gives a large finite VSWR, not an error', st.status.vswr + ' ' + st.vals.vswr);
    const s2 = only('vswr', { vswr: Infinity });
    ok(s2.st.vals.g === 1 && s2.st.vals.rl === 0, 'vswr: VSWR = ∞ maps back to |Γ| = 1', s2.st.vals.g);
  }

  // ----------------------------------------- simple S-parameter views ---
  {
    const { c, st } = only('spower2', { s11: 3, s21: -10, pin: 0 });
    ok(st.vals.vswr === Infinity || st.status.vswr === 'err', 'spower2: |S11| > 0 dB never shows a negative VSWR', st.vals.vswr);
    ok(/active/.test(warnOf(c, st) || ''), 'spower2: |S11| > 0 dB warns about an active port');
    const p = only('spower2', { s11: -15, s21: 10, pin: 0 });
    ok(/not a passive network/.test(warnOf(p.c, p.st) || ''), 'spower2: gain warning is produced when |S11|² + |S21|² > 1');
    const q = only('spower3', { s11: 3, s21: -3, s31: -3, pin: 0 });
    ok(outRow(q.c, q.st, 'Input VSWR') === '∞ (|Γ| > 1, active)', 'spower3: Input VSWR row for |S11| > 1 says active, not a negative number', outRow(q.c, q.st, 'Input VSWR'));
    // datasheet-style entry: return loss + split ratio + excess loss
    // a lossless (|S11| = 0 dB) port with rounding residue is passive: ∞, no 'active' tag or warning
    for (const s11 of [0, 1e-12, -1e-12]) {
      const z = only('spower3', { s11, s21: -30, s31: -30, pin: 0 });
      const row = outRow(z.c, z.st, 'Input VSWR');
      ok(typeof row === 'number' && row > 1e12 && !/active/.test(warnOf(z.c, z.st) || ''), 'spower3: |S11| = 0 dB (' + s11 + ') shows VSWR ∞ without the active tag', row + ' ' + warnOf(z.c, z.st));
    }
    const z2 = only('spower2', { s11: 1e-12, s21: -30 });
    ok(!/active/.test(warnOf(z2.c, z2.st) || ''), 'spower2: |S11| = 0 dB + rounding is not flagged active', warnOf(z2.c, z2.st));
    const r = only('spower3', { rl: 20, ratio: 0.1, el: 0.2, pin: 0 });
    const k = fromDbp(0.1), s21 = dbp(fromDbp(-0.2) * k / (1 + k));
    abs(r.st.vals.s21, s21, 1e-9, 'spower3: RL + split ratio + excess loss gives S21 = −3.1606 dB');
    abs(r.st.vals.s31, s21 - 0.1, 1e-9, 'spower3: ... and S31 = S21 − ratio');
    ok(!r.st.msg, 'spower3: RL + ratio + EL solves without a message', r.st.msg);
    const r2 = only('spower3', { rl: 25, ratio: 0.5, loss: 2, pin: 0 });
    const t2 = (100 - 2 - 100 * fromDbp(-25)) / 100, k2 = fromDbp(0.5);
    abs(r2.st.vals.s21, dbp(t2 * k2 / (1 + k2)), 1e-9, 'spower3: RL + ratio + lost power solves S21');
    const r3 = only('spower3', { refl: 1, ratio: 0.3, el: 0.4, pin: 0 });
    ok(r3.st.status.s21 === 'calc' && r3.st.status.s31 === 'calc', 'spower3: reflected % + ratio + EL solves', r3.st.msg);
    const r4 = only('spower2', { dl: 0.3, loss: 5, pin: 0 });
    const a = fromDbp(-0.3), refl = 100 - 5 / (1 - a);
    abs(r4.st.vals.refl, refl, 1e-9, 'spower2: dissipative loss + lost power gives the reflected share');
    abs(r4.st.vals.trans, (100 - refl) * a, 1e-9, 'spower2: ... and the transmitted share');
    // every combination of 3 (spower2) / 4 (spower3) inputs either solves or says why
    for (const [id, n] of [['spower2', 3], ['spower3', 4]]) {
      const c = byId(id); let silent = 0, wrong = 0;
      const pool = c.eqVars.filter(x => x !== 'pin');
      const base = A.calcInit(c); const ref = Object.assign({}, base.vals);
      const combos = (arr, kk, s = 0, pick = [], out = []) => { if (pick.length === kk) { out.push(pick.slice()); return out; } for (let i = s; i < arr.length; i++) { pick.push(arr[i]); combos(arr, kk, i + 1, pick, out); pick.pop(); } return out; };
      for (const set of combos(pool, n - 1)) {
        const inp = { pin: 0 }; set.forEach(x => { inp[x] = ref[x]; });
        const { st } = only(id, inp);
        const done = c.eqVars.every(x => st.status[x] === 'in' || st.status[x] === 'calc');
        if (done) { if (c.eqVars.some(x => Math.abs(st.vals[x] - ref[x]) > 1e-6 * Math.max(1, Math.abs(ref[x])))) wrong++; }
        else if (!st.msg) silent++;
      }
      ok(wrong === 0 && silent === 0, id + ': every input combination solves to the right values or shows a message', wrong + ' wrong, ' + silent + ' silent');
    }
  }

  // ---------------------------------------------------- s2Analyze ---
  {
    const cx = A.cx, s2 = A.s2Analyze, cabs = A.cabs;
    const z50 = cx(50);
    // K > 1 but |Δ| > 1: potentially unstable, no MAG
    const r1 = s2([[cx(0), cx(1)], [cx(2), cx(0)]], 50, z50, z50);
    ok(r1.K > 1 && cabs(r1.delta) > 1 && isNaN(r1.MAG), 's2: no MAG for K > 1 with |Δ| > 1 (not unconditionally stable)', r1.MAG);
    // unilateral: MAG = G_TU,max
    const r2 = s2([[cx(0), cx(0)], [cx(1), cx(0)]], 50, z50, z50);
    abs(dbp(r2.MAG), 0, 1e-12, 's2: isolator (S12 = 0) MAG = 0 dB');
    const gtu = 9 / ((1 - 0.25) * (1 - 0.16));
    const r3 = s2([[cx(0.5), cx(0)], [cx(3), cx(0.4)]], 50, z50, z50);
    rel(r3.MAG, gtu, 1e-12, 's2: unilateral MAG = |S21|²/((1−|S11|²)(1−|S22|²)) = 11.549 dB');
    const r4 = s2([[cx(0.5), cx(1e-9)], [cx(3), cx(0.4)]], 50, z50, z50);
    rel(r4.MAG, gtu, 1e-6, 's2: nearly unilateral (S12 = 1e-9) MAG has no ∞ − ∞ / cancellation');
    // matched attenuator: conjugate match is Z0 at both ports
    const g = Math.pow(10, -3 / 20);
    const r5 = s2([[cx(0), cx(g)], [cx(g), cx(0)]], 50, z50, z50);
    ok(r5.match && cabs(r5.match.gs) === 0 && cabs(r5.match.gl) === 0 && Math.abs(r5.match.zs.re - 50) < 1e-12, 's2: 3 dB matched pad conjugate match is Γ = 0 (Z = 50 Ω), not NaN', JSON.stringify(r5.match && r5.match.gs));
    // a general stable case still agrees with Pozar's (B − √(B² − 4|C|²))/2C
    const S = [[A.cpol(0.72, -116), A.cpol(0.03, 57)], [A.cpol(2.60, 76), A.cpol(0.73, -54)]];   // Pozar Ex. 12.3
    const r6 = s2(S, 50, z50, z50);
    const d = A.csub(A.cmul(S[0][0], S[1][1]), A.cmul(S[0][1], S[1][0]));
    const B1 = 1 + 0.72 * 0.72 - 0.73 * 0.73 - Math.pow(cabs(d), 2);
    const C1 = A.csub(S[0][0], A.cmul(d, { re: S[1][1].re, im: -S[1][1].im }));
    const gm = (B1 - Math.sqrt(B1 * B1 - 4 * Math.pow(cabs(C1), 2))) / (2 * cabs(C1));
    rel(cabs(r6.match.gs), gm, 1e-12, 's2: rationalised Γ_S equals the textbook root');
  }

  // ---------------------------------------------------- L-network ---
  {
    const s1 = A.lMatch(50, 50, 50, 1e8);
    ok(s1.length === 2 && s1.filter(s => s.sh.kind === 'none').length === 1, 'lMatch: RL = Rs lists the series-only solution once', s1.map(s => s.topo).join(' | '));
    ok(s1.some(s => s.topo === 'Series element only'), 'lMatch: series-only solution is not credited to a shunt topology');
    const s2 = A.lMatch(50, 50, 0, 1e8);
    ok(s2.length === 1 && s2[0].type === 'Already matched (no elements)', 'lMatch: matched load gives one "already matched" row', s2.map(s => s.type).join(' | '));
    ok(A.lMatch(100, 200, -100, 500e6).length >= 2, 'lMatch: general case still lists its solutions');
  }

  // ------------------------------------------------------- dB ratio ---
  {
    let r = only('dbratio', { dB: 160 });
    rel(r.st.vals.Pr, 1e16, 1e-12, 'dbratio: 160 dB gives a power ratio of 1e16');
    r = only('dbratio', { dB: 1000 });
    ok(r.st.status.Pr === 'calc' && r.st.status.Vr === 'calc', 'dbratio: +1000 dB (end of the dB range) solves both ratios', r.st.msg);
    r = only('dbratio', { dB: -1000 });
    ok(r.st.status.Pr === 'calc' && r.st.status.Vr === 'calc', 'dbratio: −1000 dB solves both ratios', r.st.msg);
    r = only('dbratio', { Vr: 1e16 });
    abs(r.st.vals.dB, 320, 1e-9, 'dbratio: Vr = 1e16 gives 320 dB');
    ok(r.st.status.Pr === 'calc', 'dbratio: ... and the power ratio');
  }

  // --------------------------------------------- εr vs velocity factor ---
  {
    let r = only('wavelength', { f: 1e9, VF: 0.005 });
    rel(r.st.vals.er, 40000, 1e-12, 'wavelength: VF 0.005 gives εr = 40000');
    r = only('elen', { f: 1e9, VF: 0.001, len: 0.1 });
    rel(r.st.vals.er, 1e6, 1e-12, 'elen: VF 0.001 gives εr = 1e6');
  }

  // ------------------------------------------------- noise floor -----
  {
    const N = (t, nf, b) => dbp(KB * (t + 290 * (fromDbp(nf) - 1)) * b * 1000);
    let r = only('sens', { t: 50, bw: 1e6, nf: 1, snr: 10 });
    abs(r.st.vals.floor, -117.627, 1e-3, 'sens: T = 50 K, NF = 1 dB, 1 MHz gives k(T + Tₑ)B = −117.627 dBm');
    abs(r.st.vals.floor, N(50, 1, 1e6), 1e-9, 'sens: floor is k(T + 290(F − 1))B');
    abs(r.st.vals.sens, N(50, 1, 1e6) + 10, 1e-9, 'sens: sensitivity follows the floor');
    r = only('sens', { t: 1000, bw: 1e6, nf: 3, snr: 10 });
    abs(r.st.vals.floor, -107.498, 1e-3, 'sens: hot source T = 1000 K, NF 3 dB gives −107.498 dBm');
    r = only('sens', { t: 290, bw: 1e6, nf: 5, snr: 10 });
    abs(r.st.vals.floor, dbp(KB * 290 * 1000) + 60 + 5, 1e-9, 'sens: at 290 K the floor is still kT₀B·F');
    // inverses
    r = only('sens', { t: 50, bw: 1e6, floor: N(50, 2.5, 1e6), snr: 10 });
    abs(r.st.vals.nf, 2.5, 1e-9, 'sens: NF from the floor');
    r = only('sens', { nf: 2.5, bw: 1e6, floor: N(77, 2.5, 1e6), snr: 10 });
    rel(r.st.vals.t, 77, 1e-9, 'sens: source temperature from the floor');
    abs(r.st.vals.n0, dbp(KB * 77 * 1000), 1e-9, 'sens: n0 is the source density kT');
    r = only('sens', { t: 50, nf: 2.5, floor: N(50, 2.5, 3e5), snr: 10 });
    rel(r.st.vals.bw, 3e5, 1e-9, 'sens: bandwidth from the floor');
    r = only('sens', { t: 290, bw: 1e6, floor: N(290, 0, 1e6) - 1, snr: 10 });
    ok(r.st.status.nf === 'err', 'sens: a floor below the source noise alone has no (negative) NF', r.st.status.nf + ' ' + r.st.vals.nf);
    // boundary round trips: NF = 0 dB and T = 0 K must survive the floor inverses (rounding)
    {
      let bad = [];
      for (const t of [1, 5, 50, 290, 500, 1000]) for (const b of [1e3, 1e6, 3e7]) {
        const f = only('sens', { t, bw: b, nf: 0, snr: 10 }).st.vals.floor;
        const q = only('sens', { t, bw: b, floor: f, snr: 10 });
        if (q.st.status.nf === 'err' || !(Math.abs(q.st.vals.nf) <= 1e-9)) bad.push(t + 'K/' + b + ':' + q.st.vals.nf);
        const g = only('sens', { nf: 2, bw: b, floor: only('sens', { t: 0, bw: b, nf: 2, snr: 10 }).st.vals.floor, snr: 10 });
        if (g.st.status.t === 'err' || !(g.st.vals.t >= 0 && g.st.vals.t <= 1e-6)) bad.push('T0/' + b + ':' + g.st.vals.t);
      }
      ok(bad.length === 0, 'sens: NF = 0 dB and T = 0 K round-trip through the floor inverses', bad.join(' '));
    }
    const c = byId('sens');
    ok(c.byId.nf.min === 0 && c.byId.t.inMin === 0, 'sens: NF ≥ 0 dB, T = 0 K is a valid input');
    ok(/k\(T \+ Tₑ\)B/.test(c.byId.floor.label), 'sens: floor label says k(T + Tₑ)B');
    r = only('sens', { t: 290, bw: 1e6, nf: 5, snr: 10 });
    abs(c.outputs.find(o => o.unit === 'dBµV').fn(vals(c, r.st)), r.st.vals.sens + 120 + dbp(50 / 1000), 1e-12, 'sens: dBµV at 50 Ω uses 106.9897, not 106.99');
    rel(outRow(c, r.st, 'Receiver noise temperature'), 290 * (fromDbp(5) - 1), 1e-12, 'sens: Tₑ output');
  }
  {
    const r = only('nf', { nf: -1, t0: 290 });
    ok(/not physical/.test(warnOf(r.c, r.st) || ''), 'nf: negative NF is flagged');
    const q = only('nf', { te: 0, t0: 290 });
    ok(q.st.vals.nf === 0 && q.st.vals.F === 1, 'nf: Tₑ = 0 K gives F = 1, NF = 0 dB');
    ok(q.c.byId.te.inMin === 0, 'nf: Tₑ = 0 K is a valid input');
    ok(!warnOf(byId('nf'), A.calcInit(byId('nf'))), 'nf: no warning at the defaults');
  }

  // ------------------------------------------------- start / stop ----
  {
    const cases = [[9e3, 26.5e9], [9e3, 50e9], [9e3, 110e9], [2, 50e9], [1e3, 1e10], [1, 1e7], [1, 1e9], [10e3, 40e9], [2400e6, 2483.5e6]];
    let bad = 0;
    for (const [a, b] of cases) {
      const { st } = only('span', { start: a, stop: b });
      if (!(st.status.center === 'calc' && Math.abs(st.vals.center - (a + b) / 2) <= 1e-12 * b && Math.abs(st.vals.span - (b - a)) <= 1e-12 * b && !st.msg)) bad++;
    }
    ok(bad === 0, 'span: start/stop with stop/start up to 1e9 gives centre and span (e.g. 9 kHz – 26.5 GHz)', bad + ' failures');
    let r = only('span', { start: 9e3, stop: 26.5e9 });
    rel(r.st.vals.fbw, 100 * (26.5e9 - 9e3) / ((26.5e9 + 9e3) / 2), 1e-12, 'span: 9 kHz – 26.5 GHz FBW 199.99986 %');
    r = only('span', { center: 1e9, span: 1 });
    ok(r.st.vals.start === 1e9 - 0.5 && r.st.vals.stop === 1e9 + 0.5, 'span: centre 1 GHz, span 1 Hz still exact', r.st.vals.start + ' ' + r.st.vals.stop);
    r = only('span', { stop: 3e9, span: 1e9 });
    rel(r.st.vals.start, 2e9, 1e-12, 'span: stop + span gives start'); rel(r.st.vals.center, 2.5e9, 1e-12, 'span: stop + span gives centre');
    r = only('span', { start: 1e9, fbw: 10 });
    rel(r.st.vals.center, 1e9 / 0.95, 1e-9, 'span: start + FBW gives centre');
    r = only('span', { stop: 1e9, fbw: 10 });
    rel(r.st.vals.center, 1e9 / 1.05, 1e-9, 'span: stop + FBW gives centre');
    r = only('span', { start: 1e9, span: 2e8 });
    rel(r.st.vals.stop, 1.2e9, 1e-12, 'span: start + span gives stop');
    r = only('span', { center: 1e9, stop: 1.1e9 });
    rel(r.st.vals.start, 0.9e9, 1e-12, 'span: centre + stop gives start');
  }

  // ------------------------------------------------------- resonance ---
  {
    const c = byId('resonance');
    let r = only('resonance', { L: 100e-9, Rs: 1, bw: 1 / (2 * PI * 100e-9) });
    const ins = ['L', 'Rs', 'bw'].filter(k => r.st.status[k] === 'in').length;
    ok(ins < 3 && r.st.status.C !== 'calc', 'resonance: L, R and BW are recognised as dependent (no arbitrary C)', JSON.stringify(r.st.status) + ' ' + r.st.msg);
    r = only('resonance', { C: 10e-12, Rs: 1, Q: 100 });
    rel(r.st.vals.L, 100e-9, 1e-9, 'resonance: C, R and Q give L');
    rel(r.st.vals.f0, 1 / (2 * PI * Math.sqrt(100e-9 * 10e-12)), 1e-9, 'resonance: ... and f₀');
    const st = A.calcInit(c);
    rel(st.vals.Q, Math.sqrt(100e-9 / 10e-12) / 1, 1e-12, 'resonance: Q = √(L/C)/R at the defaults');
    rel(st.vals.bw, 1 / (2 * PI * 100e-9), 1e-12, 'resonance: BW = R/(2πL) at the defaults');
  }

  // ------------------------------------------------------------ coax ---
  {
    const c = byId('coax'); const st = A.calcInit(c);
    const v = vals(c, st);
    const Lp = c.outputs.find(o => /Inductance/.test(o.label)).fn(v), Cp = c.outputs.find(o => /Capacitance/.test(o.label)).fn(v);
    rel(st.vals.Z0, Math.sqrt(Lp / Cp), 1e-9, 'coax: Z₀ = √(L′/C′) (η₀/2π, not 60 Ω)');
    abs(st.vals.Z0, 49.2667, 1e-4, 'coax: defaults give 49.2667 Ω');
    const r = only('coax', { D: 0.5e-3, d: 0.912e-3, er: 2.1 });
    ok(r.st.status.Z0 === 'err' && /smaller/.test(warnOf(r.c, r.st) || ''), 'coax: D < d gives no negative Z₀ and a warning', r.st.vals.Z0);
    ok(isNaN(c.outputs.find(o => /Capacitance/.test(o.label)).fn(vals(r.c, r.st))), 'coax: no negative C′ for D < d');
    ok(c.cfg[0].options.some(o => o[0] === 'custom') && Object.keys(c.cfg[0].set('custom')).length === 0, 'coax: dielectric preset has a Custom option');
  }

  // ------------------------------------------------------ microstrip ---
  {
    const c = byId('microstrip'), msLossD = ev('msLossD'), microstrip = A.microstrip;
    const base = { W: 3e-3, H: 1.6e-3, T: 35e-6, f: 1e9, tand: 0.02 };
    const L1 = msLossD(Object.assign({ er: 1 }, base)), L2 = msLossD(Object.assign({ er: 1 + 2e-6 }, base));
    ok(isFinite(L1) && L1 > 0, 'microstrip: dielectric loss at εr = 1 is finite', L1);
    rel(L1, L2, 1e-4, 'microstrip: dielectric loss is continuous at εr = 1');
    const L0 = msLossD(Object.assign({ er: 1 - 5e-10 }, base));
    rel(L0, L1, 1e-6, 'microstrip: dielectric loss is finite just inside the εr ≥ 1 rounding tolerance (1 − 5e-10)');
    const old = v => { const ee = microstrip(v.W, v.H, v.T, v.er).ee; return 20 / Math.LN10 * 2 * PI * v.f / C0 * v.er * (ee - 1) * v.tand / (2 * Math.sqrt(ee) * (v.er - 1)); };
    rel(msLossD(Object.assign({ er: 4.4 }, base)), old(Object.assign({ er: 4.4 }, base)), 1e-12, 'microstrip: dielectric loss unchanged for εr > 1');
    const st = A.calcInit(c);
    const v = vals(c, st);
    const ac = c.outputs.find(o => /Conductor loss/.test(o.label));
    ok(/annealed Cu, 1\.724e-8 Ω·m/.test(ac.label), 'microstrip: conductor loss label names annealed Cu 1.724e-8 Ω·m');
    rel(ac.fn(v), 20 / Math.LN10 * Math.sqrt(PI * v.f * 1.25663706212e-6 * 1.724e-8) / (v.Z0 * v.W), 1e-12, 'microstrip: conductor loss uses ρ = 1.724e-8 Ω·m');
    ok(!warnOf(c, st), 'microstrip: no validity warning at the defaults');
    const r = only('microstrip', { H: 1.6e-3, T: 35e-6, er: 4.4, Z0: 250, f: 1e9, tand: 0.02 });
    ok(/0\.01–100/.test(warnOf(r.c, r.st) || ''), 'microstrip: W/H < 0.01 is flagged', r.st.vals.W / 1.6e-3);
    ok(c.cfg[0].options.some(o => o[0] === 'custom') && Object.keys(c.cfg[0].set('custom')).length === 0, 'microstrip: substrate preset has a Custom option');
    const sk = byId('skin');
    ok(sk.cfg[0].options.some(o => o[0] === 'custom') && Object.keys(sk.cfg[0].set('custom')).length === 0, 'skin: conductor preset has a Custom option');
    const ni = only('skin', { f: 1e9, rho: 6.99e-8, mur: 100 });
    ok(/μr/.test(warnOf(ni.c, ni.st) || ''), 'skin: ferromagnetic μr at GHz is flagged');
  }

  // ----------------------------------------------------- propagation ---
  {
    let r = only('fspl', { f: 2.4e9, d: 1e-3 });
    ok(/near field/.test(warnOf(r.c, r.st) || ''), 'fspl: d = 1 mm at 2.4 GHz warns about the near field');
    ok(!warnOf(byId('fspl'), A.calcInit(byId('fspl'))), 'fspl: no warning at 1 km');
    const c = byId('link'); const st = A.calcInit(c);
    ok(!warnOf(c, st), 'link: no warning at the defaults');
    A.calcEdit(c, st, 'd', 0.01);
    ok(/near field/.test(warnOf(c, st) || ''), 'link: d = 1 cm warns about the near field');
    A.calcEdit(c, st, 'd', 0.3); A.calcEdit(c, st, 'gt', 30); A.calcEdit(c, st, 'gr', 30);
    ok(st.vals.fspl < 60 && /near field/.test(warnOf(c, st) || ''), 'link: path loss below the two gains (more power received than sent) is flagged');
    // fresnel: solve the total path length when d₁ is near the far end
    for (const fr of [0.95, 0.99, 0.999]) {
      const f = 2.4e9, D = 100e3, d1 = fr * D, lam = C0 / f;
      const rr = Math.sqrt(lam * d1 * (D - d1) / D);
      const q = only('fresnel', { f: f, d1: d1, n: 1, r: rr });
      rel(q.st.vals.D, D, 1e-9, 'fresnel: D from r with d₁/D = ' + fr);
    }
    const q = only('fresnel', { f: 2.4e9, D: 1000, d1: 1500, n: 1 });
    ok(isNaN(outRow(q.c, q.st, 'Earth bulge')) && /between 0/.test(warnOf(q.c, q.st) || ''), 'fresnel: d₁ > D shows no negative earth bulge and warns');
    ok(byId('horizon').outputs.some(o => /^Geometric horizon \(k = 1/.test(o.label)), 'horizon: k = 1 row is called the geometric horizon');
  }

  // --------------------------------------------------------- antennas ---
  {
    const lam = C0 / 2.4e9;
    let r = only('farfield', { f: 2.4e9, D: 0.1 * lam });
    rel(outRow(r.c, r.st, 'Reactive near-field boundary'), lam / (2 * PI), 1e-12, 'farfield: small antenna reactive boundary is λ/2π');
    ok(/D < λ/.test(warnOf(r.c, r.st) || ''), 'farfield: D < λ warns that 2D²/λ does not apply');
    r = only('farfield', { f: 2.4e9, D: 10 * lam });
    rel(outRow(r.c, r.st, 'Reactive near-field boundary'), 0.62 * Math.sqrt(Math.pow(10 * lam, 3) / lam), 1e-12, 'farfield: large antenna keeps 0.62√(D³/λ)');
    ok(!warnOf(r.c, r.st), 'farfield: no warning for D = 10λ');
    r = only('gain', { f: 2.4e9, G: 2.15 });
    ok(/pencil-beam/.test(warnOf(r.c, r.st) || ''), 'gain: dipole gain warns that G ≈ K/θ² does not apply');
    ok(!warnOf(byId('gain'), A.calcInit(byId('gain'))), 'gain: no warning at 15 dBi');
    // dish: G and θ only fix D/λ
    const f = 1e9, D = 5, eta = 0.6, G = dbp(eta * Math.pow(PI * D * f / C0, 2)), bw = 70 * C0 / (f * D);
    r = only('dish', { eta: eta, G: G, bw: bw });
    ok(!r.st.status.f.startsWith('err') && !/physically impossible/.test(r.st.msg), 'dish: G, θ and η do not report "physically impossible"', r.st.msg);
    r = only('dish', { f: f, G: G, bw: bw });
    rel(r.st.vals.D, D, 1e-9, 'dish: f, G and θ give D'); rel(r.st.vals.eta, eta, 1e-9, 'dish: ... and η');
    r = only('dish', { D: D, eta: eta, bw: bw });
    rel(r.st.vals.f, f, 1e-9, 'dish: D, η and θ give f'); abs(r.st.vals.G, G, 1e-9, 'dish: ... and G');
    const st = A.calcInit(byId('dish'));
    abs(st.vals.G, dbp(0.55 * Math.pow(PI * 0.6 * 10e9 / C0, 2)), 1e-9, 'dish: default gain unchanged');
  }

  // ----------------------------------------------------------- mixer ---
  {
    const c = byId('mixer'); const st = A.calcInit(c);
    st.cfg.mode = 'low';
    A.calcEdit(c, st, 'rf', 100e6); A.calcEdit(c, st, 'iff', 70e6); A.calcEdit(c, st, 'bw', 1e6);
    rel(st.vals.lo, 30e6, 1e-12, 'mixer: low-side LO below IF');
    ok(st.status.img === 'calc', 'mixer: folded image is calculated, not an error', st.status.img + ' ' + st.msg);
    rel(st.vals.img, 40e6, 1e-12, 'mixer: image folds to 2·IF − RF = 40 MHz');
    abs(outRow(c, st, 'Image filter transition'), 59, 1e-9, 'mixer: transition uses the real gap 2·LO − BW (59 %)');
    ok(/folds/.test(warnOf(c, st) || ''), 'mixer: LO below IF warns about the folded image');
    const h = A.calcInit(c);
    abs(outRow(c, h, 'Image filter transition'), 100 * 120e6 / 2400e6, 1e-9, 'mixer: high-side transition unchanged');
  }

  // -------------------------------- any input set: right answer or a message ---
  {
    const combos = (arr, kk, st0 = 0, pick = [], out = []) => { if (pick.length === kk) { out.push(pick.slice()); return out; } for (let i = st0; i < arr.length; i++) { pick.push(arr[i]); combos(arr, kk, i + 1, pick, out); pick.pop(); } return out; };
    for (const id of ['resonance', 'dish', 'span', 'sens', 'mixer', 'fresnel', 'coax', 'cable']) {
      const c = byId(id); const base = A.calcInit(c); const ref = Object.assign({}, base.vals);
      let silent = 0, wrong = 0, n = 0;
      for (const set of combos(c.eqVars, c.dof)) {
        const inp = {}; set.forEach(x => { inp[x] = ref[x]; });
        const { st } = only(id, inp); n++;
        st.cfg = base.cfg;
        const done = c.eqVars.every(x => st.status[x] === 'in' || st.status[x] === 'calc');
        if (done) { if (c.eqVars.some(x => Math.abs(st.vals[x] - ref[x]) > 1e-6 * Math.max(1, Math.abs(ref[x])))) wrong++; }
        else if (!st.msg) silent++;
      }
      ok(wrong === 0 && silent === 0, id + ': all ' + n + ' input sets solve to the defaults or show a message', wrong + ' wrong, ' + silent + ' silent');
    }
  }
  // zero is a valid typed value for these
  for (const [id, k] of [['microstrip', 'T'], ['cable', 'len'], ['cable', 'loss'], ['fresnel', 'd1'], ['horizon', 'h1'], ['mixer', 'iff'], ['span', 'span'], ['sens', 't'], ['nf', 'te'], ['zgamma', 'R']]) {
    const c = byId(id); const st = A.calcInit(c);
    A.calcEdit(c, st, k, 0);
    ok(c.byId[k].inMin === 0 && !c.eqVars.some(x => st.status[x] === 'err') && !st.msg, id + ': ' + k + ' = 0 is accepted and solves', JSON.stringify(st.status) + ' ' + st.msg);
  }

  // ------------------------------------------------------- reactText ---
  {
    const rt = ev('reactText');
    ok(rt(1e-14, 1e9, 100) === 'no reactance', 'reactText: residue relative to the impedance level is no reactance');
    ok(/^L = /.test(rt(1e-6, 1e9, 100)) && /^C = /.test(rt(-5, 1e9, 50)), 'reactText: real reactances still shown');
  }
};

if (require.main === module) {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const SRC = path.join(__dirname, '..', 'src');
  const code = ['core.js', 'data.js', 'rf.js', 'calcs.js'].map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ctx = vm.createContext({ console: console });
  vm.runInContext(code + '\n;globalThis.__api = { CALCS, calcInit, calcEdit, cx, cpol, cabs, csub, cmul, s2Analyze, lMatch, microstrip };', ctx);
  let pass = 0, fail = 0;
  const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name + (extra !== undefined ? '  -> ' + extra : '')); } };
  module.exports({ A: ctx.__api, ok: ok, evalIn: s => vm.runInContext(s, ctx) });
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

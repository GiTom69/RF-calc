// ============================================================================
// b2.js - phase 2, batch 2 (pure): two-tone IP3 / SFDR, ADC, phase noise →
// jitter, spur & harmonic products, LC filter prototypes.
// Every top-level name starts with b2 (single shared script).
// ============================================================================

// ------------------------------------------------- phase noise → jitter ---
// pts: [[offset Hz, L dBc/Hz], ...] sorted by offset. L is single-sideband.
// Between points L(f) is a straight line in log-log, i.e. a power law
// S(f) = S_a·(f/f_a)^k with k = slope(dB/dec)/10, integrated exactly.
function b2PnIntegrate(pts, f1, f2) {
  const p = pts.filter(q => q[0] > 0 && isFinite(q[0]) && isFinite(q[1])).sort((a, b) => a[0] - b[0]);
  if (p.length < 2 || !(f2 > f1) || !(f1 > 0)) return { p: NaN, lo: NaN, hi: NaN, clipped: false };
  const lo = Math.max(f1, p[0][0]), hi = Math.min(f2, p[p.length - 1][0]);
  let sum = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [fa, La] = p[i], [fb, Lb] = p[i + 1];
    if (!(fb > fa)) continue;
    const x1 = Math.max(lo, fa), x2 = Math.min(hi, fb);
    if (!(x2 > x1)) continue;
    const k = (Lb - La) / log10(fb / fa) / 10;
    const Sa = fromDbp(La);
    if (Math.abs(k + 1) < 1e-9) sum += Sa * fa * Math.log(x2 / x1);
    else sum += Sa * fa * (Math.pow(x2 / fa, k + 1) - Math.pow(x1 / fa, k + 1)) / (k + 1);
  }
  return { p: sum, lo: lo, hi: hi, clipped: lo > f1 * (1 + 1e-12) || hi < f2 * (1 - 1e-12) };
}
// L(f) at an offset by log-log interpolation (NaN outside the table).
// An offset within round-off (1e-12 relative) of the first or last point
// snaps to it, so 10^log10(f) at the table ends still finds a segment.
function b2PnAt(pts, f) {
  const p = pts.filter(q => q[0] > 0 && isFinite(q[1])).sort((a, b) => a[0] - b[0]);
  if (p.length && Math.abs(f / p[0][0] - 1) < 1e-12) f = p[0][0];
  if (p.length && Math.abs(f / p[p.length - 1][0] - 1) < 1e-12) f = p[p.length - 1][0];
  for (let i = 0; i < p.length - 1; i++) {
    if (f >= p[i][0] && f <= p[i + 1][0]) {
      const t = log10(f / p[i][0]) / log10(p[i + 1][0] / p[i][0]);
      return p[i][1] + t * (p[i + 1][1] - p[i][1]);
    }
  }
  return NaN;
}
// Derived figures from the integrated SSB phase noise power p (rad²/2).
// evm and snr are the small-angle forms (EVM ≈ φrms); evmGauss is the EVM for
// a Gaussian phase error of that RMS, √(2(1 − e^(−φ²/2))), which never exceeds
// √2 = 141 %. Above about 0.2 rad the small-angle forms are no longer accurate.
function b2PnResults(p, f0) {
  const phi = sqrt(2 * p);
  return {
    large: phi > 0.2,
    ssb: dbp(p),                  // 10·log ∫L(f) df, dBc
    dsb: dbp(2 * p),              // both sidebands, dBc
    phiRad: phi,
    phiDeg: phi * 180 / PI,
    jitter: phi / (2 * PI * f0),
    evm: 100 * phi,               // small-angle EVM limit, %
    evmGauss: 100 * sqrt(2 * (1 - Math.exp(-phi * phi / 2))), // Gaussian phase error, %
    snr: -dbp(2 * p),             // phase-noise-limited SNR, dB
  };
}

// ------------------------------------------------- spur / product table ---
// Products |m·RF + n·LO| for m ≥ 0, |m| + |n| ≤ N. RF and LO are bands
// (lo1 = lo2 for a fixed LO); the range uses interval arithmetic (both vary
// independently, which is conservative for a tracking LO).
function b2Range(m, n, rf1, rf2, lo1, lo2) {
  const c = [m * rf1 + n * lo1, m * rf1 + n * lo2, m * rf2 + n * lo1, m * rf2 + n * lo2];
  const a = Math.min(...c), b = Math.max(...c);
  if (a <= 0 && b >= 0) return [0, Math.max(-a, b)];
  return a > 0 ? [a, b] : [-b, -a];
}
function b2Products(o) {
  const { rf1, rf2, lo1, lo2, if1, if2, N, desired } = o;
  const want = desired === 'up' ? [1, 1] : [1, -1];
  const rows = [];
  for (let m = 0; m <= N; m++) {
    for (let n = -N; n <= N; n++) {
      if (m + Math.abs(n) > N || (m === 0 && n <= 0)) continue;
      const [f1, f2] = b2Range(m, n, rf1, rf2, lo1, lo2);
      const ov = Math.min(f2, if2) - Math.max(f1, if1);
      const inband = ov >= 0 && !(f2 < if1 || f1 > if2);
      const kind = (m === want[0] && n === want[1]) ? 'desired'
        : n === 0 ? (m === 1 ? 'RF feedthrough' : 'RF harmonic')
        : m === 0 ? (n === 1 ? 'LO feedthrough' : 'LO harmonic') : 'mixing product';
      rows.push({ m: m, n: n, order: m + Math.abs(n), f1: f1, f2: f2, inband: inband,
        overlap: inband ? Math.max(0, ov) / Math.max(1e-300, if2 - if1) : 0, kind: kind, text: b2ProdText(m, n) });
    }
  }
  rows.sort((a, b) => (a.kind === 'desired' ? -1 : 0) - (b.kind === 'desired' ? -1 : 0) || a.order - b.order || a.f1 - b.f1);
  return rows;
}
function b2ProdText(m, n) {
  const t = (k, s) => (k === 1 ? '' : k + '·') + s;
  if (n === 0) return t(m, 'RF');
  if (m === 0) return t(n, 'LO');
  return '|' + t(m, 'RF') + (n > 0 ? ' + ' : ' − ') + t(Math.abs(n), 'LO') + '|';
}

// ------------------------------------------------------ LC filters --------
// Low-pass prototype element values g0..g(n+1) (Matthaei/Pozar).
function b2FilterG(resp, n, ripple) {
  const g = [1];
  if (resp === 'cheby') {
    const beta = Math.log(1 / Math.tanh(ripple / 17.37));
    const gam = Math.sinh(beta / (2 * n));
    const a = k => Math.sin((2 * k - 1) * PI / (2 * n));
    const b = k => gam * gam + Math.pow(Math.sin(k * PI / n), 2);
    g.push(2 * a(1) / gam);
    for (let k = 2; k <= n; k++) g.push(4 * a(k - 1) * a(k) / (b(k - 1) * g[k - 1]));
    g.push(n % 2 ? 1 : Math.pow(1 / Math.tanh(beta / 4), 2));
  } else {
    for (let k = 1; k <= n; k++) g.push(2 * Math.sin((2 * k - 1) * PI / (2 * n)));
    g.push(1);
  }
  return g;
}
// Normalised stop-band frequency Ω (> 1 in the stop band)
function b2FilterOmega(type, fs, fc, f0, bw) {
  if (type === 'lpf') return fs / fc;
  if (type === 'hpf') return fc / fs;
  const d = bw / f0, x = Math.abs(fs / f0 - f0 / fs);
  return type === 'bpf' ? x / d : d / x;
}
// Minimum order for attenuation A (dB) at Ω; ripple only for Chebyshev
function b2FilterOrder(resp, A, ripple, Om) {
  if (!(Om > 1) || !(A > 0)) return NaN;
  if (resp === 'cheby') {
    // A ≤ ripple gives r ≤ 1: every order already attenuates more than the
    // ripple at Ω > 1, so N = 1 (acosh(1) = 0)
    const r = Math.max(1, sqrt((fromDbp(A) - 1) / (fromDbp(ripple) - 1)));
    return Math.max(1, Math.ceil(Math.acosh(r) / Math.acosh(Om) - 1e-9));
  }
  return Math.max(1, Math.ceil(log10(fromDbp(A) - 1) / (2 * log10(Om)) - 1e-9));
}
// Normalised −3 dB point of the prototype (1 for Butterworth): the outermost
// root of T_N(Ω) = 1/ε. For ripple above 3.01 dB (1/ε < 1) it lies inside the
// ripple band, Ω₃ = cos(acos(1/ε)/N) < 1.
function b2Filter3dB(resp, n, ripple) {
  if (resp !== 'cheby') return 1;
  const eps = sqrt(fromDbp(ripple) - 1), x = 1 / eps;
  return x >= 1 ? Math.cosh(Math.acosh(x) / n) : Math.cos(Math.acos(Math.max(-1, x)) / n);
}
// Band edges of a geometric-centred band from f0 and bandwidth
function b2BandEdges(f0, bw) {
  const h = bw / 2;
  const f1 = -h + sqrt(h * h + f0 * f0);
  return [f1, f1 + bw];
}
// Full design: o = { resp, ripple, type, n, fc, f0, bw, z0, first: 'shunt'|'series' }
// Each element: { k, arm: 'series'|'shunt', net: 'L'|'C'|'LCs'|'LCp', L, C }
function b2FilterDesign(o) {
  const g = b2FilterG(o.resp, o.n, o.ripple);
  const R0 = o.z0;
  const wc = 2 * PI * o.fc, w0 = 2 * PI * o.f0, d = o.bw / o.f0;
  const els = [];
  for (let k = 1; k <= o.n; k++) {
    const shunt = (o.first === 'shunt') === (k % 2 === 1);
    const gk = g[k];
    let e;
    if (o.type === 'lpf') e = shunt ? { net: 'C', C: gk / (R0 * wc) } : { net: 'L', L: gk * R0 / wc };
    else if (o.type === 'hpf') e = shunt ? { net: 'L', L: R0 / (wc * gk) } : { net: 'C', C: 1 / (wc * R0 * gk) };
    else if (o.type === 'bpf') e = shunt ? { net: 'LCp', L: d * R0 / (w0 * gk), C: gk / (w0 * d * R0) }
      : { net: 'LCs', L: gk * R0 / (w0 * d), C: d / (w0 * gk * R0) };
    else e = shunt ? { net: 'LCs', L: R0 / (w0 * gk * d), C: gk * d / (w0 * R0) }
      : { net: 'LCp', L: gk * d * R0 / w0, C: 1 / (w0 * gk * d * R0) };
    e.k = k;
    e.arm = shunt ? 'shunt' : 'series';
    els.push(e);
  }
  const lastShunt = els[els.length - 1].arm === 'shunt';
  const rl = lastShunt ? R0 * g[o.n + 1] : R0 / g[o.n + 1];
  return { g: g, els: els, rs: R0, rl: rl };
}
// Replace L and C values by standard E-series values
function b2FilterSnap(design, series) {
  if (!series || series === 'exact') return design;
  const snap = x => (x > 0 && isFinite(x)) ? nearestE(x, series).best : x;
  return Object.assign({}, design, { els: design.els.map(e => Object.assign({}, e, { L: e.L !== undefined ? snap(e.L) : undefined, C: e.C !== undefined ? snap(e.C) : undefined })) });
}
// |S21| and |S11| in dB of the actual ladder at frequency f (ABCD cascade).
// Exactly at an LC resonance an arm is 0 or ∞; step a hair off it.
function b2FilterResp(design, f) {
  const r = b2FilterResp0(design, f);
  return isNaN(r.s21) || isNaN(r.s11) ? b2FilterResp0(design, f * (1 + 1e-9)) : r;
}
function b2FilterResp0(design, f) {
  const w = 2 * PI * f;
  const zL = L => cx(0, w * L), zC = C => cx(0, -1 / (w * C));
  let M = mEye(2);
  for (const e of design.els) {
    let z;
    if (e.net === 'L') z = zL(e.L);
    else if (e.net === 'C') z = zC(e.C);
    else if (e.net === 'LCs') z = cadd(zL(e.L), zC(e.C));
    else z = cinv(cadd(cinv(zL(e.L)), cinv(zC(e.C))));
    const T = e.arm === 'series' ? [[cx(1), z], [cx(0), cx(1)]] : [[cx(1), cx(0)], [cinv(z), cx(1)]];
    M = mMul(M, T);
  }
  const Rs = design.rs, Rl = design.rl;
  const A = M[0][0], B = M[0][1], C = M[1][0], D = M[1][1];
  const den = cadd(cadd(cscale(A, Rl), B), cadd(cscale(C, Rs * Rl), cscale(D, Rs)));
  const s21 = cdiv(cx(2 * sqrt(Rs * Rl)), den);
  const s11 = cdiv(csub(cadd(cscale(A, Rl), B), cadd(cscale(C, Rs * Rl), cscale(D, Rs))), den);
  return { s21: dbv(cabs(s21)), s11: dbv(cabs(s11)) };
}

// ===================================================== solver calculators ==
CALCS.push(
{
  id: 'ip3', cat: 'noise', title: 'Two-Tone IP3 / IP2 / SFDR', kw: 'ip3 iip3 oip3 two tone intermodulation im3 im2 ip2 sfdr mds dynamic range intercept',
  desc: 'From a two-tone test: level per tone at the input, gain, and the measured output IM3 (and IM2) products. Enter an IP3 instead to predict the IM3 level. The noise floor gives MDS and spurious-free dynamic range.',
  vars: [
    dbV('pin', 'Input power per tone', -20, 'dBm'),
    dbV('g', 'Gain', 15),
    dbV('pout', 'Output power per tone', undefined, 'dBm'),
    dbV('pim3', 'Output IM3 product (2f₁ − f₂)', -60, 'dBm'),
    dbV('dim', 'IM3 suppression ΔIM3', undefined, 'dBc'),
    dbV('oip3', 'Output IP3 (OIP3)', undefined, 'dBm'),
    dbV('iip3', 'Input IP3 (IIP3)', undefined, 'dBm'),
    dbV('pim2', 'Output IM2 product (f₁ + f₂)', -70, 'dBm'),
    dbV('dim2', 'IM2 suppression ΔIM2', undefined, 'dBc'),
    dbV('oip2', 'Output IP2 (OIP2)', undefined, 'dBm'),
    dbV('iip2', 'Input IP2 (IIP2)', undefined, 'dBm'),
    posV('t', 'Source temperature T', 290, 'K', { sticky: true, inMin: 0 }),
    fq('bw', 'Noise bandwidth', 1e6, 'MHz', { min: 1e-6, max: 1e13 }),
    dbV('nf', 'Noise figure (at T₀ = 290 K)', 5),
    dbV('floor', 'Input noise floor k(T + Tₑ)B = MDS (SNR 0 dB)', undefined, 'dBm'),
    dbV('sfdr', 'SFDR, third order', undefined, 'dB'),
    dbV('pin2', 'Another input level per tone (prediction)', -30, 'dBm'),
  ],
  eqs: [
    E('pout', ['pin', 'g'], v => v.pin + v.g, { pin: v => v.pout - v.g, g: v => v.pout - v.pin }),
    E('dim', ['pout', 'pim3'], v => v.pout - v.pim3, { pout: v => v.dim + v.pim3, pim3: v => v.pout - v.dim }),
    E('oip3', ['pout', 'dim'], v => v.pout + v.dim / 2, { pout: v => v.oip3 - v.dim / 2, dim: v => 2 * (v.oip3 - v.pout) }),
    E('iip3', ['oip3', 'g'], v => v.oip3 - v.g, { oip3: v => v.iip3 + v.g, g: v => v.oip3 - v.iip3 }),
    E('dim2', ['pout', 'pim2'], v => v.pout - v.pim2, { pout: v => v.dim2 + v.pim2, pim2: v => v.pout - v.dim2 }),
    E('oip2', ['pout', 'dim2'], v => v.pout + v.dim2, { pout: v => v.oip2 - v.dim2, dim2: v => v.oip2 - v.pout }),
    E('iip2', ['oip2', 'g'], v => v.oip2 - v.g, { oip2: v => v.iip2 + v.g, g: v => v.oip2 - v.iip2 }),
    // N = k(T + Tₑ)B with Tₑ = 290(F − 1): NF is defined with a 290 K source,
    // so kTB·F only holds at T = 290 K
    E('floor', ['t', 'bw', 'nf'], v => dbp(KB * 1000 * (v.t + b2Te(v.nf))) + dbp(v.bw), {
      nf: v => { const te = b2Tsys(v.floor, v.bw) - v.t; return te >= -1e-9 * Math.max(1, v.t) ? dbp(1 + Math.max(0, te) / 290) : NaN; },
      bw: v => fromDbp(v.floor - dbp(KB * 1000 * (v.t + b2Te(v.nf)))),
      t: v => { const t = b2Tsys(v.floor, v.bw) - b2Te(v.nf); return t >= -1e-9 * Math.max(1, b2Te(v.nf)) ? Math.max(0, t) : NaN; },
    }),
    E('sfdr', ['iip3', 'floor'], v => 2 / 3 * (v.iip3 - v.floor), { iip3: v => v.floor + 1.5 * v.sfdr, floor: v => v.iip3 - 1.5 * v.sfdr }),
  ],
  outputs: [
    O('Output noise floor', v => v.floor + v.g, 'dBm'),
    O('Input level per tone for maximum SFDR (IM3 = floor)', v => (2 * v.iip3 + v.floor) / 3, 'dBm'),
    O('SFDR, second order ½(IIP2 − floor)', v => (v.iip2 - v.floor) / 2, 'dB'),
    O('At the other input level: output per tone', v => v.pin2 + v.g, 'dBm'),
    O('At the other input level: IM3 output (3:1 slope)', v => v.pim3 + 3 * (v.pin2 - v.pin), 'dBm'),
    O('At the other input level: ΔIM3', v => v.dim - 2 * (v.pin2 - v.pin), 'dBc'),
    O('At the other input level: IM2 output (2:1 slope)', v => v.pim2 + 2 * (v.pin2 - v.pin), 'dBm'),
  ],
  chart: v => b2Ip3Chart(v),
  warn: v => (isFinite(v.pin) && isFinite(v.iip3) && v.pin > v.iip3 - 10)
    ? '⚠ The test level is within 10 dB of IIP3. The device may be compressing, so the 3:1 extrapolation is unreliable.' : null,
  note: 'OIP3 = P<sub>out</sub> + ΔIM3/2 · IIP3 = OIP3 − G = P<sub>in</sub> + ΔIM3/2 · OIP2 = P<sub>out</sub> + ΔIM2 · MDS = 10·log(k(T + T<sub>e</sub>)B / 1 mW), T<sub>e</sub> = 290(F − 1) (= −174 dBm/Hz + 10·log B + NF at T = 290 K) · SFDR = ⅔(IIP3 − MDS). IM3 rises 3 dB and IM2 2 dB per 1 dB of input.',
},
{
  id: 'adc', cat: 'noise', title: 'ADC: SNR, ENOB, Processing Gain, Aliasing', kw: 'adc analog digital converter enob sinad snr bits quantization processing gain nyquist zone alias sampling jitter',
  desc: 'Ideal quantization SNR ↔ bits, measured SINAD ↔ ENOB, processing gain for a narrow signal, and the noise density. Extra inputs give the Nyquist zone, the alias frequency and the clock-jitter SNR limit.',
  vars: [
    posV('n', 'Resolution N', 12, 'bits', { min: 1, max: 40 }),
    dbV('snrq', 'Ideal SNR, full-scale sine (6.02N + 1.76)'),
    dbV('sinad', 'Measured SINAD', 68),
    linV('enob', 'ENOB = (SINAD − 1.76)/6.02', undefined, 'bits', { min: -20, max: 60 }),
    fq('fs', 'Sample rate f<sub>s</sub>', 100e6, 'MHz'),
    fq('bw', 'Signal bandwidth B', 1e6, 'MHz'),
    dbV('pg', 'Processing gain 10·log(f<sub>s</sub>/2B)'),
    dbV('snrb', 'SNR in the signal bandwidth (SINAD + PG)'),
    dbV('pfs', 'Full-scale input power', 10, 'dBm'),
    dbV('nsd', 'Noise spectral density', undefined, 'dBm/Hz'),
    fq('fin', 'Input frequency (for aliasing and jitter)', 70e6, 'MHz', { inMin: 0 }),
    uV('tj', 'Clock jitter (RMS)', 's', 'ps', 0.5e-12, { inMin: 0 }),
  ],
  eqs: [
    E('snrq', ['n'], v => 20 * log10(Math.pow(2, v.n) * sqrt(1.5)), { n: v => (v.snrq - 20 * log10(sqrt(1.5))) / (20 * log10(2)) }),
    E('enob', ['sinad'], v => (v.sinad - 20 * log10(sqrt(1.5))) / (20 * log10(2)), { sinad: v => v.enob * 20 * log10(2) + 20 * log10(sqrt(1.5)) }),
    E('pg', ['fs', 'bw'], v => dbp(v.fs / (2 * v.bw)), { fs: v => 2 * v.bw * fromDbp(v.pg), bw: v => v.fs / (2 * fromDbp(v.pg)) }),
    E('snrb', ['sinad', 'pg'], v => v.sinad + v.pg, { sinad: v => v.snrb - v.pg, pg: v => v.snrb - v.sinad }),
    E('nsd', ['pfs', 'sinad', 'fs'], v => v.pfs - v.sinad - dbp(v.fs / 2), {
      pfs: v => v.nsd + v.sinad + dbp(v.fs / 2), sinad: v => v.pfs - v.nsd - dbp(v.fs / 2), fs: v => 2 * fromDbp(v.pfs - v.sinad - v.nsd),
    }),
  ],
  outputs: [
    O('ENOB loss vs. ideal N', v => v.n - v.enob, 'bits'),
    O('Oversampling ratio f<sub>s</sub>/2B', v => v.fs / (2 * v.bw), '×'),
    O('Noise spectral density', v => -v.sinad - dbp(v.fs / 2), 'dBFS/Hz'),
    O('Full-scale voltage at 50 Ω', v => 2 * sqrt(2 * 1e-3 * fromDbp(v.pfs) * 50), 'Vpp', true),
    O('LSB size at 50 Ω full scale', v => 2 * sqrt(2 * 1e-3 * fromDbp(v.pfs) * 50) / Math.pow(2, v.n), 'V', true),
    O('Nyquist zone of the input', v => b2NyqZone(v.fin, v.fs)),
    O('Alias (apparent) frequency', v => b2Alias(v.fin, v.fs), 'Hz', true),
    O('Spectrum at the alias', v => isFinite(b2NyqZone(v.fin, v.fs)) ? (b2NyqZone(v.fin, v.fs) % 2 === 0 ? 'Inverted (even zone)' : 'Not inverted (odd zone)') : NaN),
    O('Jitter-limited SNR −20·log(2π·f<sub>in</sub>·t<sub>j</sub>)', v => -dbv(2 * PI * v.fin * v.tj), 'dB'),
    O('SINAD combined with jitter', v => -dbp(fromDbp(-v.sinad) + fromDbp(dbv(2 * PI * v.fin * v.tj))), 'dB'),
  ],
  warn: v => (v.bw > v.fs / 2) ? '⚠ The signal bandwidth exceeds the Nyquist bandwidth f_s/2.' : null,
  note: 'SNR<sub>ideal</sub> = 20·log(2<sup>N</sup>·√1.5) = 6.02N + 1.76 dB for a full-scale sine with noise spread over 0…f<sub>s</sub>/2. SNR in a band B = SINAD + 10·log(f<sub>s</sub>/2B), assuming the noise is white. Aperture-jitter SNR = −20·log(2π·f<sub>in</sub>·t<sub>j</sub>).',
},
{ id: 'pnjitter', cat: 'noise', title: 'Phase Noise → Jitter', kw: 'phase noise jitter integrated rms phase error evm pll oscillator dbc/hz', custom: 'pnjitter' },
{ id: 'spurs', cat: 'freq', title: 'Spur & Harmonic Table', kw: 'spur spurious mixing products intermodulation harmonics m n frequency plan if band', custom: 'spurs' },
{ id: 'lcfilter', cat: 'comp', title: 'LC Filter Prototypes', kw: 'filter lc lumped butterworth chebyshev low pass high pass band pass band stop prototype g values ladder', custom: 'lcfilter' },
);

// Noise temperature of a noise figure (dB), referred to T₀ = 290 K
function b2Te(nf) { return 290 * (fromDbp(nf) - 1); }
// Total noise temperature T + Tₑ (K) behind a noise floor (dBm) in bandwidth B
function b2Tsys(floor, bw) { return fromDbp(floor - dbp(bw)) / (KB * 1000); }
function b2NyqZone(fin, fs) {
  if (!(fin >= 0) || !(fs > 0)) return NaN;
  return Math.floor(fin / (fs / 2)) + 1;
}
function b2Alias(fin, fs) {
  if (!(fin >= 0) || !(fs > 0)) return NaN;
  const r = fin - fs * Math.floor(fin / fs);
  return r > fs / 2 ? fs - r : r;
}

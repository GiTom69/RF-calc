// ============================================================================
// b3.js - phase 2, batch 3: remaining extended calculators (pure, no DOM).
// Field strength, PAPR, directivity error, 2-port cascade, Pi/T match, air coil,
// waveguide, two-ray, rain (ITU-R P.838-3), radar equation, Doppler,
// polarization mismatch, RF exposure (ICNIRP 2020 / FCC 1.1310), G/T,
// minimum-loss pad, Wilkinson divider.
// ============================================================================

// ---- extra unit lists ------------------------------------------------------
UNITS.b3vm = [['µV/m', 1e-6], ['mV/m', 1e-3], ['V/m', 1], ['kV/m', 1e3]];
UNITS.b3wm2 = [['µW/cm²', 1e-2], ['mW/m²', 1e-3], ['W/m²', 1], ['mW/cm²', 10]];
UNITS.b3speed = [['m/s', 1], ['km/h', 1 / 3.6], ['kn', 1852 / 3600], ['mph', 0.44704], ['ft/s', 0.3048]];

const b3Ccosh = z => cx(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
const b3Csinh = z => cx(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
const b3Par = (a, b) => cdiv(cmul(a, b), cadd(a, b));
const b3Lam = f => C0 / f;

// ---- field strength --------------------------------------------------------
// Antenna factor AF = E/V = sqrt(4π·η0 / (Z·G·λ²)); 9.73/(λ√G) at 50 Ω
const b3AF = (f, gDb, z) => dbp(4 * PI * ETA0 / (fromDbp(gDb) * Math.pow(b3Lam(f), 2) * z));

// ---- PAPR presets (envelope peak / average power) ---------------------------
const B3_PAPR = [
  ['custom', 'Custom value', null],
  ['cw', 'Constant envelope (CW, FM, FSK, GMSK): 0 dB', 0],
  ['2tone', 'Two equal tones: 3.01 dB', dbp(2)],
  ['qam16', '16-QAM constellation, unfiltered: 2.55 dB', dbp(1.8)],
  ['qam64', '64-QAM constellation, unfiltered: 3.68 dB', dbp(98 / 42)],
  ['qam256', '256-QAM constellation, unfiltered: 4.23 dB', dbp(450 / 170)],
  ['qpskf', 'QPSK, RRC α = 0.35 filtered: ≈ 3.5 dB (typical)', 3.5],
  ['gauss3', 'OFDM / Gaussian noise, 0.1 % CCDF: 8.39 dB', dbp(-Math.log(1e-3))],
  ['gauss4', 'OFDM / Gaussian noise, 0.01 % CCDF: 9.64 dB', dbp(-Math.log(1e-4))],
];

// ---- rain attenuation: ITU-R P.838-3 (verified against the official PDF) ----
const B3_P838 = {
  kH: { a: [-5.33980, -0.35351, -0.23789, -0.94158], b: [-0.10008, 1.26970, 0.86036, 0.64552],
        c: [1.13098, 0.45400, 0.15354, 0.16817], m: -0.18961, k: 0.71147 },
  kV: { a: [-3.80595, -3.44965, -0.39902, 0.50167], b: [0.56934, -0.22911, 0.73042, 1.07319],
        c: [0.81061, 0.51059, 0.11899, 0.27195], m: -0.16398, k: 0.63297 },
  aH: { a: [-0.14318, 0.29591, 0.32177, -5.37610, 16.1721], b: [1.82442, 0.77564, 0.63773, -0.96230, -3.29980],
        c: [-0.55187, 0.19822, 0.13164, 1.47828, 3.43990], m: 0.67849, k: -1.95537 },
  aV: { a: [-0.07771, 0.56727, -0.20238, -48.2991, 48.5833], b: [2.33840, 0.95545, 1.14520, 0.791669, 0.791459],
        c: [-0.76284, 0.54039, 0.26809, 0.116226, 0.116479], m: -0.053739, k: 0.83433 },
};
function b3P838Fit(t, fGHz) {
  const x = log10(fGHz);
  let s = t.m * x + t.k;
  for (let j = 0; j < t.a.length; j++) s += t.a[j] * Math.exp(-Math.pow((x - t.b[j]) / t.c[j], 2));
  return s;
}
// k and α for path elevation θ and polarization tilt τ (0 = H, 90 = V, 45 = circular)
function b3P838(fGHz, elevDeg, tauDeg) {
  const kH = Math.pow(10, b3P838Fit(B3_P838.kH, fGHz)), kV = Math.pow(10, b3P838Fit(B3_P838.kV, fGHz));
  const aH = b3P838Fit(B3_P838.aH, fGHz), aV = b3P838Fit(B3_P838.aV, fGHz);
  const c = Math.pow(Math.cos(elevDeg * PI / 180), 2) * Math.cos(2 * tauDeg * PI / 180);
  const k = (kH + kV + (kH - kV) * c) / 2;
  const alpha = (kH * aH + kV * aV + (kH * aH - kV * aV) * c) / (2 * k);
  return { k: k, alpha: alpha, kH: kH, kV: kV, aH: aH, aV: aV };
}
const b3Tau = v => v.$.pol === 'v' ? 90 : v.$.pol === 'c' ? 45 : 0;
const b3Rain = v => b3P838(v.f / 1e9, v.el, b3Tau(v));

// ---- two-ray ground reflection ------------------------------------------------
const b3PlaneEarth = (d, ht, hr) => 40 * log10(d) - 20 * log10(ht) - 20 * log10(hr);
const b3Crossover = (f, ht, hr) => 4 * PI * ht * hr / b3Lam(f);
// path lengths of the direct and the ground-reflected ray, and their difference
// r2 − r1 = 4·ht·hr/(r1 + r2), written without the cancellation of r2 − r1
function b3TwoRayPaths(d, ht, hr) {
  const r1 = sqrt(d * d + Math.pow(ht - hr, 2)), r2 = sqrt(d * d + Math.pow(ht + hr, 2));
  return { r1: r1, r2: r2, dr: 4 * ht * hr / (r1 + r2) };
}
// exact two-ray sum with a perfectly reflecting ground (Γ = −1)
function b3TwoRayExact(f, d, ht, hr) {
  const lam = b3Lam(f), p = b3TwoRayPaths(d, ht, hr);
  const ph = 2 * PI * p.dr / lam, s = Math.sin(ph / 2);
  // 1/r1 − cos(φ)/r2 = (r2 − r1)/(r1·r2) + 2·sin²(φ/2)/r2, also free of cancellation
  const re = p.dr / (p.r1 * p.r2) + 2 * s * s / p.r2, im = Math.sin(ph) / p.r2;
  return -dbv(lam / (4 * PI) * Math.hypot(re, im));
}
// |1/r1 − e^(−jφ)/r2| ≤ 1/r1 + 1/r2: the exact loss never drops below this floor, which
// rises steadily with d and is reached at every in-phase peak (φ = π, 3π, …)
function b3TwoRayFloor(f, d, ht, hr) {
  const p = b3TwoRayPaths(d, ht, hr);
  return -dbv(b3Lam(f) / (4 * PI) * (1 / p.r1 + 1 / p.r2));
}
// farthest distance in [lo, hi] at which the exact two-ray loss equals L (NaN if none).
// The loss equals L where h(d) = a_L − |z(d)| = 0, with z = 1/r1 − e^(−jφ)/r2 and a_L = (4π/λ)·10^(−L/20);
// h > 0 means more loss than L. With u = ln d and κ = d²/(r1·r2): dr_i/du = d²/r_i, dφ/du = −κ·φ, so
// |dh/du| ≤ |dz/du| ≤ κ·[3·(r2 − r1)/r1² + (φ + min(2, φ))/r2]. κ rises and the bracket falls with d,
// so κ at the far end times the bracket at the near end bounds the slope over an interval. If
// h(a) + h(b) exceeds that slope × ln(b/a), h cannot reach 0 inside and the interval is skipped;
// otherwise it is halved, far half first. No root (not even a tangent one) is missed.
function b3TwoRayFar(f, L, ht, hr, lo, hi) {
  const fl = d => b3TwoRayFloor(f, d, ht, hr) - L;
  if (!(fl(lo) <= 0)) return NaN;                 // the loss exceeds L at every distance
  const lam = b3Lam(f), aL = 4 * PI / lam * fromDbv(-L);
  const zOf = d => {
    const p = b3TwoRayPaths(d, ht, hr), ph = 2 * PI * p.dr / lam, s = Math.sin(ph / 2);
    return { d: d, h: aL - Math.hypot(p.dr / (p.r1 * p.r2) + 2 * s * s / p.r2, Math.sin(ph) / p.r2), ph: ph,
      k: d * d / (p.r1 * p.r2), lip: 3 * p.dr / (p.r1 * p.r1) + (ph + Math.min(2, ph)) / p.r2 };
  };
  // farthest root of h in [za.d, zb.d], given zb.h > 0 (NaN if none)
  const seek = (za, zb) => {
    const w = Math.log(zb.d / za.d);
    if (za.h > 0 && za.h + zb.h > w * zb.k * za.lip) return NaN;
    const m = sqrt(za.d * zb.d);
    // stop at full precision (the phase moves by φ·κ per unit of ln d)
    if (w < Math.max(1e-15, 1e-13 / Math.max(1, za.ph * zb.k))) return m;
    const zm = zOf(m), r = seek(zm, zb);
    return !isNaN(r) ? r : zm.h > 0 ? seek(za, zm) : m;
  };
  const bisect = (a, b, h) => {                    // sign change of h in [a, b], bisected in ln d
    const sb = h(b) > 0;
    for (let i = 0; i < 200 && b / a - 1 > 1e-15; i++) {
      const m = sqrt(a * b);
      if ((h(m) > 0) === sb) b = m; else a = m;
    }
    return [a, b];
  };
  // no root lies beyond the distance where the floor reaches L (fl > 0 at the upper end)
  let zd = zOf(fl(hi) <= 0 ? hi : bisect(lo, hi, fl)[1]);
  if (zd.h === 0) return zd.d;
  if (!(zd.h > 0)) return NaN;                     // even the largest distance has less loss than L
  // march towards the antennas in pieces of about 1 rad of phase, each searched completely
  for (let n = 0; n < 1e6 && zd.d > lo; n++) {
    const zn = zOf(Math.max(lo, zd.d * Math.exp(-Math.min(0.5, 1 / Math.max(zd.ph * zd.k, 1e-300)))));
    const r = seek(zn, zd);
    if (!isNaN(r)) return r;
    zd = zn;
  }
  return NaN;
}
// farthest null of the exact sum: r2 − r1 = λ gives r1 + r2 = 4·ht·hr/λ, so
// d² = ((4·ht·hr − λ²)/(2λ))² − (ht − hr)²; the path difference never reaches λ if 2·min(ht, hr) ≤ λ
function b3TwoRayNull(f, ht, hr) {
  const l = b3Lam(f);
  if (!(l > 0 && ht > 0 && hr > 0)) return NaN;       // missing input: no answer, not 'None'
  if (!(2 * Math.min(ht, hr) > l)) return 'None (2·min(hₜ, hᵣ) ≤ λ)';
  const s = (4 * ht * hr - l * l) / (2 * l), q = s * s - Math.pow(ht - hr, 2);
  return q > 0 ? sqrt(q) : 0;
}
function b3TwoRayLoss(model, f, d, ht, hr) {
  if (model === 'exact') return b3TwoRayExact(f, d, ht, hr);
  if (model === 'plane') return b3PlaneEarth(d, ht, hr);
  return d < b3Crossover(f, ht, hr) ? fsplDb(f, d) : b3PlaneEarth(d, ht, hr);
}
function b3TwoRayDist(model, f, L, ht, hr) {
  const dPlane = Math.pow(10, (L + 20 * log10(ht) + 20 * log10(hr)) / 40);
  if (model === 'plane') return dPlane;
  if (model === 'exact') {
    // several distances can give the same loss close to the antennas: take the farthest
    return b3TwoRayFar(f, L, ht, hr, 1e-3, 1e8);
  }
  const dFs = C0 * fromDbv(L) / (4 * PI * f);
  return dFs < b3Crossover(f, ht, hr) ? dFs : dPlane;
}

// ---- radar range equation ---------------------------------------------------
const b3SminDbm = (bw, nf, snr) => dbp(KB * 290 * bw * 1000) + nf + snr;
// R⁴ = Pt·G²·λ²·σ·Gi / ((4π)³·Smin·L)
const b3RadarR = v => Math.pow(v.pt * Math.pow(fromDbp(v.g), 2) * Math.pow(b3Lam(v.f), 2) * v.sigma * fromDbp(v.gi) /
  (Math.pow(4 * PI, 3) * 1e-3 * fromDbp(v.smin) * fromDbp(v.ls)), 0.25);

// ---- polarization mismatch ------------------------------------------------------
// PLF for two elliptically polarized antennas from axial ratios (dB; ∞ = linear),
// tilt difference Δτ and rotation sense (opposite sense flips the sign of 1/AR).
function b3Plf(ar1Db, ar2Db, dtDeg, opposite) {
  const r1 = isFinite(ar1Db) ? fromDbv(-Math.abs(ar1Db)) : 0;
  let r2 = isFinite(ar2Db) ? fromDbv(-Math.abs(ar2Db)) : 0;
  if (opposite) r2 = -r2;
  // [(1 + ρ1ρ2)²·cos²Δτ + (ρ1 + ρ2)²·sin²Δτ] / [(1 + ρ1²)(1 + ρ2²)]: a sum of non-negative
  // terms, so orthogonal states give exactly 0 (written with cos 2Δτ, which is exact at 0° and 90°)
  const c2 = Math.cos(2 * dtDeg * PI / 180);
  const p = (Math.pow(1 + r1 * r2, 2) * (1 + c2) + Math.pow(r1 + r2, 2) * (1 - c2)) / (2 * (1 + r1 * r1) * (1 + r2 * r2));
  return Math.min(1, Math.max(0, p));
}

// ---- RF exposure limits (verified: ICNIRP 2020 Table 5; 47 CFR 1.1310 Table 1) --
// Returns { S: W/m², E: V/m (NaN if not applicable), eq: S is the plane-wave
// equivalent of the E-field level, avg: averaging time (min) } or null outside the range.
function b3Limit(std, f) {
  const fM = f / 1e6;
  const pw = e => e * e / ETA0;
  if (std === 'icnirp-gp' || std === 'icnirp-occ') {
    const occ = std === 'icnirp-occ';
    if (!(fM >= 0.1 && fM <= 300000)) return null;
    if (fM <= 30) { const e = (occ ? 660 : 300) / Math.pow(fM, 0.7); return { S: pw(e), E: e, eq: true, avg: 30 }; }
    if (fM <= 400) return { S: occ ? 10 : 2, E: occ ? 61 : 27.7, eq: false, avg: 30 };
    if (fM <= 2000) return { S: fM / (occ ? 40 : 200), E: (occ ? 3 : 1.375) * sqrt(fM), eq: false, avg: 30 };
    return { S: occ ? 50 : 10, E: NaN, eq: false, avg: 30 };
  }
  // FCC limits are in mW/cm² (×10 = W/m²)
  const occ = std === 'fcc-occ';
  if (!(fM >= 0.3 && fM <= 100000)) return null;
  const avg = occ ? 6 : 30;
  if (occ) {
    if (fM <= 3) return { S: 1000, E: 614, eq: true, avg: avg };
    if (fM <= 30) return { S: 10 * 900 / (fM * fM), E: 1842 / fM, eq: true, avg: avg };
    if (fM <= 300) return { S: 10, E: 61.4, eq: false, avg: avg };
    if (fM <= 1500) return { S: 10 * fM / 300, E: NaN, eq: false, avg: avg };
    return { S: 50, E: NaN, eq: false, avg: avg };
  }
  if (fM <= 1.34) return { S: 1000, E: 614, eq: true, avg: avg };
  if (fM <= 30) return { S: 10 * 180 / (fM * fM), E: 824 / fM, eq: true, avg: avg };
  if (fM <= 300) return { S: 2, E: 27.5, eq: false, avg: avg };
  if (fM <= 1500) return { S: 10 * fM / 1500, E: NaN, eq: false, avg: avg };
  return { S: 10, E: NaN, eq: false, avg: avg };
}
const b3Slim = v => { const l = b3Limit(v.$.std, v.f); return l ? l.S : NaN; };
const b3Refl = v => v.$.refl === 'ground' ? 2.56 : v.$.refl === 'full' ? 4 : 1;

// ---- G/T ------------------------------------------------------------------------
// System temperature referred to the antenna terminals
const b3Tsys = v => {
  const L = fromDbp(v.lf), tr = 290 * (fromDbp(v.nfr) - 1);
  return v.ta + (L - 1) * v.tp + L * (v.te + tr / fromDbp(v.glna));
};

// ---- air-core single-layer coil (Wheeler, inches form) -------------------------
const b3WheelerL = (n, d, l) => { const di = d / 0.0254, li = l / 0.0254; return 1e-6 * di * di * n * n / (18 * di + 40 * li); };

// ---- Pi / T matching for a chosen loaded Q ------------------------------------
// topo: 'pi-lp', 'pi-hp', 't-lp', 't-hp'. Real source Rs and load RL.
function b3PiT(topo, Rs, RL, Q, f) {
  const w = 2 * PI * f, isPi = topo.startsWith('pi'), lp = topo.endsWith('lp');
  const Rh = Math.max(Rs, RL), Rl = Math.min(Rs, RL);
  const Qmin = sqrt(Rh / Rl - 1);
  if (!(Rs > 0 && RL > 0 && f > 0 && Q > 0)) return { err: 'Enter positive values.' };
  if (!(Q > Qmin + 1e-12)) return { err: 'Q must be larger than the minimum ' + fmt(Qmin, 4) + ' for this resistance ratio.', Qmin: Qmin };
  const els = [];
  const elem = (role, X) => {
    // X > 0: inductive reactance, X < 0: capacitive
    const kind = X > 0 ? 'L' : 'C';
    const val = X > 0 ? X / w : -1 / (w * X);
    els.push({ role: role, kind: kind, X: X, val: val });
  };
  let Rv, zin;
  const RLc = cx(RL);
  if (isPi) {
    Rv = Rh / (Q * Q + 1);
    const Q1 = sqrt(Rs / Rv - 1), Q2 = sqrt(RL / Rv - 1);
    const Xp1 = Rs / Q1, Xp2 = RL / Q2, Xs = Rv * (Q1 + Q2);
    const sh = lp ? -1 : 1, se = lp ? 1 : -1;
    elem('Shunt (source side)', sh * Xp1);
    elem('Series', se * Xs);
    elem('Shunt (load side)', sh * Xp2);
    let z = b3Par(RLc, cx(0, sh * Xp2));
    z = cadd(z, cx(0, se * Xs));
    zin = b3Par(z, cx(0, sh * Xp1));
  } else {
    Rv = Rl * (Q * Q + 1);
    const Q1 = sqrt(Rv / Rs - 1), Q2 = sqrt(Rv / RL - 1);
    const Xs1 = Q1 * Rs, Xs2 = Q2 * RL, Xp1 = Rv / Q1, Xp2 = Rv / Q2;
    const Xp = Xp1 * Xp2 / (Xp1 + Xp2);
    const sh = lp ? -1 : 1, se = lp ? 1 : -1;
    elem('Series (source side)', se * Xs1);
    elem('Shunt', sh * Xp);
    elem('Series (load side)', se * Xs2);
    let z = cadd(RLc, cx(0, se * Xs2));
    z = b3Par(z, cx(0, sh * Xp));
    zin = cadd(z, cx(0, se * Xs1));
  }
  return { els: els, Rv: Rv, Qmin: Qmin, zin: zin, bw: f / Q };
}

// ---- 2-port cascade (ABCD) ------------------------------------------------------
// Block types and their parameters: [key, label, default, unit]
const B3_BLOCKS = {
  sr:  { name: 'Series R', p: [['R', 'R', '50', 'Ω']] },
  sl:  { name: 'Series L', p: [['L', 'L', '10n', 'H']] },
  sc:  { name: 'Series C', p: [['C', 'C', '1p', 'F']] },
  sz:  { name: 'Series Z = R + jX', p: [['R', 'R', '0', 'Ω'], ['X', 'X', '50', 'Ω']] },
  shr: { name: 'Shunt R', p: [['R', 'R', '50', 'Ω']] },
  shl: { name: 'Shunt L', p: [['L', 'L', '10n', 'H']] },
  shc: { name: 'Shunt C', p: [['C', 'C', '1p', 'F']] },
  shz: { name: 'Shunt Z = R + jX', p: [['R', 'R', '0', 'Ω'], ['X', 'X', '-50', 'Ω']] },
  line: { name: 'Transmission line', p: [['zc', 'Z₀', '50', 'Ω'], ['deg', 'Length', '90', '° at f'], ['loss', 'Loss', '0', 'dB']] },
  att: { name: 'Matched attenuator', p: [['a', 'Attenuation', '3', 'dB']] },
  amp: { name: 'Matched amplifier', p: [['g', 'Gain', '20', 'dB'], ['iso', 'Reverse isolation', '40', 'dB']] },
  s:   { name: 'S-parameter block (at Z₀)', p: [['s11', '|S11|', '-20', 'dB'], ['a11', '∠S11', '0', '°'], ['s21', '|S21|', '-1', 'dB'], ['a21', '∠S21', '0', '°'],
                                            ['s12', '|S12|', '-1', 'dB'], ['a12', '∠S12', '0', '°'], ['s22', '|S22|', '-20', 'dB'], ['a22', '∠S22', '0', '°']] },
};
function b3BlockABCD(blk, f, z0) {
  const def = B3_BLOCKS[blk.type];
  if (!def) return { err: 'Unknown block' };
  const p = {};
  for (const [k] of def.p) {
    const x = parseNum(blk.v[k]);
    if (isNaN(x)) return { err: def.name + ': invalid ' + k };
    p[k] = x;
  }
  const w = 2 * PI * f;
  const series = z => [[cx(1), z], [cx(0), cx(1)]];
  const shunt = z => [[cx(1), cx(0)], [cinv(z), cx(1)]];
  switch (blk.type) {
    case 'sr': return { m: series(cx(p.R)) };
    case 'sl': return { m: series(cx(0, w * p.L)) };
    case 'sc': return { m: series(cx(0, -1 / (w * p.C))) };
    case 'sz': return { m: series(cx(p.R, p.X)) };
    case 'shr': return { m: shunt(cx(p.R)) };
    case 'shl': return { m: shunt(cx(0, w * p.L)) };
    case 'shc': return { m: shunt(cx(0, -1 / (w * p.C))) };
    case 'shz': return { m: shunt(cx(p.R, p.X)) };
    case 'line': {
      const gl = cx(p.loss / DB_NEPER, p.deg * PI / 180);
      const ch = b3Ccosh(gl), sh = b3Csinh(gl);
      return { m: [[ch, cscale(sh, p.zc)], [cscale(sh, 1 / p.zc), ch]] };
    }
    case 'att': { const k = fromDbv(-p.a); return { m: sToABCD([[cx(0), cx(k)], [cx(k), cx(0)]], z0) }; }
    case 'amp': return { m: sToABCD([[cx(0), cx(fromDbv(-p.iso))], [cx(fromDbv(p.g)), cx(0)]], z0), det: cx(fromDbv(-p.iso) / fromDbv(p.g)) };
    case 's': {
      const S = [[cpol(fromDbv(p.s11), p.a11), cpol(fromDbv(p.s12), p.a12)], [cpol(fromDbv(p.s21), p.a21), cpol(fromDbv(p.s22), p.a22)]];
      if (cabs(S[1][0]) === 0) return { err: 'S-parameter block needs S21 ≠ 0' };
      return { m: sToABCD(S, z0), det: cdiv(S[0][1], S[1][0]) };
    }
  }
  return { err: 'Unknown block' };
}
// det(ABCD) of the cascade is the product of the block determinants: exactly 1 for
// reciprocal blocks, S12/S21 for S-parameter-defined ones (Pozar 4.4).
function b3Cascade(blocks, f, z0) {
  let M = mEye(2), det = cx(1);
  for (let i = 0; i < blocks.length; i++) {
    const r = b3BlockABCD(blocks[i], f, z0);
    if (r.err) return { err: 'Block ' + (i + 1) + ': ' + r.err };
    M = mMul(M, r.m);
    if (r.det) det = cmul(det, r.det);
  }
  return { abcd: M, det: det, S: abcdToS(M, z0, det) };
}

// ============================================================ calculators ====
CALCS.push(
// ------------------------------------------------------------------- power --
{
  id: 'fieldstr', cat: 'power', title: 'Field Strength ↔ Power Density ↔ Antenna Factor', kw: 'field strength v/m dbuv/m power density antenna factor emc received power',
  desc: 'Far-field conversions between electric field, power density, received power and receiver voltage for an antenna with gain G. Enter one level; the others are filled in.',
  vars: [
    fq('f', 'Frequency', 1e9, 'MHz', { sticky: true }),
    dbV('G', 'Antenna gain', 0, 'dBi', { sticky: true, pri: -1 }),
    ohmV('Z', 'Receiver impedance', 50, { sticky: true, pri: 1 }),
    uV('E', 'Electric field E', 'b3vm', 'V/m', 1, { min: 1e-18, max: 1e12 }),
    dbV('dBuVm', 'Electric field', undefined, 'dBµV/m'),
    uV('S', 'Power density S', 'b3wm2', 'W/m²'),
    dbV('AF', 'Antenna factor AF', undefined, 'dB/m'),
    dbV('Pr', 'Received power (matched)', undefined, 'dBm'),
    dbV('Vrx', 'Receiver voltage', undefined, 'dBµV'),
  ],
  eqs: [
    E('dBuVm', ['E'], v => dbv(v.E / 1e-6), { E: v => 1e-6 * fromDbv(v.dBuVm) }),
    E('S', ['E'], v => v.E * v.E / ETA0, { E: v => sqrt(v.S * ETA0) }),
    E('AF', ['f', 'G', 'Z'], v => b3AF(v.f, v.G, v.Z), {
      G: v => dbp(4 * PI * ETA0 / (fromDbp(v.AF) * Math.pow(b3Lam(v.f), 2) * v.Z)),
      Z: v => 4 * PI * ETA0 / (fromDbp(v.AF) * fromDbp(v.G) * Math.pow(b3Lam(v.f), 2)),
      f: v => C0 / sqrt(4 * PI * ETA0 / (fromDbp(v.AF) * fromDbp(v.G) * v.Z)),
    }),
    E('Pr', ['S', 'G', 'f'], v => dbp(v.S * fromDbp(v.G) * Math.pow(b3Lam(v.f), 2) / (4 * PI) / 1e-3), {
      S: v => 1e-3 * fromDbp(v.Pr) * 4 * PI / (fromDbp(v.G) * Math.pow(b3Lam(v.f), 2)),
      G: v => dbp(1e-3 * fromDbp(v.Pr) * 4 * PI / (v.S * Math.pow(b3Lam(v.f), 2))),
      f: v => C0 / sqrt(1e-3 * fromDbp(v.Pr) * 4 * PI / (v.S * fromDbp(v.G))),
    }),
    E('Vrx', ['dBuVm', 'AF'], v => v.dBuVm - v.AF, { dBuVm: v => v.Vrx + v.AF, AF: v => v.dBuVm - v.Vrx }),
  ],
  outputs: [
    O('Magnetic field H = E/η₀', v => v.E / ETA0, 'A/m', true),
    O('Power density', v => dbp(v.S / 1e-3), 'dBm/m²'),
    O('Effective aperture A<sub>e</sub> = Gλ²/4π', v => fromDbp(v.G) * Math.pow(b3Lam(v.f), 2) / (4 * PI), 'm²'),
    O('Receiver voltage', v => 1e-6 * fromDbv(v.Vrx), 'V', true),
    O('Received power', v => 1e-3 * fromDbp(v.Pr), 'W', true),
    O('Wavelength', v => b3Lam(v.f), 'm', true),
  ],
  note: 'S = E²/η₀ (far field, η₀ = 376.7 Ω) · A<sub>e</sub> = Gλ²/4π · AF = E/V = √(4πη₀/(Z·G·λ²)) = 9.73/(λ√G) at 50 Ω · V<sub>rx</sub>[dBµV] = E[dBµV/m] − AF',
},
{
  id: 'papr', cat: 'power', title: 'PAPR / Crest Factor', kw: 'papr crest factor peak average power envelope ofdm headroom',
  desc: 'Peak envelope power vs. average power. Pick a typical signal or enter your own PAPR.',
  cfg: [{ id: 'sig', label: 'Signal preset', def: 'custom', options: B3_PAPR.map(p => [p[0], p[1]]),
          set: val => { const p = B3_PAPR.find(x => x[0] === val); return p && p[2] !== null ? { papr: p[2] } : {}; } }],
  vars: [
    dbV('pavg', 'Average power', 30, 'dBm'),
    dbV('papr', 'PAPR (peak envelope / average)', 10, 'dB', { min: 0 }),
    dbV('ppk', 'Peak envelope power', undefined, 'dBm'),
    dbV('cfdb', 'Crest factor of the RF waveform (Vpk/Vrms)', undefined, 'dB', { min: 0 }),
    ohmV('Z', 'Impedance (for voltages)', 50),
  ],
  eqs: [
    E('ppk', ['pavg', 'papr'], v => v.pavg + v.papr, { pavg: v => v.ppk - v.papr, papr: v => v.ppk - v.pavg }),
    E('cfdb', ['papr'], v => v.papr + dbp(2), { papr: v => v.cfdb - dbp(2) }),
  ],
  outputs: [
    O('Average power', v => 1e-3 * fromDbp(v.pavg), 'W', true),
    O('Peak envelope power', v => 1e-3 * fromDbp(v.ppk), 'W', true),
    O('Crest factor (linear)', v => fromDbv(v.cfdb), '×'),
    O('Peak voltage', v => sqrt(2 * 1e-3 * fromDbp(v.ppk) * v.Z), 'V', true),
    O('RMS voltage (average)', v => sqrt(1e-3 * fromDbp(v.pavg) * v.Z), 'V', true),
    O('Amplifier needs P1dB ≥ peak power', v => fmt(v.ppk, 5) + ' dBm'),
  ],
  note: 'PAPR = P<sub>peak envelope</sub>/P<sub>avg</sub>. The RF crest factor (instantaneous V<sub>pk</sub>/V<sub>rms</sub>) is 3.01 dB higher, because a sine carrier at the envelope peak has V<sub>pk</sub> = √2·V<sub>rms</sub>. Gaussian/OFDM: P(PAPR > x) = e<sup>−x</sup>. Filtered-signal values are typical and depend on roll-off and CCDF level.',
},
// ---------------------------------------------------------------- mismatch --
{
  id: 'directivity', cat: 'mismatch', title: 'Directivity Error (Return-Loss Measurement)', kw: 'directivity coupler bridge return loss measurement uncertainty error',
  desc: 'The coupler or bridge leaks part of the incident wave into the reflected path. This shows the range in which the true return loss can lie.',
  vars: [
    dbV('D', 'Coupler / bridge directivity', 30, 'dB', { min: 0 }),
    dbV('rlm', 'Measured return loss', 20, 'dB', { min: 0 }),
    linV('gm', 'Measured |Γ|', undefined, '', { min: 0, max: 1 }),
    linV('ed', 'Directivity error |ε<sub>D</sub>|', undefined, '', { min: 0, max: 1 }),
    dbV('rlw', 'True return loss, worst case', undefined, 'dB'),
    dbV('rlb', 'True return loss, best case', undefined, 'dB'),
  ],
  eqs: [
    E('gm', ['rlm'], v => fromDbv(-v.rlm), { rlm: v => -dbv(v.gm) }),
    E('ed', ['D'], v => fromDbv(-v.D), { D: v => -dbv(v.ed) }),
    // a passive DUT has |Γ| ≤ 1, so the worst case stops at total reflection (RL = 0 dB)
    E('rlw', ['gm', 'ed'], v => -dbv(Math.min(1, v.gm + v.ed)), { gm: v => fromDbv(-v.rlw) - v.ed, ed: v => fromDbv(-v.rlw) - v.gm }),
    E('rlb', ['gm', 'ed'], v => v.gm > v.ed ? -dbv(v.gm - v.ed) : Infinity, {
      gm: v => isFinite(v.rlb) ? fromDbv(-v.rlb) + v.ed : NaN,
      ed: v => isFinite(v.rlb) ? v.gm - fromDbv(-v.rlb) : NaN,
    }),
  ],
  outputs: [
    O('Measurement error range', v => fmt(v.rlw - v.rlm, 4) + ' … ' + (isFinite(v.rlb) ? '+' + fmt(v.rlb - v.rlm, 4) : '+∞') + ' dB'),
    O('True VSWR range', v => fmt(vswrOf(Math.max(0, v.gm - v.ed)), 4) + ' … ' + (v.gm + v.ed >= 1 ? '∞' : fmt(vswrOf(v.gm + v.ed), 4))),
    O('Directivity margin D − RL', v => v.D - v.rlm, 'dB'),
    O('Directivity for ≤ 1 dB error at this RL', v => v.rlm - dbv(1 - fromDbv(-1)), 'dB'),
    O('Directivity for ≤ 0.5 dB error at this RL', v => v.rlm - dbv(1 - fromDbv(-0.5)), 'dB'),
  ],
  warn: v => (v.gm + v.ed >= 1) ? '⚠ |Γ_meas| + |ε_D| ≥ 1: the worst case reaches total reflection (|Γ| = 1, RL = 0 dB). The directivity is too poor for this return loss.' : null,
  note: '|Γ<sub>true</sub>| lies between |Γ<sub>meas</sub>| − |ε<sub>D</sub>| and min(1, |Γ<sub>meas</sub>| + |ε<sub>D</sub>|) for a passive DUT, with |ε<sub>D</sub>| = 10<sup>−D/20</sup> (directivity only; source match and tracking errors are not included).',
},
{ id: 'cascade2p', cat: 'mismatch', title: '2-Port Cascade & Renormalisation', kw: 'cascade abcd chain two-port renormalize reference impedance s-parameters ladder', custom: 'cascade2p' },
// ---------------------------------------------------------------- matching --
{ id: 'pimatch', cat: 'matching', title: 'Pi / T Matching Network (chosen Q)', kw: 'pi network t network tee matching loaded q bandwidth', custom: 'pimatch' },
{
  id: 'aircoil', cat: 'matching', title: 'Air-Core Coil (Wheeler)', kw: 'air core inductor coil wheeler turns winding solenoid',
  desc: 'Single-layer air-core solenoid. The diameter is measured from wire centre to wire centre.',
  vars: [
    uV('L', 'Inductance L', 'H', 'nH'),
    posV('n', 'Number of turns', 10, '', { min: 1e-3, max: 1e6 }),
    lenV('d', 'Coil diameter (wire centre to centre)', 10e-3, 'mm'),
    lenV('len', 'Coil length', 10e-3, 'mm'),
    lenV('wd', 'Wire diameter (for spacing)', 0.8e-3, 'mm', { inMin: 0 }),
    fq('f', 'Frequency (for reactance)', 100e6, 'MHz'),
  ],
  eqs: [
    E('L', ['n', 'd', 'len'], v => b3WheelerL(v.n, v.d, v.len), {
      n: v => { const di = v.d / 0.0254, li = v.len / 0.0254; return sqrt(v.L * 1e6 * (18 * di + 40 * li)) / di; },
      len: v => { const di = v.d / 0.0254; return 0.0254 * (di * di * v.n * v.n / (v.L * 1e6) - 18 * di) / 40; },
      d: v => { const Lu = v.L * 1e6, li = v.len / 0.0254, n2 = v.n * v.n; return 0.0254 * (18 * Lu + sqrt(Math.pow(18 * Lu, 2) + 160 * Lu * li * n2)) / (2 * n2); },
    }),
  ],
  outputs: [
    O('Length / diameter', v => v.len / v.d, ''),
    O('Turn pitch', v => v.len / v.n, 'm', true),
    O('Gap between turns', v => v.len / v.n - v.wd, 'm', true),
    O('Wire length (without leads)', v => PI * v.d * v.n, 'm', true),
    O('Reactance at f', v => 2 * PI * v.f * v.L, 'Ω', true),
  ],
  warn: v => {
    if (v.len / v.n < v.wd - 1e-12) return '⚠ The turns overlap: the pitch is smaller than the wire diameter.';
    if (v.len / v.d < 0.4) return '⚠ Length < 0.4 × diameter: Wheeler’s formula loses accuracy (> 1 % error).';
    return null;
  },
  note: 'Wheeler: L[µH] = d²n²/(18d + 40ℓ) with d and ℓ in inches (≈ 1 % for ℓ > 0.4d). Self-resonance and proximity effects are not included.',
},
// ------------------------------------------------------------------- lines --
{
  id: 'waveguide', cat: 'lines', title: 'Rectangular Waveguide', kw: 'waveguide wr te10 cutoff guide wavelength group velocity rectangular',
  desc: 'TE₁₀ mode: cutoff, guide wavelength, velocities, wave impedance and copper loss. Pick a standard WR size or enter a and b.',
  cfg: [{ id: 'wr', label: 'Standard size', def: String(WAVEGUIDES.findIndex(w => w[0] === 'WR-90')),
          options: [['custom', 'Custom']].concat(WAVEGUIDES.map((w, i) => [String(i), w[0] + ' (' + w[1] + ' × ' + w[2] + ' mm, ' + fmtSI(w[3], 'Hz', 3) + ' – ' + fmtSI(w[4], 'Hz', 3) + ')'])),
          set: val => val === 'custom' ? {} : { a: WAVEGUIDES[+val][1] * 1e-3, b: WAVEGUIDES[+val][2] * 1e-3 } }],
  vars: [
    lenV('a', 'Broad wall a', 22.86e-3, 'mm'),
    posV('er', 'Filling εr', 1, '', { sticky: true, min: 1, max: 1000 }),
    fq('f', 'Frequency', 10e9, 'GHz', { sticky: true }),
    fq('fc', 'TE₁₀ cutoff frequency', undefined, 'GHz'),
    lenV('lg', 'Guide wavelength λ<sub>g</sub>', undefined, 'mm'),
    lenV('b', 'Narrow wall b', 10.16e-3, 'mm'),
  ],
  eqs: [
    E('fc', ['a', 'er'], v => C0 / (2 * v.a * sqrt(v.er)), { a: v => C0 / (2 * v.fc * sqrt(v.er)), er: v => Math.pow(C0 / (2 * v.a * v.fc), 2) }),
    E('lg', ['f', 'fc', 'er'], v => (C0 / (v.f * sqrt(v.er))) / sqrt(1 - Math.pow(v.fc / v.f, 2)), {
      f: v => C0 / sqrt(v.er) * sqrt(1 / (v.lg * v.lg) + Math.pow(v.fc * sqrt(v.er) / C0, 2)),
      fc: v => v.f * sqrt(1 - Math.pow(C0 / (v.f * sqrt(v.er) * v.lg), 2)),
      er: v => C0 * C0 / (v.lg * v.lg * (v.f * v.f - v.fc * v.fc)),
    }),
  ],
  outputs: [
    O('Next modes: TE₂₀ / TE₀₁ / TE₁₁ cutoff', v => { const k = C0 / sqrt(v.er); return fmtSI(k / v.a, 'Hz', 4) + ' / ' + fmtSI(k / (2 * v.b), 'Hz', 4) + ' / ' + fmtSI(k / 2 * sqrt(1 / (v.a * v.a) + 1 / (v.b * v.b)), 'Hz', 4); }),
    O('Single-mode band', v => { const k = C0 / sqrt(v.er); return fmtSI(v.fc, 'Hz', 4) + ' – ' + fmtSI(Math.min(k / v.a, k / (2 * v.b)), 'Hz', 4); }),
    O('Recommended band (1.25 … 1.9 × f<sub>c</sub>)', v => fmtSI(1.25 * v.fc, 'Hz', 4) + ' – ' + fmtSI(1.9 * v.fc, 'Hz', 4)),
    O('Phase constant β', v => 2 * PI / v.lg, 'rad/m'),
    O('Phase velocity', v => C0 / sqrt(v.er) / sqrt(1 - Math.pow(v.fc / v.f, 2)), 'm/s', true),
    O('Group velocity', v => C0 / sqrt(v.er) * sqrt(1 - Math.pow(v.fc / v.f, 2)), 'm/s', true),
    O('Group delay per metre', v => 1 / (C0 / sqrt(v.er) * sqrt(1 - Math.pow(v.fc / v.f, 2))), 's', true),
    O('TE₁₀ wave impedance', v => ETA0 / sqrt(v.er) / sqrt(1 - Math.pow(v.fc / v.f, 2)), 'Ω', true),
    O('Copper wall loss (smooth, annealed Cu, 1.724e-8 Ω·m)', v => b3WgLoss(v), 'dB/m'),
  ],
  warn: v => {
    if (v.f <= v.fc) return '⚠ Below cutoff: the TE₁₀ mode does not propagate (evanescent).';
    const k = C0 / sqrt(v.er);
    if (v.f > Math.min(k / v.a, k / (2 * v.b))) return '⚠ Above the next mode cutoff: the guide is multimode at this frequency.';
    return null;
  },
  note: 'f<sub>c</sub> = c/(2a√εr) · λ<sub>g</sub> = λ/√(1 − (f<sub>c</sub>/f)²) · v<sub>p</sub>·v<sub>g</sub> = c²/εr. Loss: Pozar (3.96), smooth walls of annealed copper, ρ = 1.724 µΩ·cm (1.724e-8 Ω·m).',
},
// -------------------------------------------------------------- propagation --
{
  id: 'tworay', cat: 'prop', title: 'Two-Ray Ground Reflection', kw: 'two ray plane earth ground reflection path loss crossover breakpoint',
  desc: 'Direct ray plus a ground-reflected ray. Beyond the crossover distance the loss rises 40 dB per decade and no longer depends on frequency.',
  cfg: [{ id: 'model', label: 'Model', def: 'auto', options: [['auto', 'Auto: free space below the crossover, plane earth above'], ['plane', 'Plane-earth formula only'], ['exact', 'Exact two-ray sum (Γ = −1)']] }],
  vars: [
    fq('f', 'Frequency', 900e6, 'MHz', { sticky: true }),
    lenV('ht', 'TX antenna height', 30, 'm'),
    lenV('hr', 'RX antenna height', 1.5, 'm'),
    lenV('d', 'Distance', 5000, 'km', { pri: -1, min: 1e-3, max: 1e8 }),
    dbV('L', 'Path loss', undefined, 'dB', { pri: -2 }),
    lenV('dc', 'Crossover distance 4π·h<sub>t</sub>·h<sub>r</sub>/λ', undefined, 'km'),
  ],
  eqs: [
    E('dc', ['f', 'ht', 'hr'], v => b3Crossover(v.f, v.ht, v.hr), {
      f: v => v.dc * C0 / (4 * PI * v.ht * v.hr), ht: v => v.dc * b3Lam(v.f) / (4 * PI * v.hr), hr: v => v.dc * b3Lam(v.f) / (4 * PI * v.ht),
    }),
    E('L', ['f', 'd', 'ht', 'hr'], v => b3TwoRayLoss(v.$.model, v.f, v.d, v.ht, v.hr), { d: v => b3TwoRayDist(v.$.model, v.f, v.L, v.ht, v.hr) }),
  ],
  chart: v => b3TwoRayChart(v),
  outputs: [
    O('Free-space loss at d', v => fsplDb(v.f, v.d), 'dB'),
    O('Plane-earth loss at d', v => b3PlaneEarth(v.d, v.ht, v.hr), 'dB'),
    O('Exact two-ray loss at d', v => b3TwoRayExact(v.f, v.d, v.ht, v.hr), 'dB'),
    O('Excess loss over free space', v => v.L - fsplDb(v.f, v.d), 'dB'),
    O('Region', v => v.d < v.dc ? 'Below the crossover (interference ripple region)' : 'Beyond the crossover (40 dB/decade)'),
    O('Last (farthest) null, r₂ − r₁ = λ', v => b3TwoRayNull(v.f, v.ht, v.hr), 'm', true),
  ],
  warn: v => (v.$.model === 'plane' && v.d < v.dc) ? '⚠ Below the crossover distance the plane-earth formula is not valid: it gives less loss than free space (two rays can beat free space by at most 6 dB). Use Auto or Exact.' : null,
  note: 'Plane earth: L = 40·log d − 20·log h<sub>t</sub> − 20·log h<sub>r</sub> (d, h in m), valid for d ≫ h and beyond the crossover d<sub>c</sub> = 4π·h<sub>t</sub>h<sub>r</sub>/λ, where free-space and plane-earth losses are equal. The last null is the exact Γ = −1 solution of r₂ − r₁ = λ (≈ 2h<sub>t</sub>h<sub>r</sub>/λ for d ≫ h); there is none if 2·min(h<sub>t</sub>, h<sub>r</sub>) ≤ λ. Solving for the distance with the exact model returns the farthest solution.',
},
{
  id: 'rain', cat: 'prop', title: 'Rain Attenuation (ITU-R P.838-3)', kw: 'rain attenuation itu p.838 specific attenuation fade margin mmwave',
  desc: 'Specific attenuation γ = k·R^α with the ITU-R P.838-3 coefficients (1 – 1000 GHz), and the total over a path.',
  cfg: [{ id: 'pol', label: 'Polarization', def: 'h', options: [['h', 'Horizontal (τ = 0°)'], ['v', 'Vertical (τ = 90°)'], ['c', 'Circular (τ = 45°)']] }],
  vars: [
    fq('f', 'Frequency', 20e9, 'GHz', { sticky: true, min: 1e9, max: 1e12 }),
    posV('R', 'Rain rate R', 25, 'mm/h', { min: 1e-4, max: 1e4 }),
    linV('el', 'Path elevation angle', 0, '°', { sticky: true, min: 0, max: 90 }),
    posV('gamma', 'Specific attenuation γ', undefined, 'dB/km'),
    lenV('d', 'Path length in rain', 5000, 'km', { pri: -1 }),
    posV('A', 'Rain attenuation', undefined, 'dB'),
  ],
  eqs: [
    E('gamma', ['f', 'R', 'el'], v => { const c = b3Rain(v); return c.k * Math.pow(v.R, c.alpha); }, {
      R: v => { const c = b3Rain(v); return Math.pow(v.gamma / c.k, 1 / c.alpha); },
    }),
    E('A', ['gamma', 'd'], v => v.gamma * v.d / 1000, { gamma: v => v.A * 1000 / v.d, d: v => v.A * 1000 / v.gamma }),
  ],
  outputs: [
    O('k / α (selected polarization)', v => { const c = b3Rain(v); return fmt(c.k, 5) + ' / ' + fmt(c.alpha, 5); }),
    O('k<sub>H</sub> / α<sub>H</sub>', v => { const c = b3Rain(v); return fmt(c.kH, 5) + ' / ' + fmt(c.aH, 5); }),
    O('k<sub>V</sub> / α<sub>V</sub>', v => { const c = b3Rain(v); return fmt(c.kV, 5) + ' / ' + fmt(c.aV, 5); }),
    O('Rain intensity', v => v.R < 2.5 ? 'Light' : v.R < 10 ? 'Moderate' : v.R < 50 ? 'Heavy' : 'Violent / tropical'),
  ],
  note: 'ITU-R P.838-3 coefficients (equations 2 – 5), checked against Table 5 of the Recommendation. The total uses γ × path length, without the path-reduction factor of ITU-R P.530 / P.618, so it is conservative for long paths. Typical R<sub>0.01 %</sub> is 20 – 100 mm/h depending on the climate.',
},
{
  id: 'radareq', cat: 'prop', title: 'Radar Range Equation', kw: 'radar range equation detection range rcs monostatic sensitivity',
  desc: 'Monostatic radar: maximum detection range from transmit power, antenna gain, RCS and receiver sensitivity.',
  vars: [
    uV('pt', 'Peak transmit power', 'W', 'kW', 100e3),
    dbV('g', 'Antenna gain (TX = RX)', 35, 'dBi'),
    fq('f', 'Frequency', 10e9, 'GHz', { sticky: true }),
    uV('sigma', 'Target RCS σ', 'm2', 'm²', 1),
    dbV('ls', 'System losses', 3, 'dB'),
    dbV('gi', 'Integration gain (n pulses)', 0, 'dB'),
    dbV('nf', 'Receiver noise figure', 3, 'dB'),
    fq('bw', 'Receiver bandwidth', 1e6, 'MHz', { min: 1e-3, max: 1e13 }),
    dbV('snr', 'Required SNR', 13, 'dB'),
    dbV('smin', 'Minimum detectable signal', undefined, 'dBm'),
    lenV('R', 'Maximum detection range', undefined, 'km', { pri: -1 }),
  ],
  eqs: [
    E('smin', ['bw', 'nf', 'snr'], v => b3SminDbm(v.bw, v.nf, v.snr), {
      nf: v => v.smin - dbp(KB * 290 * v.bw * 1000) - v.snr, snr: v => v.smin - dbp(KB * 290 * v.bw * 1000) - v.nf,
      bw: v => fromDbp(v.smin - v.nf - v.snr) / (KB * 290 * 1000),
    }),
    E('R', ['pt', 'g', 'f', 'sigma', 'ls', 'gi', 'smin'], b3RadarR, {
      pt: v => Math.pow(v.R, 4) * Math.pow(4 * PI, 3) * 1e-3 * fromDbp(v.smin) * fromDbp(v.ls) / (Math.pow(fromDbp(v.g), 2) * Math.pow(b3Lam(v.f), 2) * v.sigma * fromDbp(v.gi)),
      sigma: v => Math.pow(v.R, 4) * Math.pow(4 * PI, 3) * 1e-3 * fromDbp(v.smin) * fromDbp(v.ls) / (v.pt * Math.pow(fromDbp(v.g), 2) * Math.pow(b3Lam(v.f), 2) * fromDbp(v.gi)),
      smin: v => dbp(v.pt * Math.pow(fromDbp(v.g), 2) * Math.pow(b3Lam(v.f), 2) * v.sigma * fromDbp(v.gi) / (Math.pow(4 * PI, 3) * fromDbp(v.ls) * Math.pow(v.R, 4)) / 1e-3),
    }),
  ],
  outputs: [
    O('Wavelength', v => b3Lam(v.f), 'm', true),
    O('Range for 10 × RCS', v => v.R * Math.pow(10, 0.25), 'm', true),
    O('Range in nautical miles', v => v.R / 1852, 'nmi'),
    O('Peak power', v => dbp(v.pt / 1e-3), 'dBm'),
  ],
  note: 'R⁴ = P<sub>t</sub>G²λ²σ·G<sub>i</sub>/((4π)³·S<sub>min</sub>·L) · S<sub>min</sub> = kT₀B·F·SNR (T₀ = 290 K). Coherent integration of n pulses gives G<sub>i</sub> ≈ 10·log n.',
},
{
  id: 'doppler', cat: 'prop', title: 'Doppler Shift', kw: 'doppler shift velocity radial speed radar blind speed',
  desc: 'Doppler shift for a moving target (radar, two-way) or a moving transmitter/receiver (one-way). A positive radial speed means approaching.',
  cfg: [{ id: 'mode', label: 'Geometry', def: 'radar', options: [['radar', 'Radar echo (two-way): fd = 2·vr·f/c'], ['oneway', 'One-way link: fd = vr·f/c']] }],
  vars: [
    fq('f', 'Carrier frequency', 10e9, 'GHz', { sticky: true }),
    uV('v', 'Speed', 'b3speed', 'm/s', 100, { min: 1e-9, max: C0, inMin: 0 }),
    linV('ang', 'Angle between velocity and line of sight', 0, '°', { sticky: true, min: 0, max: 180 }),
    mk({ id: 'vr', label: 'Radial speed (+ approaching)', unit: 'b3speed', du: 'm/s', scale: 'lin', min: -C0, max: C0 }),
    mk({ id: 'fd', label: 'Doppler shift', unit: 'Hz', du: 'kHz', scale: 'lin', min: -1e15, max: 1e15 }),
    fq('prf', 'Pulse repetition frequency (radar)', 1e3, 'kHz'),
  ],
  eqs: [
    E('vr', ['v', 'ang'], v => v.v * Math.cos(v.ang * PI / 180), { v: v => v.vr / Math.cos(v.ang * PI / 180), ang: v => Math.acos(v.vr / v.v) * 180 / PI }),
    E('fd', ['vr', 'f'], v => (v.$.mode === 'oneway' ? 1 : 2) * v.vr * v.f / C0, {
      vr: v => v.fd * C0 / ((v.$.mode === 'oneway' ? 1 : 2) * v.f), f: v => v.fd * C0 / ((v.$.mode === 'oneway' ? 1 : 2) * v.vr),
    }),
  ],
  outputs: [
    O('Wavelength', v => b3Lam(v.f), 'm', true),
    O('Shift per m/s of radial speed', v => (v.$.mode === 'oneway' ? 1 : 2) * v.f / C0, 'Hz'),
    O('First blind speed λ·PRF/2', v => v.$.mode === 'oneway' ? NaN : b3Lam(v.f) * v.prf / 2, 'm/s'),
    O('Max unambiguous radial speed ±λ·PRF/4', v => v.$.mode === 'oneway' ? NaN : b3Lam(v.f) * v.prf / 4, 'm/s'),
  ],
  warn: v => {
    const s = Math.max(0, ...[v.v, v.vr].filter(isFinite).map(Math.abs));
    if (s >= C0) return '⚠ Speed ≥ c: not physical.';
    if (s > 1e6) return '⚠ Speed above 10⁶ m/s: the first-order formula is low by about |v_r|/c (two-way) or |v_r|/2c (one-way). Exact: f_d = 2βf/(1 − β) (radar echo, approaching), f·(√((1 + β)/(1 − β)) − 1) (one-way), β = v_r/c.';
    return null;
  },
  note: 'v<sub>r</sub> = v·cos θ. First-order (non-relativistic) formulas: the relative error is about β = v<sub>r</sub>/c for the radar echo and β/2 one-way, negligible below ≈ 10⁶ m/s.',
},
// ----------------------------------------------------------------- antennas --
{
  id: 'polmis', cat: 'ant', title: 'Polarization Mismatch', kw: 'polarization mismatch loss axial ratio circular linear plf',
  desc: 'Polarization loss factor between two antennas from their axial ratios (0 dB = circular, ∞ = linear) and the tilt angle between their polarization ellipses.',
  cfg: [
    { id: 'sense', label: 'Rotation sense', def: 'same', options: [['same', 'Same sense (e.g. RHCP ↔ RHCP)'], ['opp', 'Opposite sense (RHCP ↔ LHCP)']] },
    { id: 'pre', label: 'Preset', def: 'custom', options: [['custom', 'Custom'], ['ll', 'Linear ↔ linear'], ['cl', 'Circular ↔ linear'], ['cc', 'Circular ↔ circular']],
      set: val => val === 'll' ? { ar1: Infinity, ar2: Infinity } : val === 'cl' ? { ar1: 0, ar2: Infinity } : val === 'cc' ? { ar1: 0, ar2: 0 } : {} },
  ],
  vars: [
    dbV('ar1', 'Axial ratio, antenna 1', 0, 'dB', { min: 0, max: 300 }),
    dbV('ar2', 'Axial ratio, antenna 2', 40, 'dB', { min: 0, max: 300 }),
    linV('dt', 'Tilt angle between the ellipses Δτ', 0, '°', { min: 0, max: 90 }),
    linV('plf', 'Polarization loss factor', undefined, '%', { min: 0, max: 100 }),
    dbV('loss', 'Polarization loss', undefined, 'dB', { min: 0 }),
  ],
  eqs: [
    E('plf', ['ar1', 'ar2', 'dt'], v => 100 * b3Plf(v.ar1, v.ar2, v.dt, v.$.sense === 'opp')),
    E('loss', ['plf'], v => -dbp(v.plf / 100), { plf: v => 100 * fromDbp(-v.loss) }),
  ],
  outputs: [
    O('Loss range over all tilt angles', v => {
      const op = v.$.sense === 'opp', a = b3Plf(v.ar1, v.ar2, 0, op), b = b3Plf(v.ar1, v.ar2, 90, op);
      return fmt(-dbp(Math.max(a, b)), 4) + ' … ' + fmt(-dbp(Math.min(a, b)), 4) + ' dB';
    }),
    O('Linear-equivalent: cos²Δτ', v => 50 * (1 + Math.cos(2 * v.dt * PI / 180)), '%'),
  ],
  note: 'PLF = [(1 + ρ₁ρ₂)²·cos²Δτ + (ρ₁ + ρ₂)²·sin²Δτ] / [(1 + ρ₁²)(1 + ρ₂²)] = ½ + [4ρ₁ρ₂ + (1 − ρ₁²)(1 − ρ₂²)·cos 2Δτ] / [2(1 + ρ₁²)(1 + ρ₂²)] with ρ = 1/AR (negative for the opposite sense). Equal axial ratios of opposite sense at Δτ = 90° are orthogonal (PLF = 0, loss ∞). Linear ↔ linear gives cos²Δτ, circular ↔ linear 3.01 dB, opposite-sense circular ∞.',
},
{
  id: 'rfexposure', cat: 'ant', title: 'RF Exposure / Safe Distance', kw: 'rf exposure mpe safe distance icnirp fcc power density compliance',
  desc: 'Far-field power density from the EIRP, compared with the ICNIRP 2020 or FCC limits. Gives the compliance distance.',
  cfg: [
    { id: 'std', label: 'Limits', def: 'icnirp-gp', options: [['icnirp-gp', 'ICNIRP 2020, general public (30 min, whole body)'], ['icnirp-occ', 'ICNIRP 2020, occupational (30 min, whole body)'],
      ['fcc-gp', 'FCC 47 CFR 1.1310, general population / uncontrolled'], ['fcc-occ', 'FCC 47 CFR 1.1310, occupational / controlled']] },
    { id: 'refl', label: 'Ground reflection', def: 'none', options: [['none', 'None (free space)'], ['ground', 'Ground reflection ×2.56 (FCC OET-65)'], ['full', 'Full reflection ×4 (field doubling)']] },
  ],
  vars: [
    uV('eirp', 'EIRP', 'W', 'W', 100),
    fq('f', 'Frequency', 900e6, 'MHz', { sticky: true }),
    lenV('d', 'Distance from the antenna', 10, 'm'),
    uV('S', 'Power density at d', 'b3wm2', 'W/m²'),
    lenV('dsafe', 'Compliance distance', undefined, 'm'),
    posV('pct', 'Power density as % of the limit', undefined, '%'),
  ],
  eqs: [
    E('S', ['eirp', 'd'], v => b3Refl(v) * v.eirp / (4 * PI * v.d * v.d), { eirp: v => v.S * 4 * PI * v.d * v.d / b3Refl(v), d: v => sqrt(b3Refl(v) * v.eirp / (4 * PI * v.S)) }),
    E('dsafe', ['eirp', 'f'], v => sqrt(b3Refl(v) * v.eirp / (4 * PI * b3Slim(v))), { eirp: v => v.dsafe * v.dsafe * 4 * PI * b3Slim(v) / b3Refl(v) }),
    E('pct', ['S', 'f'], v => 100 * v.S / b3Slim(v), { S: v => v.pct * b3Slim(v) / 100 }),
  ],
  outputs: [
    O('Power-density limit at f', v => { const l = b3Limit(v.$.std, v.f); return l ? fmtSI(l.S, 'W/m²', 4) + ' = ' + fmt(l.S / 10, 4) + ' mW/cm²' + (l.eq ? ' (plane-wave equivalent of the field limit)' : '') : NaN; }),
    O('E-field at d / limit', v => { const l = b3Limit(v.$.std, v.f); const e = sqrt(v.S * ETA0); return l ? fmt(e, 4) + ' V/m / ' + (isFinite(l.E) ? fmt(l.E, 4) + ' V/m' : 'n/a') : NaN; }),
    O('Averaging time', v => { const l = b3Limit(v.$.std, v.f); return l ? (v.$.std.startsWith('fcc') ? '≤ ' : '') + l.avg + ' min' : NaN; }),
    O('At distance d', v => !isFinite(v.pct) ? NaN : v.pct <= 100 ? '✓ Below the limit' : '✗ Above the limit'),
    O('EIRP', v => dbp(v.eirp / 1e-3), 'dBm'),
  ],
  warn: v => !b3Limit(v.$.std, v.f) ? '⚠ Frequency outside the range of the selected limits (ICNIRP 100 kHz – 300 GHz, FCC 300 kHz – 100 GHz).' : null,
  note: 'S = F·EIRP/(4πd²) in the far field (F = reflection factor). Limits: ICNIRP 2020 Table 5 and 47 CFR 1.1310(e)(1) Table 1, checked against the official texts. Near the antenna (reactive or radiative near field) this estimate is not valid; use measurements or near-field methods. Below 30 MHz ICNIRP sets field limits only; the plane-wave equivalent is used here.',
},
// -------------------------------------------------------------------- noise --
{
  id: 'gt', cat: 'noise', title: 'G/T (Figure of Merit)', kw: 'g/t g over t system noise temperature satellite earth station antenna temperature',
  desc: 'Receive-system figure of merit. System temperature is referred to the antenna terminals: antenna, feed loss, LNA and the following receiver.',
  vars: [
    dbV('g', 'Antenna gain', 40, 'dBi'),
    posV('ta', 'Antenna noise temperature T<sub>a</sub>', 50, 'K', { min: 0, max: 1e7 }),
    dbV('lf', 'Feed / line loss before the LNA', 0.5, 'dB', { min: 0 }),
    posV('tp', 'Physical temperature of the feed', 290, 'K', { sticky: true }),
    dbV('nf', 'LNA noise figure', 1, 'dB', { min: 0 }),
    posV('te', 'LNA noise temperature', undefined, 'K', { min: 0, max: 1e9 }),
    dbV('glna', 'LNA gain', 30),
    dbV('nfr', 'Noise figure after the LNA', 10, 'dB', { min: 0 }),
    posV('tsys', 'System noise temperature', undefined, 'K'),
    dbV('gt', 'G/T', undefined, 'dB/K'),
  ],
  eqs: [
    E('te', ['nf'], v => 290 * (fromDbp(v.nf) - 1), { nf: v => dbp(1 + v.te / 290) }),
    E('tsys', ['ta', 'lf', 'tp', 'te', 'glna', 'nfr'], b3Tsys, {
      ta: v => { const L = fromDbp(v.lf); return v.tsys - (L - 1) * v.tp - L * (v.te + 290 * (fromDbp(v.nfr) - 1) / fromDbp(v.glna)); },
      te: v => { const L = fromDbp(v.lf); return (v.tsys - v.ta - (L - 1) * v.tp) / L - 290 * (fromDbp(v.nfr) - 1) / fromDbp(v.glna); },
    }),
    E('gt', ['g', 'tsys'], v => v.g - dbp(v.tsys), { g: v => v.gt + dbp(v.tsys), tsys: v => fromDbp(v.g - v.gt) }),
  ],
  outputs: [
    O('Contributions: antenna / feed / LNA / rest', v => {
      const L = fromDbp(v.lf), parts = [v.ta, (L - 1) * v.tp, L * v.te, L * 290 * (fromDbp(v.nfr) - 1) / fromDbp(v.glna)];
      return parts.map(p => fmt(p, 3) + ' K (' + fmt(100 * p / v.tsys, 3) + ' %)').join(' · ');
    }),
    O('Noise density kT<sub>sys</sub>', v => dbp(KB * v.tsys * 1000), 'dBm/Hz'),
    O('Receive-chain noise figure (feed + LNA + rest, excl. antenna)', v => dbp(1 + (v.tsys - v.ta) / 290), 'dB'),
    O('Operating noise factor T<sub>sys</sub>/T₀', v => dbp(v.tsys / 290), 'dB'),
  ],
  note: 'T<sub>sys</sub> = T<sub>a</sub> + (L − 1)·T<sub>p</sub> + L·(T<sub>LNA</sub> + T<sub>rx</sub>/G<sub>LNA</sub>), with T = 290(F − 1). G/T = G − 10·log T<sub>sys</sub>, both referred to the antenna terminals. The receive-chain NF is 1 + (T<sub>sys</sub> − T<sub>a</sub>)/290 (T₀ = 290 K source); compute the noise power as kT<sub>sys</sub>B, not as kT₀B·F, when T<sub>a</sub> ≠ 290 K.',
},
// --------------------------------------------------------------- components --
{
  id: 'minloss', cat: 'comp', title: 'Minimum-Loss Matching Pad', kw: 'minimum loss pad 75 50 impedance matching resistive l pad',
  desc: 'Resistive L-pad between two different real impedances, matched in both directions with the lowest possible loss.',
  vars: [
    ohmV('zh', 'Higher impedance Z<sub>high</sub>', 75),
    ohmV('zl', 'Lower impedance Z<sub>low</sub>', 50),
    ohmV('r1', 'R1: series resistor (Z<sub>high</sub> side)'),
    ohmV('r2', 'R2: shunt resistor (Z<sub>low</sub> side)'),
    posV('loss', 'Minimum loss', undefined, 'dB', { min: 1e-12, max: 1e4 }),
  ],
  eqs: [
    E('r1', ['zh', 'zl'], v => v.zh * sqrt(1 - v.zl / v.zh), { zh: v => (v.zl + sqrt(v.zl * v.zl + 4 * v.r1 * v.r1)) / 2, zl: v => v.zh - v.r1 * v.r1 / v.zh }),
    // R2²·(Zh − Zl) = Zl²·Zh: Zh = Zl·R2²/(R2² − Zl²) (needs R2 > Zl), and Zl is the positive
    // root of Zl² + (R2²/Zh)·Zl − R2² = 0, written without cancellation
    E('r2', ['zh', 'zl'], v => v.zl / sqrt(1 - v.zl / v.zh), {
      zh: v => v.r2 > v.zl ? v.zl * v.r2 * v.r2 / (v.r2 * v.r2 - v.zl * v.zl) : NaN,
      zl: v => { const a = v.r2 * v.r2 / v.zh; return 2 * v.r2 * v.r2 / (a + sqrt(a * a + 4 * v.r2 * v.r2)); },
    }),
    E('loss', ['zh', 'zl'], v => dbv(sqrt(v.zh / v.zl) + sqrt(v.zh / v.zl - 1)), {
      zh: v => { const s = fromDbv(v.loss); return v.zl * Math.pow((s + 1 / s) / 2, 2); },
      zl: v => { const s = fromDbv(v.loss); return v.zh / Math.pow((s + 1 / s) / 2, 2); },
    }),
  ],
  guess: v => {
    if (!(isFinite(v.r1) && isFinite(v.r2))) return null;
    const q = v.r1 / v.r2 + 1, zl = sqrt(v.r1 * v.r2 / q);
    return { zh: q * zl, zl: zl };
  },
  outputs: [
    O('R1: nearest E24 / E96', v => eTxt(v.r1)),
    O('R2: nearest E24 / E96', v => eTxt(v.r2)),
    O('Impedance ratio', v => v.zh / v.zl, '×'),
  ],
  warn: v => (v.zl >= v.zh) ? '⚠ Z_high must be larger than Z_low.' : null,
  note: 'R1 = Z<sub>h</sub>·√(1 − Z<sub>l</sub>/Z<sub>h</sub>) · R2 = Z<sub>l</sub>/√(1 − Z<sub>l</sub>/Z<sub>h</sub>) · loss = 20·log(√(Z<sub>h</sub>/Z<sub>l</sub>) + √(Z<sub>h</sub>/Z<sub>l</sub> − 1)). Example: 75 → 50 Ω gives 43.3 Ω, 86.6 Ω and 5.72 dB.',
},
{
  id: 'wilkinson', cat: 'comp', title: 'Wilkinson Divider Design', kw: 'wilkinson divider combiner splitter unequal split quarter wave isolation resistor',
  desc: 'Equal or unequal two-way Wilkinson divider (Pozar §7.3). The split ratio is P3/P2 in dB; 0 dB is an equal split.',
  vars: [
    ohmV('z0', 'System impedance Z₀', 50, { sticky: true }),
    dbV('ratio', 'Split ratio P3/P2', 0, 'dB'),
    posV('K', 'K = √(P3/P2)', undefined, '', { min: 1e-6, max: 1e6 }),
    ohmV('z02', 'λ/4 line to port 2, Z₀₂'),
    ohmV('z03', 'λ/4 line to port 3, Z₀₃'),
    ohmV('r', 'Isolation resistor R'),
    fq('f', 'Centre frequency', 1e9, 'GHz', { sticky: true }),
    posV('ee', 'Effective permittivity ε<sub>eff</sub>', 1, '', { sticky: true, min: 1, max: 1e4 }),
    lenV('len', 'λ/4 line length', undefined, 'mm'),
  ],
  eqs: [
    E('K', ['ratio'], v => fromDbv(v.ratio), { ratio: v => dbv(v.K) }),
    E('z03', ['z0', 'K'], v => v.z0 * sqrt((1 + v.K * v.K) / Math.pow(v.K, 3)), { z0: v => v.z03 / sqrt((1 + v.K * v.K) / Math.pow(v.K, 3)) }),
    E('z02', ['z0', 'K'], v => v.z0 * sqrt(v.K * (1 + v.K * v.K)), { z0: v => v.z02 / sqrt(v.K * (1 + v.K * v.K)) }),
    E('r', ['z0', 'K'], v => v.z0 * (v.K + 1 / v.K), { z0: v => v.r / (v.K + 1 / v.K) }),
    E('len', ['f', 'ee'], v => C0 / (4 * v.f * sqrt(v.ee)), { f: v => C0 / (4 * v.len * sqrt(v.ee)), ee: v => Math.pow(C0 / (4 * v.f * v.len), 2) }),
  ],
  outputs: [
    O('Power to port 2 / port 3', v => fmt(100 / (1 + v.K * v.K), 4) + ' % / ' + fmt(100 * v.K * v.K / (1 + v.K * v.K), 4) + ' %'),
    O('|S21| / |S31| (ideal)', v => fmt(dbp(1 / (1 + v.K * v.K)), 4) + ' dB / ' + fmt(dbp(v.K * v.K / (1 + v.K * v.K)), 4) + ' dB'),
    O('Output ports see R2 = Z₀K / R3 = Z₀/K', v => fmtSI(v.z0 * v.K, 'Ω', 4) + ' / ' + fmtSI(v.z0 / v.K, 'Ω', 4)),
    O('λ/4 output transformers to Z₀', v => Math.abs(v.K - 1) < 1e-9 ? 'Not needed (equal split)' : fmtSI(v.z0 * sqrt(v.K), 'Ω', 4) + ' / ' + fmtSI(v.z0 / sqrt(v.K), 'Ω', 4)),
    O('Isolation resistor: nearest E24 / E96', v => eTxt(v.r)),
  ],
  note: 'K² = P3/P2 · Z₀₃ = Z₀√((1 + K²)/K³) · Z₀₂ = K²·Z₀₃ = Z₀√(K(1 + K²)) · R = Z₀(K + 1/K). Equal split: 70.7 Ω lines and a 100 Ω resistor in a 50 Ω system. Use the microstrip calculator for the line widths.',
}
);

// copper wall loss of TE10 (Pozar 3.96), dB/m; annealed copper (IACS 100 %)
const B3_RHO_CU = 1.724e-8;
function b3WgLoss(v) {
  if (!(v.f > v.fc)) return NaN;
  const k = 2 * PI * v.f * sqrt(v.er) / C0, beta = sqrt(k * k - Math.pow(PI / v.a, 2));
  const eta = ETA0 / sqrt(v.er), Rs = sqrt(PI * v.f * MU0 * B3_RHO_CU);
  return DB_NEPER * Rs / (Math.pow(v.a, 3) * v.b * beta * k * eta) * (2 * v.b * PI * PI + Math.pow(v.a, 3) * k * k);
}

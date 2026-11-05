// ============================================================================
// rf.js - RF formulas used by several calculators (pure functions, no DOM).
// ============================================================================

const dbp = x => 10 * log10(x);                 // power ratio -> dB
const dbv = x => 20 * log10(x);                 // voltage ratio -> dB
const fromDbp = d => Math.pow(10, d / 10);
const fromDbv = d => Math.pow(10, d / 20);
// VSWR of a reflection magnitude. |Γ| ≥ 1 (a short, an open, a pure reactance or an
// active port) has no standing-wave ratio: it is shown as ∞.
// |S| within double round-off of 1 (a lossless 1∠θ, a renormalised lossless chain) is 1.
// 1e-15 is a few ulps: genuine magnitudes such as 1 − 4e-13 (VSWR ≈ 5e12) are kept.
const magSnap = m => Math.abs(m - 1) < 1e-15 ? 1 : m;
const dbMag = m => dbv(magSnap(m));   // dB of a magnitude, for display
const vswrOf = g => g >= 1 ? Infinity : (1 + g) / (1 - g);
// inverse of vswrOf: VSWR = ∞ is |Γ| = 1
const gammaOfVswr = s => s === Infinity ? 1 : (s - 1) / (s + 1);
const fsplDb = (f, d) => 20 * log10(4 * PI * d * f / C0);
// Annealed copper (IACS 100 %), used for the conductor-loss estimates
const RHO_CU_ANNEALED = 1.724e-8;

// ------------------------------------------------------------ microstrip ---
// Hammerstad & Jensen (1980), with strip thickness correction.
function msZ01(u) {
  const fu = 6 + (2 * PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
  return ETA0 / (2 * PI) * Math.log(fu / u + sqrt(1 + 4 / (u * u)));
}
function msEeff0(u, er) {
  const a = 1 + Math.log((Math.pow(u, 4) + Math.pow(u / 52, 2)) / (Math.pow(u, 4) + 0.432)) / 49 +
            Math.log(1 + Math.pow(u / 18.1, 3)) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  return (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 10 / u, -a * b);
}
function microstrip(W, H, T, er) {
  const u = W / H;
  const t = (T > 0 ? T : 0) / H;
  let u1 = u, ur = u;
  if (t > 0) {
    const coth = x => 1 / Math.tanh(x);
    const du1 = t / PI * Math.log(1 + 4 * Math.E / (t * Math.pow(coth(sqrt(6.517 * u)), 2)));
    const dur = 0.5 * (1 + 1 / Math.cosh(sqrt(Math.max(0, er - 1)))) * du1;
    u1 = u + du1;
    ur = u + dur;
  }
  const z1 = msZ01(u1), zr = msZ01(ur);
  const eer = msEeff0(ur, er);
  return { z0: zr / sqrt(eer), ee: eer * Math.pow(z1 / zr, 2) };
}
// Getsinger dispersion model for effective permittivity at frequency f
function msEeffF(ee0, er, z0, H, f) {
  const fp = z0 / (2 * MU0 * H);
  const G = 0.6 + 0.009 * z0;
  return er - (er - ee0) / (1 + G * Math.pow(f / fp, 2));
}

// ------------------------------------------------------- S-parameters 2p ---
// S = [[S11, S12], [S21, S22]] (complex), real reference impedance z0.
function s2Analyze(S, z0, zs, zl) {
  const S11 = S[0][0], S12 = S[0][1], S21 = S[1][0], S22 = S[1][1];
  const a11 = cabs(S11), a12 = cabs(S12), a21 = cabs(S21), a22 = cabs(S22);
  const delta = csub(cmul(S11, S22), cmul(S12, S21));
  const ad = cabs(delta);
  const p = a12 * a21;
  // N = 1 − |S11|² − |S22|² + |Δ|² = 2K·|S12S21|, in the algebraically identical form
  // (1 − |S11|²)(1 − |S22|²) + |S12S21|² − 2·Re(S11·S22·(S12·S21)*), which avoids the
  // O(1) cancellation when |S11|, |S22| ≈ 1 and S21 is tiny (e.g. a 1 µΩ shunt).
  const d11 = (1 - a11) * (1 + a11), d22 = (1 - a22) * (1 + a22);
  const xr = cmul(cmul(S11, S22), cconj(cmul(S12, S21))).re;
  const N = d11 * d22 + p * p - 2 * xr;
  // round-off bound of N, including the rounding of |S11| and |S22| themselves
  const tolN = 8 * Number.EPSILON * (Math.abs(d22) * Math.pow(1 + a11, 2) + Math.abs(d11) * Math.pow(1 + a22, 2) + Math.abs(d11 * d22) + p * p + 2 * Math.abs(xr));
  const K = N / (2 * p);
  const mu = d11 / (cabs(csub(S22, cmul(delta, cconj(S11)))) + p);
  const mu2 = d22 / (cabs(csub(S11, cmul(delta, cconj(S22)))) + p);
  const gs = zToGamma(zs, z0), gl = zToGamma(zl, z0);
  const S1221 = cmul(S12, S21);
  const gin = cadd(S11, cdiv(cmul(S1221, gl), csub(CONE, cmul(S22, gl))));
  const gout = cadd(S22, cdiv(cmul(S1221, gs), csub(CONE, cmul(S11, gs))));
  const den = csub(cmul(csub(CONE, cmul(S11, gs)), csub(CONE, cmul(S22, gl))), cmul(S1221, cmul(gs, gl)));
  const GT = (1 - cabs2(gs)) * a21 * a21 * (1 - cabs2(gl)) / cabs2(den);
  const GP = a21 * a21 * (1 - cabs2(gl)) / ((1 - cabs2(gin)) * cabs2(csub(CONE, cmul(S22, gl))));
  const GA = a21 * a21 * (1 - cabs2(gs)) / (cabs2(csub(CONE, cmul(S11, gs))) * (1 - cabs2(gout)));
  const MSG = a21 / a12;
  const uncond = K > 1 && ad < 1;
  // MAG = MSG·(K − √(K²−1)) = 2|S21|² / (N + √(N² − 4|S12S21|²)), N = 1 − |S11|² − |S22|² + |Δ|² = 2K|S12S21|.
  // The second form has no ∞−∞ for a unilateral device (S12 = 0: G_TU,max). MAG only exists
  // for an unconditionally stable device, K ≥ 1 and |Δ| < 1 (Pozar 12.3); the lossless boundary
  // (K = 1, |Δ| = 1, e.g. a through line) is included within the round-off bound tolN (MAG = MSG).
  const MAG0 = (ad < 1 + 1e-9 && N > 0 && N >= 2 * p - tolN) ? 2 * a21 * a21 / (N + sqrt(Math.max(0, N * N - 4 * p * p))) : NaN;
  // MAG ≤ MSG, and MAG = MSG on the K = 1 boundary: round-off of either sign there would
  // otherwise be magnified by √(K² − 1) into a spurious −1e-7 dB
  const onK1 = p > 0 && Math.abs(N - 2 * p) <= tolN;
  const MAG = (MAG0 > MSG || (onK1 && isFinite(MAG0))) ? MSG : MAG0;
  const U = a12 * a21 * a11 * a22 / ((1 - a11 * a11) * (1 - a22 * a22));
  let match = null;
  // no simultaneous conjugate match on the K = 1 boundary (MAG = MSG there; the roots sit on
  // the unit circle and only round-off decides which side)
  if (K > 1 && !onK1) {
    const B1 = 1 + a11 * a11 - a22 * a22 - ad * ad;
    const C1 = csub(S11, cmul(delta, cconj(S22)));
    const B2 = 1 + a22 * a22 - a11 * a11 - ad * ad;
    const C2 = csub(S22, cmul(delta, cconj(S11)));
    const root = (B, C) => {
      const r = sqrt(Math.max(0, B * B - 4 * cabs2(C)));
      // rationalised form of (B − sgn(B)·√(B² − 4|C|²)) / 2C: finite (0) when C = 0, no cancellation
      const g = cscale(cconj(C), 2 / (B + Math.sign(B) * r));
      // at K → 1⁺ round-off can put |Γ| a hair above 1 (negative resistance): keep it inside the unit circle
      const mg = cabs(g);
      return mg >= 1 - 1e-12 ? cscale(g, (1 - 1e-12) / mg) : g;   // just inside: Z stays finite, Re Z > 0
    };
    const GSm = root(B1, C1), GLm = root(B2, C2);
    match = { gs: GSm, gl: GLm, zs: gammaToZ(GSm, z0), zl: gammaToZ(GLm, z0) };
  }
  const SH_S = mMul(mH(S), S);
  return {
    delta: delta, K: K, mu: mu, mu2: mu2, uncond: uncond,
    gs: gs, gl: gl, gin: gin, gout: gout, zin: gammaToZ(gin, z0), zout: gammaToZ(gout, z0),
    GT: GT, GP: GP, GA: GA, MSG: MSG, MAG: MAG, U: U, match: match,
    recip: cabs(csub(S12, S21)),
    lossless: mMaxAbs(mSub(SH_S, mEye(2))),
    diss1: 1 - a11 * a11 - a21 * a21,
    diss2: 1 - a12 * a12 - a22 * a22,
  };
}

function sToABCD(S, z0) {
  const S11 = S[0][0], S12 = S[0][1], S21 = S[1][0], S22 = S[1][1];
  const d = cscale(S21, 2);
  const S1221 = cmul(S12, S21);
  const A = cdiv(cadd(cmul(cadd(CONE, S11), csub(CONE, S22)), S1221), d);
  const B = cscale(cdiv(csub(cmul(cadd(CONE, S11), cadd(CONE, S22)), S1221), d), z0);
  const C = cscale(cdiv(csub(cmul(csub(CONE, S11), csub(CONE, S22)), S1221), d), 1 / z0);
  const D = cdiv(cadd(cmul(csub(CONE, S11), cadd(CONE, S22)), S1221), d);
  return [[A, B], [C, D]];
}
// det (optional) = AD − BC known exactly, e.g. the product of the block determinants of a
// cascade (1 for every reciprocal block); computing AD − BC from a deep cascade's huge
// entries cancels catastrophically and corrupts S12.
function abcdToS(M, z0, det) {
  const A = M[0][0], B = cscale(M[0][1], 1 / z0), C = cscale(M[1][0], z0), D = M[1][1];
  const den = cadd(cadd(A, B), cadd(C, D));
  const AD_BC = det || csub(cmul(A, D), cmul(B, C));
  return [
    [cdiv(csub(cadd(A, B), cadd(C, D)), den), cdiv(cscale(AD_BC, 2), den)],
    [cdiv(cx(2), den), cdiv(cadd(csub(B, A), csub(D, C)), den)],
  ];
}
// Transfer (T) parameters, convention [b1; a1] = T [a2; b2], so T_total = T_A · T_B
function sToT(S) {
  const S11 = S[0][0], S12 = S[0][1], S21 = S[1][0], S22 = S[1][1];
  const delta = csub(cmul(S11, S22), cmul(S12, S21));
  return [[cneg(cdiv(delta, S21)), cdiv(S11, S21)], [cneg(cdiv(S22, S21)), cdiv(CONE, S21)]];
}
// n-port conversions with equal real reference impedance at every port
function sToZ(S, z0) {
  const I = mEye(S.length);
  const inv = mInv(mSub(I, S), 1 + mMaxAbs(S));   // operand scale: I − S cancels
  return inv ? mScale(mMul(mAdd(I, S), inv), z0) : null;
}
function sToY(S, z0) {
  const I = mEye(S.length);
  const inv = mInv(mAdd(I, S), 1 + mMaxAbs(S));
  return inv ? mScale(mMul(mSub(I, S), inv), 1 / z0) : null;
}
function zToS(Z, z0) {
  const I = mEye(Z.length);
  const inv = mInv(mAdd(Z, mScale(I, z0)), mMaxAbs(Z) + z0);
  return inv ? mMul(mSub(Z, mScale(I, z0)), inv) : null;
}
// Terminate port k with reflection gk; returns the remaining (n-1)-port S-matrix.
function reduceS(S, k, gk) {
  const n = S.length;
  const keep = [];
  for (let i = 0; i < n; i++) if (i !== k) keep.push(i);
  const den = csub(CONE, cmul(S[k][k], gk));
  return keep.map(i => keep.map(j => cadd(S[i][j], cdiv(cmul(cmul(S[i][k], S[k][j]), gk), den))));
}

// ------------------------------------------------------------- cascade -----
// stages: [{g (dB), nf (dB), oip3 (dBm, NaN = ideal), op1 (dBm, NaN = ideal)}]
function cascade(stages) {
  const out = [];
  let G = 1, F = 1, o3 = Infinity, o1 = Infinity;
  const comb = (oPrev, gi, oi) => {
    const a = isFinite(oPrev) ? 1 / (oPrev * gi) : 0;
    const b = isFinite(oi) ? 1 / oi : 0;
    return (a + b) > 0 ? 1 / (a + b) : Infinity;
  };
  const terms = [];
  stages.forEach((s, i) => {
    const gi = fromDbp(s.g), fi = fromDbp(s.nf);
    terms.push(i === 0 ? fi - 1 : (fi - 1) / G);
    F = i === 0 ? fi : F + (fi - 1) / G;
    o3 = comb(i === 0 ? Infinity : o3, gi, isFinite(s.oip3) ? fromDbp(s.oip3) : Infinity);
    o1 = comb(i === 0 ? Infinity : o1, gi, isFinite(s.op1) ? fromDbp(s.op1) : Infinity);
    G *= gi;
    out.push({ g: dbp(G), nf: dbp(F), oip3: dbp(o3), iip3: dbp(o3) - dbp(G), op1: dbp(o1), ip1: dbp(o1) - dbp(G) + 1 });
  });
  const exc = F - 1;
  out.forEach((r, i) => { r.contrib = exc > 0 ? terms[i] / exc * 100 : 0; });
  return out;
}

// ----------------------------------------------------------- L-network -----
// Match a load ZL = RL + jXL to a real source resistance Rs (Pozar 5.1).
// Returns every valid solution with element values at frequency f.
function lMatch(Rs, RL, XL, f) {
  const w = 2 * PI * f;
  const sols = [];
  const zl = cx(RL, XL);
  const series = X => Math.abs(X) < 1e-12 ? { kind: 'none', text: '— (none)' }
    : X > 0 ? { kind: 'L', val: X / w, text: 'L = ' + fmtSI(X / w, 'H') }
            : { kind: 'C', val: -1 / (w * X), text: 'C = ' + fmtSI(-1 / (w * X), 'F') };
  const shunt = B => Math.abs(B) < 1e-15 ? { kind: 'none', text: '— (none)' }
    : B > 0 ? { kind: 'C', val: B / w, text: 'C = ' + fmtSI(B / w, 'F') }
            : { kind: 'L', val: -1 / (w * B), text: 'L = ' + fmtSI(-1 / (w * B), 'H') };
  const typeOf = (se, sh) => {
    if (se.kind === 'L' && sh.kind === 'C') return 'Low-pass';
    if (se.kind === 'C' && sh.kind === 'L') return 'High-pass';
    if (se.kind === 'none' && sh.kind === 'none') return 'Already matched (no elements)';
    if (se.kind === 'none' || sh.kind === 'none') return 'Single element';
    return 'Band-pass type';
  };
  // RL = Rs gives the same series-only (or empty) network from both topologies: list it once,
  // under a name that does not mention a shunt element it does not have.
  const add = sol => {
    if (sols.some(t => Math.abs(t.X - sol.X) <= 1e-9 * Math.max(1, Rs, Math.abs(sol.X)) &&
                       Math.abs(t.B - sol.B) <= 1e-9 * Math.max(1 / Math.max(Rs, 1e-300), Math.abs(sol.B)))) return;
    if (sol.se.kind === 'none' && sol.sh.kind === 'none') { sol.topo = 'Direct connection'; sol.order = 'Source → load'; }
    else if (sol.sh.kind === 'none') { sol.topo = 'Series element only'; sol.order = 'Source → series → load'; }
    else if (sol.se.kind === 'none') { sol.topo = 'Shunt element only'; sol.order = 'Source → [shunt ∥ load]'; }
    sols.push(sol);
  };
  // (a) shunt B across the load, then series X toward the source
  const m2 = RL * RL + XL * XL;
  if (RL > 0 && m2 - Rs * RL >= -1e-12) {
    const r = sqrt(RL / Rs) * sqrt(Math.max(0, m2 - Rs * RL));
    for (const sgn of [1, -1]) {
      const B = (XL + sgn * r) / m2;
      const X = Math.abs(B) < 1e-15 ? -XL : 1 / B + XL * Rs / RL - Rs / (B * RL);
      const zp = cinv(cadd(cinv(zl), cx(0, B)));
      const zin = cadd(zp, cx(0, X));
      if (cabs(csub(zin, cx(Rs))) < 1e-6 * Math.max(1, Rs)) {
        const se = series(X), sh = shunt(B);
        add({ topo: 'Shunt element at the load', order: 'Source → series → [shunt ∥ load]', X: X, B: B, se: se, sh: sh, type: typeOf(se, sh) });
      }
      if (r === 0) break;
    }
  }
  // (b) series X at the load, then shunt B across the source side
  if (RL > 0 && RL <= Rs) {
    const r = sqrt(RL * (Rs - RL));
    for (const sgn of [1, -1]) {
      const X = sgn * r - XL;
      const B = sgn * sqrt((Rs - RL) / RL) / Rs;
      const zs = cadd(zl, cx(0, X));
      const zin = cinv(cadd(cinv(zs), cx(0, B)));
      if (cabs(csub(zin, cx(Rs))) < 1e-6 * Math.max(1, Rs)) {
        const se = series(X), sh = shunt(B);
        add({ topo: 'Shunt element at the source', order: 'Source → [shunt] → series → load', X: X, B: B, se: se, sh: sh, type: typeOf(se, sh) });
      }
      if (r === 0) break;
    }
  }
  return sols;
}

// --------------------------------------------------------- attenuators -----
// Returns [R1, R2] for topology 'pi' (R1 shunt, R2 series), 'tee' (R1 series, R2 shunt),
// 'btee' (R1 bridge, R2 shunt; the two fixed arms equal Z0).
function attenR(topo, z0, adb) {
  const K = fromDbv(adb);
  if (topo === 'pi') return [z0 * (K + 1) / (K - 1), z0 * (K * K - 1) / (2 * K)];
  if (topo === 'tee') return [z0 * (K - 1) / (K + 1), z0 * 2 * K / (K * K - 1)];
  return [z0 * (K - 1), z0 / (K - 1)];
}

// Real S-matrix of a resistive pad from nodal analysis, reference z0 at both ports.
// R: pi [shunt in, series, shunt out] · tee [series in, shunt, series out] ·
//    btee [arm in, arm out, bridge, shunt]
function resistive2port(topo, R, z0) {
  const g = r => 1 / r;
  let Y;
  if (topo === 'pi') {
    const gs = g(R[1]);
    Y = [[g(R[0]) + gs, -gs], [-gs, g(R[2]) + gs]];
  } else {
    // internal node 3 is eliminated (Kron reduction)
    let G;
    if (topo === 'tee') {
      const a = g(R[0]), b = g(R[2]), c = g(R[1]);
      G = [[a, 0, -a], [0, b, -b], [-a, -b, a + b + c]];
    } else {
      const a = g(R[0]), b = g(R[1]), br = g(R[2]), sh = g(R[3]);
      G = [[a + br, -br, -a], [-br, b + br, -b], [-a, -b, a + b + sh]];
    }
    const k = (i, j) => G[i][j] - G[i][2] * G[2][j] / G[2][2];
    Y = [[k(0, 0), k(0, 1)], [k(1, 0), k(1, 1)]];
  }
  // S = (I − z0·Y)(I + z0·Y)⁻¹
  const A = [[1 + z0 * Y[0][0], z0 * Y[0][1]], [z0 * Y[1][0], 1 + z0 * Y[1][1]]];
  const B = [[1 - z0 * Y[0][0], -z0 * Y[0][1]], [-z0 * Y[1][0], 1 - z0 * Y[1][1]]];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const Ai = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
  const m = (i, j) => B[i][0] * Ai[0][j] + B[i][1] * Ai[1][j];
  return [[m(0, 0), m(0, 1)], [m(1, 0), m(1, 1)]];
}

// Attenuation spread of a pad built from (optionally E-series-snapped) resistors
// with ±tolPct tolerance: worst case over all corners, plus an RSS estimate.
function attenTolerance(topo, z0, r1, r2, tolPct, build) {
  const parts = topo === 'pi' ? [['R1 (shunt, ×2)', r1], ['R2 (series)', r2], ['R1 (shunt, ×2)', r1]]
    : topo === 'tee' ? [['R1 (series, ×2)', r1], ['R2 (shunt)', r2], ['R1 (series, ×2)', r1]]
    : [['Arms (×2)', z0], ['Arms (×2)', z0], ['R1 (bridge)', r1], ['R2 (shunt)', r2]];
  const snap = x => build === 'exact' || !E_SERIES[build] ? x : nearestE(x, build).best;
  const vals = parts.map(p => snap(p[1]));
  const evalR = R => {
    const S = resistive2port(topo, R, z0);
    return { a: -dbv(Math.abs(S[1][0])), rl: -dbv(Math.max(Math.abs(S[0][0]), Math.abs(S[1][1]))) };
  };
  const nom = evalR(vals);
  const t = tolPct / 100;
  const n = vals.length;
  let min = Infinity, max = -Infinity, rlWorst = nom.rl;
  for (let mask = 0; mask < (1 << n); mask++) {
    const r = evalR(vals.map((x, i) => x * (1 + ((mask >> i) & 1 ? t : -t))));
    min = Math.min(min, r.a);
    max = Math.max(max, r.a);
    rlWorst = Math.min(rlWorst, r.rl);
  }
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const up = vals.slice(), dn = vals.slice();
    up[i] *= 1 + t; dn[i] *= 1 - t;
    const d = Math.max(Math.abs(evalR(up).a - nom.a), Math.abs(evalR(dn).a - nom.a));
    rss += d * d;
  }
  const built = [];
  parts.forEach((p, i) => {
    if (!built.some(b => b.label === p[0])) built.push({ label: p[0], val: vals[i], dev: (vals[i] - p[1]) / p[1] * 100 });
  });
  return { built: built, att0: nom.a, rl0: nom.rl, min: min, max: max, rss: sqrt(rss), rlWorst: rlWorst };
}

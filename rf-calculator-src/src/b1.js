// ============================================================================
// b1.js - phase 2, batch 1 (pure, no DOM): BER in AWGN and the
// EW & Interference calculators. Every top-level name starts with b1.
// ============================================================================

// ------------------------------------------------------------------ erfc ----
// W. J. Cody, Math. Comp. 23 (1969), SPECFUN CALERF. Relative error < 4e-16;
// underflows to 0 for x >= 26.543 (erfc ≈ 1e-300).
const b1EA = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03, 1.85777706184603153e-1];
const b1EB = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03];
const b1EC = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02, 8.81952221241769090e02,
  1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03, 2.15311535474403846e-8];
const b1ED = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03, 3.29079923573345963e03,
  4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03];
const b1EP = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
const b1EQ = [2.56852019228982242e00, 1.87295284992346725e00, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3];

function b1Erfc(x) {
  const y = Math.abs(x);
  let r;
  if (y <= 0.46875) {
    const z = y > 1.11e-16 ? y * y : 0;
    let n = b1EA[4] * z, d = z;
    for (let i = 0; i < 3; i++) { n = (n + b1EA[i]) * z; d = (d + b1EB[i]) * z; }
    return 1 - x * (n + b1EA[3]) / (d + b1EB[3]);
  }
  if (y <= 4) {
    let n = b1EC[8] * y, d = y;
    for (let i = 0; i < 7; i++) { n = (n + b1EC[i]) * y; d = (d + b1ED[i]) * y; }
    r = (n + b1EC[7]) / (d + b1ED[7]);
  } else {
    if (y >= 26.543) return x < 0 ? 2 : 0;
    const z = 1 / (y * y);
    let n = b1EP[5] * z, d = z;
    for (let i = 0; i < 4; i++) { n = (n + b1EP[i]) * z; d = (d + b1EQ[i]) * z; }
    r = z * (n + b1EP[4]) / (d + b1EQ[4]);
    r = (0.56418958354775628695 - r) / y;
  }
  const ys = Math.trunc(y * 16) / 16, del = (y - ys) * (y + ys);
  r = Math.exp(-ys * ys) * Math.exp(-del) * r;
  return x < 0 ? 2 - r : r;
}
const b1Q = x => 0.5 * b1Erfc(x / Math.SQRT2);

// ------------------------------------------------- BER / SER in AWGN --------
// Coherent detection, Gray coding. Square QAM and PSK are exact; cross QAM
// (32/128/512/2048): exact BER for the quasi-Gray labelling below, SER from
// Smith's rectangular-cell formula.
const b1MODS = [
  { id: 'bpsk', name: 'BPSK', M: 2, kind: 'bpsk' },
  { id: 'qpsk', name: 'QPSK', M: 4, kind: 'qpsk' },
  { id: '8psk', name: '8-PSK', M: 8, kind: 'psk' },
  { id: '16psk', name: '16-PSK', M: 16, kind: 'psk' },
  { id: '16qam', name: '16-QAM', M: 16, kind: 'sqam' },
  { id: '32qam', name: '32-QAM', M: 32, kind: 'xqam' },
  { id: '64qam', name: '64-QAM', M: 64, kind: 'sqam' },
  { id: '128qam', name: '128-QAM', M: 128, kind: 'xqam' },
  { id: '256qam', name: '256-QAM', M: 256, kind: 'sqam' },
  { id: '512qam', name: '512-QAM', M: 512, kind: 'xqam' },
  { id: '1024qam', name: '1024-QAM', M: 1024, kind: 'sqam' },
  { id: '2048qam', name: '2048-QAM', M: 2048, kind: 'xqam' },
  { id: '4096qam', name: '4096-QAM', M: 4096, kind: 'sqam' },
];
const b1Mod = id => b1MODS.find(m => m.id === id) || b1MODS[1];
const b1Bits = id => Math.round(Math.log2(b1Mod(id).M));
const b1Pop = x => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
const b1Gray = i => i ^ (i >> 1);

// L-PAM bit error rate with Gray coding; a = half the level spacing / sigma.
function b1PamBer(L, a) {
  const q = [];
  for (let n = 1; n <= 2 * L + 1; n += 2) q[n] = b1Q(n * a);
  let sum = 0;
  for (let i = 0; i < L; i++) {
    const gi = b1Gray(i);
    for (let j = 0; j < L; j++) {
      if (j === i) continue;
      const m = Math.abs(j - i);
      // the outermost decision region on the far side is semi-infinite
      const edge = (j === 0 && j < i) || (j === L - 1 && j > i);
      const p = edge ? q[2 * m - 1] : q[2 * m - 1] - q[2 * m + 1];
      sum += p * b1Pop(gi ^ b1Gray(j));
    }
  }
  return sum / (L * Math.log2(L));
}

// Pawula / Craig: probability that the phase error lies in (psi, pi).
// At low SNR the integrand steps from 0 to 1 within phi ≈ √(γs)·sin ψ of 0,
// so that part gets its own Simpson panel (keeps BER → 0.5 accurate).
function b1PskR(psi, gs) {
  const b = PI - psi;
  if (b <= 0) return 0;
  const s2 = Math.pow(Math.sin(psi), 2);
  const f = phi => { const s = Math.sin(phi); return s === 0 ? 0 : Math.exp(-gs * s2 / (s * s)); };
  const simpson = (x0, x1, n) => {
    const hh = (x1 - x0) / n;
    let acc = f(x0) + f(x1);
    for (let i = 1; i < n; i++) acc += (i % 2 ? 4 : 2) * f(x0 + i * hh);
    return acc * hh / 3;
  };
  const edge = 20 * sqrt(gs * s2);
  const r = edge < b / 2 ? simpson(0, edge, 256) + simpson(edge, b, 256) : simpson(0, b, 256);
  return r / (2 * PI);
}

// ---------------------------------------------------------- cross QAM -----
// M = 2^(2n+1): an S×S grid (S = 3·2^(n−1)) without a b×b block at each corner
// (b = 2^(n−2)). Labels: 32-cross uses an optimal quasi-Gray labelling
// (56 bit differences over 52 neighbour pairs); 128 and up use Smith's fold of
// a 2^(n+1) × 2^n Gray rectangle (its outer b columns are turned into the top
// and bottom arms). Gray penalties 1.077 / 1.138 / 1.098 / 1.064.
const b1X32 = [0b10100, 0b10110, 0b11110, 0b11100,   // rows from the top, left to right
  0b11101, 0b10101, 0b00110, 0b01110, 0b01100, 0b00100,
  0b11111, 0b10111, 0b00111, 0b01111, 0b01101, 0b00101,
  0b11011, 0b10011, 0b00011, 0b01011, 0b01001, 0b00001,
  0b11001, 0b10001, 0b00010, 0b01010, 0b01000, 0b00000,
  0b10000, 0b10010, 0b11010, 0b11000];
const b1GL6 = [[-0.9324695142031521, 0.1713244923791704], [-0.6612093864662645, 0.3607615730481386],
  [-0.2386191860831969, 0.4679139345726910], [0.2386191860831969, 0.4679139345726910],
  [0.6612093864662645, 0.3607615730481386], [0.9324695142031521, 0.1713244923791704]];
const b1XqCache = {};
function b1Xq(M) {
  if (b1XqCache[M]) return b1XqCache[M];
  const k = Math.round(Math.log2(M)), n = (k - 1) / 2, S = 3 << (n - 1), Hh = 1 << n, W = 2 * Hh, b = 1 << (n - 2);
  const own = new Int32Array(S * S).fill(-1), lab = [], ix = [], iy = [];
  // x, y in half spacings (odd integers); ix, iy = grid cell 0 .. S−1
  const put = (x, y, l) => { const i = (x + S - 1) / 2, j = (y + S - 1) / 2; own[i * S + j] = lab.length; ix.push(i); iy.push(j); lab.push(l); };
  if (M === 32) {
    let t = 0;
    for (let y = 5; y >= -5; y -= 2) for (let x = -5; x <= 5; x += 2) if (Math.abs(x) < 5 || Math.abs(y) < 5) put(x, y, b1X32[t++]);
  } else {
    for (let c = 0; c < W; c++) for (let r = 0; r < Hh; r++) {
      let x = 2 * c - W + 1, y = 2 * r - Hh + 1;
      if (Math.abs(x) > S - 1) { const ax = Math.abs(x); x = Math.sign(x) * Math.abs(y); y = Math.sign(y) * (ax - S + Hh); }
      put(x, y, (b1Gray(c) << n) | b1Gray(r));
    }
  }
  // ML decision for a received point in a removed corner cell: an off-diagonal cell belongs to
  // the end of its row or column (whichever is nearer); a diagonal cell is split along |y| = |x|.
  const dec = new Int32Array(S * S).fill(-1), diag = [];
  for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
    if (own[i * S + j] >= 0) { dec[i * S + j] = own[i * S + j]; continue; }
    const fx = i < S / 2, fy = j < S / 2, back = (a, f) => f ? S - 1 - a : a;   // mirror to the top-right corner
    const ci = back(i, fx), cj = back(j, fy), e = S - 1 - b;
    const colEnd = own[i * S + back(e, fy)], rowEnd = own[back(e, fx) * S + j];
    if (ci === cj) diag.push({ ci: ci, fx: fx, fy: fy, below: colEnd, above: rowEnd });
    else dec[i * S + j] = ci > cj ? colEnd : rowEnd;
  }
  const pc = new Uint8Array(M);
  for (let i = 0; i < M; i++) pc[i] = b1Pop(i);
  // Smith's fold is mirror symmetric (a mirror flips one label bit everywhere): one quadrant of
  // transmitted points, and one corner for the diagonal cells, is enough. 32-cross is summed in full.
  const sym = M !== 32, src = [];
  for (let p = 0; p < M; p++) if (!sym || (ix[p] >= S / 2 && iy[p] >= S / 2)) src.push(p);
  return (b1XqCache[M] = { M: M, k: k, S: S, lab: lab, ix: ix, iy: iy, dec: dec, pc: pc, src: src, mult: M / src.length,
    diag: sym ? diag.filter(c => !c.fx && !c.fy) : diag, dmult: sym ? 4 : 1 });
}
// Exact Gray-weighted BER of cross QAM in AWGN (ML detection); a = half the spacing / sigma.
function b1XqBer(M, a) {
  const X = b1Xq(M), S = X.S, pc = X.pc, lab = X.lab, dec = X.dec;
  const qa = b1Q(a);
  if (qa === 0) return 0;
  // per-axis cell probabilities: inner cell d cells away, or the semi-infinite edge cell
  const D = new Float64Array(S + 1), E = new Float64Array(S + 1);
  D[0] = 1 - 2 * qa;
  for (let d = 1; d <= S; d++) D[d] = b1Q((2 * d - 1) * a) - b1Q((2 * d + 1) * a);
  for (let d = 0; d <= S; d++) E[d] = b1Q((2 * d - 1) * a);
  let w = 1;   // cells further away than w carry < 1e-14 of the nearest-neighbour term
  while (w < S && b1Q((2 * w + 1) * a) > 1e-14 * qa) w++;
  const P = new Float64Array(S * S);
  for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) P[i * S + j] = j === 0 ? E[i] : j === S - 1 ? E[S - 1 - i] : D[Math.abs(j - i)];
  let bits = 0, dbits = 0;
  for (const p of X.src) {
    const li = lab[p], cx = X.ix[p], cy = X.iy[p];
    const x0 = Math.max(0, cx - w), x1 = Math.min(S - 1, cx + w), y0 = Math.max(0, cy - w), y1 = Math.min(S - 1, cy + w);
    for (let jx = x0; jx <= x1; jx++) {
      const row = jx * S;
      let acc = 0;
      for (let jy = y0; jy <= y1; jy++) { const o = dec[row + jy]; if (o >= 0) acc += P[cy * S + jy] * pc[li ^ lab[o]]; }
      bits += P[cx * S + jx] * acc;
    }
  }
  bits *= X.mult;
  // diagonal corner cells: integrate across the cell (top-right orientation, cell from L to L + 2)
  for (const c of X.diag) {
    const ci = c.ci, L = 2 * ci - S, last = ci === S - 1, U = last ? L + 4 + 9 / a : L + 2;
    const panels = Math.min(400, Math.max(1, Math.ceil((U - L) * a))), hw = (U - L) / panels / 2;
    const nodes = [];
    for (let q = 0; q < panels; q++) for (const g of b1GL6) nodes.push([L + hw * (2 * q + 1 + g[0]), hw * g[1]]);
    const lb = lab[c.below], la = lab[c.above], nn = nodes.length;
    const lo = Math.max(0, ci - w), hi = Math.min(S - 1, ci + w), span = hi - lo + 1;
    const F = new Float64Array(nn * span), Qy = new Float64Array(nn * span), qL = new Float64Array(span), qH = new Float64Array(span);
    for (let t = 0; t < span; t++) {
      const z = 2 * (lo + t) - S + 1;
      qL[t] = b1Q((L - z) * a); qH[t] = last ? 0 : b1Q((L + 2 - z) * a);
      for (let m = 0; m < nn; m++) {
        F[m * span + t] = nodes[m][1] * a * Math.exp(-0.5 * Math.pow((nodes[m][0] - z) * a, 2)) / sqrt(2 * PI);
        Qy[m * span + t] = b1Q((nodes[m][0] - z) * a);
      }
    }
    for (let p = 0; p < M; p++) {
      const pxi = c.fx ? S - 1 - X.ix[p] : X.ix[p], pyi = c.fy ? S - 1 - X.iy[p] : X.iy[p];
      if (pxi < lo || pxi > hi || pyi < lo || pyi > hi) continue;
      const hb = pc[lab[p] ^ lb], ha = pc[lab[p] ^ la];
      if (hb === 0 && ha === 0) continue;
      const tx = pxi - lo, ty = pyi - lo;
      let sb = 0, sa = 0;   // received below / above the diagonal
      for (let m = 0; m < nn; m++) { const f = F[m * span + tx], qu = Qy[m * span + ty]; sb += f * (qL[ty] - qu); sa += f * (qu - qH[ty]); }
      dbits += hb * sb + ha * sa;
    }
  }
  return (bits + dbits * X.dmult) / (M * X.k);
}

// { ber, ser } at Eb/N0 [dB]
function b1BerSer(modId, ebnoDb) {
  const m = b1Mod(modId), M = m.M, k = Math.round(Math.log2(M));
  const gb = fromDbp(ebnoDb), gs = k * gb;
  if (m.kind === 'bpsk') { const p = b1Q(sqrt(2 * gb)); return { ber: p, ser: p }; }
  if (m.kind === 'qpsk') { const q = b1Q(sqrt(gs)); return { ber: b1Q(sqrt(2 * gb)), ser: 2 * q - q * q }; }
  if (m.kind === 'sqam') {
    const L = Math.round(sqrt(M)), a = sqrt(3 * gs / (M - 1));
    const p = 2 * (1 - 1 / L) * b1Q(a);
    return { ber: b1PamBer(L, a), ser: 2 * p - p * p };
  }
  if (m.kind === 'xqam') {
    const a = sqrt(3 * gs / (31 * M / 32 - 1)), q = b1Q(a);
    const ser = (4 - 6 / sqrt(2 * M)) * q - (4 - 12 / sqrt(2 * M) + 8 / M) * q * q;
    return { ber: b1XqBer(M, a), ser: ser };
  }
  // M-PSK, exact Gray BER (Lee 1986)
  const R = [];
  // R[i] = R((2i-1)·pi/M), i = 1 .. M/2
  for (let i = 1; i <= M / 2; i++) R[i] = b1PskR((2 * i - 1) * PI / M, gs);
  const ser = 2 * R[1];
  let ber = 0;
  for (let i = 1; i < M; i++) {
    const j = i <= M / 2 ? i : M - i;
    const P = j === M / 2 ? 2 * R[M / 2] : R[j] - R[j + 1];
    ber += b1Pop(b1Gray(i)) * P;
  }
  return { ber: ber / k, ser: ser };
}
const b1BerOf = (modId, ebnoDb) => b1BerSer(modId, ebnoDb).ber;
const b1SerOf = (modId, esnoDb) => b1BerSer(modId, esnoDb - dbp(b1Bits(modId))).ser;

// Root of a decreasing error-rate curve in dB: Illinois (safeguarded regula
// falsi) on log(rate), bisection where the rate underflows to 0. Returns NaN
// when the target can't be reached in [-60, 100] dB (BER within about 1e-3
// of 0.5, or SER that close to (M-1)/M, needs less than -60 dB).
const b1INV_LO = -60;
function b1Invert(fn, target, iters) {
  if (!(target > 0) || !isFinite(target)) return NaN;
  const lt = Math.log(target), g = x => { const f = fn(x); return f > 0 ? Math.log(f) - lt : -Infinity; };
  let lo = b1INV_LO, hi = 100, glo = g(lo), ghi = g(hi), side = 0, x = NaN, gx = NaN;
  if (!(glo > 0)) return NaN;
  if (ghi >= 0) return ghi === 0 ? hi : NaN;
  for (let i = 0; i < (iters || 200) && hi - lo > 1e-12; i++) {
    x = isFinite(ghi) ? (lo * ghi - hi * glo) / (ghi - glo) : (lo + hi) / 2;
    if (!(x > lo && x < hi)) x = (lo + hi) / 2;
    gx = g(x);
    if (gx === 0) break;
    if (gx > 0) { lo = x; glo = gx; if (side > 0) ghi /= 2; side = 1; }
    else { hi = x; ghi = gx; if (side < 0) glo /= 2; side = -1; }
    if (Math.abs(gx) < 1e-14) break;
  }
  if (iters) return x;
  return Math.abs(gx) < 1e-7 ? x : NaN;
}
const b1EbnoForBer = (modId, ber, iters) => b1Invert(x => b1BerOf(modId, x), ber, iters);
const b1EsnoForSer = (modId, ser, iters) => b1Invert(x => b1SerOf(modId, x), ser, iters);

// Required Eb/N0 table (cached): { modId: [dB at 1e-3, 1e-6, 1e-9] }
const b1REQ_BERS = [1e-3, 1e-6, 1e-9];
let b1ReqCache = null;
function b1ReqTable() {
  if (!b1ReqCache) {
    b1ReqCache = {};
    for (const m of b1MODS) b1ReqCache[m.id] = b1REQ_BERS.map(b => b1EbnoForBer(m.id, b, 48));
  }
  return b1ReqCache;
}

// ------------------------------------------------------------ POI -----------
// Coincident periodic windows with random phases (Self & Smith; Richards).
const b1POI_TYPES = [
  ['beam', 'Scanning radar beam'],
  ['sweep', 'Swept receiver'],
  ['step', 'Stepped receiver'],
  ['rxant', 'Rotating receiver antenna'],
  ['burst', 'Burst / on-off emitter'],
  ['hop', 'Hopping emitter vs fixed-tuned receiver'],
  ['direct', 'Direct: on-time and period'],
];
// [key, label, field options, default (base units)]
const b1POI_PARAMS = {
  beam: [['bw', '3 dB beamwidth', { sym: '°' }, 3], ['T', 'Scan period', { unit: 's', du: 's' }, 6]],
  sweep: [['bif', 'IF bandwidth', { unit: 'Hz', du: 'MHz' }, 10e6], ['bsig', 'Signal bandwidth', { unit: 'Hz', du: 'MHz' }, 0],
    ['span', 'Swept span', { unit: 'Hz', du: 'GHz' }, 16e9], ['T', 'Sweep period', { unit: 's', du: 'ms' }, 0.1]],
  step: [['dwell', 'Dwell per step', { unit: 's', du: 'ms' }, 1e-3], ['span', 'Span', { unit: 'Hz', du: 'GHz' }, 16e9],
    ['step', 'Step size (≈ IF bandwidth)', { unit: 'Hz', du: 'MHz' }, 20e6]],
  rxant: [['bw', '3 dB beamwidth', { sym: '°' }, 30], ['T', 'Rotation period', { unit: 's', du: 's' }, 2]],
  burst: [['tau', 'On-time', { unit: 's', du: 'ms' }, 10e-3], ['T', 'Repetition period', { unit: 's', du: 's' }, 1]],
  hop: [['rate', 'Hop rate', { sym: 'hops/s' }, 100], ['nch', 'Channels (hop span / RX bandwidth)', { sym: '' }, 2320]],
  direct: [['tau', 'On-time τ', { unit: 's', du: 'ms' }, 10e-3], ['T', 'Period T', { unit: 's', du: 's' }, 1]],
};

function b1PoiWindowRaw(type, p) {
  const bad = { tau: NaN, T: NaN, info: '', warn: 'Enter valid positive values.' };
  const pos = x => typeof x === 'number' && x > 0 && isFinite(x);
  if (type === 'beam' || type === 'rxant') {
    if (!pos(p.bw) || !pos(p.T) || p.bw > 360) return bad;
    return { tau: p.bw / 360 * p.T, T: p.T, info: 'scan rate ' + fmt(360 / p.T, 4) + ' °/s', warn: '' };
  }
  if (type === 'sweep') {
    if (!pos(p.bif) || !pos(p.span) || !pos(p.T) || !(p.bsig >= 0)) return bad;
    const rate = p.span / p.T;
    const tau = Math.min(p.T, (p.bif + p.bsig) * p.T / p.span);
    return { tau: tau, T: p.T, info: 'sweep rate ' + fmtSI(rate, 'Hz/s', 4),
      warn: rate > p.bif * p.bif ? 'Sweep rate exceeds B_IF² (' + fmtSI(p.bif * p.bif, 'Hz/s', 3) + '): the IF filter cannot respond fully, so sensitivity drops.' : '' };
  }
  if (type === 'step') {
    if (!pos(p.dwell) || !pos(p.span) || !pos(p.step)) return bad;
    const N = Math.ceil(p.span / p.step - 1e-9);
    return { tau: p.dwell, T: N * p.dwell, info: N + ' steps', warn: '' };
  }
  if (type === 'hop') {
    if (!pos(p.rate) || !pos(p.nch)) return bad;
    const pr = Math.min(1, 1 / p.nch), dwell = 1 / p.rate;
    return { tau: dwell, T: dwell / pr, info: 'p = ' + fmt(pr, 4) + ' per hop', warn: '', p: pr, rate: p.rate, random: true };
  }
  if (!pos(p.tau) || !pos(p.T)) return bad;
  return { tau: p.tau, T: p.T, info: '', warn: p.tau > p.T ? 'On-time is longer than the period.' : '' };
}

// A window with τ ≥ T never opens or closes, so it does not gate the intercept.
const b1PoiOn = w => w.tau >= w.T * (1 - 1e-9);
// Physical parameters -> { tau, T, info, warn }
function b1PoiWindow(type, p) {
  const w = b1PoiWindowRaw(type, p);
  if (w.tau > 0 && b1PoiOn(w)) w.info = (w.info ? w.info + ' · ' : '') + 'always on: does not limit the intercept';
  return w;
}

// Nested windows do not set the timing: a periodic window whose period fits inside another
// on-time, or a hopper next to any window that is not itself nested in it (a periodic window
// with T > dwell, or a hopper with a longer dwell). A random hop sequence has no fixed phase, so
// it enters as its chance to be on channel during each overlap d of the others,
// 1 − (1 − p)^(1 + d/dwell), whether d is longer or shorter than a dwell. (The window with the
// longest on-time, or the periodic window that nests it, is never nested, so one always gates.)
const b1PoiNested = ws => ws.map((w, i) => ws.some((o, j) => j !== i &&
  (w.random ? (o.random ? o.tau > w.tau : o.T > w.tau) : o.tau >= w.T)));

// Coincidence statistics of windows that open and close, minimum overlap to:
//   lam  rate of coincidence onsets (1/s), P0 probability that one is in progress at t = 0,
//   lamc onset rate while none is in progress (Poisson POI = 1 − (1 − P0)·exp(−lamc·t)),
//   Tmax period of the slowest periodic gating window and p = λ·Tmax (per-scan model; NaN when
//   a hopper sets the timing).
// The gating (not nested) windows follow Self & Smith. A nested set only has to line up once
// during each overlap of the gating windows (mean length 1/Σ 1/τ), so it enters as that
// probability instead of one count per own period, which would overstate the POI.
function b1PoiGroup(ws, to) {
  const nest = b1PoiNested(ws), S = ws.filter((w, i) => !nest[i]), N = ws.filter((w, i) => nest[i]);
  const per = S.filter(w => !w.random), Tmax = per.length ? Math.max(...per.map(w => w.T)) : NaN;
  // tg: usable on-time of a lone periodic gating window (sets when a coincidence in progress at t = 0 recurs)
  const tg = S.length === 1 && !S[0].random ? Math.max(0, S[0].tau - to) : 0;
  const out = (lam, lamc, P0) => ({ lam: lam, lamc: lamc, P0: P0, Tmax: Tmax, p: per.length ? Math.min(1, lam * Tmax) : NaN, nested: nest, tg: tg });
  if (ws.some(w => w.tau < to)) return out(0, 0, 0);
  const P0 = ws.reduce((a, w) => a * (w.tau - to) / w.T, 1);
  const within = d => !N.length ? 1 : N.length === 1 && N[0].random ? b1PoiHopWithin(N[0], d, to) : b1PoiWithin(b1PoiGroup(N, to), Math.max(0, d - to));
  if (S.length === 1 && S[0].random) {
    // a hopper sets the timing: independent dwells, each a coincidence with probability c
    const h = S[0], c = h.p * within(h.tau), lamc = c < 1 ? -Math.log1p(-c) / h.tau : Infinity;
    return out(lamc * (1 - P0), lamc, P0);
  }
  let lam = 0;
  for (let j = 0; j < S.length; j++) {
    let prod = 1 / S[j].T;
    for (let i = 0; i < S.length; i++) if (i !== j) prod *= Math.min(1, (S[i].tau - to) / S[i].T);
    lam += prod;
  }
  lam *= within(1 / S.reduce((a, w) => a + 1 / w.tau, 0));
  return out(lam, lam / (1 - P0), P0);
}
// A lone nested hopper (dwell τ_h, p per hop) during one overlap of length d, exact: an intercept
// needs an on-channel dwell that overlaps the window by ≥ t_o. The dwells that can do so are
// m or m + 1 of them, x = (d − t_o + τ_h − t_o)/τ_h, m = ⌊x⌋, so P = 1 − (1 − p)^m·(1 − (x − m)·p).
function b1PoiHopWithin(h, d, to) {
  const x = (Math.max(0, d - to) + h.tau - to) / h.tau, m = Math.floor(x);
  return 1 - Math.pow(1 - h.p, m) * (1 - (x - m) * h.p);
}
// Statistics of n windows [{tau, T, random?, p?}] with minimum overlap to (s).
function b1PoiStats(wins, to) {
  to = to > 0 ? to : 0;
  const pon = wins.reduce((a, w) => a * Math.min(1, w.tau / w.T), 1);
  const act = wins.filter(w => !b1PoiOn(w));
  if (!act.length) return { pon: 1, dur: Infinity, lam: Infinity, lamc: Infinity, P0: 1, Tmax: NaN, p: NaN, tg: 0, always: true, nested: wins.map(() => false), to: to };
  const g = b1PoiGroup(act, to);
  let k = 0;
  return { pon: pon, dur: 1 / act.reduce((a, w) => a + 1 / w.tau, 0), lam: g.lam, lamc: g.lamc, P0: g.P0, Tmax: g.Tmax, p: g.p, tg: g.tg,
    always: false, nested: wins.map(w => b1PoiOn(w) ? false : g.nested[k++]), to: to };
}
// Poisson model with a coincidence possibly in progress at t = 0 (alternating renewal)
const b1PoiPoisson = (lamc, t, P0) => { P0 = P0 > 0 ? P0 : 0; return t > 0 ? 1 - (1 - P0) * Math.exp(-lamc * t) : P0; };
const b1PoiPoissonTime = (lamc, P, P0) => { P0 = P0 > 0 ? P0 : 0; return P <= P0 ? 0 : lamc > 0 ? Math.log((1 - P0) / (1 - P)) / lamc : Infinity; };
const b1PoiPoissonMean = (lamc, P0) => { P0 = P0 > 0 ? P0 : 0; return lamc > 0 ? (1 - P0) / lamc : P0 >= 1 ? 0 : Infinity; };
// Per-scan (Bernoulli) model on the slowest window: probability p per scan.
function b1PoiBernoulli(p, Tmax, t) {
  if (!(t > 0)) return 0;
  const n = Math.floor(t / Tmax), f = t / Tmax - n, q = 1 - p;
  return f * (1 - Math.pow(q, n + 1)) + (1 - f) * (1 - Math.pow(q, n));
}
function b1PoiBernoulliTime(p, Tmax, P) {
  if (!(p > 0)) return Infinity;
  const q = 1 - p;
  let n = p >= 1 ? 0 : Math.max(0, Math.ceil(Math.log(1 - P) / Math.log(q)) - 1);
  for (let guard = 0; guard < 4; guard++) {
    const A = 1 - Math.pow(q, n), B = Math.pow(q, n) - Math.pow(q, n + 1);
    if (A >= P && n > 0) { n--; continue; }
    if (A + B < P) { n++; continue; }
    return (n + (B > 0 ? (P - A) / B : 0)) * Tmax;
  }
  return NaN;
}
const b1PoiBernoulliMean = (p, Tmax) => p > 0 ? Tmax * (1 / p - 0.5) : Infinity;
// Per-scan model plus a coincidence in progress at t = 0 (P0): POI = P0 + B(t) − P0·O(t), with
// B the per-scan POI and O(t) the chance of an onset hit by t given one is in progress (counted
// in both terms otherwise). With one periodic gating window of usable on-time tg the window
// reopens at T − e, e uniform on [0, tg], then every T, so O averages 1 − (1 − p)^count over e:
// exact for one window, never above 1 and monotonic (P0 ≤ tg/T). Several gating windows have no
// such recurrence; there the in-progress coincidence is taken to use up the current scan,
// O(t) = B(t − T).
function b1PoiScanO(p, T, t, tg) {
  if (!(tg > 0)) return b1PoiBernoulli(p, T, t - T);
  const a = t - T, b = a + Math.min(tg, T), k = Math.floor(b / T), sp = Math.max(a, k * T), q = 1 - p;
  if (b <= 0) return 0;
  return ((b - sp) * (1 - Math.pow(q, Math.max(0, k + 1))) + (sp - a) * (1 - Math.pow(q, Math.max(0, k)))) / (b - a);
}
function b1PoiScan(p, Tmax, t, P0, tg) {
  P0 = P0 > 0 ? P0 : 0;
  if (!(t > 0)) return P0;
  return Math.min(1, P0 + b1PoiBernoulli(p, Tmax, t) - P0 * b1PoiScanO(p, Tmax, t, tg));
}
function b1PoiScanTime(p, Tmax, P, P0, tg) {
  P0 = P0 > 0 ? P0 : 0;
  if (P <= P0) return 0;
  if (!P0) return b1PoiBernoulliTime(p, Tmax, P);
  if (!(p > 0) || !(P < 1)) return Infinity;
  let lo = 0, hi = Tmax;
  while (b1PoiScan(p, Tmax, hi, P0, tg) < P) { lo = hi; hi *= 2; if (!isFinite(hi)) return Infinity; }
  for (let i = 0; i < 200 && hi - lo > 1e-13 * hi; i++) { const m = (lo + hi) / 2; if (b1PoiScan(p, Tmax, m, P0, tg) < P) lo = m; else hi = m; }
  return hi;
}
// mean = ∫(1 − POI) dt = ∫(1 − B) − P0·∫(1 − O); ∫(1 − O) = T/p − tg/2 (or T/p + T/2 for O = B(t − T))
function b1PoiScanMean(p, Tmax, P0, tg) {
  P0 = P0 > 0 ? P0 : 0;
  if (!(p > 0)) return P0 >= 1 ? 0 : Infinity;
  if (tg > 0) return b1PoiBernoulliMean(p, Tmax) - P0 * (Tmax / p - Math.min(tg, Tmax) / 2);
  return p > 1 - P0 ? (1 - P0) * (1 - P0) * Tmax / (2 * p) : b1PoiBernoulliMean(p, Tmax) * (1 - P0) - P0 * Tmax;
}
// Either model on a stats object (scan = per-scan model)
const b1PoiAt = (s, scan, t) => scan ? b1PoiScan(s.p, s.Tmax, t, s.P0, s.tg) : b1PoiPoisson(s.lamc, t, s.P0);
const b1PoiTimeTo = (s, scan, P) => scan ? b1PoiScanTime(s.p, s.Tmax, P, s.P0, s.tg) : b1PoiPoissonTime(s.lamc, P, s.P0);
const b1PoiMeanTime = (s, scan) => scan ? b1PoiScanMean(s.p, s.Tmax, s.P0, s.tg) : b1PoiPoissonMean(s.lamc, s.P0);
// probability that a (nested) group lines up within an interval of length d
const b1PoiWithin = (g, d) => b1PoiAt(g, g.p >= 0, d);

// Warnings for the statistical model
function b1PoiWarnings(wins, st) {
  const w = [];
  if (st.always) return ['Every window is always on, so the intercept is immediate (POI = 100 %).'];
  if (!(st.lam > 0)) w.push('Intercept is impossible: an on-time is shorter than the minimum overlap.');
  if (!(st.p >= 0)) w.push('A random (hopping) window sets the timing: the per-scan model does not apply; the Poisson result is the right one.');
  if (st.p > 0.1) w.push('Per-scan probability p = ' + fmt(st.p, 3) + ' is not small, so the Poisson model is unreliable. Use the per-scan result.');
  const nest = st.nested || [];
  wins.forEach((x, j) => {
    if (!nest[j]) return;
    const i = wins.findIndex((o, i2) => i2 !== j && !b1PoiOn(o) && (x.random ? (o.random ? o.tau > x.tau : o.T > x.tau) : o.tau >= x.T));
    const o = wins[i] || {};
    w.push('Window ' + (j + 1) + (!x.random ? ' repeats within the on-time of window ' + (i + 1) :
      o.tau > x.tau ? ' hops several times within the on-time of window ' + (i + 1) : ' hops at random, so it has no fixed phase against window ' + (i + 1)) +
      ' (nested): it is counted by its chance to ' + (x.random ? 'be on channel' : 'line up') + ' during each overlap of the other windows, not once per ' + (x.random ? 'hop.' : 'period.'));
  });
  // only periodic gating windows have a repeating relative timing
  const gate = wins.map((x, i) => !x.random && !b1PoiOn(x) && !nest[i]);
  for (let i = 0; i < wins.length; i++) for (let j = i + 1; j < wins.length; j++) {
    if (!gate[i] || !gate[j]) continue;
    const big = Math.max(wins[i].T, wins[j].T), small = Math.min(wins[i].T, wins[j].T);
    const r = big / small;
    for (let q = 1; q <= 20; q++) {
      const pp = Math.round(r * q);
      // an exact ratio up to rounding of the inputs (absolute, in units of the shorter period)
      if (pp > 0 && Math.abs(r * q - pp) <= 1e-6 + 1e-12 * r * q) {
        // Locked clocks: the two windows overlap at fixed phases that repeat every lcm, so they
        // overlap within lcm or never, and P(ever) ≤ λ_ij·lcm with λ_ij their own coincidence rate.
        // That bounds the intercept whatever the other windows do; the intercept itself is only
        // limited to lcm when every other window is always on (a hopper or a free-running window
        // gets a new chance at each repeat of the overlap).
        const lcm = q * big, L = fmtSI(lcm, 's', 4), pair = 'windows ' + (i + 1) + ' and ' + (j + 1);
        const only = wins.every((x, k) => k === i || k === j || b1PoiOn(x));
        const lij = b1PoiGroup([wins[i], wins[j]], st.to > 0 ? st.to : 0).lam, li = 'λ(' + (i + 1) + ',' + (j + 1) + ')';
        // the bound is only worth showing below 100 %
        const pe = !(lij * lcm < 1) ? '' : ' (P(ever) ≤ ' + (only ? 'λ' : li) + '·' + L + ' = ' + (lij > 0 ? fmt(100 * lij * lcm, 3) + ' %' : '0') +
          (only ? '' : ', with ' + li + ' the coincidence rate of ' + pair + ' alone') + ')';
        w.push('Periods of ' + pair + ' are commensurate (ratio ' + pp + (q > 1 ? '/' + q : '') +
          '). With free-running clocks (the usual case) the phases drift and the results apply. If the clocks are locked, the relative timing of these two windows repeats every ' + L +
          (only ? ', so the intercept happens within that time or never' + pe + '.'
            : ', so they overlap within that time or never, and the intercept can only happen during those overlaps' + pe + '.'));
        break;
      }
    }
  }
  return w;
}

// P(at least k successes in n trials).
function b1BinomAtLeast(n, p, k) {
  n = Math.floor(n); k = Math.ceil(k);
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p >= 1) return 1;
  if (p <= 0) return 0;
  if (!isFinite(n)) return 1;   // k is finite here: endless trials with p > 0 always reach it
  // p > 1/2 is counted as failures (Y = n − X), so the mode index stays small and exact
  return p > 0.5 ? b1BinomTails(n, 1 - p, n - k + 1)[1] : b1BinomTails(n, p, k)[0];
}
// [P(X ≥ k), P(X < k)] for X ~ Bin(n, p), 0 < p ≤ 1/2, 0 < k ≤ n. Terms are summed outward from
// the mode, relative to it, so nothing underflows and neither tail is formed as 1 − the other.
// Above σ = 10⁵ (about 2·10⁶ terms) the normal limit with continuity correction is used: the
// skewness is then below 10⁻⁵, and the loops stay short with an exact (below 2⁵³) index.
function b1BinomTails(n, p, k) {
  const sd = Math.sqrt(n * p * (1 - p));
  if (sd > 1e5) { const z = (k - 0.5 - n * p) / sd; return [b1Q(z), b1Q(-z)]; }
  const m = Math.min(n, Math.floor((n + 1) * p)), r = p / (1 - p);
  let hi = 0, lo = 0, t = 1;
  for (let i = m; i <= n; i++) {
    if (i > m) t *= (n - i + 1) / i * r;
    if (i >= k) hi += t; else lo += t;
    if (t < 1e-18 * (hi + lo)) break;
  }
  t = 1;
  for (let i = m - 1; i >= 0; i--) {
    t *= (i + 1) / ((n - i) * r);
    if (i >= k) hi += t; else lo += t;
    if (t < 1e-18 * (hi + lo)) break;
  }
  return [hi / (hi + lo), lo / (hi + lo)];
}

// ----------------------------------------------------- propagation ---------
// Crossover between the free-space and two-ray asymptotes: d_c = 4π·ht·hr/λ
const b1Dc = (f, ht, hr) => 4 * PI * ht * hr * f / C0;
const b1TwoRay = (d, ht, hr) => 40 * log10(d) - 20 * log10(ht) - 20 * log10(hr);
// model: 'blend' = 10·log(L_fs + L_2ray) (smooth, every input matters),
// 'auto' = free space below d_c and two-ray beyond (Adamy), 'fs', 'tr'
function b1PathLoss(model, f, d, ht, hr) {
  if (model === 'fs') return fsplDb(f, d);
  if (model === 'tr') return b1TwoRay(d, ht, hr);
  if (model === 'auto') return d < b1Dc(f, ht, hr) ? fsplDb(f, d) : b1TwoRay(d, ht, hr);
  return dbp(Math.pow(4 * PI * d * f / C0, 2) + Math.pow(d, 4) / Math.pow(ht * hr, 2));
}
function b1PathDist(model, f, L, ht, hr) {
  const dfs = C0 * fromDbv(L) / (4 * PI * f);
  const dtr = Math.pow(10, (L + 20 * log10(ht) + 20 * log10(hr)) / 40);
  if (model === 'fs') return dfs;
  if (model === 'tr') return dtr;
  if (model === 'auto') return dfs < b1Dc(f, ht, hr) ? dfs : dtr;
  const a = Math.pow(4 * PI * f / C0, 2), b = 1 / Math.pow(ht * hr, 2), Ll = fromDbp(L);
  // root of b·x² + a·x = L (x = d²) in the form without cancellation
  return isFinite(Ll) ? sqrt(2 * Ll / (a + sqrt(a * a + 4 * b * Ll))) : Infinity;
}
function b1PathFreq(model, d, L, ht, hr) {
  const ffs = C0 * fromDbv(L) / (4 * PI * d);
  if (model === 'fs') return ffs;
  if (model === 'tr') return NaN;
  if (model === 'auto') return d < b1Dc(ffs, ht, hr) ? ffs : NaN;
  const rest = fromDbp(L) - Math.pow(d, 4) / Math.pow(ht * hr, 2);
  return rest > 0 ? C0 * sqrt(rest) / (4 * PI * d) : NaN;
}
// height of one antenna given the other
function b1PathHeight(model, f, d, L, hOther) {
  if (model === 'fs') return NaN;
  const htr = Math.pow(10, (40 * log10(d) - 20 * log10(hOther) - L) / 20);
  if (model === 'tr') return htr;
  if (model === 'auto') return d >= b1Dc(f, htr, hOther) ? htr : NaN;
  const rest = fromDbp(L) - Math.pow(4 * PI * d * f / C0, 2);
  return rest > 0 ? d * d / (hOther * sqrt(rest)) : NaN;
}
const b1ModelName = (model, f, d, ht, hr) => model === 'fs' ? 'free space' : model === 'tr' ? 'two-ray'
  : model === 'auto' ? (d < b1Dc(f, ht, hr) ? 'free space (below crossover)' : 'two-ray (beyond crossover)')
  : (d < b1Dc(f, ht, hr) ? 'blend, mostly free space' : 'blend, mostly two-ray');

// ---------------------------------------------------- desensitization ------
const b1Desense = inr => dbp(1 + fromDbp(inr));
const b1InrFor = des => des > 0 ? dbp(fromDbp(des) - 1) : -Infinity;
// coupling of an off-channel interferer into the IF: reciprocal mixing + filter leakage
const b1Coupling = (pn, bif, rej) => dbp(fromDbp(pn + dbp(bif)) + fromDbp(-rej));

// ----------------------------------------------------------- radar ----------
const b1Bwc = (bj, br) => Math.max(0, dbp(bj / br));
const b1Horizon = (h1, h2) => sqrt(2 * (4 / 3) * R_EARTH * h1) + sqrt(2 * (4 / 3) * R_EARTH * h2);

// ======================================================= calculators =======
const b1PT = v => fromDbp(v); // dBi / dB -> linear
const b1W = dbm => 1e-3 * fromDbp(dbm);
const b1Mw = w => dbp(w / 1e-3);
const b1Lam = f => C0 / f;
const b1Kof = v => b1Bits(v.$.mod);

CALCS.push(
// ------------------------------------------------------------- BER ---------
{
  id: 'ber', cat: 'noise', title: 'BER ↔ SNR (Digital Modulations, AWGN)',
  kw: 'ber ser bit error rate snr ebno eb/n0 es/n0 qam psk bpsk qpsk 4096 modulation awgn',
  desc: 'Bit and symbol error rate in AWGN (coherent detection, Gray coding). Enter Eb/N0 to get the BER, or enter a target BER to get the required Eb/N0 and SNR.',
  cfg: [{ id: 'mod', label: 'Modulation', def: 'qpsk',
          options: b1MODS.map(m => [m.id, m.name + (m.kind === 'xqam' ? ' (cross)' : '')]) }],
  vars: [
    dbV('ebno', 'E<sub>b</sub>/N₀ at the demodulator', 10),
    dbV('il', 'Implementation loss', 0, 'dB', { sticky: true, min: 0, max: 100 }),
    dbV('esno', 'E<sub>s</sub>/N₀ (= SNR in the symbol-rate bandwidth)'),
    posV('ber', 'Bit error rate (BER)', undefined, '', { min: 0, max: 0.5 }),
    posV('ser', 'Symbol error rate (SER)', undefined, '', { min: 0, max: 1 }),
    uV('rb', 'Bit rate R<sub>b</sub>', 'bps', 'Mbps', 1e6),
    fq('bw', 'Noise bandwidth B', 1e6, 'MHz', { min: 1e-6, max: 1e13 }),
    dbV('snr', 'SNR in bandwidth B (copy this into "Required SNR")'),
  ],
  eqs: [
    E('esno', ['ebno'], v => v.ebno + dbp(b1Kof(v)), { ebno: v => v.esno - dbp(b1Kof(v)) }),
    E('ber', ['ebno', 'il'], v => b1BerOf(v.$.mod, v.ebno - v.il), {
      ebno: v => b1EbnoForBer(v.$.mod, v.ber) + v.il,
      il: v => v.ebno - b1EbnoForBer(v.$.mod, v.ber),
    }),
    E('ser', ['esno', 'il'], v => b1SerOf(v.$.mod, v.esno - v.il), {
      esno: v => b1EsnoForSer(v.$.mod, v.ser) + v.il,
      il: v => v.esno - b1EsnoForSer(v.$.mod, v.ser),
    }),
    E('snr', ['ebno', 'rb', 'bw'], v => v.ebno + dbp(v.rb / v.bw), {
      ebno: v => v.snr - dbp(v.rb / v.bw), rb: v => v.bw * fromDbp(v.snr - v.ebno), bw: v => v.rb / fromDbp(v.snr - v.ebno),
    }),
  ],
  outputs: [
    O('Bits per symbol k', v => b1Kof(v), ''),
    O('Symbol rate R<sub>s</sub> = R<sub>b</sub>/k', v => v.rb / b1Kof(v), 'Bd', true),
    O('Spectral efficiency R<sub>b</sub>/B', v => v.rb / v.bw, 'b/s/Hz'),
    O('Effective E<sub>b</sub>/N₀ after the implementation loss (E<sub>b</sub>/N₀ − IL, used for the BER and SER)', v => v.ebno - v.il, 'dB'),
    O('Required E<sub>b</sub>/N₀ for BER 10⁻³ / 10⁻⁶ / 10⁻⁹', v => {
      const r = b1ReqTable()[v.$.mod];
      return r ? r.map(x => (x + (isFinite(v.il) ? v.il : 0)).toFixed(2)).join(' / ') + ' dB' : NaN;
    }),
    O('Shannon limit E<sub>b</sub>/N₀ at R<sub>b</sub>/B', v => { const e = v.rb / v.bw; return dbp((Math.pow(2, e) - 1) / e); }, 'dB'),
  ],
  chart: v => b1BerChart(v),
  warn: v => v.ber === 0 ? 'BER is below 1e-300, too small to represent. Lower Eb/N0 to see a value.'
    : v.ber > 0 && !isFinite(v.ebno) ? 'No Eb/N0 between ' + b1INV_LO + ' and 100 dB gives this BER: it is too close to 0.5 (the random-guess limit).'
    : v.ser > 0 && !isFinite(v.esno) ? 'No Es/N0 between ' + b1INV_LO + ' and 100 dB gives this SER: the model’s SER levels off at ' + fmt(b1SerOf(v.$.mod, b1INV_LO), 5) +
      (b1Mod(v.$.mod).kind === 'xqam' ? ' (the low-SNR limit of Smith’s formula, 1 − 2/M).' : ' (the random-guess limit, (M−1)/M).')
    : b1Mod(v.$.mod).kind === 'xqam' ? 'Cross QAM has no perfect Gray code: the BER is exact for the quasi-Gray labelling used here (others differ by a few hundredths of a dB); the SER uses Smith\'s formula.' : null,
  note: 'BPSK/QPSK: P<sub>b</sub> = Q(√(2E<sub>b</sub>/N₀)). Square M-QAM: exact Gray BER from per-dimension PAM transitions. Cross QAM: exact BER for a quasi-Gray labelling, summed over the decision regions (Gray penalty about 1.06 to 1.14, so the BER is above SER/k). M-PSK: exact (Pawula/Craig integral, Lee weighting). E<sub>s</sub>/N₀ = E<sub>b</sub>/N₀ + 10·log k. SNR in B = E<sub>b</sub>/N₀ + 10·log(R<sub>b</sub>/B). Uncoded; with FEC of rate R<sub>c</sub>, E<sub>s</sub>/N₀ = E<sub>b</sub>/N₀ + 10·log(k·R<sub>c</sub>).',
},

// ---------------------------------------------------------- POI (custom) --
{ id: 'poi', cat: 'ew', title: 'Probability of Intercept (POI)', kw: 'poi probability of intercept esm elint scan sweep window coincidence hop', custom: 'b1poi' },

// ------------------------------------------------------------ comms J/S ---
{
  id: 'js_comm', cat: 'ew', title: 'Communications Jamming: J/S',
  kw: 'jamming j/s jammer to signal communications two-ray fresnel jammer erp eirp radio horizon',
  desc: 'Jammer-to-signal ratio at a communications receiver. Leave the jammer distance blank to find how close the jammer must be for the required J/S.',
  cfg: [{ id: 'model', label: 'Propagation', def: 'blend', options: [
    ['blend', 'Smooth: free space + two-ray (all inputs matter)'],
    ['auto', 'Free space below the crossover, two-ray beyond (Adamy)'],
    ['fs', 'Free space only'], ['tr', 'Two-ray (flat earth) only']] }],
  vars: [
    dbV('erpj', 'Jammer EIRP', 50, 'dBm'),
    dbV('erps', 'Wanted transmitter EIRP', 40, 'dBm'),
    fq('f', 'Frequency', 300e6, 'MHz', { sticky: true }),
    lenV('dj', 'Jammer → receiver distance', 20e3, 'km', { pri: -1 }),
    lenV('ds', 'Transmitter → receiver distance', 10e3, 'km'),
    lenV('hj', 'Jammer antenna height', 30, 'm', { sticky: true }),
    lenV('hs', 'Transmitter antenna height', 2, 'm', { sticky: true }),
    lenV('hr', 'Receiver antenna height', 2, 'm', { sticky: true }),
    dbV('grj', 'RX antenna gain toward the jammer', 0, 'dBi'),
    dbV('grs', 'RX antenna gain toward the transmitter', 0, 'dBi'),
    dbV('lj', 'Jammer path loss'),
    dbV('ls', 'Signal path loss'),
    dbV('js', 'J/S at the receiver'),
    dbV('jsreq', 'Required J/S', 0, 'dB'),
    dbV('margin', 'Jamming margin (J/S − required)'),
  ],
  eqs: [
    E('lj', ['f', 'dj', 'hj', 'hr'], v => b1PathLoss(v.$.model, v.f, v.dj, v.hj, v.hr), {
      dj: v => b1PathDist(v.$.model, v.f, v.lj, v.hj, v.hr),
      f: v => b1PathFreq(v.$.model, v.dj, v.lj, v.hj, v.hr),
      hj: v => b1PathHeight(v.$.model, v.f, v.dj, v.lj, v.hr),
      hr: v => b1PathHeight(v.$.model, v.f, v.dj, v.lj, v.hj),
    }),
    E('ls', ['f', 'ds', 'hs', 'hr'], v => b1PathLoss(v.$.model, v.f, v.ds, v.hs, v.hr), {
      ds: v => b1PathDist(v.$.model, v.f, v.ls, v.hs, v.hr),
      f: v => b1PathFreq(v.$.model, v.ds, v.ls, v.hs, v.hr),
      hs: v => b1PathHeight(v.$.model, v.f, v.ds, v.ls, v.hr),
      hr: v => b1PathHeight(v.$.model, v.f, v.ds, v.ls, v.hs),
    }),
    E('js', ['erpj', 'lj', 'grj', 'erps', 'ls', 'grs'], v => v.erpj - v.lj + v.grj - (v.erps - v.ls + v.grs), {
      erpj: v => v.js + v.lj - v.grj + (v.erps - v.ls + v.grs),
      lj: v => v.erpj + v.grj - (v.erps - v.ls + v.grs) - v.js,
      grj: v => v.js - v.erpj + v.lj + (v.erps - v.ls + v.grs),
      erps: v => v.erpj - v.lj + v.grj - v.js + v.ls - v.grs,
      ls: v => v.js - v.erpj + v.lj - v.grj + v.erps + v.grs,
      grs: v => v.erpj - v.lj + v.grj - v.js - v.erps + v.ls,
    }),
    E('margin', ['js', 'jsreq'], v => v.js - v.jsreq, { js: v => v.margin + v.jsreq, jsreq: v => v.js - v.margin }),
  ],
  outputs: [
    O('Jammer power at the receiver', v => v.erpj - v.lj + v.grj, 'dBm'),
    O('Wanted signal at the receiver', v => v.erps - v.ls + v.grs, 'dBm'),
    O('Jammer path model', v => b1ModelName(v.$.model, v.f, v.dj, v.hj, v.hr)),
    O('Signal path model', v => b1ModelName(v.$.model, v.f, v.ds, v.hs, v.hr)),
    O('Crossover distance, jammer path', v => b1Dc(v.f, v.hj, v.hr), 'm', true),
    O('Crossover distance, signal path', v => b1Dc(v.f, v.hs, v.hr), 'm', true),
    O('Radio horizon (k = 4/3), jammer path', v => b1Horizon(v.hj, v.hr), 'm', true),
    O('Radio horizon (k = 4/3), signal path', v => b1Horizon(v.hs, v.hr), 'm', true),
    O('Verdict', v => !isFinite(v.margin) ? NaN : v.margin >= 0 ? 'Jamming effective (J/S ≥ required)' : 'Jamming not effective'),
  ],
  // both path models need line of sight
  warn: v => {
    const m = [], hzj = b1Horizon(v.hj, v.hr), hzs = b1Horizon(v.hs, v.hr);
    if (isFinite(v.dj) && isFinite(hzj) && v.dj > hzj) m.push('jammer path (' + fmtSI(v.dj, 'm', 4) + ') is beyond its radio horizon (' + fmtSI(hzj, 'm', 4) + ')');
    if (isFinite(v.ds) && isFinite(hzs) && v.ds > hzs) m.push('signal path (' + fmtSI(v.ds, 'm', 4) + ') is beyond its radio horizon (' + fmtSI(hzs, 'm', 4) + ')');
    return m.length ? '⚠ The ' + m.join(' and the ') + ' (4/3 earth). Free-space and two-ray models assume line of sight; beyond the horizon diffraction makes the real loss much higher, so that path\'s power and the J/S are not reliable.' : null;
  },
  note: 'J/S = EIRP<sub>J</sub> − L<sub>J</sub> + G<sub>RJ</sub> − (EIRP<sub>S</sub> − L<sub>S</sub> + G<sub>RS</sub>). EIRP is referenced to an isotropic radiator (Adamy writes ERP for it); for a dipole-referenced ERP (dBd) add 2.15 dB. J/S does not change as long as both powers use the same reference. Two-ray: L = 40·log d − 20·log h<sub>t</sub> − 20·log h<sub>r</sub> (frequency independent). Crossover d<sub>c</sub> = 4π·h<sub>t</sub>·h<sub>r</sub>/λ (Adamy\'s 24 000 rule is the rounded form). The smooth model adds the two losses linearly: it never falls below the larger (applicable) asymptote and is at most 3 dB (10·log 2) above it, the maximum being at d = d<sub>c</sub>. Both models need line of sight: radio horizon √(2kR·h<sub>t</sub>) + √(2kR·h<sub>r</sub>), k = 4/3. Typical required J/S for digital comms: about 0 dB.',
},

// ---------------------------------------------------- radar: SPJ ----------
{
  id: 'js_spj', cat: 'ew', title: 'Radar Jamming: Self-Protection (J/S, burn-through)',
  kw: 'radar jamming self protection self screening spj burn through j/s rcs noise jammer erp eirp',
  desc: 'Jammer carried on the target, in the radar main beam. The burn-through range is the distance at which the J/S falls to the required value.',
  vars: [
    dbV('erpj', 'Jammer EIRP', 50, 'dBm'),
    dbV('erpr', 'Radar EIRP', 90, 'dBm'),
    uV('sigma', 'Target RCS σ', 'm2', 'm²', 10),
    lenV('r', 'Radar → target range', 10e3, 'km'),
    fq('bj', 'Jammer noise bandwidth', 10e6, 'MHz'),
    fq('br', 'Radar receiver bandwidth', 1e6, 'MHz', { sticky: true }),
    dbV('bwc', 'Bandwidth correction (B<sub>J</sub> > B<sub>R</sub>)', undefined, 'dB', { min: 0 }),
    dbV('js', 'J/S at the radar receiver'),
    dbV('jsreq', 'Required J/S', 10, 'dB'),
    lenV('rbt', 'Burn-through range', undefined, 'km'),
  ],
  eqs: [
    E('bwc', ['bj', 'br'], v => b1Bwc(v.bj, v.br), {
      bj: v => v.bwc > 0 ? v.br * fromDbp(v.bwc) : NaN, br: v => v.bwc > 0 ? v.bj / fromDbp(v.bwc) : NaN,
    }),
    E('js', ['erpj', 'erpr', 'r', 'sigma', 'bwc'], v => v.erpj - v.erpr + dbp(4 * PI * v.r * v.r / v.sigma) - v.bwc, {
      erpj: v => v.js + v.erpr - dbp(4 * PI * v.r * v.r / v.sigma) + v.bwc,
      erpr: v => v.erpj + dbp(4 * PI * v.r * v.r / v.sigma) - v.bwc - v.js,
      r: v => sqrt(v.sigma * fromDbp(v.js - v.erpj + v.erpr + v.bwc) / (4 * PI)),
      sigma: v => 4 * PI * v.r * v.r / fromDbp(v.js - v.erpj + v.erpr + v.bwc),
      bwc: v => v.erpj - v.erpr + dbp(4 * PI * v.r * v.r / v.sigma) - v.js,
    }),
    E('rbt', ['jsreq', 'erpj', 'erpr', 'sigma', 'bwc'], v => sqrt(v.sigma * fromDbp(v.jsreq - v.erpj + v.erpr + v.bwc) / (4 * PI)), {
      jsreq: v => v.erpj - v.erpr + dbp(4 * PI * v.rbt * v.rbt / v.sigma) - v.bwc,
      erpj: v => v.jsreq + v.erpr - dbp(4 * PI * v.rbt * v.rbt / v.sigma) + v.bwc,
      erpr: v => v.erpj + dbp(4 * PI * v.rbt * v.rbt / v.sigma) - v.bwc - v.jsreq,
      sigma: v => 4 * PI * v.rbt * v.rbt / fromDbp(v.jsreq - v.erpj + v.erpr + v.bwc),
      bwc: v => v.erpj - v.erpr + dbp(4 * PI * v.rbt * v.rbt / v.sigma) - v.jsreq,
    }),
  ],
  outputs: [
    O('Status at this range', v => !isFinite(v.js) || !isFinite(v.jsreq) ? NaN
      : v.js >= v.jsreq ? 'Jammed: the target is masked' : 'Burned through: the radar sees the target'),
    O('Range / burn-through range', v => v.r / v.rbt, '×'),
  ],
  note: 'J/S = EIRP<sub>J</sub> − EIRP<sub>R</sub> + 10·log(4πR²/σ) − 10·log(B<sub>J</sub>/B<sub>R</sub>) (correction only when B<sub>J</sub> > B<sub>R</sub>). Same as the Adamy form 71 + ERP<sub>J</sub> − ERP<sub>R</sub> + 20·log R<sub>km</sub> − 10·log σ (dBm, km, m²). EIRP is referenced to an isotropic radiator (Adamy writes ERP for it); for a dipole-referenced ERP (dBd) add 2.15 dB. J/S does not change as long as both powers use the same reference. Frequency independent; the radar antenna gain cancels. J/S is at the receiver input: pulse compression and integration gain are not credited to a noise jammer. Below the burn-through range the J/S is lower than required.',
},

// ---------------------------------------------------- radar: SOJ ----------
{
  id: 'js_soj', cat: 'ew', title: 'Radar Jamming: Stand-Off (J/S, burn-through)',
  kw: 'radar jamming stand off soj sidelobe burn through j/s escort erp eirp',
  desc: 'Jammer away from the target, usually entering through a radar sidelobe. The burn-through range is the target range at which the J/S falls to the required value.',
  vars: [
    dbV('erpj', 'Jammer EIRP (toward the radar)', 70, 'dBm'),
    dbV('erpr', 'Radar EIRP (main beam)', 115, 'dBm'),
    uV('sigma', 'Target RCS σ', 'm2', 'm²', 5),
    lenV('rt', 'Radar → target range', 50e3, 'km', { pri: -1 }),
    lenV('rj', 'Radar → jammer range', 100e3, 'km'),
    dbV('grj', 'Radar antenna gain toward the jammer', 0, 'dBi'),
    dbV('gm', 'Radar main-beam gain', 35, 'dBi', { sticky: true }),
    fq('bj', 'Jammer noise bandwidth', 10e6, 'MHz'),
    fq('br', 'Radar receiver bandwidth', 1e6, 'MHz', { sticky: true }),
    dbV('bwc', 'Bandwidth correction (B<sub>J</sub> > B<sub>R</sub>)', undefined, 'dB', { min: 0 }),
    dbV('js', 'J/S at the radar receiver'),
    dbV('jsreq', 'Required J/S', 0, 'dB'),
    lenV('rbt', 'Burn-through target range', undefined, 'km'),
  ],
  eqs: [
    E('bwc', ['bj', 'br'], v => b1Bwc(v.bj, v.br), {
      bj: v => v.bwc > 0 ? v.br * fromDbp(v.bwc) : NaN, br: v => v.bwc > 0 ? v.bj / fromDbp(v.bwc) : NaN,
    }),
    E('js', ['erpj', 'erpr', 'rt', 'rj', 'sigma', 'grj', 'gm', 'bwc'],
      v => v.erpj - v.erpr + dbp(4 * PI) + 40 * log10(v.rt) - 20 * log10(v.rj) - dbp(v.sigma) + v.grj - v.gm - v.bwc, {
      erpj: v => v.js + v.erpr - dbp(4 * PI) - 40 * log10(v.rt) + 20 * log10(v.rj) + dbp(v.sigma) - v.grj + v.gm + v.bwc,
      rt: v => Math.pow(10, (v.js - v.erpj + v.erpr - dbp(4 * PI) + 20 * log10(v.rj) + dbp(v.sigma) - v.grj + v.gm + v.bwc) / 40),
      rj: v => Math.pow(10, (v.erpj - v.erpr + dbp(4 * PI) + 40 * log10(v.rt) - dbp(v.sigma) + v.grj - v.gm - v.bwc - v.js) / 20),
      grj: v => v.js - (v.erpj - v.erpr + dbp(4 * PI) + 40 * log10(v.rt) - 20 * log10(v.rj) - dbp(v.sigma) - v.gm - v.bwc),
    }),
    E('rbt', ['jsreq', 'erpj', 'erpr', 'rj', 'sigma', 'grj', 'gm', 'bwc'],
      v => Math.pow(10, (v.jsreq - v.erpj + v.erpr - dbp(4 * PI) + 20 * log10(v.rj) + dbp(v.sigma) - v.grj + v.gm + v.bwc) / 40), {
      jsreq: v => v.erpj - v.erpr + dbp(4 * PI) + 40 * log10(v.rbt) - 20 * log10(v.rj) - dbp(v.sigma) + v.grj - v.gm - v.bwc,
    }),
  ],
  outputs: [
    O('Status at this target range', v => !isFinite(v.js) || !isFinite(v.jsreq) ? NaN
      : v.js >= v.jsreq ? 'Jammed: the target is masked' : 'Burned through: the radar sees the target'),
    O('Sidelobe level used (G<sub>RJ</sub> − G<sub>M</sub>)', v => v.grj - v.gm, 'dB'),
    O('Target range / burn-through range', v => v.rt / v.rbt, '×'),
  ],
  note: 'J/S = EIRP<sub>J</sub> − EIRP<sub>R</sub> + 10·log 4π + 40·log R<sub>T</sub> − 20·log R<sub>J</sub> − 10·log σ + G<sub>RJ</sub> − G<sub>M</sub> − 10·log(B<sub>J</sub>/B<sub>R</sub>). Set G<sub>RJ</sub> = G<sub>M</sub> for a jammer in the main beam. Closer than the burn-through range the J/S is below the required value, so the radar sees the target. EIRP is referenced to an isotropic radiator (Adamy writes ERP for it); for a dipole-referenced ERP (dBd) add 2.15 dB. J/S does not change as long as both powers use the same reference.',
},

// ------------------------------------------------------ SINR / desense -----
{
  id: 'sinr', cat: 'ew', title: 'SINR & Desensitization',
  kw: 'sinr interference desensitization desense inr noise rise c/i co-channel',
  desc: 'Signal against noise plus an in-band interferer. Enter a required SINR to get the maximum tolerable interference.',
  vars: [
    dbV('s', 'Wanted signal S', -100, 'dBm'),
    dbV('n', 'Noise floor N', -115, 'dBm'),
    dbV('i', 'Interference I (in-band)', -117, 'dBm'),
    dbV('snr', 'SNR (no interference)'),
    dbV('inr', 'Interference-to-noise INR'),
    dbV('des', 'Desensitization (noise rise)', undefined, 'dB', { min: 0 }),
    dbV('sinr', 'SINR = S/(N + I)'),
  ],
  eqs: [
    E('snr', ['s', 'n'], v => v.s - v.n, { s: v => v.snr + v.n, n: v => v.s - v.snr }),
    E('inr', ['i', 'n'], v => v.i - v.n, { i: v => v.inr + v.n, n: v => v.i - v.inr }),
    E('des', ['inr'], v => b1Desense(v.inr), { inr: v => b1InrFor(v.des) }),
    E('sinr', ['snr', 'des'], v => v.snr - v.des, { snr: v => v.sinr + v.des, des: v => v.snr - v.sinr }),
  ],
  outputs: [
    O('Noise + interference power', v => dbp(fromDbp(v.n) + fromDbp(v.i)), 'dBm'),
    O('Carrier-to-interference C/I', v => v.s - v.i, 'dB'),
    O('Max interference for 1 dB / 3 dB desense', v => isFinite(v.n) ? fmt(v.n + b1InrFor(1), 5) + ' / ' + fmt(v.n + b1InrFor(3), 5) + ' dBm' : NaN),
  ],
  note: 'INR = I − N · desense = 10·log(1 + 10<sup>INR/10</sup>) · SINR = SNR − desense. An interferer at the noise level (INR = 0 dB) costs 3 dB; INR = −5.87 dB costs 1 dB.',
},

// --------------------------------------------- reciprocal mixing ---------
{
  id: 'recmix', cat: 'ew', title: 'Reciprocal Mixing & IF Leakage (Off-Channel Interferer)',
  kw: 'reciprocal mixing phase noise blocking desense adjacent channel selectivity interferer lo',
  desc: 'A strong off-channel signal reaches the IF through LO phase noise (reciprocal mixing) and through limited filter rejection. Solves the interference, the desense, the maximum interferer or the phase noise needed.',
  vars: [
    dbV('pi', 'Interferer level at the input', -30, 'dBm', { pri: -1 }),
    dbV('pn', 'LO phase noise at the interferer offset', -120, 'dBc/Hz'),
    fq('bif', 'IF noise bandwidth', 200e3, 'kHz'),
    dbV('rej', 'IF filter rejection at the offset', 70, 'dB'),
    dbV('c', 'Total coupling (interferer → IF)'),
    dbV('itot', 'Interference at the IF (input-referred)', undefined, 'dBm'),
    dbV('n', 'Receiver noise floor', -114.965, 'dBm'),
    dbV('inr', 'Interference-to-noise INR'),
    dbV('des', 'Desensitization', undefined, 'dB', { min: 0 }),
    dbV('sig', 'Wanted signal (optional, for SINR)', -100, 'dBm'),
  ],
  eqs: [
    E('c', ['pn', 'bif', 'rej'], v => b1Coupling(v.pn, v.bif, v.rej), {
      pn: v => dbp(fromDbp(v.c) - fromDbp(-v.rej)) - dbp(v.bif),
      rej: v => -dbp(fromDbp(v.c) - fromDbp(v.pn + dbp(v.bif))),
      bif: v => fromDbp(dbp(fromDbp(v.c) - fromDbp(-v.rej)) - v.pn),
    }),
    E('itot', ['pi', 'c'], v => v.pi + v.c, { pi: v => v.itot - v.c, c: v => v.itot - v.pi }),
    E('inr', ['itot', 'n'], v => v.itot - v.n, { itot: v => v.inr + v.n, n: v => v.itot - v.inr }),
    E('des', ['inr'], v => b1Desense(v.inr), { inr: v => b1InrFor(v.des) }),
  ],
  outputs: [
    O('Reciprocal-mixing part P<sub>I</sub> + L(Δf) + 10·log B', v => v.pi + v.pn + dbp(v.bif), 'dBm'),
    O('Filter-leakage part P<sub>I</sub> − rejection', v => v.pi - v.rej, 'dBm'),
    O('Dominant mechanism', v => !isFinite(v.pn) || !isFinite(v.rej) ? NaN : (v.pn + dbp(v.bif) > -v.rej ? 'Reciprocal mixing (improve LO phase noise)' : 'Filter leakage (improve selectivity)')),
    O('Max interferer for 1 dB / 3 dB desense', v => isFinite(v.n) && isFinite(v.c) ? fmt(v.n + b1InrFor(1) - v.c, 5) + ' / ' + fmt(v.n + b1InrFor(3) - v.c, 5) + ' dBm' : NaN),
    O('SINR of the wanted signal', v => v.sig - dbp(fromDbp(v.n) + fromDbp(v.itot)), 'dB'),
  ],
  note: 'Coupling C = 10·log(10<sup>(L(Δf) + 10·log B)/10</sup> + 10<sup>−Rej/10</sup>), I = P<sub>I</sub> + C, desense = 10·log(1 + 10<sup>(I−N)/10</sup>). Assumes the phase noise is flat across the IF bandwidth. Front-end compression and intermodulation (blocking through P1dB/IP3) are not modelled. Noise floor N = −174 + 10·log B + NF.',
},

// --------------------------------------------------- anti-jam margin -------
{
  id: 'ajmargin', cat: 'ew', title: 'Spread Spectrum: Processing Gain & Jamming Margin',
  kw: 'spread spectrum processing gain jamming margin anti-jam dsss fhss chip rate',
  desc: 'Processing gain and the J/S the link can tolerate. Paste the required SNR from the BER calculator.',
  vars: [
    fq('bss', 'Spread bandwidth / chip rate (FH: hop span)', 10e6, 'MHz'),
    uV('rb', 'Data rate (FH: channel bandwidth)', 'bps', 'kbps', 10e3),
    dbV('gp', 'Processing gain G<sub>p</sub>'),
    dbV('lsys', 'System / implementation losses', 2),
    dbV('snrreq', 'Required SNR after despreading', 10),
    dbV('mj', 'Jamming margin (max tolerable J/S)'),
    dbV('sig', 'Wanted signal at the receiver (optional)', -100, 'dBm'),
  ],
  eqs: [
    E('gp', ['bss', 'rb'], v => dbp(v.bss / v.rb), { bss: v => v.rb * fromDbp(v.gp), rb: v => v.bss / fromDbp(v.gp) }),
    E('mj', ['gp', 'lsys', 'snrreq'], v => v.gp - v.lsys - v.snrreq, {
      gp: v => v.mj + v.lsys + v.snrreq, lsys: v => v.gp - v.mj - v.snrreq, snrreq: v => v.gp - v.mj - v.lsys,
    }),
  ],
  outputs: [
    O('Max jammer power at the receiver', v => v.sig + v.mj, 'dBm'),
    O('Processing gain (linear)', v => fromDbp(v.gp), '×'),
  ],
  note: 'G<sub>p</sub> = 10·log(B<sub>ss</sub>/R<sub>b</sub>) (DSSS: chips per bit; FH: number of channels). M<sub>J</sub> = G<sub>p</sub> − (L<sub>sys</sub> + SNR<sub>req</sub>) is the largest J/S at which the link still works.',
},

// --------------------------------------------------- follower jammer -------
{
  id: 'follower', cat: 'ew', title: 'Follower Jammer vs Frequency Hopping',
  kw: 'follower jammer repeater frequency hopping fh hop rate dwell ellipse',
  desc: 'A follower jammer must find each new hop and reach the receiver before too much of the dwell has passed. Its extra path (via the jammer) and reaction time must fit inside that fraction.',
  vars: [
    posV('hr', 'Hop rate', 1000, 'hops/s'),
    linV('tset', 'Synthesizer settling per hop', 0, '', { unit: 's', du: 'µs', min: 0, max: 10 }),
    uV('tdw', 'Usable dwell per hop', 's', 'ms'),
    posV('eta', 'Allowed jammer delay as a fraction of the dwell (η)', 0.5, '', { sticky: true, min: 1e-9, max: 1 }),
    uV('tproc', 'Jammer reaction time (detect + tune)', 's', 'ms', 0.2e-3, { inMin: 0 }),
    // 0 is a valid input (jammer, or the transmitter, at another site); solving still needs min > 0
    lenV('dtj', 'Transmitter → jammer distance', 30e3, 'km', { inMin: 0 }),
    lenV('djr', 'Jammer → receiver distance', 30e3, 'km', { inMin: 0 }),
    lenV('dtr', 'Transmitter → receiver distance', 20e3, 'km', { inMin: 0 }),
    linV('xp', 'Extra path via the jammer', undefined, '', { unit: 'm', du: 'km', min: -1e12, max: 1e12 }),
    uV('dt', 'Jammer delay at the receiver', 's', 'µs', undefined, { inMin: 0 }),
    linV('xmax', 'Max extra path for an effective jammer', undefined, '', { unit: 'm', du: 'km', min: -1e12, max: 1e12 }),
    linV('margin', 'Time margin (η·dwell − delay)', undefined, '', { unit: 's', du: 'µs', min: -1e6, max: 1e6 }),
  ],
  eqs: [
    E('tdw', ['hr', 'tset'], v => 1 / v.hr - v.tset, { hr: v => 1 / (v.tdw + v.tset), tset: v => 1 / v.hr - v.tdw }),
    E('xp', ['dtj', 'djr', 'dtr'], v => v.dtj + v.djr - v.dtr, {
      dtj: v => v.xp - v.djr + v.dtr, djr: v => v.xp - v.dtj + v.dtr, dtr: v => v.dtj + v.djr - v.xp,
    }),
    E('dt', ['xp', 'tproc'], v => v.xp / C0 + v.tproc, { xp: v => (v.dt - v.tproc) * C0, tproc: v => v.dt - v.xp / C0 }),
    E('xmax', ['eta', 'tdw', 'tproc'], v => C0 * (v.eta * v.tdw - v.tproc), {
      eta: v => (v.xmax / C0 + v.tproc) / v.tdw, tdw: v => (v.xmax / C0 + v.tproc) / v.eta, tproc: v => v.eta * v.tdw - v.xmax / C0,
    }),
    E('margin', ['eta', 'tdw', 'dt'], v => v.eta * v.tdw - v.dt, {
      eta: v => (v.margin + v.dt) / v.tdw, tdw: v => (v.margin + v.dt) / v.eta, dt: v => v.eta * v.tdw - v.margin,
    }),
  ],
  outputs: [
    O('Verdict', v => !isFinite(v.margin) ? NaN : v.margin >= 0 ? 'Jammer is fast enough for this geometry'
      : v.xmax < 0 ? 'Jammer is too slow at any distance' : 'Jammer is too far away for this hop rate'),
    O('Delay as a fraction of the dwell', v => v.dt >= 0 ? 100 * v.dt / v.tdw : NaN, '%'),
    O('Part of each hop that is jammed', v => 100 * Math.min(1, Math.max(0, 1 - v.dt / v.tdw)), '%'),
  ],
  // real positions obey the triangle inequality, so 0 ≤ extra path ≤ 2·min(d_TJ, d_JR) and Δt ≥ t_proc
  warn: v => {
    if (isFinite(v.dtj) && isFinite(v.djr) && isFinite(v.dtr)) {
      const e = 1e-9 * Math.max(v.dtj, v.djr, v.dtr);
      if (v.dtj + v.djr < v.dtr - e || v.dtj + v.dtr < v.djr - e || v.djr + v.dtr < v.dtj - e)
        return '⚠ These three distances cannot form a triangle: each must be at most the sum of the other two (the extra path must lie between 0 and 2·min(d_TJ, d_JR)). The results are not physical.';
    }
    if (isFinite(v.dt) && isFinite(v.tproc) && v.dt < v.tproc * (1 - 1e-9)) return '⚠ The delay is shorter than the jammer reaction time, which needs a negative extra path: not physically possible.';
    return null;
  },
  note: 'Δt = (d<sub>TJ</sub> + d<sub>JR</sub> − d<sub>TR</sub>)/c + t<sub>proc</sub> must be ≤ η·T<sub>dwell</sub>. The jammer must lie inside the ellipse with foci at the transmitter and receiver whose distance sum is d<sub>TR</sub> + max extra path. η is your choice (for example 0.5 if jamming half of each hop is enough).',
},

// -------------------------------------------------------- LPI --------------
{
  id: 'lpi', cat: 'ew', title: 'Intercept Range vs Radar Detection Range (LPI)',
  kw: 'lpi low probability of intercept intercept range esm rwr schleher radar detection range',
  desc: 'Compares how far the radar sees a target (two-way) with how far an intercept receiver sees the radar (one-way). α < 1 means the radar detects before it is detected.',
  vars: [
    uV('pt', 'Radar peak power', 'W', 'kW', 100e3),
    dbV('gt', 'Radar transmit gain', 35, 'dBi'),
    dbV('gr', 'Radar receive gain', 35, 'dBi'),
    dbV('gti', 'Radar gain toward the intercept receiver', 35, 'dBi'),
    fq('f', 'Frequency', 10e9, 'GHz', { sticky: true }),
    uV('sigma', 'Target RCS σ', 'm2', 'm²', 5),
    dbV('sr', 'Radar sensitivity (min. detectable signal)', -97, 'dBm'),
    dbV('gi', 'Intercept receiver antenna gain', 0, 'dBi'),
    dbV('si', 'Intercept receiver sensitivity', -65, 'dBm'),
    lenV('rr', 'Radar detection range', undefined, 'km'),
    lenV('ri', 'Intercept range', undefined, 'km'),
    posV('alpha', 'Intercept factor α = R<sub>I</sub>/R<sub>R</sub>', undefined, '×'),
    lenV('hrad', 'Radar antenna height (horizon check)', 10, 'm', { inMin: 0 }),
    lenV('hint', 'Intercept antenna height (horizon check)', 10, 'm', { inMin: 0 }),
  ],
  eqs: [
    E('rr', ['pt', 'gt', 'gr', 'f', 'sigma', 'sr'],
      v => Math.pow(v.pt * b1PT(v.gt) * b1PT(v.gr) * Math.pow(b1Lam(v.f), 2) * v.sigma / (Math.pow(4 * PI, 3) * b1W(v.sr)), 0.25), {
      pt: v => Math.pow(v.rr, 4) * Math.pow(4 * PI, 3) * b1W(v.sr) / (b1PT(v.gt) * b1PT(v.gr) * Math.pow(b1Lam(v.f), 2) * v.sigma),
      sigma: v => Math.pow(v.rr, 4) * Math.pow(4 * PI, 3) * b1W(v.sr) / (v.pt * b1PT(v.gt) * b1PT(v.gr) * Math.pow(b1Lam(v.f), 2)),
      sr: v => b1Mw(v.pt * b1PT(v.gt) * b1PT(v.gr) * Math.pow(b1Lam(v.f), 2) * v.sigma / (Math.pow(4 * PI, 3) * Math.pow(v.rr, 4))),
    }),
    E('ri', ['pt', 'gti', 'gi', 'f', 'si'],
      v => sqrt(v.pt * b1PT(v.gti) * b1PT(v.gi) * Math.pow(b1Lam(v.f), 2) / (Math.pow(4 * PI, 2) * b1W(v.si))), {
      pt: v => v.ri * v.ri * Math.pow(4 * PI, 2) * b1W(v.si) / (b1PT(v.gti) * b1PT(v.gi) * Math.pow(b1Lam(v.f), 2)),
      si: v => b1Mw(v.pt * b1PT(v.gti) * b1PT(v.gi) * Math.pow(b1Lam(v.f), 2) / (Math.pow(4 * PI, 2) * v.ri * v.ri)),
    }),
    E('alpha', ['ri', 'rr'], v => v.ri / v.rr, { ri: v => v.alpha * v.rr, rr: v => v.ri / v.alpha }),
  ],
  outputs: [
    O('Verdict', v => !isFinite(v.alpha) ? NaN : v.alpha < 1 ? 'LPI: the radar detects the target before it is intercepted'
      : 'Not LPI: the radar can be intercepted at ' + fmt(v.alpha, 3) + '× its detection range'),
    O('Radio horizon (k = 4/3)', v => b1Horizon(v.hrad, v.hint), 'm', true),
  ],
  warn: v => isFinite(v.ri) && v.ri > b1Horizon(v.hrad, v.hint) ? '⚠ The intercept range exceeds the radio horizon (' + fmtSI(b1Horizon(v.hrad, v.hint), 'm', 4) + '): line of sight limits it in practice.' : null,
  note: 'R<sub>R</sub>⁴ = P<sub>t</sub>G<sub>t</sub>G<sub>r</sub>λ²σ/((4π)³S<sub>R</sub>) · R<sub>I</sub>² = P<sub>t</sub>G<sub>t→I</sub>G<sub>I</sub>λ²/((4π)²S<sub>I</sub>) · α = R<sub>I</sub>/R<sub>R</sub> (Schleher). No losses or processing gains are included; fold them into the sensitivities.',
},
);

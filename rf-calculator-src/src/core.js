'use strict';
// ============================================================================
// core.js - constants, number parsing/formatting, complex math, root finding
// and the "last unknown is calculated" solver engine. No DOM access here.
// ============================================================================

const C0 = 299792458;            // speed of light, m/s
const KB = 1.380649e-23;         // Boltzmann constant, J/K
const MU0 = 1.25663706212e-6;    // vacuum permeability, H/m
const EPS0 = 8.8541878128e-12;   // vacuum permittivity, F/m
const ETA0 = 376.730313668;      // free-space impedance, ohm
const R_EARTH = 6371e3;          // mean earth radius, m
const PI = Math.PI;
const log10 = Math.log10;
const sqrt = Math.sqrt;
const DB_NEPER = 20 / Math.LN10; // 8.6859 dB per neper

// ---------------------------------------------------------------- units ----
const UNITS = {
  Hz:   [['Hz', 1], ['kHz', 1e3], ['MHz', 1e6], ['GHz', 1e9], ['THz', 1e12]],
  m:    [['nm', 1e-9], ['µm', 1e-6], ['mm', 1e-3], ['cm', 1e-2], ['m', 1], ['km', 1e3],
         ['mil', 25.4e-6], ['in', 0.0254], ['ft', 0.3048], ['mi', 1609.344], ['nmi', 1852]],
  ohm:  [['mΩ', 1e-3], ['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
  H:    [['pH', 1e-12], ['nH', 1e-9], ['µH', 1e-6], ['mH', 1e-3], ['H', 1]],
  F:    [['fF', 1e-15], ['pF', 1e-12], ['nF', 1e-9], ['µF', 1e-6], ['mF', 1e-3], ['F', 1]],
  W:    [['pW', 1e-12], ['nW', 1e-9], ['µW', 1e-6], ['mW', 1e-3], ['W', 1], ['kW', 1e3], ['MW', 1e6]],
  V:    [['nV', 1e-9], ['µV', 1e-6], ['mV', 1e-3], ['V', 1], ['kV', 1e3]],
  s:    [['fs', 1e-15], ['ps', 1e-12], ['ns', 1e-9], ['µs', 1e-6], ['ms', 1e-3], ['s', 1]],
  m2:   [['mm²', 1e-6], ['cm²', 1e-4], ['m²', 1]],
  bps:  [['bps', 1], ['kbps', 1e3], ['Mbps', 1e6], ['Gbps', 1e9]],
  ohm_m:[['Ω·m', 1], ['µΩ·cm', 1e-8], ['nΩ·m', 1e-9]],
};

function unitFactor(unit, name) {
  const list = UNITS[unit];
  if (!list) return 1;
  const u = list.find(x => x[0] === name);
  return u ? u[1] : 1;
}

// ------------------------------------------------------- number parsing ----
const SI_PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3,
                    k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

// Accepts plain numbers, exponents, SI suffixes ("2.4G", "10n") and
// resistor-style infixes ("4k7" = 4700, "2p2" = 2.2e-12). Returns NaN if invalid.
function parseNum(text) {
  let s = String(text == null ? '' : text).trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
  if (s === '') return NaN;
  if (/^[+]?(inf|∞)$/i.test(s)) return Infinity;
  if (/^-(inf|∞)$/i.test(s)) return -Infinity;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
  let m = s.match(/^([+-]?\d+)([fpnuµμmkKMGT])(\d+)$/);
  if (m) return parseFloat(m[1] + '.' + m[3]) * SI_PREFIX[m[2]];
  m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([fpnuµμmkKMGT])$/);
  if (m) return parseFloat(m[1]) * SI_PREFIX[m[2]];
  return NaN;
}

const isPlainNumber = t => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(String(t));

// Parse a field entry. Understands, in this order:
//   a unit name   "2.4 GHz", "10mm", "4.7nH", "50 ohm"  -> absolute value, unit switches
//   an SI prefix  "2.4G", "4n7", "10p"                   -> absolute value in base units
//   a plain number "100"                                 -> in the currently selected unit
// A static symbol after the number ("3 dB", "290 K", "2:1") is ignored. A one-
// character symbol must match in case, so "1.2k" in a kelvin field is 1200 K.
// Unit names are matched exactly first; then an SI-prefixed number ("10f" in a
// capacitance field is 10 fF, not 10 F); then, case-insensitively, a unit name
// that is unambiguous ("2.4ghz"; "mw" vs "Mw" is decided by the prefix letter).
// Returns { val (base units), unit (unit name to switch to, or null) }.
function parseField(text, unitKey, curUnit, sym) {
  let s = String(text == null ? '' : text).trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
  if (s === '') return { val: NaN, unit: null };
  if (sym) {
    const ss = sym.replace(/\s+/g, '');
    const hit = ss.length === 1 ? s.endsWith(ss) : s.toLowerCase().endsWith(ss.toLowerCase());
    if (ss && s.length > ss.length && hit) s = s.slice(0, -ss.length);
  }
  if (!unitKey || !UNITS[unitKey]) return { val: parseNum(s), unit: null };
  const units = UNITS[unitKey];
  s = s.replace(/ohms?$/i, 'Ω');
  // 'NM' is the aviation / maritime nautical mile (nanometre is always 'nm')
  if (unitKey === 'm') s = s.replace(/NM$/, 'nmi');
  // ASCII area exponent: m2, cm2, mm^2, W/m2, mW/cm2 -> ²
  if (units.some(u => u[0].includes('²'))) s = s.replace(/m(?:\^|\*\*)?2$/, 'm²');
  // ASCII 'u' for micro: uH, um, uW/cm² ...
  for (const [name] of units) {
    const alt = name[0] === 'µ' ? 'u' + name.slice(1) : null;
    if (alt && s.length > alt.length && s.endsWith(alt)) { s = s.slice(0, -alt.length) + name; break; }
  }
  const list = units.slice().sort((a, b) => b[0].length - a[0].length);
  for (const [name, f] of list) {
    if (s.length > name.length && s.endsWith(name)) {
      const rest = s.slice(0, -name.length);
      const x = parseNum(rest);
      if (isNaN(x)) continue;
      // an SI prefix in front of an area ('10 km²' = 10·(1e3 m)²) is squared too;
      // in front of W/m² it scales the watts and stays linear
      const pre = /^[^/]*²$/.test(name) && rest.match(/\d\.?([fpnuµμmkKMGT])$/);
      return { val: pre ? x * SI_PREFIX[pre[1]] * f : x * f, unit: name };
    }
  }
  const m = s.match(/([fpnuµμmkKMGT])\d*$/);
  const isPlain = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
  const prefixed = () => {
    const pf = SI_PREFIX[m[1]];
    const u = units.find(e => Math.abs(e[1] / pf - 1) < 1e-9);
    return { val: parseNum(s), unit: u ? u[0] : null };
  };
  // a number with an SI prefix wins over a case-insensitive unit-name guess
  if (m && !isPlain && !isNaN(parseNum(s))) return prefixed();
  // case-insensitive fallback: the longest matching names; when several remain
  // (mW / MW), the prefix letter decides; it must leave exactly one unit
  let cands = [];
  for (const [name, f] of list) {
    if (cands.length && name.length < cands[0][0].length) break;
    if (s.length <= name.length || s.slice(-name.length).toLowerCase() !== name.toLowerCase()) continue;
    const x = parseNum(s.slice(0, -name.length));
    if (!isNaN(x)) cands.push([name, f, x]);
  }
  if (cands.length > 1) {
    const lead = s.slice(-cands[0][0].length)[0];
    cands = cands.filter(c => c[0][0] === lead);
  }
  if (cands.length === 1) return { val: cands[0][2] * cands[0][1], unit: cands[0][0] };
  if (cands.length > 1) return { val: NaN, unit: null };
  if (m && !isPlain) return { val: NaN, unit: null };
  return { val: parseNum(s) * unitFactor(unitKey, curUnit), unit: null };
}

// ----------------------------------------------------------- formatting ----
function fmt(x, sig) {
  sig = sig || 6;
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '-∞';
  if (typeof x !== 'number' || isNaN(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e9) {
    let s = x.toPrecision(sig);
    if (s.includes('e')) s = String(Number(s));
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s;
  }
  return x.toExponential(sig - 1).replace(/\.?0+e/, 'e').replace('e+', 'e');
}

const SI_STEPS = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'],
                  [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];

function fmtSI(x, unit, sig) {
  unit = unit || '';
  sig = sig || 5;
  if (typeof x !== 'number' || !isFinite(x)) return fmt(x) + (isNaN(x) ? '' : ' ' + unit);
  if (x === 0) return '0 ' + unit;
  // pick the prefix from the mantissa after rounding, so 999.6 MHz at 3 digits
  // prints as '1 GHz' and never as '1000 MHz'
  for (const [mul, p] of SI_STEPS) {
    if (Math.abs(Number((x / mul).toPrecision(sig))) >= 1) return fmt(x / mul, sig) + ' ' + p + unit;
  }
  return fmt(x / 1e-15, sig) + ' f' + unit;
}

// --------------------------------------------------------------- complex ---
// only an omitted imaginary part defaults to 0; a NaN one stays NaN so that
// invalid input is still detected downstream (and -0 becomes 0)
const cx = (re, im) => ({ re: re, im: im == null ? 0 : im + 0 });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
// Smith's (1962) division: no overflow / underflow of |b|² for huge or tiny b
const cdiv = (a, b) => {
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re, d = b.re + b.im * r;
    return cx((a.re + a.im * r) / d, (a.im - a.re * r) / d);
  }
  const r = b.re / b.im, d = b.re * r + b.im;
  return cx((a.re * r + a.im) / d, (a.im * r - a.re) / d);
};
const cabs = a => Math.hypot(a.re, a.im);
const cabs2 = a => a.re * a.re + a.im * a.im;
const carg = a => Math.atan2(a.im, a.re);
const cdeg = a => Math.atan2(a.im, a.re) * 180 / PI;
const cconj = a => cx(a.re, -a.im);
const cneg = a => cx(-a.re, -a.im);
const cscale = (a, k) => cx(a.re * k, a.im * k);
const cpol = (mag, deg) => cx(mag * Math.cos(deg * PI / 180), mag * Math.sin(deg * PI / 180));
const cinv = a => cdiv(cx(1, 0), a);
// principal square root, without cancellation for Re < 0 and without overflow
// near the top of the double range (inputs are scaled by their largest part)
const csqrt = a => {
  if (a.re === 0 && a.im === 0) return cx(0, 0);
  const s = Math.max(Math.abs(a.re), Math.abs(a.im));
  if (!isFinite(s)) return cx(NaN, NaN);
  const r = a.re / s, i = a.im / s;
  const t = sqrt(s) * sqrt((Math.abs(r) + Math.hypot(r, i)) / 2);
  return a.re >= 0 ? cx(t, a.im / (2 * t)) : cx(Math.abs(a.im) / (2 * t), (a.im < 0 ? -1 : 1) * t);
};
const CONE = cx(1, 0), CZERO = cx(0, 0);

// Gamma <-> impedance with real reference Z0 (an infinite impedance is an open, Γ = 1)
const zToGamma = (z, z0) => (isNaN(z.re) || isNaN(z.im) || isFinite(z.re) && isFinite(z.im))
  ? cdiv(csub(z, cx(z0)), cadd(z, cx(z0))) : cx(1, 0);
const gammaToZ = (g, z0) => cscale(cdiv(cadd(CONE, g), csub(CONE, g)), z0);

function fmtC(z, sig, unit) {
  sig = sig || 4;
  if (!z || !isFinite(z.re) || !isFinite(z.im)) return '—';
  const u = unit ? ' ' + unit : '';
  // suppress floating-point residue relative to the larger component
  const big = Math.max(Math.abs(z.re), Math.abs(z.im));
  const re = Math.abs(z.re) < 1e-12 * big ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-12 * big ? 0 : z.im;
  return fmt(re, sig) + (im < 0 ? ' − j' : ' + j') + fmt(Math.abs(im), sig) + u;
}
function fmtP(z, sig) {
  sig = sig || 4;
  if (!z || !isFinite(z.re) || !isFinite(z.im)) return '—';
  const m = cabs(z);
  return fmt(m < 1e-13 ? 0 : m, sig) + ' ∠ ' + fmt(m < 1e-13 ? 0 : cdeg(z), sig) + '°';
}

// ---------------------------------------------------- complex matrices -----
const mEye = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cx(i === j ? 1 : 0)));
const mMap = (A, f) => A.map((row, i) => row.map((a, j) => f(a, i, j)));
const mAdd = (A, B) => mMap(A, (a, i, j) => cadd(a, B[i][j]));
const mSub = (A, B) => mMap(A, (a, i, j) => csub(a, B[i][j]));
const mScale = (A, k) => mMap(A, a => cscale(a, k));
const mH = A => A[0].map((_, j) => A.map(row => cconj(row[j])));
const mT = A => A[0].map((_, j) => A.map(row => row[j]));
function mMul(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const R = [];
  for (let i = 0; i < n; i++) {
    R.push([]);
    for (let j = 0; j < m; j++) {
      let s = cx(0);
      for (let k = 0; k < p; k++) s = cadd(s, cmul(A[i][k], B[k][j]));
      R[i].push(s);
    }
  }
  return R;
}
// Gauss-Jordan inverse with partial pivoting; returns null when singular.
// The singularity test is relative to `scale` (default: the largest entry), so it
// does not depend on the units of the matrix; NaN pivots also count as singular.
// A caller that forms A by subtraction (I − S, I + S) passes the size of the
// operands as `scale`, so a matrix that is only cancellation residue (two ideal
// shorts: I + S = j1e-16·I) is singular, not a huge finite inverse.
function mInv(A, scale) {
  const n = A.length;
  const M = A.map((row, i) => row.concat(mEye(n)[i]));
  const tol = 1e-14 * Math.max(mMaxAbs(A), isFinite(scale) ? Math.abs(scale) : 0);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (cabs(M[r][c]) > cabs(M[piv][c])) piv = r;
    if (!(cabs(M[piv][c]) > tol)) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const p = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] = cdiv(M[c][j], p);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f.re === 0 && f.im === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] = csub(M[r][j], cmul(f, M[c][j]));
    }
  }
  return M.map(row => row.slice(n));
}
const mMaxAbs = A => Math.max(...A.flat().map(cabs));

// Real linear solve (Gaussian elimination), returns null if singular.
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 1e-300)) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x.every(isFinite) ? x : null;
}

// ------------------------------------------------------------ root find ----
function makeGrid(lo, hi, scale) {
  const pts = [];
  if (scale === 'log' && lo > 0) {
    const n = Math.max(200, Math.ceil(log10(hi / lo) * 25));
    for (let i = 0; i <= n; i++) pts.push(lo * Math.pow(hi / lo, i / n));
    pts[0] = lo; pts[n] = hi;   // the bounds themselves, free of rounding
  } else if (lo < 0 && hi > 0 && hi - lo > 2000) {
    // symmetric-log grid so that wide signed ranges are still sampled finely near 0
    const a = 1e-9, top = Math.max(-lo, hi);
    const n = Math.ceil(log10(top / a) * 25);
    const neg = [], pos = [];
    for (let i = 0; i <= n; i++) {
      const x = a * Math.pow(top / a, i / n);
      if (x < hi) pos.push(x);
      if (-x > lo) neg.push(-x);
    }
    // both bounds are always sampled (the last power step may round past them)
    pos.push(hi); neg.push(lo);
    pts.push(...neg.reverse(), 0, ...pos);
  } else {
    const n = 2000;
    for (let i = 0; i <= n; i++) pts.push(lo + (hi - lo) * i / n);
  }
  return pts;
}

const ROOT_TOL = 1e-7;

function refineRoot(g, a, b, ga, scale) {
  const useLog = scale === 'log' && a > 0 && b > 0;
  for (let i = 0; i < 200; i++) {
    const m = useLog ? sqrt(a * b) : (a + b) / 2;
    if (m === a || m === b) break;
    const gm = g(m);
    if (!isFinite(gm)) return null;
    if (gm === 0) { a = b = m; break; }
    if (ga * gm < 0) b = m; else { a = m; ga = gm; }
  }
  const r = useLog ? sqrt(a * b) : (a + b) / 2;
  const gr = g(r);
  // a sign change across a pole or a wrap-around jump is not a root
  return isFinite(gr) && Math.abs(gr) < ROOT_TOL ? r : null;
}

// Golden-section minimisation of |g| on [a, b]; catches tangent (double) roots
// such as solving for the point where a maximum is reached exactly.
function tangentRoot(g, a, b, scale) {
  const useLog = scale === 'log' && a > 0 && b > 0;
  const to = x => useLog ? Math.log(x) : x, from = u => useLog ? Math.exp(u) : u;
  const f = u => { const r = g(from(u)); return isFinite(r) ? Math.abs(r) : Infinity; };
  const k = (sqrt(5) - 1) / 2;
  let lo = to(a), hi = to(b);
  let c = hi - k * (hi - lo), d = lo + k * (hi - lo), fc = f(c), fd = f(d);
  for (let i = 0; i < 120; i++) {
    if (fc < fd) { hi = d; d = c; fd = fc; c = hi - k * (hi - lo); fc = f(c); }
    else { lo = c; c = d; fc = fd; d = lo + k * (hi - lo); fd = f(d); }
  }
  const u = (lo + hi) / 2;
  return f(u) < ROOT_TOL ? from(u) : null;
}

// In a grid cell [a, b] where g is finite at `a` only (domain edge or pole),
// move b towards a until g is finite: returns [x, g(x)] closest to the edge.
function finiteEdge(g, a, b, scale) {
  const useLog = scale === 'log' && a > 0 && b > 0;
  let ga = g(a);
  for (let i = 0; i < 200; i++) {
    const m = useLog ? sqrt(a * b) : (a + b) / 2;
    if (m === a || m === b) break;
    const gm = g(m);
    if (isFinite(gm)) { a = m; ga = gm; } else b = m;
  }
  return [a, ga];
}

const FLAT_TOL = 1e-12;

// Find a root of g on [lo, hi]. If several exist, return the one nearest `near`.
// If `info` is given, info.plateau = [a, b] reports that g is zero over a whole
// interval (the variable does not influence the equation there).
function findRoot(g, lo, hi, scale, near, info) {
  const xs = makeGrid(lo, hi, scale);
  const gs = xs.map(x => g(x));
  const n = xs.length;
  // plateaus: runs of grid points where the residual is (numerically) zero
  const flat = i => isFinite(gs[i]) && Math.abs(gs[i]) <= FLAT_TOL;
  const plateaus = [];
  for (let i = 0; i < n; i++) {
    if (!flat(i)) continue;
    let j = i;
    while (j + 1 < n && flat(j + 1)) j++;
    if (j > i) plateaus.push([xs[i], xs[j], xs[Math.max(0, i - 1)], xs[Math.min(n - 1, j + 1)]]);
    i = j;
  }
  const plateauOf = x => plateaus.find(p => x >= p[2] && x <= p[3]);
  const report = x => { const p = plateauOf(x); if (p && info) info.plateau = [p[0], p[1]]; return x; };
  // the previous value still satisfies the equation exactly: keep it
  if (isFinite(near) && near >= lo && near <= hi) {
    const gn = g(near);
    if (isFinite(gn) && Math.abs(gn) <= FLAT_TOL) return report(near);
  }
  const roots = [];
  for (let i = 0; i < n; i++) {
    const gx = gs[i];
    if (gx === 0) { roots.push(xs[i]); continue; }
    if (i > 0) {
      let a = xs[i - 1], b = xs[i], ga = gs[i - 1], gb = gx;
      // one end not finite (edge of the formula's domain, or a pole on a grid
      // point): shrink the cell to its finite part first
      if (isFinite(ga) !== isFinite(gb)) {
        if (isFinite(ga)) [b, gb] = finiteEdge(g, a, b, scale);
        else [a, ga] = finiteEdge(g, b, a, scale);
        if (Math.abs(isFinite(gs[i - 1]) ? gb : ga) < ROOT_TOL) roots.push(isFinite(gs[i - 1]) ? b : a);
      }
      if (isFinite(ga) && isFinite(gb) && ga !== 0 && gb !== 0 && ga * gb < 0) {
        const r = refineRoot(g, a, b, ga, scale);
        if (r !== null) roots.push(r);
      }
    }
    // local minimum of |g| without a sign change: possible tangent root
    if (i > 0 && i < n - 1 && isFinite(gx) && isFinite(gs[i - 1]) && isFinite(gs[i + 1]) &&
        !(gs[i - 1] === gx && gx === gs[i + 1]) &&
        Math.abs(gx) < 0.05 && Math.abs(gx) <= Math.abs(gs[i - 1]) && Math.abs(gx) <= Math.abs(gs[i + 1]) &&
        gs[i - 1] * gx > 0 && gs[i + 1] * gx > 0) {
      const r = tangentRoot(g, xs[i - 1], xs[i + 1], scale);
      if (r !== null) roots.push(r);
    }
  }
  if (!roots.length) return NaN;
  if (roots.length === 1 || !isFinite(near)) return report(roots[0]);
  const dist = r => (scale === 'log' && near > 0 && r > 0) ? Math.abs(Math.log(r / near)) : Math.abs(r - near);
  return report(roots.reduce((best, r) => dist(r) < dist(best) ? r : best, roots[0]));
}

// Damped Newton on a small block of coupled equations. F(xArr) -> residual array.
// tr[i] = 'log' solves in ln(x) so positive quantities stay positive.
// A guess is first tested as given (not via ln/exp, whose round-off alone can
// exceed the tolerance, e.g. start = centre − span/2 with centre ≫ start).
// A small residual is accepted only if the Newton step is small as well, and the
// step, the difference quotient and the residual scale (`rescale`, optional:
// x -> residual function scaled for the magnitudes at x) all follow the size of
// the values, so tiny linear unknowns and outputs (1e-12) are solved relatively.
// legacy = true iterates on the unscaled residual F0 with steps 1e-7·max(1, |u|):
// more robust from poor guesses for O(1) quantities. The final accept() still
// applies the scaled test, so a legacy result is never less accurate.
function newtonBlock(F0, tr, guesses, rescale, legacy) {
  const toU = (x, i) => tr[i] === 'log' ? Math.log(x) : x;
  const fromU = (u, i) => tr[i] === 'log' ? Math.exp(u) : u;
  const norm = r => Math.max(...r.map(Math.abs));
  // the solution passes the residual test with the scale taken at the solution itself
  const accept = x => { if (!rescale) return true; const r = rescale(x)(x); return r.every(isFinite) && norm(r) < 1e-9; };
  for (const g of guesses) {
    const F = rescale && !legacy ? rescale(g) : F0;
    const evalU = u => F(u.map(fromU));
    // magnitude of each solve variable: ln-space steps are relative already;
    // a linear unknown uses its own size (or the guess's), 1 only at 0
    const mag = (u, j) => (legacy || tr[j] === 'log') ? Math.max(1, Math.abs(u[j])) : (Math.max(Math.abs(u[j]), Math.abs(g[j])) || 1);
    const smallStep = (du, u) => du.every((d, j) => Math.abs(d) <= 1e-9 * mag(u, j));
    let u = g.map(toU);
    if (!u.every(isFinite)) continue;
    let x = g.slice(), r = F(x);
    if (!r.every(isFinite)) { x = u.map(fromU); r = evalU(u); }
    if (!r.every(isFinite)) continue;
    let done = false;
    for (let it = 0; it < 100; it++) {
      const nr = norm(r);
      const rb = it === 0 ? evalU(u) : r;   // Jacobian base in the solve variables
      const J = r.map(() => new Array(u.length));
      let ok = rb.every(isFinite);
      for (let j = 0; j < u.length && ok; j++) {
        const h = 1e-7 * mag(u, j);
        const up = u.slice(); up[j] += h;
        const rp = evalU(up);
        if (!rp.every(isFinite)) { ok = false; break; }
        for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - rb[i]) / h;
      }
      const du = ok ? solveLinear(J, r.map(x => -x)) : null;
      if (nr < 1e-11 && (!du || smallStep(du, u))) { done = true; break; }
      if (!du) break;
      let lam = 1, accepted = false;
      while (lam > 1e-6) {
        const un = u.map((x, i) => x + lam * du[i]);
        const rn = evalU(un);
        if (rn.every(isFinite) && norm(rn) < nr) { u = un; r = rn; x = un.map(fromU); accepted = true; break; }
        lam /= 2;
      }
      if (!accepted) break;
    }
    if ((done || norm(r) < 1e-9) && accept(x)) return x;
  }
  return null;
}

// ======================================================== solver engine ====
// A calculator is { vars:[...], eqs:[{out, ins, fn, inv}], ... }.
// Every equation reads   out = fn(v)   and can be solved for any of its variables:
// directly for `out`, by a closed-form inverse in `inv`, or numerically.
// Equations sharing unknowns that can't be solved one at a time are solved
// together as a block (Newton).

function E(out, ins, fn, inv) { return { out: out, ins: ins, fn: fn, inv: inv || {} }; }

function prepCalc(calc) {
  if (calc._prep) return calc;
  calc.byId = {};
  calc.vars.forEach((d, i) => { d.idx = i; calc.byId[d.id] = d; });
  calc.eqs = calc.eqs || [];
  calc.eqs.forEach(eq => { eq.vars = [eq.out].concat(eq.ins); });
  const inEq = new Set();
  calc.eqs.forEach(eq => eq.vars.forEach(id => inEq.add(id)));
  calc.eqVars = calc.vars.filter(d => inEq.has(d.id)).map(d => d.id);
  calc.freeVars = calc.vars.filter(d => !inEq.has(d.id)).map(d => d.id);
  calc.dof = calc.eqVars.length - calc.eqs.length;
  calc._prep = true;
  return calc;
}

// Scaled residual so tolerances work across magnitudes, dB values and angles.
// A linear value is compared relative to max(floor, |o|, |y|); `floor` (default 1,
// so dB values and angles near 0 have an absolute tolerance) comes from eqFloor.
function scaledDiff(y, o, d, floor) {
  if (!isFinite(y) || !isFinite(o)) return (y === o) ? 0 : NaN;
  if (d && d.wrap) {
    let r = (y - o) % d.wrap;
    if (r > d.wrap / 2) r -= d.wrap;
    if (r < -d.wrap / 2) r += d.wrap;
    return r / d.wrap;
  }
  if (d && d.scale === 'log') {
    if (y > 0 && o > 0) return Math.log(y / o);
    // an underflowed or non-positive value must never pass as "close enough"
    if (y === o) return 0;
    return y < o ? -Infinity : Infinity;
  }
  return (y - o) / Math.max(floor > 0 ? floor : 1, Math.abs(o), Math.abs(y));
}
function residual(calc, eq, v, floor) {
  let y;
  try { y = eq.fn(v); } catch (e) { return NaN; }
  return scaledDiff(y, v[eq.out], calc.byId[eq.out], floor);
}
// Absolute floor for the residual of a linear output: the size of the terms of
// out = fn(v), Σ |∂fn/∂x|·|x| over the inputs (a backward-error scale), at most 1.
// So an equation whose terms are all ~1e-12 is solved to relative accuracy, and
// a target of 0 is still judged against the terms that cancel to give it.
function eqFloor(calc, eq, v) {
  const d = calc.byId[eq.out];
  if (d && (d.wrap || d.scale === 'log')) return 1;
  try {
    const y0 = eq.fn(v);
    if (typeof y0 !== 'number' || !isFinite(y0)) return 1;
    let s = 0;
    for (const id of eq.ins) {
      const x = v[id];
      if (typeof x !== 'number' || !isFinite(x) || x === 0) continue;
      const w = Object.assign({}, v); w[id] = x * (1 + 1e-6);
      const y1 = eq.fn(w);
      if (typeof y1 === 'number' && isFinite(y1)) s += Math.abs(y1 - y0) / 1e-6;
    }
    return s > 0 && isFinite(s) ? Math.min(1, s) : 1;
  } catch (e) { return 1; }
}

const MAX_BLOCK = 8;   // largest block of coupled equations analyze() looks for

function combos(arr, k) {
  const out = [];
  const rec = (start, pick) => {
    if (pick.length === k) { out.push(pick.slice()); return; }
    for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); }
  };
  rec(0, []);
  return out;
}

// Structural analysis: in which order can the unknowns be solved, given the
// set of known (entered) variables? Reports over-determined equations.
function analyze(calc, known) {
  prepCalc(calc);
  const K = new Set(known);
  calc.freeVars.forEach(id => K.add(id));
  const used = calc.eqs.map(() => false);
  const steps = [];
  const unknownsOf = i => calc.eqs[i].vars.filter(id => !K.has(id));
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < calc.eqs.length; i++) {
      if (used[i]) continue;
      const u = unknownsOf(i);
      if (u.length === 1) {
        used[i] = true; K.add(u[0]); steps.push({ eqs: [i], vars: u }); progress = true;
      }
    }
    if (progress) continue;
    // smallest square block: k equations sharing exactly k unknowns
    const open = calc.eqs.map((_, i) => i).filter(i => !used[i] && unknownsOf(i).length > 0);
    const unk = open.map(unknownsOf);
    const pick = [];
    const findBlock = (k, start, uni) => {
      if (pick.length === k) return uni.size === k;
      for (let j = start; j < open.length; j++) {
        const nu = new Set(uni);
        unk[j].forEach(id => nu.add(id));
        if (nu.size > k) continue;   // the union only grows: prune
        pick.push(j);
        if (findBlock(k, j + 1, nu)) return true;
        pick.pop();
      }
      return false;
    };
    for (let k = 2; k <= Math.min(open.length, MAX_BLOCK); k++) {
      pick.length = 0;
      if (findBlock(k, 0, new Set())) {
        const set = pick.map(j => open[j]);
        const u = new Set();
        set.forEach(i => { used[i] = true; unknownsOf(i).forEach(id => u.add(id)); });
        u.forEach(id => K.add(id));
        steps.push({ eqs: set, vars: Array.from(u) });
        progress = true;
        break;
      }
    }
  }
  const conflicts = calc.eqs.map((_, i) => i).filter(i => !used[i] && unknownsOf(i).length === 0);
  const unknown = calc.eqVars.filter(id => !K.has(id));
  return { steps: steps, conflicts: conflicts, unknown: unknown };
}

// Each bound has its own tolerance (relative to that bound, at least 1e-9), so a
// huge max no longer relaxes the min. +∞ is allowed unless the range is entirely
// negative (max < 0), −∞ unless it is entirely positive (min > 0).
function inRange(d, x) {
  if (isNaN(x)) return false;
  if (d.finite && !isFinite(x)) return false;
  if (x === Infinity) return d.max === undefined || d.max >= 0;
  if (x === -Infinity) return d.min === undefined || d.min <= 0;
  const lo = d.min !== undefined ? d.min : -Infinity;
  const hi = d.max !== undefined ? d.max : Infinity;
  return x >= lo - 1e-9 * Math.max(1, Math.abs(lo)) && x <= hi + 1e-9 * Math.max(1, Math.abs(hi));
}

// Range a user may enter for a variable (the solver range unless the variable
// widens it with inMin / inMax, e.g. 0 on a log-scale variable).
const inputMin = d => d.inMin !== undefined ? d.inMin : d.min;
const inputMax = d => d.inMax !== undefined ? d.inMax : d.max;
const inputInRange = (d, x) => inRange({ min: inputMin(d), max: inputMax(d), finite: d.finite }, x);

// A value of a variable in its base unit, for messages ('2.5 GHz', '0 dB', '10 m²')
function fmtVarValue(d, x) {
  const u = d.unit && UNITS[d.unit] && UNITS[d.unit].find(e => e[1] === 1);
  // SI prefixes only on simple symbols (not on m², W/m², Ω·m ...)
  if (u && /^[A-Za-zΩ]+$/.test(u[0])) return fmtSI(x, u[0], 4).trim();
  const s = u ? u[0] : (d.sym || '').trim();
  return fmt(x, 4) + (s ? (s[0] === ':' ? '' : ' ') + s : '');
}
function inputRangeText(d) {
  const lo = inputMin(d), hi = inputMax(d);
  const f = x => fmtVarValue(d, x);
  if (lo !== undefined && isFinite(lo) && hi !== undefined && isFinite(hi)) return f(lo) + ' to ' + f(hi);
  if (lo !== undefined && isFinite(lo)) return '≥ ' + f(lo);
  if (hi !== undefined && isFinite(hi)) return '≤ ' + f(hi);
  return 'any value';
}

function solveSingle(calc, eq, x, v, near, notes) {
  const d = calc.byId[x];
  let r;
  try {
    if (x === eq.out) r = eq.fn(v);
    else if (eq.inv[x]) r = eq.inv[x](v);
    else {
      // residual floor from the size of the terms at a reference value of x
      const ref = [near, d.def, d.scale === 'log' && d.min > 0 && d.max < Infinity ? sqrt(d.min * d.max) : 1]
        .find(t => typeof t === 'number' && isFinite(t) && inRange(d, t));
      const fl = ref === undefined ? 1 : eqFloor(calc, eq, Object.assign({}, v, { [x]: ref }));
      const g = t => { const w = Object.assign({}, v); w[x] = t; return residual(calc, eq, w, fl); };
      const info = {};
      r = findRoot(g, d.min, d.max, d.scale, near, info);
      if (info.plateau && notes && inRange(d, r)) notes.push({ id: x, plateau: info.plateau });
    }
  } catch (e) { r = NaN; }
  if (typeof r !== 'number' || !inRange(d, r)) return NaN;
  // a closed-form inverse may hit an invalid branch; double-check it
  if (x !== eq.out && isFinite(r)) {
    const w = Object.assign({}, v); w[x] = r;
    const res = residual(calc, eq, w, eqFloor(calc, eq, w));
    if (!(Math.abs(res) < 1e-6)) return NaN;
  }
  return r;
}

function solveBlock(calc, eqIdx, xs, v, prev) {
  const tr = xs.map(id => calc.byId[id].scale === 'log' ? 'log' : 'lin');
  const at = arr => { const w = Object.assign({}, v); xs.forEach((id, i) => { w[id] = arr[i]; }); return w; };
  // residuals scaled by the size of each equation's terms at the point x0
  const rescale = x0 => {
    const w0 = at(x0), fl = eqIdx.map(i => eqFloor(calc, calc.eqs[i], w0));
    return arr => { const w = at(arr); return eqIdx.map((i, k) => residual(calc, calc.eqs[i], w, fl[k])); };
  };
  const F = arr => { const w = at(arr); return eqIdx.map(i => residual(calc, calc.eqs[i], w)); };
  const guesses = [];
  const pushG = obj => { if (obj) guesses.push(xs.map(id => obj[id])); };
  pushG(prev);
  if (calc.guess) { try { pushG(calc.guess(v)); } catch (e) { /* ignore */ } }
  const defs = {};
  xs.forEach(id => { defs[id] = calc.byId[id].def; });
  pushG(defs);
  for (const m of [1, 10, 0.1, 100, 0.01, 1000, 1e-3]) {
    for (const s of [1, -1]) {
      guesses.push(xs.map(id => calc.byId[id].scale === 'log' ? m : s * m));
    }
  }
  const gs = guesses.filter(g => g.every(x => typeof x === 'number' && isFinite(x)));
  // scaled solve first; if no guess converges, retry the classic absolute iteration
  // (still checked with the scaled residual at the solution)
  const sol = newtonBlock(F, tr, gs, rescale) || newtonBlock(F, tr, gs, rescale, true);
  if (!sol) return null;
  const out = {};
  for (let i = 0; i < xs.length; i++) {
    if (!inRange(calc.byId[xs[i]], sol[i])) return null;
    out[xs[i]] = sol[i];
  }
  return out;
}

// ------------------------------------------------------- state handling ----
// st = { vals, status, t, unit, text, cfg, clock, prev }
// status: 'in' (user entered) | 'calc' (calculated) | 'empty' | 'err'
function calcInit(calc) {
  prepCalc(calc);
  const st = { vals: {}, status: {}, t: {}, unit: {}, text: {}, cfg: {}, clock: 1, prev: {} };
  for (const d of calc.vars) {
    st.unit[d.id] = d.du || null;
    st.t[d.id] = 0;
    if (d.def !== undefined) { st.vals[d.id] = d.def; st.status[d.id] = 'in'; }
    else { st.vals[d.id] = NaN; st.status[d.id] = 'empty'; }
  }
  for (const c of (calc.cfg || [])) st.cfg[c.id] = c.def;
  calcSolve(calc, st);
  return st;
}

const enteredEq = (calc, st) => calc.eqVars.filter(id => st.status[id] === 'in' && !isNaN(st.vals[id]));

// Order in which entered values get demoted to "calculated": non-sticky first,
// then least recently edited, then lowest priority, then the later variable.
function demoteOrder(calc, st, ids) {
  return ids.slice().sort((a, b) => {
    const da = calc.byId[a], db = calc.byId[b];
    return ((da.sticky ? 1 : 0) - (db.sticky ? 1 : 0)) ||
      (st.t[a] - st.t[b]) || ((da.pri || 0) - (db.pri || 0)) || (db.idx - da.idx);
  });
}

// Remove over-determination by turning the oldest suitable inputs into outputs.
// When this is the last demotion needed, prefer (in the same order) an input
// whose demotion leaves a set the engine can actually solve.
function reduceOver(calc, st, protect) {
  for (let guard = 0; guard < 64; guard++) {
    const ent = enteredEq(calc, st);
    const a = analyze(calc, ent);
    const over = ent.length - calc.dof;
    if (!a.conflicts.length && over <= 0) return;
    const cands = demoteOrder(calc, st, ent.filter(id => id !== protect));
    if (!cands.length) return;
    let pick = null;
    if (over === 1) {
      for (const c of cands) {
        const a2 = analyze(calc, ent.filter(id => id !== c));
        if (!a2.conflicts.length && !a2.unknown.length) { pick = c; break; }
      }
    }
    if (!pick) for (const c of cands) {
      const a2 = analyze(calc, ent.filter(id => id !== c));
      if (a2.conflicts.length < a.conflicts.length || (!a.conflicts.length && !a2.conflicts.length)) { pick = c; break; }
    }
    st.status[pick || cands[0]] = 'calc';
  }
}

// User typed a value (val finite) or cleared the field (val NaN).
function calcEdit(calc, st, id, val, text) {
  prepCalc(calc);
  const isEq = calc.eqVars.includes(id);
  if (isNaN(val)) {
    // Clearing a field of a fully solved calculator makes it the target:
    // the previously calculated values are kept as inputs.
    const complete = calc.eqVars.every(k => st.status[k] === 'in' || st.status[k] === 'calc');
    if (isEq && complete && st.status[id] === 'in') {
      const minT = Math.min(...calc.eqVars.map(k => st.t[k]));
      for (const k of calc.eqVars) {
        if (k !== id && st.status[k] === 'calc' && !isNaN(st.vals[k])) {
          st.status[k] = 'in';
          st.t[k] = minT - 1;
          st.text[k] = null;
        }
      }
    }
    if (!isNaN(st.vals[id])) st.prev[id] = st.vals[id];
    st.status[id] = 'empty';
    st.vals[id] = NaN;
    st.text[id] = null;
    if (isEq) reduceOver(calc, st, null);
  } else {
    st.status[id] = 'in';
    st.vals[id] = val;
    st.text[id] = text == null ? null : text;
    st.t[id] = ++st.clock;
    if (isEq) reduceOver(calc, st, id);
  }
  calcSolve(calc, st);
  return st;
}

// Set several inputs at once (e.g. picking a material preset).
function calcSetMany(calc, st, obj) {
  prepCalc(calc);
  for (const id in obj) {
    st.status[id] = 'in';
    st.vals[id] = obj[id];
    st.text[id] = null;
    st.t[id] = ++st.clock;
  }
  for (const id in obj) if (calc.eqVars.includes(id)) reduceOver(calc, st, id);
  calcSolve(calc, st);
  return st;
}

function calcSolve(calc, st) {
  prepCalc(calc);
  for (const id of calc.eqVars) if (!isNaN(st.vals[id])) st.prev[id] = st.vals[id];
  const ent = enteredEq(calc, st);
  const v = { $: st.cfg };
  for (const d of calc.vars) {
    if (st.status[d.id] === 'in') v[d.id] = st.vals[d.id];
    else if (calc.freeVars.includes(d.id)) v[d.id] = NaN;
  }
  for (const id of calc.eqVars) if (st.status[id] !== 'in') { st.status[id] = 'empty'; st.vals[id] = NaN; }
  const a = analyze(calc, ent);
  const errs = [], notes = [];
  for (const step of a.steps) {
    const needs = new Set();
    step.eqs.forEach(i => calc.eqs[i].vars.forEach(id => { if (!step.vars.includes(id)) needs.add(id); }));
    const blocked = Array.from(needs).some(id => isNaN(v[id]));
    let result = null;
    if (!blocked) {
      if (step.vars.length === 1) {
        const x = step.vars[0];
        const r = solveSingle(calc, calc.eqs[step.eqs[0]], x, v, st.prev[x], notes);
        if (!isNaN(r)) result = { [x]: r };
      } else {
        result = solveBlock(calc, step.eqs, step.vars, v, st.prev);
      }
    }
    for (const x of step.vars) {
      if (result) { v[x] = result[x]; st.vals[x] = result[x]; st.status[x] = 'calc'; }
      else { v[x] = NaN; st.vals[x] = NaN; st.status[x] = 'err'; if (!blocked) errs.push(x); }
    }
  }
  // entered values outside the range a user may enter (the UI normally refuses
  // them; presets or restored state can still bring them in): name the input
  st.badIn = calc.vars.filter(d => st.status[d.id] === 'in' && !isNaN(st.vals[d.id]) &&
    !inputInRange(d, st.vals[d.id])).map(d => d.id);
  // message
  let msg = '', level = '';
  if (st.badIn.length) {
    msg = st.badIn.map(id => plainLabel(calc.byId[id]) + ' is out of range (valid: ' +
          inputRangeText(calc.byId[id]) + ')').join('; ') + '.';
    if (errs.length) msg += ' No valid solution for ' + errs.map(id => plainLabel(calc.byId[id])).join(', ') + '.';
    level = 'err';
  } else if (errs.length) {
    msg = 'No valid solution for ' + errs.map(id => plainLabel(calc.byId[id])).join(', ') +
          ' with these inputs (out of range or physically impossible).';
    level = 'err';
  } else if (notes.length && !a.unknown.length && !a.conflicts.length) {
    msg = notes.map(n => {
      const d = calc.byId[n.id];
      return plainLabel(d) + ' is not determined by the other inputs: any value from ' +
        fmtVarValue(d, n.plateau[0]) + ' to ' + fmtVarValue(d, n.plateau[1]) + ' gives the same result';
    }).join('; ') + '. The value shown is the previous one (or the nearest such value).';
    level = 'info';
  } else if (a.unknown.length) {
    const need = calc.dof - ent.length;
    msg = need > 0
      ? 'Enter ' + need + ' more value' + (need > 1 ? 's' : '') + ' to calculate the rest.'
      : 'This combination of inputs cannot be solved directly. Clear a different field.';
    level = 'info';
  } else if (a.conflicts.length) {
    msg = 'Over-determined: too many values entered.';
    level = 'err';
  }
  st.msg = msg;
  st.msgLevel = level;
  st.v = v;
  return st;
}

function plainLabel(d) {
  const l = typeof d.label === 'function' ? d.label({}) : d.label;
  return String(l).replace(/<[^>]+>/g, '');
}

// Value object for outputs: every variable (NaN when unknown) plus config.
function calcValues(calc, st) {
  const v = { $: st.cfg };
  for (const d of calc.vars) v[d.id] = st.vals[d.id];
  return v;
}

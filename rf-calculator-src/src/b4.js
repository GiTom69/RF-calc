// ============================================================================
// b4.js - phase 2, batch 4: mismatch uncertainty, terminated line, stub
// matching, stripline, coplanar waveguide (CPW / grounded CPW) and
// edge-coupled microstrip. Pure code (no DOM).
// ============================================================================

// ---------------------------------------------------------- elliptic K ----
// K(k)/K(k') via the arithmetic-geometric mean: K(k) = π/(2·AGM(1, k')).
function b4Agm(a, b) {
  for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) { const t = (a + b) / 2; b = sqrt(a * b); a = t; }
  return (a + b) / 2;
}
// ratio K(k)/K(k'), with k' = √(1 − k²); kp may be passed for accuracy near k = 1
function b4KK(k, kp) {
  if (kp === undefined) kp = sqrt(Math.max(0, 1 - k * k));
  if (!(k > 0)) return 0;
  if (!(kp > 0)) return Infinity;
  return b4Agm(1, k) / b4Agm(1, kp);
}
// K(k)/K(k') from k and ln k' (k' may underflow for very wide strips):
// for k' → 0, K(k)/K(k') → (2/π)·ln(4/k').
function b4KKlog(k, lkp) {
  if (lkp < -600) return 2 / PI * (Math.log(4) - lkp);
  return b4KK(k, Math.exp(lkp));
}
// ln sinh x and ln cosh x for x > 0 without overflow or loss of precision
const b4Lsh = x => x + Math.log(-Math.expm1(-2 * x)) - Math.LN2;
const b4Lch = x => x + Math.log1p(Math.exp(-2 * x)) - Math.LN2;

// --------------------------------------------------- terminated line ------
// tan θ with θ in degrees, reduced modulo 180° first. Within rounding of a
// multiple of 180° it is exactly 0, so a λ/2 line repeats the load exactly
// (Math.tan(π) = −1.2e-16 would leave a spurious reactance).
function b4TanDeg(deg) {
  const r = deg - 180 * Math.round(deg / 180);
  if (Math.abs(r) <= 1e-13 * Math.max(180, Math.abs(deg))) return 0;
  return Math.tan(r * PI / 180);
}
// Lossless line: Zin = Z0·(ZL + jZ0·t)/(Z0 + jZL·t), t = tan θ
function b4Zin(z0, zl, deg) {
  const t = b4TanDeg(deg);
  if (t === 0) return cx(zl.re, zl.im);
  if (!isFinite(t) || Math.abs(t) > 1e15) return cdiv(cx(z0 * z0), zl);
  return cscale(cdiv(cadd(zl, cx(0, z0 * t)), cadd(cx(z0), cmul(cx(0, t), zl))), z0);
}
// inverse: the load that produces Zin
function b4ZlFromZin(z0, zin, deg) {
  const t = b4TanDeg(deg);
  if (t === 0) return cx(zin.re, zin.im);
  if (!isFinite(t) || Math.abs(t) > 1e15) return cdiv(cx(z0 * z0), zin);
  return cscale(cdiv(csub(zin, cx(0, z0 * t)), csub(cx(z0), cmul(cx(0, t), zin))), z0);
}

// ---------------------------------------------------- single stub ---------
// Stub matching of ZL to a line Z0 (Pozar 5.2), stub characteristic impedance zs.
// type: 'shunt-short' | 'shunt-open' | 'series-short' | 'series-open'.
// Returns up to two solutions: bd, bl = electrical distance / stub length (rad, 0..pi).
function b4StubMatch(z0, zl, zs, type) {
  const series = type.indexOf('series') === 0, open = type.slice(-4) === 'open';
  const zn = cscale(zl, 1 / z0);
  // Shunt: normalised load impedance w = zL, choose d so that Re(y_d) = 1.
  // Series: the dual problem, w = yL, choose d so that Re(z_d) = 1 (same formula).
  const w = series ? cinv(zn) : zn;
  const r = w.re, x = w.im;
  const ts = [];
  if (Math.abs(r - 1) < 1e-12) { ts.push(-x / 2); ts.push(Infinity); }
  else {
    const q = r * ((1 - r) * (1 - r) + x * x);
    if (!(q >= 0)) return [];
    // roots of (r−1)t² − 2xt + (r − r² − x²) = 0 without cancellation: the larger
    // one directly, the smaller one from the product t₁t₂ = (r² + x² − r)/(1 − r)
    const big = (x + (x < 0 ? -1 : 1) * sqrt(q)) / (r - 1);
    const small = big === 0 ? 0 : (r * r + x * x - r) / ((1 - r) * big);
    ts.push(x < 0 ? small : big);
    ts.push(x < 0 ? big : small);
  }
  const sols = [];
  for (let t of ts) {
    // a load already on the g = 1 (r = 1) circle needs d = 0: snap the rounding
    // residue so it cannot show up as 3e-17 λ or wrap round to λ/2
    if (isFinite(t) && Math.abs(t) < 1e-12) t = 0;
    let bd = isFinite(t) ? Math.atan(t) : PI / 2;
    if (bd < 0) bd += PI;
    // w moves along the line the same way for z and y: w_d = (w + jt)/(1 + jwt)
    const wd = isFinite(t) ? cdiv(cadd(w, cx(0, t)), cadd(CONE, cmul(cx(0, t), w))) : cinv(w);
    const dual = cinv(wd);          // = 1 + j*im (normalised y_d for shunt, z_d for series)
    const im = dual.im;
    let arg;                        // required tan(bl) so that the stub cancels j*im
    if (!series) arg = open ? -im * zs / z0 : z0 / (im * zs);
    else arg = open ? zs / (im * z0) : -im * z0 / zs;
    let bl = isFinite(arg) ? Math.atan(arg) : PI / 2;
    if (bl < -1e-15) bl += PI;
    if (Math.abs(bl) < 1e-15) bl = 0;
    // verify with physical impedances
    const zd = cscale(series ? dual : wd, z0);   // impedance looking into the line at d
    let zin;
    if (!series) {
      const ystub = open ? cx(0, Math.tan(bl) / zs) : cx(0, -1 / (zs * Math.tan(bl)));
      zin = cinv(cadd(cinv(zd), ystub));
    } else {
      const zstub = open ? cx(0, -zs / Math.tan(bl)) : cx(0, zs * Math.tan(bl));
      zin = cadd(zd, zstub);
    }
    sols.push({ bd: bd, bl: bl, im: im, gd: zToGamma(zd, z0), gres: cabs(zToGamma(zin, z0)),
      stub: series ? -im * z0 : -im / z0 });   // stub reactance (ohm) or susceptance (S)
  }
  return sols;
}

// ---------------------------------------------------------- stripline -----
// Symmetric stripline, Wheeler (1978) with strip thickness (Wadell §3.5.1).
// W strip width, b ground-plane spacing, t strip thickness.
function b4Stripline(W, b, t, er) {
  t = t > 0 ? t : 0;
  if (!(W > 0 && b > t)) return NaN;
  const x = t / b;
  let Wp = W;
  if (x > 0) {
    const m = 2 / (1 + (2 / 3) * x / (1 - x));
    const dW = (b - t) * (x / (PI * (1 - x))) * (1 - 0.5 * Math.log(Math.pow(x / (2 - x), 2) + Math.pow(0.0796 * x / (W / b + 1.1 * x), m)));
    Wp = W + dW;
  }
  const n = (b - t) / Wp;
  const a = (8 / PI) * n;
  return ETA0 / (4 * PI * sqrt(er)) * Math.log(1 + (4 / PI) * n * (a + sqrt(a * a + 6.27)));
}
// exact zero-thickness stripline (Cohn): Z0 = (η0/4√εr)·K(k)/K(k'), k = sech(πW/2b)
function b4StriplineCohn(W, b, er) {
  const u = PI * W / (2 * b);
  return ETA0 / (4 * sqrt(er)) * b4KK(1 / Math.cosh(u), Math.tanh(u));
}

// ----------------------------------------------------------- CPW ----------
// Conformal mapping, zero-thickness conductors, infinitely wide side grounds
// (Simons, "Coplanar Waveguide Circuits, Components and Systems", §2.2 / §2.4).
// W centre strip width, s slot width, h substrate thickness.
// The complementary moduli are evaluated in closed form, so that wide strips
// (k → 1) neither lose precision in √(1 − k²) nor overflow sinh:
//   k₀′ = 2√(s(W+s))/(W+2s), k₁′ = √(sinh(b−a)·sinh(b+a))/sinh b,
//   k₃′ = √(sinh(b−a)·sinh(b+a))/(cosh a·sinh b), a = πW/4h, b = π(W+2s)/4h.
const b4K0 = (W, s) => b4KK(W / (W + 2 * s), 2 * sqrt(s * (W + s)) / (W + 2 * s));
function b4Cpw(W, s, h, er) {
  const a = PI * W / (4 * h), b = PI * (W + 2 * s) / (4 * h);
  const k1 = Math.exp(b4Lsh(a) - b4Lsh(b));
  const r0 = b4K0(W, s);                   // K(k)/K(k')
  const r1 = b4KKlog(k1, 0.5 * (b4Lsh(b - a) + b4Lsh(b + a)) - b4Lsh(b));
  const ee = 1 + (er - 1) / 2 * r1 / r0;
  return { z0: 30 * PI / sqrt(ee) / r0, ee: ee };
}
// conductor-backed (grounded) CPW: ground plane at distance h below
function b4Gcpw(W, s, h, er) {
  const a = PI * W / (4 * h), b = PI * (W + 2 * s) / (4 * h);
  const k3 = Math.tanh(a) / Math.tanh(b);
  const r0 = b4K0(W, s);
  const r3 = b4KKlog(k3, 0.5 * (b4Lsh(b - a) + b4Lsh(b + a)) - b4Lch(a) - b4Lsh(b));
  const q = r3 / r0;
  const ee = (1 + er * q) / (1 + q);
  return { z0: 60 * PI / sqrt(ee) / (r0 + r3), ee: ee };
}

// ------------------------------------------------- coupled microstrip -----
// Edge-coupled microstrip, static even/odd mode values, Kirschning & Jansen
// (IEEE MTT-32, 1984), zero strip thickness. u = W/h, g = s/h.
function b4Coupled(W, s, h, er) {
  const u = W / h, g = s / h;
  const single = microstrip(W, h, 0, er);
  const z0 = single.z0, ee = single.ee;
  // even-mode effective permittivity
  const v = u * (20 + g * g) / (10 + g * g) + g * Math.exp(-g);
  const ae = 1 + Math.log((Math.pow(v, 4) + Math.pow(v / 52, 2)) / (Math.pow(v, 4) + 0.432)) / 49 + Math.log(1 + Math.pow(v / 18.1, 3)) / 18.7;
  const be = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  const eee = (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 10 / v, -ae * be);
  // odd-mode effective permittivity
  const ao = 0.7287 * (ee - (er + 1) / 2) * (1 - Math.exp(-0.179 * u));
  const bo = 0.747 * er / (0.15 + er);
  const co = bo - (bo - 0.207) * Math.exp(-0.414 * u);
  const dd = 0.593 + 0.694 * Math.exp(-0.562 * u);
  const eeo = ((er + 1) / 2 + ao - ee) * Math.exp(-co * Math.pow(g, dd)) + ee;
  // impedances
  const Q1 = 0.8695 * Math.pow(u, 0.194);
  const Q2 = 1 + 0.7519 * g + 0.189 * Math.pow(g, 2.31);
  const Q3 = 0.1975 + Math.pow(16.6 + Math.pow(8.4 / g, 6), -0.387) + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 3.4, 10))) / 241;
  const Q4 = 2 * Q1 / Q2 / (Math.exp(-g) * Math.pow(u, Q3) + (2 - Math.exp(-g)) * Math.pow(u, -Q3));
  const Q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * Math.pow(g, 2.43)));
  const Q6 = 0.2305 + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 5.8, 10))) / 281.3 + Math.log(1 + 0.598 * Math.pow(g, 1.154)) / 5.1;
  const Q7 = (10 + 190 * g * g) / (1 + 82.3 * Math.pow(g, 3));
  const Q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - Math.pow(g / 0.15, 5));
  const Q9 = Math.log(Q7) * (Q8 + 1 / 16.5);
  const Q10 = Q4 - Q5 / Q2 * Math.exp(Q6 * Math.log(u) * Math.pow(u, -Q9));
  const ze = z0 * sqrt(ee / eee) / (1 - z0 / ETA0 * sqrt(ee) * Q4);
  const zo = z0 * sqrt(ee / eeo) / (1 - z0 / ETA0 * sqrt(ee) * Q10);
  return { ze: ze, zo: zo, eee: eee, eeo: eeo, z0: z0, ee: ee };
}

// ======================================================= calculators ======
const b4SubCfg = (withTand, def) => [{ id: 'sub', label: 'Substrate preset', def: def || '0',
  options: SUBSTRATES.map((s, i) => [String(i), s.name + ' (εr ' + s.er + ', tanδ ' + s.tand + ')']).concat([['custom', 'Custom']]),
  set: val => val === 'custom' ? {} : withTand ? { er: SUBSTRATES[+val].er, tand: SUBSTRATES[+val].tand } : { er: SUBSTRATES[+val].er } }];
// quasi-TEM dielectric loss in dB/m: (π f/c)·(εr/√εeff)·q·tanδ, with the filling
// factor q = (εeff − 1)/(εr − 1). eeOf(εr) gives the line's εeff. As εr → 1, q
// tends to the geometric filling factor (not 1), so for εr − 1 < 1e-6 it is
// evaluated at εr = 1 + 1e-6 (stripline, εeff = εr, keeps q = 1). Values just
// below 1 (accepted by the range tolerance) use the same clamp, never NaN.
function b4LossD(f, er, eeOf, tand) {
  if (!(f > 0) || !(tand >= 0) || !(er > 0)) return NaN;
  const e = er - 1 < 1e-6 ? 1 + 1e-6 : er;
  const q = (eeOf(e) - 1) / (e - 1);
  return DB_NEPER * PI * f / C0 * er / sqrt(eeOf(er)) * q * tand;
}
// atanh|Γ| with |Γ| = 1 giving ∞ (Math.atanh(1) is already ∞)
const b4Atanh = g => Math.atanh(Math.min(1, g));
const b4GammaL = v => zToGamma(cx(v.RL, v.XL), v.Z0);
const b4GammaIn = v => zToGamma(cx(v.Rin, v.Xin), v.Z0);
// |Γ| of R + jX on Z0 as √(((R−Z0)² + X²)/((R+Z0)² + X²)): exactly 1 for R = 0
const b4GammaMag = (R, X, z0) => sqrt(((R - z0) * (R - z0) + X * X) / ((R + z0) * (R + z0) + X * X));

CALCS.push(
{
  id: 'mmunc', cat: 'mismatch', title: 'Mismatch Uncertainty', kw: 'mismatch uncertainty vswr power measurement error source load sensor ripple',
  desc: 'Two mismatched ports connected together, e.g. a source and a load, or a power sensor and the DUT. The phase between Γ₁ and Γ₂ is unknown, so the delivered power lies between two limits. Enter the two VSWRs (or return losses, or |Γ|).',
  vars: [
    posV('vswr1', 'Port 1 (source / analyser) VSWR', 1.5, ': 1', { min: 1, max: 1e12 }),
    dbV('rl1', 'Port 1 return loss', undefined, 'dB', { min: 0 }),
    linV('g1', 'Port 1 |Γ₁|', undefined, '', { min: 0, max: 1 }),
    posV('vswr2', 'Port 2 (load / DUT) VSWR', 2, ': 1', { min: 1, max: 1e12 }),
    dbV('rl2', 'Port 2 return loss', undefined, 'dB', { min: 0 }),
    linV('g2', 'Port 2 |Γ₂|', undefined, '', { min: 0, max: 1 }),
    linV('gp', 'Product |Γ₁|·|Γ₂|', undefined, '', { min: 0, max: 1 }),
    dbV('up', 'Uncertainty, upper limit 20·log(1 + |Γ₁Γ₂|)', undefined, 'dB', { min: 0 }),
    dbV('lo', 'Uncertainty, lower limit 20·log(1 − |Γ₁Γ₂|)', undefined, 'dB', { max: 0 }),
    dbV('mlnom', 'Mismatch loss ignoring phase', undefined, 'dB', { min: 0 }),
    dbV('mlmin', 'Total mismatch loss, best phase', undefined, 'dB', { min: 0 }),
    dbV('mlmax', 'Total mismatch loss, worst phase', undefined, 'dB', { min: 0 }),
  ],
  eqs: [
    E('vswr1', ['g1'], v => vswrOf(v.g1), { g1: v => gammaOfVswr(v.vswr1) }),
    E('rl1', ['g1'], v => -dbv(v.g1), { g1: v => fromDbv(-v.rl1) }),
    E('vswr2', ['g2'], v => vswrOf(v.g2), { g2: v => gammaOfVswr(v.vswr2) }),
    E('rl2', ['g2'], v => -dbv(v.g2), { g2: v => fromDbv(-v.rl2) }),
    E('gp', ['g1', 'g2'], v => v.g1 * v.g2, { g1: v => v.gp / v.g2, g2: v => v.gp / v.g1 }),
    E('up', ['gp'], v => dbv(1 + v.gp), { gp: v => fromDbv(v.up) - 1 }),
    E('lo', ['gp'], v => dbv(1 - v.gp), { gp: v => 1 - fromDbv(v.lo) }),
    E('mlnom', ['g1', 'g2'], v => -dbp((1 - v.g1 * v.g1) * (1 - v.g2 * v.g2)), {
      g1: v => sqrt(1 - fromDbp(-v.mlnom) / (1 - v.g2 * v.g2)),
      g2: v => sqrt(1 - fromDbp(-v.mlnom) / (1 - v.g1 * v.g1)),
    }),
    // total loss = mlnom + 20·log(1 ∓ |Γ₁Γ₂|), written directly in the two ports so that
    // one port can be solved from the other and a total loss. With a = atanh|Γ|:
    // worst phase 20·log cosh(a₁ + a₂), best phase 20·log cosh(|a₁ − a₂|).
    E('mlmin', ['g1', 'g2'], v => dbv(Math.cosh(Math.abs(b4Atanh(v.g1) - b4Atanh(v.g2))))),
    E('mlmax', ['g1', 'g2'], v => dbv(Math.cosh(b4Atanh(v.g1) + b4Atanh(v.g2))), {
      g1: v => Math.tanh(Math.acosh(fromDbv(v.mlmax)) - b4Atanh(v.g2)),
      g2: v => Math.tanh(Math.acosh(fromDbv(v.mlmax)) - b4Atanh(v.g1)),
    }),
  ],
  outputs: [
    O('Mismatch uncertainty limits 20·log(1 ± |Γ₁Γ₂|) (of the loss term)', v => isFinite(v.lo) && isFinite(v.up) ? b4SgnTxt(v.lo) + ' … ' + b4SgnTxt(v.up) + ' dB' : NaN),
    O('Delivered power vs. phase-ignored value, dB', v => isFinite(v.lo) && isFinite(v.up) ? b4SgnTxt(-v.up) + ' … ' + b4SgnTxt(-v.lo) + ' dB' : NaN),
    O('Delivered power vs. phase-ignored value, %', v => isFinite(v.gp) ? b4SgnTxt(100 * (Math.pow(1 + v.gp, -2) - 1)) + ' … ' + b4SgnTxt(100 * (Math.pow(1 - v.gp, -2) - 1)) + ' %' : NaN),
    O('Peak-to-peak ripple (vs. frequency)', v => v.up - v.lo, 'dB'),
    O('Standard uncertainty (U-shaped) √2·|Γ₁||Γ₂|', v => 100 * Math.SQRT2 * v.gp, '%'),
  ],
  note: 'P<sub>load</sub> = P<sub>avail</sub>·(1−|Γ₁|²)(1−|Γ₂|²)/|1 − Γ₁Γ₂|². Because |1 − Γ₁Γ₂| lies between 1 − |Γ₁Γ₂| and 1 + |Γ₁Γ₂|, the mismatch uncertainty is 20·log(1 ± |Γ₁||Γ₂|). The delivered power changes by −20·log(1 ± |Γ₁Γ₂|), so its larger deviation is the increase at the best phase. Solving one port from the best-phase loss can have two answers (|Γ| above and below that of the other port); the one nearer the previous value is shown.',
},
{
  id: 'linezin', cat: 'lines', title: 'Terminated Line: Input Impedance', kw: 'input impedance terminated transmission line zin load transformation lossless smith',
  desc: 'Impedance seen at the input of a lossless line terminated in a load. Works backwards too: enter the input resistance and reactance to get the load that produces them.',
  vars: [
    ohmV('Z0', 'Line impedance Z₀', 50, { sticky: true }),
    ohmV('RL', 'Load resistance R<sub>L</sub>', 100, { min: 1e-12, inMin: 0, pri: -2 }),
    xV('XL', 'Load reactance X<sub>L</sub>', 50, { pri: -1 }),
    fq('f', 'Frequency', 1e9, 'GHz', { sticky: true }),
    posV('ee', 'Effective permittivity ε<sub>eff</sub>', 1, '', { sticky: true, min: 1, max: 1e4 }),
    lenV('len', 'Physical line length', 30e-3, 'mm'),
    posV('deg', 'Electrical length θ', undefined, '°', { min: 1e-9, max: 1e7 }),
    ohmV('Rin', 'Input resistance R<sub>in</sub>', undefined, { min: 1e-12, inMin: 0 }),
    xV('Xin', 'Input reactance X<sub>in</sub>'),
    linV('gin', '|Γ<sub>in</sub>| (equals |Γ<sub>L</sub>| on a lossless line)', undefined, '', { min: 0, max: 1 }),
    linV('ang', 'Angle of Γ<sub>in</sub>', undefined, '°', { min: -180, max: 180, wrap: 360 }),
    posV('vswr', 'VSWR on the line', undefined, ': 1', { min: 1, max: Infinity }),
  ],
  eqs: [
    E('deg', ['len', 'f', 'ee'], v => 360 * v.len * v.f * sqrt(v.ee) / C0, {
      len: v => v.deg * C0 / (360 * v.f * sqrt(v.ee)), f: v => v.deg * C0 / (360 * v.len * sqrt(v.ee)),
      ee: v => Math.pow(v.deg * C0 / (360 * v.len * v.f), 2),
    }),
    E('Rin', ['Z0', 'RL', 'XL', 'deg'], v => b4Zin(v.Z0, cx(v.RL, v.XL), v.deg).re),
    E('Xin', ['Z0', 'RL', 'XL', 'deg'], v => b4Zin(v.Z0, cx(v.RL, v.XL), v.deg).im),
    E('gin', ['Rin', 'Xin', 'Z0'], v => b4GammaMag(v.Rin, v.Xin, v.Z0)),
    E('ang', ['Rin', 'Xin', 'Z0'], v => cdeg(b4GammaIn(v))),
    // a short, open or purely reactive load (R = 0) gives |Γ| = 1 exactly and VSWR = ∞
    E('vswr', ['gin'], v => vswrOf(v.gin), { gin: v => gammaOfVswr(v.vswr) }),
  ],
  guess: v => {
    const g = {};
    if ([v.gin, v.ang, v.Z0].every(isFinite)) { const z = gammaToZ(cpol(v.gin, v.ang), v.Z0); g.Rin = z.re; g.Xin = z.im; }
    const rin = isFinite(v.Rin) ? v.Rin : g.Rin, xin = isFinite(v.Xin) ? v.Xin : g.Xin;
    if ([rin, xin, v.Z0, v.deg].every(isFinite)) { const zl = b4ZlFromZin(v.Z0, cx(rin, xin), v.deg); g.RL = zl.re; g.XL = zl.im; }
    return g;
  },
  chart: v => [v.RL, v.XL, v.Rin, v.Xin, v.Z0].every(isFinite)
    ? smithChart('Load and input on the Smith chart', [{ label: 'Load', z: b4GammaL(v), slot: 1 }, { label: 'Input', z: b4GammaIn(v), slot: 2 }]) : null,
  outputs: [
    O('Input impedance Z<sub>in</sub>', v => fmtC(cx(v.Rin, v.Xin), 5, 'Ω')),
    O('Input admittance Y<sub>in</sub>', v => fmtC(cscale(cinv(cx(v.Rin, v.Xin)), 1e3), 5, 'mS')),
    O('Γ<sub>L</sub> (polar)', v => fmtP(b4GammaL(v), 5)),
    O('Line length in wavelengths', v => v.deg / 360, 'λ'),
    O('Wavelength in the line', v => C0 / (v.f * sqrt(v.ee)), 'm', true),
    O('Z<sub>in</sub> reactance as L or C at f', v => reactText(v.Xin, v.f)),
  ],
  note: 'Z<sub>in</sub> = Z₀·(Z<sub>L</sub> + jZ₀·tan θ)/(Z₀ + jZ<sub>L</sub>·tan θ), θ = 360°·ℓ·f·√ε<sub>eff</sub>/c. Γ<sub>in</sub> = Γ<sub>L</sub>·e<sup>−j2θ</sup>. The impedance repeats every λ/2; a λ/4 line gives Z₀²/Z<sub>L</sub>.',
},
{ id: 'stubmatch', cat: 'matching', title: 'Single-Stub Matching', kw: 'stub matching single stub shunt series open short tuning smith', custom: 'stubmatch' },
{
  id: 'stripline', cat: 'lines', title: 'Stripline (Symmetric)', kw: 'stripline strip line buried trace impedance pcb inner layer wheeler cohn',
  desc: 'Strip centred between two ground planes (TEM). Leave out the width to design for a Z₀, or leave out Z₀ to analyse a trace. Wheeler formula with strip thickness.',
  cfg: b4SubCfg(true),
  vars: [
    lenV('W', 'Strip width W', undefined, 'mm', { min: 1e-8, max: 10 }),
    lenV('b', 'Ground-plane spacing b', 1.0e-3, 'mm', { min: 1e-8, max: 10, sticky: true }),
    lenV('t', 'Strip thickness t', 35e-6, 'µm', { min: 1e-12, max: 1e-2, sticky: true }),
    posV('er', 'Dielectric εr', 4.4, '', { min: 1, max: 1000, sticky: true }),
    ohmV('Z0', 'Characteristic impedance Z₀', 50, { min: 1e-3, max: 1e4 }),
    fq('f', 'Frequency (for wavelength & loss)', 1e9, 'GHz'),
    posV('tand', 'Loss tangent tanδ', 0.02, '', { min: 0, max: 1 }),
  ],
  eqs: [E('Z0', ['W', 'b', 't', 'er'], v => b4Stripline(v.W, v.b, v.t, v.er))],
  outputs: [
    O('W/b · t/b', v => fmt(v.W / v.b, 4) + ' · ' + fmt(v.t / v.b, 4)),
    O('ε<sub>eff</sub> (TEM: = εr)', v => v.er, ''),
    O('Wavelength in the line', v => C0 / (v.f * sqrt(v.er)), 'm', true),
    O('Delay per length', v => sqrt(v.er) / C0 * 1e-3 * 1e12, 'ps/mm'),
    O('Dielectric loss', v => b4LossD(v.f, v.er, e => e, v.tand), 'dB/m'),
    O('Exact zero-thickness value (Cohn)', v => b4StriplineCohn(v.W, v.b, v.er), 'Ω'),
  ],
  warn: v => (v.t / v.b > 0.25 || (v.b - v.t) / v.W < 0.1) ? '⚠ Outside the most accurate range (t/b ≤ 0.25, W/(b − t) ≤ 10).' : null,
  note: 'Wheeler (1978), see Wadell §3.5: Z₀ = (η₀/4π√εr)·ln{1 + (4/π)(b−t)/W′·[(8/π)(b−t)/W′ + √(((8/π)(b−t)/W′)² + 6.27)]}, where W′ adds the thickness correction. About 0.5 % accuracy for W′/(b−t) < 10. Conductor loss is not included.',
},
{
  id: 'cpw', cat: 'lines', title: 'Coplanar Waveguide (CPW)', kw: 'cpw coplanar waveguide gap ground conformal mapping',
  desc: 'Centre strip between two coplanar grounds on a substrate without a back-side ground. Leave out the width or the gap to design for a Z₀.',
  cfg: b4SubCfg(true),
  vars: [
    lenV('W', 'Centre strip width W', undefined, 'mm', { min: 1e-8, max: 10 }),
    lenV('s', 'Gap (slot) width s', 0.2e-3, 'mm', { min: 1e-8, max: 10 }),
    lenV('h', 'Substrate thickness h', 1.6e-3, 'mm', { min: 1e-8, max: 10, sticky: true }),
    posV('er', 'Substrate εr', 4.4, '', { min: 1, max: 1000, sticky: true }),
    ohmV('Z0', 'Characteristic impedance Z₀', 50, { min: 1e-3, max: 1e4 }),
    fq('f', 'Frequency (for wavelength & loss)', 1e9, 'GHz'),
    posV('tand', 'Loss tangent tanδ', 0.02, '', { min: 0, max: 1 }),
  ],
  eqs: [E('Z0', ['W', 's', 'h', 'er'], v => b4Cpw(v.W, v.s, v.h, v.er).z0)],
  warn: v => (v.h < (v.W + 2 * v.s) / 4) ? '⚠ Thin substrate (h < (W+2s)/4): the conformal-mapping Z₀ may be 2–3.5 % high and εeff 3–6.5 % low.' : null,
  outputs: [
    O('ε<sub>eff</sub>', v => b4Cpw(v.W, v.s, v.h, v.er).ee, ''),
    O('k = W/(W + 2s)', v => v.W / (v.W + 2 * v.s), ''),
    O('Total width W + 2s', v => v.W + 2 * v.s, 'm', true),
    O('Guided wavelength λ<sub>g</sub> at f', v => C0 / (v.f * sqrt(b4Cpw(v.W, v.s, v.h, v.er).ee)), 'm', true),
    O('Delay per length', v => sqrt(b4Cpw(v.W, v.s, v.h, v.er).ee) / C0 * 1e-3 * 1e12, 'ps/mm'),
    O('Dielectric loss', v => b4LossD(v.f, v.er, e => b4Cpw(v.W, v.s, v.h, e).ee, v.tand), 'dB/m'),
  ],
  note: 'Conformal mapping (Simons, Coplanar Waveguide Circuits, §2.2): k₀ = W/(W+2s), k₁ = sinh(πW/4h)/sinh(π(W+2s)/4h), ε<sub>eff</sub> = 1 + (εr−1)/2·[K(k₁)/K(k₁′)]·[K(k₀′)/K(k₀)], Z₀ = 30π/√ε<sub>eff</sub>·K(k₀′)/K(k₀). Assumes zero conductor thickness and side grounds much wider than W + 2s. Z₀ and ε<sub>eff</sub> are within about 0.5 % for h ≥ W + 2s. On thinner substrates the formula overestimates Z₀ and underestimates ε<sub>eff</sub>: about +1 % / −1 % at h = (W+2s)/2, +1.5 % / −3 % at h = (W+2s)/4, and up to +3.5 % / −6.5 % for h ≲ (W+2s)/10 with wide gaps; delay and λ<sub>g</sub> are affected the same way. Thick copper lowers Z₀ by a few %. Conductor loss is not included.',
},
{
  id: 'gcpw', cat: 'lines', title: 'Grounded CPW (Conductor-Backed)', kw: 'gcpw grounded coplanar waveguide conductor backed cbcpw via fence',
  desc: 'Coplanar waveguide with a ground plane under the substrate (the usual PCB "CPW with ground"). Leave out the width or the gap to design for a Z₀.',
  cfg: b4SubCfg(true, String(SUBSTRATES.findIndex(x => x.name === 'Rogers RO4003C'))),
  vars: [
    lenV('W', 'Centre strip width W', undefined, 'mm', { min: 1e-8, max: 10 }),
    lenV('s', 'Gap (slot) width s', 0.2e-3, 'mm', { min: 1e-8, max: 10 }),
    lenV('h', 'Substrate thickness h (to the bottom ground)', 0.508e-3, 'mm', { min: 1e-8, max: 10, sticky: true }),
    posV('er', 'Substrate εr', 3.55, '', { min: 1, max: 1000, sticky: true }),
    ohmV('Z0', 'Characteristic impedance Z₀', 50, { min: 1e-3, max: 1e4 }),
    fq('f', 'Frequency (for wavelength & loss)', 1e9, 'GHz'),
    posV('tand', 'Loss tangent tanδ', 0.0027, '', { min: 0, max: 1 }),
  ],
  eqs: [E('Z0', ['W', 's', 'h', 'er'], v => b4Gcpw(v.W, v.s, v.h, v.er).z0)],
  warn: v => {
    if (!(v.W > 0 && v.s > 0 && v.h > 0 && v.er >= 1)) return null;
    if (b4Gcpw(v.W, v.s, v.h, v.er).z0 > microstrip(v.W, v.h, 0, v.er).z0)
      return '⚠ Model not valid here: this Z₀ is above the plain microstrip Z₀ for the same W and h, which is physically impossible (side grounds can only lower Z₀). The gap is too wide for the conformal-mapping model; the line behaves like microstrip.';
    return v.s > v.h / 2 ? '⚠ Gap wider than h/2: the conformal-mapping model overestimates Z₀ (about 2 % at s = h, more for wider gaps), because the field goes mainly to the bottom ground.' : null;
  },
  outputs: [
    O('ε<sub>eff</sub>', v => b4Gcpw(v.W, v.s, v.h, v.er).ee, ''),
    O('Total width W + 2s', v => v.W + 2 * v.s, 'm', true),
    O('Guided wavelength λ<sub>g</sub> at f', v => C0 / (v.f * sqrt(b4Gcpw(v.W, v.s, v.h, v.er).ee)), 'm', true),
    O('Delay per length', v => sqrt(b4Gcpw(v.W, v.s, v.h, v.er).ee) / C0 * 1e-3 * 1e12, 'ps/mm'),
    O('Dielectric loss', v => b4LossD(v.f, v.er, e => b4Gcpw(v.W, v.s, v.h, e).ee, v.tand), 'dB/m'),
    O('Microstrip with the same W and h (no side grounds)', v => microstrip(v.W, v.h, 0, v.er).z0, 'Ω'),
  ],
  note: 'Conformal mapping (Simons §2.4): k₃ = tanh(πW/4h)/tanh(π(W+2s)/4h), ε<sub>eff</sub> = (1 + εr·q)/(1 + q) with q = [K(k₃)/K(k₃′)]/[K(k₀)/K(k₀′)], Z₀ = 60π/√ε<sub>eff</sub>/[K(k₀)/K(k₀′) + K(k₃)/K(k₃′)]. Zero conductor thickness, wide side grounds. Accurate to about 1 % for s ≤ h/2. For wider gaps it overestimates Z₀ (about 2 % at s = h, 3–5 % at s = 2–3h, up to 10 % for s ≳ 5h), because it assumes magnetic walls at the slot edges and does not reduce to microstrip as s → ∞; the true Z₀ is at or below the microstrip value. Use a via fence along the gaps to suppress parallel-plate modes.',
},
{
  id: 'coupledms', cat: 'lines', title: 'Edge-Coupled Microstrip (Z₀e / Z₀o)', kw: 'coupled microstrip even odd mode coupler z0e z0o coupling kirschning jansen',
  desc: 'Two parallel microstrip lines: even- and odd-mode impedances, coupling and system impedance. Enter Z₀ and the coupling to solve the width and spacing of a coupler.',
  cfg: b4SubCfg(false),
  vars: [
    lenV('W', 'Strip width W', 2.5e-3, 'mm', { min: 1e-8, max: 10, pri: -2 }),
    lenV('s', 'Spacing s', 0.3e-3, 'mm', { min: 1e-8, max: 10, pri: -1 }),
    lenV('h', 'Substrate height h', 1.6e-3, 'mm', { min: 1e-8, max: 10, sticky: true }),
    posV('er', 'Substrate εr', 4.4, '', { min: 1, max: 1000, sticky: true }),
    ohmV('Z0e', 'Even-mode impedance Z₀e'),
    ohmV('Z0o', 'Odd-mode impedance Z₀o'),
    ohmV('Zc', 'System impedance √(Z₀e·Z₀o)'),
    posV('cdb', 'Coupling C = −20·log((Z₀e−Z₀o)/(Z₀e+Z₀o))', undefined, 'dB', { min: 1e-6, max: 200 }),
    fq('f', 'Frequency (for the λ/4 coupler length)', 1e9, 'GHz'),
  ],
  eqs: [
    E('Z0e', ['W', 's', 'h', 'er'], v => b4Coupled(v.W, v.s, v.h, v.er).ze),
    E('Z0o', ['W', 's', 'h', 'er'], v => b4Coupled(v.W, v.s, v.h, v.er).zo),
    E('Zc', ['Z0e', 'Z0o'], v => sqrt(v.Z0e * v.Z0o), { Z0e: v => v.Zc * v.Zc / v.Z0o, Z0o: v => v.Zc * v.Zc / v.Z0e }),
    E('cdb', ['Z0e', 'Z0o'], v => -dbv((v.Z0e - v.Z0o) / (v.Z0e + v.Z0o)), {
      Z0e: v => { const c = fromDbv(-v.cdb); return v.Z0o * (1 + c) / (1 - c); },
      Z0o: v => { const c = fromDbv(-v.cdb); return v.Z0e * (1 - c) / (1 + c); },
    }),
  ],
  guess: v => {
    if (!isFinite(v.Zc) || !isFinite(v.cdb)) return null;
    const c = fromDbv(-v.cdb);
    return { Z0e: v.Zc * sqrt((1 + c) / (1 - c)), Z0o: v.Zc * sqrt((1 - c) / (1 + c)) };
  },
  outputs: [
    O('ε<sub>eff</sub> even / odd', v => { const k = b4Coupled(v.W, v.s, v.h, v.er); return fmt(k.eee, 5) + ' / ' + fmt(k.eeo, 5); }),
    O('Voltage coupling factor (Z₀e−Z₀o)/(Z₀e+Z₀o)', v => (v.Z0e - v.Z0o) / (v.Z0e + v.Z0o), ''),
    O('λ/4 coupler length at f (mean of modes)', v => { const k = b4Coupled(v.W, v.s, v.h, v.er); return C0 / (4 * v.f) * 2 / (sqrt(k.eee) + sqrt(k.eeo)); }, 'm', true),
    O('Odd/even phase-velocity ratio', v => { const k = b4Coupled(v.W, v.s, v.h, v.er); return sqrt(k.eee / k.eeo); }, ''),
    O('Single line with the same W (uncoupled)', v => microstrip(v.W, v.h, 0, v.er).z0, 'Ω'),
  ],
  warn: v => {
    const u = v.W / v.h, g = v.s / v.h;
    return (u < 0.1 || u > 10 || g < 0.1 || g > 10 || v.er > 18) ? '⚠ Outside the fitted range of the formulas (0.1 ≤ W/h ≤ 10, 0.1 ≤ s/h ≤ 10, εr ≤ 18).' : null;
  },
  note: 'Static Kirschning & Jansen (1984) equations, zero strip thickness. Even and odd modes travel at different speeds in microstrip, so real couplers have limited directivity. Design for Z₀e·Z₀o = Z₀² and (Z₀e − Z₀o)/(Z₀e + Z₀o) = 10<sup>−C/20</sup>.',
},
);
const b4SgnTxt = x => (x >= 0 ? '+' : '') + fmt(Math.abs(x) < 1e-12 ? 0 : x, 4);

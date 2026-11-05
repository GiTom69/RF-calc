// Run: node test/test.js
// Loads the pure (non-DOM) sources into one VM context and checks the math,
// reference values and the "last unknown is calculated" solver behaviour.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// node test/test.js [--only=b1,b2 | --only=none]  (default: every batch present in src/)
const SRC = path.join(__dirname, '..', 'src');
const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const BATCHES = ['b1', 'b2', 'b3', 'b4'].filter(b => (!onlyArg || onlyArg.split(',').includes(b)) && fs.existsSync(path.join(SRC, b + '.js')));
const pure = ['core.js', 'data.js', 'rf.js', 'calcs.js'].concat(BATCHES.map(b => b + '.js'))
  .map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
const ctx = vm.createContext({ console: console });
vm.runInContext(pure + '\n;globalThis.__api = { CALCS, prepCalc, calcInit, calcEdit, calcSetMany, analyze, residual, parseNum, fmt, fmtSI,' +
  ' parseField, cx, cpol, cabs, cdiv, csqrt, mInv, inRange, findRoot, makeGrid, E, UNITS, cdeg, csub, cmul, mMaxAbs, mSub, microstrip, s2Analyze, sToZ, zToS, sToY, sToABCD, abcdToS, sToT, reduceS, cascade, lMatch,' +
  ' attenR, attenTolerance, resistive2port, nearestE, fsplDb, cableAtt, CABLES, mEye, zToGamma, mMul, dbp, dbv, fromDbv };', ctx);
const A = ctx.__api;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL: ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
// near: RELATIVE tolerance (absolute only when the expected value is exactly 0)
const nearOk = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b) || (b === 0 && Math.abs(a) <= tol);
function near(a, b, tol, name) {
  ok(nearOk(a, b, tol), name, a + ' vs ' + b);
}
// nearAbs: ABSOLUTE tolerance, for values that may be near 0 (dB, degrees)
function nearAbs(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b);
}
const byId = id => A.CALCS.find(c => c.id === id);
const solvers = A.CALCS.filter(c => !c.custom);
const solved = (c, st) => c.eqVars.every(id => st.status[id] === 'in' || st.status[id] === 'calc');

// ---------------------------------------------------------- parsing ------
near(A.parseNum('2.4G'), 2.4e9, 1e-12, 'parse 2.4G');
near(A.parseNum('4k7'), 4700, 1e-12, 'parse 4k7');
near(A.parseNum('10n'), 10e-9, 1e-12, 'parse 10n');
near(A.parseNum('1e-3'), 1e-3, 1e-12, 'parse 1e-3');
near(A.parseNum('−3.5'), -3.5, 1e-12, 'parse unicode minus');
near(A.parseNum('2p2'), 2.2e-12, 1e-12, 'parse 2p2');
ok(isNaN(A.parseNum('abc')), 'parse invalid');
const pf = (t, u, cu, sym) => A.parseField(t, u, cu, sym);
near(pf('4n7', 'H', 'nH').val, 4.7e-9, 1e-12, 'field: 4n7 in nH field is 4.7 nH');
ok(pf('4n7', 'H', 'nH').unit === 'nH', 'field: 4n7 -> unit nH');
near(pf('4.7', 'H', 'nH').val, 4.7e-9, 1e-12, 'field: plain number uses selected unit');
near(pf('2.4 GHz', 'Hz', 'MHz').val, 2.4e9, 1e-12, 'field: 2.4 GHz');
ok(pf('2.4 GHz', 'Hz', 'MHz').unit === 'GHz', 'field: unit switches to GHz');
near(pf('2.4G', 'Hz', 'MHz').val, 2.4e9, 1e-12, 'field: 2.4G');
near(pf('2.4ghz', 'Hz', 'MHz').val, 2.4e9, 1e-12, 'field: case-insensitive unit');
near(pf('10m', 'm', 'mm').val, 10, 1e-12, 'field: 10m in a length field is metres');
near(pf('10mm', 'm', 'km').val, 0.01, 1e-12, 'field: 10mm');
near(pf('5k', 'm', 'mm').val, 5000, 1e-12, 'field: 5k -> km');
near(pf('3nmi', 'm', 'mm').val, 5556, 1e-12, 'field: nautical miles');
near(pf('50 ohm', 'ohm', 'kΩ').val, 50, 1e-12, 'field: 50 ohm');
near(pf('4k7', 'ohm', 'Ω').val, 4700, 1e-12, 'field: 4k7 ohm');
near(pf('10uH', 'H', 'nH').val, 10e-6, 1e-12, 'field: uH alias');
near(pf('290K', undefined, null, 'K').val, 290, 1e-12, 'field: 290K kelvin is not kilo');
near(pf('-3 dB', undefined, null, 'dB').val, -3, 1e-12, 'field: -3 dB');
near(pf('2:1', undefined, null, ': 1').val, 2, 1e-12, 'field: VSWR 2:1');
near(pf('10m', 'W', 'W').val, 0.01, 1e-12, 'field: 10m in W field = 10 mW');
ok(pf('10m', 'W', 'W').unit === 'mW', 'field: switch to mW');
near(pf('1e-3', 'Hz', 'MHz').val, 1e3, 1e-12, 'field: exponent is a plain number in selected unit');
ok(isNaN(pf('abc', 'Hz', 'MHz').val), 'field: invalid');
ok(A.fmt(1234567) === '1234570', 'fmt big', A.fmt(1234567));
ok(A.fmtSI(2.4e9, 'Hz') === '2.4 GHz', 'fmtSI', A.fmtSI(2.4e9, 'Hz'));

// ------------------------------------------- every solver: defaults OK ---
for (const c of solvers) {
  A.prepCalc(c);
  const st = A.calcInit(c);
  const entered = c.eqVars.filter(id => st.status[id] === 'in').length;
  ok(entered === c.dof, c.id + ': defaults match DOF', entered + ' entered, dof ' + c.dof);
  ok(solved(c, st), c.id + ': defaults fully solved', JSON.stringify(st.status) + ' ' + st.msg);
  // every equation satisfied
  const v = Object.assign({ $: st.cfg }, st.vals);
  for (const eq of c.eqs) {
    const r = A.residual(c, eq, v);
    ok(Math.abs(r) < 1e-6, c.id + ': residual of ' + eq.out, r);
  }
}

// ------------------- round trip: clear each field, it must come back ------
for (const c of solvers) {
  const base = A.calcInit(c);
  if (!solved(c, base)) continue;
  for (const id of c.eqVars) {
    const st = JSON.parse(JSON.stringify(base, (k, x) => (typeof x === 'number' && !isFinite(x)) ? String(x) : x),
      (k, x) => (x === 'NaN' ? NaN : x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x));
    const orig = base.vals[id];
    if (!isFinite(orig)) continue;
    A.calcEdit(c, st, id, NaN);
    ok(st.status[id] === 'calc', c.id + ': clearing ' + id + ' makes it the target', st.status[id] + ' / ' + st.msg);
    near(st.vals[id], orig, 1e-6, c.id + ': round-trip ' + id);
  }
}

// ---------- typing into a calculated field: system stays consistent -------
for (const c of solvers) {
  const st = A.calcInit(c);
  for (const id of c.eqVars) {
    if (st.status[id] !== 'calc' || !isFinite(st.vals[id])) continue;
    const before = JSON.stringify(st.status);
    const nv = st.vals[id] * (c.byId[id].scale === 'log' ? 1.1 : 1) + (c.byId[id].scale === 'log' ? 0 : 0.5);
    A.calcEdit(c, st, id, nv);
    ok(st.status[id] === 'in', c.id + ': overwrite ' + id + ' becomes input');
    const nIn = c.eqVars.filter(k => st.status[k] === 'in').length;
    ok(nIn <= c.dof, c.id + ': not over-determined after overwriting ' + id, nIn + ' > ' + c.dof);
    if (solved(c, st)) {
      const v = Object.assign({ $: st.cfg }, st.vals);
      for (const eq of c.eqs) ok(Math.abs(A.residual(c, eq, v)) < 1e-6, c.id + ': consistent after overwrite ' + id + ' (' + eq.out + ')');
    } else {
      console.log('  note: ' + c.id + ' after overwriting ' + id + ': ' + st.msg + ' was ' + before);
    }
    break;
  }
}

// ------------------------------------------------- reference values -------
{
  const c = byId('vswr'); const st = A.calcInit(c);
  near(st.vals.rl, 9.5424, 1e-4, 'VSWR 2 -> RL 9.54 dB');
  near(st.vals.g, 1 / 3, 1e-9, 'VSWR 2 -> |G| 0.333');
  near(st.vals.ml, 0.5115, 1e-3, 'VSWR 2 -> ML 0.51 dB');
}
{
  const c = byId('fspl'); const st = A.calcInit(c);
  const L1 = 20 * Math.log10(4 * Math.PI * 1000 * 2.4e9 / 299792458);   // 100.0520 dB
  near(st.vals.L, L1, 1e-9, 'FSPL 2.4 GHz 1 km');
  // the plan's example: enter L, leave d blank
  A.calcEdit(c, st, 'd', NaN);
  A.calcEdit(c, st, 'L', 120);
  near(st.vals.d, 1000 * Math.pow(10, (120 - L1) / 20), 1e-9, 'FSPL solve distance for 120 dB (9940.30 m)');
}
{
  const c = byId('microstrip'); const st = A.calcInit(c);
  ok(st.vals.W > 2.9e-3 && st.vals.W < 3.2e-3, '50 ohm microstrip on 1.6 mm FR-4 is about 3 mm', st.vals.W);
  const m = A.microstrip(3.0e-3, 1.6e-3, 0, 4.4);
  ok(m.z0 > 49 && m.z0 < 52, 'microstrip analysis Z0(3mm)', m.z0);
}
{
  const c = byId('sens'); const st = A.calcInit(c);
  near(st.vals.n0, -173.975, 1e-4, 'kT at 290 K = -174 dBm/Hz');
  near(st.vals.floor, st.vals.n0 + 60 + 5, 1e-9, 'noise floor 1 MHz NF 5');
}
{
  const c = byId('spower2'); const st = A.calcInit(c);
  A.calcEdit(c, st, 's21', -1);
  A.calcEdit(c, st, 's11', -10);
  near(st.vals.refl, 10, 1e-9, 'simple S: reflected 10 %');
  near(st.vals.trans, 79.4328, 1e-5, 'simple S: transmitted 79.4 %');
  near(st.vals.loss, 10.5672, 1e-4, 'simple S: lost 10.6 %');
  near(st.vals.ml, 0.4576, 1e-3, 'simple S: mismatch loss 0.46 dB');
  // enter S11 and the loss -> S21 is solved (plan example)
  A.calcEdit(c, st, 'loss', 5);
  ok(st.status.s21 === 'calc', 'simple S: entering loss makes S21 the target', st.status.s21);
  near(st.vals.trans, 85, 1e-9, 'simple S: S21 from S11 and loss');
}
{
  const c = byId('power'); const st = A.calcInit(c);
  near(st.vals.Vrms, Math.sqrt(1e-3 * 50), 1e-9, '0 dBm at 50 ohm = 223.6 mV');
  near(st.vals.dBuV, 106.99, 1e-4, '0 dBm = 107 dBuV');
  A.calcEdit(c, st, 'Vpp', 2);
  near(st.vals.dBm, 10 * Math.log10((1 / Math.SQRT2) ** 2 / 50 / 1e-3), 1e-9, '2 Vpp -> dBm');
  ok(st.status.Z === 'in', 'power: Z stays an input');
}
{
  const c = byId('zgamma'); const st = A.calcInit(c);
  const g = A.zToGamma(A.cx(75, 25), 50);
  near(st.vals.g, A.cabs(g), 1e-9, 'zgamma |G|');
  // enter |G| and angle -> R and X via the 2x2 block solver
  A.calcEdit(c, st, 'g', 0.5);
  A.calcEdit(c, st, 'ang', 90);
  ok(st.status.R === 'calc' && st.status.X === 'calc', 'zgamma: R, X solved from |G| and angle', JSON.stringify(st.status));
  near(st.vals.R, 30, 1e-6, 'zgamma: G = 0.5j -> R = 30');
  near(st.vals.X, 40, 1e-6, 'zgamma: G = 0.5j -> X = 40');
}
{
  const c = byId('atten'); const st = A.calcInit(c);
  near(st.vals.r1, 96.248, 1e-4, '10 dB pi: shunt 96.25');
  near(st.vals.r2, 71.151, 1e-4, '10 dB pi: series 71.15');
  // both resistors entered -> Z0 and A solved together
  A.calcEdit(c, st, 'r1', 150.48);
  A.calcEdit(c, st, 'r2', 37.35);
  ok(st.status.z0 === 'calc' && st.status.a === 'calc', 'atten: solve Z0 and A from resistors', JSON.stringify(st.status) + st.msg);
  near(st.vals.a, 6, 2e-3, 'atten: 6 dB pi');
  near(st.vals.z0, 50, 2e-3, 'atten: 50 ohm');
}
{
  const c = byId('serpar'); const st = A.calcInit(c);
  near(st.vals.Rp, 260, 1e-9, 'series->parallel Rp');
  near(st.vals.Xp, 52, 1e-9, 'series->parallel Xp');
  A.calcEdit(c, st, 'Rs', NaN);
  A.calcEdit(c, st, 'Xs', NaN);
  A.calcEdit(c, st, 'Rp', 1000);
  A.calcEdit(c, st, 'Xp', -500);
  near(st.vals.Rs, 200, 1e-6, 'parallel->series Rs');
  near(st.vals.Xs, -400, 1e-6, 'parallel->series Xs');
}
{
  const c = byId('link'); const st = A.calcInit(c);
  A.calcEdit(c, st, 'margin', 0);
  ok(st.status.d === 'calc', 'link: entering margin solves distance', JSON.stringify(st.status));
  const st2 = A.calcInit(c);
  near(st.vals.d, st2.vals.d * Math.pow(10, st2.vals.margin / 20), 1e-6, 'link: max range');
}
{
  const c = byId('psum'); const st = A.calcInit(c);
  A.calcEdit(c, st, 'P2', 0);
  near(st.vals.Pt, 3.0103, 1e-4, 'two equal powers +3 dB');
}
{
  const c = byId('mixer'); const st = A.calcInit(c);
  near(st.vals.lo, 2470e6, 1e-12, 'mixer high-side LO');
  near(st.vals.img, 2540e6, 1e-12, 'mixer high-side image');
  st.cfg.mode = 'low';
  A.calcEdit(c, st, 'rf', 2400e6);
  near(st.vals.lo, 2330e6, 1e-12, 'mixer low-side LO');
  near(st.vals.img, 2260e6, 1e-12, 'mixer low-side image');
}

// --------------------------------------------------- S-parameters ---------
{
  // Pozar, Microwave Engineering 4th ed., Example 12.3 (GaAs FET at 4 GHz)
  const S = [[A.cpol(0.72, -116), A.cpol(0.03, 57)], [A.cpol(2.60, 76), A.cpol(0.73, -54)]];
  const r = A.s2Analyze(S, 50, A.cx(50), A.cx(50));
  near(A.cabs(r.delta), 0.488, 5e-3, 'Pozar |Delta|');
  near(r.K, 1.195, 5e-3, 'Pozar K');
  near(A.cabs(r.match.gs), 0.872, 5e-3, 'Pozar |Gs|');
  near(A.cdeg(r.match.gs), 123, 5e-3, 'Pozar angle Gs');
  near(A.cabs(r.match.gl), 0.876, 5e-3, 'Pozar |Gl|');
  near(A.cdeg(r.match.gl), 61, 1e-2, 'Pozar angle Gl');
  near(10 * Math.log10(r.MAG), 16.7, 1e-2, 'Pozar MAG 16.7 dB');
  // GT with the conjugate match equals MAG
  const r2 = A.s2Analyze(S, 50, r.match.zs, r.match.zl);
  near(10 * Math.log10(r2.GT), 10 * Math.log10(r.MAG), 1e-6, 'GT(conj match) = MAG');
  near(A.cabs(A.csub(r2.gin, { re: r.match.gs.re, im: -r.match.gs.im })), 0, 1e-6, 'Gin = Gs* at conjugate match');
  // conversions round trip
  const Z = A.sToZ(S, 50), S2 = A.zToS(Z, 50);
  ok(A.mMaxAbs(A.mSub(S, S2)) < 1e-12, 'S -> Z -> S round trip');
  const S3 = A.abcdToS(A.sToABCD(S, 50), 50);
  ok(A.mMaxAbs(A.mSub(S, S3)) < 1e-12, 'S -> ABCD -> S round trip');
}
{
  // 3 dB attenuator ABCD/T cascade check: two 3 dB pads = 6 dB
  const k = Math.pow(10, -3 / 20);
  const S = [[A.cx(0), A.cx(k)], [A.cx(k), A.cx(0)]];
  const T = A.sToT(S), TT = A.mMul(T, T);
  near(1 / A.cabs(TT[1][1]), Math.pow(10, -6 / 20), 1e-12, 'T-matrix cascade of two 3 dB pads');
}
{
  const s = 1 / Math.SQRT2;
  const W = [[A.cx(0), A.cx(0, -s), A.cx(0, -s)], [A.cx(0, -s), A.cx(0), A.cx(0)], [A.cx(0, -s), A.cx(0), A.cx(0)]];
  near(20 * Math.log10(A.cabs(W[1][0])), -3.0103, 1e-4, 'Wilkinson S21 -3.01 dB');
  const SHS = A.mMul(W.map((r, i) => r.map((_, j) => ({ re: W[j][i].re, im: -W[j][i].im }))), W);
  ok(A.mMaxAbs(A.mSub(SHS, A.mEye(3))) > 0.4, 'Wilkinson is not lossless');
  near(SHS[1][1].re, 0.5, 1e-12, 'Wilkinson column 2 power = 0.5');
  const circ = [[A.cx(0), A.cx(0), A.cx(1)], [A.cx(1), A.cx(0), A.cx(0)], [A.cx(0), A.cx(1), A.cx(0)]];
  const CH = A.mMul(circ.map((r, i) => r.map((_, j) => ({ re: circ[j][i].re, im: -circ[j][i].im }))), circ);
  ok(A.mMaxAbs(A.mSub(CH, A.mEye(3))) < 1e-12, 'circulator lossless');
  ok(A.cabs(A.csub(circ[0][1], circ[1][0])) > 0.5, 'circulator non-reciprocal');
  // terminate port 3 of a Wilkinson with a match -> 2-port with S21 = -3 dB
  const R = A.reduceS(W, 2, A.cx(0));
  near(A.cabs(R[1][0]), s, 1e-12, 'reduce Wilkinson port 3 (matched)');
}

// -------------------------------------------------------- cascade ---------
{
  const r = A.cascade([{ g: 20, nf: 1, oip3: 30, op1: 20 }, { g: -3, nf: 3, oip3: NaN, op1: NaN }, { g: 15, nf: 6, oip3: 35, op1: 25 }]);
  const F = Math.pow(10, 0.1) + (Math.pow(10, 0.3) - 1) / 100 + (Math.pow(10, 0.6) - 1) / (100 * Math.pow(10, -0.3));
  near(r[2].nf, 10 * Math.log10(F), 1e-9, 'cascade NF (Friis)');
  near(r[2].g, 32, 1e-9, 'cascade gain');
  const o3 = 1 / (1 / (1000 * Math.pow(10, -0.3) * Math.pow(10, 1.5)) + 1 / Math.pow(10, 3.5));
  near(r[2].oip3, 10 * Math.log10(o3), 1e-9, 'cascade OIP3');
}

// -------------------------------------------------------- L-network -------
{
  // Pozar Example 5.1: ZL = 200 - j100 to a 100 ohm line at 500 MHz
  const sols = A.lMatch(100, 200, -100, 500e6);
  ok(sols.length >= 2, 'L-network solutions found', sols.length);
  const s1 = sols.find(s => s.se.kind === 'L');
  ok(s1 && Math.abs(s1.sh.val - 0.92e-12) < 0.02e-12 && Math.abs(s1.se.val - 38.8e-9) < 0.2e-9, 'Pozar 5.1 solution 1 (C 0.92 pF, L 38.8 nH)', s1 && (s1.sh.val + ' ' + s1.se.val));
  const s2 = sols.find(s => s.se.kind === 'C');
  ok(s2 && Math.abs(s2.sh.val - 46.1e-9) < 0.3e-9 && Math.abs(s2.se.val - 2.61e-12) < 0.02e-12, 'Pozar 5.1 solution 2 (L 46.1 nH, C 2.61 pF)', s2 && (s2.sh.val + ' ' + s2.se.val));
}

// -------------------------------------------------------- misc ------------
{
  const e = A.nearestE(4800, 'E24');
  ok(e.best === 4700, 'E24 nearest 4800 -> 4700', e.best);
  const e2 = A.nearestE(0.0153, 'E96');
  ok(Math.abs(e2.best - 0.0154) < 1e-12, 'E96 nearest 0.0153 -> 0.0154', e2.best);
  const lmr = A.CABLES.find(c => c.name === 'LMR-400');
  near(A.cableAtt(lmr, 2.4e9) * 30.48, 6.6, 0.03, 'LMR-400 at 2.4 GHz about 6.6 dB/100 ft');
}

// ------------------------------------------- frequency planning ----------
{
  const c = byId('span'); const st = A.calcInit(c);
  near(st.vals.center, 2441.75e6, 1e-12, 'span: centre of 2400-2483.5 MHz');
  near(st.vals.span, 83.5e6, 1e-12, 'span: span');
  near(st.vals.fbw, 100 * 83.5 / 2441.75, 1e-9, 'span: fractional BW');
  A.calcEdit(c, st, 'center', 1e9);
  A.calcEdit(c, st, 'span', 100e6);
  near(st.vals.start, 950e6, 1e-12, 'span: start from centre/span');
  near(st.vals.stop, 1050e6, 1e-12, 'span: stop from centre/span');
  A.calcEdit(c, st, 'fbw', 10);
  near(st.vals.span, 100e6, 1e-9, 'span: fbw 10 % keeps 100 MHz span (consistency)');
}
{
  const c = byId('mixer'); const st = A.calcInit(c);
  near(st.vals.gap, 120e6, 1e-12, 'mixer: gap = 2 IF - BW');
  A.calcEdit(c, st, 'gap', 200e6);
  ok(st.status.iff === 'calc' && st.status.bw === 'in', 'mixer: entering the gap solves the IF', JSON.stringify(st.status));
  near(st.vals.iff, 110e6, 1e-12, 'mixer: IF for 200 MHz gap and 20 MHz BW');
  near(st.vals.img, 2400e6 + 220e6, 1e-12, 'mixer: image follows');
}
// --------------------------------------------- attenuator tolerance -----
{
  for (const topo of ['pi', 'tee', 'btee']) {
    const [r1, r2] = A.attenR(topo, 50, 10);
    const R = topo === 'btee' ? [50, 50, r1, r2] : [r1, r2, r1];
    const S = A.resistive2port(topo, R, 50);
    near(Math.abs(S[1][0]), A.fromDbv(-10), 1e-9, topo + ': nodal model gives 10 dB with exact values');
    ok(Math.abs(S[0][0]) < 1e-9 && Math.abs(S[1][1]) < 1e-9, topo + ': nodal model is matched with exact values', S[0][0]);
    const t = A.attenTolerance(topo, 50, r1, r2, 1, 'exact');
    near(t.att0, 10, 1e-9, topo + ': exact build is on target');
    ok(t.min < 10 && t.max > 10, topo + ': 1 % range brackets the target', [t.min, t.max]);
    ok(t.rss > 0 && t.rss <= Math.max(10 - t.min, t.max - 10) + 1e-12, topo + ': RSS within worst case', [t.rss, t.min, t.max]);
    const t5 = A.attenTolerance(topo, 50, r1, r2, 5, 'exact');
    ok(t5.max - t5.min > t.max - t.min, topo + ': wider tolerance gives a wider range');
    ok(isFinite(t.rlWorst) && t.rlWorst > 30, topo + ': 1 % resistors keep RL > 30 dB', t.rlWorst);
  }
  // Pi 10 dB: shunt 96.25 / series 71.15; nearest E96 -> 95.3 (-0.98 %) / 71.5 (+0.49 %)
  const tE = A.attenTolerance('pi', 50, 96.248, 71.151, 1, 'E96');
  ok(tE.built[0].val === 95.3 && tE.built[1].val === 71.5, 'pi E96 snapping 95.3 / 71.5', tE.built);
  // Independent check of one corner: all resistors +1 % on a Pi pad with 50 ohm terms
  const Rp = [97.6 * 1.01, 71.5 * 1.01, 97.6 * 1.01];
  const Sp = A.resistive2port('pi', Rp, 50);
  // direct: load 50 || Rsh, series, then || Rsh; voltage gain into 50 from a 50 ohm source
  const par = (a, b) => a * b / (a + b);
  const zl = par(50, Rp[2]), zmid = Rp[1] + zl, zin = par(Rp[0], zmid);
  const vin = zin / (50 + zin), vout = vin * zl / zmid;
  near(Math.abs(Sp[1][0]), 2 * vout, 1e-12, 'pi corner S21 matches hand circuit analysis');
}

// ------------------------------------------- audit regression tests ------
// near() itself must be relative (G8-F1): tiny SI values can no longer pass vacuously
ok(!nearOk(2 * 0.9836e-12, 0.9836e-12, 1e-3), 'near: 2x error on 1 pF fails (relative tolerance)');
ok(!nearOk(0, 3.8721e-6, 1e-4), 'near: 0 vs a BER of 3.9e-6 fails');
ok(nearOk(1.00001e-12, 1e-12, 1e-4) && nearOk(5e-5, 0, 1e-4), 'near: relative pass, absolute only for expected 0');
// parseField: SI prefix beats the case-insensitive unit fallback (E1-1)
near(pf('10f', 'F', 'pF').val, 1e-14, 1e-12, 'field: 10f in a capacitance field is 10 fF');
ok(pf('10f', 'F', 'pF').unit === 'fF', 'field: 10f switches to fF', pf('10f', 'F', 'pF').unit);
near(pf('10fF', 'F', 'pF').val, 1e-14, 1e-12, 'field: 10fF');
near(pf('1M', 'm', 'km').val, 1e6, 1e-12, 'field: 1M in a length field is mega');
near(pf('2.4mhz', 'Hz', 'GHz').val, 2.4e6, 1e-12, 'field: unambiguous lower-case unit still works (mhz)');
near(pf('1kw', 'W', 'W').val, 1e3, 1e-12, 'field: 1kw');
// ... and an ambiguous case-insensitive match is decided by the prefix letter (U1-F7)
near(pf('1 Mw', 'W', 'W').val, 1e6, 1e-12, 'field: 1 Mw is a megawatt');
ok(pf('1 Mw', 'W', 'W').unit === 'MW', 'field: 1 Mw switches to MW');
near(pf('10 mw', 'W', 'W').val, 0.01, 1e-12, 'field: 10 mw is 10 mW');
// 'NM' is the nautical mile (E1-2)
near(pf('10NM', 'm', 'km').val, 18520, 1e-12, 'field: 10NM = 10 nautical miles');
near(pf('10nm', 'm', 'km').val, 1e-8, 1e-12, 'field: 10nm is still nanometres');
near(pf('3NMI', 'm', 'km').val, 5556, 1e-12, 'field: 3NMI');
// one-character symbol is matched case-sensitively (E1-3, U1-F1)
near(pf('1.2k', undefined, null, 'K').val, 1200, 1e-12, 'field: 1.2k in a kelvin field is 1200 K');
near(pf('1.5kK', undefined, null, 'K').val, 1500, 1e-12, 'field: 1.5kK');
near(pf('2k6', undefined, null, 'K').val, 2600, 1e-12, 'field: 2k6 kelvin');
near(pf('3db', undefined, null, 'dB').val, 3, 1e-12, 'field: multi-character symbol still case-insensitive (3db)');
// ASCII area exponent (U1-F2)
near(pf('10 m2', 'm2', 'm²').val, 10, 1e-12, 'field: 10 m2 is 10 m² (not the 10m2 infix)');
ok(pf('10 m2', 'm2', 'm²').unit === 'm²', 'field: 10 m2 -> unit m²');
near(pf('5 cm2', 'm2', 'm²').val, 5e-4, 1e-12, 'field: 5 cm2');
near(pf('10mm^2', 'm2', 'm²').val, 1e-5, 1e-12, 'field: 10mm^2');
near(pf('4m2', 'm', 'mm').val, 4.2e-3, 1e-12, 'field: 4m2 infix still works in a length field');
// an SI prefix in front of an area is squared (U1-F2 round 2)
near(pf('10 km2', 'm2', 'm²').val, 1e7, 1e-12, 'field: 10 km2 = 1e7 m²');
near(pf('10 Km2', 'm2', 'm²').val, 1e7, 1e-12, 'field: 10 Km2 = 1e7 m²');
near(pf('10 km²', 'm2', 'm²').val, 1e7, 1e-12, 'field: 10 km² = 1e7 m²');
near(pf('10 um2', 'm2', 'm²').val, 1e-11, 1e-12, 'field: 10 um2 = 1e-11 m²');
near(pf('10 µm²', 'm2', 'm²').val, 1e-11, 1e-12, 'field: 10 µm² = 1e-11 m²');
near(pf('10 nm2', 'm2', 'm²').val, 1e-17, 1e-12, 'field: 10 nm2 = 1e-17 m²');
near(pf('2.5 m2', 'm2', 'm²').val, 2.5, 1e-12, 'field: 2.5 m2 (no prefix)');
near(pf('4k7 m2', 'm2', 'm²').val, 4700, 1e-12, 'field: 4k7 m2 is 4700 m² (infix number, not a prefix)');
if (A.UNITS.b3wm2) {
  near(pf('1 mW/cm2', 'b3wm2', 'W/m²').val, 10, 1e-12, 'field: 1 mW/cm2 = 10 W/m²');
  near(pf('1 uW/cm2', 'b3wm2', 'W/m²').val, 1e-2, 1e-12, 'field: 1 uW/cm2 = 0.01 W/m²');
  near(pf('10 kW/m2', 'b3wm2', 'W/m²').val, 1e4, 1e-12, 'field: 10 kW/m2: prefix on the watts stays linear');
}
// fmtSI picks the prefix after rounding (E1-4)
ok(A.fmtSI(999.996, 'Hz') === '1 kHz', 'fmtSI: 999.996 Hz at 5 digits is 1 kHz', A.fmtSI(999.996, 'Hz'));
ok(A.fmtSI(999.6e6, 'Hz', 3) === '1 GHz', 'fmtSI: 999.6 MHz at 3 digits is 1 GHz', A.fmtSI(999.6e6, 'Hz', 3));
ok(A.fmtSI(0.999995, 'Hz', 4) === '1 Hz', 'fmtSI: 0.999995 Hz at 4 digits is 1 Hz', A.fmtSI(0.999995, 'Hz', 4));
ok(A.fmtSI(999.4e6, 'Hz', 3) === '999 MHz', 'fmtSI: 999.4 MHz stays MHz', A.fmtSI(999.4e6, 'Hz', 3));
ok(A.fmtSI(-999.996, 'Hz') === '-1 kHz', 'fmtSI: negative boundary', A.fmtSI(-999.996, 'Hz'));
// complex helpers (E2-1 .. E2-4)
ok(isNaN(A.cx(50, NaN).im) && A.cx(3).im === 0, 'cx: NaN imaginary part is kept, omitted one is 0');
ok(isNaN(A.zToGamma(A.cx(50, NaN), 50).im), 'cx: invalid reactance is not silently 0 in zToGamma');
{
  const q = A.cdiv(A.cx(1, 1), A.cx(1e200, 1e200));
  near(q.re, 1e-200, 1e-12, 'cdiv: huge divisor (Smith)'); nearAbs(q.im, 0, 1e-300, 'cdiv: huge divisor, imaginary 0');
  near(A.cdiv(A.cx(1), A.cx(1e-160)).re, 1e160, 1e-12, 'cdiv: tiny divisor');
  const q2 = A.cdiv(A.cx(3, 4), A.cx(1, -2));   // (3+4j)/(1-2j) = -1 + 2j
  near(q2.re, -1, 1e-15, 'cdiv: ordinary quotient re'); near(q2.im, 2, 1e-15, 'cdiv: ordinary quotient im');
  near(A.zToGamma(A.cx(1e300), 50).re, 1, 1e-12, 'zToGamma: R = 1e300 is an open (Γ = 1)');
  near(A.zToGamma(A.cx(Infinity), 50).re, 1, 1e-12, 'zToGamma: R = ∞ is an open (Γ = 1)');
}
{
  const r1 = A.csqrt(A.cx(-1, 1e-10));
  near(r1.re, 5e-11, 1e-9, 'csqrt: no cancellation for Re < 0'); near(r1.im, 1, 1e-15, 'csqrt: (-1 + 1e-10 j) imaginary');
  const r2 = A.csqrt(A.cx(1e308, 1e308));
  near(r2.re, 1.0986841134678099e154, 1e-12, 'csqrt: no overflow near 1e308'); near(r2.im, 4.550898605622274e153, 1e-12, 'csqrt: 1e308 imaginary');
  const r3 = A.csqrt(A.cx(3, 4)), r4 = A.csqrt(A.cx(-3, -4)), r5 = A.csqrt(A.cx(-4, 0));
  ok(r3.re === 2 && r3.im === 1 && r4.re === 1 && r4.im === -2 && r5.re === 0 && r5.im === 2, 'csqrt: principal branch', JSON.stringify([r3, r4, r5]));
}
{
  const I = s => [[A.cx(s), A.cx(0)], [A.cx(0), A.cx(s)]];
  const inv = A.mInv(I(1e-15));
  ok(inv && Math.abs(inv[0][0].re - 1e15) < 1, 'mInv: 1e-15 I is not singular (scale-relative pivot test)', inv && inv[0][0].re);
  const Cm = A.mInv([[A.cx(2e-15), A.cx(-1e-15)], [A.cx(-1e-15), A.cx(2e-15)]]);
  ok(Cm && Math.abs(Cm[0][0].re / (2 / 3e-15) - 1) < 1e-12 && Math.abs(Cm[0][1].re / (1 / 3e-15) - 1) < 1e-12, 'mInv: well-conditioned fF matrix', Cm && Cm[0][0].re);
  ok(A.mInv([[A.cx(1e3), A.cx(1e3)], [A.cx(1e3), A.cx(1e3 * (1 + 3e-16))]]) === null, 'mInv: numerically singular matrix with 1e3 entries is null');
  ok(A.mInv([[A.cx(1), A.cx(1)], [A.cx(1), A.cx(1 + 3e-16)]]) === null, 'mInv: same matrix scaled to 1 is null too');
  ok(A.mInv([[A.cx(NaN), A.cx(0)], [A.cx(0), A.cx(1)]]) === null, 'mInv: NaN pivot is singular');
  // I + S of two ideal shorts entered at 180°: only cancellation residue. With the
  // operand scale (1 + max|S|) it is singular; without it, it is just a small matrix.
  const res = [[A.cx(0, 1.2246e-16), A.cx(0)], [A.cx(0), A.cx(0, 1.2246e-16)]];
  ok(A.mInv(res, 2) === null, 'mInv: cancellation residue is singular relative to the operand scale');
  ok(A.mInv(res) !== null, 'mInv: without a scale the same matrix is inverted');
  const Cs = A.mInv([[A.cx(2e-15), A.cx(-1e-15)], [A.cx(-1e-15), A.cx(2e-15)]], 2e-15);
  ok(Cs && Math.abs(Cs[0][0].re / (2 / 3e-15) - 1) < 1e-12, 'mInv: a scale equal to the entries changes nothing');
  ok(A.mInv([[A.cx(1), A.cx(0)], [A.cx(0), A.cx(1)]], NaN) !== null, 'mInv: a NaN scale is ignored');
}
// inRange: each bound has its own tolerance; infinities by side (E3-1, S3)
{
  ok(!A.inRange({ min: 1e-9, max: 1e12 }, -999), 'inRange: -999 Ω fails min 1e-9 despite max 1e12');
  ok(!A.inRange({ min: 1, max: 1e12 }, -5.8), 'inRange: VSWR -5.8 fails min 1');
  ok(!A.inRange({ min: 1e-15, max: 1e15 }, -1e5), 'inRange: posV -1e5 fails');
  ok(A.inRange({ min: 1, max: 1e12 }, 1 - 1e-10) && A.inRange({ min: 0, max: 100 }, 100 + 1e-8), 'inRange: round-off at a bound passes');
  ok(!A.inRange({ min: 0, max: 100 }, 100.001), 'inRange: max still enforced');
  ok(A.inRange({ min: 1, max: 1e12 }, Infinity) && A.inRange({}, -Infinity), 'inRange: ∞ allowed on the open side');
  ok(!A.inRange({ min: -10, max: -1 }, Infinity) && !A.inRange({ min: 1e-12, max: 1e12 }, -Infinity), 'inRange: ∞ rejected on the wrong side');
  ok(!A.inRange({ min: 0, max: 1 }, NaN), 'inRange: NaN rejected');
}
{
  // coax with D < d: no negative impedance (G2-F3)
  const c = byId('coax'); const st = A.calcInit(c);
  A.calcEdit(c, st, 'D', 0.5e-3);
  ok(st.status.Z0 === 'err' && /Z/.test(st.msg), 'coax: D < d gives no (negative) Z0', st.status.Z0 + ' ' + st.vals.Z0);
  // spower2 with |S11| > 0 dB: no negative VSWR (C2-F3)
  const c2 = byId('spower2'); const s2 = A.calcInit(c2);
  A.calcEdit(c2, s2, 's21', -10); A.calcEdit(c2, s2, 's11', 3);
  ok(!(s2.vals.vswr < 1), 'spower2: |S11| = +3 dB never shows VSWR < 1', s2.vals.vswr);
  // negative noise figure: F < 1 / Te < 0 not accepted as calculated (C10-F2)
  const c3 = byId('nf'); const s3 = A.calcInit(c3);
  A.calcEdit(c3, s3, 'nf', -1);
  ok(s3.status.F === 'err' && s3.status.te === 'err', 'nf: NF = -1 dB gives no F < 1 / Te < 0', JSON.stringify(s3.status));
  // an out-of-range input is named in the message (U1-F8)
  const c4 = byId('fspl'); const s4 = A.calcInit(c4);
  A.calcEdit(c4, s4, 'f', -5e9);
  ok((s4.badIn || []).includes('f') && /^Frequency[^.]*out of range/.test(s4.msg), 'fspl: f = -5 GHz names the frequency as out of range', s4.msg);
  A.calcEdit(c4, s4, 'f', 2.4e9);
  ok(!(s4.badIn || []).length && !s4.msg, 'fspl: message clears with a valid frequency', s4.msg);
}
// span: start/stop with a large ratio (C11-1, block guess checked without ln/exp round-off)
{
  const c = byId('span');
  for (const [a, b] of [[9e3, 26.5e9], [9e3, 110e9], [1, 1e9], [1e3, 1e10]]) {
    const st = A.calcInit(c);
    A.calcEdit(c, st, 'start', a); A.calcEdit(c, st, 'stop', b);
    near(st.vals.center, (a + b) / 2, 1e-12, 'span: centre for ' + a + ' to ' + b + ' Hz');
    near(st.vals.span, b - a, 1e-12, 'span: span for ' + a + ' to ' + b + ' Hz');
  }
}
{
  // the same with the original block structure (start/stop as outputs of centre/span,
  // log scale): the exact guess must not be lost to ln/exp round-off in the Newton block
  const fq = (id, def) => ({ id: id, label: id, scale: 'log', min: 1e-3, max: 1e15, def: def });
  const c = { id: 'spanblock', vars: [fq('start'), fq('stop'), fq('center', 2441.75e6), fq('span', 83.5e6)],
    eqs: [A.E('start', ['center', 'span'], v => v.center - v.span / 2), A.E('stop', ['center', 'span'], v => v.center + v.span / 2)],
    guess: v => ({ center: (v.start + v.stop) / 2, span: v.stop - v.start }) };
  for (const [a, b] of [[9e3, 26.5e9], [1, 1e9]]) {
    const st = A.calcInit(c);
    A.calcEdit(c, st, 'start', a); A.calcEdit(c, st, 'stop', b);
    ok(st.status.center === 'calc' && st.status.span === 'calc', 'newton block: centre/span from start ' + a + ' / stop ' + b, JSON.stringify(st.status) + ' ' + st.msg);
    near(st.vals.center, (a + b) / 2, 1e-12, 'newton block: centre for ' + a + ' to ' + b + ' Hz');
  }
}
// demotion prefers a solvable set; blocks of 4 coupled equations (E3-2, E3-3)
if (byId('sinr')) {
  const c = byId('sinr'); let st = A.calcInit(c);
  A.calcEdit(c, st, 'sinr', 10); A.calcEdit(c, st, 'i', -120);
  ok(solved(c, st), 'sinr: SINR then I stays solvable', JSON.stringify(st.status) + ' ' + st.msg);
  const v = Object.assign({ $: st.cfg }, st.vals);
  ok(c.eqs.every(eq => Math.abs(A.residual(c, eq, v)) < 1e-6), 'sinr: consistent after SINR, I');
  st = A.calcInit(c);
  ok(A.analyze(c, ['s', 'i', 'sinr']).unknown.length === 0, 'analyze: {S, I, SINR} is solvable (4-equation block)');
  A.calcEdit(c, st, 'i', -117); A.calcEdit(c, st, 'sinr', 12);
  near(st.vals.n, 10 * Math.log10(Math.pow(10, -11.2) - Math.pow(10, -11.7)), 1e-9, 'sinr: N from S, I and SINR = -113.651 dBm');
}
if (byId('mmunc')) {
  const c = byId('mmunc'); const st = A.calcInit(c);
  const v2 = st.vals.vswr2, ml = st.vals.mlmin;
  A.calcEdit(c, st, 'mlmin', ml);
  near(st.vals.vswr2, v2, 1e-6, 'mmunc: typing the calculated best-phase loss back gives VSWR2 again');
}
// findRoot: plateau keeps the previous value and is reported (E3-4)
{
  const info = {};
  const g = x => x < 5 ? 0 : (x - 5) / 5;   // no influence of x below 5
  ok(A.findRoot(g, 1e-3, 1e3, 'log', 2, info) === 2 && info.plateau && info.plateau[1] < 5, 'findRoot: plateau returns the previous value and reports it', JSON.stringify(info));
  const info2 = {};
  near(A.findRoot(x => Math.log(x / 7), 1e-3, 1e3, 'log', 7.5, info2), 7, 1e-12, 'findRoot: isolated root');
  ok(!info2.plateau, 'findRoot: no plateau for an isolated root');
}
if (byId('tworay')) {
  const c = byId('tworay'); const st = A.calcInit(c);
  A.calcEdit(c, st, 'L', 114.8946); A.calcEdit(c, st, 'd', 5000); A.calcEdit(c, st, 'f', NaN);
  ok(st.vals.f === 900e6 && /not determined/.test(st.msg), 'tworay: beyond the crossover f keeps 900 MHz and says it is not determined', st.vals.f + ' ' + st.msg);
}
// findRoot: cells with one non-finite end (E3-5)
near(A.findRoot(x => (1 / (x - 3) - 1e6) / 1e6, -10, 10, 'lin'), 3.000001, 1e-12, 'findRoot: pole on a grid point');
near(A.findRoot(x => (1 / x - 0.5) / 0.5, 0, 1e6, 'lin'), 2, 1e-12, 'findRoot: linear grid starting at a singular 0');
near(A.findRoot(x => Math.sqrt(1.05 - x) / 0.01 - 1, 1e-3, 10, 'log'), 1.0499, 1e-9, 'findRoot: root next to the edge of the domain');
if (byId('minloss')) {
  const c = byId('minloss'); const st = A.calcInit(c);
  A.calcEdit(c, st, 'r2', 300);
  near(st.vals.zl, 70.82039324993691, 1e-9, 'minloss: R2 = 300 Ω (root next to zl = zh) solves');
}
// symlog grid includes the bounds (E3-6)
{
  const xs = A.makeGrid(-1e12, 1e12, 'lin');
  ok(xs[0] === -1e12 && xs[xs.length - 1] === 1e12 && xs.every((x, i) => i === 0 || x > xs[i - 1]), 'makeGrid: symlog grid has both bounds and increases');
  const ys = A.makeGrid(1e-3, 1e15, 'log');
  ok(ys[0] === 1e-3 && ys[ys.length - 1] === 1e15, 'makeGrid: log grid ends exactly at the bounds');
  for (const t of [1e12, -1e12, 0.97e12]) near(A.findRoot(x => (x - t) / Math.max(1, Math.abs(x), Math.abs(t)), -1e12, 1e12, 'lin'), t, 1e-9, 'findRoot: y = x near the end of ±1e12 (' + t + ')');
  near(A.findRoot(x => (x - 0.97e6) / 1e6, -1e12, 1e6, 'lin'), 0.97e6, 1e-9, 'findRoot: smaller-bound side of an asymmetric range');
}
// Newton block: a small absolute residual is not accepted without a small step (E3-7)
{
  const lin = (id, def) => ({ id: id, label: id, scale: 'lin', min: -1e9, max: 1e9, def: def });
  const c = { id: 'tiny', vars: [lin('x', 3), lin('y', 1), lin('u'), lin('w')],
    eqs: [A.E('u', ['x', 'y'], v => (v.x + v.y) * 1e-12), A.E('w', ['x', 'y'], v => (v.x - v.y) * 1e-12)] };
  const st = A.calcInit(c);
  A.calcEdit(c, st, 'u', 10e-12); A.calcEdit(c, st, 'w', 2e-12);
  near(st.vals.x, 6, 1e-9, 'newton: tiny linear outputs, x = 6'); near(st.vals.y, 4, 1e-9, 'newton: tiny linear outputs, y = 4');
}
// The solver is scale-invariant for linear variables (E3-7 round 2): residuals are
// relative to the size of each equation's terms, the Newton step to the unknowns.
{
  const lin = (id, def) => ({ id: id, label: id, scale: 'lin', min: -1e9, max: 1e9, def: def });
  const mk = (k, sx, eqs) => ({ id: 'scale' + k, vars: [lin('x', 3 * sx), lin('y', 1 * sx), lin('u'), lin('w')], eqs: eqs(k) });
  const linEq = k => [A.E('u', ['x', 'y'], v => (v.x + v.y) * k), A.E('w', ['x', 'y'], v => (v.x - v.y) * k)];
  const sing = k => [A.E('u', ['x', 'y'], v => (v.x + v.y) * k), A.E('w', ['x', 'y'], v => 2 * (v.x + v.y) * k)];
  const nl = k => [A.E('u', ['x', 'y'], v => (v.x * v.x + v.y) * k), A.E('w', ['x', 'y'], v => (v.x - v.y * v.y) * k)];
  for (const k of [1, 1e-3, 1e-12, 1e-20]) {
    let c = mk(k, 1, linEq), st = A.calcInit(c);
    A.calcEdit(c, st, 'u', 10 * k); A.calcEdit(c, st, 'w', 2 * k);
    ok(Math.abs(st.vals.x - 6) < 1e-9 && Math.abs(st.vals.y - 4) < 1e-9, 'solver scale: linear block x = 6, y = 4 at k = ' + k, st.vals.x + ', ' + st.vals.y);
    // inconsistent singular block: no solution at any scale (was silently accepted for small k)
    c = mk(k, 1, sing); st = A.calcInit(c);
    A.calcEdit(c, st, 'u', 10 * k); A.calcEdit(c, st, 'w', 2 * k);
    ok(st.msgLevel === 'err' && st.status.x === 'err', 'solver scale: inconsistent singular block is an error at k = ' + k, JSON.stringify(st.vals) + ' ' + st.msg);
    // nonlinear block without a solution (x − (25 − x²)² ≤ 5.1 < 126.5)
    c = mk(k, 1, nl); st = A.calcInit(c);
    A.calcEdit(c, st, 'u', 25 * k); A.calcEdit(c, st, 'w', 126.5 * k);
    ok(st.msgLevel === 'err' && st.status.x === 'err', 'solver scale: nonlinear block without a solution is an error at k = ' + k, JSON.stringify(st.vals) + ' ' + st.msg);
    // single unknown: y from u with x held (was a false plateau for k = 1e-15)
    c = mk(k, 1, linEq); st = A.calcInit(c);
    A.calcEdit(c, st, 'u', 10 * k);
    ok(Math.abs(st.vals.y - 7) < 1e-9 && !st.msg, 'solver scale: y = 7 from u with x held at k = ' + k, st.vals.y + ' ' + st.msg);
  }
  for (const s of [1e-12, 1e-6]) {
    const c = mk(1, s, linEq), st = A.calcInit(c);
    A.calcEdit(c, st, 'u', 10 * s); A.calcEdit(c, st, 'w', 2 * s);
    near(st.vals.x, 6 * s, 1e-9, 'solver scale: tiny unknowns x = 6e' + Math.log10(s)); near(st.vals.y, 4 * s, 1e-9, 'solver scale: tiny unknowns y = 4e' + Math.log10(s));
  }
  // a target of 0 is judged against the terms that cancel to give it
  const c = { id: 'zero', vars: [lin('x', 3e-12), lin('y'), lin('u', 0)], eqs: [A.E('u', ['x', 'y'], v => v.x - v.y)] };
  const st = A.calcInit(c);
  near(st.vals.y, 3e-12, 1e-9, 'solver scale: u = x − y = 0 with x = 3e-12 gives y = 3e-12');
}
// message order: an unresolved over-determination is an error even when a step
// also lands on a plateau (regression review)
{
  const lin = (id, def) => ({ id: id, label: id, scale: 'lin', min: -10, max: 10, def: def });
  const c = { id: 'prec', vars: [lin('a', 4), lin('p', 1), lin('q')],
    eqs: [A.E('a', [], () => 5), A.E('p', ['q'], v => Math.min(v.q, 1))] };
  const st = A.calcInit(c);
  ok(st.msgLevel === 'err' && /Over-determined/.test(st.msg), 'calcSolve: conflict message wins over a plateau note', st.msgLevel + ' ' + st.msg);
}

// ------------------------------- final audit follow-ups (lead review) -----
{
  const ev = code => vm.runInContext(code, ctx);
  // E3-7 follow-up: the scaled Newton must not lose O(1) solutions the classic iteration finds
  const c = byId('spower2'); const st = A.calcInit(c);
  for (const k of c.eqVars) { st.status[k] = 'empty'; st.vals[k] = NaN; }
  A.calcEdit(c, st, 'vswr', 1.43); A.calcEdit(c, st, 'pout', -0.5); A.calcEdit(c, st, 'ploss', -11.128);
  A.calcEdit(c, st, 'vswr', 2.557);
  const g = (2.557 - 1) / (2.557 + 1), m = x => Math.pow(10, x / 10);
  near(st.vals.pin, 10 * Math.log10((m(-0.5) + m(-11.128)) / (1 - g * g)), 1e-9, 'spower2: Pin solved from VSWR, Pout, Ploss after a VSWR edit (Newton fallback)');
  // E2-2 follow-up: ideal shorts / opens typed as 1∠180° / 1∠360° are singular, not huge numbers
  ok(ev('sToY([[cpol(1,180),cx(0)],[cx(0),cpol(1,180)]], 50)') === null, 'sToY: two ideal shorts (1∠180°) are singular');
  ok(ev('sToZ([[cpol(1,360),cx(0)],[cx(0),cpol(1,360)]], 50)') === null, 'sToZ: two ideal opens (1∠360°) are singular');
  ok(ev('(() => { const P = [[cpol(0.72,-116),cpol(0.03,57)],[cpol(2.60,76),cpol(0.73,-54)]]; return mMaxAbs(mSub(zToS(sToZ(P,50),50),P)); })()') < 1e-12, 'S -> Z -> S still round-trips with the operand-scaled pivot test');
  // C3-s2/F4 follow-up: MAG on the lossless / passive boundary (K = 1) equals MSG
  near(ev('s2Analyze([[cx(0.2),cx(0.8)],[cx(0.8),cx(0.2)]], 50, cx(50), cx(50)).MAG'), 1, 1e-9, 's2: MAG of a series 25 Ω resistor is 1 (0 dB)');
  near(ev('s2Analyze([[cx(0),cx(1)],[cx(1),cx(0)]], 50, cx(50), cx(50)).MAG'), 1, 1e-9, 's2: MAG of an ideal through is 1 (0 dB)');
  near(ev('s2Analyze([[cpol(0.72,-116),cpol(0.03,57)],[cpol(2.60,76),cpol(0.73,-54)]], 50, cx(50), cx(50)).MAG'), 46.88345, 1e-6, 's2: Pozar 12.3 MAG unchanged');
  ok(ev('s2Analyze([[cx(0.2),cx(0.8)],[cx(0.8),cx(0.2)]], 50, cx(50), cx(50)).MAG') <= 1, 's2: MAG never exceeds MSG (series 25 Ω shows exactly 0 dB)');
  // lossless series resonator: BW = 0 and Q = ∞, no error
  { const c = byId('resonance'); const st = A.calcInit(c); A.calcEdit(c, st, 'Rs', 0);
    ok(st.vals.bw === 0 && st.status.bw === 'calc' && st.vals.Q === Infinity && !st.msg, 'resonance: Rs = 0 gives BW 0 and Q ∞', JSON.stringify([st.vals.bw, st.vals.Q, st.msg]));
    A.calcEdit(c, st, 'Rs', 1e-12);
    near(st.vals.bw, 1e-12 / (2 * Math.PI * 1e-7), 1e-12, 'resonance: Rs = 1e-12 Ω gives BW = Rs/(2πL)'); }
  // impossible lossless combinations are errors, never fake values (C = 0 / f0 = ∞ / L = ∞)
  { const c = byId('resonance');
    const only = ins => { const st = A.calcInit(c); for (const k of c.eqVars) { st.status[k] = 'empty'; st.vals[k] = NaN; } for (const k in ins) A.calcEdit(c, st, k, ins[k]); return st; };
    let st = only({ L: 1e-7, Rs: 2, Q: Infinity });
    ok(st.status.C === 'err' && st.status.f0 === 'err', 'resonance: Rs = 2 with Q = ∞ is impossible (no C = 0 / f0 = ∞)', JSON.stringify([st.vals.C, st.vals.f0]));
    st = only({ C: 1e-11, Rs: 2, bw: 0 });
    ok(st.status.L === 'err', 'resonance: Rs > 0 with BW = 0 is impossible (no L = ∞)', st.vals.L);
    st = only({ C: 1e-11, Rs: 0, bw: 0 });
    ok(/does not fix L and C/.test(c.warn(ev('calcValues')(c, st)) || ''), 'resonance: Rs = 0 and BW = 0 explain that L is undetermined');
    st = A.calcInit(c); A.calcEdit(c, st, 'Rs', 0);
    ok(c.outputs.find(o => o.label.indexOf('Equivalent parallel') === 0).fn(ev('calcValues')(c, st)) === Infinity, 'resonance: lossless parallel equivalent Rp = ∞');
    st = A.calcInit(c); A.calcEdit(c, st, 'Rs', 1e-14);
    near(st.vals.Q, 1e16, 1e-9, 'resonance: Q above 1e15 is allowed (Rs = 1e-14 Ω)'); }
  // K = 1 boundary networks: MAG = MSG exactly and no conjugate-match point is offered
  { const ser = R => { const z = R / 50, a = z / (z + 2), b = 2 / (z + 2); return `[[cx(${a}),cx(${b})],[cx(${b}),cx(${a})]]`; };
    const shu = R => { const y = 50 / R, a = -y / (y + 2), b = 2 / (y + 2); return `[[cx(${a}),cx(${b})],[cx(${b}),cx(${a})]]`; };
    for (const [n, S] of [['series 200 Ω', ser(200)], ['series 10 kΩ', ser(1e4)], ['shunt 1 Ω', shu(1)], ['shunt 0.02 Ω', shu(0.02)]]) {
      const r = ev(`(() => { const r = s2Analyze(${S}, 50, cx(50), cx(50)); return { mag: r.MAG, msg: r.MSG, match: r.match }; })()`);
      ok(r.mag === r.msg, 's2: ' + n + ' MAG = MSG exactly on the K = 1 boundary', r.mag + ' vs ' + r.msg);
      ok(r.match === null, 's2: ' + n + ' offers no conjugate-match point on the K = 1 boundary', JSON.stringify(r.match));
    }
    // a genuinely stable device keeps its match, with GT at the match = MAG
    const g = ev(`(() => { const P = [[cpol(0.72,-116),cpol(0.03,57)],[cpol(2.60,76),cpol(0.73,-54)]]; const r = s2Analyze(P, 50, cx(50), cx(50)); return { mag: r.MAG, gt: s2Analyze(P, 50, r.match.zs, r.match.zl).GT }; })()`);
    near(g.gt, g.mag, 1e-9, 's2: Pozar conjugate match still offered, GT at the match = MAG');
    // display snap: double round-off of 1 snaps, a genuine 1 − 4e-13 (VSWR ≈ 5e12) does not
    ok(ev('magSnap(1 - 1.1e-16)') === 1 && ev('magSnap(1 + 2.3e-16)') === 1, 'magSnap: |S| within round-off of 1 displays as 1');
    ok(ev('magSnap(1 - 4e-13)') !== 1 && ev('vswrOf(magSnap(1 - 4e-13))') > 4e12, 'magSnap: genuine |Γ| = 1 − 4e-13 keeps VSWR ≈ 5e12'); }
  // the lossless note never appears for contradictory lossy inputs (e.g. Rs = 2 Ω with Q = ∞)
  { const c = byId('resonance');
    const only = ins => { const st = A.calcInit(c); for (const k of c.eqVars) { st.status[k] = 'empty'; st.vals[k] = NaN; } for (const k in ins) A.calcEdit(c, st, k, ins[k]); return st; };
    for (const ins of [{ L: 1e-7, Rs: 2, Q: Infinity }, { C: 1e-11, Rs: 2, bw: 0 }, { f0: 1e8, Q: 100, bw: 0 }])
      ok(!c.warn(ev('calcValues')(c, only(ins))), 'resonance: no lossless note for contradictory ' + JSON.stringify(ins));
    ok(!!c.warn(ev('calcValues')(c, only({ L: 1e-7, Rs: 0, Q: Infinity }))), 'resonance: lossless note for {L, Rs = 0, Q = ∞}'); }
  // extreme single elements: K numerator without O(1) cancellation, MAG = MSG = 0 dB
  { const ser = Z => `(() => { const z = cscale(${Z}, 1/50), d = cadd(z, cx(2)), a = cdiv(z, d), b = cdiv(cx(2), d); return [[a, b], [b, a]]; })()`;
    const shu = Z => `(() => { const y = cscale(cinv(${Z}), 50), d = cadd(y, cx(2)), a = cneg(cdiv(y, d)), b = cdiv(cx(2), d); return [[a, b], [b, a]]; })()`;
    for (const [n, S] of [['series 1 MΩ', ser('cx(1e6)')], ['series j1 GΩ', ser('cx(0, 1e9)')], ['shunt 1 µΩ', shu('cx(1e-6)')], ['shunt 1 pH at 1 MHz', shu('cx(0, 2*Math.PI*1e6*1e-12)')]])
      ok(ev(`dbp(s2Analyze(${S}, 50, cx(50), cx(50)).MAG)`) === 0, 's2: ' + n + ' MAG exactly 0 dB');
    // a genuine device with K − 1 = 5e-10 keeps MSG·(K − √(K² − 1)) (no snap to MSG)
    const k = 1 + 5e-10, pp = k - Math.sqrt(k * k - 1);
    near(ev(`s2Analyze([[cx(0), cx(${pp / 2})], [cx(2), cx(0)]], 50, cx(50), cx(50)).MAG`), 4, 1e-9, 's2: genuine K − 1 = 5e-10 device keeps its exact MAG (= |S21|²)');
    // 'finite' variables refuse ∞ at input too
    ok(!ev(`inputInRange(CALCS.find(c => c.id === 'resonance').vars.find(v => v.id === 'f0'), Infinity)`), 'resonance: typing ∞ for f0 is refused at input'); }
  // zero system temperature: no bandwidth can give a finite floor
  { const c = byId('sens'); const st = A.calcInit(c);
    for (const k of c.eqVars) { st.status[k] = 'empty'; st.vals[k] = NaN; }
    A.calcEdit(c, st, 't', 0); A.calcEdit(c, st, 'nf', 0); A.calcEdit(c, st, 'floor', -100); A.calcEdit(c, st, 'snr', 10);
    ok(st.status.bw === 'err', 'sens: T = 0 K and NF = 0 dB give no valid bandwidth (not ∞)', st.status.bw + ' ' + st.vals.bw); }
  // deep cascades: S12 = S21 for reciprocal chains (exact determinant, no AD − BC cancellation)
  for (const a of [130, 160, 180]) {
    const S = ev(`b3Cascade([{ type: 'att', v: { a: '${a}' } }], 1e9, 50).S`);
    near(20 * Math.log10(Math.hypot(S[0][1].re, S[0][1].im)), -a, 1e-9, `cascade2p: ${a} dB attenuator S12 = S21`);
  }
  near(20 * Math.log10(ev(`cabs(b3Cascade([{ type: 'amp', v: { g: '20', iso: '260' } }], 1e9, 50).S[0][1])`)), -260, 1e-9, 'cascade2p: amplifier isolation 260 dB kept in S12');
  // spower2: output + dissipated power with a known VSWR (closed-form Newton guess)
  for (const [vswr, pout, ploss] of [[2, 0, 3], [1, 0, 0], [5, -0.5, 10], [1.2, 0, 3]]) {
    const c2 = byId('spower2'), s2 = A.calcInit(c2);
    for (const k of c2.eqVars) { s2.status[k] = 'empty'; s2.vals[k] = NaN; }
    A.calcEdit(c2, s2, 'vswr', vswr); A.calcEdit(c2, s2, 'pout', pout); A.calcEdit(c2, s2, 'ploss', ploss);
    const gg = (vswr - 1) / (vswr + 1);
    near(s2.vals.pin, 10 * Math.log10((m(pout) + m(ploss)) / (1 - gg * gg)), 1e-9, `spower2: Pin from VSWR ${vswr}, Pout ${pout}, Ploss ${ploss} dBm`);
  }
}

// ------------------------------------------------ batch test modules -----
// test/bN.test.js exports function (T) using T.ok / T.near (relative) / T.nearAbs / T.byId / T.evalIn(expr) / T.A
// test/calcs.test.js (phase-1 calculators) always runs; batch modules follow --only.
for (const b of ['calcs'].concat(BATCHES)) {
  const f = path.join(__dirname, b + '.test.js');
  if (!fs.existsSync(f)) continue;
  const before = pass + fail;
  try {
    require(f)({ A: A, ctx: ctx, ok: ok, near: near, nearAbs: nearAbs, byId: byId, solved: solved, evalIn: code => vm.runInContext(code, ctx) });
  } catch (e) { ok(false, b + '.test.js threw', e && e.stack); }
  console.log('  ' + b + ': ' + (pass + fail - before) + ' checks');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (BATCHES.length ? ' (batches: ' + BATCHES.join(', ') + ')' : ''));
process.exit(fail ? 1 : 0);

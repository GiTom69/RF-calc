// ============================================================================
// calcs.js - calculator definitions. Solver calculators list their variables
// and equations; the engine in core.js solves whatever is left blank.
// Custom (forward-only) calculators are rendered by ui.js.
// ============================================================================

const CATS = [
  ['power', 'Power & Units'],
  ['mismatch', 'Mismatch & S-Parameters'],
  ['matching', 'Matching & Lumped'],
  ['lines', 'Transmission Lines'],
  ['prop', 'Propagation & Link Budget'],
  ['ant', 'Antennas'],
  ['noise', 'Noise & Receiver'],
  ['ew', 'EW & Interference'],
  ['freq', 'Frequency Planning'],
  ['comp', 'Components'],
  ['ref', 'Reference Data'],
];

// ---- variable factories -----------------------------------------------------
const mk = (base, o) => Object.assign(base, o || {});
const fq = (id, label, def, du, o) => mk({ id: id, label: label, unit: 'Hz', du: du || 'MHz', def: def, scale: 'log', min: 1e-3, max: 1e15 }, o);
const lenV = (id, label, def, du, o) => mk({ id: id, label: label, unit: 'm', du: du || 'mm', def: def, scale: 'log', min: 1e-12, max: 1e12 }, o);
const dbV = (id, label, def, sym, o) => mk({ id: id, label: label, sym: sym || 'dB', def: def, scale: 'lin', min: -1000, max: 1000 }, o);
const ohmV = (id, label, def, o) => mk({ id: id, label: label, unit: 'ohm', du: 'Ω', def: def, scale: 'log', min: 1e-9, max: 1e12 }, o);
const posV = (id, label, def, sym, o) => mk({ id: id, label: label, sym: sym || '', def: def, scale: 'log', min: 1e-15, max: 1e15 }, o);
const linV = (id, label, def, sym, o) => mk({ id: id, label: label, sym: sym || '', def: def, scale: 'lin', min: -1e9, max: 1e9 }, o);
const uV = (id, label, unit, du, def, o) => mk({ id: id, label: label, unit: unit, du: du, def: def, scale: 'log', min: 1e-18, max: 1e18 }, o);
const xV = (id, label, def, o) => mk({ id: id, label: label, unit: 'ohm', du: 'Ω', def: def, scale: 'lin', min: -1e12, max: 1e12 }, o);

// output rows: O(label, fn, unit, si) - si=true formats with SI prefixes
const O = (label, fn, unit, si) => ({ label: label, fn: fn, unit: unit || '', si: !!si });

const lam = f => C0 / f;
// X as an inductance or capacitance at f. ref (optional) is the impedance level of the
// circuit: |X| below 1e-12·ref is floating-point residue and counts as no reactance.
const reactText = (X, f, ref) => {
  if (!isFinite(X) || !isFinite(f)) return NaN;
  const w = 2 * PI * f;
  if (Math.abs(X) < Math.max(1e-15, 1e-12 * (ref > 0 ? ref : 0))) return 'no reactance';
  return X > 0 ? 'L = ' + fmtSI(X / w, 'H') : 'C = ' + fmtSI(-1 / (w * X), 'F');
};
const gammaOf = v => zToGamma(cx(v.R, v.X), v.Z0);
// |S11| above 0 dB by more than rounding (1e-8 dB, |Γ| − 1 ≈ 1e-9) is an active port
const S11_ACTIVE_DB = 1e-8;
const ACTIVE_S11 = '⚠ |S11| > 0 dB (|Γ| > 1, active): the input reflects more power than it receives, so the VSWR is ∞ and the power shares of a passive network do not apply.';

const TOLERANCES = ['0.01', '0.05', '0.1', '0.25', '0.5', '1', '2', '5', '10', '20'];

const CALCS = [
// =============================================================== POWER ======
{
  id: 'power', cat: 'power', title: 'Power / Voltage Converter', kw: 'dbm watt volt dbuv rms peak dbw',
  desc: 'Power and voltage levels at a given system impedance. Enter any one level and all the others are filled in.',
  vars: [
    ohmV('Z', 'System impedance Z', 50, { sticky: true }),
    dbV('dBm', 'Power', 0, 'dBm'),
    dbV('dBW', 'Power', undefined, 'dBW'),
    uV('W', 'Power', 'W', 'mW'),
    uV('Vrms', 'Voltage (RMS)', 'V', 'mV'),
    uV('Vpk', 'Voltage (peak)', 'V', 'mV'),
    uV('Vpp', 'Voltage (peak-to-peak)', 'V', 'mV'),
    dbV('dBuV', 'Voltage', undefined, 'dBµV'),
  ],
  eqs: [
    E('dBW', ['dBm'], v => v.dBm - 30, { dBm: v => v.dBW + 30 }),
    E('W', ['dBm'], v => 1e-3 * fromDbp(v.dBm), { dBm: v => dbp(v.W / 1e-3) }),
    E('Vrms', ['W', 'Z'], v => sqrt(v.W * v.Z), { W: v => v.Vrms * v.Vrms / v.Z, Z: v => v.Vrms * v.Vrms / v.W }),
    E('Vpk', ['Vrms'], v => v.Vrms * Math.SQRT2, { Vrms: v => v.Vpk / Math.SQRT2 }),
    E('Vpp', ['Vpk'], v => 2 * v.Vpk, { Vpk: v => v.Vpp / 2 }),
    E('dBuV', ['Vrms'], v => dbv(v.Vrms / 1e-6), { Vrms: v => 1e-6 * fromDbv(v.dBuV) }),
  ],
  outputs: [
    O('Current (RMS)', v => v.Vrms / v.Z, 'A', true),
    O('Voltage in dBV', v => v.dBuV - 120, 'dBV'),
    O('Voltage in dBmV', v => v.dBuV - 60, 'dBmV'),
  ],
  note: 'P = V<sub>rms</sub>²/Z · V<sub>pk</sub> = √2·V<sub>rms</sub> · dBm = 10·log(P / 1 mW) · dBµV = 20·log(V<sub>rms</sub> / 1 µV). At 50 Ω: dBµV = dBm + 107.',
},
{
  id: 'dbratio', cat: 'power', title: 'dB ↔ Ratio', kw: 'decibel ratio linear neper',
  desc: 'Convert decibels to power and voltage ratios, and back.',
  vars: [
    dbV('dB', 'Decibels', 3),
    posV('Pr', 'Power ratio', undefined, '×', { min: 1e-100, max: 1e100 }),
    posV('Vr', 'Voltage / current ratio', undefined, '×', { min: 1e-50, max: 1e50 }),
  ],
  eqs: [
    E('Pr', ['dB'], v => fromDbp(v.dB), { dB: v => dbp(v.Pr) }),
    E('Vr', ['dB'], v => fromDbv(v.dB), { dB: v => dbv(v.Vr) }),
  ],
  outputs: [
    O('Nepers', v => v.dB / DB_NEPER, 'Np'),
    O('Power ratio in %', v => v.Pr * 100, '%'),
  ],
  note: 'dB = 10·log(P₂/P₁) = 20·log(V₂/V₁) · 1 Np = 8.686 dB',
},
{
  id: 'psum', cat: 'power', title: 'Adding Power Levels', kw: 'sum add subtract combine power dbm',
  desc: 'Incoherent (uncorrelated) sum of two power levels. Enter the total and one level to get the other one (subtraction).',
  vars: [
    dbV('P1', 'Power P₁', 0, 'dBm'),
    dbV('P2', 'Power P₂', -3, 'dBm'),
    dbV('Pt', 'Total P₁ + P₂', undefined, 'dBm'),
  ],
  eqs: [
    E('Pt', ['P1', 'P2'], v => dbp(fromDbp(v.P1) + fromDbp(v.P2)), {
      P1: v => dbp(fromDbp(v.Pt) - fromDbp(v.P2)),
      P2: v => dbp(fromDbp(v.Pt) - fromDbp(v.P1)),
    }),
  ],
  outputs: [
    O('Difference P₁ − P₂', v => v.P1 - v.P2, 'dB'),
    O('Coherent, in phase (max)', v => dbv(fromDbv(v.P1) + fromDbv(v.P2)), 'dBm'),
    O('Coherent, anti-phase (min)', v => dbv(Math.abs(fromDbv(v.P1) - fromDbv(v.P2))), 'dBm'),
    O('Total power', v => 1e-3 * fromDbp(v.Pt), 'W', true),
  ],
  note: 'P<sub>tot</sub> = 10·log(10<sup>P₁/10</sup> + 10<sup>P₂/10</sup>). Two equal powers add 3.01 dB.',
},
{
  id: 'wavelength', cat: 'power', title: 'Frequency ↔ Wavelength', kw: 'lambda wavelength velocity factor permittivity',
  desc: 'Wavelength in free space and in a medium (εr or velocity factor).',
  vars: [
    fq('f', 'Frequency', 1e9, 'GHz'),
    posV('er', 'Relative permittivity εr', 1, '', { sticky: true, min: 1, max: 1e6 }),
    posV('VF', 'Velocity factor', undefined, '', { min: 1e-3, max: 1 }),
    lenV('lam0', 'Free-space wavelength λ₀', undefined, 'mm'),
    lenV('lam', 'Wavelength in medium λ', undefined, 'mm'),
  ],
  eqs: [
    E('VF', ['er'], v => 1 / sqrt(v.er), { er: v => 1 / (v.VF * v.VF) }),
    E('lam0', ['f'], v => lam(v.f), { f: v => C0 / v.lam0 }),
    E('lam', ['lam0', 'VF'], v => v.lam0 * v.VF, { lam0: v => v.lam / v.VF, VF: v => v.lam / v.lam0 }),
  ],
  outputs: [
    O('λ/2 in medium', v => v.lam / 2, 'm', true),
    O('λ/4 in medium', v => v.lam / 4, 'm', true),
    O('Phase constant β', v => 2 * PI / v.lam, 'rad/m'),
    O('Period', v => 1 / v.f, 's', true),
  ],
  note: 'λ₀ = c/f · λ = λ₀·VF · VF = 1/√εr',
},

// ============================================================ MISMATCH ======
{
  id: 'vswr', cat: 'mismatch', title: 'VSWR / Return Loss / Γ', kw: 'vswr return loss reflection coefficient mismatch',
  desc: 'Enter any one of these and the others are filled in.',
  vars: [
    posV('vswr', 'VSWR', 2, ': 1', { min: 1, max: 1e18 }),
    dbV('rl', 'Return loss', undefined, 'dB', { min: 0 }),
    linV('g', 'Reflection coefficient |Γ|', undefined, '', { min: 0, max: 1 }),
    dbV('ml', 'Mismatch loss', undefined, 'dB', { min: 0 }),
    linV('pr', 'Reflected power', undefined, '%', { min: 0, max: 100 }),
    linV('pt', 'Transmitted power', undefined, '%', { min: 0, max: 100 }),
  ],
  eqs: [
    E('vswr', ['g'], v => vswrOf(v.g), { g: v => gammaOfVswr(v.vswr) }),
    E('rl', ['g'], v => -dbv(v.g), { g: v => fromDbv(-v.rl) }),
    E('ml', ['g'], v => -dbp(1 - v.g * v.g), { g: v => sqrt(1 - fromDbp(-v.ml)) }),
    E('pr', ['g'], v => 100 * v.g * v.g, { g: v => sqrt(v.pr / 100) }),
    E('pt', ['g'], v => 100 * (1 - v.g * v.g), { g: v => sqrt(1 - v.pt / 100) }),
  ],
  outputs: [
    O('S11 / Γ in dB', v => dbv(v.g), 'dB'),
  ],
  note: 'VSWR = (1+|Γ|)/(1−|Γ|) · RL = −20·log|Γ| · ML = −10·log(1−|Γ|²)',
},
{
  id: 'zgamma', cat: 'mismatch', title: 'Load Impedance ↔ Γ', kw: 'impedance gamma reflection complex load smith',
  desc: 'Complex reflection coefficient of a load Z = R + jX, or the impedance that gives a certain Γ.',
  vars: [
    ohmV('Z0', 'Reference impedance Z₀', 50, { sticky: true }),
    ohmV('R', 'Load resistance R', 75, { inMin: 0 }),
    xV('X', 'Load reactance X', 25),
    linV('g', 'Reflection coefficient |Γ|', undefined, '', { min: 0, max: 1 }),
    linV('ang', 'Angle of Γ', undefined, '°', { min: -180, max: 180, wrap: 360 }),
    posV('vswr', 'VSWR', undefined, ': 1', { min: 1, max: 1e18 }),
    dbV('rl', 'Return loss', undefined, 'dB'),
    fq('f', 'Frequency (for the L/C equivalent)', 1e9, 'MHz'),
  ],
  eqs: [
    E('g', ['R', 'X', 'Z0'], v => { const m = cabs(gammaOf(v)); return Math.abs(1 - m) <= 4 * Number.EPSILON ? 1 : m; }),
    E('ang', ['R', 'X', 'Z0'], v => cdeg(gammaOf(v))),
    E('vswr', ['g'], v => vswrOf(v.g), { g: v => gammaOfVswr(v.vswr) }),
    E('rl', ['g'], v => -dbv(v.g), { g: v => fromDbv(-v.rl) }),
  ],
  guess: v => {
    if (!isFinite(v.g) || !isFinite(v.ang) || !isFinite(v.Z0)) return null;
    const z = gammaToZ(cpol(v.g, v.ang), v.Z0);
    return { R: z.re, X: z.im };
  },
  outputs: [
    O('Γ (rectangular)', v => fmtC(gammaOf(v), 5)),
    O('Normalized z = Z/Z₀', v => fmtC(cx(v.R / v.Z0, v.X / v.Z0), 5)),
    O('Admittance Y = G + jB', v => { const y = cinv(cx(v.R, v.X)); return fmtC(cscale(y, 1e3), 5, 'mS'); }),
    O('Mismatch loss', v => -dbp(1 - v.g * v.g), 'dB'),
    O('Reflected power', v => 100 * v.g * v.g, '%'),
    O('Series equivalent of X', v => reactText(v.X, v.f, Math.max(v.Z0, Math.abs(v.R)))),
  ],
  note: 'Γ = (Z − Z₀)/(Z + Z₀). Enter |Γ| and its angle (or VSWR and angle) to get R and X.',
},
{
  id: 'spower2', cat: 'mismatch', title: 'S-Parameters: Simple Power View (2-Port)', kw: 's11 s21 power transfer insertion loss magnitude',
  desc: 'Uses magnitudes only (no phase) and shows where the input power goes: reflected, transmitted or dissipated. Fill any 3 independent values. For example, enter S11 and the loss to get S21. |S11|, return loss, VSWR and reflected power are views of one quantity and count once.',
  vars: [
    dbV('s11', '|S11|', -15, 'dB'),
    dbV('s21', '|S21|', -0.5, 'dB'),
    dbV('pin', 'Input power', 0, 'dBm', { sticky: true }),
    dbV('rl', 'Return loss', undefined, 'dB'),
    posV('vswr', 'Input VSWR', undefined, ': 1', { min: 1, max: 1e18 }),
    linV('refl', 'Reflected power', undefined, '%', { min: 0, max: 100 }),
    linV('trans', 'Transmitted power', undefined, '%', { min: 0, max: 1e9 }),
    linV('loss', 'Dissipated (lost) power', undefined, '%', { min: -1e9, max: 100 }),
    dbV('il', 'Insertion loss (−S21)'),
    dbV('ml', 'Mismatch-loss part', undefined, 'dB', { min: 0 }),
    dbV('dl', 'Dissipative-loss part'),
    dbV('pout', 'Output power (port 2)', undefined, 'dBm'),
    dbV('prefl', 'Reflected power', undefined, 'dBm'),
    dbV('ploss', 'Dissipated power', undefined, 'dBm'),
  ],
  eqs: [
    E('rl', ['s11'], v => -v.s11, { s11: v => -v.rl }),
    E('vswr', ['s11'], v => vswrOf(fromDbv(v.s11)), { s11: v => dbv(gammaOfVswr(v.vswr)) }),
    E('refl', ['s11'], v => 100 * fromDbp(v.s11), { s11: v => dbp(v.refl / 100) }),
    E('trans', ['s21'], v => 100 * fromDbp(v.s21), { s21: v => dbp(v.trans / 100) }),
    E('loss', ['refl', 'trans'], v => 100 - v.refl - v.trans, { refl: v => 100 - v.loss - v.trans, trans: v => 100 - v.loss - v.refl }),
    E('il', ['s21'], v => -v.s21, { s21: v => -v.il }),
    E('ml', ['refl'], v => -dbp(1 - v.refl / 100), { refl: v => 100 * (1 - fromDbp(-v.ml)) }),
    // dissipative loss = IL − ML = −10·log|S21|² + 10·log(1 − |S11|²), written with the % shares
    E('dl', ['trans', 'refl'], v => -dbp(v.trans / 100) + dbp(1 - v.refl / 100), {
      trans: v => (100 - v.refl) * fromDbp(-v.dl), refl: v => 100 - v.trans / fromDbp(-v.dl),
    }),
    E('pout', ['pin', 's21'], v => v.pin + v.s21, { pin: v => v.pout - v.s21, s21: v => v.pout - v.pin }),
    E('prefl', ['pin', 's11'], v => v.pin + v.s11, { pin: v => v.prefl - v.s11, s11: v => v.prefl - v.pin }),
    E('ploss', ['pin', 'loss'], v => v.pin + dbp(v.loss / 100), { pin: v => v.ploss - dbp(v.loss / 100), loss: v => 100 * fromDbp(v.ploss - v.pin) }),
  ],
  outputs: [
    O('Output power', v => 1e-3 * fromDbp(v.pout), 'W', true),
    O('Reflected power', v => 1e-3 * fromDbp(v.prefl), 'W', true),
    O('Dissipated power', v => 1e-3 * fromDbp(v.pin) * v.loss / 100, 'W', true),
    O('Share of IL caused by mismatch', v => v.il > 0 ? 100 * v.ml / v.il : NaN, '%'),
  ],
  guess: v => {
    // lost power + dissipative loss: refl = 100 − loss/(1 − 10^(−dl/10)), trans = (100 − refl)·10^(−dl/10)
    if (isFinite(v.loss) && isFinite(v.dl) && v.dl !== 0) {
      const a = fromDbp(-v.dl), refl = 100 - v.loss / (1 - a);
      return { refl: refl, trans: (100 - refl) * a };
    }
    // output + dissipated power with a known reflection: P_in = (P_out + P_loss)/(1 − |S11|²)
    let refl = v.refl;
    if (!isFinite(refl) && isFinite(v.s11)) refl = 100 * fromDbp(v.s11);
    if (!isFinite(refl) && isFinite(v.rl)) refl = 100 * fromDbp(-v.rl);
    if (!isFinite(refl) && isFinite(v.vswr)) { const g = gammaOfVswr(v.vswr); refl = 100 * g * g; }
    if (isFinite(v.pout) && isFinite(v.ploss) && isFinite(refl) && refl < 100) {
      const pin = dbp((fromDbp(v.pout) + fromDbp(v.ploss)) / (1 - refl / 100));
      return { pin: pin, s21: v.pout - pin, il: pin - v.pout, trans: 100 * fromDbp(v.pout - pin),
        loss: 100 * fromDbp(v.ploss - pin), refl: refl, s11: dbp(refl / 100) };
    }
    return null;
  },
  chart: v => powerChart2(v),
  warn: v => (v.s11 > S11_ACTIVE_DB) ? ACTIVE_S11 : (v.loss < -1e-9) ? '⚠ |S11|² + |S21|² > 1. This is not a passive network (it has gain, or the data has an error).' : null,
  note: 'Reflected = |S11|² · Transmitted = |S21|² · Lost = 1 − |S11|² − |S21|². IL = mismatch loss −10·log(1−|S11|²) + dissipative loss.',
},
{
  id: 'spower3', cat: 'mismatch', title: 'S-Parameters: Simple Power View (3-Port)', kw: 'splitter divider power split s31 magnitude',
  desc: 'Port 1 is driven and ports 2 and 3 are outputs (for example a splitter or coupler). Uses magnitudes only. Fill any 4 independent values, for example return loss, split ratio, excess loss and input power.',
  vars: [
    dbV('s11', '|S11|', -20, 'dB'),
    dbV('s21', '|S21|', -3.2, 'dB'),
    dbV('s31', '|S31|', -3.3, 'dB'),
    dbV('pin', 'Input power', 0, 'dBm', { sticky: true }),
    dbV('rl', 'Input return loss', undefined, 'dB'),
    linV('refl', 'Reflected power', undefined, '%', { min: 0, max: 100 }),
    linV('p2', 'Power to port 2', undefined, '%', { min: 0, max: 1e9 }),
    linV('p3', 'Power to port 3', undefined, '%', { min: 0, max: 1e9 }),
    linV('loss', 'Dissipated (lost) power', undefined, '%', { min: -1e9, max: 100 }),
    dbV('ratio', 'Split ratio S21 − S31'),
    dbV('el', 'Excess loss (vs. ideal lossless split)'),
    dbV('out2', 'Output power port 2', undefined, 'dBm'),
    dbV('out3', 'Output power port 3', undefined, 'dBm'),
  ],
  eqs: [
    E('rl', ['s11'], v => -v.s11, { s11: v => -v.rl }),
    E('refl', ['s11'], v => 100 * fromDbp(v.s11), { s11: v => dbp(v.refl / 100) }),
    E('p2', ['s21'], v => 100 * fromDbp(v.s21), { s21: v => dbp(v.p2 / 100) }),
    E('p3', ['s31'], v => 100 * fromDbp(v.s31), { s31: v => dbp(v.p3 / 100) }),
    E('loss', ['refl', 's21', 's31'], v => 100 - v.refl - 100 * fromDbp(v.s21) - 100 * fromDbp(v.s31), {
      refl: v => 100 - v.loss - 100 * fromDbp(v.s21) - 100 * fromDbp(v.s31),
      s21: v => dbp((100 - v.loss - v.refl) / 100 - fromDbp(v.s31)),
      s31: v => dbp((100 - v.loss - v.refl) / 100 - fromDbp(v.s21)),
    }),
    E('ratio', ['s21', 's31'], v => v.s21 - v.s31, { s21: v => v.ratio + v.s31, s31: v => v.s21 - v.ratio }),
    E('el', ['s21', 's31'], v => -dbp(fromDbp(v.s21) + fromDbp(v.s31)), {
      s21: v => dbp(fromDbp(-v.el) - fromDbp(v.s31)), s31: v => dbp(fromDbp(-v.el) - fromDbp(v.s21)),
    }),
    E('out2', ['pin', 's21'], v => v.pin + v.s21, { pin: v => v.out2 - v.s21, s21: v => v.out2 - v.pin }),
    E('out3', ['pin', 's31'], v => v.pin + v.s31, { pin: v => v.out3 - v.s31, s31: v => v.out3 - v.pin }),
  ],
  outputs: [
    O('Input VSWR', v => v.s11 > S11_ACTIVE_DB ? '∞ (|Γ| > 1, active)' : vswrOf(Math.min(1, fromDbv(v.s11))), ': 1'),
    O('Amplitude imbalance |S21 − S31|', v => Math.abs(v.ratio), 'dB'),
    O('Share of output power at port 2', v => 100 * v.p2 / (v.p2 + v.p3), '%'),
    O('Excess IL port 2 vs. ideal 3 dB split', v => -v.s21 - dbp(2), 'dB'),
    O('Excess IL port 3 vs. ideal 3 dB split', v => -v.s31 - dbp(2), 'dB'),
    O('Dissipated power', v => 1e-3 * fromDbp(v.pin) * v.loss / 100, 'W', true),
  ],
  guess: v => {
    // split ratio r = S21 − S31 with the total output share t: S21 = 10·log(t·k/(1+k)), k = 10^(r/10)
    if (!isFinite(v.ratio)) return null;
    const k = fromDbp(v.ratio);
    let t = NaN;
    if (isFinite(v.el)) t = fromDbp(-v.el);
    else if (isFinite(v.loss) && isFinite(v.refl)) t = (100 - v.loss - v.refl) / 100;
    if (!(t > 0)) return null;
    const s21 = dbp(t * k / (1 + k));
    return { s21: s21, s31: s21 - v.ratio };
  },
  chart: v => powerChart3(v),
  warn: v => (v.s11 > S11_ACTIVE_DB) ? ACTIVE_S11 : (v.loss < -1e-9) ? '⚠ |S11|² + |S21|² + |S31|² > 1. This is not a passive network.' : null,
  note: 'Lost = 1 − |S11|² − |S21|² − |S31|² · Excess loss = −10·log(|S21|² + |S31|²)',
},
{ id: 's2', cat: 'mismatch', title: 'S-Parameters: 2-Port Network (complex)', kw: 's11 s21 s12 s22 stability rollett gain mag msg abcd z y t conjugate match', custom: 's2' },
{ id: 's3', cat: 'mismatch', title: 'S-Parameters: 3-Port Network (complex)', kw: 'splitter wilkinson circulator coupler hybrid 3-port reduction', custom: 's3' },

// ============================================================ MATCHING ======
{
  id: 'react', cat: 'matching', title: 'Reactance ↔ L / C', kw: 'reactance inductance capacitance xl xc',
  desc: 'Inductive and capacitive reactance at a frequency.',
  vars: [
    fq('f', 'Frequency', 100e6, 'MHz', { sticky: true }),
    uV('L', 'Inductance L', 'H', 'nH', 100e-9),
    ohmV('XL', 'Inductive reactance X<sub>L</sub>'),
    uV('C', 'Capacitance C', 'F', 'pF', 10e-12),
    ohmV('XC', 'Capacitive reactance |X<sub>C</sub>|'),
  ],
  eqs: [
    E('XL', ['f', 'L'], v => 2 * PI * v.f * v.L, { L: v => v.XL / (2 * PI * v.f), f: v => v.XL / (2 * PI * v.L) }),
    E('XC', ['f', 'C'], v => 1 / (2 * PI * v.f * v.C), { C: v => 1 / (2 * PI * v.f * v.XC), f: v => 1 / (2 * PI * v.C * v.XC) }),
  ],
  outputs: [
    O('Resonance of L and C', v => 1 / (2 * PI * sqrt(v.L * v.C)), 'Hz', true),
    O('Net series reactance X<sub>L</sub> − X<sub>C</sub>', v => v.XL - v.XC, 'Ω', true),
  ],
  note: 'X<sub>L</sub> = 2πfL · X<sub>C</sub> = 1/(2πfC)',
},
{
  id: 'resonance', cat: 'matching', title: 'LC Resonance, Q & Bandwidth', kw: 'resonant frequency tank q factor bandwidth rlc',
  desc: 'Series RLC resonator. Enter any 3 independent values of L, C, R, f₀, Q and BW. L, C and f₀ are linked, and so are f₀, Q and BW, and L, R and BW (BW = R/2πL does not depend on C).',
  vars: [
    uV('L', 'Inductance L', 'H', 'nH', 100e-9, { finite: true }),
    uV('C', 'Capacitance C', 'F', 'pF', 10e-12, { finite: true }),
    fq('f0', 'Resonant frequency f₀', undefined, 'MHz', { finite: true }),
    ohmV('Rs', 'Series resistance R<sub>s</sub>', 1, { inMin: 0 }),   // 0 = lossless
    posV('Q', 'Quality factor Q', undefined, '', { max: 1e300 }),
    fq('bw', '3 dB bandwidth', undefined, 'MHz', { min: 0 }),   // 0 for a lossless resonator (Rs = 0, Q = ∞)
  ],
  eqs: [
    E('f0', ['L', 'C'], v => 1 / (2 * PI * sqrt(v.L * v.C)), {
      L: v => 1 / (Math.pow(2 * PI * v.f0, 2) * v.C), C: v => 1 / (Math.pow(2 * PI * v.f0, 2) * v.L),
    }),
    E('bw', ['Rs', 'L'], v => v.Rs / (2 * PI * v.L), { Rs: v => 2 * PI * v.L * v.bw, L: v => v.Rs / (2 * PI * v.bw) }),
    E('Q', ['f0', 'bw'], v => v.f0 / v.bw, { f0: v => v.Q * v.bw, bw: v => v.f0 / v.Q }),
  ],
  guess: v => {
    // C, R and Q: L = C·(Q·R)² from Q = √(L/C)/R
    if (!(isFinite(v.C) && isFinite(v.Rs) && isFinite(v.Q))) return null;
    const L = v.C * Math.pow(v.Q * v.Rs, 2);
    return { L: L, f0: 1 / (2 * PI * sqrt(L * v.C)), bw: v.Rs / (2 * PI * L) };
  },
  outputs: [
    O('Characteristic impedance √(L/C)', v => sqrt(v.L / v.C), 'Ω', true),
    O('Reactance at f₀', v => 2 * PI * v.f0 * v.L, 'Ω', true),
    O('Equivalent parallel R<sub>p</sub> = R<sub>s</sub>(1+Q²)', v => v.Rs === 0 ? Infinity : v.Rs * (1 + v.Q * v.Q), 'Ω', true),
    O('Angular frequency ω₀', v => 2 * PI * v.f0, 'rad/s'),
  ],
  // lossless (R = 0, Q = ∞ or BW = 0): BW and Q no longer fix L or C, only f₀ = 1/(2π√LC) does
  warn: v => ((v.Rs === 0 || v.Q === Infinity || v.bw === 0) &&
      (isNaN(v.Rs) || v.Rs === 0) && (isNaN(v.Q) || v.Q === Infinity) && (isNaN(v.bw) || v.bw === 0) &&
      !(isFinite(v.L) && isFinite(v.C)))
    ? 'A lossless resonator (R = 0, Q = ∞, BW = 0) does not fix L and C: enter two of L, C and f₀.' : null,
  note: 'f₀ = 1/(2π√(LC)) · BW = R<sub>s</sub>/(2πL) · Q = f₀/BW = √(L/C)/R<sub>s</sub>',
},
{ id: 'lnet', cat: 'matching', title: 'L-Network Matching', kw: 'l network match impedance matching lumped', custom: 'lnet' },
{
  id: 'qwt', cat: 'matching', title: 'Quarter-Wave Transformer', kw: 'quarter wave transformer lambda/4 matching',
  desc: 'λ/4 line that matches a resistive load to Z₀, with its physical length.',
  vars: [
    ohmV('Z1', 'Source / line impedance Z₀', 50, { sticky: true }),
    ohmV('ZL', 'Load resistance R<sub>L</sub>', 100),
    ohmV('Zt', 'Transformer impedance Z<sub>T</sub>'),
    fq('f', 'Frequency', 1e9, 'GHz', { sticky: true }),
    posV('ee', 'Effective permittivity ε<sub>eff</sub>', 1, '', { min: 1, max: 1e4, sticky: true }),
    lenV('len', 'Physical length (λ/4)', undefined, 'mm'),
  ],
  eqs: [
    E('Zt', ['Z1', 'ZL'], v => sqrt(v.Z1 * v.ZL), { Z1: v => v.Zt * v.Zt / v.ZL, ZL: v => v.Zt * v.Zt / v.Z1 }),
    E('len', ['f', 'ee'], v => C0 / (4 * v.f * sqrt(v.ee)), { f: v => C0 / (4 * v.len * sqrt(v.ee)), ee: v => Math.pow(C0 / (4 * v.f * v.len), 2) }),
  ],
  outputs: [
    O('Fractional BW for VSWR ≤ 1.5', v => qwtBw(v.Z1, v.ZL, 0.2), '%'),
    O('Fractional BW for VSWR ≤ 2', v => qwtBw(v.Z1, v.ZL, 1 / 3), '%'),
  ],
  note: 'Z<sub>T</sub> = √(Z₀·R<sub>L</sub>) · length = λ/4 = c/(4f√ε<sub>eff</sub>). BW (TEM): Δf/f₀ = 2 − (4/π)·acos[Γm/√(1−Γm²) · 2√(Z₀R<sub>L</sub>)/|R<sub>L</sub>−Z₀|].',
},
{
  id: 'serpar', cat: 'matching', title: 'Series ↔ Parallel Equivalent', kw: 'series parallel conversion q rp xp',
  desc: 'R + jX in series ↔ R ∥ jX in parallel (same impedance at this frequency). A positive X is inductive.',
  vars: [
    ohmV('Rs', 'Series R<sub>s</sub>', 10),
    xV('Xs', 'Series X<sub>s</sub>', 50),
    linV('Q', 'Q = X<sub>s</sub>/R<sub>s</sub> (signed)', undefined, '', { min: -1e9, max: 1e9 }),
    ohmV('Rp', 'Parallel R<sub>p</sub>'),
    xV('Xp', 'Parallel X<sub>p</sub>'),
    fq('f', 'Frequency (for L/C values)', 100e6, 'MHz'),
  ],
  eqs: [
    E('Q', ['Xs', 'Rs'], v => v.Xs / v.Rs, { Xs: v => v.Q * v.Rs, Rs: v => v.Xs / v.Q }),
    E('Q', ['Rp', 'Xp'], v => v.Rp / v.Xp, { Rp: v => v.Q * v.Xp, Xp: v => v.Rp / v.Q }),
    E('Rp', ['Rs', 'Q'], v => v.Rs * (1 + v.Q * v.Q), { Rs: v => v.Rp / (1 + v.Q * v.Q) }),
  ],
  outputs: [
    O('Series reactive element', v => reactText(v.Xs, v.f, Math.abs(v.Rs))),
    O('Parallel reactive element', v => reactText(v.Xp, v.f, Math.abs(v.Rp))),
    O('|Q|', v => Math.abs(v.Q), ''),
  ],
  note: 'Q = X<sub>s</sub>/R<sub>s</sub> = R<sub>p</sub>/X<sub>p</sub> · R<sub>p</sub> = R<sub>s</sub>(1+Q²) · X<sub>p</sub> = X<sub>s</sub>(1+1/Q²)',
},

// =============================================================== LINES ======
{
  id: 'microstrip', cat: 'lines', title: 'Microstrip Line', kw: 'microstrip trace width impedance pcb hammerstad',
  desc: 'Analysis and synthesis (Hammerstad–Jensen, with thickness correction). Leave out the width to design for a Z₀, or leave out Z₀ to analyse a trace.',
  cfg: [{ id: 'sub', label: 'Substrate preset', def: '0',
          options: SUBSTRATES.map((s, i) => [String(i), s.name + ' (εr ' + s.er + ', tanδ ' + s.tand + ')']).concat([['custom', 'Custom']]),
          set: val => val === 'custom' ? {} : { er: SUBSTRATES[+val].er, tand: SUBSTRATES[+val].tand } }],
  vars: [
    lenV('W', 'Trace width W', undefined, 'mm', { min: 1e-8, max: 10 }),
    lenV('H', 'Substrate height H', 1.6e-3, 'mm', { min: 1e-8, max: 10 }),
    lenV('T', 'Copper thickness T', 35e-6, 'µm', { min: 1e-12, max: 1e-2, inMin: 0 }),
    posV('er', 'Substrate εr', 4.4, '', { min: 1, max: 1000 }),
    ohmV('Z0', 'Characteristic impedance Z₀', 50, { min: 1e-3, max: 1e4 }),
    fq('f', 'Frequency (for dispersion & loss)', 1e9, 'GHz'),
    posV('tand', 'Loss tangent tanδ', 0.02, '', { min: 0, max: 1 }),
  ],
  eqs: [
    E('Z0', ['W', 'H', 'T', 'er'], v => microstrip(v.W, v.H, v.T, v.er).z0),
  ],
  outputs: [
    O('W/H', v => v.W / v.H, ''),
    O('ε<sub>eff</sub> (static)', v => microstrip(v.W, v.H, v.T, v.er).ee, ''),
    O('ε<sub>eff</sub> at f (dispersion)', v => msEeffF(microstrip(v.W, v.H, v.T, v.er).ee, v.er, v.Z0, v.H, v.f), ''),
    O('Guided wavelength λ<sub>g</sub> at f', v => C0 / v.f / sqrt(msEeffF(microstrip(v.W, v.H, v.T, v.er).ee, v.er, v.Z0, v.H, v.f)), 'm', true),
    O('Delay per length', v => sqrt(microstrip(v.W, v.H, v.T, v.er).ee) / C0 * 1e-3 * 1e12, 'ps/mm'),
    O('Conductor loss (smooth, annealed Cu, 1.724e-8 Ω·m)', v => msLossC(v), 'dB/m'),
    O('Dielectric loss', v => msLossD(v), 'dB/m'),
    O('Total loss (annealed Cu, 1.724e-8 Ω·m)', v => msLossC(v) + msLossD(v), 'dB/m'),
  ],
  warn: v => {
    const u = v.W / v.H, w = [];
    if (u < 0.01 || u > 100) w.push('W/H = ' + fmt(u, 3) + ' is outside 0.01–100');
    if (v.er > 128) w.push('εr above 128');
    if (v.T > v.W) w.push('the copper is thicker than the trace is wide, so the thickness correction is approximate');
    return w.length ? '⚠ Outside the Hammerstad–Jensen validity range: ' + w.join('; ') + '. The results are approximate.' : null;
  },
  note: 'Accuracy is about 1 % for 0.01 ≤ W/H ≤ 100 and εr ≤ 128. Conductor loss uses the smooth annealed-copper approximation α<sub>c</sub> = R<sub>s</sub>/(Z₀W), ρ = 1.724e-8 Ω·m (IACS). Dispersion uses the Getsinger model.',
},
{
  id: 'coax', cat: 'lines', title: 'Coaxial Line', kw: 'coax coaxial impedance cutoff te11',
  desc: 'Z₀ from the dimensions, or the dimension needed for a given Z₀.',
  cfg: [{ id: 'die', label: 'Dielectric preset', def: '1',
          options: DIELECTRICS.map((s, i) => [String(i), s.name + ' (εr ' + s.er + ')']).concat([['custom', 'Custom']]),
          set: val => val === 'custom' ? {} : { er: DIELECTRICS[+val].er } }],
  vars: [
    lenV('D', 'Outer conductor inner diameter D', 3.0e-3, 'mm', { pri: -1 }),
    lenV('d', 'Inner conductor diameter d', 0.912e-3, 'mm'),
    posV('er', 'Dielectric εr', 2.1, '', { min: 1, max: 1000 }),
    ohmV('Z0', 'Characteristic impedance Z₀'),
  ],
  eqs: [
    E('Z0', ['D', 'd', 'er'], v => v.D > v.d ? ETA0 / (2 * PI) / sqrt(v.er) * Math.log(v.D / v.d) : NaN, {
      D: v => v.d * Math.exp(v.Z0 * sqrt(v.er) * 2 * PI / ETA0),
      d: v => v.D / Math.exp(v.Z0 * sqrt(v.er) * 2 * PI / ETA0),
      er: v => Math.pow(ETA0 / (2 * PI) * Math.log(v.D / v.d) / v.Z0, 2),
    }),
  ],
  outputs: [
    O('TE₁₁ cutoff (first higher mode)', v => 2 * C0 / (PI * (v.D + v.d) * sqrt(v.er)), 'Hz', true),
    O('Velocity factor', v => 1 / sqrt(v.er), ''),
    O('Capacitance per metre', v => v.D > v.d ? 2 * PI * EPS0 * v.er / Math.log(v.D / v.d) : NaN, 'F/m', true),
    O('Inductance per metre', v => v.D > v.d ? MU0 / (2 * PI) * Math.log(v.D / v.d) : NaN, 'H/m', true),
    O('Delay per metre', v => sqrt(v.er) / C0, 's/m', true),
  ],
  warn: v => (v.D <= v.d) ? '⚠ The inner conductor diameter d must be smaller than the outer conductor inner diameter D.' : null,
  note: 'Z₀ = (η₀/(2π√εr))·ln(D/d) ≈ (59.96/√εr)·ln(D/d) · f<sub>c</sub>(TE₁₁) ≈ 2c / (π(D+d)√εr)',
},
{
  id: 'elen', cat: 'lines', title: 'Electrical ↔ Physical Length', kw: 'electrical length phase degrees delay',
  desc: 'Phase length, wavelengths and time delay of a line.',
  vars: [
    fq('f', 'Frequency', 1e9, 'GHz', { sticky: true }),
    posV('er', 'Effective permittivity ε<sub>eff</sub>', 1, '', { sticky: true, min: 1, max: 1e6 }),
    posV('VF', 'Velocity factor', undefined, '', { min: 1e-3, max: 1 }),
    lenV('len', 'Physical length', 100e-3, 'mm'),
    posV('deg', 'Electrical length', undefined, '°'),
    posV('wl', 'Length in wavelengths', undefined, 'λ'),
    uV('td', 'Time delay', 's', 'ns'),
  ],
  eqs: [
    E('VF', ['er'], v => 1 / sqrt(v.er), { er: v => 1 / (v.VF * v.VF) }),
    E('deg', ['len', 'f', 'VF'], v => 360 * v.len * v.f / (v.VF * C0), {
      len: v => v.deg * v.VF * C0 / (360 * v.f), f: v => v.deg * v.VF * C0 / (360 * v.len), VF: v => 360 * v.len * v.f / (v.deg * C0),
    }),
    E('wl', ['deg'], v => v.deg / 360, { deg: v => v.wl * 360 }),
    E('td', ['len', 'VF'], v => v.len / (v.VF * C0), { len: v => v.td * v.VF * C0, VF: v => v.len / (v.td * C0) }),
  ],
  outputs: [
    O('Electrical length in radians', v => v.deg * PI / 180, 'rad'),
    O('Phase mod 360°', v => ((v.deg % 360) + 360) % 360, '°'),
    O('Wavelength in line', v => v.VF * C0 / v.f, 'm', true),
  ],
  note: 'θ = 360°·ℓ·f/(VF·c) · t<sub>d</sub> = ℓ/(VF·c) · VF = 1/√ε<sub>eff</sub>',
},
{
  id: 'cable', cat: 'lines', title: 'Coax Cable Loss', kw: 'cable loss attenuation lmr rg coax',
  desc: 'Loss of common coax cables from the built-in database. The values are typical; check the manufacturer data for critical work.',
  cfg: [{ id: 'cab', label: 'Cable', def: '9', options: CABLES.map((c, i) => [String(i), c.name]) }],
  vars: [
    fq('f', 'Frequency', 1e9, 'GHz'),
    lenV('len', 'Cable length', 10, 'm', { inMin: 0 }),
    posV('loss', 'Total cable loss', undefined, 'dB', { min: 1e-12, max: 1e6, inMin: 0 }),
    dbV('pin', 'Input power', 0, 'dBm', { sticky: true }),
    dbV('pout', 'Output power', undefined, 'dBm'),
  ],
  eqs: [
    E('loss', ['f', 'len'], v => cableAtt(CABLES[+v.$.cab], v.f) * v.len, { len: v => v.loss / cableAtt(CABLES[+v.$.cab], v.f) }),
    E('pout', ['pin', 'loss'], v => v.pin - v.loss, { pin: v => v.pout + v.loss, loss: v => v.pin - v.pout }),
  ],
  outputs: [
    O('Attenuation', v => cableAtt(CABLES[+v.$.cab], v.f), 'dB/m'),
    O('Attenuation', v => 100 * cableAtt(CABLES[+v.$.cab], v.f), 'dB/100 m'),
    O('Attenuation', v => 30.48 * cableAtt(CABLES[+v.$.cab], v.f), 'dB/100 ft'),
    O('Power delivered', v => 100 * fromDbp(-v.loss), '%'),
    O('Cable Z₀ / velocity factor', v => { const c = CABLES[+v.$.cab]; return c.z0 + ' Ω / ' + c.vf; }),
    O('Delay', v => v.len / (CABLES[+v.$.cab].vf * C0), 's', true),
    O('Typical max frequency', v => { const c = CABLES[+v.$.cab]; return c.fmax + ' GHz' + (v.f > c.fmax * 1e9 ? ' ⚠ exceeded' : ''); }),
  ],
  note: 'Model: dB/100 ft = k₁·√f<sub>MHz</sub> + k₂·f<sub>MHz</sub>. The k₁ term is conductor loss and the k₂ term is dielectric loss.',
},
{
  id: 'skin', cat: 'lines', title: 'Skin Depth', kw: 'skin depth conductor resistivity surface resistance plating',
  desc: 'Current penetration depth in a conductor.',
  cfg: [{ id: 'mat', label: 'Conductor preset', def: '1',
          options: CONDUCTORS.map((c, i) => [String(i), c.name]).concat([['custom', 'Custom']]),
          set: val => val === 'custom' ? {} : { rho: CONDUCTORS[+val].rho, mur: CONDUCTORS[+val].mur } }],
  vars: [
    fq('f', 'Frequency', 1e9, 'GHz'),
    uV('rho', 'Resistivity ρ', 'ohm_m', 'µΩ·cm', 1.68e-8, { min: 1e-12, max: 1e3 }),
    posV('mur', 'Relative permeability μr', 1, '', { sticky: true, min: 1e-3, max: 1e6 }),
    lenV('delta', 'Skin depth δ', undefined, 'µm'),
  ],
  eqs: [
    E('delta', ['f', 'rho', 'mur'], v => sqrt(v.rho / (PI * v.f * MU0 * v.mur)), {
      f: v => v.rho / (PI * v.delta * v.delta * MU0 * v.mur),
      rho: v => v.delta * v.delta * PI * v.f * MU0 * v.mur,
      mur: v => v.rho / (PI * v.f * MU0 * v.delta * v.delta),
    }),
  ],
  outputs: [
    O('Surface resistance R<sub>s</sub>', v => v.rho / v.delta, 'Ω/sq', true),
    O('Conductivity σ', v => 1 / v.rho, 'S/m', true),
    O('Recommended thickness (5δ)', v => 5 * v.delta, 'm', true),
  ],
  warn: v => (v.mur > 1 && v.f > 100e6) ? '⚠ The permeability of a ferromagnetic metal falls with frequency: for nickel μr ≈ 100 holds only below about 100 MHz, and it is about 1–10 at GHz frequencies. Enter the effective μr at this frequency.' : null,
  note: 'δ = √(ρ / (π·f·μ₀·μr)). About 99 % of the current flows within 4.6 δ of the surface. For ferromagnetic metals use the effective μr at the frequency.',
},

// ================================================================ PROP ======
{
  id: 'fspl', cat: 'prop', title: 'Free-Space Path Loss', kw: 'fspl path loss friis distance',
  desc: 'Loss between isotropic antennas in free space. Enter any 2 values.',
  vars: [
    fq('f', 'Frequency', 2.4e9, 'GHz'),
    lenV('d', 'Distance', 1000, 'km'),
    dbV('L', 'Free-space path loss'),
  ],
  eqs: [
    E('L', ['f', 'd'], v => fsplDb(v.f, v.d), { d: v => C0 * fromDbv(v.L) / (4 * PI * v.f), f: v => C0 * fromDbv(v.L) / (4 * PI * v.d) }),
  ],
  outputs: [
    O('Wavelength', v => lam(v.f), 'm', true),
    O('Received power for 0 dBm EIRP and 0 dBi RX antenna', v => -v.L, 'dBm'),
  ],
  warn: v => nearField(v.d, v.f) ? NEAR_FIELD : null,
  note: 'FSPL = 20·log(4πdf/c) = 20·log(d<sub>km</sub>) + 20·log(f<sub>MHz</sub>) + 32.45 dB. Valid in the far field only (d ≫ λ and d > 2D²/λ).',
},
{
  id: 'link', cat: 'prop', title: 'Link Budget', kw: 'link budget range margin eirp receive power friis',
  desc: 'Full RF link budget. Leave any one value blank to solve for it, for example the distance for a given margin (maximum range).',
  vars: [
    dbV('pt', 'TX power', 20, 'dBm'),
    dbV('lt', 'TX cable / connector loss', 1),
    dbV('gt', 'TX antenna gain', 6, 'dBi'),
    fq('f', 'Frequency', 2.4e9, 'GHz', { sticky: true }),
    lenV('d', 'Distance', 1000, 'km', { pri: -1 }),
    dbV('fspl', 'Free-space path loss'),
    dbV('lm', 'Other losses (fade, rain, body…)', 0),
    dbV('gr', 'RX antenna gain', 6, 'dBi'),
    dbV('lr', 'RX cable / connector loss', 1),
    dbV('pr', 'Received power', undefined, 'dBm'),
    dbV('sens', 'RX sensitivity', -90, 'dBm'),
    dbV('margin', 'Link margin'),
  ],
  eqs: [
    E('fspl', ['f', 'd'], v => fsplDb(v.f, v.d), { d: v => C0 * fromDbv(v.fspl) / (4 * PI * v.f), f: v => C0 * fromDbv(v.fspl) / (4 * PI * v.d) }),
    E('pr', ['pt', 'lt', 'gt', 'fspl', 'lm', 'gr', 'lr'], v => v.pt - v.lt + v.gt - v.fspl - v.lm + v.gr - v.lr),
    E('margin', ['pr', 'sens'], v => v.pr - v.sens, { pr: v => v.margin + v.sens, sens: v => v.pr - v.margin }),
  ],
  outputs: [
    O('EIRP', v => v.pt - v.lt + v.gt, 'dBm'),
    O('EIRP', v => 1e-3 * fromDbp(v.pt - v.lt + v.gt), 'W', true),
    O('Received power', v => 1e-3 * fromDbp(v.pr), 'W', true),
    O('Received voltage at 50 Ω', v => sqrt(1e-3 * fromDbp(v.pr) * 50), 'V', true),
    O('Max range (0 dB margin, free space)', v => v.d * fromDbv(v.margin), 'm', true),
  ],
  warn: v => nearField(v.d, v.f) ? NEAR_FIELD
    : (v.fspl < v.gt + v.gr) ? '⚠ The path loss is smaller than the two antenna gains together, so more power would be received than is transmitted. The antennas are in each other\'s near field (d < 2D²/λ), where the Friis model does not apply.' : null,
  note: 'P<sub>r</sub> = P<sub>t</sub> − L<sub>t</sub> + G<sub>t</sub> − FSPL − L<sub>other</sub> + G<sub>r</sub> − L<sub>r</sub> · margin = P<sub>r</sub> − sensitivity. In free space, every 6 dB of margin doubles the range.',
},
{
  id: 'eirp', cat: 'prop', title: 'EIRP / ERP', kw: 'eirp erp dbi dbd effective radiated power',
  desc: 'Effective isotropic and dipole-referenced radiated power.',
  vars: [
    dbV('pt', 'Transmitter power', 30, 'dBm'),
    dbV('lc', 'Cable / connector loss', 0),
    dbV('g', 'Antenna gain', 10, 'dBi'),
    dbV('gd', 'Antenna gain', undefined, 'dBd'),
    dbV('eirp', 'EIRP', undefined, 'dBm'),
    uV('eirpw', 'EIRP', 'W', 'W'),
    dbV('erp', 'ERP', undefined, 'dBm'),
    uV('erpw', 'ERP', 'W', 'W'),
  ],
  eqs: [
    E('gd', ['g'], v => v.g - 2.15, { g: v => v.gd + 2.15 }),
    E('eirp', ['pt', 'lc', 'g'], v => v.pt - v.lc + v.g),
    E('erp', ['eirp'], v => v.eirp - 2.15, { eirp: v => v.erp + 2.15 }),
    E('eirpw', ['eirp'], v => 1e-3 * fromDbp(v.eirp), { eirp: v => dbp(v.eirpw / 1e-3) }),
    E('erpw', ['erp'], v => 1e-3 * fromDbp(v.erp), { erp: v => dbp(v.erpw / 1e-3) }),
  ],
  outputs: [
    O('Transmitter power', v => 1e-3 * fromDbp(v.pt), 'W', true),
    O('EIRP', v => v.eirp - 30, 'dBW'),
  ],
  note: 'EIRP = P<sub>t</sub> − L + G<sub>dBi</sub> · ERP = EIRP − 2.15 dB · dBd = dBi − 2.15',
},
{
  id: 'fresnel', cat: 'prop', title: 'Fresnel Zone', kw: 'fresnel zone clearance line of sight',
  desc: 'Radius of the n-th Fresnel zone at distance d₁ from one end of the path.',
  vars: [
    fq('f', 'Frequency', 2.4e9, 'GHz'),
    lenV('D', 'Total path length', 1000, 'km'),
    lenV('d1', 'Distance from one end d₁', 500, 'km', { inMin: 0 }),
    posV('n', 'Zone number n', 1, '', { sticky: true, min: 1e-3, max: 1e6 }),
    lenV('r', 'Fresnel zone radius r', undefined, 'm'),
  ],
  eqs: [
    E('r', ['f', 'D', 'd1', 'n'], v => sqrt(v.n * lam(v.f) * v.d1 * (v.D - v.d1) / v.D), {
      f: v => v.n * C0 * v.d1 * (v.D - v.d1) / (v.D * v.r * v.r),
      n: v => v.r * v.r * v.D * v.f / (C0 * v.d1 * (v.D - v.d1)),
      // r²·D = nλ·d₁·(D − d₁)  ->  D = nλ·d₁² / (nλ·d₁ − r²), only for r² < nλ·d₁
      D: v => { const a = v.n * lam(v.f) * v.d1, b = a - v.r * v.r; return b > 0 ? a * v.d1 / b : NaN; },
    }),
  ],
  outputs: [
    O('60 % clearance radius', v => 0.6 * v.r, 'm', true),
    O('Max radius (mid-path)', v => sqrt(v.n * lam(v.f) * v.D / 4), 'm', true),
    O('Earth bulge at d₁ (k = 4/3)', v => (v.d1 >= 0 && v.d1 <= v.D) ? v.d1 * (v.D - v.d1) / (2 * (4 / 3) * R_EARTH) : NaN, 'm', true),
  ],
  warn: v => (v.d1 > v.D) ? '⚠ The distance d₁ must be between 0 and the total path length D.' : null,
  note: 'r = √(n·λ·d₁·d₂ / (d₁ + d₂)). Keep at least 60 % of the first zone free of obstacles.',
},
{
  id: 'horizon', cat: 'prop', title: 'Radio Horizon', kw: 'radio horizon line of sight distance antenna height',
  desc: 'Maximum line-of-sight distance between two antennas over a smooth earth.',
  vars: [
    lenV('h1', 'Antenna height 1', 30, 'm', { inMin: 0 }),
    lenV('h2', 'Antenna height 2', 2, 'm', { inMin: 0 }),
    posV('k', 'Effective earth-radius factor k', 4 / 3, '', { sticky: true, min: 0.1, max: 100 }),
    lenV('d', 'Radio horizon distance', undefined, 'km'),
  ],
  eqs: [
    E('d', ['h1', 'h2', 'k'], v => sqrt(2 * v.k * R_EARTH * v.h1) + sqrt(2 * v.k * R_EARTH * v.h2), {
      h2: v => Math.pow(v.d - sqrt(2 * v.k * R_EARTH * v.h1), 2) / (2 * v.k * R_EARTH),
      h1: v => Math.pow(v.d - sqrt(2 * v.k * R_EARTH * v.h2), 2) / (2 * v.k * R_EARTH),
    }),
  ],
  outputs: [
    O('Horizon from antenna 1', v => sqrt(2 * v.k * R_EARTH * v.h1), 'm', true),
    O('Horizon from antenna 2', v => sqrt(2 * v.k * R_EARTH * v.h2), 'm', true),
    O('Geometric horizon (k = 1, no refraction)', v => sqrt(2 * R_EARTH * v.h1) + sqrt(2 * R_EARTH * v.h2), 'm', true),
  ],
  note: 'd = √(2kR·h₁) + √(2kR·h₂), R = 6371 km. k = 4/3 is the standard atmosphere: d<sub>km</sub> ≈ 4.12·(√h₁ + √h₂).',
},

// ================================================================= ANT ======
{
  id: 'gain', cat: 'ant', title: 'Gain ↔ Aperture ↔ Beamwidth', kw: 'antenna gain effective aperture beamwidth',
  desc: 'Relation between gain, effective aperture and an estimated −3 dB beamwidth (same in both planes).',
  cfg: [{ id: 'k', label: 'Beamwidth constant', def: '32400',
          options: [['41253', '41253 (ideal, 100 % efficiency)'], ['32400', '32400 (typical)'], ['26000', '26000 (practical)']] }],
  vars: [
    fq('f', 'Frequency', 2.4e9, 'GHz', { sticky: true }),
    dbV('G', 'Gain', 15, 'dBi'),
    uV('Ae', 'Effective aperture A<sub>e</sub>', 'm2', 'cm²'),
    posV('bw', '−3 dB beamwidth (both planes)', undefined, '°', { max: 360 }),
  ],
  eqs: [
    E('G', ['Ae', 'f'], v => dbp(4 * PI * v.Ae / Math.pow(lam(v.f), 2)), {
      Ae: v => fromDbp(v.G) * Math.pow(lam(v.f), 2) / (4 * PI),
      f: v => C0 / sqrt(4 * PI * v.Ae / fromDbp(v.G)),
    }),
    E('G', ['bw'], v => dbp(+v.$.k / (v.bw * v.bw)), { bw: v => sqrt(+v.$.k / fromDbp(v.G)) }),
  ],
  outputs: [
    O('Gain (linear)', v => fromDbp(v.G), '×'),
    O('Gain', v => v.G - 2.15, 'dBd'),
    O('Wavelength', v => lam(v.f), 'm', true),
  ],
  warn: v => ((isFinite(v.bw) && v.bw > 60) || (isFinite(v.G) && fromDbp(v.G) < +v.$.k / 3600))
    ? '⚠ G ≈ K/θ² is an estimate for a single-lobe (pencil-beam) antenna with a beamwidth below about 60°. At this low gain the beamwidth is only a rough guide, and it does not apply to omnidirectional antennas (a λ/2 dipole is 78° × 360°, not 140° × 140°).' : null,
  note: 'G = 4πA<sub>e</sub>/λ² · G ≈ K/(θ<sub>E</sub>·θ<sub>H</sub>) with beamwidths in degrees, for pencil beams (θ below about 60°)',
},
{
  id: 'dipole', cat: 'ant', title: 'Dipole / Monopole Length', kw: 'dipole monopole whip antenna length quarter wave',
  desc: 'Resonant lengths. The shortening factor accounts for end effects and wire thickness (about 0.95 for thin wire).',
  vars: [
    fq('f', 'Frequency', 433e6, 'MHz'),
    posV('k', 'Shortening / velocity factor', 0.95, '', { sticky: true, min: 0.01, max: 1 }),
    lenV('Lh', 'Half-wave dipole length (λ/2)', undefined, 'cm'),
    lenV('Lq', 'Quarter-wave monopole length (λ/4)', undefined, 'cm'),
  ],
  eqs: [
    E('Lh', ['f', 'k'], v => v.k * C0 / (2 * v.f), { f: v => v.k * C0 / (2 * v.Lh), k: v => 2 * v.f * v.Lh / C0 }),
    E('Lq', ['Lh'], v => v.Lh / 2, { Lh: v => 2 * v.Lq }),
  ],
  outputs: [
    O('Free-space wavelength', v => lam(v.f), 'm', true),
    O('5/8 λ whip', v => 0.625 * v.k * lam(v.f), 'm', true),
    O('Full-wave (λ) element', v => v.k * lam(v.f), 'm', true),
    O('Feed impedance (ideal)', v => 'λ/2 dipole ≈ 73 Ω · λ/4 monopole ≈ 36.5 Ω'),
  ],
  note: 'L = k·c/(2f) for λ/2',
},
{
  id: 'dish', cat: 'ant', title: 'Parabolic Dish', kw: 'dish parabolic reflector antenna gain beamwidth',
  desc: 'Gain and beamwidth of a parabolic reflector.',
  vars: [
    fq('f', 'Frequency', 10e9, 'GHz', { sticky: true }),
    lenV('D', 'Dish diameter', 0.6, 'm'),
    posV('Dl', 'Electrical size D/λ', undefined, ''),
    posV('eta', 'Aperture efficiency η', 0.55, '', { sticky: true, min: 1e-3, max: 1 }),
    dbV('G', 'Gain', undefined, 'dBi'),
    posV('bw', '−3 dB beamwidth', undefined, '°', { max: 360 }),
  ],
  eqs: [
    E('Dl', ['D', 'f'], v => v.D * v.f / C0, { D: v => v.Dl * C0 / v.f, f: v => v.Dl * C0 / v.D }),
    E('G', ['Dl', 'eta'], v => dbp(v.eta * Math.pow(PI * v.Dl, 2)), {
      Dl: v => sqrt(fromDbp(v.G) / v.eta) / PI,
      eta: v => fromDbp(v.G) / Math.pow(PI * v.Dl, 2),
    }),
    E('bw', ['Dl'], v => 70 / v.Dl, { Dl: v => 70 / v.bw }),
  ],
  outputs: [
    O('Wavelength', v => lam(v.f), 'm', true),
    O('Effective aperture', v => v.eta * PI * v.D * v.D / 4, 'm²'),
    O('Far-field distance 2D²/λ', v => 2 * v.D * v.D / lam(v.f), 'm', true),
  ],
  note: 'G = η(πD/λ)² · θ<sub>3dB</sub> ≈ 70·λ/D degrees. Gain and beamwidth both depend only on D/λ, so with them enter the frequency or the diameter as well.',
},
{
  id: 'farfield', cat: 'ant', title: 'Far-Field Distance', kw: 'far field fraunhofer near field antenna measurement',
  desc: 'Fraunhofer distance for an antenna with largest dimension D.',
  vars: [
    fq('f', 'Frequency', 2.4e9, 'GHz'),
    lenV('D', 'Largest antenna dimension D', 0.3, 'm'),
    lenV('R', 'Far-field distance', undefined, 'm'),
  ],
  eqs: [
    E('R', ['f', 'D'], v => 2 * v.D * v.D * v.f / C0, { D: v => sqrt(v.R * C0 / (2 * v.f)), f: v => v.R * C0 / (2 * v.D * v.D) }),
  ],
  outputs: [
    O('Reactive near-field boundary (0.62√(D³/λ), at least λ/2π)', v => Math.max(0.62 * sqrt(Math.pow(v.D, 3) / lam(v.f)), lam(v.f) / (2 * PI)), 'm', true),
    O('Wavelength', v => lam(v.f), 'm', true),
    O('Also required: R > 2λ', v => !isFinite(v.R) ? NaN : v.R > 2 * lam(v.f) ? 'OK' : '⚠ use R ≥ ' + fmtSI(2 * lam(v.f), 'm')),
  ],
  warn: v => (v.D < lam(v.f)) ? '⚠ D < λ: 2D²/λ and 0.62√(D³/λ) apply to antennas that are large compared with λ. For a small antenna the reactive near field reaches about λ/2π; use R ≥ 2λ (better ≥ 10λ) for the far field.' : null,
  note: 'R = 2D²/λ, for D > λ. The reactive near field ends at 0.62√(D³/λ) for large antennas and at about λ/2π for small ones.',
},

// =============================================================== NOISE ======
{
  id: 'nf', cat: 'noise', title: 'Noise Figure ↔ Noise Temperature', kw: 'noise figure factor temperature',
  desc: 'Convert between noise figure, noise factor and equivalent noise temperature.',
  vars: [
    dbV('nf', 'Noise figure NF', 3, 'dB', { min: 0 }),
    posV('F', 'Noise factor F', undefined, '', { min: 1, max: 1e12 }),
    posV('te', 'Noise temperature T<sub>e</sub>', undefined, 'K', { min: 1e-12, inMin: 0 }),
    posV('t0', 'Reference temperature T₀', 290, 'K', { sticky: true }),
  ],
  eqs: [
    E('F', ['nf'], v => fromDbp(v.nf), { nf: v => dbp(v.F) }),
    E('te', ['F', 't0'], v => v.t0 * (v.F - 1), { F: v => 1 + v.te / v.t0, t0: v => v.te / (v.F - 1) }),
  ],
  outputs: [
    O('Noise density at the input (kT₀·F)', v => dbp(KB * v.t0 * 1000) + v.nf, 'dBm/Hz'),
  ],
  warn: v => (v.nf < 0 || v.F < 1 || v.te < 0) ? '⚠ NF < 0 dB (F < 1, Tₑ < 0 K) is not physical for a two-port.' : null,
  note: 'F = 10<sup>NF/10</sup> · T<sub>e</sub> = T₀(F − 1)',
},
{
  id: 'sens', cat: 'noise', title: 'Noise Floor & Sensitivity', kw: 'ktb noise floor sensitivity mds thermal noise',
  desc: 'Thermal noise floor and receiver sensitivity for a source (antenna) at temperature T. The noise figure is defined at 290 K, so the receiver adds Tₑ = 290 K·(F − 1). −174 dBm/Hz is kT at 290 K.',
  vars: [
    posV('t', 'Source temperature T', 290, 'K', { sticky: true, inMin: 0 }),
    dbV('n0', 'Source noise density kT', undefined, 'dBm/Hz'),
    fq('bw', 'Noise bandwidth B', 1e6, 'MHz', { min: 1e-6, max: 1e13 }),
    dbV('nf', 'Receiver noise figure', 5, 'dB', { min: 0 }),
    dbV('floor', 'Noise floor k(T + Tₑ)B (MDS)', undefined, 'dBm'),
    dbV('snr', 'Required SNR', 10),
    dbV('sens', 'Sensitivity', undefined, 'dBm'),
  ],
  eqs: [
    E('n0', ['t'], v => dbp(KB * v.t * 1000), { t: v => fromDbp(v.n0) / (KB * 1000) }),
    E('floor', ['t', 'bw', 'nf'], v => dbp(KB * (v.t + teOf(v.nf)) * v.bw * 1000), {
      // a rounding-level negative (NF = 0 dB or T = 0 K at the boundary) is taken as 0
      nf: v => { const ts = tSysOf(v), te = ts - v.t; return te >= -1e-9 * Math.max(1, ts) ? dbp(1 + Math.max(0, te) / 290) : NaN; },
      t: v => { const ts = tSysOf(v), t = ts - teOf(v.nf); return t >= -1e-9 * Math.max(1, ts) ? Math.max(0, t) : NaN; },
      bw: v => { const ts = v.t + teOf(v.nf); return ts > 0 ? fromDbp(v.floor) / (KB * 1000 * ts) : NaN; },
    }),
    E('sens', ['floor', 'snr'], v => v.floor + v.snr, { floor: v => v.sens - v.snr, snr: v => v.sens - v.floor }),
  ],
  outputs: [
    O('Source noise kTB (without the receiver)', v => v.n0 + dbp(v.bw), 'dBm'),
    O('Receiver noise temperature T<sub>e</sub> = 290 K·(F − 1)', v => teOf(v.nf), 'K'),
    O('System noise temperature T + T<sub>e</sub>', v => v.t + teOf(v.nf), 'K'),
    O('Sensitivity', v => 1e-3 * fromDbp(v.sens), 'W', true),
    O('Sensitivity at 50 Ω', v => sqrt(1e-3 * fromDbp(v.sens) * 50), 'V', true),
    O('Sensitivity at 50 Ω', v => v.sens + 90 + dbp(50), 'dBµV'),
  ],
  note: 'N = k(T + T<sub>e</sub>)B, T<sub>e</sub> = 290 K·(F − 1). At T = 290 K this is 10·log(kT·1000) + 10·log B + NF = −174 dBm/Hz + 10·log B + NF · S<sub>min</sub> = N + SNR<sub>req</sub>',
},
{
  id: 'ebno', cat: 'noise', title: 'Eb/N0 ↔ SNR ↔ C/N0', kw: 'ebno eb/n0 snr cnr c/n0 shannon bit rate',
  desc: 'Relation between energy per bit, SNR and carrier-to-noise density.',
  vars: [
    dbV('ebno', 'E<sub>b</sub>/N₀', 10),
    uV('rb', 'Bit rate R<sub>b</sub>', 'bps', 'Mbps', 1e6),
    fq('bw', 'Noise bandwidth B', 1e6, 'MHz', { min: 1e-6, max: 1e13 }),
    dbV('snr', 'SNR (C/N)'),
    dbV('cn0', 'C/N₀', undefined, 'dB-Hz'),
  ],
  eqs: [
    E('snr', ['ebno', 'rb', 'bw'], v => v.ebno + dbp(v.rb / v.bw), {
      ebno: v => v.snr - dbp(v.rb / v.bw), rb: v => v.bw * fromDbp(v.snr - v.ebno), bw: v => v.rb / fromDbp(v.snr - v.ebno),
    }),
    E('cn0', ['ebno', 'rb'], v => v.ebno + dbp(v.rb), { ebno: v => v.cn0 - dbp(v.rb), rb: v => fromDbp(v.cn0 - v.ebno) }),
  ],
  outputs: [
    O('Spectral efficiency R<sub>b</sub>/B', v => v.rb / v.bw, 'b/s/Hz'),
    O('Shannon capacity B·log₂(1+SNR)', v => v.bw * Math.log2(1 + fromDbp(v.snr)), 'bps', true),
    O('Shannon-limit E<sub>b</sub>/N₀ at this efficiency', v => { const e = v.rb / v.bw; return dbp((Math.pow(2, e) - 1) / e); }, 'dB'),
  ],
  note: 'SNR = E<sub>b</sub>/N₀ + 10·log(R<sub>b</sub>/B) · C/N₀ = E<sub>b</sub>/N₀ + 10·log R<sub>b</sub>',
},
{ id: 'cascade', cat: 'noise', title: 'Receiver Cascade Analysis', kw: 'cascade friis noise figure ip3 p1db chain lineup', custom: 'cascade' },

// ================================================================ FREQ ======
{
  id: 'mixer', cat: 'freq', title: 'Mixer: IF / LO / Image', kw: 'mixer image frequency lo if downconversion superheterodyne bandwidth',
  desc: 'Frequency plan for a down-converter, including the signal bandwidth. Enter the RF-to-image gap that your image filter needs, and the IF is solved.',
  cfg: [{ id: 'mode', label: 'LO injection', def: 'high', options: [['high', 'High-side (LO > RF)'], ['low', 'Low-side (LO < RF)']] }],
  vars: [
    fq('rf', 'RF centre frequency', 2400e6, 'MHz'),
    fq('lo', 'LO frequency', undefined, 'MHz'),
    fq('iff', 'IF centre frequency', 70e6, 'MHz', { inMin: 0 }),
    fq('img', 'Image centre frequency', undefined, 'MHz'),
    fq('bw', 'Signal bandwidth', 20e6, 'MHz', { sticky: true }),
    mk({ id: 'gap', label: 'Gap: RF band edge → image band edge', unit: 'Hz', du: 'MHz', scale: 'lin', min: -1e15, max: 1e15 }),
  ],
  eqs: [
    E('lo', ['rf', 'iff'], v => v.rf + mixS(v) * v.iff, { rf: v => v.lo - mixS(v) * v.iff, iff: v => mixS(v) * (v.lo - v.rf) }),
    // low-side LO below the IF: the image folds to IF − LO (it mixes through the sum LO + f)
    E('img', ['lo', 'iff'], v => Math.abs(v.lo + mixS(v) * v.iff), {
      lo: v => v.img - mixS(v) * v.iff,
      iff: v => { const a = mixS(v) * (v.img - v.lo); return (a > 0 || mixS(v) > 0) ? a : v.img + v.lo; },
    }),
    E('gap', ['iff', 'bw'], v => 2 * v.iff - v.bw, { iff: v => (v.gap + v.bw) / 2, bw: v => 2 * v.iff - v.gap }),
  ],
  outputs: [
    O('RF band', v => bandTxt(v.rf, v.bw)),
    O('IF band', v => bandTxt(v.iff, v.bw)),
    O('Image band', v => bandTxt(v.img, v.bw)),
    O('RF-to-image band gap |RF − image| − BW', v => Math.abs(v.rf - v.img) - v.bw, 'Hz', true),
    O('Image filter transition (gap as % of RF)', v => 100 * (Math.abs(v.rf - v.img) - v.bw) / v.rf, '%'),
    O('Spectrum at the IF', v => v.$.mode === 'low' ? 'Not inverted (low-side LO)' : 'Inverted (high-side LO)'),
    O('Half-IF spur at the RF input', v => v.rf + mixS(v) * v.iff / 2, 'Hz', true),
    O('Sum product RF + LO', v => v.rf + v.lo, 'Hz', true),
    O('2nd LO harmonic', v => 2 * v.lo, 'Hz', true),
  ],
  warn: v => {
    const w = [];
    if (v.$.mode === 'low' && v.lo < v.iff) w.push('⚠ LO below IF: the image folds to IF − LO = 2·IF − RF (it reaches the IF through the sum product LO + f). The real RF-to-image gap is 2·LO − BW, not the 2·IF − BW of the gap field.');
    if (v.gap <= 0) w.push('⚠ The image band overlaps the RF band, and the IF band reaches 0 Hz. Use an IF above BW/2 (preferably much higher).');
    else if (Math.abs(v.rf - v.img) - v.bw <= 0) w.push('⚠ The image band overlaps the RF band.');
    return w.length ? w.join(' ') : null;
  },
  note: 'High-side: LO = RF + IF, image = RF + 2·IF · Low-side: LO = RF − IF, image = RF − 2·IF (with LO below IF the image folds to 2·IF − RF) · Gap between RF band and image band = 2·IF − BW.',
},
{
  id: 'span', cat: 'freq', title: 'Start / Stop ↔ Centre / Span', kw: 'start stop center centre span bandwidth fractional octave',
  desc: 'Band edges ↔ centre and span. Enter any 2 values.',
  vars: [
    fq('start', 'Start frequency', 2400e6, 'MHz'),
    fq('stop', 'Stop frequency', 2483.5e6, 'MHz'),
    fq('center', 'Centre frequency (arithmetic)', undefined, 'MHz'),
    fq('span', 'Span', undefined, 'MHz', { min: 1e-9, inMin: 0 }),
    posV('fbw', 'Fractional bandwidth (span / centre)', undefined, '%', { min: 1e-12, max: 200 }),
  ],
  eqs: [
    // centre from start/stop and start from centre/span: every pair of start, stop, centre and
    // span except stop + span then has a closed form (no Newton block with cancellation)
    E('center', ['start', 'stop'], v => (v.start + v.stop) / 2, { start: v => 2 * v.center - v.stop, stop: v => 2 * v.center - v.start }),
    E('start', ['center', 'span'], v => v.center - v.span / 2, { center: v => v.start + v.span / 2, span: v => 2 * (v.center - v.start) }),
    E('fbw', ['span', 'center'], v => 100 * v.span / v.center, { span: v => v.fbw * v.center / 100, center: v => 100 * v.span / v.fbw }),
  ],
  guess: v => {
    const ok = x => isFinite(x);
    const all = (c, s) => ({ center: c, span: s, start: c - s / 2, stop: c + s / 2 });
    if (ok(v.start) && ok(v.stop)) return all((v.start + v.stop) / 2, v.stop - v.start);
    if (ok(v.stop) && ok(v.span)) return { center: v.stop - v.span / 2, span: v.span, start: v.stop - v.span, stop: v.stop };
    if (ok(v.start) && ok(v.fbw)) { const c = v.start / (1 - v.fbw / 200); return Object.assign(all(c, v.fbw * c / 100), { start: v.start }); }
    if (ok(v.stop) && ok(v.fbw)) { const c = v.stop / (1 + v.fbw / 200); return Object.assign(all(c, v.fbw * c / 100), { stop: v.stop }); }
    return null;
  },
  outputs: [
    O('± half span', v => v.span / 2, 'Hz', true),
    O('Geometric centre √(start·stop)', v => sqrt(v.start * v.stop), 'Hz', true),
    O('Ratio stop / start', v => v.stop / v.start, '×'),
    O('Octaves', v => Math.log2(v.stop / v.start), 'oct'),
    O('Decades', v => log10(v.stop / v.start), 'dec'),
    O('Equivalent Q (centre / span)', v => v.center / v.span, ''),
    O('Wavelength at centre', v => lam(v.center), 'm', true),
  ],
  note: 'Centre = (start + stop)/2 · Span = stop − start · FBW = span/centre. Filters are usually specified around the geometric centre √(f₁f₂).',
},

// ================================================================ COMP ======
{
  id: 'atten', cat: 'comp', title: 'Resistive Attenuator', kw: 'attenuator pad pi tee bridged resistor',
  desc: 'Matched resistive pad (Z₀ in and out). If you enter the resistors, Z₀ and the attenuation are solved.',
  cfg: [
    { id: 'topo', label: 'Topology', def: 'pi', options: [['pi', 'Pi (π)'], ['tee', 'Tee (T)'], ['btee', 'Bridged-T']] },
    { id: 'tol', label: 'Resistor tolerance', def: '1', options: TOLERANCES.map(t => [t, '± ' + t + ' %']) },
    { id: 'build', label: 'Build with', def: 'E96', options: [['exact', 'Exact calculated values'], ['E96', 'Nearest E96 values'], ['E48', 'Nearest E48 values'], ['E24', 'Nearest E24 values'], ['E12', 'Nearest E12 values']] },
  ],
  vars: [
    ohmV('z0', 'Impedance Z₀', 50),
    posV('a', 'Attenuation', 10, 'dB', { min: 1e-6, max: 400 }),
    ohmV('r1', $ => $.topo === 'pi' ? 'R1: shunt resistors (×2)' : $.topo === 'tee' ? 'R1: series resistors (×2)' : 'R1: bridge resistor'),
    ohmV('r2', $ => $.topo === 'pi' ? 'R2: series resistor' : $.topo === 'tee' ? 'R2: shunt resistor' : 'R2: shunt resistor'),
  ],
  eqs: [
    E('r1', ['z0', 'a'], v => attenR(v.$.topo, v.z0, v.a)[0], { z0: v => v.r1 / attenR(v.$.topo, 1, v.a)[0] }),
    E('r2', ['z0', 'a'], v => attenR(v.$.topo, v.z0, v.a)[1], { z0: v => v.r2 / attenR(v.$.topo, 1, v.a)[1] }),
  ],
  guess: v => ({ z0: 50, a: 10 }),
  outputs: [
    O('Resistors as built', v => { const t = tolCase(v); return t ? t.built.map(b => b.label + ' = ' + fmtSI(b.val, 'Ω', 4) + (v.$.build === 'exact' ? '' : ' (' + pct(b.dev) + ')')).join(' · ') : NaN; }),
    O('Attenuation as built (nominal values)', v => { const t = tolCase(v); return t ? fmt(t.att0, 5) + ' dB (' + sgn(t.att0 - v.a, 3) + ' dB vs. target)' : NaN; }),
    O('Worst-case range with ± tolerance', v => { const t = tolCase(v); return t ? fmt(t.min, 5) + ' … ' + fmt(t.max, 5) + ' dB' : NaN; }),
    O('Worst-case error vs. target', v => { const t = tolCase(v); return t ? sgn(t.min - v.a, 3) + ' / ' + sgn(t.max - v.a, 3) + ' dB  (' + pct(100 * (t.min - v.a) / v.a) + ' / ' + pct(100 * (t.max - v.a) / v.a) + ')' : NaN; }),
    O('Statistical error (RSS of the resistors)', v => { const t = tolCase(v); return t ? '± ' + fmt(t.rss, 3) + ' dB' : NaN; }),
    O('Worst-case return loss / VSWR', v => { const t = tolCase(v); return t ? fmt(t.rlWorst, 4) + ' dB / ' + fmt(vswrOf(fromDbv(-t.rlWorst)), 4) : NaN; }),
    O('Voltage ratio', v => fromDbv(v.a), '×'),
  ],
  note: 'The error range is the worst case over every combination of resistors at ± tolerance, from a nodal analysis of the real network. RSS assumes independent resistors. K = 10<sup>A/20</sup>. Pi: R<sub>shunt</sub> = Z₀(K+1)/(K−1), R<sub>series</sub> = Z₀(K²−1)/(2K). Tee: R<sub>series</sub> = Z₀(K−1)/(K+1), R<sub>shunt</sub> = 2Z₀K/(K²−1). Bridged-T: R<sub>bridge</sub> = Z₀(K−1), R<sub>shunt</sub> = Z₀/(K−1).',
},
{ id: 'eseries', cat: 'comp', title: 'Standard Value Finder (E-Series)', kw: 'e12 e24 e96 standard value resistor capacitor nearest', custom: 'eseries' },

// ================================================================= REF ======
{ id: 'ref_cables', cat: 'ref', title: 'Coax Cables', kw: 'cable database coax lmr rg attenuation', custom: 'ref_cables' },
{ id: 'ref_subs', cat: 'ref', title: 'PCB Substrates', kw: 'substrate dielectric permittivity rogers fr4 laminate', custom: 'ref_subs' },
{ id: 'ref_cond', cat: 'ref', title: 'Conductors', kw: 'conductor resistivity conductivity copper metal', custom: 'ref_cond' },
{ id: 'ref_bands', cat: 'ref', title: 'Frequency Bands', kw: 'band ieee itu ism wifi gnss gps cellular lte 5g', custom: 'ref_bands' },
{ id: 'ref_wg', cat: 'ref', title: 'Rectangular Waveguides', kw: 'waveguide wr te10 cutoff', custom: 'ref_wg' },
{ id: 'ref_conn', cat: 'ref', title: 'RF Connectors', kw: 'connector sma n bnc frequency', custom: 'ref_conn' },
];

// ---- helpers used by the definitions above --------------------------------
function mixS(v) { return v.$.mode === 'low' ? -1 : 1; }
// receiver noise temperature from the noise figure (defined at T₀ = 290 K)
function teOf(nf) { return 290 * (fromDbp(nf) - 1); }
// total (source + receiver) noise temperature behind a noise floor in bandwidth bw
function tSysOf(v) { return fromDbp(v.floor) / (KB * 1000 * v.bw); }
// Friis / FSPL is a far-field model
const nearField = (d, f) => d > 0 && f > 0 && d < 2 * lam(f);
const NEAR_FIELD = '⚠ The distance is less than 2λ, in the antenna near field. The Friis free-space model needs d ≫ λ and d > 2D²/λ, so the path loss shown is not physical here (it drops to 0 dB at d = λ/4π).';
// Microstrip dielectric loss (Pozar 3.198): α_d = k₀·εr·q·tanδ / (2√εeff), q = (εeff − 1)/(εr − 1).
// q is 0/0 at εr = 1, so near 1 it is taken at εr = 1 + 1e-6 (it is continuous there).
function msLossD(v) {
  const ee = microstrip(v.W, v.H, v.T, v.er).ee;
  const k0 = 2 * PI * v.f / C0;
  const erq = v.er - 1 < 1e-6 ? 1 + 1e-6 : v.er;
  const q = erq === v.er ? (ee - 1) / (v.er - 1) : (microstrip(v.W, v.H, v.T, erq).ee - 1) / (erq - 1);
  return DB_NEPER * k0 * v.er * q * v.tand / (2 * sqrt(ee));
}
// Microstrip conductor loss, smooth annealed copper: α_c = R_s/(Z₀W)
function msLossC(v) { return DB_NEPER * sqrt(PI * v.f * MU0 * RHO_CU_ANNEALED) / (v.Z0 * v.W); }
function qwtBw(z0, zl, gm) {
  if (!(z0 > 0 && zl > 0)) return NaN;
  if (Math.abs(zl - z0) < 1e-12) return Infinity;
  const arg = gm / sqrt(1 - gm * gm) * 2 * sqrt(z0 * zl) / Math.abs(zl - z0);
  if (arg >= 1) return 200;
  return 100 * (2 - 4 / PI * Math.acos(arg));
}
function bandTxt(fc, bw) {
  if (!isFinite(fc) || !isFinite(bw)) return NaN;
  return fmtSI(fc - bw / 2, 'Hz', 6) + ' – ' + fmtSI(fc + bw / 2, 'Hz', 6);
}
const sgn = (x, sig) => (x >= 0 ? '+' : '') + fmt(Math.abs(x) < 1e-12 ? 0 : x, sig);
const pct = x => sgn(x, 3) + ' %';
let _tolKey = '', _tolVal = null;
function tolCase(v) {
  if (![v.z0, v.a, v.r1, v.r2].every(x => isFinite(x) && x > 0)) return null;
  const key = [v.$.topo, v.$.tol, v.$.build, v.z0, v.a, v.r1, v.r2].join('|');
  if (key !== _tolKey) { _tolKey = key; _tolVal = attenTolerance(v.$.topo, v.z0, v.r1, v.r2, +v.$.tol, v.$.build); }
  return _tolVal;
}
function eTxt(x) {
  const a = nearestE(x, 'E24'), b = nearestE(x, 'E96');
  if (!a || !b) return NaN;
  return fmtSI(a.best, 'Ω', 4) + ' (' + (a.err >= 0 ? '+' : '') + a.err.toFixed(1) + ' %) / ' +
         fmtSI(b.best, 'Ω', 4) + ' (' + (b.err >= 0 ? '+' : '') + b.err.toFixed(1) + ' %)';
}

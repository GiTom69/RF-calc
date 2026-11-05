// ============================================================================
// b2-ui.js - phase 2, batch 2 (DOM): IP3 chart, phase noise → jitter,
// spur & harmonic table, LC filter prototypes.
// ============================================================================

const b2Hz = v => fmtSI(v, 'Hz', 4);
const b2Wrap = el => el ? h('div', { class: 'b2-chart' }, el) : null;

// Small table with optional per-row class (gridTable has none)
function b2Table(head, rows, rowCls) {
  return h('table', { class: 'grid b2-tbl' },
    h('thead', {}, h('tr', {}, head.map(x => h('th', { html: x })))),
    h('tbody', {}, rows.map((r, i) => h('tr', { class: rowCls ? rowCls(i) : '' }, r.map(x => h('td', { html: String(x) }))))));
}

// --------------------------------------------------------- IP3 diagram ----
function b2Ip3Chart(v) {
  if (![v.pin, v.g, v.pim3, v.iip3, v.oip3, v.floor].every(isFinite)) return null;
  const flY = v.floor + v.g;
  const xs = (2 * v.iip3 + v.floor) / 3;
  const x0 = Math.floor((Math.min(v.floor, v.pin) - 10) / 10) * 10;
  const x1 = Math.ceil((Math.max(v.iip3, v.pin) + 10) / 10) * 10;
  const fund = x => x + v.g, im3 = x => v.pim3 + 3 * (x - v.pin);
  // the measured IM3 point must lie inside the range, or lineChart would clamp
  // its marker to the edge (a high-linearity device can sit far below the floor)
  const y0 = Math.floor((Math.min(flY, v.pim3) - 15) / 10) * 10;
  const y1 = Math.ceil((Math.max(v.oip3, v.pim3, v.pin + v.g) + 10) / 10) * 10;
  return b2Wrap(lineChart({
    title: 'Output power vs. input power per tone',
    w: 500, h: 270,
    x: { min: x0, max: x1, label: 'Input power per tone (dBm)' },
    y: { min: y0, max: y1, label: 'Output (dBm)' },
    series: [
      { label: 'Fundamental (1:1)', slot: 1, pts: [[x0, fund(x0)], [x1, fund(x1)]] },
      { label: 'IM3 product (3:1)', slot: 2, pts: [[x0, im3(x0)], [x1, im3(x1)]] },
      { label: 'Output noise floor', slot: 3, pts: [[x0, flY], [x1, flY]] },
    ],
    markers: [
      { x: v.iip3, y: v.oip3, label: 'IP3', slot: 1, rows: [{ value: fmt(v.iip3, 4) + ' dBm', label: 'IIP3' }, { value: fmt(v.oip3, 4) + ' dBm', label: 'OIP3' }] },
      { x: v.pin, y: v.pim3, label: 'measured', slot: 2, rows: [{ value: fmt(v.pim3, 4) + ' dBm', label: 'measured IM3 at ' + fmt(v.pin, 4) + ' dBm in', slot: 2 }] },
    ],
    vlines: [{ x: xs, label: 'max SFDR' }],
    tip: x => [
      { value: fmt(x, 4) + ' dBm', label: 'input per tone' },
      { value: fmt(fund(x), 4) + ' dBm', label: 'fundamental', slot: 1 },
      { value: fmt(im3(x), 4) + ' dBm', label: 'IM3', slot: 2 },
      { value: fmt(flY, 4) + ' dBm', label: 'noise floor', slot: 3 },
    ],
    note: 'SFDR = ' + fmt(v.sfdr, 4) + ' dB: the fundamental above the floor at the input level where IM3 reaches the floor.',
  }));
}

// ---------------------------------------------------- phase noise card ----
const b2PnDefault = [
  { f: '1k', L: '-85' }, { f: '10k', L: '-95' }, { f: '100k', L: '-100' }, { f: '1M', L: '-120' }, { f: '10M', L: '-145' },
];
CUSTOM.pnjitter = function (calc, body) {
  calc.wide = true;
  const saved = store.get('c.pnjitter');
  let rows = Array.isArray(saved) && saved.length ? saved : b2PnDefault.map(r => Object.assign({}, r));
  const upd = () => update();
  const f0 = numField('Carrier frequency', 1e9, { unit: 'Hz', du: 'MHz' }, upd);
  const f1 = numField('Integrate from offset', 1e3, { unit: 'Hz', du: 'kHz' }, upd);
  const f2 = numField('Integrate to offset', 10e6, { unit: 'Hz', du: 'MHz' }, upd);
  const tbl = h('div');
  const out = h('div', { class: 'sout' });
  const chartBox = h('div');
  const mem = cardMemory('c.pnjitter.f', { nums: { f0: f0, f1: f1, f2: f2 } });
  const parseRow = r => [parseField(r.f, 'Hz', 'Hz', 'Hz').val, parseNum(String(r.L).replace(/dBc\/Hz$/i, ''))];

  function drawTable() {
    tbl.innerHTML = '';
    const t = h('table', { class: 'grid edit b2-pn' });
    t.append(h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Offset (Hz, e.g. 10k)'), h('th', {}, 'L(f) (dBc/Hz)'), h('th', {}, ''))));
    const tb = h('tbody');
    rows.forEach((r, i) => {
      const a = h('input', { type: 'text', value: r.f, spellcheck: 'false' });
      const b = h('input', { type: 'text', value: r.L, spellcheck: 'false' });
      a.addEventListener('input', () => { r.f = a.value; update(); });
      b.addEventListener('input', () => { r.L = b.value; update(); });
      const del = h('button', { class: 'btn small', title: 'Remove point' }, '×');
      del.addEventListener('click', () => { rows.splice(i, 1); drawTable(); update(); });
      tb.append(h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, a), h('td', {}, b), h('td', {}, del)));
    });
    t.append(tb);
    const add = h('button', { class: 'btn' }, '+ Add point');
    add.addEventListener('click', () => {
      const last = rows.length ? parseRow(rows[rows.length - 1]) : [1e3, -100];
      rows.push({ f: fmtSI(isFinite(last[0]) ? last[0] * 10 : 1e3, '').replace(/\s/g, ''), L: String(isFinite(last[1]) ? last[1] - 20 : -100) });
      drawTable(); update();
    });
    tbl.append(t, h('div', { class: 'btnrow' }, add));
  }
  function update() {
    store.set('c.pnjitter', rows);
    mem.save();
    out.innerHTML = '';
    chartBox.innerHTML = '';
    const pts = rows.map(parseRow);
    const bad = pts.findIndex(p => !(p[0] > 0) || !isFinite(p[1]));
    if (bad >= 0) { out.append(h('div', { class: 'msg err' }, 'Point ' + (bad + 1) + ': enter a positive offset and a level in dBc/Hz.')); return; }
    if (pts.length < 2) { out.append(h('div', { class: 'msg info' }, 'Enter at least two points.')); return; }
    const F0 = f0.get(), A = f1.get(), B = f2.get();
    if (!(F0 > 0 && A > 0 && B > A)) { out.append(h('div', { class: 'msg err' }, 'Enter a carrier frequency and integration limits with "from" < "to".')); return; }
    const I = b2PnIntegrate(pts, A, B);
    if (!(I.p > 0)) { out.append(h('div', { class: 'msg err' }, 'The integration range does not overlap the table.')); return; }
    const r = b2PnResults(I.p, F0);
    out.append(kvTable([
      ['Integrated SSB phase noise 10·log ∫L(f)df', fmt(r.ssb, 5) + ' dBc'],
      ['Integrated DSB phase noise (both sidebands)', fmt(r.dsb, 5) + ' dBc'],
      ['RMS phase error', fmt(r.phiRad * 1e3, 5) + ' mrad = ' + fmt(r.phiDeg, 5) + '°'],
      ['RMS jitter', fmtSI(r.jitter, 's', 5)],
      ['EVM limit, small-angle ≈ φ<sub>rms</sub> (phase noise only)', fmt(r.evm, 4) + ' %'],
      ['EVM limit, Gaussian phase error √(2(1 − e<sup>−φ²/2</sup>))', fmt(r.evmGauss, 4) + ' %'],
      ['SNR limit (phase noise only)', fmt(r.snr, 5) + ' dB'],
      ['Integrated range', b2Hz(I.lo) + ' … ' + b2Hz(I.hi)],
    ]));
    if (r.large) out.append(h('div', { class: 'msg warn b2-large' }, '⚠ φrms = ' + fmt(r.phiRad, 3) + ' rad is large (> 0.2 rad). The small-angle relations L(f) ≈ Sφ(f)/2, EVM ≈ φrms and SNR = −10·log(2∫L) are no longer accurate; the Gaussian EVM (at most 141 %) is the better estimate.'));
    if (I.clipped) out.append(h('div', { class: 'msg warn' }, '⚠ The integration limits extend beyond the table. Only ' + b2Hz(I.lo) + ' … ' + b2Hz(I.hi) + ' is integrated. Add points to cover the full range.'));
    const sp = pts.slice().sort((a, b) => a[0] - b[0]);
    const lx = sp.map(p => log10(p[0]));
    const Ls = sp.map(p => p[1]);
    const ymin = Math.floor((Math.min(...Ls) - 5) / 10) * 10, ymax = Math.ceil((Math.max(...Ls) + 5) / 10) * 10;
    chartBox.append(b2Wrap(lineChart({
      title: 'Single-sideband phase noise L(f)',
      w: 560, h: 260,
      x: { min: lx[0], max: lx[lx.length - 1], label: 'Offset frequency (log scale)', fmt: t => fmtSI(Math.pow(10, t), 'Hz', 3) },
      y: { min: ymin, max: ymax, label: 'dBc/Hz' },
      series: [{ label: 'L(f)', slot: 1, pts: sp.map(p => [log10(p[0]), p[1]]) }],
      legend: [],
      markers: sp.map(p => ({ x: log10(p[0]), y: p[1], slot: 1, rows: [{ value: fmt(p[1], 4) + ' dBc/Hz', label: 'at ' + b2Hz(p[0]), slot: 1 }] })),
      vlines: [{ x: log10(I.lo), label: 'from' }, { x: log10(I.hi), label: 'to' }],
      tip: x => {
        // 10^x can land a hair outside the table at the axis ends
        const f = Math.min(sp[sp.length - 1][0], Math.max(sp[0][0], Math.pow(10, x)));
        return [{ value: fmt(b2PnAt(sp, f), 4) + ' dBc/Hz', label: 'at ' + b2Hz(f), slot: 1 }];
      },
    })));
  }
  mem.restore();
  resetButton(body, () => { rows = b2PnDefault.map(r => Object.assign({}, r)); mem.reset(); drawTable(); update(); });
  body.append(
    h('p', { class: 'desc' }, 'Integrates a single-sideband phase-noise profile between two offsets and gives RMS phase error, jitter and the resulting EVM and SNR limits. Between points the curve is straight on a log-log plot, and each segment is integrated exactly.'),
    h('div', { class: 'cols' }, h('div', {}, f0.row, f1.row, f2.row, tbl), h('div', {}, out)),
    chartBox,
    h('div', { class: 'note', html: 'φ<sub>rms</sub> = √(2∫L(f)df) rad (L in linear units, single sideband) · jitter = φ<sub>rms</sub>/(2π·f₀) · EVM ≈ φ<sub>rms</sub> · SNR limit = −10·log(2∫L(f)df). A segment with slope s dB/decade integrates as a power law f<sup>s/10</sup>; −10 dB/decade uses the logarithmic form.' }));
  drawTable();
  update();
};

// ------------------------------------------------------- spur table -------
CUSTOM.spurs = function (calc, body) {
  calc.wide = true;
  const upd = () => update();
  const rf1 = numField('RF band start', 2400e6, { unit: 'Hz', du: 'MHz' }, upd);
  const rf2 = numField('RF band stop', 2483.5e6, { unit: 'Hz', du: 'MHz' }, upd);
  const loMode = selectField('LO', [['fixed', 'Fixed frequency'], ['band', 'Tuning range']], 'fixed', () => { vis(); update(); });
  const lo1 = numField('LO frequency (or range start)', 2330e6, { unit: 'Hz', du: 'MHz' }, upd);
  const lo2 = numField('LO range stop', 2413.5e6, { unit: 'Hz', du: 'MHz' }, upd);
  lo2.row.style.display = 'none';
  const if1 = numField('IF band start', 70e6, { unit: 'Hz', du: 'MHz' }, upd);
  const if2 = numField('IF band stop', 153.5e6, { unit: 'Hz', du: 'MHz' }, upd);
  const nmax = numField('Maximum order |m| + |n|', 5, { sym: '' }, upd);
  const want = selectField('Wanted product', [['down', '|RF − LO| (down-conversion)'], ['up', 'RF + LO (up-conversion)']], 'down', upd);
  const show = selectField('Show', [['in', 'Products in the IF band only'], ['all', 'All products']], 'in', upd);
  const out = h('div', { class: 'sout' });
  const mem = cardMemory('c.spurs', { nums: { rf1: rf1, rf2: rf2, lo1: lo1, lo2: lo2, if1: if1, if2: if2, nmax: nmax }, sels: { loMode: loMode, want: want, show: show } });
  const vis = () => { lo2.row.style.display = loMode.get() === 'band' ? '' : 'none'; };
  function update() {
    mem.save();
    out.innerHTML = '';
    const R1 = rf1.get(), R2 = rf2.get(), L1 = lo1.get(), L2 = loMode.get() === 'band' ? lo2.get() : lo1.get();
    const I1 = if1.get(), I2 = if2.get(), N = Math.round(nmax.get());
    if (![R1, R2, L1, L2, I1, I2].every(x => x >= 0) || !(R2 >= R1 && L2 >= L1 && I2 >= I1)) {
      out.append(h('div', { class: 'msg err' }, 'Enter non-negative band edges with start ≤ stop.')); return;
    }
    // the wanted RF ± LO is itself an order-2 product
    if (!(N >= 2 && N <= 15)) { out.append(h('div', { class: 'msg err' }, 'The order must be between 2 and 15 (the wanted product RF ± LO is order 2).')); return; }
    const rows = b2Products({ rf1: R1, rf2: R2, lo1: L1, lo2: L2, if1: I1, if2: I2, N: N, desired: want.get() });
    const spurs = rows.filter(r => r.inband && r.kind !== 'desired');
    const lowest = spurs.length ? Math.min(...spurs.map(r => r.order)) : NaN;
    const des = rows.find(r => r.kind === 'desired');
    if (!des) { out.append(h('div', { class: 'msg err' }, 'The wanted product was not generated; increase the maximum order.')); return; }
    // share of the wanted range inside the IF band (r.overlap is a share of the IF band instead)
    const desSpan = des.f2 - des.f1;
    const desIn = desSpan > 0 ? Math.max(0, Math.min(des.f2, I2) - Math.max(des.f1, I1)) / desSpan : (des.inband ? 1 : 0);
    const desPart = des.inband && (des.f1 < I1 || des.f2 > I2);
    const desWarn = !des.inband ? '  ⚠ not inside the IF band'
      : desPart ? '  ⚠ only partly inside the IF band (' + fmt(100 * desIn, 3) + ' % of the wanted range' +
        (L2 > L1 ? '; RF and LO are treated as independent, so a tracking LO may stay in band' : '') + ')' : '';
    out.append(kvTable([
      ['Wanted product', des.text + ' = ' + b2Hz(des.f1) + ' … ' + b2Hz(des.f2) + desWarn],
      ['Unwanted products in the IF band', spurs.length ? String(spurs.length) : 'none up to order ' + N],
      ['Lowest-order in-band spur', isFinite(lowest) ? 'order ' + lowest + ': ' + spurs.filter(r => r.order === lowest).map(r => r.text).join(', ') : '—'],
    ]));
    const list = show.get() === 'all' ? rows : rows.filter(r => r.inband);
    out.append(section('Mixing products m·RF ± n·LO', b2Table(['m', 'n', 'Order', 'Product', 'Frequency range', 'In IF band', 'Type'],
      list.map(r => [r.m, r.n, r.order, r.text, b2Hz(r.f1) + ' … ' + b2Hz(r.f2),
        r.inband ? (r.kind === 'desired' ? (desPart ? 'wanted (' + fmt(100 * desIn, 3) + ' % in IF)' : 'wanted') : '<b>yes</b> (' + fmt(100 * r.overlap, 3) + ' % of IF)') : 'no', r.kind]),
      i => list[i].kind === 'desired' ? 'b2-want' : list[i].inband ? 'b2-hit' : '')));
    const inB = (a, b, c, d) => !(b < c || a > d);
    const harm = [];
    for (let k = 2; k <= N; k++) {
      const hr = [k * R1, k * R2], hl = [k * L1, k * L2];
      harm.push([k, b2Hz(hr[0]) + ' … ' + b2Hz(hr[1]), inB(hr[0], hr[1], I1, I2) ? '<b>IF band</b>' : '—',
        b2Hz(hl[0]) + (L2 > L1 ? ' … ' + b2Hz(hl[1]) : ''), inB(hl[0], hl[1], I1, I2) ? '<b>IF band</b>' : inB(hl[0], hl[1], R1, R2) ? '<b>RF band</b>' : '—']);
    }
    if (harm.length) out.append(section('Harmonics', b2Table(['k', 'k·RF', 'Falls in', 'k·LO', 'Falls in'], harm)));
  }
  body.append(
    h('p', { class: 'desc' }, 'Lists every mixing product |m·RF ± n·LO| up to a maximum order and flags the ones that land in the IF band. With an LO tuning range, RF and LO are treated as varying independently, which is conservative for a tracking LO.'),
    h('div', { class: 'cols' }, h('div', {}, rf1.row, rf2.row, loMode.row, lo1.row, lo2.row), h('div', {}, if1.row, if2.row, nmax.row, want.row, show.row)),
    out,
    h('div', { class: 'note', html: 'Order = |m| + |n|. Low-order products (2·RF − 2·LO, 2·LO − RF, …) are usually the strongest; their levels depend on the mixer, so check them against the mixer’s spur table.' }));
  mem.restore();
  resetButton(body, () => { mem.reset(); vis(); update(); });
  vis();
  update();
};

// ------------------------------------------------------ LC filter card ----
CUSTOM.lcfilter = function (calc, body) {
  calc.wide = true;
  const upd = () => update();
  const resp = selectField('Response', [['butter', 'Butterworth (maximally flat)'], ['cheby', 'Chebyshev (equal ripple)']], 'butter', () => { vis(); update(); });
  const ripple = numField('Pass-band ripple', 0.5, { sym: 'dB' }, upd);
  const type = selectField('Filter type', [['lpf', 'Low-pass'], ['hpf', 'High-pass'], ['bpf', 'Band-pass'], ['bsf', 'Band-stop']], 'lpf', () => { vis(); update(); });
  const fc = numField('Cut-off frequency f<sub>c</sub>', 2e9, { unit: 'Hz', du: 'MHz' }, upd);
  const f0 = numField('Centre frequency f₀ (geometric)', 1e9, { unit: 'Hz', du: 'MHz' }, upd);
  const bw = numField('Bandwidth (pass band for BPF, stop band for BSF)', 100e6, { unit: 'Hz', du: 'MHz' }, upd);
  const omode = selectField('Order', [['fixed', 'Choose the order'], ['spec', 'From a stop-band requirement']], 'spec', () => { vis(); update(); });
  const nfield = numField('Order N', 5, { sym: '' }, upd);
  const fst = numField('Stop-band frequency', 3e9, { unit: 'Hz', du: 'MHz' }, upd);
  const ast = numField('Required attenuation at that frequency', 15, { sym: 'dB' }, upd);
  const z0 = numField('System impedance Z₀', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const first = selectField('First element', [['shunt', 'Shunt (π ladder)'], ['series', 'Series (T ladder)']], 'shunt', upd);
  const snap = selectField('Component values', [['exact', 'Exact'], ['E96', 'Nearest E96'], ['E24', 'Nearest E24'], ['E12', 'Nearest E12']], 'exact', upd);
  const out = h('div', { class: 'sout' });
  const chartBox = h('div');
  const mem = cardMemory('c.lcfilter', {
    nums: { ripple: ripple, fc: fc, f0: f0, bw: bw, nfield: nfield, fst: fst, ast: ast, z0: z0 },
    sels: { resp: resp, type: type, omode: omode, first: first, snap: snap },
  });
  function vis() {
    const band = type.get() === 'bpf' || type.get() === 'bsf';
    ripple.row.style.display = resp.get() === 'cheby' ? '' : 'none';
    fc.row.style.display = band ? 'none' : '';
    f0.row.style.display = band ? '' : 'none';
    bw.row.style.display = band ? '' : 'none';
    nfield.row.style.display = omode.get() === 'fixed' ? '' : 'none';
    fst.row.style.display = omode.get() === 'spec' ? '' : 'none';
    ast.row.style.display = omode.get() === 'spec' ? '' : 'none';
  }
  const partTxt = e => {
    const L = e.L !== undefined ? fmtSI(e.L, 'H', 4) : '', C = e.C !== undefined ? fmtSI(e.C, 'F', 4) : '';
    if (e.net === 'L') return 'L = ' + L;
    if (e.net === 'C') return 'C = ' + C;
    return 'L = ' + L + ', C = ' + C;
  };
  const netTxt = e => e.net === 'L' ? 'inductor' : e.net === 'C' ? 'capacitor' : e.net === 'LCs' ? 'series LC' : 'parallel LC';
  function update() {
    mem.save();
    out.innerHTML = '';
    chartBox.innerHTML = '';
    const R = resp.get(), T = type.get(), Z = z0.get(), rip = R === 'cheby' ? ripple.get() : 0;
    const band = T === 'bpf' || T === 'bsf';
    const FC = fc.get(), F0 = f0.get(), BW = bw.get();
    const err = m => out.append(h('div', { class: 'msg err' }, m));
    if (!(Z > 0)) return err('Enter a positive impedance.');
    if (R === 'cheby' && !(rip > 0 && rip <= 10)) return err('Enter a ripple between 0 and 10 dB.');
    // the lumped band transforms are exact for any fractional bandwidth
    if (band ? !(F0 > 0 && BW > 0) : !(FC > 0)) return err('Enter positive frequencies.');
    let N, Om = NaN;
    if (omode.get() === 'spec') {
      Om = b2FilterOmega(T, fst.get(), FC, F0, BW);
      if (!(Om > 1)) return err('The stop-band frequency must lie in the stop band (outside the pass band).');
      N = b2FilterOrder(R, ast.get(), rip, Om);
      if (!(N >= 1)) return err('Enter a positive attenuation.');
      if (N > 20) return err('This needs order ' + N + '. The limit is 20; relax the requirement.');
    } else {
      N = Math.round(nfield.get());
      if (!(N >= 1 && N <= 20)) return err('The order must be between 1 and 20.');
    }
    const design = b2FilterDesign({ resp: R, ripple: rip, type: T, n: N, fc: FC, f0: F0, bw: BW, z0: Z, first: first.get() });
    const built = b2FilterSnap(design, snap.get());
    const snapped = snap.get() !== 'exact';
    const w3 = b2Filter3dB(R, N, rip);
    const edges = band ? b2BandEdges(F0, BW) : null;
    let f3 = '';
    if (T === 'lpf') f3 = b2Hz(FC * w3);
    else if (T === 'hpf') f3 = b2Hz(FC / w3);
    else if (T === 'bpf') f3 = b2Hz(b2BandEdges(F0, BW * w3)[0]) + ' … ' + b2Hz(b2BandEdges(F0, BW * w3)[1]);
    else f3 = b2Hz(b2BandEdges(F0, BW / w3)[0]) + ' … ' + b2Hz(b2BandEdges(F0, BW / w3)[1]);
    const rows = [
      ['Order N', String(N) + (omode.get() === 'spec' ? ' (minimum for ' + fmt(ast.get(), 4) + ' dB at Ω = ' + fmt(Om, 4) + ')' : '')],
      ['Prototype g-values g₁ … g<sub>N</sub>', design.g.slice(1, N + 1).map(x => fmt(x, 5)).join(', ')],
      ['Load g<sub>N+1</sub> → required load resistance', fmt(design.g[N + 1], 5) + ' → ' + fmtSI(design.rl, 'Ω', 5) +
        (Math.abs(design.rl - Z) > 1e-6 * Z ? ' ⚠ not Z₀ (even-order Chebyshev): use a transformer, or choose an odd order' : '')],
      band ? ['Pass-band edges (ripple / −3 dB for Butterworth)', b2Hz(edges[0]) + ' … ' + b2Hz(edges[1])] : null,
      [R === 'cheby' ? '−3 dB frequency' + (w3 < 1 ? ' (inside the ripple band, ripple > 3.01 dB)' : '') : 'Cut-off (−3 dB)', f3],
    ];
    if (omode.get() === 'spec') {
      const a1 = -b2FilterResp(design, fst.get()).s21, a2 = -b2FilterResp(built, fst.get()).s21;
      rows.push(['Attenuation at ' + b2Hz(fst.get()), fmt(a1, 4) + ' dB' + (snapped ? ' (with ' + snap.get() + ' values: ' + fmt(a2, 4) + ' dB)' : '')]);
    }
    out.append(kvTable(rows));
    if (band && BW > F0) out.append(h('div', { class: 'msg info b2-wide' }, 'Very wide band (f₂/f₁ = ' + fmt(edges[1] / edges[0], 3) + '): the component values spread a lot. A cascaded low-pass and high-pass may be more practical.'));
    out.append(section('Components (source → load)', b2Table(['#', 'Position', 'Network', 'Exact values', snapped ? snap.get() + ' values' : ''],
      design.els.map((e, i) => [e.k, e.arm === 'series' ? 'series arm' : 'shunt to ground', netTxt(e), partTxt(e), snapped ? partTxt(built.els[i]) : '']))));
    // response chart
    let xmin, xmax;
    if (T === 'lpf') { xmin = 0; xmax = 3 * FC; }
    else if (T === 'hpf') { xmin = 0; xmax = 3 * FC; }
    else { xmin = Math.max(0, F0 - 3 * BW); xmax = F0 + 3 * BW; }
    if (omode.get() === 'spec' && fst.get() > xmax * 0.95) xmax = fst.get() * 1.15;
    if (omode.get() === 'spec' && fst.get() < xmin + 0.05 * (xmax - xmin)) xmin = Math.max(0, fst.get() * 0.85);
    const NP = 400, pts21 = [], pts11 = [], ptsB = [];
    for (let i = 0; i <= NP; i++) {
      const f = xmin + (xmax - xmin) * i / NP || (xmax - xmin) / (NP * 50);
      const r = b2FilterResp(design, f);
      pts21.push([f, r.s21]); pts11.push([f, r.s11]);
      if (snapped) ptsB.push([f, b2FilterResp(built, f).s21]);
    }
    const series = [{ label: '|S21| exact', slot: 1, pts: pts21 }, { label: '|S11| exact', slot: 2, pts: pts11 }];
    if (snapped) series.push({ label: '|S21| with ' + snap.get() + ' values', slot: 3, pts: ptsB });
    const vl = band ? [{ x: edges[0] }, { x: edges[1] }] : [{ x: FC, label: 'f_c' }];
    if (omode.get() === 'spec') vl.push({ x: fst.get(), label: 'stop' });
    chartBox.append(b2Wrap(lineChart({
      title: 'Response of the ladder (with the designed terminations)',
      w: 640, h: 280,
      x: { min: xmin, max: xmax, label: 'Frequency', fmt: v => fmtSI(v, 'Hz', 3) },
      y: { min: -80, max: 2, label: 'dB' },
      series: series,
      vlines: vl,
      tip: f => {
        const r = b2FilterResp(design, Math.max(f, (xmax - xmin) / (NP * 50)));
        const t = [{ value: b2Hz(f), label: 'frequency' }, { value: fmt(r.s21, 4) + ' dB', label: '|S21|', slot: 1 }, { value: fmt(r.s11, 4) + ' dB', label: '|S11|', slot: 2 }];
        if (snapped) t.push({ value: fmt(b2FilterResp(built, Math.max(f, (xmax - xmin) / (NP * 50))).s21, 4) + ' dB', label: '|S21| ' + snap.get(), slot: 3 });
        return t;
      },
      note: 'Computed from the actual LC ladder (ABCD cascade), lossless components.',
    })));
  }
  mem.restore();
  resetButton(body, () => { mem.reset(); vis(); update(); });
  vis();
  body.append(
    h('p', { class: 'desc' }, 'Lumped LC ladder from the Butterworth or Chebyshev low-pass prototype, transformed to low-, high-, band-pass or band-stop. The order can come from a stop-band requirement. Values can be snapped to standard series, and the response of the real ladder is plotted.'),
    h('div', { class: 'cols' },
      h('div', {}, resp.row, ripple.row, type.row, fc.row, f0.row, bw.row, z0.row),
      h('div', {}, omode.row, nfield.row, fst.row, ast.row, first.row, snap.row)),
    out, chartBox,
    h('div', { class: 'note', html: 'Butterworth g<sub>k</sub> = 2·sin((2k−1)π/2N). Chebyshev g-values from β = ln coth(L<sub>r</sub>/17.37), γ = sinh(β/2N) (Matthaei, Pozar §8.3). Even-order Chebyshev filters need a load of g<sub>N+1</sub>·Z₀ (or Z₀/g<sub>N+1</sub>). Band-pass: series arm L = g·Z₀/(ω₀Δ), C = Δ/(ω₀gZ₀); shunt arm L = ΔZ₀/(ω₀g), C = g/(ω₀ΔZ₀), with Δ = BW/f₀.' }));
  update();
};

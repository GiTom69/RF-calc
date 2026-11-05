// ============================================================================
// b1-ui.js - phase 2, batch 1 (DOM): BER waterfall + reference table and the
// Probability of Intercept card. Every top-level name starts with b1.
// ============================================================================

// ----------------------------------------------------------- BER chart -----
const b1CurveCache = {};
function b1Curve(id) {
  if (!b1CurveCache[id]) {
    const pts = [];
    for (let i = 0; i <= 84; i++) { const x = -2 + i * 0.5; pts.push([x, b1BerOf(id, x)]); }
    b1CurveCache[id] = pts;
  }
  return b1CurveCache[id];
}
const b1FmtBer = x => !(x >= 0) ? '—' : x === 0 ? '< 1e-300' : x >= 1e-3 ? fmt(x, 4) : x.toExponential(3).replace('e', 'e');

// Waterfall: the selected modulation is emphasised, the others are muted
// context. The reference table below is the chart's table twin.
function b1BerChart(v) {
  const sel = v.$.mod, m = b1Mod(sel), il = isFinite(v.il) ? v.il : 0;
  const selLabel = m.name + (il > 0 ? ' incl. ' + fmt(il, 3) + ' dB implementation loss' : '');
  const series = b1MODS.filter(x => x.id !== sel).map(x => ({ label: x.name, pts: b1Curve(x.id), slot: 0 }));
  series.push({ label: selLabel, pts: b1Curve(sel).map(p => [p[0] + il, p[1]]), slot: 1 });
  const markers = isFinite(v.ebno) && v.ber > 0 ? [{
    x: v.ebno, y: v.ber, label: 'operating point', slot: 1,
    rows: [{ value: b1FmtBer(v.ber), label: 'BER at ' + fmt(v.ebno, 4) + ' dB', slot: 1 }],
  }] : [];
  const chart = lineChart({
    title: 'BER vs Eb/N0 (AWGN)', w: 540, h: 290,
    x: { min: -2, max: 40, label: 'Eb/N0 (dB)' },
    y: { min: 1e-12, max: 0.5, log: true, label: 'BER' },
    series: series, markers: markers,
    tip: x => [{ value: b1FmtBer(b1BerOf(sel, x - il)), label: m.name + ' at ' + fmt(x, 3) + ' dB', slot: 1 }],
    legend: [{ slot: 1, label: selLabel }, { muted: true, label: 'Other modulations' }],
  });
  const req = b1ReqTable();
  const table = gridTable(['Modulation', 'Bits/symbol', 'BER 10⁻³', 'BER 10⁻⁶', 'BER 10⁻⁹'],
    b1MODS.map(x => {
      const name = x.name + (x.kind === 'xqam' ? ' *' : '');
      const cells = req[x.id].map(d => d.toFixed(2) + ' dB');
      return [x.id === sel ? '<b>' + name + '</b>' : name, b1Bits(x.id)].concat(x.id === sel ? cells.map(c => '<b>' + c + '</b>') : cells);
    }), 'b1-reqtable');
  return h('div', { class: 'b1-berviz' }, chart,
    section('Required Eb/N0 (ideal, without implementation loss)', table),
    h('div', { class: 'viz-note' }, '* Cross QAM: exact for the quasi-Gray labelling used (no perfect Gray code exists). Values are the exact AWGN curves above.'));
}

// ------------------------------------------------------------ POI card -----
const b1POI_PRESETS = [
  ['ex1', 'Radar 3° / 6 s scan vs receiver sweeping 2–18 GHz (10 MHz IF, 0.1 s)', [
    { name: 'Radar beam', type: 'beam', vals: { bw: 3, T: 6 } },
    { name: 'Swept receiver', type: 'sweep', vals: { bif: 10e6, bsig: 0, span: 16e9, T: 0.1 } }]],
  ['ex2', 'Radar 1.5° / 4 s scan vs stepped receiver (800 steps × 1 ms)', [
    { name: 'Radar beam', type: 'beam', vals: { bw: 1.5, T: 4 } },
    { name: 'Stepped receiver', type: 'step', vals: { dwell: 1e-3, span: 16e9, step: 20e6 } }]],
  ['ex3', 'Example 2 plus a rotating receiver antenna (30°, 2.3 s)', [
    { name: 'Radar beam', type: 'beam', vals: { bw: 1.5, T: 4 } },
    { name: 'Stepped receiver', type: 'step', vals: { dwell: 1e-3, span: 16e9, step: 20e6 } },
    { name: 'RX antenna', type: 'rxant', vals: { bw: 30, T: 2.3 } }]],
  ['hop', 'Hopping emitter (100 hops/s, 2320 channels) vs fixed-tuned receiver', [
    { name: 'Hopper', type: 'hop', vals: { rate: 100, nch: 2320 } }]],
];
const b1PoiDefault = () => ({ rows: JSON.parse(JSON.stringify(b1POI_PRESETS[0][2])), tobs: 10, to: 0, k: 1 });
// a probability below 1 is never shown as a certain 100 %
const b1Pct = x => { if (!isFinite(x)) return '—'; const s = fmt(100 * x, 4); return x < 1 && s === '100' ? '> 99.99 %' : s + ' %'; };
const b1Time = t => !isFinite(t) ? (t > 0 ? 'never (∞)' : '—') : fmtSI(t, 's', 4);

CUSTOM.b1poi = function (calc, body) {
  calc.wide = true;
  const saved = store.get('c.poi');
  let st = saved && Array.isArray(saved.rows) && saved.rows.every(r => b1POI_PARAMS[r.type]) ? saved : b1PoiDefault();
  const rowsBox = h('div', { class: 'b1-wins' });
  const out = h('div', { class: 'sout' });
  const upd = () => update();
  const tobs = numField('Observation time T<sub>obs</sub>', st.tobs, { unit: 's', du: 's' }, upd);
  const tov = numField('Minimum overlap needed (e.g. N × PRI)', st.to, { unit: 's', du: 'ms', blank: 0 }, upd);
  const kh = numField('Hops that must be caught (k)', st.k, { sym: 'hops' }, upd);
  const preset = selectField('Load example', [['', 'Custom windows']].concat(b1POI_PRESETS.map(p => [p[0], p[1]])), '', () => {
    const p = b1POI_PRESETS.find(x => x[0] === preset.get());
    if (p) { st.rows = JSON.parse(JSON.stringify(p[2])); drawRows(); update(); }
  });
  const save = () => store.set('c.poi', { rows: st.rows.map(r => ({ name: r.name, type: r.type, vals: r.vals })), tobs: tobs.get(), to: tov.get(), k: kh.get() });
  const infos = [];
  const edited = () => { preset.sel.value = ''; };

  function drawRows() {
    rowsBox.innerHTML = '';
    infos.length = 0;
    st.rows.forEach((r, i) => rowsBox.append(winBox(r, i)));
    const addSel = h('select', { 'aria-label': 'window type' }, b1POI_TYPES.map(t => h('option', { value: t[0] }, t[1])));
    const add = h('button', { class: 'btn' }, '+ Add window');
    add.addEventListener('click', () => {
      const type = addSel.value, vals = {};
      for (const pdef of b1POI_PARAMS[type]) vals[pdef[0]] = pdef[3];
      st.rows.push({ name: (b1POI_TYPES.find(t => t[0] === type) || ['', 'Window'])[1], type: type, vals: vals });
      edited(); drawRows(); update();
    });
    rowsBox.append(h('div', { class: 'b1-addwin' }, addSel, add));
  }
  function winBox(r, i) {
    const name = h('input', { type: 'text', value: r.name, spellcheck: 'false', 'aria-label': 'window name' });
    name.addEventListener('input', () => { r.name = name.value; save(); });
    const type = h('select', { 'aria-label': 'window type' }, b1POI_TYPES.map(t => h('option', { value: t[0] }, t[1])));
    type.value = r.type;
    type.addEventListener('change', () => {
      r.type = type.value; r.vals = {};
      for (const pdef of b1POI_PARAMS[r.type]) r.vals[pdef[0]] = pdef[3];
      edited(); drawRows(); update();
    });
    const del = h('button', { class: 'btn small', title: 'Remove window' }, '×');
    del.addEventListener('click', () => { st.rows.splice(i, 1); edited(); drawRows(); update(); });
    const fields = b1POI_PARAMS[r.type].map(pdef => {
      const key = pdef[0];
      const f = numField(pdef[1], r.vals[key] !== undefined ? r.vals[key] : pdef[3], Object.assign({}, pdef[2], key === 'bsig' ? { blank: 0 } : {}),
        () => { r.vals[key] = f.get(); edited(); update(); });
      return f.row;
    });
    const info = h('div', { class: 'b1-wininfo' });
    infos[i] = info;
    return h('div', { class: 'b1-win' },
      h('div', { class: 'b1-winhead' }, h('span', { class: 'b1-winno' }, 'W' + (i + 1)), name, type, del), fields, info);
  }

  function update() {
    save();
    out.innerHTML = '';
    const wins = st.rows.map(r => b1PoiWindow(r.type, r.vals));
    wins.forEach((w, i) => {
      const info = infos[i];
      if (!info) return;
      const parts = [h('span', {}, isFinite(w.tau) ? 'τ = ' + fmtSI(w.tau, 's', 4) + ' · ' + (w.random ? 'mean T = ' : 'T = ') + fmtSI(w.T, 's', 4) +
        ' · on ' + fmt(100 * Math.min(1, w.tau / w.T), 4) + ' %' + (w.info ? ' · ' + w.info : '') : '')];
      if (w.warn) parts.push(h('div', { class: 'b1-warn' }, '⚠ ' + w.warn));
      info.replaceChildren(...parts);
    });
    if (!wins.length) { out.append(h('div', { class: 'msg info' }, 'Add at least one window.')); return; }
    const badIdx = wins.findIndex(w => !(w.tau > 0 && w.T > 0));
    if (badIdx >= 0) { out.append(h('div', { class: 'msg err' }, 'Window ' + (badIdx + 1) + ': enter valid positive values.')); return; }
    const T = tobs.get(), to = tov.get(), k = Math.round(kh.get());
    if (!(T > 0) || !(to >= 0)) { out.append(h('div', { class: 'msg err' }, 'Enter a positive observation time and a minimum overlap ≥ 0.')); return; }
    const s = b1PoiStats(wins, to);
    const warns = b1PoiWarnings(wins, s);
    const perScan = s.p >= 0 && isFinite(s.Tmax);
    // nested windows are already reduced in λ, so only a large p decides the model
    const useBern = perScan && s.p > 0.1;
    const pois = b1PoiAt(s, false, T), bern = perScan ? b1PoiAt(s, true, T) : NaN;
    const t90p = b1PoiTimeTo(s, false, 0.9), t99p = b1PoiTimeTo(s, false, 0.99);
    const t90b = perScan ? b1PoiTimeTo(s, true, 0.9) : NaN, t99b = perScan ? b1PoiTimeTo(s, true, 0.99) : NaN;
    const rows = s.always ? [
      ['Instantaneous coincidence probability Π τ<sub>i</sub>/T<sub>i</sub>', b1Pct(1)],
      ['<b>POI within T<sub>obs</sub></b>', '<b>' + b1Pct(1) + '</b>  (every window is always on)'],
    ] : [
      ['Instantaneous coincidence probability Π τ<sub>i</sub>/T<sub>i</sub>', b1Pct(s.pon)],
      ['Coincidence already in progress at the start P<sub>0</sub>', b1Pct(s.P0)],
      ['Mean overlap duration 1/Σ(1/τ<sub>i</sub>)', b1Time(s.dur)],
      ['Coincidence rate λ', fmt(s.lam, 6) + ' /s'],
      ['<b>POI within T<sub>obs</sub></b> — per-scan model', perScan ? '<b>' + b1Pct(bern) + '</b>' + (useBern ? '  (recommended)' : '') : 'n/a (no periodic window sets the timing)'],
      ['<b>POI within T<sub>obs</sub></b> — Poisson model', '<b>' + b1Pct(pois) + '</b>' + (useBern ? '' : '  (recommended)')],
      perScan ? ['Per-scan: p per scan of the slowest periodic window (T<sub>max</sub> = ' + fmtSI(s.Tmax, 's', 4) + ')', fmt(s.p, 5)] : null,
      perScan ? ['Per-scan: mean time to intercept', b1Time(b1PoiMeanTime(s, true))] : null,
      perScan ? ['Per-scan: time for 90 % / 99 % POI', b1Time(t90b) + ' / ' + b1Time(t99b)] : null,
      ['Poisson: mean time to intercept', b1Time(b1PoiMeanTime(s, false))],
      ['Poisson: time for 90 % / 99 % POI', b1Time(t90p) + ' / ' + b1Time(t99p)],
    ];
    const hopW = wins.find(w => w.p !== undefined);
    if (hopW) {
      // the binomial count is the hopper against an always-open receiver; other gating windows are not in it
      const n = Math.floor(T * hopW.rate), alone = wins.every(w => w === hopW || b1PoiOn(w));
      rows.push(['Hopping' + (alone ? '' : ' (hopper vs an always-open receiver only, other windows ignored)') + ': P(at least ' + k + ' of ' + (isFinite(n) ? n : '∞') +
        ' hops in T<sub>obs</sub>), p = ' + fmt(hopW.p, 4), b1Pct(b1BinomAtLeast(n, hopW.p, k))]);
    }
    out.append(h('div', { class: 'cols' }, kvTable(rows), b1PoiChart(s, T, useBern)));
    if (warns.length) out.append(h('div', { class: 'b1-warns' }, warns.map(w => h('div', { class: 'msg warn' }, '⚠ ' + w))));
  }

  body.append(
    h('p', { class: 'desc' }, 'Each process that must line up for an intercept is a periodic window: on for τ in every period T (antenna beams, receiver sweeps, emitter bursts, hops). The intercept happens when all windows are open at the same time. Phases are assumed random.'),
    preset.row, rowsBox,
    h('div', { class: 'cols' }, h('div', {}, tobs.row, tov.row, kh.row), h('div')),
    out,
    h('div', { class: 'note', html: 'λ = Σ<sub>j</sub> (1/T<sub>j</sub>)·Π<sub>i≠j</sub>(τ<sub>i</sub> − t<sub>o</sub>)/T<sub>i</sub> (Self &amp; Smith) over the windows that gate the intercept. ' +
      'A window that is always on (τ ≥ T) is left out. A nested window (its period fits inside another on-time, or a hopper next to a periodic window with a longer period: a random hop sequence has no fixed phase) does not get its own 1/T term: λ is multiplied by its chance to line up during each overlap of the others (mean length d = 1/Σ 1/τ; a hopper touches m or m + 1 dwells, x = 1 + d/dwell, m = ⌊x⌋, so 1 − (1 − p)<sup>m</sup>·(1 − (x − m)·p)). ' +
      'Both models include a coincidence already in progress at the start, P<sub>0</sub> = Π(τ<sub>i</sub> − t<sub>o</sub>)/T<sub>i</sub>. ' +
      'Poisson: POI = 1 − (1 − P<sub>0</sub>)·e<sup>−λT/(1 − P<sub>0</sub>)</sup>, valid when each encounter has a small chance. Per-scan: p = λ·T<sub>max</sub> per scan of the slowest periodic window, POI = P<sub>0</sub> + 1 − (1 − p)<sup>n</sup> less the overlap of the two (a coincidence in progress recurs one period later, so it is not counted twice). Swept receiver: τ = (B<sub>IF</sub> + B<sub>sig</sub>)·T<sub>sweep</sub>/span. Beam: τ = θ/360·T<sub>scan</sub>. Hopper vs fixed receiver: p = 1/N per hop, τ = dwell, T = dwell/p; P(≥ k of n) is binomial.' }));
  drawRows();
  update();
};

// POI vs observation time, both models; the kv table above is the table twin.
function b1PoiChart(s, T, useBern) {
  const tEnd = Math.max(1.25 * T, Math.min(1.1 * b1PoiTimeTo(s, useBern, 0.99), 20 * T));
  const xmax = isFinite(tEnd) && tEnd > 0 ? tEnd : 2 * T;
  const perScan = s.p >= 0 && isFinite(s.Tmax);
  const N = 240, pP = [], pB = [];
  for (let i = 0; i <= N; i++) {
    const t = xmax * i / N;
    pP.push([t, 100 * b1PoiAt(s, false, t)]);
    if (perScan) pB.push([t, 100 * b1PoiAt(s, true, t)]);
  }
  const ch = lineChart({
    title: 'POI vs observation time', w: 460, h: 250,
    x: { min: 0, max: xmax, label: 'Observation time (s)' },
    y: { min: 0, max: 100, label: 'POI (%)' },
    series: (perScan ? [{ label: 'Per-scan model', pts: pB, slot: 1 }] : []).concat([{ label: 'Poisson model', pts: pP, slot: 2 }]),
    vlines: [{ x: T, label: 'T_obs' }],
    markers: (perScan ? [{ x: T, y: 100 * b1PoiAt(s, true, T), slot: 1, rows: [{ value: b1Pct(b1PoiAt(s, true, T)), label: 'per-scan at T_obs', slot: 1 }] }] : [])
      .concat([{ x: T, y: 100 * b1PoiAt(s, false, T), slot: 2, rows: [{ value: b1Pct(b1PoiAt(s, false, T)), label: 'Poisson at T_obs', slot: 2 }] }]),
    tip: t => (perScan ? [{ value: b1Pct(b1PoiAt(s, true, t)), label: 'per-scan at ' + fmtSI(t, 's', 3), slot: 1 }] : [])
      .concat([{ value: b1Pct(b1PoiAt(s, false, t)), label: 'Poisson' + (perScan ? '' : ' at ' + fmtSI(t, 's', 3)), slot: 2 }]),
    legend: (perScan ? [{ slot: 1, label: 'Per-scan model' + (useBern ? ' (recommended)' : '') }] : [])
      .concat([{ slot: 2, label: 'Poisson model' + (useBern ? '' : ' (recommended)') }]),
  });
  return h('div', { class: 'b1-poiviz' }, ch);
}

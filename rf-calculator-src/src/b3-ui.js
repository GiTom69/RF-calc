// ============================================================================
// b3-ui.js - phase 2, batch 3: custom cards (2-port cascade, Pi/T match) and
// the two-ray loss chart. DOM code only; the maths lives in b3.js.
// ============================================================================

// ---------------------------------------------------------- two-ray chart ---
function b3TwoRayChart(v) {
  if (![v.f, v.ht, v.hr, v.d].every(x => isFinite(x) && x > 0)) return null;
  const dc = b3Crossover(v.f, v.ht, v.hr);
  // the x-range always contains the marked distance, also below 1 m
  const d0 = Math.max(1, Math.min(v.d, dc) / 100);
  const lo = log10(v.d < d0 ? v.d / 2 : d0), hi = log10(Math.max(v.d, dc) * 10);
  // the plane-earth asymptote is only meaningful from around the crossover outwards;
  // with the plane-earth model selected it is drawn down to the marked distance
  const peFrom = v.$.model === 'plane' ? Math.min(dc / 4, v.d) : dc / 4;
  const fs = [], pe = [], ex = [];
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i <= 240; i++) {
    const x = lo + (hi - lo) * i / 240, d = Math.pow(10, x);
    const a = fsplDb(v.f, d), b = b3PlaneEarth(d, v.ht, v.hr), c = b3TwoRayExact(v.f, d, v.ht, v.hr);
    const showPe = d >= peFrom;
    fs.push([x, a]);
    pe.push([x, showPe ? b : NaN]);
    ex.push([x, c]);
    ymin = Math.min(ymin, a, showPe ? b : Infinity);
    ymax = Math.max(ymax, a, showPe ? b : -Infinity);
  }
  // ... and the y-range contains the marked loss
  if (isFinite(v.L)) { ymin = Math.min(ymin, v.L); ymax = Math.max(ymax, v.L); }
  const yl = Math.floor(ymin / 10) * 10 - 10, yh = Math.ceil(ymax / 10) * 10 + 10;
  const slot = v.$.model === 'exact' ? 3 : (v.$.model === 'plane' || v.d >= dc) ? 2 : 1;
  return lineChart({
    title: 'Path loss vs. distance',
    w: 560, h: 270,
    x: { min: lo, max: hi, label: 'Distance (log scale)', fmt: t => fmtSI(Math.pow(10, t), 'm', 2) },
    y: { min: yl, max: yh, label: 'Path loss (dB)', fmt: t => fmt(t, 4) },
    series: [
      { label: 'Free space (20 dB/decade)', pts: fs, slot: 1 },
      { label: 'Plane earth (40 dB/decade)', pts: pe, slot: 2 },
      { label: 'Exact two-ray (Γ = −1)', pts: ex, slot: 3 },
    ],
    markers: isFinite(v.L) ? [{ x: log10(v.d), y: v.L, label: fmt(v.L, 4) + ' dB', slot: slot,
      rows: [{ value: fmt(v.L, 5) + ' dB', label: 'path loss at ' + fmtSI(v.d, 'm', 4), slot: slot }] }] : [],
    vlines: [{ x: log10(dc), label: 'crossover ' + fmtSI(dc, 'm', 3) }],
    tip: x => {
      const d = Math.pow(10, x);
      return [
        { value: fmtSI(d, 'm', 4), label: 'distance' },
        { value: fmt(fsplDb(v.f, d), 4) + ' dB', label: 'free space', slot: 1 },
        { value: d >= peFrom ? fmt(b3PlaneEarth(d, v.ht, v.hr), 4) + ' dB' : '—', label: 'plane earth', slot: 2 },
        { value: fmt(b3TwoRayExact(v.f, d, v.ht, v.hr), 4) + ' dB', label: 'exact two-ray', slot: 3 },
      ];
    },
    note: 'The values at the marked distance are in the fields and results above.',
  });
}

// ------------------------------------------------------ 2-port cascade card ---
const B3_CASC_PRESETS = [
  ['bw3', 'Butterworth low-pass, 3rd order, fc = 1 GHz', 1e9, [
    { type: 'sl', v: { L: '7.9577n' } }, { type: 'shc', v: { C: '6.3662p' } }, { type: 'sl', v: { L: '7.9577n' } }]],
  ['pad10', '10 dB Pi attenuator from resistors', 1e9, [
    { type: 'shr', v: { R: '96.25' } }, { type: 'sr', v: { R: '71.15' } }, { type: 'shr', v: { R: '96.25' } }]],
  ['chain', 'Amplifier → 3 dB pad → 50 Ω line (180°)', 1e9, [
    { type: 'amp', v: { g: '20', iso: '40' } }, { type: 'att', v: { a: '3' } }, { type: 'line', v: { zc: '50', deg: '180', loss: '0.5' } }]],
  // optional 5th element: other fields the example sets
  ['qwt', 'λ/4 line, 70.7 Ω: 100 Ω load → 50 Ω (Z₀′ = 100 Ω)', 1e9, [
    { type: 'line', v: { zc: '70.71', deg: '90', loss: '0' } }], { z0b: 100 }],
];
// floating-point residue shown as exact 0 (also turns −0 into +0, so a negative real angle reads 180°,
// not −180°). The reflections S11, S22 come from a cancellation and are cleaned relative to the largest
// entry; a transmission only loses a Re or Im part negligible next to its own magnitude, so a real
// −260 dB isolation is kept.
const b3Tidy = (z, scale) => { const t = 1e-12 * scale; return cx((Math.abs(z.re) <= t ? 0 : z.re) + 0, (Math.abs(z.im) <= t ? 0 : z.im) + 0); };
// reflection residue of a matched chain is ~1e-16 absolute whatever the chain loss, so the
// diagonal threshold has an absolute floor of 1e-14 (−280 dB); transmissions are only cleaned
// relative to their own size
const b3TidyM = M => { const s = mMaxAbs(M); return M.map((r, i) => r.map((z, j) => b3Tidy(z, i === j ? Math.max(s, 0.01) : cabs(z)))); };
const b3BlockDefaults = type => {
  const o = {};
  for (const [k, , d] of B3_BLOCKS[type].p) o[k] = d;
  return o;
};
const b3Clone = x => JSON.parse(JSON.stringify(x));

CUSTOM.cascade2p = function (calc, body) {
  calc.wide = true;
  const saved = store.get('c.cascade2p') || {};
  let blocks = Array.isArray(saved.blocks) && saved.blocks.length && saved.blocks.every(b => B3_BLOCKS[b.type]) ? saved.blocks : b3Clone(B3_CASC_PRESETS[0][3]);
  const upd = () => update();
  const f = numField('Frequency', isFinite(saved.f) ? saved.f : 1e9, { unit: 'Hz', du: 'GHz' }, upd);
  const z0 = numField('Reference impedance Z₀', isFinite(saved.z0) ? saved.z0 : 50, { unit: 'ohm', du: 'Ω' }, upd);
  const z0b = numField('Renormalise to Z₀′', isFinite(saved.z0b) ? saved.z0b : 75, { unit: 'ohm', du: 'Ω' }, upd);
  const preset = selectField('Load example', [['', 'Custom']].concat(B3_CASC_PRESETS.map(p => [p[0], p[1]])),
    saved.preset !== undefined ? saved.preset : 'bw3', () => {
      const p = B3_CASC_PRESETS.find(x => x[0] === preset.get());
      if (!p) return;
      blocks = b3Clone(p[3]);
      f.set(p[2]);
      if (p[4] && p[4].z0b) z0b.set(p[4].z0b);
      drawTable();
      update();
    });
  const tbl = h('div');
  const out = h('div', { class: 'sout' });
  const edited = () => { preset.sel.value = ''; };

  function drawTable() {
    tbl.innerHTML = '';
    const t = h('table', { class: 'grid edit b3-blocks' });
    t.append(h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Block (port 1 → port 2)'), h('th', {}, 'Parameters'), h('th', {}, ''))));
    const tb = h('tbody');
    blocks.forEach((b, i) => {
      const typeSel = h('select', { class: 'b3-type' }, Object.keys(B3_BLOCKS).map(k => h('option', { value: k }, B3_BLOCKS[k].name)));
      typeSel.value = b.type;
      typeSel.addEventListener('change', () => { b.type = typeSel.value; b.v = b3BlockDefaults(b.type); edited(); drawTable(); update(); });
      const params = h('div', { class: 'b3-params' });
      for (const [k, label, d, unit] of B3_BLOCKS[b.type].p) {
        if (b.v[k] === undefined) b.v[k] = d;
        const inp = h('input', { type: 'text', value: b.v[k], spellcheck: 'false', autocomplete: 'off', 'aria-label': label });
        inp.addEventListener('input', () => {
          b.v[k] = inp.value;
          inp.classList.toggle('bad', isNaN(parseNum(inp.value)));
          edited();
          update();
        });
        params.append(h('label', { class: 'b3-param' }, h('span', { class: 'b3-plabel' }, label), inp, h('span', { class: 'b3-punit' }, unit)));
      }
      const upb = h('button', { class: 'btn small', title: 'Move up' }, '↑');
      upb.addEventListener('click', () => { if (i > 0) { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; edited(); drawTable(); update(); } });
      const del = h('button', { class: 'btn small', title: 'Remove block' }, '×');
      del.addEventListener('click', () => { blocks.splice(i, 1); edited(); drawTable(); update(); });
      tb.append(h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, typeSel), h('td', {}, params), h('td', { class: 'nowrap' }, upb, del)));
    });
    t.append(tb);
    const add = h('button', { class: 'btn' }, '+ Add block');
    add.addEventListener('click', () => { blocks.push({ type: 'sl', v: b3BlockDefaults('sl') }); edited(); drawTable(); update(); });
    tbl.append(t, h('div', { class: 'btnrow' }, add));
  }

  const sTable = S => gridTable(['', 'dB', '|S|', '∠ deg', 'Re', 'Im'],
    [['S11', 0, 0], ['S21', 1, 0], ['S12', 0, 1], ['S22', 1, 1]].map(([n, i, j]) => {
      const s = S[i][j];   // already tidied
      return [n, dB20(s), fmt(cabs(s), 5), fmt(cabs(s) === 0 ? 0 : cdeg(s), 5), fmt(s.re, 5), fmt(s.im, 5)];
    }));
  // return loss and VSWR of a reflection |Γ|; |Γ| > 1 (reflection gain) only occurs at active ports
  // (a total reflection |Γ| = 1 ± rounding reads exactly 0 dB / ∞ and is not called active)
  const rlTxt = g => {
    if (Math.abs(g - 1) <= 1e-12) g = 1;
    return fmt(-dbv(g), 5) + ' dB / ' + fmt(vswrOf(g), 5) + (g > 1 ? ' (|Γ| > 1, active)' : '');
  };
  const metrics = S => kvTable([
    ['Insertion gain |S21|²', dB20(S[1][0]) + ' dB'],
    ['Input return loss / VSWR', rlTxt(cabs(S[0][0]))],
    ['Output return loss / VSWR', rlTxt(cabs(S[1][1]))],
  ]);
  // input impedance with port 2 terminated in Zt: Zin = (A·Zt + B)/(C·Zt + D)
  const zinRows = (M, Zt, Zref) => {
    let zin = cdiv(cadd(cscale(M[0][0], Zt), M[0][1]), cadd(cscale(M[1][0], Zt), M[1][1]));
    zin = b3Tidy(zin, cabs(zin));
    const g = cabs(b3Tidy(cdiv(csub(zin, cx(Zref)), cadd(zin, cx(Zref))), 1));
    return kvTable([
      ['Z<sub>in</sub> at port 1, port 2 terminated in Z₀′', fmtC(zin, 5, 'Ω')],
      ['Its return loss / VSWR against Z₀ = ' + fmtSI(Zref, 'Ω', 4), rlTxt(g)],
    ]);
  };

  function update() {
    store.set('c.cascade2p', { f: f.get(), z0: z0.get(), z0b: z0b.get(), preset: preset.get(), blocks: blocks });
    out.innerHTML = '';
    const F = f.get(), Z0 = z0.get(), Zb = z0b.get();
    if (!(F > 0 && Z0 > 0 && Zb > 0)) { out.append(h('div', { class: 'msg err' }, 'Enter a positive frequency and reference impedances.')); return; }
    if (!blocks.length) { out.append(h('div', { class: 'msg info' }, 'Add a block.')); return; }
    const r = b3Cascade(blocks, F, Z0);
    if (r.err) { out.append(h('div', { class: 'msg err' }, r.err)); return; }
    const S = b3TidyM(r.S), Sb = b3TidyM(abcdToS(r.abcd, Zb, r.det));
    out.append(sChartsRow(S, [{ label: 'S21', z: S[1][0], slot: 1 }, { label: 'S12', z: S[0][1], slot: 2 }]));
    const send = h('button', { class: 'btn' }, 'Send result to the 2-port calculator');
    send.addEventListener('click', () => CUSTOM_API.s2 && CUSTOM_API.s2.load(S, Z0));
    out.append(h('div', { class: 'convs' },
      section('Cascade S-parameters at Z₀ = ' + fmtSI(Z0, 'Ω', 4), h('div', {}, sTable(S), metrics(S))),
      section('Renormalised to Z₀′ = ' + fmtSI(Zb, 'Ω', 4), h('div', {}, sTable(Sb), metrics(Sb), zinRows(r.abcd, Zb, Z0)))));
    out.append(h('div', { class: 'convs' },
      section('ABCD matrix (A, D: no unit · B: Ω · C: S)', matText(r.abcd)),
      section('Use the result', h('div', {}, h('p', { class: 'desc' }, 'Opens the full 2-port analysis (stability, gains, conversions) with this cascade.'), send))));
  }

  body.append(
    h('p', { class: 'desc' }, 'Chain two-port blocks from port 1 to port 2 and get the overall S-parameters. Blocks are combined as ABCD matrices, so the result can be re-expressed at any reference impedance Z₀′.'),
    h('div', { class: 'cols' }, h('div', {}, f.row, z0.row, z0b.row), h('div', {}, preset.row)),
    tbl, out,
    h('div', { class: 'note', html: 'Series Z: [[1, Z], [0, 1]] · shunt Y: [[1, 0], [Y, 1]] · line: [[cosh γℓ, Z<sub>c</sub>·sinh γℓ], [sinh γℓ/Z<sub>c</sub>, cosh γℓ]] · total = A₁·A₂·…·A<sub>n</sub>. S-parameter, attenuator and amplifier blocks are defined at Z₀ and need S21 ≠ 0 (isolators cannot be chained this way). The renormalised S-parameters use Z₀′ at both ports; Z<sub>in</sub> = (A·Z₀′ + B)/(C·Z₀′ + D) shows the network as a transformer from a Z₀′ load to Z₀.' }));
  resetButton(body, () => {
    const p = B3_CASC_PRESETS[0];
    blocks = b3Clone(p[3]);
    f.set(p[2]); z0.set(50); z0b.set(75);
    preset.sel.value = p[0];
    drawTable();
    update();
  });
  drawTable();
  update();
};

// ----------------------------------------------------------- Pi / T match card --
CUSTOM.pimatch = function (calc, body) {
  calc.wide = true;
  const upd = () => update();
  const f = numField('Frequency', 100e6, { unit: 'Hz', du: 'MHz' }, upd);
  const rs = numField('Source resistance R<sub>S</sub>', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const rl = numField('Load resistance R<sub>L</sub>', 10, { unit: 'ohm', du: 'Ω' }, upd);
  const q = numField('Loaded Q', 5, { sym: '' }, upd);
  const out = h('div', { class: 'sout' });
  const topos = [['pi-lp', 'Pi, low-pass (C – L – C)'], ['pi-hp', 'Pi, high-pass (L – C – L)'], ['t-lp', 'T, low-pass (L – C – L)'], ['t-hp', 'T, high-pass (C – L – C)']];
  const elTxt = (e, F) => {
    const unit = e.kind === 'L' ? 'H' : 'F';
    const n = nearestE(e.val, 'E24');
    return e.role + '<br><b>' + e.kind + ' = ' + fmtSI(e.val, unit, 4) + '</b><br><span class="muted">X = ' + fmt(e.X, 4) + ' Ω · E24 ' + (n ? fmtSI(n.best, unit, 3) : '—') + '</span>';
  };
  const mem = cardMemory('c.pimatch', { nums: { f: f, rs: rs, rl: rl, q: q } });
  mem.restore();
  resetButton(body, () => { mem.reset(); update(); });
  function update() {
    out.innerHTML = '';
    mem.save();
    const F = f.get(), Rs = rs.get(), RL = rl.get(), Q = q.get();
    if (!(F > 0 && Rs > 0 && RL > 0 && Q > 0)) { out.append(h('div', { class: 'msg err' }, 'Enter a positive frequency, resistances and Q.')); return; }
    const res = topos.map(([t, name]) => [name, b3PiT(t, Rs, RL, Q, F)]);
    const bad = res.find(x => x[1].err);
    if (bad) { out.append(h('div', { class: 'msg err' }, bad[1].err)); return; }
    out.append(gridTable(['Topology', 'Source side', 'Middle', 'Load side', 'Check'],
      res.map(([name, r]) => [name, elTxt(r.els[0], F), elTxt(r.els[1], F), elTxt(r.els[2], F),
        'Virtual R = ' + fmtSI(r.Rv, 'Ω', 4) + '<br><span class="muted">Z<sub>in</sub> = ' + fmtC(r.zin, 5, 'Ω') + '</span>'])));
    const Qmin = sqrt(Math.max(Rs, RL) / Math.min(Rs, RL) - 1);
    out.append(kvTable([
      ['Minimum Q for this resistance ratio (single L-section)', fmt(Qmin, 4)],
      ['Approximate 3 dB bandwidth f/Q', fmtSI(F / Q, 'Hz', 4)],
    ]));
  }
  body.append(
    h('p', { class: 'desc' }, 'Three-element match between two real resistances with a chosen loaded Q (higher Q gives a narrower bandwidth). Pi uses a virtual resistance below both terminations, T one above both.'),
    h('div', { class: 'cols' }, h('div', {}, f.row, rs.row, rl.row, q.row), h('div')),
    out,
    h('div', { class: 'note', html: 'Pi: R<sub>v</sub> = R<sub>high</sub>/(Q² + 1); each side is an L-section with Q<sub>i</sub> = √(R<sub>i</sub>/R<sub>v</sub> − 1), shunt X = R<sub>i</sub>/Q<sub>i</sub>, series X = Q<sub>i</sub>R<sub>v</sub>. T: R<sub>v</sub> = R<sub>low</sub>(Q² + 1), series X = Q<sub>i</sub>R<sub>i</sub>, shunt X = R<sub>v</sub>/Q<sub>i</sub> (the two shunt parts combine). Reactive source or load parts can be absorbed into the adjacent element.' }));
  update();
};

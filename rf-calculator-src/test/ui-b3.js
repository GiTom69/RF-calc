// Batch 3 browser checks, run by test/ui-test.js (BATCHES=b3).
module.exports = async function (T) {
  const { evaluate, ok, sleep, shotCard } = T;
  const cards = [['power', 'fieldstr'], ['power', 'papr'], ['mismatch', 'directivity'], ['mismatch', 'cascade2p'], ['matching', 'pimatch'],
    ['matching', 'aircoil'], ['lines', 'waveguide'], ['prop', 'tworay'], ['prop', 'rain'], ['prop', 'radareq'], ['prop', 'doppler'],
    ['ant', 'polmis'], ['ant', 'rfexposure'], ['noise', 'gt'], ['comp', 'minloss'], ['comp', 'wilkinson']];
  for (const [, id] of cards) {
    ok(await evaluate(`!!document.getElementById('c-${id}')`), 'b3: card ' + id + ' rendered');
  }
  const failed = await evaluate(`[...document.querySelectorAll('#cards .card')].filter(c => c.textContent.includes('Failed to load')).map(c => c.id)`);
  ok(failed.length === 0, 'b3: no card failed to load', failed);

  const row = (card, label) => `[...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.trim() === ${JSON.stringify(label)})`;
  const type = async (card, label, text) => evaluate(`(() => { const i = ${row(card, label)}.querySelector('input'); i.focus(); i.value = ${JSON.stringify(text)};
    i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return 1; })()`);
  const val = async (card, label) => evaluate(`${row(card, label)}.querySelector('input').value`);
  const state = async (card, label) => evaluate(`${row(card, label)}.className`);

  // field strength: typing dBµV/m fills E
  await type('fieldstr', 'Electric field', '100');
  ok(/calc/.test(await state('fieldstr', 'Electric field E')), 'fieldstr: E calculated from dBµV/m');
  ok(Math.abs(parseFloat(await val('fieldstr', 'Electric field E')) - 0.1) < 1e-9, 'fieldstr: 100 dBµV/m = 0.1 V/m', await val('fieldstr', 'Electric field E'));

  // waveguide preset
  await evaluate(`(() => { const s = document.querySelector('#c-waveguide .cfg select'); s.value = String(WAVEGUIDES.findIndex(w => w[0] === 'WR-62')); s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await val('waveguide', 'Broad wall a') === '15.8', 'waveguide: WR-62 preset sets a', await val('waveguide', 'Broad wall a'));

  // two-ray chart
  ok(await evaluate(`document.querySelectorAll('#c-tworay .viz-line').length`) === 3, 'tworay: chart has 3 curves');
  // rain: polarization change updates γ
  const g1 = await val('rain', 'Specific attenuation γ');
  await evaluate(`(() => { const s = document.querySelector('#c-rain .cfg select'); s.value = 'v'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const g2 = await val('rain', 'Specific attenuation γ');
  ok(g1 !== g2 && parseFloat(g2) < parseFloat(g1), 'rain: vertical polarization gives less attenuation at 20 GHz', [g1, g2]);

  // polarization preset with infinite axial ratios
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-polmis .cfg select')][1]; s.value = 'll'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await type('polmis', 'Tilt angle between the ellipses Δτ', '45');
  ok(Math.abs(parseFloat(await val('polmis', 'Polarization loss')) - 3.0103) < 1e-3, 'polmis: linear-linear 45° = 3.01 dB', await val('polmis', 'Polarization loss'));
  ok(await val('polmis', 'Axial ratio, antenna 1') === '∞', 'polmis: linear preset shows ∞ axial ratio');
  // a finite axial ratio is no longer linear: the preset (which sets ∞) switches to Custom
  await type('polmis', 'Axial ratio, antenna 1', '3');
  const polPre = await evaluate(`[...document.querySelectorAll('#c-polmis .cfg select')][1].value`);
  ok(polPre === 'custom', 'polmis: typing AR₁ = 3 dB under Linear ↔ linear switches the preset to Custom', polPre);
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-polmis .cfg select')][1]; s.value = 'll'; s.dispatchEvent(new Event('change')); return 1; })()`);

  // cascade card
  ok(await evaluate(`document.querySelectorAll('#c-cascade2p .b3-blocks tbody tr').length`) === 3, 'cascade2p: default has 3 blocks');
  ok(await evaluate(`document.querySelectorAll('#c-cascade2p .viz-row svg').length`) === 3, 'cascade2p: result charts');
  const s21 = await evaluate(`[...document.querySelectorAll('#c-cascade2p .sect')][0].querySelectorAll('tbody tr')[1].children[1].textContent`);
  ok(Math.abs(parseFloat(s21) + 3.0103) < 1e-3, 'cascade2p: Butterworth preset -3.01 dB at cutoff', s21);
  ok(await evaluate(`document.querySelector('#c-cascade2p .cols .cfgrow select').value`) === 'bw3', 'cascade2p: preset selector shows the loaded example');
  await evaluate(`(() => { const i = document.querySelector('#c-cascade2p .b3-params input'); i.value = '10n'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(await evaluate(`document.querySelector('#c-cascade2p .cols .cfgrow select').value`) === '', 'cascade2p: editing a block switches to Custom');
  await evaluate(`[...document.querySelectorAll('#c-cascade2p button')].find(b => b.textContent.startsWith('+ Add')).click(); 1`);
  ok(await evaluate(`document.querySelectorAll('#c-cascade2p .b3-blocks tbody tr').length`) === 4, 'cascade2p: add block');
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-cascade2p .b3-type')][3]; s.value = 'line'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await evaluate(`[...document.querySelectorAll('#c-cascade2p .b3-blocks tbody tr')][3].querySelectorAll('input').length`) === 3, 'cascade2p: line block has 3 parameters');
  // floating-point residue is shown as exact 0: ideal match reads −∞ dB / RL ∞, angles 0
  const pickCasc = id => evaluate(`(() => { const s = document.querySelector('#c-cascade2p .cols .cfgrow select'); s.value = '${id}'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const sectRow = (n, r, c) => evaluate(`[...document.querySelectorAll('#c-cascade2p .sect')][${n}].querySelectorAll('table.grid tbody tr')[${r}].children[${c}].textContent`);
  const kv = (n, start) => evaluate(`(() => { const t = [...[...document.querySelectorAll('#c-cascade2p .sect')][${n}].querySelectorAll('table.kv tr')].find(r => r.querySelector('th').textContent.startsWith(${JSON.stringify(start)})); return t ? t.querySelector('td').textContent : null; })()`);
  await pickCasc('chain');
  ok(await sectRow(0, 0, 1) === '-∞', 'cascade2p: matched chain S11 = −∞ dB (not −320 dB)', await sectRow(0, 0, 1));
  ok(await kv(0, 'Input return loss') === '∞ dB / 1', 'cascade2p: matched chain return loss ∞', await kv(0, 'Input return loss'));
  ok(await sectRow(0, 1, 3) === '180', 'cascade2p: chain S21 angle 180° (no −180° residue)', await sectRow(0, 1, 3));
  await pickCasc('qwt');
  ok(await sectRow(0, 0, 3) === '0', 'cascade2p: λ/4 line S11 angle is 0 (no 3e-15° residue)', await sectRow(0, 0, 3));
  ok(Math.abs(parseFloat(await sectRow(0, 0, 2)) - 1 / 3) < 1e-4, 'cascade2p: λ/4 70.7 Ω line at 50 Ω has |S11| = 1/3', await sectRow(0, 0, 2));
  ok(/^100(\.0+)?$/.test(await evaluate(`[...document.querySelectorAll('#c-cascade2p .cols .frow')].find(r => r.textContent.includes('Renormalise')).querySelector('input').value`)), 'cascade2p: λ/4 example sets Z₀′ = 100 Ω');
  // Zc = 70.71 Ω: Zin = 70.71²/100 = 49.999 Ω
  const zin = await kv(1, 'Zin at port 1');
  ok(/^49\.99\d* \+ j0 Ω$/.test(zin) && Math.abs(parseFloat(zin) - 70.71 * 70.71 / 100) < 1e-3, 'cascade2p: λ/4 70.7 Ω line turns a 100 Ω load into 50 Ω', zin);
  const rlq = await kv(1, 'Its return loss');
  ok(parseFloat(rlq) > 90 && / \/ 1$/.test(rlq), 'cascade2p: transformer matched against Z₀ (RL > 90 dB)', rlq);
  // an S-parameter block with |S11| > 1 (active port): VSWR ∞ and flagged, never negative
  await evaluate(`(() => { const s = document.querySelector('#c-cascade2p .b3-type'); s.value = 's'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await evaluate(`(() => { const i = document.querySelector('#c-cascade2p .b3-params input'); i.value = '3'; i.dispatchEvent(new Event('input')); return 1; })()`);
  const act = await kv(0, 'Input return loss');
  ok(/^-3 dB \/ ∞ \(\|Γ\| > 1, active\)$/.test(act), 'cascade2p: |S11| > 1 shows VSWR ∞ (|Γ| > 1, active)', act);
  // |S11| = 0 dB at 1°: the ABCD round trip gives |Γ| = 1 + 2.2e-16, which is total reflection, not active
  const setP = vals => evaluate(`(() => { const ins = document.querySelectorAll('#c-cascade2p .b3-params input'); ${JSON.stringify(vals)}.forEach(([k, v]) => { ins[k].value = v; ins[k].dispatchEvent(new Event('input')); }); return 1; })()`);
  await setP([[0, '0'], [1, '1'], [2, '-3'], [4, '-3']]);
  const tot = await kv(0, 'Input return loss');
  ok(/^-?0 dB \/ ∞$/.test(tot), 'cascade2p: |S11| = 1 (+ rounding) reads 0 dB / ∞, not active', tot);
  // a small but real transmission is kept: matched 20 dB amplifier with 260 dB isolation, S12 = −260 dB
  await evaluate(`(() => { const s = document.querySelector('#c-cascade2p .b3-type'); s.value = 'amp'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await setP([[0, '20'], [1, '260']]);
  const s12 = await sectRow(0, 2, 1);
  ok(Math.abs(parseFloat(s12) + 260) < 0.01, 'cascade2p: amplifier S12 = −260 dB kept (not −∞)', s12);
  ok(await sectRow(0, 0, 1) === '-∞', 'cascade2p: matched amplifier S11 still −∞ dB', await sectRow(0, 0, 1));
  // Reset restores the first example and the default fields (also for the screenshot)
  await evaluate(`[...document.getElementById('c-cascade2p').querySelectorAll('.card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);
  ok(await evaluate(`document.querySelector('#c-cascade2p .cols .cfgrow select').value`) === 'bw3' &&
    await evaluate(`[...document.querySelectorAll('#c-cascade2p .cols .frow')].find(r => r.textContent.includes('Renormalise')).querySelector('input').value`) === '75', 'cascade2p: Reset restores the example and Z₀′ = 75 Ω');
  ok(Math.abs(parseFloat(await sectRow(0, 1, 1)) + 3.0103) < 1e-3, 'cascade2p: Reset restores the Butterworth result', await sectRow(0, 1, 1));

  // Pi/T match: 4 designs
  ok(await evaluate(`document.querySelectorAll('#c-pimatch tbody tr').length`) >= 4, 'pimatch: four topologies listed');

  // exposure
  ok(/Below the limit/.test(await evaluate(`document.querySelector('#c-rfexposure .outputs').textContent`)), 'rfexposure: verdict shown');

  // two-ray: plane earth below the crossover is flagged, and the chart contains the marker
  const msg = card => evaluate(`document.querySelector('#c-${card} .msg').textContent`);
  const outTxt = card => evaluate(`document.querySelector('#c-${card} .outputs').textContent`);
  await evaluate(`(() => { window.__b3lc = null; const o = lineChart; window.__b3lcOrig = o; lineChart = x => { window.__b3lc = x; return o(x); }; return 1; })()`);
  await evaluate(`(() => { const s = document.querySelector('#c-tworay .cfg select'); s.value = 'plane'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await type('tworay', 'Distance', '10 m');
  ok(/plane-earth formula is not valid/.test(await msg('tworay')), 'tworay: plane earth below the crossover shows a warning', await msg('tworay'));
  const inRange = async what => evaluate(`(() => { const o = window.__b3lc, m = o && o.markers[0]; return !!m && m.x >= o.x.min && m.x <= o.x.max && m.y >= o.y.min && m.y <= o.y.max; })()`);
  ok(await inRange(), 'tworay chart: plane earth at 10 m (6.9 dB) lies inside the y-range');
  ok(await evaluate(`window.__b3lc.series[1].pts.some(p => Math.abs(p[0] - 1) < 0.05 && isFinite(p[1]))`), 'tworay chart: plane-earth curve drawn down to the marked distance');
  await evaluate(`(() => { const s = document.querySelector('#c-tworay .cfg select'); s.value = 'auto'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await type('tworay', 'Distance', '0.5 m');
  ok(await inRange(), 'tworay chart: a distance below 1 m lies inside the x-range');
  ok(!/not valid/.test(await msg('tworay')), 'tworay: no warning with the auto model');
  await evaluate(`(() => { lineChart = window.__b3lcOrig; return 1; })()`);
  await type('tworay', 'Distance', '5 km');
  ok(/Last \(farthest\) null, r₂ − r₁ = λ268\.5/.test(await outTxt('tworay')), 'tworay: exact last null 268.5 m', await outTxt('tworay'));

  // directivity too poor for the return loss: worst case stops at |Γ| = 1
  await type('directivity', 'Coupler / bridge directivity', '10');
  await type('directivity', 'Measured return loss', '3');
  ok(/2\.288 … ∞/.test(await outTxt('directivity')), 'directivity: VSWR range ends at ∞', await outTxt('directivity'));
  ok(/total reflection/.test(await msg('directivity')), 'directivity: warning shown', await msg('directivity'));
  await type('directivity', 'Coupler / bridge directivity', '30');
  await type('directivity', 'Measured return loss', '20');

  // G/T: chain NF excludes the antenna temperature
  ok(/Receive-chain noise figure \(feed \+ LNA \+ rest, excl\. antenna\)1\.53/.test(await outTxt('gt')), 'gt: receive-chain NF 1.53 dB', await outTxt('gt'));

  // minimum-loss pad with Z_low > Z_high: the specific warning is visible next to the solver message (S7)
  await type('minloss', 'Higher impedance Zhigh', '75');
  await type('minloss', 'Lower impedance Zlow', '100');
  ok(/Z_high must be larger than Z_low/.test(await msg('minloss')), 'minloss: Z_high < Z_low warning is visible', await msg('minloss'));
  await type('minloss', 'Lower impedance Zlow', '50');

  // waveguide: typing a broad wall that differs from the preset switches the size selector to Custom (S6)
  await type('waveguide', 'Broad wall a', '30');
  ok(await evaluate(`document.querySelector('#c-waveguide .cfg select').value`) === 'custom', 'waveguide: edited size switches the selector to Custom',
    await evaluate(`document.querySelector('#c-waveguide .cfg select').value`));

  // Pi/T match card remembers its inputs across a reload, Reset restores the example
  const piQ = `[...document.querySelectorAll('#c-pimatch .frow')].find(r => r.querySelector('.flabel').textContent === 'Loaded Q').querySelector('input')`;
  await evaluate(`(() => { const i = ${piQ}; i.value = '8'; i.dispatchEvent(new Event('input')); return 1; })()`);
  await evaluate('location.reload(); 1');
  await sleep(1500);
  ok(await evaluate(`${piQ}.value`) === '8', 'pimatch: loaded Q remembered after reload', await evaluate(`${piQ}.value`));
  ok(/8 MHz|12\.5 MHz/.test(await evaluate(`document.querySelector('#c-pimatch .sout').textContent`)), 'pimatch: results use the restored Q');
  await evaluate(`[...document.getElementById('c-pimatch').querySelectorAll('.card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);
  ok(await evaluate(`${piQ}.value`) === '5', 'pimatch: Reset restores Q = 5', await evaluate(`${piQ}.value`));

  // nothing inside a b3 card may stick out past the card's content box
  const over = [];
  for (const [cat, id] of cards) {
    await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(c => c[0] === '${cat}')].click(); 1`);
    await sleep(120);
    over.push(...await evaluate(`(() => { const c = document.getElementById('c-${id}'); const body = c.querySelector('.card-body');
      const r = { right: body.getBoundingClientRect().right - parseFloat(getComputedStyle(body).paddingRight) };
      return [...body.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > r.right + 1; })
        .slice(0, 3).map(e => '${id}: ' + e.tagName + '.' + e.className + ' +' + Math.round(e.getBoundingClientRect().right - r.right)); })()`));
  }
  ok(over.length === 0, 'b3: no element overflows its card', over);

  for (const [cat, id] of cards) await shotCard(cat, id);
};

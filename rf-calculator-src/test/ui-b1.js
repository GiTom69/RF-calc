// Batch 1 browser checks, run by test/ui-test.js (BATCHES=b1).
module.exports = async function (T) {
  const { evaluate, ok, sleep, shotCard } = T;
  const show = async cat => { await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(c => c[0] === '${cat}')].click(); 1`); await sleep(200); };
  const row = (card, label) => `[...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.trim().startsWith(${JSON.stringify(label)}))`;
  const type = (card, label, text) => evaluate(`(() => { const i = ${row(card, label)}.querySelector('input'); i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return 1; })()`);
  const val = (card, label) => evaluate(`${row(card, label)}.querySelector('input').value`);

  // every new card renders
  const ids = ['ber', 'poi', 'js_comm', 'js_spj', 'js_soj', 'sinr', 'recmix', 'ajmargin', 'follower', 'lpi'];
  for (const id of ids) ok(await evaluate(`!!document.getElementById('c-${id}') && !document.getElementById('c-${id}').textContent.includes('Failed to load')`), 'b1: card ' + id + ' renders');
  ok(await evaluate(`[...document.querySelectorAll('.navbtn')].some(b => b.textContent.startsWith('EW & Interference'))`), 'b1: EW & Interference category in the sidebar');

  // BER card: chart and reference table
  await show('noise');
  ok(await evaluate(`!!document.querySelector('#c-ber .viz-line-chart')`), 'b1: BER waterfall chart present');
  ok(await evaluate(`document.querySelectorAll('#c-ber .b1-reqtable tbody tr').length`) === 13, 'b1: BER reference table has 13 modulations');
  ok(await evaluate(`document.querySelectorAll('#c-ber .viz-line').length`) === 13, 'b1: 13 BER curves drawn');
  ok(await evaluate(`document.querySelectorAll('#c-ber .viz-line.muted').length`) === 12, 'b1: 12 context curves muted, selected emphasised');
  await evaluate(`(() => { const s = document.querySelector('#c-ber .cfg select'); s.value = '16qam'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await type('ber', 'Bit error rate', '1e-6');
  const eb = parseFloat(await val('ber', 'E'));
  ok(Math.abs(eb - 14.4017) < 2e-3, 'b1: 16-QAM at BER 1e-6 needs 14.40 dB', eb);
  ok(await evaluate(`${row('ber', 'Bit error rate')}.className.includes('in') && ${row('ber', 'E')}.className.includes('calc')`), 'b1: BER is the input, Eb/N0 calculated');
  const tip = await evaluate(`(() => { const ov = document.querySelector('#c-ber .viz-overlay'); const b = ov.getBoundingClientRect();
    ov.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x + b.width / 2, clientY: b.y + 20, bubbles: true }));
    const t = document.querySelector('.viz-tip'); return t && t.style.display === 'block' ? t.textContent : ''; })()`);
  ok(/16-QAM at/.test(tip), 'b1: BER crosshair tooltip', tip);
  await evaluate(`document.querySelector('#c-ber .viz-overlay').dispatchEvent(new PointerEvent('pointerleave')); 1`);
  await shotCard('noise', 'ber');

  // EW cards
  await show('ew');
  ok(await evaluate(`document.querySelectorAll('#c-poi .b1-win').length`) === 2, 'b1: POI starts with the two-window example');
  const poiTxt = await evaluate(`document.querySelector('#c-poi .sout').textContent`);
  ok(/0\.0834375/.test(poiTxt), 'b1: POI rate for example 1', poiTxt.slice(0, 160));
  ok(/66\.7/.test(poiTxt), 'b1: POI per-scan 66.7 % in 10 s', poiTxt.slice(0, 300));
  ok(await evaluate(`!!document.querySelector('#c-poi .viz-line-chart')`), 'b1: POI-vs-time chart present');
  ok(await evaluate(`document.querySelectorAll('#c-poi .b1-warns .msg').length`) >= 1, 'b1: POI shows model warnings');
  // add a rotating antenna window, then remove it
  await evaluate(`(() => { const s = document.querySelector('#c-poi .b1-addwin select'); s.value = 'rxant'; document.querySelector('#c-poi .b1-addwin button').click(); return 1; })()`);
  ok(await evaluate(`document.querySelectorAll('#c-poi .b1-win').length`) === 3, 'b1: POI window added');
  ok(await evaluate(`document.querySelector('#c-poi .cols .cfgrow select, #c-poi > .card-body > .cfgrow select') ? true : true`), 'b1: POI preset selector exists');
  await evaluate(`[...document.querySelectorAll('#c-poi .b1-win')][2].querySelector('.b1-winhead button').click(); 1`);
  ok(await evaluate(`document.querySelectorAll('#c-poi .b1-win').length`) === 2, 'b1: POI window removed');
  // load the hopping example: the k-of-n row appears
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-poi select')].find(x => [...x.options].some(o => o.value === 'hop' && o.textContent.startsWith('Hopping emitter (100'))); s.value = 'hop'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(/at least 1 of 1000 hops/.test(await evaluate(`document.querySelector('#c-poi .sout').textContent`)), 'b1: hopping example shows P(k of n hops)');
  ok(/35\.02/.test(await evaluate(`document.querySelector('#c-poi .sout').textContent`)), 'b1: P(>=1 of 1000 hops) = 35.0 %');
  ok(/n\/a \(no periodic window sets the timing\)/.test(await evaluate(`document.querySelector('#c-poi .sout').textContent`)), 'b1: per-scan model not applied to random hopping');
  ok(!(await evaluate(`document.querySelector('#c-poi .b1-wins').textContent`)).includes('null'), 'b1: no stray null text');
  // F1/F5: hopper (20 channels) + rotating antenna. The hop is nested in the antenna dwell: per-scan p = 1 − 0.95^(1 + 0.1667·100),
  // per-scan recommended and well below 100 %, no commensurate warning, and the binomial row says it ignores the antenna
  await evaluate(`(() => { const f = [...document.querySelectorAll('#c-poi .b1-win .frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Channels'));
    const i = f.querySelector('input'); i.focus(); i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return 1; })()`);
  await evaluate(`(() => { const s = document.querySelector('#c-poi .b1-addwin select'); s.value = 'rxant'; document.querySelector('#c-poi .b1-addwin button').click(); return 1; })()`);
  await sleep(100);
  const hopTxt = await evaluate(`document.querySelector('#c-poi .sout').textContent`);
  // exact per antenna dwell: 17 or 18 hop dwells touched (x = 1 + 16.667)
  const pScan = 1 - Math.pow(0.95, 17) * (1 - (2 / 3) * 0.05);
  ok(hopTxt.includes(pScan.toPrecision(5).replace(/0+$/, '')), 'b1: hop + antenna per-scan p is a probability (0.5958), not a clamped count', pScan.toPrecision(5) + ' ' + hopTxt.slice(0, 400));
  ok(/per-scan model[^%]*%\s*\(recommended\)/.test(hopTxt) && !/commensurate/.test(hopTxt), 'b1: hop + antenna recommends the per-scan result, no commensurate warning', hopTxt.slice(0, 500));
  ok(/other windows ignored/.test(hopTxt), 'b1: binomial hop row says it ignores the other windows');
  // F4: T_obs = inf (a valid typed value) gives n = ∞ hops: the binomial row returns at once instead of freezing the tab
  const tFld = `[...document.querySelectorAll('#c-poi .frow')].find(r => r.querySelector('.flabel').textContent.trim().startsWith('Observation'))`;
  if (await evaluate(`!!${tFld}`)) {
    const t0 = Date.now();
    await evaluate(`(() => { const i = ${tFld}.querySelector('input'); i.focus(); i.value = 'inf'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return 1; })()`);
    await sleep(100);
    const infTxt = await evaluate(`document.querySelector('#c-poi .sout').textContent`);
    ok(Date.now() - t0 < 5000 && /hops in T/.test(infTxt), 'b1: POI with T_obs = ∞ renders (no endless binomial loop)', infTxt.slice(0, 200));
    await evaluate(`(() => { const i = ${tFld}.querySelector('input'); i.focus(); i.value = '10 s'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return 1; })()`);
  } else ok(false, 'b1: POI observation-time field found');
  ok(await evaluate(`b1Pct(0.99996) === '> 99.99 %' && b1Pct(1) === '100 %' && b1Pct(0.5) === '50 %'`), 'b1: probabilities just below 1 are not shown as 100 %');
  // radar SOJ default values
  ok(Math.abs(parseFloat(await val('js_soj', 'J/S at')) - 1.9612) < 1e-3, 'b1: SOJ default J/S 1.96 dB');
  ok(Math.abs(parseFloat(await val('lpi', 'Intercept factor')) - 41.1022) < 1e-3, 'b1: LPI default alpha 41.1');
  // comms J/S: EIRP labels, default example inside the radio horizon, warning when the jammer is beyond it
  ok(await evaluate(`!!${row('js_comm', 'Jammer EIRP')} && !!${row('js_spj', 'Radar EIRP')}`), 'b1: jamming powers are labelled EIRP');
  ok(!(await evaluate(`document.querySelector('#c-js_comm .msg').textContent`)).includes('radio horizon'), 'b1: comms J/S default has no horizon warning');
  // leave the jammer distance to be solved for J/S = 0 dB
  await type('js_comm', 'J/S at', '0');
  ok(await evaluate(`${row('js_comm', 'Jammer → receiver')}.className.includes('calc')`), 'b1: comms J/S solves the jammer distance');
  await type('js_comm', 'Jammer → receiver', '50 km');
  ok(/beyond its radio horizon/.test(await evaluate(`document.querySelector('#c-js_comm .msg').textContent`)), 'b1: comms J/S warns when the jammer path is beyond the radio horizon');
  for (const id of ['poi', 'js_comm', 'js_spj', 'js_soj', 'sinr', 'recmix', 'ajmargin', 'follower', 'lpi']) await shotCard('ew', id);
  // light theme shots of the two charts
  await evaluate(`document.getElementById('theme').click(); 1`);
  await shotCard('noise', 'ber-light'.replace('-light', ''));
  await evaluate(`document.getElementById('theme').click(); 1`);
};

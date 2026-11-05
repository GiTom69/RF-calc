// Batch 2 browser checks (loaded by test/ui-test.js)
module.exports = async function (T) {
  const { evaluate, ok, sleep, shotCard } = T;
  const has = id => evaluate(`!!document.getElementById('c-${id}')`);
  for (const id of ['ip3', 'adc', 'pnjitter', 'spurs', 'lcfilter']) ok(await has(id), 'b2: card ' + id + ' rendered');

  // IP3 diagram follows the inputs
  ok(await evaluate(`document.querySelectorAll('#c-ip3 .b2-chart svg path.viz-line').length`) === 3, 'b2: IP3 chart has fundamental, IM3 and floor lines');
  const ip3Before = await evaluate(`document.querySelector('#c-ip3 .b2-chart .viz-note').textContent`);
  await evaluate(`(() => { const r = [...document.querySelectorAll('#c-ip3 .frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Noise figure')); const i = r.querySelector('input'); i.value = '10'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(await evaluate(`document.querySelector('#c-ip3 .b2-chart .viz-note').textContent`) !== ip3Before, 'b2: IP3 chart redraws when NF changes');

  // phase noise card
  const pnText = () => evaluate(`document.querySelector('#c-pnjitter .sout').textContent`);
  const pn1 = await pnText();
  ok(/RMS jitter/.test(pn1) && /ps/.test(pn1), 'b2: phase noise result shows jitter', pn1.slice(0, 120));
  ok(await evaluate(`!!document.querySelector('#c-pnjitter .b2-chart svg')`), 'b2: phase noise chart rendered');
  await evaluate(`(() => { const i = document.querySelectorAll('#c-pnjitter .b2-pn tbody tr')[2].querySelectorAll('input')[1]; i.value = '-90'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(await pnText() !== pn1, 'b2: editing a phase noise point updates the result');
  const nRows = await evaluate(`document.querySelectorAll('#c-pnjitter .b2-pn tbody tr').length`);
  await evaluate(`[...document.querySelectorAll('#c-pnjitter button')].find(b => b.textContent.includes('Add point')).click(); 1`);
  ok(await evaluate(`document.querySelectorAll('#c-pnjitter .b2-pn tbody tr').length`) === nRows + 1, 'b2: add phase noise point');
  await evaluate(`[...document.querySelectorAll('#c-pnjitter .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);

  // spur table
  const spurRows = () => evaluate(`document.querySelectorAll('#c-spurs .b2-tbl')[0].querySelectorAll('tbody tr').length`);
  const inOnly = await spurRows();
  ok(inOnly === 2, 'b2: default plan has the wanted product plus one in-band spur', inOnly);
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-spurs select')].find(s => [...s.options].some(o => o.value === 'all')); s.value = 'all'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await spurRows() === 30, 'b2: "all products" lists 30 products up to order 5', await spurRows());

  // LC filter
  const comps = () => evaluate(`document.querySelectorAll('#c-lcfilter .b2-tbl tbody tr').length`);
  ok(await comps() === 5, 'b2: default spec (15 dB at 1.5 fc) gives a 5-element filter', await comps());
  ok(await evaluate(`document.querySelectorAll('#c-lcfilter .b2-chart svg path.viz-line').length`) === 2, 'b2: response chart shows S21 and S11');
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-lcfilter select')].find(s => [...s.options].some(o => o.value === 'E24')); s.value = 'E24'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await evaluate(`document.querySelectorAll('#c-lcfilter .b2-chart svg path.viz-line').length`) === 3, 'b2: snapping adds the standard-value response');
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-lcfilter select')].find(s => [...s.options].some(o => o.value === 'bpf')); s.value = 'bpf'; s.dispatchEvent(new Event('change')); return 1; })()`);
  // stop band at 1.15 GHz for the 1 GHz / 100 MHz pass band needs several resonators
  await evaluate(`(() => { const r = [...document.querySelectorAll('#c-lcfilter .frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Stop-band')); const i = r.querySelector('input'); i.value = '1150'; i.dispatchEvent(new Event('input')); return 1; })()`);
  const bpfText = await evaluate(`document.querySelector('#c-lcfilter .sout').textContent`);
  ok(/series LC/.test(bpfText) && /parallel LC/.test(bpfText), 'b2: band-pass uses series and parallel LC resonators', bpfText.slice(0, 160));
  await shotCard('comp', 'lcfilter');
  require('fs').renameSync(require('path').join(T.SHOTS, 'card-lcfilter.png'), require('path').join(T.SHOTS, 'card-lcfilter-bpf.png'));
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-lcfilter select')].find(s => [...s.options].some(o => o.value === 'bpf')); s.value = 'lpf'; s.dispatchEvent(new Event('change')); const e = [...document.querySelectorAll('#c-lcfilter select')].find(s => [...s.options].some(o => o.value === 'E24')); e.value = 'exact'; e.dispatchEvent(new Event('change')); return 1; })()`);

  // ---- audit regressions ----
  const setF = (card, lab, val) => evaluate(`(() => { const r = [...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.startsWith(${JSON.stringify(lab)})); const i = r.querySelector('input'); i.value = ${JSON.stringify(val)}; i.dispatchEvent(new Event('input')); return 1; })()`);
  const getF = (card, lab) => evaluate(`(() => { const r = [...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.startsWith(${JSON.stringify(lab)})); return r.querySelector('input').value; })()`);
  const rowShown = (card, lab) => evaluate(`(() => { const r = [...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.startsWith(${JSON.stringify(lab)})); return r.style.display !== 'none'; })()`);
  const setS = (card, opt, val) => evaluate(`(() => { const s = [...document.querySelectorAll('#c-${card} select')].find(s => [...s.options].some(o => o.value === ${JSON.stringify(opt)})); s.value = ${JSON.stringify(val)}; s.dispatchEvent(new Event('change')); return 1; })()`);
  const getS = (card, opt) => evaluate(`[...document.querySelectorAll('#c-${card} select')].find(s => [...s.options].some(o => o.value === ${JSON.stringify(opt)})).value`);
  const sout = card => evaluate(`document.querySelector('#c-${card} .sout').textContent`);
  const resetCard = card => evaluate(`[...document.querySelectorAll('#c-${card} .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);

  // IP3 chart: a measured IM3 far below the floor is inside the y-range, not clamped to the bottom edge
  await setF('ip3', 'Output IM3', '-140');
  const ip3Dot = await evaluate(`(() => { const svg = document.querySelector('#c-ip3 .b2-chart svg'); const d = [...svg.querySelectorAll('circle.viz-dot')]; const ax = [...svg.querySelectorAll('line.viz-axis')].map(l => +l.getAttribute('y1')); return { cy: d.map(c => +c.getAttribute('cy')), bottom: Math.max(...ax) }; })()`);
  ok(ip3Dot.cy.length === 2 && ip3Dot.cy.every(y => y < ip3Dot.bottom - 1), 'b2: IP3 chart keeps the measured IM3 marker above the bottom edge (-140 dBm)', JSON.stringify(ip3Dot));
  await resetCard('ip3');

  // phase noise: large phi warning + Gaussian EVM; tooltip at the table end is not NaN
  await evaluate(`(() => { const i = document.querySelectorAll('#c-pnjitter .b2-pn tbody tr')[0].querySelectorAll('input')[1]; i.value = '-30'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(await evaluate(`!!document.querySelector('#c-pnjitter .b2-large')`) && /Gaussian/.test(await sout('pnjitter')), 'b2: large φrms shows the small-angle warning and the Gaussian EVM', (await sout('pnjitter')).slice(0, 300));
  await resetCard('pnjitter');
  ok(await evaluate(`!document.querySelector('#c-pnjitter .b2-large')`), 'b2: default phase noise has no large-φ warning');
  await evaluate(`(() => { const i = document.querySelectorAll('#c-pnjitter .b2-pn tbody tr')[0].querySelectorAll('input')[0]; i.value = '2.5k'; i.dispatchEvent(new Event('input')); return 1; })()`);
  const pnTip = await evaluate(`(() => { const ov = document.querySelector('#c-pnjitter .b2-chart rect.viz-overlay'); ov.dispatchEvent(new Event('focus')); for (let k = 0; k < 60; k++) ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); const t = document.querySelector('.viz-tip').textContent; ov.dispatchEvent(new Event('blur')); return t; })()`);
  ok(/-85\b|−85\b/.test(pnTip) && !/—/.test(pnTip), 'b2: phase-noise crosshair at the first offset (2.5 kHz) reads the table value', pnTip);
  await resetCard('pnjitter');

  // spurs: order 1 is rejected without a crash; partial IF overlap is flagged
  await setF('spurs', 'Maximum order', '1');
  ok(/between 2 and 15/.test(await sout('spurs')), 'b2: spur order 1 gives a message, not a crash', await sout('spurs'));
  await setF('spurs', 'Maximum order', '5');
  await setF('spurs', 'IF band stop', '100');
  const sp36 = await sout('spurs');
  ok(/only partly inside the IF band \(35\.9 % of the wanted range/.test(sp36) && /wanted \(35\.9 % in IF\)/.test(sp36), 'b2: wanted product only partly in the IF band is flagged', sp36.slice(0, 200));
  await resetCard('spurs');
  ok(!/partly/.test(await sout('spurs')), 'b2: spur reset clears the partial-overlap warning');

  // LC filter: A < ripple gives N = 1; ripple > 3 dB has a -3 dB point; wide BPF accepted; low stop line drawn
  await resetCard('lcfilter');
  await setS('lcfilter', 'cheby', 'cheby');
  await setF('lcfilter', 'Required attenuation', '0.3');
  ok(/Order N1 \(minimum/.test(await sout('lcfilter')), 'b2: Chebyshev attenuation below the ripple needs order 1', (await sout('lcfilter')).slice(0, 120));
  await setF('lcfilter', 'Required attenuation', '15');
  await setF('lcfilter', 'Pass-band ripple', '4');
  const rip4 = await sout('lcfilter');
  ok(/−3 dB frequency \(inside the ripple band[^)]*\)\d/.test(rip4), 'b2: 4 dB ripple Chebyshev shows a -3 dB frequency', rip4.slice(0, 400));
  await resetCard('lcfilter');
  await setS('lcfilter', 'bpf', 'bpf');
  await setF('lcfilter', 'Centre frequency', '77.4597');
  await setF('lcfilter', 'Bandwidth', '170');
  await setF('lcfilter', 'Stop-band frequency', '400');
  const wide = await sout('lcfilter');
  ok(!/Enter/.test(wide) && /30 MHz … 200 MHz/.test(wide) && /Very wide band/.test(wide), 'b2: 30-200 MHz band-pass is designed (BW > 2 f0 allowed)', wide.slice(0, 300));
  await setF('lcfilter', 'Centre frequency', '1000');
  await setF('lcfilter', 'Bandwidth', '100');
  await setF('lcfilter', 'Stop-band frequency', '650');
  ok(await evaluate(`[...document.querySelectorAll('#c-lcfilter .b2-chart svg text.viz-dlabel')].some(t => t.textContent === 'stop')`), 'b2: band-pass stop frequency below f0 - 3 BW is drawn on the chart');
  await resetCard('lcfilter');

  // persistence of the custom cards across a reload, and Reset restores the examples
  await setF('pnjitter', 'Carrier frequency', '2000');
  await setF('pnjitter', 'Integrate to offset', '5');
  await setS('spurs', 'band', 'band');
  await setF('spurs', 'LO frequency', '2300');
  await setS('spurs', 'all', 'all');
  await setS('lcfilter', 'hpf', 'hpf');
  await setF('lcfilter', 'Cut-off frequency', '1000');
  await setS('lcfilter', 'fixed', 'fixed');
  await evaluate('location.reload(); 1');
  await sleep(1500);
  ok(await getF('pnjitter', 'Carrier frequency') === '2000' && await getF('pnjitter', 'Integrate to offset') === '5', 'b2: phase noise carrier and limits persist across reload', await getF('pnjitter', 'Carrier frequency'));
  ok(await getS('spurs', 'band') === 'band' && await getF('spurs', 'LO frequency') === '2300' && await rowShown('spurs', 'LO range stop') && await getS('spurs', 'all') === 'all', 'b2: spur plan persists across reload (LO range row visible)');
  ok(await getS('lcfilter', 'hpf') === 'hpf' && await getF('lcfilter', 'Cut-off frequency') === '1000' && await getS('lcfilter', 'fixed') === 'fixed' && await rowShown('lcfilter', 'Order N') && !(await rowShown('lcfilter', 'Stop-band')), 'b2: LC filter persists across reload with matching rows shown');
  for (const c of ['pnjitter', 'spurs', 'lcfilter']) await resetCard(c);
  ok(await getF('pnjitter', 'Carrier frequency') === '1000' && await getF('spurs', 'LO frequency') === '2330' && !(await rowShown('spurs', 'LO range stop')) && await getF('lcfilter', 'Cut-off frequency') === '2000' && await getS('lcfilter', 'hpf') === 'lpf', 'b2: Reset restores the example values');
  await evaluate('location.reload(); 1');
  await sleep(1500);
  ok(await getF('lcfilter', 'Cut-off frequency') === '2000' && await getS('spurs', 'all') === 'in', 'b2: reset values stay after another reload');

  // overflow inside these cards
  for (const [cat, id] of [['noise', 'ip3'], ['noise', 'adc'], ['noise', 'pnjitter'], ['freq', 'spurs'], ['comp', 'lcfilter']]) {
    await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(c => c[0] === '${cat}')].click(); 1`);
    await sleep(150);
    const over = await evaluate(`(() => { const c = document.getElementById('c-${id}'); const r = c.getBoundingClientRect().right; return [...c.querySelectorAll('.card-body > *, .orow, .frow, .b2-chart')].filter(e => e.getBoundingClientRect().right > r - 2).length; })()`);
    ok(over === 0, 'b2: nothing overflows card ' + id, over);
    await shotCard(cat, id);
  }
};

// Batch 4 browser checks
module.exports = async function (T) {
  const { evaluate, ok, sleep, shotCard } = T;
  const cards = ['mmunc', 'linezin', 'stubmatch', 'stripline', 'cpw', 'gcpw', 'coupledms'];
  for (const id of cards) ok(await evaluate(`!!document.getElementById('c-${id}')`), 'b4 card rendered: ' + id);
  // terminated line shows a Smith chart with both points
  ok(await evaluate(`document.querySelectorAll('#c-linezin .viz-dot').length`) === 2, 'linezin: Smith chart with Γ_L and Γ_in');
  // stub matching: two solutions + Smith chart, and the stub type changes the result
  const rows = () => evaluate(`[...document.querySelectorAll('#c-stubmatch table.grid tbody tr')].map(r => r.children[2].textContent)`);
  const r1 = await rows();
  ok(r1.length === 2, 'stubmatch: two solutions listed', r1);
  ok(Math.abs(parseFloat(r1[0]) - 0.095) < 0.001 && Math.abs(parseFloat(r1[1]) - 0.405) < 0.001, 'stubmatch: Pozar 5.2 stub lengths 0.095 / 0.405 λ', r1);
  ok(await evaluate(`document.querySelectorAll('#c-stubmatch .viz-dot').length`) === 3, 'stubmatch: Smith chart with load and two stub points');
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-stubmatch select')].pop(); s.value = 'shunt-open'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const r2 = await rows();
  ok(/0\.345/.test(r2.join(' ')) && r2.join() !== r1.join(), 'stubmatch: open stubs are λ/4 longer (0.345 λ)', r2);
  // coupled microstrip: type Z0 and coupling, width and spacing get solved
  await evaluate(`(() => { const c = document.getElementById('c-coupledms');
    const set = (lab, v) => { const r = [...c.querySelectorAll('.frow')].find(x => x.querySelector('.flabel').textContent.startsWith(lab));
      const i = r.querySelector('input'); i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('blur')); };
    set('System impedance', '50'); set('Coupling', '10'); return 1; })()`);
  const st = await evaluate(`(() => { const c = document.getElementById('c-coupledms');
    const g = lab => [...c.querySelectorAll('.frow')].find(x => x.querySelector('.flabel').textContent.startsWith(lab));
    return [g('Strip width').className, g('Spacing').className, g('Even-mode').querySelector('input').value]; })()`);
  ok(/calc/.test(st[0]) && /calc/.test(st[1]) && Math.abs(parseFloat(st[2]) - 69.37) < 0.01, 'coupledms: 50 Ω / 10 dB solves W and s (Z0e = 69.37 Ω)', st);
  // ---- audit regressions ----
  const fRow = (card, lab) => `[...document.querySelectorAll('#c-${card} .frow')].find(r => r.querySelector('.flabel').textContent.trim().startsWith(${JSON.stringify(lab)}))`;
  const setF = (card, lab, v) => evaluate(`(() => { const i = ${fRow(card, lab)}.querySelector('input'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('blur')); return 1; })()`);
  const getF = (card, lab) => evaluate(`${fRow(card, lab)}.querySelector('input').value`);
  const setType = v => evaluate(`(() => { const s = [...document.querySelectorAll('#c-stubmatch select')].pop(); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); return 1; })()`);
  const stubRows = () => evaluate(`[...document.querySelectorAll('#c-stubmatch table.grid tbody tr')].map(r => [...r.children].map(c => c.textContent))`);
  const msgOf = card => evaluate(`(() => { const m = document.querySelector('#c-${card} .msg'); return [m.className, m.textContent]; })()`);
  const outRow = (card, lab) => evaluate(`(() => { const r = [...document.querySelectorAll('#c-${card} .orow')].find(r => r.children[0].textContent.startsWith(${JSON.stringify(lab)})); return r ? r.children[1].textContent : null; })()`);

  // stub at the load: 50 − j30 with a series open stub has d = 0 and is the shortest
  await setF('stubmatch', 'Load resistance', '50');
  await setF('stubmatch', 'Load reactance', '-30');
  await setType('series-open');
  const sr = await stubRows();
  const atLoad = sr.find(r => /^0 λ/.test(r[1]));
  ok(!!atLoad && /shortest/.test(atLoad[0]) && !sr.some(r => /^0\.5 λ/.test(r[1]) || /e-1\d λ/.test(r[1])), 'stubmatch: load on the r = 1 circle shows d = 0 λ and tags it shortest', JSON.stringify(sr));
  ok(/∞|\d/.test(await evaluate(`[...document.querySelectorAll('#c-stubmatch th')].find(t => t.textContent.startsWith('Load |Γ|')).nextElementSibling.textContent`)), 'stubmatch: load VSWR row shown');

  // stubmatch: inputs persist across a reload, Reset restores the example
  await setF('stubmatch', 'Frequency', '5');
  await evaluate('location.reload(); 1');
  await sleep(1500);
  const kept = [await getF('stubmatch', 'Frequency'), await getF('stubmatch', 'Load resistance'), await getF('stubmatch', 'Load reactance'),
    await evaluate(`[...document.querySelectorAll('#c-stubmatch select')].pop().value`)];
  ok(kept.join() === '5,50,-30,series-open', 'stubmatch: fields and stub type remembered after reload', kept);
  await evaluate(`[...document.querySelectorAll('#c-stubmatch .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);
  const reset = [await getF('stubmatch', 'Frequency'), await getF('stubmatch', 'Load resistance'), await getF('stubmatch', 'Load reactance'),
    await evaluate(`[...document.querySelectorAll('#c-stubmatch select')].pop().value`)];
  ok(reset.join() === '2,60,-80,shunt-short', 'stubmatch: Reset restores the example values', reset);
  const rr = await stubRows();
  ok(Math.abs(parseFloat(rr[0][2]) - 0.095) < 0.001, 'stubmatch: after Reset the Pozar 5.2 result is back', JSON.stringify(rr));

  // substrate preset switches to Custom when εr is edited
  const cpwSel = `[...document.querySelectorAll('#c-cpw .cfgrow select')][0]`;
  ok(await evaluate(`${cpwSel}.value`) !== 'custom', 'cpw: a substrate preset is selected by default');
  await setF('cpw', 'Substrate εr', '2.2');
  ok(await evaluate(`${cpwSel}.value`) === 'custom', 'cpw: typing εr = 2.2 switches the substrate preset to Custom', await evaluate(`${cpwSel}.value`));
  // retyping a preset's own εr keeps the preset; a different εr switches to Custom
  await evaluate(`(() => { const s = ${cpwSel}; s.value = '0'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const er0 = await getF('cpw', 'Substrate εr');
  await setF('cpw', 'Substrate εr', er0);
  ok(await evaluate(`${cpwSel}.value`) === '0', 'cpw: retyping the preset εr keeps the substrate preset', [er0, await evaluate(`${cpwSel}.value`)]);
  await setF('cpw', 'Substrate εr', '3.0001');
  ok(await evaluate(`${cpwSel}.value`) === 'custom', 'cpw: a slightly different εr switches the preset to Custom', await evaluate(`${cpwSel}.value`));
  // stub card: a nearly reactive passive load is not tagged as active
  await setF('stubmatch', 'Load resistance', '1e-9');
  await setF('stubmatch', 'Load reactance', '-444');
  const lv = await evaluate(`[...document.querySelectorAll('#c-stubmatch th')].find(t => t.textContent.startsWith('Load |Γ|')).nextElementSibling.textContent`);
  ok(!/active/.test(lv), 'stubmatch: near-lossless passive load VSWR has no "active" tag', lv);
  await evaluate(`[...document.querySelectorAll('#c-stubmatch .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);

  // GCPW wide gap: the model warning is shown
  await setF('gcpw', 'Substrate thickness', '0.2');
  await setF('gcpw', 'Gap', '1');
  const gm = await msgOf('gcpw');
  ok(/microstrip|Gap wider/.test(gm[1]) && /warn|err/.test(gm[0]), 'gcpw: a gap of 5h shows the model warning', gm);

  // terminated line: shorted load shows VSWR ∞ without an error
  await setF('linezin', 'Load resistance', '0');
  await setF('linezin', 'Load reactance', '0');
  const lm = await msgOf('linezin');
  ok(!/err/.test(lm[0]) && /∞/.test(await getF('linezin', 'VSWR')), 'linezin: short-circuit load gives VSWR ∞ and no error', [lm, await getF('linezin', 'VSWR')]);
  await setF('linezin', 'Electrical length', '180');
  await setF('linezin', 'Load resistance', '100');
  ok(await outRow('linezin', 'Zin reactance') === 'no reactance', 'linezin: half-wave line shows no reactance', await outRow('linezin', 'Zin reactance'));

  // mismatch uncertainty: worst-phase loss with one port solves the other
  await setF('mmunc', 'Total mismatch loss, worst phase', '3');
  const g2 = parseFloat(await getF('mmunc', 'Port 2 |Γ₂|'));
  ok(Math.abs(g2 - 0.58954) < 1e-4, 'mmunc: worst-phase 3 dB with VSWR 1.5 solves |Γ₂| = 0.5895', g2);
  ok(/Delivered power vs\. phase-ignored value, dB/.test(await evaluate(`document.querySelector('#c-mmunc .outputs').textContent`)), 'mmunc: delivered power range shown in dB');
  for (const id of ['stubmatch', 'cpw', 'gcpw', 'linezin', 'mmunc']) await evaluate(`[...document.querySelectorAll('#c-${id} .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);
  for (const [cat, id] of [['mismatch', 'mmunc'], ['lines', 'linezin'], ['matching', 'stubmatch'], ['lines', 'stripline'], ['lines', 'cpw'], ['lines', 'gcpw'], ['lines', 'coupledms']]) await shotCard(cat, id);
  await sleep(50);
};

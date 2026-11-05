// Browser smoke test via the Chrome DevTools Protocol (Node 22+ has WebSocket built in).
// Run: node test/ui-test.js   (screenshots go to test/shots/)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// Env: FILE (html to test), PORT (DevTools port), SHOTS (screenshot dir), BATCHES (e.g. "b1"; default: all)
const FILE = process.env.FILE ? path.resolve(process.env.FILE) : path.resolve(__dirname, '..', '..', 'rf-calculator.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/');
const PORT = +(process.env.PORT || 9333);
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : path.join(__dirname, 'shots');
const BATCHES = (process.env.BATCHES || 'calcs,b1,b2,b3,b4').split(',').filter(b => fs.existsSync(path.join(__dirname, 'ui-' + b + '.js')));
fs.mkdirSync(SHOTS, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rfcalc-'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } };

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); if (targets.length) break; } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = {};
  const errors = [], requests = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  const send = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception.description);
    return r.result.result.value;
  };
  const shot = async (name, full) => {
    let clip;
    if (full) {
      const m = await send('Page.getLayoutMetrics');
      const cs = m.result.cssContentSize || m.result.contentSize;
      clip = { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 6000), scale: 1 };
    }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full, clip: clip });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };

  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  await evaluate('localStorage.clear(); location.reload(); 1');
  await sleep(1500);

  ok(errors.length === 0, 'no JS errors on load', errors);
  const external = requests.filter(u => !u.startsWith('file:'));
  ok(external.length === 0, 'no network requests (fully offline)', external);
  const nCards = await evaluate('document.querySelectorAll("#cards .card").length');
  ok(nCards >= 40, 'all cards rendered', nCards);
  const failed = await evaluate('document.body.innerText.includes("Failed to load")');
  ok(!failed, 'no card failed to render');
  const nulls = await evaluate('[...document.querySelectorAll(".card-body")].filter(b => [...b.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === "null")).length');
  ok(nulls === 0, 'no stray null text nodes', nulls);

  // helpers in page (defined again after each reload)
  const defineT = () => evaluate(`
    window.T = {
      row(card, label) { const c = document.getElementById('c-' + card); return [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.trim().startsWith(label)); },
      type(card, label, text) { const r = this.row(card, label); const i = r.querySelector('input'); i.focus(); i.value = text; i.dispatchEvent(new Event('input', {bubbles:true})); i.blur(); i.dispatchEvent(new Event('blur')); return true; },
      val(card, label) { return this.row(card, label).querySelector('input').value; },
      state(card, label) { return this.row(card, label).className.replace('frow', '').trim(); },
      msg(card) { return document.querySelector('#c-' + card + ' .msg').textContent; },
    };
    T.kv = (card, label) => { const th = [...document.querySelectorAll('#c-' + card + ' th')].find(t => t.textContent.trim().startsWith(label)); return th ? th.nextElementSibling.textContent : null; };
    T.btn = (card, text) => [...document.querySelectorAll('#c-' + card + ' button')].find(b => b.textContent === text); 1`);
  await defineT();

  // FSPL: type L -> d becomes calculated
  await evaluate(`T.type('fspl', 'Free-space path loss', '120')`);
  ok(await evaluate(`T.state('fspl', 'Distance')`) === 'calc', 'FSPL: distance calculated after typing loss');
  ok(Math.abs(parseFloat(await evaluate(`T.val('fspl', 'Distance')`)) - 9.9403) < 2e-3, 'FSPL: distance 9.94 km', await evaluate(`T.val('fspl', 'Distance')`));
  // clear frequency -> it becomes the target
  await evaluate(`T.type('fspl', 'Frequency', '')`);
  ok(await evaluate(`T.state('fspl', 'Frequency')`) === 'calc', 'FSPL: cleared field becomes calculated');
  ok(Math.abs(parseFloat(await evaluate(`T.val('fspl', 'Frequency')`)) - 2.4) < 1e-6, 'FSPL: frequency recalculated to 2.4', await evaluate(`T.val('fspl', 'Frequency')`));

  // SI prefix parsing in a field with a unit selector
  await evaluate(`T.type('react', 'Inductance', '4n7')`);
  ok(Math.abs(parseFloat(await evaluate(`T.val('react', 'Inductive reactance')`)) - 2 * Math.PI * 100e6 * 4.7e-9) < 1e-3, 'reactance from 4n7', await evaluate(`T.val('react', 'Inductive reactance')`));
  ok(await evaluate(`T.val('react', 'Inductance')`) === '4.7', 'after blur 4n7 shows 4.7 (nH)', await evaluate(`T.val('react', 'Inductance')`));
  // unit typed with the number switches the selector
  await evaluate(`T.type('fspl', 'Frequency', '5.8 GHz')`);
  ok(await evaluate(`T.row('fspl', 'Frequency').querySelector('select').value`) === 'GHz', 'typing 5.8 GHz selects GHz');
  ok(await evaluate(`T.val('fspl', 'Frequency')`) === '5.8', 'typing 5.8 GHz shows 5.8', await evaluate(`T.val('fspl', 'Frequency')`));
  await evaluate(`T.type('fspl', 'Frequency', '2400')`);
  ok(await evaluate(`T.row('fspl', 'Frequency').querySelector('select').value`) === 'GHz', 'plain number keeps unit');
  await evaluate(`(() => { const r = T.row('fspl', 'Frequency'); const s = r.querySelector('select'); s.value = 'MHz'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await evaluate(`T.val('fspl', 'Frequency')`) === '2400000', 'unit change on entered field converts the display', await evaluate(`T.val('fspl', 'Frequency')`));
  await evaluate(`T.type('fspl', 'Frequency', '2400')`);

  // VSWR group: type return loss -> everything else calculated
  await evaluate(`T.type('vswr', 'Return loss', '20')`);
  ok(await evaluate(`T.state('vswr', 'VSWR')`) === 'calc', 'VSWR becomes calculated after RL');
  ok(Math.abs(parseFloat(await evaluate(`T.val('vswr', 'VSWR')`)) - 1.22222) < 1e-4, 'RL 20 dB -> VSWR 1.222');

  // unit change on a calculated field converts the display
  await evaluate(`(() => { const r = T.row('fspl', 'Distance'); const s = r.querySelector('select'); s.value = 'm'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(Math.abs(parseFloat(await evaluate(`T.val('fspl', 'Distance')`)) - 9940.3) < 0.5, 'unit change converts the display', await evaluate(`T.val('fspl', 'Distance')`));

  // preset select on microstrip
  await evaluate(`(() => { const s = document.querySelector('#c-microstrip .cfg select'); s.value = '3'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await evaluate(`T.val('microstrip', 'Substrate εr')`) === '3.55', 'substrate preset sets εr', await evaluate(`T.val('microstrip', 'Substrate εr')`));

  // invalid text is flagged and ignored
  await evaluate(`(() => { const i = T.row('dbratio', 'Decibels').querySelector('input'); i.value = '12x'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(await evaluate(`T.row('dbratio', 'Decibels').querySelector('input').classList.contains('bad')`), 'invalid input flagged');

  // charts
  ok(await evaluate(`document.querySelectorAll('#c-s2 .viz-row svg').length`) === 3, 'S 2-port: heatmap, Smith and polar charts');
  ok(await evaluate(`document.querySelectorAll('#c-s3 .viz-row svg').length`) === 3, 'S 3-port: heatmap, Smith and polar charts');
  ok(await evaluate(`document.querySelectorAll('#c-s3 .heat').length`) === 9, 'S 3-port heatmap has 9 cells');
  ok(await evaluate(`document.querySelectorAll('#c-spower3 .viz-bar .viz-seg').length`) === 4, 'simple 3-port power bar has 4 segments');
  ok(await evaluate(`document.querySelectorAll('#c-spower2 .viz-bar .viz-seg').length`) === 3, 'simple 2-port power bar has 3 segments');
  // the bar follows the inputs
  await evaluate(`T.type('spower3', '|S11|', '-6')`);
  const seg3 = await evaluate(`[...document.querySelectorAll('#c-spower3 .viz-legend .viz-li')].map(x => x.textContent).join(' | ')`);
  ok(/Reflected25\.1/.test(seg3.replace(/\s/g, '')), 'power bar legend updates with S11 = -6 dB', seg3);
  // tooltip on hover
  const tip = await evaluate(`(() => { const g = document.querySelector('#c-s2 .heat').parentNode; const b = g.getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x + 5, clientY: b.y + 5, bubbles: true }));
    const t = document.querySelector('.viz-tip'); return t && t.style.display === 'block' ? t.textContent : ''; })()`);
  ok(/S11/.test(tip) && /dB/.test(tip), 'heatmap tooltip shows value', tip);
  // theme switch recolours charts without re-rendering
  const fillDark = await evaluate(`getComputedStyle(document.querySelector('#c-s2 .heat.h0') || document.querySelector('#c-s2 .heat')).fill`);
  await evaluate(`document.getElementById('theme').click(); 1`);
  const fillLight = await evaluate(`getComputedStyle(document.querySelector('#c-s2 .heat.h0') || document.querySelector('#c-s2 .heat')).fill`);
  ok(fillDark !== fillLight, 'heatmap colours follow the theme', [fillDark, fillLight]);
  await evaluate(`document.getElementById('theme').click(); 1`);
  // "Load example" selectors keep showing the loaded example
  for (const [card, first, other, cell] of [['s3', 'wilk', 'circ', 'S21'], ['s2', 'pozar', 'thru', 'S21']]) {
    const sel = `document.querySelector('#c-${card} .cols .cfgrow select')`;
    const cellA = `[...document.querySelectorAll('#c-${card} .mcell')].find(c => c.querySelector('.sname').textContent === '${cell}').querySelector('input')`;
    ok(await evaluate(`${sel}.value`) === first, card + ': selector shows the initially loaded example', await evaluate(`${sel}.value`));
    await evaluate(`(() => { const s = ${sel}; s.value = '${other}'; s.dispatchEvent(new Event('change')); return 1; })()`);
    ok(await evaluate(`${sel}.value`) === other, card + ': selected example stays visible after loading', await evaluate(`${sel}.value`));
    ok(await evaluate(`${cellA}.value`) === '0', card + ': example values loaded (|' + cell + '| = 0 dB)', await evaluate(`${cellA}.value`));
    await evaluate(`(() => { const i = ${cellA}; i.value = '-1'; i.dispatchEvent(new Event('input')); return 1; })()`);
    ok(await evaluate(`${sel}.value`) === '', card + ': editing a cell switches to Custom values', await evaluate(`${sel}.value`));
    await evaluate(`(() => { const s = ${sel}; s.value = '${other}'; s.dispatchEvent(new Event('change')); return 1; })()`);
    ok(await evaluate(`${cellA}.value`) === '0' && await evaluate(`${sel}.value`) === other, card + ': the same example can be re-applied');
  }
  await evaluate(`[...document.querySelectorAll('#c-s3 button')].find(b => b.textContent.startsWith('Send to the 2-port')).click(); 1`);
  ok(await evaluate(`document.querySelector('#c-s2 .cols .cfgrow select').value`) === '', 'reduced 3-port sent to the 2-port card shows Custom values');

  // new calculators
  await evaluate(`T.type('span', 'Centre', '1000')`);
  await evaluate(`T.type('span', 'Span', '100')`);
  ok(await evaluate(`T.val('span', 'Start')`) === '950' && await evaluate(`T.val('span', 'Stop')`) === '1050', 'span: centre/span -> start/stop',
    [await evaluate(`T.val('span', 'Start')`), await evaluate(`T.val('span', 'Stop')`)]);
  await evaluate(`T.type('mixer', 'Gap', '200')`);
  ok(await evaluate(`T.val('mixer', 'IF centre')`) === '110', 'mixer: gap solves the IF', await evaluate(`T.val('mixer', 'IF centre')`));
  const att = await evaluate(`document.querySelector('#c-atten .outputs').textContent`);
  ok(/Worst-case range/.test(att) && /RSS/.test(att), 'attenuator shows the tolerance analysis', att.slice(0, 200));
  await evaluate(`(() => { const s = [...document.querySelectorAll('#c-atten .cfg select')][1]; s.value = '5'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const att5 = await evaluate(`document.querySelector('#c-atten .outputs').textContent`);
  ok(att5 !== att, 'changing the tolerance updates the range');

  // ------------------------------------------------ audit regression checks ---
  await evaluate(`T.sel = (card, i) => document.querySelectorAll('#c-' + card + ' .cfg select')[i || 0];
    T.pick = (card, val) => { const s = [...document.querySelectorAll('#c-' + card + ' .cols .cfgrow select')][0]; s.value = val; s.dispatchEvent(new Event('change')); return 1; };
    T.cell = (card, name, k) => [...document.querySelectorAll('#c-' + card + ' .mcell')].find(c => c.querySelector('.sname').textContent === name).querySelectorAll('input')[k || 0];
    T.setCell = (card, name, k, v) => { const i = T.cell(card, name, k); i.value = v; i.dispatchEvent(new Event('input')); return 1; }; 1`);

  // S7 (C2/F2, G2-G4/F1): the calculator warning and the solver error are both shown
  await evaluate(`T.type('spower2', '|S21|', '10')`);
  const m2 = await evaluate(`T.msg('spower2')`);
  ok(/not a passive network/.test(m2) && /No valid solution/.test(m2), 'msg: spower2 passivity warning shown together with the solver error', m2);
  await evaluate(`T.type('spower2', '|S21|', '-0.5')`);
  ok(!/passive/.test(await evaluate(`T.msg('spower2')`)), 'msg: spower2 warning clears for a passive network');

  // S5 (U1/F8): an out-of-range entry is flagged with its range and not used
  const lBefore = await evaluate(`T.val('fspl', 'Free-space path loss')`);
  await evaluate(`T.type('fspl', 'Frequency', '-5 GHz')`);
  ok(await evaluate(`T.row('fspl', 'Frequency').querySelector('input').classList.contains('bad')`), 'range: negative frequency flagged');
  ok(/range/.test(await evaluate(`T.row('fspl', 'Frequency').querySelector('input').title`)), 'range: title names the valid range', await evaluate(`T.row('fspl', 'Frequency').querySelector('input').title`));
  ok(/Frequency.*out of range/.test(await evaluate(`T.msg('fspl')`)), 'range: message names the offending input', await evaluate(`T.msg('fspl')`));
  ok(await evaluate(`T.val('fspl', 'Free-space path loss')`) === lBefore && await evaluate(`T.state('fspl', 'Frequency')`) === 'in', 'range: out-of-range value is not passed to the solver');
  await evaluate(`T.type('fspl', 'Frequency', '2400')`);
  ok(!await evaluate(`T.row('fspl', 'Frequency').querySelector('input').classList.contains('bad')`) && await evaluate(`T.msg('fspl')`) === '', 'range: a valid entry clears the flag');
  // every example value, calculated value and preset value must be accepted when typed back in
  const rejected = await evaluate(`CALCS.filter(c => !c.custom).flatMap(c => {
    const okIn = (d, x) => inRange({ min: inputMin(d), max: inputMax(d) }, x);
    const st = calcInit(c);
    const bad = c.vars.filter(d => ['in', 'calc'].includes(st.status[d.id]) && !okIn(d, st.vals[d.id])).map(d => c.id + '.' + d.id + ' = ' + st.vals[d.id]);
    for (const g of (c.cfg || [])) if (g.set) for (const o of g.options) { const p = g.set(o[0]) || {}; for (const k in p) if (c.byId[k] && !okIn(c.byId[k], p[k])) bad.push(c.id + ' preset ' + o[0] + ': ' + k + ' = ' + p[k]); }
    return bad; })`);
  ok(rejected.length === 0, 'range: example, calculated and preset values are all valid inputs', rejected.slice(0, 12));

  // U1/F6: unreadable text keeps its red mark and a message after blur
  await evaluate(`T.type('dbratio', 'Decibels', '5,8')`);
  ok(await evaluate(`T.val('dbratio', 'Decibels')`) === '5,8' && await evaluate(`T.row('dbratio', 'Decibels').querySelector('input').classList.contains('bad')`), 'invalid text stays flagged after blur');
  ok(/Could not read "5,8"/.test(await evaluate(`T.msg('dbratio')`)), 'invalid text explained in the message', await evaluate(`T.msg('dbratio')`));
  await evaluate(`T.type('dbratio', 'Decibels', '3')`);
  ok(await evaluate(`T.msg('dbratio')`) === '' && !await evaluate(`T.row('dbratio', 'Decibels').querySelector('input').classList.contains('bad')`), 'valid entry clears the invalid flag');

  // S6 (U1/F4): editing a preset-set value switches the selector to Custom
  if (await evaluate(`!!document.getElementById('c-waveguide')`)) {
    ok(await evaluate(`T.sel('waveguide').value`) !== 'custom', 'preset: waveguide starts on a standard size');
    await evaluate(`T.type('waveguide', 'Broad wall a', '30')`);
    ok(await evaluate(`T.sel('waveguide').value`) === 'custom', 'preset: typing a = 30 mm switches the size to Custom', await evaluate(`T.sel('waveguide').value`));
    await evaluate(`(() => { const s = T.sel('waveguide'); s.value = s.options[2].value; s.dispatchEvent(new Event('change')); return 1; })()`);
    await evaluate(`T.type('waveguide', 'Broad wall a', T.val('waveguide', 'Broad wall a'))`);
    ok(await evaluate(`T.sel('waveguide').value`) !== 'custom', 'preset: retyping the preset value keeps the preset');
  }
  if (await evaluate(`[...T.sel('microstrip').options].some(o => o.value === 'custom')`)) {
    await evaluate(`(() => { const s = T.sel('microstrip'); s.value = '3'; s.dispatchEvent(new Event('change')); return 1; })()`);
    await evaluate(`T.type('microstrip', 'Substrate εr', '2.2')`);
    ok(await evaluate(`T.sel('microstrip').value`) === 'custom', 'preset: typing εr = 2.2 switches the substrate to Custom');
  }
  // U1/F4 round 2: an infinite preset value (linear AR = ∞) is not 'the same' as a typed finite value
  if (await evaluate(`!!document.getElementById('c-polmis')`)) {
    await evaluate(`(() => { const s = T.sel('polmis', 1); s.value = 'll'; s.dispatchEvent(new Event('change')); return 1; })()`);
    ok(await evaluate(`T.sel('polmis', 1).value`) === 'll', 'preset: polmis starts on Linear ↔ linear');
    await evaluate(`T.type('polmis', 'Axial ratio, antenna 1', '3')`);
    ok(await evaluate(`T.sel('polmis', 1).value`) === 'custom', 'preset: polmis ar1 = 3 dB under Linear ↔ linear switches to Custom', await evaluate(`T.sel('polmis', 1).value`));
    await evaluate(`(() => { const s = T.sel('polmis', 1); s.value = 'cl'; s.dispatchEvent(new Event('change')); return 1; })()`);
    await evaluate(`T.type('polmis', 'Axial ratio, antenna 1', '0')`);
    ok(await evaluate(`T.sel('polmis', 1).value`) === 'cl', 'preset: polmis retyping ar1 = 0 keeps Circular ↔ linear');
    await evaluate(`T.type('polmis', 'Axial ratio, antenna 2', '20')`);
    ok(await evaluate(`T.sel('polmis', 1).value`) === 'custom', 'preset: polmis ar2 = 20 dB under Circular ↔ linear switches to Custom');
  }

  // regression: a unit change with pending unreadable text drops the stored text of the old unit
  await evaluate(`(() => { const s = T.row('fspl', 'Frequency').querySelector('select'); s.value = 'GHz'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await evaluate(`T.type('fspl', 'Frequency', '5')`);
  await evaluate(`T.type('fspl', 'Frequency', 'abc')`);
  await evaluate(`(() => { const s = T.row('fspl', 'Frequency').querySelector('select'); s.value = 'MHz'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const fsSt = await evaluate(`JSON.parse(localStorage.getItem('rfcalc.v1.s.fspl'))`);
  ok(fsSt.unit.f === 'MHz' && fsSt.vals.f === 5e9 && fsSt.text.f !== '5', 'unit: switching unit with unreadable text does not keep the old-unit text', [fsSt.unit.f, fsSt.vals.f, fsSt.text.f]);
  await evaluate(`T.type('fspl', 'Frequency', '')`);
  ok(Math.abs(parseFloat(await evaluate(`T.val('fspl', 'Frequency')`)) - 5000) < 1e-6, 'unit: the field then shows the value used (5 GHz = 5000 MHz)', await evaluate(`T.val('fspl', 'Frequency')`));
  await evaluate(`T.type('fspl', 'Frequency', '2400')`);

  // U1/F5: two quick clicks on Copy still restore the label
  await evaluate(`(() => { const b = T.btn('fspl', 'Copy'); b.click(); setTimeout(() => b.click(), 300); return 1; })()`);
  await sleep(1900);
  ok(await evaluate(`[...document.querySelectorAll('#c-fspl .card-btns button')].map(b => b.textContent).includes('Copy')`), 'copy: label restored after two quick clicks');

  // S 2-port card
  await evaluate(`T.pick('s2', 'thru')`);
  ok(/Unconditionally stable/.test(await evaluate(`T.kv('s2', 'Verdict')`)), 's2: ideal through is stable (passive, μ = 1)', await evaluate(`T.kv('s2', 'Verdict')`));
  await evaluate(`T.pick('s2', 'ser25')`);
  ok(/Unconditionally stable/.test(await evaluate(`T.kv('s2', 'Verdict')`)), 's2: series 25 Ω is stable (passive)', await evaluate(`T.kv('s2', 'Verdict')`));
  await evaluate(`T.pick('s2', 'unstable')`);
  ok(/Potentially unstable/.test(await evaluate(`T.kv('s2', 'Verdict')`)), 's2: unstable example still flagged');
  ok(/needs K ≥ 1 and \|Δ\| < 1/.test(await evaluate(`T.kv('s2', 'Maximum available gain')`)), 's2: MAG fallback names the real condition', await evaluate(`T.kv('s2', 'Maximum available gain')`));
  await evaluate(`T.pick('s2', 'iso')`);
  ok(/^0 dB/.test(await evaluate(`T.kv('s2', 'Maximum available gain')`)), 's2: isolator MAG = G_TU,max = 0 dB', await evaluate(`T.kv('s2', 'Maximum available gain')`));
  await evaluate(`T.pick('s2', 'thru')`);
  await evaluate(`T.type('s2', 'Source impedance', '100'); T.type('s2', 'Load impedance', '100')`);
  ok(await evaluate(`T.kv('s2', 'Input VSWR (ref. Z₀)')`) === '2' && await evaluate(`T.kv('s2', 'Mismatch VSWR seen by the source')`) === '1',
    's2: VSWR vs Z0 = 2, mismatch seen by a 100 Ω source = 1', [await evaluate(`T.kv('s2', 'Input VSWR (ref. Z₀)')`), await evaluate(`T.kv('s2', 'Mismatch VSWR seen by the source')`)]);
  await evaluate(`T.type('s2', 'Source impedance', '50'); T.type('s2', 'Load impedance', '50')`);
  // G2-G1/F5 round 2: a lossless passive load (|Γ| rounds to 1 + 2e-16) is ∞ but not 'active'
  await evaluate(`T.type('s2', 'Load impedance', '0')`);
  const reactVswr = [];
  for (const x of ['-444', '-430', '-416', '25', '100']) {
    await evaluate(`T.type('s2', 'Load reactance', '${x}')`);
    reactVswr.push(await evaluate(`T.kv('s2', 'Input VSWR (ref. Z₀)')`));
  }
  ok(reactVswr.every(t => t === '∞'), 's2: reactive load on a through gives VSWR ∞ without the active tag', reactVswr);
  await evaluate(`T.pick('s2', 'line45')`);
  await evaluate(`T.type('s2', 'Load reactance', '-75')`);
  ok(await evaluate(`T.kv('s2', 'Mismatch VSWR seen by the source')`) === '∞', 's2: source mismatch VSWR ∞ without the active tag for a reactive load', await evaluate(`T.kv('s2', 'Mismatch VSWR seen by the source')`));
  await evaluate(`T.type('s2', 'Load impedance', '50'); T.type('s2', 'Load reactance', '0')`);
  // C3-s2/F4 round 2: passive verdict for S = diag(1, 1), where μ = 0/0, does not cite μ = 1
  await evaluate(`T.setCell('s2', 'S11', 0, '0'); T.setCell('s2', 'S22', 0, '0'); T.setCell('s2', 'S21', 0, ''); T.setCell('s2', 'S12', 0, '')`);
  const vd = await evaluate(`T.kv('s2', 'Verdict')`);
  ok(/passive network/.test(vd) && !/μ = 1 boundary/.test(vd), 's2: S = diag(1, 1) (μ = 0/0) is passive and does not cite the μ = 1 boundary', vd);
  await evaluate(`T.pick('s2', 'thru')`);
  await evaluate(`T.type('s2', 'Source reactance', 'abc')`);
  ok(/Enter valid impedances/.test(await evaluate(`document.querySelector('#c-s2 .sout').textContent`)), 's2: unreadable X_S is not taken as 0');
  await evaluate(`T.type('s2', 'Source reactance', '0')`);
  await evaluate(`T.setCell('s2', 'S11', 0, '1.5836')`);
  ok(/∞ \(\|Γ\| > 1, active\)/.test(await evaluate(`T.kv('s2', 'Input return loss')`)), 's2: |S11| > 1 shows VSWR ∞ (active)', await evaluate(`T.kv('s2', 'Input return loss')`));
  await evaluate(`T.pick('s2', 'pozar')`);
  await evaluate(`T.setCell('s2', 'S21', 0, '8.2995')`);   // back to Custom values, as the reload check below expects

  // S 3-port card
  await evaluate(`T.pick('s3', 'circ')`);
  ok(await evaluate(`T.kv('s3', 'Phase imbalance')`) === '—°', 's3: phase imbalance undefined when one output is 0', await evaluate(`T.kv('s3', 'Phase imbalance')`));
  ok(await evaluate(`T.kv('s3', 'Output isolation P2 → P3')`) !== null && await evaluate(`T.kv('s3', 'Output isolation P3 → P2')`) !== null, 's3: output isolation shown for both directions');
  ok(await evaluate(`T.kv('s3', 'Output isolation P2 ↔')`) === null, 's3: no two-way isolation label');
  await evaluate(`T.setCell('s3', 'S11', 0, '1.5836')`);
  ok(/∞ \(\|Γ\| > 1, active\)/.test(await evaluate(`[...document.querySelectorAll('#c-s3 table.grid tr')].find(r => r.cells[0] && r.cells[0].textContent === 'Port 1').cells[2].textContent`)), 's3: |S11| > 1 shows VSWR ∞ (active)');
  await evaluate(`T.type('s3', 'Termination X', 'abc')`);
  ok(!/Reduced 2-port/.test(await evaluate(`document.querySelector('#c-s3 .sout').textContent`)), 's3: unreadable termination X skips the reduced 2-port');
  await evaluate(`T.type('s3', 'Termination X', '0')`);
  await evaluate(`T.pick('s3', 'circ')`);

  // L-network: nodal Q, 2f/Qn and the exact per-solution bandwidth
  ok(/complex load/.test(await evaluate(`T.kv('lnet', 'Approx. 3 dB bandwidth')`)), 'lnet: no real-load bandwidth for the complex default load', await evaluate(`T.kv('lnet', 'Approx. 3 dB bandwidth')`));
  await evaluate(`T.type('lnet', 'Frequency', '100'); T.type('lnet', 'Load resistance', '5000'); T.type('lnet', 'Load reactance', '0')`);
  ok(await evaluate(`T.kv('lnet', 'Nodal Q')`) === '9.95', 'lnet: nodal Q = 9.95 for 50 → 5000 Ω', await evaluate(`T.kv('lnet', 'Nodal Q')`));
  ok(await evaluate(`T.kv('lnet', 'Loaded Q')`) === '4.975', 'lnet: loaded Q = Qn/2', await evaluate(`T.kv('lnet', 'Loaded Q')`));
  ok(/^20\.1\d* MHz/.test(await evaluate(`T.kv('lnet', 'Approx. 3 dB bandwidth')`)), 'lnet: 2f/Qn = 20.1 MHz', await evaluate(`T.kv('lnet', 'Approx. 3 dB bandwidth')`));
  const bws = await evaluate(`[...document.querySelectorAll('#c-lnet table.grid tbody tr')].map(r => parseFloat(r.cells[5].textContent))`);
  ok(bws.length === 2 && Math.abs(bws[0] - 20.31) < 0.02 && Math.abs(bws[1] - 20.73) < 0.02, 'lnet: exact 3 dB bandwidths 20.31 / 20.73 MHz', bws);

  // Cascade: N = k(T + Te)B; NF < 0 warning; '1.5k' in a kelvin field is 1500 K
  const casc = T0 => evaluate(`(() => { const r = cascade([{g:18,nf:1.2,oip3:30,op1:18},{g:-2,nf:2,oip3:NaN,op1:NaN},{g:-7,nf:7,oip3:15,op1:5},{g:20,nf:4,oip3:35,op1:22}]);
    const Te = 290 * (fromDbp(r[3].nf) - 1); return 10 * Math.log10(KB * (` + T0 + ` + Te) * 1e6 * 1000); })()`);
  await evaluate(`T.type('cascade', 'Source temperature', '50')`);
  const fl50 = parseFloat(await evaluate(`T.kv('cascade', 'Input noise floor')`));
  ok(Math.abs(fl50 - await casc(50)) < 6e-3 && Math.abs(fl50 - -114.99) < 0.01, 'cascade: floor k(T + Te)B at T = 50 K', [fl50, await casc(50)]);
  ok(Math.abs(parseFloat(await evaluate(`T.kv('cascade', 'Sensitivity')`)) - (fl50 + 10)) < 1e-3, 'cascade: sensitivity follows the floor');
  await evaluate(`T.type('cascade', 'Source temperature', '1.5k')`);
  ok(Math.abs(parseFloat(await evaluate(`T.kv('cascade', 'Input noise floor')`)) - await casc(1500)) < 6e-3, 'cascade: 1.5k in a kelvin field is 1500 K', await evaluate(`T.kv('cascade', 'Input noise floor')`));
  await evaluate(`T.type('cascade', 'Source temperature', '290')`);
  ok(Math.abs(parseFloat(await evaluate(`T.kv('cascade', 'Input noise floor')`)) - await casc(290)) < 6e-3, 'cascade: unchanged at 290 K');
  await evaluate(`(() => { const i = document.querySelectorAll('#c-cascade table.edit tbody tr')[1].querySelectorAll('input')[2]; i.value = '-1'; i.dispatchEvent(new Event('input')); return 1; })()`);
  ok(/Stage 2: a noise figure below 0 dB/.test(await evaluate(`document.querySelector('#c-cascade .sout').textContent`)), 'cascade: NF < 0 dB stage warned');
  await evaluate(`(() => { const i = document.querySelectorAll('#c-cascade table.edit tbody tr')[1].querySelectorAll('input')[2]; i.value = '2'; i.dispatchEvent(new Event('input')); return 1; })()`);
  await evaluate(`T.type('cascade', 'Noise bandwidth', '10')`);

  // E-series: both neighbour errors shown; a log-scale pick is marked
  await evaluate(`T.type('eseries', 'Calculated value', '12.4')`);
  const e6 = await evaluate(`[...document.querySelectorAll('#c-eseries table.grid tbody tr')][0].textContent`);
  ok(/-19\.35 %/.test(e6) && /\+20\.97 %/.test(e6), 'eseries: errors of both neighbours shown', e6);
  const nb = await evaluate(`[...document.querySelectorAll('#c-eseries table.grid tbody tr')][0].cells[4].textContent`);
  ok(nb === '10' || (/^15\s*†/.test(nb) && /Nearest on a log scale/.test(await evaluate(`document.querySelector('#c-eseries .sout').textContent`))), 'eseries: Nearest agrees with the shown errors or is marked', nb);

  // Conductors: nickel skin depth above 100 MHz is marked as a lower bound
  const ni = await evaluate(`[...document.querySelectorAll('#c-ref_cond table.grid tbody tr')].find(r => /Nickel/.test(r.cells[0].textContent)).textContent`);
  ok(/†/.test(ni) && /Ferromagnetic/.test(await evaluate(`document.getElementById('c-ref_cond').textContent`)), 'ref_cond: nickel μr caveat', ni);

  // Charts: an operating point below the BER axis is drawn hollow and labelled
  if (await evaluate(`!!document.getElementById('c-ber')`)) {
    await evaluate(`T.type('ber', 'Eb/N₀ at', '20')`);
    ok(await evaluate(`document.querySelectorAll('#c-ber .viz-dot.off').length`) === 1 && /below the scale/.test(await evaluate(`document.querySelector('#c-ber svg').textContent`)), 'chart: off-scale BER marker drawn as off scale');
    await evaluate(`T.type('ber', 'Eb/N₀ at', '10')`);
    ok(await evaluate(`document.querySelectorAll('#c-ber .viz-dot.off').length`) === 0, 'chart: in-range marker drawn normally');
  }
  // WCAG: text on the #2a78d6 heat bin is black (4.76:1)
  const h5 = await evaluate(`(() => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('class', 'heat-t h5'); document.querySelector('#c-s2 svg').append(t); const c = getComputedStyle(t).fill; t.remove(); return c; })()`);
  ok(h5 === 'rgb(0, 0, 0)', 'contrast: heat bin 5 ink is black', h5);

  // finite variables refuse ∞ when typed: the field is flagged and the previous L is kept
  await evaluate(`(() => { const c = document.getElementById('c-resonance'); const r = [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Inductance')); const i = r.querySelector('input'); i.value = 'inf'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  const infL = await evaluate(`(() => { const c = document.getElementById('c-resonance'); const r = [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Resonant')); const l = [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Inductance')).querySelector('input'); return { bad: l.classList.contains('bad'), f0: r.querySelector('input').value }; })()`);
  ok(infL.bad && /^159\.15/.test(infL.f0), 'resonance: typing inf for L is refused and f0 keeps 159.15 MHz', infL);
  await evaluate(`(() => { const c = document.getElementById('c-resonance'); const i = [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Inductance')).querySelector('input'); i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('blur')); return 1; })()`);

  // persistence: reload keeps the edited FSPL value
  await evaluate('location.reload(); 1');
  await sleep(1500);
  await evaluate(`window.T = window.T || null; 1`);
  const kept = await evaluate(`(() => { const c = document.getElementById('c-fspl'); const r = [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.startsWith('Free-space')); return r.querySelector('input').value; })()`);
  ok(kept === '120', 'values persist across reload', kept);

  // S-parameter cards remember their matrix, example selector and fields
  await evaluate(`(() => { const i = document.querySelector('#c-s3 .cols .frow input'); i.value = '75'; i.dispatchEvent(new Event('input')); return 1; })()`);
  await evaluate('location.reload(); 1');
  await sleep(1500);
  const s3sel = `document.querySelector('#c-s3 .cols .cfgrow select')`;
  const s3cell = `[...document.querySelectorAll('#c-s3 .mcell')].find(c => c.querySelector('.sname').textContent === 'S21').querySelector('input')`;
  ok(await evaluate(`${s3sel}.value`) === 'circ', 's3: example selector remembered after reload', await evaluate(`${s3sel}.value`));
  ok(await evaluate(`${s3cell}.value`) === '0', 's3: matrix remembered after reload', await evaluate(`${s3cell}.value`));
  ok(await evaluate(`document.querySelector('#c-s3 .cols .frow input').value`) === '75', 's3: Z0 remembered after reload');
  ok(await evaluate(`document.querySelector('#c-s2 .cols .cfgrow select').value`) === '', 's2: Custom values remembered after reload');
  await evaluate(`[...document.querySelectorAll('#c-s3 .card-btns button')].find(b => b.textContent === 'Reset').click(); 1`);
  ok(await evaluate(`${s3sel}.value`) === 'wilk' && await evaluate(`document.querySelector('#c-s3 .cols .frow input').value`) === '50', 's3: Reset restores the example');
  await defineT();
  // custom cards remember their fields (U1/F3): lnet, cascade B/SNR/T, E-series
  ok(await evaluate(`T.val('lnet', 'Frequency')`) === '100' && await evaluate(`T.val('lnet', 'Load resistance')`) === '5000', 'lnet: fields remembered after reload');
  ok(await evaluate(`T.val('cascade', 'Noise bandwidth')`) === '10', 'cascade: noise bandwidth remembered after reload', await evaluate(`T.val('cascade', 'Noise bandwidth')`));
  ok(await evaluate(`T.val('eseries', 'Calculated value')`) === '12.4', 'eseries: value remembered after reload');
  await evaluate(`T.btn('lnet', 'Reset').click(); T.btn('cascade', 'Reset').click(); T.btn('eseries', 'Reset').click(); 1`);
  ok(await evaluate(`T.val('lnet', 'Frequency')`) === '500' && await evaluate(`T.val('cascade', 'Noise bandwidth')`) === '1' && await evaluate(`T.val('eseries', 'Calculated value')`) === '4800', 'custom cards: Reset restores the example values');

  // screenshots of each category
  const cats = await evaluate('CATS.map(c => c[0])');
  for (const c of cats) {
    await evaluate(`[...document.querySelectorAll('.navbtn')].find(b => b.textContent.startsWith(${JSON.stringify((await evaluate('CATS'))[cats.indexOf(c)][1])})).click(); 1`);
    await sleep(250);
    await shot(c, true);
  }
  // close-ups of individual cards
  for (const [cat, card] of [['mismatch', 's2'], ['mismatch', 's3'], ['mismatch', 'spower2'], ['mismatch', 'spower3'], ['freq', 'mixer'], ['freq', 'span'], ['matching', 'lnet'], ['noise', 'cascade'], ['lines', 'microstrip'], ['comp', 'atten'], ['prop', 'link']]) {
    await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(c => c[0] === '${cat}')].click(); 1`);
    await sleep(200);
    const rect = await evaluate(`(() => { const r = document.getElementById('c-${card}').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: Math.min(rect.h, 4000), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, 'card-' + card + '.png'), Buffer.from(r.result.data, 'base64'));
  }
  // nothing overflows its card, in any category
  const overflow = [];
  for (const c of cats) {
    await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(x => x[0] === '${c}')].click(); 1`);
    await sleep(150);
    overflow.push(...await evaluate(`[...document.querySelectorAll('#cards .card:not([hidden])')].flatMap(card =>
      [...card.querySelectorAll('.card-body > *, .orow, .frow')].filter(e => e.getBoundingClientRect().right > card.getBoundingClientRect().right - 2)
        .map(e => card.id + ': ' + e.className + ' ' + Math.round(e.getBoundingClientRect().right - card.getBoundingClientRect().right)))`));
  }
  ok(overflow.length === 0, 'no content overflows a card', overflow.slice(0, 10));
  // light theme screenshot
  await evaluate(`document.getElementById('theme').click(); [...document.querySelectorAll('.navbtn')][1].click(); 1`);
  await sleep(250);
  await shot('mismatch-light');
  // search
  await evaluate(`(() => { const s = document.getElementById('search'); s.value = 'wilkinson'; s.dispatchEvent(new Event('input')); return 1; })()`);
  const vis = await evaluate(`[...document.querySelectorAll('#cards .card')].filter(c => !c.hidden).map(c => c.id)`);
  ok(vis.includes('c-s3'), 'search finds the 3-port calculator', vis);

  // batch browser checks: test/ui-bN.js exports async function (T) with
  // T.evaluate(expr), T.ok, T.sleep, T.send(method, params), T.shotCard(cat, cardId), T.SHOTS
  const shotCard = async (cat, card) => {
    await evaluate(`[...document.querySelectorAll('.navbtn')][CATS.findIndex(c => c[0] === '${cat}')].click(); 1`);
    await sleep(250);
    const rect = await evaluate(`(() => { const r = document.getElementById('c-${card}').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: Math.min(rect.h, 5000), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, 'card-' + card + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  for (const b of BATCHES) {
    const before = pass + fail;
    try {
      await evaluate(`document.getElementById('search').value = ''; document.getElementById('search').dispatchEvent(new Event('input')); 1`);
      await require(path.join(__dirname, 'ui-' + b + '.js'))({ evaluate: evaluate, ok: ok, sleep: sleep, send: send, shotCard: shotCard, SHOTS: SHOTS });
    } catch (e) { ok(false, 'ui-' + b + '.js threw', String(e && e.stack)); }
    console.log('  ' + b + ': ' + (pass + fail - before) + ' browser checks');
  }

  ok(errors.length === 0, 'no JS errors during interaction', errors);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  ws.close();
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

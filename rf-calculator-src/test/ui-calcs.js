// Browser checks for the phase-1 calculators (src/calcs.js, src/rf.js, src/data.js).
// Loaded by test/ui-test.js when BATCHES includes "calcs", e.g.
//   BATCHES=b1,b2,b3,b4,calcs node test/ui-test.js
module.exports = async function (T) {
  const { evaluate, ok, sleep } = T;
  await evaluate(`window.TC = {
    row(card, label) { const c = document.getElementById('c-' + card); return [...c.querySelectorAll('.frow')].find(r => r.querySelector('.flabel').textContent.trim().startsWith(label)); },
    type(card, label, text) { const i = this.row(card, label).querySelector('input'); i.focus(); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new Event('blur')); return true; },
    val(card, label) { return this.row(card, label).querySelector('input').value; },
    state(card, label) { return this.row(card, label).className.replace('frow', '').trim(); },
    msg(card) { return document.querySelector('#c-' + card + ' .msg').textContent; },
    sel(card, i) { return document.querySelectorAll('#c-' + card + ' .cfg select')[i || 0]; },
    out(card, label) { const th = [...document.querySelectorAll('#c-' + card + ' th')].find(t => t.textContent.trim().startsWith(label)); return th ? th.nextElementSibling.textContent : null; },
  }; 1`);

  // preset selectors: Custom option, and editing a preset value switches to it
  await evaluate(`(() => { const s = TC.sel('microstrip'); s.value = '3'; s.dispatchEvent(new Event('change')); return 1; })()`);
  ok(await evaluate(`TC.val('microstrip', 'Substrate εr')`) === '3.55', 'calcs: RO4003C preset sets εr 3.55');
  await evaluate(`TC.type('microstrip', 'Substrate εr', '2.2')`);
  ok(await evaluate(`TC.sel('microstrip').value`) === 'custom', 'calcs: typing εr switches the substrate preset to Custom', await evaluate(`TC.sel('microstrip').value`));
  ok(await evaluate(`[...TC.sel('coax').options].some(o => o.value === 'custom') && [...TC.sel('skin').options].some(o => o.value === 'custom')`), 'calcs: coax and skin-depth presets offer Custom');
  ok(/annealed Cu, 1\.724e-8/.test(await evaluate(`document.getElementById('c-microstrip').textContent`)), 'calcs: microstrip conductor loss names annealed Cu 1.724e-8 Ω·m');

  // coax: d ≥ D is explained, no negative Z0
  await evaluate(`TC.type('coax', 'Outer conductor', '0.5')`);
  ok(/smaller/.test(await evaluate(`TC.msg('coax')`)) && !/^-/.test(await evaluate(`TC.val('coax', 'Characteristic')`)), 'calcs: coax D < d shows the diameter warning, no negative Z₀', await evaluate(`TC.msg('coax')`));
  await evaluate(`TC.type('coax', 'Outer conductor', '3')`);

  // noise floor k(T + Te)B
  await evaluate(`TC.type('sens', 'Receiver noise figure', '1')`);
  await evaluate(`TC.type('sens', 'Source temperature', '50')`);
  const fl = parseFloat(await evaluate(`TC.val('sens', 'Noise floor')`));
  ok(Math.abs(fl - -117.627) < 1e-3, 'calcs: sens floor at T = 50 K, NF 1 dB is −117.627 dBm', fl);
  ok(/k\(T \+ Tₑ\)B/.test(await evaluate(`TC.row('sens', 'Noise floor').textContent`)), 'calcs: floor label k(T + Tₑ)B');
  await evaluate(`TC.type('sens', 'Source temperature', '290')`);
  // NF = 0 dB, then clear NF: the floor stays an input and NF is solved back to 0 (not an error)
  await evaluate(`TC.type('sens', 'Receiver noise figure', '0')`);
  await evaluate(`TC.type('sens', 'Receiver noise figure', '')`);
  const nf0 = await evaluate(`TC.val('sens', 'Receiver noise figure') + '|' + TC.state('sens', 'Receiver noise figure') + '|' + TC.msg('sens')`);
  ok(/^-?0(\.0*)?\|/.test(nf0) && !/No valid solution/.test(nf0), 'calcs: sens NF = 0 dB round-trips through the floor', nf0);
  await evaluate(`TC.type('sens', 'Receiver noise figure', '5')`);

  // passive-network warning is visible in spower2 (S21 > 0 dB makes the dBm loss field fail)
  await evaluate(`TC.type('spower2', '|S21|', '10')`);
  ok(/not a passive network/.test(await evaluate(`TC.msg('spower2')`)), 'calcs: spower2 gain warning is shown', await evaluate(`TC.msg('spower2')`));
  await evaluate(`TC.type('spower2', '|S21|', '-0.5')`);

  // start/stop over a wide range
  await evaluate(`TC.type('span', 'Start frequency', '9 kHz')`);
  await evaluate(`TC.type('span', 'Stop frequency', '26.5 GHz')`);
  ok(await evaluate(`TC.state('span', 'Centre')`) === 'calc' && !/No valid/.test(await evaluate(`TC.msg('span')`)), 'calcs: 9 kHz – 26.5 GHz gives a centre frequency', await evaluate(`TC.msg('span')`));
  ok(Math.abs(parseFloat(await evaluate(`TC.val('span', 'Centre')`)) - 13250.0045) < 0.01, 'calcs: centre 13250 MHz (6 digits)', await evaluate(`TC.val('span', 'Centre')`));

  // purely reactive load: VSWR ∞
  await evaluate(`TC.type('zgamma', 'Load resistance', '0')`);
  await evaluate(`TC.type('zgamma', 'Load reactance', '-30')`);
  ok(await evaluate(`TC.state('zgamma', 'VSWR')`) === 'calc' && await evaluate(`TC.val('zgamma', 'VSWR')`) === '∞', 'calcs: R = 0 gives VSWR ∞, not an error', [await evaluate(`TC.val('zgamma', 'VSWR')`), await evaluate(`TC.msg('zgamma')`)]);

  // reference data
  ok(/11\.2/.test(await evaluate(`[...document.querySelectorAll('#c-ref_subs tr')].find(r => /RO3010/.test(r.textContent)).textContent`)), 'calcs: substrate table shows RO3010 design Dk 11.2');
  for (const [cat, id] of [['noise', 'sens'], ['ant', 'dish'], ['freq', 'mixer']]) await T.shotCard(cat, id);
  await sleep(50);
};

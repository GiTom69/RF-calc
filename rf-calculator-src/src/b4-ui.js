// ============================================================================
// b4-ui.js - phase 2, batch 4 cards: single-stub matching.
// ============================================================================

CUSTOM.stubmatch = function (calc, body) {
  const out = h('div', { class: 'sout' });
  const upd = () => b4StubUpdate();
  const z0 = numField('Line impedance Z₀', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const rl = numField('Load resistance R<sub>L</sub>', 60, { unit: 'ohm', du: 'Ω' }, upd);
  const xl = numField('Load reactance X<sub>L</sub>', -80, { unit: 'ohm', du: 'Ω', blank: 0 }, upd);
  const f = numField('Frequency', 2e9, { unit: 'Hz', du: 'GHz' }, upd);
  const ee = numField('Effective permittivity ε<sub>eff</sub>', 1, { sym: '' }, upd);
  const zs = numField('Stub impedance Z₀,stub', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const type = selectField('Stub type', [
    ['shunt-short', 'Shunt stub, short-circuited'], ['shunt-open', 'Shunt stub, open-circuited'],
    ['series-short', 'Series stub, short-circuited'], ['series-open', 'Series stub, open-circuited']], 'shunt-short', upd);
  const mem = cardMemory('c.stubmatch', { nums: { z0: z0, rl: rl, xl: xl, f: f, ee: ee, zs: zs }, sels: { type: type } });
  mem.restore();
  resetButton(body, () => { mem.reset(); b4StubUpdate(); });

  function b4StubUpdate() {
    out.innerHTML = '';
    mem.save();
    const Z0 = z0.get(), RL = rl.get(), XL = xl.get(), F = f.get(), EE = ee.get(), ZS = zs.get();
    if (!(Z0 > 0 && RL > 0 && F > 0 && EE >= 1 && ZS > 0) || isNaN(XL)) {
      out.append(h('div', { class: 'msg err' }, 'Enter a positive line impedance, load resistance, stub impedance and frequency, and an effective permittivity of at least 1.'));
      return;
    }
    const zl = cx(RL, XL);
    const sols = b4StubMatch(Z0, zl, ZS, type.get());
    const lam = C0 / (F * sqrt(EE));
    if (cabs(zToGamma(zl, Z0)) < 1e-9) out.append(h('div', { class: 'msg info' }, 'The load is already matched; no stub is needed.'));
    if (!sols.length) { out.append(h('div', { class: 'msg err' }, 'No solution found.')); return; }
    const series = type.get().indexOf('series') === 0;
    const len = b => fmt(b / (2 * PI), 4) + ' λ · ' + fmt(b * 180 / PI, 4) + '° · ' + fmtSI(b / (2 * PI) * lam, 'm', 4);
    const shortest = sols.reduce((bi, s, i) => (s.bd + s.bl < sols[bi].bd + sols[bi].bl ? i : bi), 0);
    out.append(gridTable(['#', 'Distance d from the load', 'Stub length ℓ', series ? 'Stub reactance' : 'Stub susceptance', 'Check |Γ| after match'],
      sols.map((s, i) => [String(i + 1) + (i === shortest ? ' <span class="muted">(shortest)</span>' : ''), len(s.bd), len(s.bl),
        series ? fmt(s.stub, 5) + ' Ω' : fmt(s.stub * 1e3, 5) + ' mS', fmt(s.gres < 1e-12 ? 0 : s.gres, 3)])));
    out.append(h('div', { class: 'viz-row' }, smithChart('Load and stub points on the Smith chart', [{ label: 'Load', z: zToGamma(zl, Z0), slot: 1 }]
      .concat(sols.map((s, i) => ({ label: 'At d' + (i + 1), z: s.gd, slot: i + 2 }))))));
    out.append(kvTable([
      ['Wavelength in the line', fmtSI(lam, 'm', 5)],
      ['Normalised load z<sub>L</sub>', fmtC(cscale(zl, 1 / Z0), 5)],
      // b4GammaMag is ≤ 1 for R ≥ 0 even after rounding, so a passive load is never tagged active
      ['Load |Γ| / VSWR', fmt(b4GammaMag(RL, XL, Z0), 5) + ' / ' + vswrTxt(b4GammaMag(RL, XL, Z0))],
    ]));
  }
  body.append(h('p', { class: 'desc' }, 'A stub of length ℓ placed a distance d from the load matches it to Z₀. Both solutions are listed. Any length can be increased by λ/2 without changing the match.'),
    z0.row, rl.row, xl.row, f.row, ee.row, zs.row, type.row, out,
    h('div', { class: 'note', html: 'Pozar §5.2. Shunt stub: choose d so that the line admittance becomes Y₀ + jB, then the stub supplies −jB (open: Y = jY<sub>s</sub>·tan βℓ, short: Y = −jY<sub>s</sub>·cot βℓ). Series stub: the dual, using Z₀ + jX and Z = −jZ<sub>s</sub>·cot βℓ (open) or jZ<sub>s</sub>·tan βℓ (short). Lossless lines, stub and line with the same ε<sub>eff</sub>.' }));
  b4StubUpdate();
};

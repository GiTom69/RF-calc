// ============================================================================
// ui.js - DOM rendering: navigation, solver cards, custom calculators.
// ============================================================================

const STORE = 'rfcalc.v1.';

function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const a = attrs[k];
      if (a == null || a === false) continue;
      if (k === 'class') e.className = a;
      else if (k === 'html') e.innerHTML = a;
      else if (k.startsWith('on') && typeof a === 'function') e.addEventListener(k.slice(2), a);
      else e.setAttribute(k, a === true ? '' : a);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const kids = [].concat(arguments[i]);
    for (const c of kids) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  return e;
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(STORE + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const enc = x => (typeof x === 'number' && !isFinite(x)) ? String(x) : x;
const dec = x => (x === 'NaN' ? NaN : x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x);
function mapObj(o, f) { const r = {}; for (const k in o) r[k] = f(o[k]); return r; }

function copyText(text, btn) {
  // Remember the label once and cancel a pending restore, so quick repeated clicks
  // cannot leave the button reading 'Copied'.
  const done = () => {
    const t = btn.dataset.label || (btn.dataset.label = btn.textContent);
    clearTimeout(btn._copyTimer);
    btn.textContent = 'Copied';
    btn._copyTimer = setTimeout(() => { btn.textContent = t; }, 1200);
  };
  const ta = h('textarea', { style: 'position:fixed;left:-9999px' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
  ta.remove();
}

function unitSelect(unit, value, onchange) {
  const sel = h('select', { class: 'unit', onchange: () => onchange(sel.value), 'aria-label': 'unit' },
    UNITS[unit].map(u => h('option', { value: u[0] }, u[0])));
  sel.value = value;
  return sel;
}

// ============================================================ solver card ===
function renderSolver(calc) {
  prepCalc(calc);
  let st = loadSolverState(calc) || calcInit(calc);
  const rows = {};
  const factor = d => d.unit ? unitFactor(d.unit, st.unit[d.id]) : 1;
  const valText = d => {
    const x = st.vals[d.id];
    if (typeof x !== 'number' || isNaN(x)) return '';
    if (!isFinite(x)) return x > 0 ? '∞' : '-∞';
    return fmt(x / factor(d), 7);
  };
  const labelOf = d => typeof d.label === 'function' ? d.label(st.cfg) : d.label;

  const msgEl = h('div', { class: 'msg' });
  const outEl = h('div', { class: 'outputs' });
  const chartEl = calc.chart ? h('div', { class: 'viz-host' }) : null;
  const fields = h('div', { class: 'fields' });

  let freeShown = false;
  for (const d of calc.vars) {
    const isFree = calc.freeVars.includes(d.id);
    if (isFree && !freeShown) {
      fields.append(h('div', { class: 'fsep' }, calc.freeLabel || 'Extra inputs (used only for the results below)'));
      freeShown = true;
    }
    const inp = h('input', { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off' });
    const badge = h('span', { class: 'badge' });
    const lab = h('label', { class: 'flabel', html: labelOf(d) });
    const unitEl = d.unit
      ? unitSelect(d.unit, st.unit[d.id], u => onUnit(d, u))
      : h('span', { class: 'sym' }, d.sym || '');
    const row = h('div', { class: 'frow' }, lab, h('div', { class: 'fin' }, inp, badge), unitEl);
    inp.addEventListener('input', () => onInput(d, inp));
    inp.addEventListener('blur', () => { normalize(d, inp); refresh(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.blur(); } });
    rows[d.id] = { row: row, inp: inp, badge: badge, lab: lab, free: isFree, bad: null };
    fields.append(row);
  }

  // Input range (core inputMin/inputMax): d.inMin/d.inMax widen the solver range for
  // values that are valid inputs but not useful as a search bracket (e.g. 0 on a log scale).
  const inLo = inputMin, inHi = inputMax;
  const rangeText = d => {
    const u = d.unit ? ' ' + st.unit[d.id] : (d.sym ? ' ' + d.sym : '');
    const lo = inLo(d), hi = inHi(d), f = factor(d);
    const t = x => fmt(x / f, 6) + u;
    if (lo !== undefined && hi !== undefined) return 'from ' + t(lo) + ' to ' + t(hi);
    return lo !== undefined ? '≥ ' + t(lo) : '≤ ' + t(hi);
  };
  // A field holding text that is not used (unreadable or out of range) keeps that
  // text and its red mark until it is edited, cleared, reset or set by a preset.
  function setBad(d, why) {
    const r = rows[d.id];
    r.bad = why ? { why: why } : null;
    r.inp.classList.toggle('bad', !!why);
    r.inp.title = why || '';
  }
  function onInput(d, inp) {
    const txt = inp.value;
    if (txt.trim() === '') {
      setBad(d, null);
      calcEdit(calc, st, d.id, NaN);
      refresh(d.id);
      return;
    }
    const r = parseField(txt, d.unit, st.unit[d.id], d.sym);
    if (isNaN(r.val)) {
      setBad(d, 'Could not read "' + txt.trim() + '" for ' + plainLabel({ label: labelOf(d) }) + '; still using the previous value. Use "." as the decimal point.');
      refresh(d.id);
      return;
    }
    if (!inRange({ min: inLo(d), max: inHi(d), finite: d.finite }, r.val)) {
      setBad(d, plainLabel({ label: labelOf(d) }) + ' is out of range: enter a value ' + rangeText(d) + '. The entry is not used.');
      refresh(d.id);
      return;
    }
    setBad(d, null);
    calcEdit(calc, st, d.id, r.val, txt);
    presetToCustom(d.id, r.val);
    refresh(d.id);
  }
  // Editing a value that a preset selector sets switches that selector to 'Custom',
  // so the card never names a material or size it is not using.
  function presetToCustom(id, val) {
    for (const c of (calc.cfg || [])) {
      if (!c.set || st.cfg[c.id] === 'custom' || !c.options.some(o => o[0] === 'custom')) continue;
      let p = null;
      try { p = c.set(st.cfg[c.id]); } catch (e) { p = null; }
      if (!p || !(id in p)) continue;
      // an infinite preset value (e.g. ar = ∞ for linear) matches only ∞ itself
      const same = p[id] === val || (isFinite(p[id]) && Math.abs(val - p[id]) <= 1e-9 * Math.abs(p[id]));
      if (!same) st.cfg[c.id] = 'custom';
    }
  }
  // After typing "2.4 GHz" or "4n7": switch the unit selector and show the plain number.
  function normalize(d, inp) {
    if (st.status[d.id] !== 'in' || rows[d.id].bad || isPlainNumber(inp.value)) return;
    const r = parseField(inp.value, d.unit, st.unit[d.id], d.sym);
    if (isNaN(r.val)) return;
    if (r.unit && d.unit) {
      st.unit[d.id] = r.unit;
      const sel = rows[d.id].row.querySelector('select.unit');
      if (sel) sel.value = r.unit;
    }
    st.text[d.id] = null;
  }
  // Changing a unit converts the display. The value itself stays the same.
  function onUnit(d, u) {
    st.unit[d.id] = u;
    // the stored text belongs to the old unit; the value is shown again in the new one
    st.text[d.id] = null;
    // pending unused text: read it again in the new unit
    if (rows[d.id].bad) { onInput(d, rows[d.id].inp); return; }
    refresh();
  }
  const clearBad = ids => { for (const id of ids) if (rows[id]) setBad(calc.byId[id], null); };

  const cfgEls = [];
  const cfgBox = (calc.cfg || []).length ? h('div', { class: 'cfg' }) : null;
  for (const c of (calc.cfg || [])) {
    const sel = h('select', {}, c.options.map(o => h('option', { value: o[0] }, o[1])));
    sel.value = st.cfg[c.id];
    sel.addEventListener('change', () => {
      st.cfg[c.id] = sel.value;
      if (c.set) { const p = c.set(sel.value); clearBad(Object.keys(p || {})); calcSetMany(calc, st, p); }
      else calcSolve(calc, st);
      refresh();
    });
    cfgEls.push([c, sel]);
    cfgBox.append(h('label', { class: 'cfgrow' }, h('span', {}, c.label), sel));
  }

  function refresh(skipId) {
    for (const d of calc.vars) {
      const r = rows[d.id];
      const s = st.status[d.id];
      r.row.className = 'frow ' + s + (r.free ? ' free' : '');
      r.badge.textContent = s === 'calc' ? '=' : s === 'err' ? '!' : '';
      r.badge.title = s === 'calc' ? 'Calculated. Type here to make it an input.' : s === 'err' ? 'No valid solution' : '';
      if (typeof d.label === 'function') r.lab.innerHTML = labelOf(d);
      if (d.id !== skipId && document.activeElement !== r.inp && !r.bad) {
        r.inp.value = (s === 'in' && st.text[d.id] != null) ? st.text[d.id] : valText(d);
        r.inp.classList.remove('bad');
      }
      r.inp.placeholder = s === 'empty' ? (r.free ? 'optional' : 'blank: will be calculated') : '';
    }
    for (const [c, sel] of cfgEls) sel.value = st.cfg[c.id];
    // outputs
    outEl.innerHTML = '';
    const v = calcValues(calc, st);
    for (const o of (calc.outputs || [])) {
      let val;
      try { val = o.fn(v); } catch (e) { val = NaN; }
      let txt;
      if (typeof val === 'string') txt = val;
      else if (typeof val !== 'number' || isNaN(val)) txt = '—';
      else txt = o.si ? fmtSI(val, o.unit) : fmt(val, 6) + (o.unit ? ' ' + o.unit : '');
      outEl.append(h('div', { class: 'orow' }, h('span', { class: 'olabel', html: o.label }), h('span', { class: 'oval' }, txt)));
    }
    outEl.style.display = (calc.outputs || []).length ? '' : 'none';
    if (chartEl) {
      let ch = null;
      try { ch = calc.chart(v); } catch (e) { ch = null; }
      chartEl.replaceChildren(...(ch ? [ch] : []));
    }
    let warn = null;
    if (calc.warn) { try { warn = calc.warn(v); } catch (e) { warn = null; } }
    // Unused entries first, then the calculator's own warning (it usually explains
    // a solver failure), then the solver message. None of them hides another.
    const bads = calc.vars.filter(d => rows[d.id].bad).map(d => rows[d.id].bad.why);
    msgEl.textContent = bads.concat([warn, st.msg].filter(Boolean)).join(' ');
    msgEl.className = 'msg ' + (bads.length || (st.msg && st.msgLevel === 'err') ? 'err' : warn ? 'warn' : (st.msgLevel || ''));
    saveSolverState(calc, st);
  }

  const btnClear = h('button', { class: 'btn', title: 'Clear all values (keeps fixed settings such as Z₀ or T₀)' }, 'Clear');
  btnClear.addEventListener('click', () => {
    for (const d of calc.vars) {
      if (d.sticky) continue;
      st.status[d.id] = 'empty'; st.vals[d.id] = NaN; st.text[d.id] = null;
      setBad(d, null);
    }
    calcSolve(calc, st);
    refresh();
  });
  const btnReset = h('button', { class: 'btn', title: 'Restore the example values' }, 'Reset');
  btnReset.addEventListener('click', () => {
    st = calcInit(calc);
    for (const d of calc.vars) {
      const r = rows[d.id];
      setBad(d, null);
      const sel = r.row.querySelector('select.unit');
      if (sel) sel.value = st.unit[d.id];
    }
    refresh();
  });
  const btnCopy = h('button', { class: 'btn', title: 'Copy all values as text' }, 'Copy');
  btnCopy.addEventListener('click', () => {
    const lines = [calc.title];
    for (const d of calc.vars) {
      const u = d.unit ? st.unit[d.id] : (d.sym || '');
      lines.push(plainLabel({ label: labelOf(d) }) + ': ' + (valText(d) || '—') + ' ' + u + (st.status[d.id] === 'calc' ? '  (calculated)' : ''));
    }
    outEl.querySelectorAll('.orow').forEach(r => lines.push(r.children[0].textContent + ': ' + r.children[1].textContent));
    copyText(lines.join('\n'), btnCopy);
  });

  const card = cardShell(calc, [btnCopy, btnClear, btnReset]);
  card.body.append(...[
    calc.desc ? h('p', { class: 'desc' }, calc.desc) : null,
    cfgBox, fields, msgEl, chartEl, outEl,
    calc.note ? h('div', { class: 'note', html: calc.note }) : null].filter(Boolean));
  refresh();
  return card.el;
}

function saveSolverState(calc, st) {
  store.set('s.' + calc.id, {
    vals: mapObj(st.vals, enc), status: st.status, t: st.t, unit: st.unit, text: st.text, cfg: st.cfg, clock: st.clock,
  });
}
function loadSolverState(calc) {
  const o = store.get('s.' + calc.id);
  if (!o || !o.vals || !o.status) return null;
  const st = calcInit(calc);
  for (const d of calc.vars) {
    if (!(d.id in o.status)) return null;
    st.vals[d.id] = dec(o.vals[d.id]);
    st.status[d.id] = o.status[d.id];
    st.t[d.id] = o.t[d.id] || 0;
    if (d.unit && o.unit && UNITS[d.unit].some(u => u[0] === o.unit[d.id])) st.unit[d.id] = o.unit[d.id];
    st.text[d.id] = o.text ? o.text[d.id] : null;
  }
  for (const c of (calc.cfg || [])) if (o.cfg && c.options.some(x => x[0] === o.cfg[c.id])) st.cfg[c.id] = o.cfg[c.id];
  st.clock = o.clock || 1;
  for (const d of calc.vars) if (st.status[d.id] === 'in' && isNaN(st.vals[d.id])) st.status[d.id] = 'empty';
  calcSolve(calc, st);
  return st;
}

function cardShell(calc, buttons) {
  const body = h('div', { class: 'card-body' });
  const el = h('section', { class: 'card' + (calc.wide ? ' wide' : ''), id: 'c-' + calc.id },
    h('div', { class: 'card-head' }, h('h3', {}, calc.title), h('div', { class: 'card-btns' }, buttons || [])),
    body);
  return { el: el, body: body };
}

// ================================================= custom calc helpers =====
// Simple numeric input row for the forward calculators.
function numField(label, def, opts, onchange) {
  opts = opts || {};
  let unit = opts.du || null;
  const fac = () => opts.unit ? unitFactor(opts.unit, unit) : 1;
  const inp = h('input', { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off' });
  inp.value = (def === '' || def == null) ? '' : fmt(def / fac(), 7);
  const parse = () => parseField(inp.value, opts.unit, unit, opts.sym);
  const unitEl = opts.unit
    ? unitSelect(opts.unit, unit, u => {
        const base = parse().val;
        unit = u;
        if (!isNaN(base)) inp.value = fmt(base / fac(), 7);
        onchange();
      })
    : h('span', { class: 'sym' }, opts.sym || '');
  inp.addEventListener('input', () => {
    inp.classList.toggle('bad', inp.value.trim() !== '' && isNaN(parse().val));
    onchange();
  });
  inp.addEventListener('blur', () => {
    if (isPlainNumber(inp.value)) return;
    const r = parse();
    if (isNaN(r.val)) return;
    if (r.unit && opts.unit) { unit = r.unit; unitEl.value = r.unit; }
    inp.value = fmt(r.val / fac(), 7);
  });
  const row = h('div', { class: 'frow in' }, h('label', { class: 'flabel', html: label }), h('div', { class: 'fin' }, inp), unitEl);
  return {
    row: row, inp: inp,
    get: () => { if (inp.value.trim() === '') return opts.blank !== undefined ? opts.blank : NaN; return parse().val; },
    set: x => { inp.value = isFinite(x) ? fmt(x / fac(), 7) : ''; },
  };
}
function selectField(label, options, def, onchange) {
  const sel = h('select', {}, options.map(o => h('option', { value: o[0] }, o[1])));
  sel.value = def;
  sel.addEventListener('change', onchange);
  return { row: h('label', { class: 'cfgrow' }, h('span', { html: label }), sel), sel: sel, get: () => sel.value };
}
function kvTable(rows) {
  return h('table', { class: 'kv' }, h('tbody', {}, rows.filter(Boolean).map(r =>
    h('tr', { class: r[2] || '' }, h('th', { html: r[0] }), typeof r[1] === 'string' ? h('td', { html: r[1] }) : h('td', {}, r[1])))));
}
function gridTable(head, rows, cls) {
  return h('table', { class: 'grid ' + (cls || '') },
    h('thead', {}, h('tr', {}, head.map(x => h('th', { html: x })))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map(x => h('td', { html: String(x) }))))));
}
function section(title, content) {
  return h('div', { class: 'sect' }, h('h4', {}, title), content);
}
const clean = x => (typeof x === 'number' && Math.abs(x) < 1e-9) ? 0 : x;
const yesNo = (ok, yes, no) => h('span', { class: ok ? 'good' : 'bad-t' }, ok ? (yes || 'Yes') : (no || 'No'));
// |S| within round-off of 1 (lossless or renormalised networks) displays as exactly 1
const snap1 = magSnap;   // rf.js: |S| within double round-off of 1 displays as exactly 1
const dB20 = z => { const m = cabs(z); return m === 0 ? '-∞' : fmt(dbv(snap1(m)), 5); };
const fmtZ = (z, unit) => fmtC(z, 5, unit);
// VSWR of a reflection magnitude; |Γ| > 1 (reflection gain) shows ∞ with a note.
// |Γ| of a lossless passive termination can round to 1 + 2e-16: only flag a clear excess
const vswrTxt = g => fmt(vswrOf(snap1(g)), 5) + (g > 1 + 1e-9 ? ' (|Γ| > 1, active)' : '');

// Complex S-matrix input with dB/angle, mag/angle or re/im entry.
function matrixInput(n, onchange) {
  let S = Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0)));
  let mode = 'db';
  const cells = [];
  const modeSel = h('select', {}, [['db', 'dB ∠ deg'], ['lin', 'Magnitude ∠ deg'], ['ri', 'Re + j·Im']].map(o => h('option', { value: o[0] }, o[1])));
  const unitA = () => mode === 'db' ? 'dB' : mode === 'lin' ? '|S|' : 'Re';
  const unitB = () => mode === 'ri' ? 'Im' : '°';
  const table = h('table', { class: 'mtx' });
  const thead = h('tr', {}, h('th', {}, ''));
  for (let j = 0; j < n; j++) thead.append(h('th', {}, 'from port ' + (j + 1)));
  table.append(h('thead', {}, thead));
  const tb = h('tbody');
  for (let i = 0; i < n; i++) {
    const tr = h('tr', {}, h('th', {}, 'to port ' + (i + 1)));
    cells.push([]);
    for (let j = 0; j < n; j++) {
      const a = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', inputmode: 'decimal' });
      const b = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', inputmode: 'decimal' });
      const ua = h('span', { class: 'mu' }), ub = h('span', { class: 'mu' });
      const read = () => {
        const ta = a.value.trim(), tb2 = b.value.trim();
        let x = ta === '' ? (mode === 'db' ? -Infinity : 0) : parseNum(ta);
        const y = tb2 === '' ? 0 : parseNum(tb2);
        a.classList.toggle('bad', isNaN(x));
        b.classList.toggle('bad', isNaN(y));
        if (isNaN(x) || isNaN(y)) return;
        if (mode === 'db') S[i][j] = cpol(x === -Infinity ? 0 : fromDbv(x), y);
        else if (mode === 'lin') S[i][j] = cpol(x, y);
        else S[i][j] = cx(x, y);
        onchange();
      };
      a.addEventListener('input', read);
      b.addEventListener('input', read);
      cells[i].push({ a: a, b: b, ua: ua, ub: ub });
      tr.append(h('td', {}, h('div', { class: 'mcell' }, h('span', { class: 'sname' }, 'S' + (i + 1) + (j + 1)),
        h('div', { class: 'mpair' }, a, ua), h('div', { class: 'mpair' }, b, ub))));
    }
    tb.append(tr);
  }
  table.append(tb);
  function write() {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = cells[i][j], s = S[i][j], m = cabs(s);
      if (mode === 'db') { c.a.value = m === 0 ? '-inf' : fmt(dbv(snap1(m)), 6); c.b.value = m === 0 ? '0' : fmt(cdeg(s), 6); }
      else if (mode === 'lin') { c.a.value = fmt(m, 6); c.b.value = m === 0 ? '0' : fmt(cdeg(s), 6); }
      else { c.a.value = fmt(s.re, 6); c.b.value = fmt(s.im, 6); }
      c.ua.textContent = unitA(); c.ub.textContent = unitB();
      c.a.classList.remove('bad'); c.b.classList.remove('bad');
    }
  }
  modeSel.addEventListener('change', () => { mode = modeSel.value; write(); });
  write();
  return {
    el: h('div', { class: 'mwrap' }, h('label', { class: 'cfgrow' }, h('span', {}, 'Entry format'), modeSel), table),
    get: () => S,
    set: M => { S = M.map(r => r.map(z => cx(z.re, z.im))); write(); },
  };
}
// "Load example" selector: keeps showing the example that is loaded. Editing any
// matrix cell switches it to "Custom values", so the same example can be re-applied.
function presetPicker(presets, mi, onload) {
  const pick = selectField('Load example', [['', 'Custom values']].concat(presets.map(p => [p[0], p[1]])), presets[0][0], () => {
    const p = presets.find(x => x[0] === pick.get());
    if (p) { mi.set(p[2]); onload(); }
  });
  mi.set(presets[0][2]);
  return pick;
}
// Remember a custom card's inputs (S-matrix, example selector, number fields with
// their units, selects) in browser storage. reset() restores the initial values.
function cardMemory(key, parts) {
  const snap = () => ({
    S: parts.mi ? parts.mi.get().map(r => r.map(z => [z.re, z.im])) : null,
    preset: parts.preset ? parts.preset.sel.value : '',
    nums: mapObj(parts.nums || {}, f => { const u = f.row.querySelector('select.unit'); return { t: f.inp.value, u: u ? u.value : null }; }),
    sels: mapObj(parts.sels || {}, f => f.sel.value),
  });
  const apply = o => {
    if (!o) return;
    if (o.S && parts.mi && o.S.length === parts.mi.get().length) parts.mi.set(o.S.map(r => r.map(z => cx(z[0], z[1]))));
    if (parts.preset && typeof o.preset === 'string') parts.preset.sel.value = o.preset;
    for (const k in (parts.nums || {})) {
      const v = o.nums && o.nums[k];
      if (!v) continue;
      const u = parts.nums[k].row.querySelector('select.unit');
      if (u && v.u && u.value !== v.u) { u.value = v.u; u.dispatchEvent(new Event('change')); }
      parts.nums[k].inp.value = v.t;
    }
    for (const k in (parts.sels || {})) if (o.sels && o.sels[k] != null) parts.sels[k].sel.value = o.sels[k];
  };
  const initial = snap();
  return {
    restore: () => { try { apply(store.get(key)); } catch (e) { /* stale data: keep defaults */ } },
    save: () => store.set(key, snap()),
    reset: () => { apply(initial); store.set(key, null); },
  };
}
function resetButton(body, onReset) {
  const b = h('button', { class: 'btn', title: 'Restore the example values' }, 'Reset');
  b.addEventListener('click', onReset);
  const btns = body.parentNode && body.parentNode.querySelector('.card-btns');
  if (btns) btns.append(b);
}
const P = (m, deg) => cpol(m, deg);
const D = (db, deg) => cpol(fromDbv(db), deg);

function matText(M, unit, scale) {
  if (!M) return h('div', { class: 'muted' }, 'Singular: does not exist for this network.');
  const n = M.length;
  const head = [''].concat(Array.from({ length: n }, (_, j) => 'col ' + (j + 1)));
  // entries far below the matrix scale are floating-point residue
  const tiny = 1e-12 * mMaxAbs(M);
  const tidy = z => cx(Math.abs(z.re) < tiny ? 0 : z.re, Math.abs(z.im) < tiny ? 0 : z.im);
  return gridTable(head, M.map((r, i) => ['row ' + (i + 1)].concat(r.map(z => fmtC(cscale(tidy(z), scale || 1), 4, unit)))), 'mono');
}

// ============================================================ S 2-port =====
const CUSTOM = {};
const CUSTOM_API = {};

const S2_PRESETS = [
  ['pozar', 'Pozar Ex. 12.3: GaAs FET at 4 GHz', [[P(0.72, -116), P(0.03, 57)], [P(2.60, 76), P(0.73, -54)]]],
  ['unstable', 'Potentially unstable transistor (example)', [[P(0.894, -60.6), P(0.020, 62.4)], [P(3.122, 123.6), P(0.781, -27.6)]]],
  ['thru', 'Ideal through', [[cx(0), cx(1)], [cx(1), cx(0)]]],
  ['att3', '3 dB matched attenuator', [[cx(0), cx(fromDbv(-3))], [cx(fromDbv(-3)), cx(0)]]],
  ['iso', 'Ideal isolator', [[cx(0), cx(0)], [cx(1), cx(0)]]],
  ['ser25', 'Series 25 Ω resistor (Z₀ = 50 Ω)', [[cx(0.2), cx(0.8)], [cx(0.8), cx(0.2)]]],
  ['line45', 'Matched line, 45° long', [[cx(0), P(1, -45)], [P(1, -45), cx(0)]]],
];

CUSTOM.s2 = function (calc, body) {
  calc.wide = true;
  const out = h('div', { class: 'sout' });
  const upd = () => update();
  const z0 = numField('Reference impedance Z₀', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const mi = matrixInput(2, () => { preset.sel.value = ''; update(); });
  const preset = presetPicker(S2_PRESETS, mi, upd);
  const zsR = numField('Source impedance R<sub>S</sub>', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const zsX = numField('Source reactance X<sub>S</sub>', 0, { unit: 'ohm', du: 'Ω', blank: 0 }, upd);
  const zlR = numField('Load impedance R<sub>L</sub>', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const zlX = numField('Load reactance X<sub>L</sub>', 0, { unit: 'ohm', du: 'Ω', blank: 0 }, upd);
  const mem = cardMemory('c.s2', { mi: mi, preset: preset, nums: { z0: z0, zsR: zsR, zsX: zsX, zlR: zlR, zlX: zlX } });
  mem.restore();
  resetButton(body, () => { mem.reset(); update(); });

  function update() {
    out.innerHTML = '';
    mem.save();
    const S = mi.get(), Z0 = z0.get();
    // check the raw entries: an unreadable reactance must not turn into X = 0
    const raw = [zsR.get(), zsX.get(), zlR.get(), zlX.get()];
    if (!(Z0 > 0) || raw.some(isNaN)) { out.append(h('div', { class: 'msg err' }, 'Enter valid impedances.')); return; }
    const zs = cx(raw[0], raw[1]), zl = cx(raw[2], raw[3]);
    const r = s2Analyze(S, Z0, zs, zl);
    // Passive (largest eigenvalue of SᴴS ≤ 1): stable with any passive terminations,
    // even where K and μ round to just below 1 (ideal through, lossless line, series R).
    const SHS = mMul(mH(S), S), ha = SHS[0][0].re, hd = SHS[1][1].re;
    const passive = (ha + hd) / 2 + sqrt(Math.pow((ha - hd) / 2, 2) + cabs2(SHS[0][1])) <= 1 + 1e-9;
    const names = [['S11', 0, 0], ['S21', 1, 0], ['S12', 0, 1], ['S22', 1, 1]];
    out.append(sChartsRow(S, [{ label: 'S21', z: S[1][0], slot: 1 }, { label: 'S12', z: S[0][1], slot: 2 }],
      cabs(S[0][1]) < 0.03 * cabs(S[1][0]) ? 'S12 is too small to see on this scale. Its value is in the legend and the table.' : null));
    out.append(section('Parameters', gridTable(['', 'dB', '|S|', '∠ deg', 'Re', 'Im'],
      names.map(([n, i, j]) => { const s = S[i][j]; return [n, dB20(s), fmt(cabs(s), 5), fmt(cdeg(s), 5), fmt(s.re, 5), fmt(s.im, 5)]; }))));
    const a11 = cabs(S[0][0]), a22 = cabs(S[1][1]);
    out.append(section('Port metrics (matched Z₀ terminations)', kvTable([
      ['Input return loss / VSWR', fmt(-dbv(snap1(a11)), 5) + ' dB / ' + vswrTxt(a11)],
      ['Output return loss / VSWR', fmt(-dbv(snap1(a22)), 5) + ' dB / ' + vswrTxt(a22)],
      ['Forward gain |S21|²', dB20(S[1][0]) + ' dB'],
      ['Reverse isolation', fmt(-dbMag(cabs(S[0][1])), 5) + ' dB'],
    ])));
    out.append(section('Stability', kvTable([
      ['Δ = S11·S22 − S12·S21', fmtP(r.delta, 5)],
      ['Rollett factor K', fmt(r.K, 5)],
      ['μ (source side) / μ′ (load side)', fmt(r.mu, 5) + ' / ' + fmt(r.mu2, 5)],
      ['Verdict', r.mu > 1 + 1e-9 ? yesNo(true, 'Unconditionally stable (μ > 1)')
        : passive ? yesNo(true, 'Unconditionally stable: passive network (SᴴS ≤ I)' + (isFinite(r.mu) ? ', on the μ = 1 boundary' : ''))
        : yesNo(false, '', 'Potentially unstable (μ ≤ 1)')],
    ])));
    // power-wave reflection at the source: |Γ| = |(Z_in − Z_S*)/(Z_in + Z_S)| (Kurokawa)
    const gsrc = cabs(cdiv(csub(r.zin, cconj(zs)), cadd(r.zin, zs)));
    out.append(section('With the source and load terminations above', kvTable([
      ['Γ<sub>S</sub> / Γ<sub>L</sub>', fmtP(r.gs) + '  /  ' + fmtP(r.gl)],
      ['Γ<sub>in</sub> = S11 + S12·S21·Γ<sub>L</sub>/(1 − S22·Γ<sub>L</sub>)', fmtP(r.gin, 5)],
      ['Γ<sub>out</sub>', fmtP(r.gout, 5)],
      ['Z<sub>in</sub>', fmtZ(r.zin, 'Ω')],
      ['Z<sub>out</sub>', fmtZ(r.zout, 'Ω')],
      ['Input VSWR (ref. Z₀)', vswrTxt(cabs(r.gin))],
      ['Mismatch VSWR seen by the source Z<sub>S</sub>', vswrTxt(gsrc)],
      ['Transducer gain G<sub>T</sub>', fmt(dbp(r.GT), 5) + ' dB'],
      ['Operating (power) gain G<sub>P</sub>', fmt(dbp(r.GP), 5) + ' dB'],
      ['Available gain G<sub>A</sub>', fmt(dbp(r.GA), 5) + ' dB'],
    ])));
    const gainRows = [
      ['Maximum stable gain MSG = |S21|/|S12|', fmt(dbp(r.MSG), 5) + ' dB' + (cabs(S[0][1]) === 0 ? ' (S12 = 0)' : '')],
      ['Maximum available gain MAG' + (cabs(S[0][1]) === 0 ? ' (unilateral: G<sub>TU,max</sub>)' : ''),
        isFinite(r.MAG) ? fmt(dbp(r.MAG), 5) + ' dB' : '— (needs K ≥ 1 and |Δ| < 1; see MSG)'],
      ['Unilateral figure of merit U', fmt(r.U, 5)],
      ['G<sub>T</sub>/G<sub>TU</sub> error bounds', isFinite(r.U) && r.U < 1 ? fmt(dbp(1 / Math.pow(1 + r.U, 2)), 4) + ' … +' + fmt(dbp(1 / Math.pow(1 - r.U, 2)), 4) + ' dB' : '—'],
    ];
    if (r.match && r.uncond) {
      gainRows.push(['Simultaneous conjugate match Γ<sub>S</sub>', fmtP(r.match.gs, 5) + '   →   Z<sub>S</sub> = ' + fmtZ(r.match.zs, 'Ω')]);
      gainRows.push(['Simultaneous conjugate match Γ<sub>L</sub>', fmtP(r.match.gl, 5) + '   →   Z<sub>L</sub> = ' + fmtZ(r.match.zl, 'Ω')]);
    } else {
      gainRows.push(['Simultaneous conjugate match', 'Not possible (needs K > 1 and |Δ| < 1)']);
    }
    out.append(section('Maximum gain', kvTable(gainRows)));
    out.append(section('Network checks', kvTable([
      ['Reciprocal (S12 = S21)?', h('span', {}, yesNo(r.recip < 1e-6), '  max |S12 − S21| = ' + fmt(clean(r.recip), 3))],
      ['Lossless (SᴴS = I)?', h('span', {}, yesNo(r.lossless < 1e-6), '  max deviation = ' + fmt(clean(r.lossless), 3))],
      ['Dissipated, port 1 driven: 1 − |S11|² − |S21|²', fmt(clean(100 * r.diss1), 5) + ' %' + (r.diss1 < -1e-9 ? '  (active)' : '')],
      ['Dissipated, port 2 driven: 1 − |S12|² − |S22|²', fmt(clean(100 * r.diss2), 5) + ' %' + (r.diss2 < -1e-9 ? '  (active)' : '')],
    ])));
    const conv = h('div', { class: 'convs' },
      section('Z-parameters (Ω)', matText(sToZ(S, Z0))),
      section('Y-parameters (mS)', matText(sToY(S, Z0), '', 1e3)),
      section('ABCD (A, D: no unit · B: Ω · C: S)', cabs(S[1][0]) > 0 ? matText(sToABCD(S, Z0)) : h('div', { class: 'muted' }, 'Undefined when S21 = 0.')),
      section('T (transfer): [b₁ a₁]ᵀ = T·[a₂ b₂]ᵀ', cabs(S[1][0]) > 0 ? matText(sToT(S)) : h('div', { class: 'muted' }, 'Undefined when S21 = 0.')));
    out.append(conv);
  }
  CUSTOM_API.s2 = {
    load: (S, Z0) => { mi.set(S); preset.sel.value = ''; if (Z0) z0.set(Z0); update(); document.getElementById('c-s2').scrollIntoView({ behavior: 'smooth' }); },
  };
  body.append(
    h('p', { class: 'desc' }, 'Full complex analysis: stability, gains, input/output reflection with any terminations, network checks and conversion to Z, Y, ABCD and T parameters.'),
    h('div', { class: 'cols' },
      h('div', {}, z0.row, preset.row, mi.el),
      h('div', {}, h('div', { class: 'fsep' }, 'Terminations (for Γin, Γout, GT, GP, GA)'), zsR.row, zsX.row, zlR.row, zlX.row)),
    out);
  update();
};

// ============================================================ S 3-port =====
const r2 = 1 / Math.SQRT2;
const S3_PRESETS = [
  ['wilk', 'Ideal Wilkinson divider', [[cx(0), cx(0, -r2), cx(0, -r2)], [cx(0, -r2), cx(0), cx(0)], [cx(0, -r2), cx(0), cx(0)]]],
  ['res', 'Resistive splitter (3 × Z₀/3, star)', [[cx(0), cx(0.5), cx(0.5)], [cx(0.5), cx(0), cx(0.5)], [cx(0.5), cx(0.5), cx(0)]]],
  ['hyb', '90° hybrid, isolated port terminated', [[cx(0), cx(0, -r2), cx(-r2)], [cx(0, -r2), cx(0), cx(0)], [cx(-r2), cx(0), cx(0)]]],
  ['tee', 'Lossless T-junction (all ports Z₀)', [[cx(-1 / 3), cx(2 / 3), cx(2 / 3)], [cx(2 / 3), cx(-1 / 3), cx(2 / 3)], [cx(2 / 3), cx(2 / 3), cx(-1 / 3)]]],
  ['circ', 'Ideal circulator 1 → 2 → 3 → 1', [[cx(0), cx(0), cx(1)], [cx(1), cx(0), cx(0)], [cx(0), cx(1), cx(0)]]],
  ['cpl', '10 dB directional coupler (isolated port terminated)', [[cx(0), cx(sqrt(0.9)), cx(0, sqrt(0.1))], [cx(sqrt(0.9)), cx(0), cx(0)], [cx(0, sqrt(0.1)), cx(0), cx(0)]]],
];

CUSTOM.s3 = function (calc, body) {
  calc.wide = true;
  const out = h('div', { class: 'sout' });
  const upd = () => update();
  const z0 = numField('Reference impedance Z₀', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const mi = matrixInput(3, () => { preset.sel.value = ''; update(); });
  const preset = presetPicker(S3_PRESETS, mi, upd);
  const ports = [['1', 'Port 1'], ['2', 'Port 2'], ['3', 'Port 3']];
  const pIn = selectField('Input port', ports, '1', upd);
  const pA = selectField('Output A (through)', ports, '2', upd);
  const pB = selectField('Output B (coupled)', ports, '3', upd);
  const pT = selectField('Terminate port', ports, '3', upd);
  const tR = numField('Termination R', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const tX = numField('Termination X', 0, { unit: 'ohm', du: 'Ω', blank: 0 }, upd);
  const mem = cardMemory('c.s3', { mi: mi, preset: preset, nums: { z0: z0, tR: tR, tX: tX }, sels: { pIn: pIn, pA: pA, pB: pB, pT: pT } });
  mem.restore();
  resetButton(body, () => { mem.reset(); update(); });

  function update() {
    out.innerHTML = '';
    mem.save();
    const S = mi.get(), Z0 = z0.get();
    if (!(Z0 > 0)) { out.append(h('div', { class: 'msg err' }, 'Enter a valid Z₀.')); return; }
    {
      let p = +pIn.get() - 1, a = +pA.get() - 1, b = +pB.get() - 1;
      if (p === a || p === b || a === b) { p = 0; a = 1; b = 2; }
      const za = S[a][p], zb = S[b][p];
      const dph = ((cdeg(za) - cdeg(zb) + 540) % 360) - 180;
      out.append(sChartsRow(S, [
        { label: 'S' + (a + 1) + (p + 1), z: za, slot: 1 }, { label: 'S' + (b + 1) + (p + 1), z: zb, slot: 2 }],
        'Driven from port ' + (p + 1) + ' (see Port roles). Phase difference ∠S' + (a + 1) + (p + 1) + ' − ∠S' + (b + 1) + (p + 1) + ' = ' +
        fmt(cabs(za) > 0 && cabs(zb) > 0 ? clean(dph) : NaN, 4) + '°.'));
    }
    const head = ['|S| dB ∠°'].concat([1, 2, 3].map(j => 'from port ' + j));
    out.append(section('Matrix overview', gridTable(head, S.map((row, i) => ['to port ' + (i + 1)].concat(row.map(z => dB20(z) + ' dB ∠ ' + fmt(cdeg(z), 4) + '°'))))));
    const portRows = [0, 1, 2].map(j => {
      const sum = S.reduce((s, row) => s + cabs2(row[j]), 0);
      const g = cabs(S[j][j]);
      return ['Port ' + (j + 1), fmt(-dbv(snap1(g)), 5) + ' dB', vswrTxt(g), fmt(clean(100 * sum), 5) + ' %', fmt(clean(100 * (1 - sum)), 5) + ' %'];
    });
    out.append(section('Per port (that port driven, the others matched)', gridTable(['', 'Return loss', 'VSWR', 'Σ|S<sub>ij</sub>|² out', 'Dissipated'], portRows)));
    let rec = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rec = Math.max(rec, cabs(csub(S[i][j], S[j][i])));
    const lossless = mMaxAbs(mSub(mMul(mH(S), S), mEye(3)));
    const matched = Math.max(cabs(S[0][0]), cabs(S[1][1]), cabs(S[2][2]));
    out.append(section('Network checks', kvTable([
      ['Reciprocal (S = Sᵀ)?', h('span', {}, yesNo(rec < 1e-6), h('span', { html: '  max |S<sub>ij</sub> − S<sub>ji</sub>| = ' + fmt(clean(rec), 3) }))],
      ['Lossless (SᴴS = I)?', h('span', {}, yesNo(lossless < 1e-6), '  max deviation = ' + fmt(clean(lossless), 3))],
      ['All ports matched?', h('span', {}, yesNo(matched < 1e-6), h('span', { html: '  worst |S<sub>ii</sub>| = ' + fmt(clean(matched), 3) }))],
      ['Note', 'A 3-port cannot be lossless, reciprocal and matched at all ports at the same time.'],
    ])));
    const p = +pIn.get() - 1, a = +pA.get() - 1, b = +pB.get() - 1;
    if (p === a || p === b || a === b) {
      out.append(section('Port roles', h('div', { class: 'msg err' }, 'Choose three different ports.')));
    } else {
      const sa = S[a][p], sb = S[b][p];
      const ph = ((cdeg(sa) - cdeg(sb) + 540) % 360) - 180;
      const pp = 'P' + (p + 1), pa = 'P' + (a + 1), pb = 'P' + (b + 1);
      out.append(h('div', { class: 'convs' },
        section('Divider / splitter view', kvTable([
          ['Insertion loss ' + pp + ' → ' + pa, fmt(-dbMag(cabs(sa)), 5) + ' dB'],
          ['Insertion loss ' + pp + ' → ' + pb, fmt(-dbMag(cabs(sb)), 5) + ' dB'],
          ['Amplitude imbalance', fmt(clean(dbMag(cabs(sa)) - dbMag(cabs(sb))), 5) + ' dB'],
          ['Phase imbalance (∠' + pa + ' − ∠' + pb + ')', fmt(cabs(sa) > 0 && cabs(sb) > 0 ? clean(ph) : NaN, 5) + '°'],
          ['Excess loss −10·log(|S<sub>A</sub>|² + |S<sub>B</sub>|²)', fmt(clean(-dbp(cabs2(sa) + cabs2(sb))), 5) + ' dB'],
          ['Output isolation ' + pa + ' → ' + pb, fmt(-dbMag(cabs(S[b][a])), 5) + ' dB'],
          ['Output isolation ' + pb + ' → ' + pa, fmt(-dbMag(cabs(S[a][b])), 5) + ' dB'],
        ])),
        section('Directional coupler view (A = through, B = coupled)', kvTable([
          ['Coupling C', fmt(-dbMag(cabs(sb)), 5) + ' dB'],
          ['Through loss', fmt(-dbMag(cabs(sa)), 5) + ' dB'],
          ['Isolation I (' + pa + ' → ' + pb + ')', fmt(-dbMag(cabs(S[b][a])), 5) + ' dB'],
          ['Directivity D = I − C', fmt(-dbMag(cabs(S[b][a])) + dbMag(cabs(sb)), 5) + ' dB'],
        ])),
        section('Circulator view (' + pp + ' → ' + pa + ' → ' + pb + ' → ' + pp + ')', kvTable([
          ['Forward IL ' + pp + ' → ' + pa, fmt(-dbMag(cabs(S[a][p])), 5) + ' dB'],
          ['Forward IL ' + pa + ' → ' + pb, fmt(-dbMag(cabs(S[b][a])), 5) + ' dB'],
          ['Forward IL ' + pb + ' → ' + pp, fmt(-dbMag(cabs(S[p][b])), 5) + ' dB'],
          ['Isolation ' + pa + ' → ' + pp, fmt(-dbMag(cabs(S[p][a])), 5) + ' dB'],
          ['Isolation ' + pb + ' → ' + pa, fmt(-dbMag(cabs(S[a][b])), 5) + ' dB'],
          ['Isolation ' + pp + ' → ' + pb, fmt(-dbMag(cabs(S[b][p])), 5) + ' dB'],
        ]))));
    }
    // reduce to a 2-port
    const k = +pT.get() - 1;
    const tRe = tR.get(), tIm = tX.get();
    const zt = cx(tRe, tIm);
    if (![tRe, tIm].some(isNaN)) {
      const gk = zToGamma(zt, Z0);
      const R = reduceS(S, k, gk);
      const rem = [0, 1, 2].filter(i => i !== k).map(i => i + 1);
      const btn = h('button', { class: 'btn' }, 'Send to the 2-port calculator');
      btn.addEventListener('click', () => CUSTOM_API.s2 && CUSTOM_API.s2.load(R, Z0));
      out.append(section('Reduced 2-port (port ' + (k + 1) + ' terminated, Γ = ' + fmtP(gk, 4) + '). New port 1 = old ' + rem[0] + ', new port 2 = old ' + rem[1],
        h('div', {}, gridTable(['', 'dB', '∠ deg', 'Re', 'Im'],
          [['S11', 0, 0], ['S21', 1, 0], ['S12', 0, 1], ['S22', 1, 1]].map(([n, i, j]) => [n, dB20(R[i][j]), fmt(cdeg(R[i][j]), 5), fmt(R[i][j].re, 5), fmt(R[i][j].im, 5)])), btn)));
    }
    out.append(h('div', { class: 'convs' },
      section('Z-parameters (Ω)', matText(sToZ(S, Z0))),
      section('Y-parameters (mS)', matText(sToY(S, Z0), '', 1e3))));
  }
  body.append(
    h('p', { class: 'desc' }, 'Splitters, couplers, hybrids and circulators: port metrics, network checks, divider/coupler/circulator figures, reduction to a 2-port and Z/Y parameters.'),
    h('div', { class: 'cols' },
      h('div', {}, z0.row, preset.row, mi.el),
      h('div', {}, h('div', { class: 'fsep' }, 'Port roles'), pIn.row, pA.row, pB.row,
        h('div', { class: 'fsep' }, 'Reduce to a 2-port'), pT.row, tR.row, tX.row)),
    out);
  update();
};

// ============================================================ L-network ====
// Exact 3 dB band of one lMatch solution: transducer gain 1 − |Γin(f)|² with each
// element an ideal L or C (by the sign of its reactance at f0) and the load
// reactance modelled the same way (series L if X_L > 0, series C if X_L < 0).
// Edges are searched from f0/100 to 100·f0; null means no edge in that range.
function lnetBand(sol, Rs, RL, XL, F) {
  const scale = (x, r) => x > 0 ? x * r : x / r;     // L: ∝ f, C: ∝ 1/f
  const atLoad = /at the load/.test(sol.topo);
  const gain = r => {
    const zl = cx(RL, scale(XL, r)), jX = cx(0, Math.abs(sol.X) < 1e-12 ? 0 : scale(sol.X, r));
    const jB = cx(0, Math.abs(sol.B) < 1e-15 ? 0 : scale(sol.B, r));
    const zin = atLoad ? cadd(cinv(cadd(cinv(zl), jB)), jX) : cinv(cadd(cinv(cadd(zl, jX)), jB));
    return 1 - cabs2(cdiv(csub(zin, cx(Rs)), cadd(zin, cx(Rs))));
  };
  const edge = dir => {
    const k = Math.pow(1.005, dir);
    let a = 1, b = k;
    for (let i = 0; i < 925; i++, a = b, b *= k) {
      if (gain(b) < 0.5) {
        for (let j = 0; j < 60; j++) { const m = sqrt(a * b); if (gain(m) < 0.5) b = m; else a = m; }
        return F * sqrt(a * b);
      }
    }
    return null;
  };
  return { lo: edge(-1), hi: edge(1) };
}
CUSTOM.lnet = function (calc, body) {
  const out = h('div', { class: 'sout' });
  const upd = () => update();
  const f = numField('Frequency', 500e6, { unit: 'Hz', du: 'MHz' }, upd);
  const rs = numField('Source resistance R<sub>S</sub> (real)', 50, { unit: 'ohm', du: 'Ω' }, upd);
  const rl = numField('Load resistance R<sub>L</sub>', 200, { unit: 'ohm', du: 'Ω' }, upd);
  const xl = numField('Load reactance X<sub>L</sub>', -100, { unit: 'ohm', du: 'Ω', blank: 0 }, upd);
  const mem = cardMemory('c.lnet', { nums: { f: f, rs: rs, rl: rl, xl: xl } });
  mem.restore();
  resetButton(body, () => { mem.reset(); update(); });
  function update() {
    out.innerHTML = '';
    mem.save();
    const F = f.get(), Rs = rs.get(), RL = rl.get(), XL = xl.get();
    if (!(F > 0 && Rs > 0 && RL > 0) || isNaN(XL)) { out.append(h('div', { class: 'msg err' }, 'Enter a positive frequency and resistances.')); return; }
    const sols = lMatch(Rs, RL, XL, F);
    if (!sols.length) { out.append(h('div', { class: 'msg err' }, 'No L-network solution found.')); return; }
    const bandTxt = s => {
      const b = lnetBand(s, Rs, RL, XL, F);
      if (!b.lo && !b.hi) return '— (stays above −3 dB from f/100 to 100f)';
      const lo = b.lo ? fmtSI(b.lo, 'Hz', 4) : '&lt; ' + fmtSI(F / 100, 'Hz', 3), hi = b.hi ? fmtSI(b.hi, 'Hz', 4) : '&gt; ' + fmtSI(100 * F, 'Hz', 3);
      return (b.lo && b.hi ? fmtSI(b.hi - b.lo, 'Hz', 4) : '—') + '<br><span class="muted">' + lo + ' – ' + hi + '</span>';
    };
    out.append(gridTable(['#', 'Topology', 'Series element', 'Shunt element', 'Type', '3 dB bandwidth'],
      sols.map((s, i) => [i + 1, s.topo + '<br><span class="muted">' + s.order + '</span>',
        s.se.text + '<br><span class="muted">X = ' + fmt(s.X, 5) + ' Ω</span>',
        s.sh.text + '<br><span class="muted">B = ' + fmt(s.B * 1e3, 5) + ' mS</span>', s.type, bandTxt(s)])));
    const rhi = Math.max(Rs, RL), rlo = Math.min(Rs, RL), Qn = sqrt(rhi / rlo - 1);
    const real = Math.abs(XL) <= 1e-9 * Math.max(Rs, RL);
    out.append(kvTable([
      ['Nodal Q  Q<sub>n</sub> = √(R<sub>high</sub>/R<sub>low</sub> − 1)' + (real ? '' : ' (resistive parts only)'), fmt(Qn, 4)],
      ['Loaded Q ≈ Q<sub>n</sub>/2 (doubly terminated)', fmt(Qn / 2, 4)],
      ['Approx. 3 dB bandwidth 2f/Q<sub>n</sub> (real loads, Q<sub>n</sub> ≫ 1)', !real ? '— (complex load: Q depends on the solution, see the table)'
        : rhi > rlo ? fmtSI(2 * F / Qn, 'Hz') : '—'],
    ]));
  }
  body.append(h('p', { class: 'desc' }, 'Two-element lumped match from a complex load to a real source. All valid solutions are listed. For a complex source, add the conjugate of the source reactance to the series element.'),
    f.row, rs.row, rl.row, xl.row, out,
    h('div', { class: 'note', html: 'Pozar §5.1. For the shunt-at-load network: B = [X<sub>L</sub> ± √(R<sub>L</sub>/R<sub>S</sub>)·√(R<sub>L</sub>² + X<sub>L</sub>² − R<sub>S</sub>R<sub>L</sub>)]/(R<sub>L</sub>² + X<sub>L</sub>²). For the shunt-at-source network (R<sub>L</sub> < R<sub>S</sub>): X = ±√(R<sub>L</sub>(R<sub>S</sub> − R<sub>L</sub>)) − X<sub>L</sub>. ' +
      'The 3 dB bandwidth column is exact for ideal L and C elements: half-power points of 1 − |Γ<sub>in</sub>(f)|², with the load reactance taken as a fixed L (X<sub>L</sub> > 0) or C (X<sub>L</sub> < 0). ' +
      'The loaded Q of a doubly terminated L-network is about half its nodal Q, so BW ≈ 2f/Q<sub>n</sub> (Ludwig & Bretchko §8.1).' }));
  update();
};

// ============================================================== cascade ====
CUSTOM.cascade = function (calc, body) {
  calc.wide = true;
  const saved = store.get('c.cascade');
  let stages = Array.isArray(saved) && saved.length ? saved : [
    { name: 'LNA', g: '18', nf: '1.2', oip3: '30', op1: '18' },
    { name: 'BPF', g: '-2', nf: '2', oip3: '', op1: '' },
    { name: 'Mixer', g: '-7', nf: '7', oip3: '15', op1: '5' },
    { name: 'IF amp', g: '20', nf: '4', oip3: '35', op1: '22' },
  ];
  const tbl = h('div');
  const out = h('div', { class: 'sout' });
  const upd = () => update();
  const bw = numField('Noise bandwidth B', 1e6, { unit: 'Hz', du: 'MHz' }, upd);
  const snr = numField('Required SNR', 10, { sym: 'dB' }, upd);
  const temp = numField('Source temperature', 290, { sym: 'K' }, upd);
  const fm = cardMemory('c.cascade.f', { nums: { bw: bw, snr: snr, temp: temp } });
  fm.restore();
  const cols = [['name', 'Stage'], ['g', 'Gain (dB)'], ['nf', 'NF (dB)'], ['oip3', 'OIP3 (dBm)'], ['op1', 'OP1dB (dBm)']];

  function drawTable() {
    tbl.innerHTML = '';
    const t = h('table', { class: 'grid edit' });
    t.append(h('thead', {}, h('tr', {}, h('th', {}, '#'), cols.map(c => h('th', {}, c[1])), h('th', {}, ''))));
    const tb = h('tbody');
    stages.forEach((s, i) => {
      const tr = h('tr', {}, h('td', {}, String(i + 1)));
      for (const [k] of cols) {
        const inp = h('input', { type: 'text', value: s[k], spellcheck: 'false', placeholder: (k === 'oip3' || k === 'op1') ? 'ideal' : '' });
        inp.addEventListener('input', () => { s[k] = inp.value; update(); });
        tr.append(h('td', {}, inp));
      }
      const del = h('button', { class: 'btn small', title: 'Remove stage' }, '×');
      del.addEventListener('click', () => { stages.splice(i, 1); drawTable(); update(); });
      const upb = h('button', { class: 'btn small', title: 'Move up' }, '↑');
      upb.addEventListener('click', () => { if (i > 0) { [stages[i - 1], stages[i]] = [stages[i], stages[i - 1]]; drawTable(); update(); } });
      tr.append(h('td', { class: 'nowrap' }, upb, del));
      tb.append(tr);
    });
    t.append(tb);
    const add = h('button', { class: 'btn' }, '+ Add stage');
    add.addEventListener('click', () => { stages.push({ name: 'Stage ' + (stages.length + 1), g: '0', nf: '0', oip3: '', op1: '' }); drawTable(); update(); });
    const att = h('button', { class: 'btn' }, '+ Add attenuator / cable');
    att.addEventListener('click', () => { stages.push({ name: 'Loss', g: '-3', nf: '3', oip3: '', op1: '' }); drawTable(); update(); });
    tbl.append(t, h('div', { class: 'btnrow' }, add, att));
  }
  function update() {
    store.set('c.cascade', stages);
    fm.save();
    out.innerHTML = '';
    const parsed = stages.map(s => ({
      g: parseNum(s.g), nf: parseNum(s.nf),
      oip3: String(s.oip3).trim() === '' ? NaN : parseNum(s.oip3),
      op1: String(s.op1).trim() === '' ? NaN : parseNum(s.op1),
    }));
    const bad = parsed.findIndex((p, i) => isNaN(p.g) || isNaN(p.nf) ||
      (String(stages[i].oip3).trim() !== '' && isNaN(p.oip3)) || (String(stages[i].op1).trim() !== '' && isNaN(p.op1)));
    if (!stages.length) { out.append(h('div', { class: 'msg info' }, 'Add a stage.')); return; }
    if (bad >= 0) { out.append(h('div', { class: 'msg err' }, 'Stage ' + (bad + 1) + ': enter a valid gain and NF (OIP3/OP1dB may be blank).')); return; }
    const r = cascade(parsed);
    out.append(section('Cumulative values (from the input up to each stage)', gridTable(
      ['#', 'Stage', 'Gain', 'NF', 'OIP3', 'IIP3', 'OP1dB', 'IP1dB', 'Share of noise'],
      r.map((x, i) => [i + 1, stages[i].name, fmt(x.g, 4) + ' dB', fmt(x.nf, 4) + ' dB', fmt(x.oip3, 4) + ' dBm', fmt(x.iip3, 4) + ' dBm',
        fmt(x.op1, 4) + ' dBm', fmt(x.ip1, 4) + ' dBm', fmt(x.contrib, 3) + ' %']))));
    const last = r[r.length - 1];
    const B = bw.get(), SNR = snr.get(), T = temp.get();
    const okIn = B > 0 && T >= 0 && isFinite(T) && !isNaN(SNR);
    // NF is referenced to T0 = 290 K: the receiver adds Te = 290(F − 1) to the source temperature T.
    const Te = 290 * (fromDbp(last.nf) - 1);
    const floor = okIn && T + Te > 0 ? dbp(KB * (T + Te) * B * 1000) : NaN;
    const negNf = parsed.map((p, i) => p.nf < 0 ? i + 1 : 0).filter(Boolean);
    if (!okIn) out.append(h('div', { class: 'msg err' }, 'Enter a positive noise bandwidth, a source temperature ≥ 0 K and a required SNR.'));
    if (negNf.length) out.append(h('div', { class: 'msg warn' }, '⚠ Stage ' + negNf.join(', ') + ': a noise figure below 0 dB (F < 1, Tₑ < 0 K) is not physical. The floor and sensitivity will be optimistic.'));
    out.append(section('Totals', kvTable([
      ['Total gain', fmt(last.g, 5) + ' dB'],
      ['Total noise figure', fmt(last.nf, 5) + ' dB  (T<sub>e</sub> = ' + fmt(Te, 5) + ' K)'],
      ['Input IP3 / output IP3', fmt(last.iip3, 5) + ' / ' + fmt(last.oip3, 5) + ' dBm'],
      ['Input P1dB / output P1dB', fmt(last.ip1, 5) + ' / ' + fmt(last.op1, 5) + ' dBm'],
      ['Input noise floor k(T + T<sub>e</sub>)B', fmt(floor, 5) + ' dBm'],
      ['Output noise power', fmt(floor + last.g, 5) + ' dBm'],
      ['Sensitivity (floor + SNR)', fmt(floor + SNR, 5) + ' dBm'],
      ['SFDR (third order) = ⅔(IIP3 − floor)', isFinite(last.iip3) ? fmt(2 / 3 * (last.iip3 - floor), 5) + ' dB' : '∞'],
      ['Compression-limited dynamic range (IP1dB − floor)', isFinite(last.ip1) ? fmt(last.ip1 - floor, 5) + ' dB' : '∞'],
    ])));
  }
  const reset = h('button', { class: 'btn' }, 'Reset');
  reset.addEventListener('click', () => { store.set('c.cascade', null); stages = [
    { name: 'LNA', g: '18', nf: '1.2', oip3: '30', op1: '18' }, { name: 'BPF', g: '-2', nf: '2', oip3: '', op1: '' },
    { name: 'Mixer', g: '-7', nf: '7', oip3: '15', op1: '5' }, { name: 'IF amp', g: '20', nf: '4', oip3: '35', op1: '22' }]; fm.reset(); drawTable(); update(); });
  body.parentNode.querySelector('.card-btns').append(reset);
  body.append(h('p', { class: 'desc' }, 'Friis noise cascade with IP3 and P1dB. Blank OIP3/OP1dB means an ideal (linear) stage. For a passive loss, set NF = loss.'),
    tbl, h('div', { class: 'cols' }, h('div', {}, bw.row, snr.row, temp.row), h('div')), out,
    h('div', { class: 'note', html: 'F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + … · 1/OIP3<sub>tot</sub> = 1/(OIP3<sub>prev</sub>·G<sub>n</sub>) + 1/OIP3<sub>n</sub> (linear mW). The P1dB cascade uses the same approximation. ' +
      'NF is defined at T₀ = 290 K, so the receiver adds T<sub>e</sub> = 290(F − 1) and the input noise floor is N = k(T + T<sub>e</sub>)B with T the source (antenna) temperature. At T = 290 K this equals kTB·F.' }));
  drawTable();
  update();
};

// ============================================================== E-series ===
CUSTOM.eseries = function (calc, body) {
  const out = h('div', { class: 'sout' });
  const val = numField('Calculated value (any unit, SI prefixes allowed)', 4.8e3, { sym: '' }, () => update());
  const mem = cardMemory('c.eseries', { nums: { val: val } });
  mem.restore();
  resetButton(body, () => { mem.reset(); update(); });
  function update() {
    out.innerHTML = '';
    mem.save();
    const x = val.get();
    if (!(x > 0)) { out.append(h('div', { class: 'msg info' }, 'Enter a positive value, for example 4k8, 3.3n or 68e-12.')); return; }
    // the error of both neighbours is shown, so the choice of 'Nearest' can be checked
    const pct = e => (e >= 0 ? '+' : '') + e.toFixed(2) + ' %';
    const errOf = v => 100 * (v - x) / x;
    let logPick = false;
    out.append(gridTable(['Series', 'Tolerance', 'Below (error)', 'Above (error)', 'Nearest', 'Error'],
      [['E6', '±20 %'], ['E12', '±10 %'], ['E24', '±5 %'], ['E48', '±2 %'], ['E96', '±1 %']].map(([s, tol]) => {
        const r = nearestE(x, s);
        const other = r.best === r.lo ? r.hi : r.lo;
        const dag = Math.abs(errOf(other)) < Math.abs(errOf(r.best)) - 1e-12;
        if (dag) logPick = true;
        return [s, tol, fmtSI(r.lo, '', 4) + '<br><span class="muted">' + pct(errOf(r.lo)) + '</span>',
          fmtSI(r.hi, '', 4) + '<br><span class="muted">' + pct(errOf(r.hi)) + '</span>',
          '<b>' + fmtSI(r.best, '', 4) + '</b>' + (dag ? ' †' : ''), pct(r.err)];
      })));
    out.append(h('div', { class: 'note', html: 'Error = (standard value − x)/x.' + (logPick
      ? ' † Nearest on a log scale: x is above the geometric mean √(below·above), which is how the E-series steps are spaced, although the other neighbour has the smaller % error.' : '') }));
  }
  body.append(h('p', { class: 'desc' }, 'Snap a calculated R, L or C value to the nearest standard (IEC 60063) value.'), val.row, out);
  update();
};

// ============================================================ reference ====
function solveMsW(er, H, z0) {
  return findRoot(W => Math.log(microstrip(W, H, 35e-6, er).z0 / z0), 1e-6, 0.2, 'log');
}
CUSTOM.ref_cables = function (calc, body) {
  calc.wide = true;
  const fr = [100e6, 1e9, 2.4e9, 6e9, 10e9];
  body.append(h('p', { class: 'desc' }, 'Typical attenuation in dB/100 m (fitted model, check the datasheet). A dash means above the rated frequency.'),
    gridTable(['Cable', 'Z₀', 'VF', 'OD (mm)', 'Max f'].concat(fr.map(f => fmtSI(f, 'Hz', 3))),
      CABLES.map(c => [c.name, c.z0 + ' Ω', c.vf, c.od, c.fmax + ' GHz'].concat(fr.map(f => f <= c.fmax * 1e9 ? fmt(100 * cableAtt(c, f), 3) : '—')))));
};
CUSTOM.ref_subs = function (calc, body) {
  calc.wide = true;
  body.append(h('p', { class: 'desc' }, 'Typical design values. The 50 Ω width is computed with Hammerstad–Jensen for 35 µm copper.'),
    gridTable(['Material', 'εr', 'tanδ', '50 Ω width @ H = 0.254 mm', '@ 0.508 mm', '@ 0.813 mm', '@ 1.524 mm'],
      SUBSTRATES.map(s => [s.name, s.er, s.tand].concat([0.254e-3, 0.508e-3, 0.813e-3, 1.524e-3].map(H => fmt(solveMsW(s.er, H, 50) * 1e3, 3) + ' mm')))));
};
CUSTOM.ref_cond = function (calc, body) {
  calc.wide = true;
  const fr = [1e6, 100e6, 1e9, 10e9];
  const sd = (c, f) => sqrt(c.rho / (PI * f * MU0 * c.mur));
  // ferromagnetic μr is the low-frequency value; above ~100 MHz it falls (domain-wall
  // relaxation, ferromagnetic resonance), so δ computed with it is only a lower bound
  const mag = (c, f) => c.mur > 1 && f > 100e6;
  body.append(gridTable(['Conductor', 'ρ (µΩ·cm)', 'σ (MS/m)', 'μr'].concat(fr.map(f => 'δ @ ' + fmtSI(f, 'Hz', 3))),
    CONDUCTORS.map(c => [c.name, fmt(c.rho * 1e8, 4), fmt(1e-6 / c.rho, 4), c.mur].concat(fr.map(f => fmtSI(sd(c, f), 'm', 3) + (mag(c, f) ? ' †' : ''))))),
    h('div', { class: 'note', html: '† Ferromagnetic conductors (nickel): μ<sub>r</sub> ≈ 100 is the low-frequency (initial) permeability. ' +
      'The effective μ<sub>r</sub> falls from about 100 MHz into the GHz range and approaches about 1–10 at microwave frequencies, so these δ values are lower bounds ' +
      '(δ ∝ 1/√μ<sub>r</sub>; with μ<sub>r</sub> = 1 nickel gives δ ≈ 4.2 µm at 1 GHz) and R<sub>s</sub> is overstated. The value depends on how the nickel was deposited; high-phosphorus electroless nickel (ENIG) is nearly non-magnetic.' }));
};
CUSTOM.ref_bands = function (calc, body) {
  calc.wide = true;
  const rng = (a, b) => a === b ? fmtSI(a, 'Hz', 7) : fmtSI(a, 'Hz', 6) + ' – ' + fmtSI(b, 'Hz', 6);
  body.append(
    section('Common allocations (check local regulations)', gridTable(['Band / service', 'Frequency', 'λ (centre)', 'Type'],
      COMMON_BANDS.map(b => [b[0], rng(b[1], b[2]), fmtSI(C0 / ((b[1] + b[2]) / 2), 'm', 4), b[3]]))),
    h('div', { class: 'convs' },
      section('IEEE radar letter bands', gridTable(['Band', 'Frequency', 'Wavelength'],
        IEEE_BANDS.map(b => [b[0], rng(b[1], b[2]), fmtSI(C0 / b[2], 'm', 3) + ' – ' + fmtSI(C0 / b[1], 'm', 3)]))),
      section('ITU bands', gridTable(['Band', 'Frequency', 'Wavelength'], ITU_BANDS.map(b => [b[0], rng(b[1], b[2]), b[3]])))));
};
CUSTOM.ref_wg = function (calc, body) {
  calc.wide = true;
  body.append(h('p', { class: 'desc' }, 'TE₁₀ cutoff f<sub>c</sub> = c/(2a). The next mode is TE₂₀ (c/a) or TE₀₁ (c/2b), whichever is lower.'),
    gridTable(['Waveguide', 'a × b (mm)', 'Recommended band', 'TE₁₀ cutoff', 'Next mode cutoff'],
      WAVEGUIDES.map(w => [w[0], w[1] + ' × ' + w[2], fmtSI(w[3], 'Hz', 4) + ' – ' + fmtSI(w[4], 'Hz', 4),
        fmtSI(C0 / (2 * w[1] * 1e-3), 'Hz', 4), fmtSI(Math.min(C0 / (w[1] * 1e-3), C0 / (2 * w[2] * 1e-3)), 'Hz', 4)])));
};
CUSTOM.ref_conn = function (calc, body) {
  calc.wide = true;
  body.append(gridTable(['Connector', 'Impedance', 'Typical max frequency (GHz)', 'Coupling'], CONNECTORS));
};

function renderCustom(calc) {
  const card = cardShell(calc, []);
  CUSTOM[calc.custom](calc, card.body);
  if (calc.wide) card.el.classList.add('wide');
  return card.el;
}

// ================================================================== app ====
function initApp() {
  const main = document.getElementById('cards');
  const nav = document.getElementById('nav');
  const search = document.getElementById('search');
  const title = document.getElementById('cat-title');
  const cards = [];
  for (const c of CALCS) {
    let el;
    try { el = c.custom ? renderCustom(c) : renderSolver(c); }
    catch (e) { console.error(c.id, e); el = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, c.title)), h('div', { class: 'msg err' }, 'Failed to load: ' + e.message)); }
    el.dataset.cat = c.cat;
    el.dataset.key = (c.title + ' ' + (c.kw || '') + ' ' + (c.desc || '')).toLowerCase();
    main.append(el);
    cards.push(el);
  }
  const navBtns = {};
  for (const [id, name] of CATS) {
    const n = CALCS.filter(c => c.cat === id).length;
    const b = h('button', { class: 'navbtn' }, h('span', {}, name), h('span', { class: 'count' }, String(n)));
    b.addEventListener('click', () => { search.value = ''; show(id); history.replaceState(null, '', '#' + id); });
    navBtns[id] = b;
    nav.append(b);
  }
  nav.append(h('div', { class: 'navfoot', html:
    '<p><b>How it works</b></p>' +
    '<p>Fill in the values you know. The field left blank is calculated (blue, marked =).</p>' +
    '<p>Type into a calculated field to make it an input. The input you edited longest ago then becomes the result. Clear a field to have it calculated.</p>' +
    '<p>SI prefixes work: <code>2.4G</code>, <code>10n</code>, <code>4k7</code>, <code>1e-3</code>.</p>' +
    '<p>Everything runs offline. Your values are saved in this browser.</p>' }));
  let current = 'power';
  function show(cat) {
    current = cat;
    store.set('cat', cat);
    for (const id in navBtns) navBtns[id].classList.toggle('active', id === cat);
    title.textContent = (CATS.find(c => c[0] === cat) || ['', ''])[1];
    for (const el of cards) el.hidden = el.dataset.cat !== cat;
    requestAnimationFrame(vizRefit);
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { show(current); return; }
    const words = q.split(/\s+/);
    let n = 0;
    for (const el of cards) { const m = words.every(w => el.dataset.key.includes(w)); el.hidden = !m; if (m) n++; }
    requestAnimationFrame(vizRefit);
    for (const id in navBtns) navBtns[id].classList.remove('active');
    title.textContent = n + ' result' + (n === 1 ? '' : 's') + ' for "' + search.value.trim() + '"';
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); search.focus(); }
  });
  // theme
  const themeBtn = document.getElementById('theme');
  const setTheme = t => { document.documentElement.dataset.theme = t; store.set('theme', t); themeBtn.textContent = t === 'dark' ? '☀ Light' : '☾ Dark'; };
  setTheme(store.get('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  document.getElementById('resetall').addEventListener('click', () => {
    if (!confirm('Reset all calculators to their example values?')) return;
    try { Object.keys(localStorage).filter(k => k.startsWith(STORE)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    location.reload();
  });
  document.getElementById('menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  const hash = location.hash.slice(1);
  show(CATS.some(c => c[0] === hash) ? hash : (CATS.some(c => c[0] === store.get('cat')) ? store.get('cat') : 'power'));
}
document.addEventListener('DOMContentLoaded', initApp);

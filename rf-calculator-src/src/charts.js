// ============================================================================
// charts.js - small SVG/HTML charts for the S-parameter calculators.
// Colours come from CSS custom properties (see style.css) so light/dark
// switch without re-rendering. Every chart is backed by a table in its card.
// ============================================================================

const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in (attrs || {})) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  for (let i = 2; i < arguments.length; i++) {
    for (const c of [].concat(arguments[i])) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  return e;
}
let vizUid = 0;

// ---------------------------------------------------------------- tooltip --
// One shared tooltip. rows: [{ value, label, slot }] - value leads, label follows.
const vizTip = {
  el: null,
  show(target, rows, ev) {
    if (!this.el) { this.el = h('div', { class: 'viz-tip', role: 'tooltip' }); document.body.append(this.el); }
    this.el.replaceChildren(...rows.map(r => h('div', { class: 'viz-tip-row' },
      r.slot ? h('span', { class: 'viz-key', style: 'background: var(--series-' + r.slot + ')' }) : null,
      h('strong', {}, r.value), h('span', { class: 'viz-tip-label' }, r.label || ''))));
    this.el.style.display = 'block';
    let x, y;
    if (ev && ev.clientX !== undefined) { x = ev.clientX + 14; y = ev.clientY + 14; }
    else { const b = target.getBoundingClientRect(); x = b.right + 8; y = b.top; }
    const w = this.el.offsetWidth, hgt = this.el.offsetHeight;
    if (x + w > innerWidth - 8) x = Math.max(8, x - w - 28);
    if (y + hgt > innerHeight - 8) y = Math.max(8, y - hgt - 28);
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};
function tipOn(el, rows) {
  el.setAttribute('tabindex', '0');
  el.classList.add('viz-hit');
  el.addEventListener('pointermove', ev => vizTip.show(el, rows, ev));
  el.addEventListener('pointerleave', () => vizTip.hide());
  el.addEventListener('focus', () => vizTip.show(el, rows));
  el.addEventListener('blur', () => vizTip.hide());
  return el;
}

function vizFigure(title, body, legend, note) {
  return h('figure', { class: 'viz' }, h('figcaption', { class: 'viz-title' }, title), body,
    legend || null, note ? h('div', { class: 'viz-note' }, note) : null);
}
function vizLegend(items, shape) {
  return h('div', { class: 'viz-legend' }, items.map(it => h('span', { class: 'viz-li' },
    h('span', { class: 'viz-sw ' + (shape || 'rect'), style: 'background: ' + (it.muted ? 'var(--muted)' : 'var(--series-' + it.slot + ')') }),
    h('span', { class: 'viz-li-name' }, it.label),
    it.value ? h('span', { class: 'viz-li-val' }, it.value) : null)));
}
const dbTxt = m => m <= 0 ? '−∞ dB' : fmt(dbMag(m), 4) + ' dB';
const polTxt = z => fmt(cabs(z), 4) + ' ∠ ' + fmt(cabs(z) < 1e-13 ? 0 : cdeg(z), 4) + '°';

// Labels of points closer than `px` are merged so they never stack on each other.
function mergeLabels(pts, px) {
  const groups = [];
  for (const p of pts) {
    const g = groups.find(g => Math.hypot(g.x - p.x, g.y - p.y) < px);
    if (g) g.names.push(p.label); else groups.push({ x: p.x, y: p.y, names: [p.label] });
  }
  return groups;
}
function pointLabels(svg, pts, cx, cy) {
  for (const g of mergeLabels(pts, 10)) {
    // push the label outward from the centre so it clears the marker
    const dx = g.x - cx, dy = g.y - cy, d = Math.hypot(dx, dy);
    const ux = d > 1 ? dx / d : 0.7, uy = d > 1 ? dy / d : -0.7;
    const tx = g.x + ux * 11, ty = g.y + uy * 11 + 4;
    svg.append(sv('text', { x: tx, y: ty, class: 'viz-dlabel', 'text-anchor': ux < -0.3 ? 'end' : ux > 0.3 ? 'start' : 'middle' }, g.names.join(', ')));
  }
}
function marker(svg, x, y, slot, rows) {
  svg.append(sv('circle', { cx: x, cy: y, r: 5, class: 'viz-dot', style: 'fill: var(--series-' + slot + ')' }));
  svg.append(tipOn(sv('circle', { cx: x, cy: y, r: 12, class: 'viz-hitarea' }), rows));
}
// Off-scale point: hollow ring at the clamped position plus a small arrow pointing
// out of the plot (dx, dy: -1, 0 or 1 in screen directions).
function offMarker(svg, x, y, dx, dy, slot, rows) {
  svg.append(sv('circle', { cx: x, cy: y, r: 5, class: 'viz-dot off', style: 'stroke: var(--series-' + slot + ')' }));
  const n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, tx = x + ux * 15, ty = y + uy * 15, bx = x + ux * 8, by = y + uy * 8;
  svg.append(sv('path', { class: 'viz-offarrow', style: 'fill: var(--series-' + slot + ')',
    d: 'M' + tx.toFixed(2) + ' ' + ty.toFixed(2) + 'L' + (bx - uy * 4).toFixed(2) + ' ' + (by + ux * 4).toFixed(2) +
       'L' + (bx + uy * 4).toFixed(2) + ' ' + (by - ux * 4).toFixed(2) + 'Z' }));
  svg.append(tipOn(sv('circle', { cx: x, cy: y, r: 12, class: 'viz-hitarea' }), rows));
}

// ------------------------------------------------------ power stacked bar --
// segments: [{ label, pct, slot, s }] - where the incident power goes.
function powerBar(title, segments) {
  const shown = segments.filter(s => isFinite(s.pct));
  if (shown.length !== segments.length) return null;
  const negative = shown.some(s => s.pct < -1e-9 && !s.allowNeg);
  const parts = shown.filter(s => s.pct > 1e-9);
  const total = parts.reduce((a, s) => a + s.pct, 0);
  const bar = h('div', { class: 'viz-bar', role: 'img', 'aria-label': title });
  parts.forEach((s, i) => {
    const seg = h('div', { class: 'viz-seg' + (i === parts.length - 1 ? ' end' : ''),
      style: 'flex: ' + s.pct + ' 1 0px; background: var(--series-' + s.slot + ')' },
      h('span', { class: 'viz-seg-label ink-' + s.slot }, fmt(s.pct, 3) + ' %'));
    tipOn(seg, [{ value: fmt(s.pct, 4) + ' %', label: s.label + (s.s ? ' · ' + s.s : ''), slot: s.slot }]);
    bar.append(seg);
  });
  requestAnimationFrame(() => fitBar(bar));
  const scale = h('div', { class: 'viz-scale' }, h('span', {}, '0 %'), h('span', {}, total > 100.0001 ? fmt(total, 4) + ' %' : '100 % of incident power'));
  const legend = vizLegend(segments.map(s => ({ slot: s.slot, label: s.label, value: fmt(s.pct, 4) + ' %' + (s.s ? ' · ' + s.s : '') })));
  const note = negative ? 'Output exceeds input (active network or data error). The bar shows the outputs only.' : null;
  return vizFigure(title, h('div', {}, bar, scale), legend, note);
}

// In-segment labels are shown only when they fit with padding (never clipped).
function fitBar(bar) {
  bar.querySelectorAll('.viz-seg').forEach(seg => {
    const lab = seg.firstChild;
    lab.style.visibility = seg.clientWidth > 0 && lab.scrollWidth + 12 <= seg.clientWidth ? 'visible' : 'hidden';
  });
}
function vizRefit() { document.querySelectorAll('.viz-bar').forEach(fitBar); }
window.addEventListener('resize', () => requestAnimationFrame(vizRefit));

// ---------------------------------------------------------------- heatmap --
// |S| in dB laid out like the S-matrix: rows "to port i", columns "from port j".
function sHeatmap(S) {
  const n = S.length;
  const dbs = S.map(r => r.map(z => cabs(z) > 0 ? dbMag(cabs(z)) : -Infinity));
  const fin = dbs.flat().filter(isFinite);
  const hi = Math.max(0, Math.ceil(Math.max(...fin, -Infinity)));
  const lo = Math.max(-60, Math.min(-40, Math.floor(Math.min(...fin, 0) / 10) * 10));
  const cell = n === 2 ? 64 : 54, gap = 2, padL = 44, padT = 20;
  const W = padL + n * (cell + gap), Hh = padT + n * (cell + gap);
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + Hh, width: W, height: Hh, class: 'viz-svg', role: 'img', 'aria-label': '|S| in dB, matrix layout' });
  for (let j = 0; j < n; j++) svg.append(sv('text', { x: padL + j * (cell + gap) + cell / 2, y: 13, class: 'viz-axis-t', 'text-anchor': 'middle' }, 'from ' + (j + 1)));
  for (let i = 0; i < n; i++) {
    svg.append(sv('text', { x: padL - 6, y: padT + i * (cell + gap) + cell / 2 + 4, class: 'viz-axis-t', 'text-anchor': 'end' }, 'to ' + (i + 1)));
    for (let j = 0; j < n; j++) {
      const d = dbs[i][j];
      const t = isFinite(d) ? Math.min(1, Math.max(0, (d - lo) / (hi - lo))) : 0;
      const k = Math.min(9, Math.floor(t * 10));
      const x = padL + j * (cell + gap), y = padT + i * (cell + gap);
      const name = 'S' + (i + 1) + (j + 1);
      const g = sv('g', {},
        sv('rect', { x: x, y: y, width: cell, height: cell, rx: 4, class: 'heat h' + k }),
        sv('text', { x: x + cell / 2, y: y + cell / 2 - 2, class: 'heat-t h' + k, 'text-anchor': 'middle' }, name),
        sv('text', { x: x + cell / 2, y: y + cell / 2 + 13, class: 'heat-t heat-v h' + k, 'text-anchor': 'middle' }, isFinite(d) ? fmt(d, 3) : '−∞'));
      svg.append(tipOn(g, [{ value: dbTxt(cabs(S[i][j])), label: name + ' · ' + polTxt(S[i][j]) }]));
    }
  }
  const scale = h('div', { class: 'viz-ramp' },
    h('span', {}, (lo <= -60 ? '≤ ' : '') + lo + ' dB'),
    h('span', { class: 'viz-ramp-bar' }, Array.from({ length: 10 }, (_, k) => h('span', { class: 'heat-sw h' + k }))),
    h('span', {}, hi + ' dB'));
  return vizFigure('|S| in dB', svg, scale);
}

// ----------------------------------------------------------- Smith chart --
// points: [{ label, z (reflection coefficient), slot }]
function smithChart(title, points) {
  const size = 260, m = 26, c = size / 2, Rp = c - m;
  const R = Math.max(1, ...points.map(p => cabs(p.z) * 1.08));
  const k = Rp / R;
  const X = gx => c + gx * k, Y = gy => c - gy * k;
  const id = 'smc' + (++vizUid);
  const svg = sv('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'viz-svg', role: 'img', 'aria-label': title });
  svg.append(sv('defs', {}, sv('clipPath', { id: id }, sv('circle', { cx: c, cy: c, r: k }))));
  const grid = sv('g', { 'clip-path': 'url(#' + id + ')' });
  for (const r of [0.2, 0.5, 1, 2, 5]) grid.append(sv('circle', { cx: X(r / (1 + r)), cy: c, r: k / (1 + r), class: 'viz-grid' }));
  for (const x of [0.2, 0.5, 1, 2, 5]) {
    for (const s of [1, -1]) grid.append(sv('circle', { cx: X(1), cy: Y(s / x), r: k / x, class: 'viz-grid' }));
  }
  grid.append(sv('line', { x1: X(-1), y1: c, x2: X(1), y2: c, class: 'viz-grid' }));
  svg.append(grid);
  svg.append(sv('circle', { cx: c, cy: c, r: k, class: 'viz-axis' }));
  for (const r of [0.2, 0.5, 1, 2, 5]) svg.append(sv('text', { x: X((r - 1) / (r + 1)) + 2, y: c - 3, class: 'viz-axis-t sm' }, String(r)));
  for (const x of [0.5, 1, 2]) {
    for (const s of [1, -1]) {
      const g = cdiv(cx(-1, s * x), cx(1, s * x));
      const a = carg(g);
      svg.append(sv('text', { x: c + Math.cos(a) * (k + 9), y: c - Math.sin(a) * (k + 9) + 3, class: 'viz-axis-t sm', 'text-anchor': 'middle' }, (s > 0 ? '+j' : '−j') + x));
    }
  }
  const pts = points.map(p => ({ x: X(p.z.re), y: Y(p.z.im), label: p.label }));
  points.forEach((p, i) => marker(svg, pts[i].x, pts[i].y, p.slot, [
    { value: polTxt(p.z), label: p.label, slot: p.slot },
    { value: dbTxt(cabs(p.z)), label: 'return loss ' + (cabs(p.z) > 0 ? fmt(-dbMag(cabs(p.z)), 4) + ' dB' : '∞') },
    { value: fmtC(gammaToZ(p.z, 1), 4), label: 'normalised z' }]));
  pointLabels(svg, pts, c, c);
  const outside = points.some(p => cabs(p.z) > 1 + 1e-9);
  return vizFigure(title, svg, vizLegend(points.map(p => ({ slot: p.slot, label: p.label, value: polTxt(p.z) })), 'dot'),
    outside ? '|S| > 1 lies outside the unit circle (reflection gain).' : null);
}

// ------------------------------------------------------------ polar plot --
// vectors: [{ label, z, slot }] drawn from the origin; linear magnitude scale.
function niceMax(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(log10(x)));
  for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= x * 1.04) return m * e;
  return 10 * e;
}
function polarChart(title, vectors, note) {
  const size = 260, m = 26, c = size / 2, Rp = c - m;
  const Rm = niceMax(Math.max(...vectors.map(v => cabs(v.z))));
  const k = Rp / Rm;
  const svg = sv('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'viz-svg', role: 'img', 'aria-label': title });
  for (const f of [0.25, 0.5, 0.75, 1]) {
    svg.append(sv('circle', { cx: c, cy: c, r: Rp * f, class: f === 1 ? 'viz-axis' : 'viz-grid' }));
    svg.append(sv('text', { x: c + Rp * f - 2, y: c - 3, class: 'viz-axis-t sm', 'text-anchor': 'end' }, fmt(Rm * f, 3)));
  }
  for (let a = 0; a < 180; a += 30) {
    const ra = a * PI / 180;
    svg.append(sv('line', { x1: c - Rp * Math.cos(ra), y1: c + Rp * Math.sin(ra), x2: c + Rp * Math.cos(ra), y2: c - Rp * Math.sin(ra), class: 'viz-grid' }));
  }
  for (const [a, t] of [[0, '0°'], [90, '90°'], [180, '±180°'], [-90, '−90°']]) {
    const ra = a * PI / 180;
    svg.append(sv('text', { x: c + (Rp + 13) * Math.cos(ra), y: c - (Rp + 13) * Math.sin(ra) + 3, class: 'viz-axis-t sm', 'text-anchor': 'middle' }, t));
  }
  const pts = vectors.map(v => ({ x: c + v.z.re * k, y: c - v.z.im * k, label: v.label }));
  vectors.forEach((v, i) => {
    svg.append(sv('line', { x1: c, y1: c, x2: pts[i].x, y2: pts[i].y, class: 'viz-vec', style: 'stroke: var(--series-' + v.slot + ')' }));
  });
  vectors.forEach((v, i) => marker(svg, pts[i].x, pts[i].y, v.slot, [
    { value: polTxt(v.z), label: v.label, slot: v.slot }, { value: dbTxt(cabs(v.z)), label: 'magnitude' }]));
  pointLabels(svg, pts, c, c);
  return vizFigure(title, svg, vizLegend(vectors.map(v => ({ slot: v.slot, label: v.label, value: polTxt(v.z) + ' · ' + dbTxt(cabs(v.z)) })), 'dot'), note);
}

// ---------------------------------------------------- card-level helpers ---
function sChartsRow(S, transVectors, transNote) {
  const n = S.length;
  const refl = Array.from({ length: n }, (_, i) => ({ label: 'S' + (i + 1) + (i + 1), z: S[i][i], slot: i + 1 }));
  return h('div', { class: 'viz-row' },
    sHeatmap(S),
    smithChart('Reflections on the Smith chart', refl),
    polarChart('Transmissions (polar, linear |S|)', transVectors, transNote));
}

// Simple power views (magnitude-only cards). Colours follow the entity:
// port 2 = slot 1, port 3 = slot 2, reflected = slot 3, dissipated = slot 4.
function powerChart2(v) {
  if (![v.refl, v.trans, v.loss].every(isFinite)) return null;
  return powerBar('Where the incident power goes', [
    { label: 'To port 2', pct: v.trans, slot: 1, s: '|S21| ' + fmt(v.s21, 4) + ' dB' },
    { label: 'Reflected', pct: v.refl, slot: 3, s: '|S11| ' + fmt(v.s11, 4) + ' dB' },
    { label: 'Dissipated', pct: v.loss, slot: 4 },
  ]);
}
function powerChart3(v) {
  if (![v.refl, v.p2, v.p3, v.loss].every(isFinite)) return null;
  return powerBar('Where the incident power goes', [
    { label: 'To port 2', pct: v.p2, slot: 1, s: '|S21| ' + fmt(v.s21, 4) + ' dB' },
    { label: 'To port 3', pct: v.p3, slot: 2, s: '|S31| ' + fmt(v.s31, 4) + ' dB' },
    { label: 'Reflected', pct: v.refl, slot: 3, s: '|S11| ' + fmt(v.s11, 4) + ' dB' },
    { label: 'Dissipated', pct: v.loss, slot: 4 },
  ]);
}

// ------------------------------------------------------------ line chart --
// Generic line chart (linear or log y). Options:
//   title, w, h, note
//   x: { min, max, label, fmt }          y: { min, max, log, label, fmt }
//   series: [{ label, pts: [[x, y], ...], slot: 1..4 (0 = muted context) }]
//   markers: [{ x, y, label, slot, rows }]   vlines: [{ x, label }]
//   tip: x => [{ value, label, slot }]  (crosshair readout; every value is also in a table)
//   legend: [{ slot, label, value, muted }]  (default: built from the series)
function niceTicks(min, max, n) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / (n || 6), mag = Math.pow(10, Math.floor(log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const SUPER = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const pow10Txt = k => k === 0 ? '1' : '10' + String(k).split('').map(c => SUPER[c]).join('');

function lineChart(o) {
  const W = o.w || 520, H = o.h || 260, mL = 54, mR = 16, mT = 12, mB = 38;
  const pw = W - mL - mR, ph = H - mT - mB;
  const ylog = !!o.y.log;
  const yv = y => ylog ? log10(y) : y;
  const y0 = yv(o.y.min), y1 = yv(o.y.max);
  const X = x => mL + (x - o.x.min) / (o.x.max - o.x.min) * pw;
  const Y = y => mT + (1 - (yv(y) - y0) / (y1 - y0)) * ph;
  const xOf = px => o.x.min + (px - mL) / pw * (o.x.max - o.x.min);
  const yfmt = o.y.fmt || (v => fmt(v, 4));
  const id = 'lc' + (++vizUid);
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'viz-svg viz-line-chart', role: 'img', 'aria-label': o.title });
  svg.append(sv('defs', {}, sv('clipPath', { id: id }, sv('rect', { x: mL, y: mT - 1, width: pw, height: ph + 2 }))));
  // grid and ticks
  const xf = o.x.fmt || (v => fmt(v, 4));
  for (const t of niceTicks(o.x.min, o.x.max, 6)) {
    svg.append(sv('line', { x1: X(t), y1: mT, x2: X(t), y2: mT + ph, class: 'viz-grid' }));
    svg.append(sv('text', { x: X(t), y: mT + ph + 14, class: 'viz-axis-t', 'text-anchor': 'middle' }, xf(t)));
  }
  if (ylog) {
    const k0 = Math.ceil(y0 - 1e-9), k1 = Math.floor(y1 + 1e-9);
    const step = Math.max(1, Math.ceil((k1 - k0) / 6));
    for (let k = k1; k >= k0; k -= step) {
      const yy = Y(Math.pow(10, k));
      svg.append(sv('line', { x1: mL, y1: yy, x2: mL + pw, y2: yy, class: 'viz-grid' }));
      svg.append(sv('text', { x: mL - 6, y: yy + 3, class: 'viz-axis-t', 'text-anchor': 'end' }, o.y.fmt ? o.y.fmt(Math.pow(10, k)) : pow10Txt(k)));
    }
  } else {
    for (const t of niceTicks(o.y.min, o.y.max, 5)) {
      svg.append(sv('line', { x1: mL, y1: Y(t), x2: mL + pw, y2: Y(t), class: 'viz-grid' }));
      svg.append(sv('text', { x: mL - 6, y: Y(t) + 3, class: 'viz-axis-t', 'text-anchor': 'end' }, yfmt(t)));
    }
  }
  svg.append(sv('line', { x1: mL, y1: mT + ph, x2: mL + pw, y2: mT + ph, class: 'viz-axis' }));
  svg.append(sv('line', { x1: mL, y1: mT, x2: mL, y2: mT + ph, class: 'viz-axis' }));
  if (o.x.label) svg.append(sv('text', { x: mL + pw / 2, y: H - 4, class: 'viz-axis-t', 'text-anchor': 'middle' }, o.x.label));
  if (o.y.label) svg.append(sv('text', { x: 11, y: mT + ph / 2, class: 'viz-axis-t', 'text-anchor': 'middle', transform: 'rotate(-90 11 ' + (mT + ph / 2) + ')' }, o.y.label));
  // series: muted context first, emphasised series on top
  const plot = sv('g', { 'clip-path': 'url(#' + id + ')' });
  const ordered = o.series.slice().sort((a, b) => (a.slot ? 1 : 0) - (b.slot ? 1 : 0));
  for (const s of ordered) {
    let d = '', pen = false;
    for (const [x, y] of s.pts) {
      if (!(isFinite(x) && isFinite(y) && (!ylog || y > 0))) { pen = false; continue; }
      const yy = ylog ? Math.max(y, o.y.min / 10) : y;
      d += (pen ? 'L' : 'M') + X(x).toFixed(2) + ' ' + Y(yy).toFixed(2);
      pen = true;
    }
    plot.append(sv('path', { d: d, class: 'viz-line' + (s.slot ? '' : ' muted'), style: s.slot ? 'stroke: var(--series-' + s.slot + ')' : null }));
  }
  svg.append(plot);
  for (const vl of (o.vlines || [])) {
    if (!(vl.x >= o.x.min && vl.x <= o.x.max)) continue;
    svg.append(sv('line', { x1: X(vl.x), y1: mT, x2: X(vl.x), y2: mT + ph, class: 'viz-vline' }));
    if (vl.label) svg.append(sv('text', { x: X(vl.x) + 4, y: mT + 10, class: 'viz-dlabel sm' }, vl.label));
  }
  // crosshair with keyboard support
  const cross = sv('line', { x1: 0, y1: mT, x2: 0, y2: mT + ph, class: 'viz-cross', visibility: 'hidden' });
  svg.append(cross);
  if (o.tip) {
    const ov = sv('rect', { x: mL, y: mT, width: pw, height: ph, class: 'viz-overlay', tabindex: '0', 'aria-label': o.title + ': use the arrow keys to read values' });
    let kx = (o.x.min + o.x.max) / 2;
    const showAt = (x, ev) => {
      x = Math.min(o.x.max, Math.max(o.x.min, x));
      kx = x;
      cross.setAttribute('x1', X(x)); cross.setAttribute('x2', X(x)); cross.setAttribute('visibility', 'visible');
      vizTip.show(ov, o.tip(x), ev);
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); vizTip.hide(); };
    ov.addEventListener('pointermove', ev => {
      const b = svg.getBoundingClientRect();
      showAt(xOf((ev.clientX - b.left) * W / b.width), ev);
    });
    ov.addEventListener('pointerleave', hide);
    ov.addEventListener('focus', () => showAt(kx));
    ov.addEventListener('blur', hide);
    ov.addEventListener('keydown', ev => {
      const st = (o.x.max - o.x.min) / 50;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); showAt(kx + st); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); showAt(kx - st); }
    });
    svg.append(ov);
  }
  // markers sit above the crosshair layer so they keep their own tooltip
  const mpts = [];
  for (const m of (o.markers || [])) {
    if (!isFinite(m.x) || !isFinite(m.y) || (ylog && m.y <= 0)) continue;
    // a point outside the axes is pinned to the edge and drawn hollow with an arrow
    // pointing the way it went, so it is never read as a value on the scale
    const dy = m.y < o.y.min ? 1 : m.y > o.y.max ? -1 : 0, dx = m.x < o.x.min ? -1 : m.x > o.x.max ? 1 : 0;
    const off = dx !== 0 || dy !== 0;
    const yy = Math.min(Math.max(m.y, o.y.min), o.y.max);
    const px = X(Math.min(Math.max(m.x, o.x.min), o.x.max)), py = Y(yy);
    const slot = m.slot || 1;
    const offTxt = dy > 0 ? 'below the scale' : dy < 0 ? 'above the scale' : 'off scale';
    const rows = (m.rows || [{ value: yfmt(m.y), label: m.label || '', slot: slot }])
      .concat(off ? [{ value: 'off scale', label: offTxt + ', drawn at the edge' }] : []);
    if (off) offMarker(svg, px, py, dx, dy, slot, rows);
    else marker(svg, px, py, slot, rows);
    if (m.label) mpts.push({ x: px, y: py, label: m.label + (off ? ' (' + offTxt + ')' : '') });
  }
  pointLabels(svg, mpts, mL + pw / 2, mT + ph / 2);
  const legItems = o.legend || o.series.filter(s => s.slot).map(s => ({ slot: s.slot, label: s.label, value: s.value || '' }));
  return vizFigure(o.title, svg, vizLegend(legItems, 'line'), o.note);
}

// Build the single self-contained offline file.
//   node build.js                         -> ../rf-calculator.html with every batch
//   node build.js --only=b1 --out=FILE    -> only the base app plus batch b1 (for isolated testing)
//   node build.js --only=none --out=FILE  -> the base app without any batch
// Batch N lives in src/bN.js (pure: formulas + calculator definitions),
// src/bN-ui.js (DOM: custom cards, charts) and src/bN.css; all are optional.
const fs = require('fs');
const path = require('path');

const arg = name => { const a = process.argv.find(x => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const SRC = path.join(__dirname, 'src');
const has = f => fs.existsSync(path.join(SRC, f));
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');

const only = arg('only');
const batches = ['b1', 'b2', 'b3', 'b4'].filter(b => !only || only.split(',').includes(b));

const pureFiles = ['core.js', 'data.js', 'rf.js', 'calcs.js'].concat(batches.map(b => b + '.js').filter(has));
const domFiles = ['charts.js', 'ui.js'].concat(batches.map(b => b + '-ui.js').filter(has));
const cssFiles = ['style.css'].concat(batches.map(b => b + '.css').filter(has));

const js = pureFiles.concat(domFiles).map(src).join('\n;\n');
const css = cssFiles.map(src).join('\n');
const html = src('template.html')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));

const out = arg('out') ? path.resolve(arg('out')) : path.join(__dirname, '..', 'rf-calculator.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' kB) with ' + (pureFiles.concat(domFiles).join(', ')));


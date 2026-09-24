'use strict';
/** --key value / --key=value / --flag 파서. 숫자처럼 보이면 숫자로. */
function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    let key = a.slice(2), val;
    const eq = key.indexOf('=');
    if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
    else val = true;
    if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    out[key] = val;
  }
  return out;
}

function parseSize(s, def) {
  const m = String(s || '').match(/^(\d+)[x*,](\d+)$/i);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : def;
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

module.exports = { parseArgs, parseSize, stamp };

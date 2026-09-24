/**
 * 본체 ↔ 그림·소리 모듈 이름 대조 (통합 검수용)
 *   node scripts/audit-keys.mjs          사람이 읽는 표
 *   node scripts/audit-keys.mjs --json   JSON 한 줄
 *
 * 1) 본체(src/main.ts, src/game, src/ui)가 부르는 스프라이트 key
 *    - 따옴표 안 글자 그대로의 key
 *    - 템플릿·데이터로 만드는 key 는 gdd-data.json 으로 펼침(대상·대표·아이템·스킬·트리·상권·지도 장식 …)
 *    → 그림 모듈의 SPRITE_KEYS + EXTRA_KEYS 에 있는지, 기본 그림(연분홍 네모)으로 떨어지지 않는지
 * 2) 본체가 부르는 효과음·배경음 이름 → src/audio/names.ts 의 sfxNames·tracks 에 있는지
 * 종료코드 0 = 불일치 0건
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const asJson = process.argv.includes('--json');

/* ── 본체 소스 ── */
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== '_stubs') walk(p, out);
    }
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const bodyFiles = [join(ROOT, 'src/main.ts'), ...walk(join(ROOT, 'src/game')), ...walk(join(ROOT, 'src/ui'))];
const src = bodyFiles.map((f) => ({ f: relative(ROOT, f).replace(/\\/g, '/'), s: readFileSync(f, 'utf8') }));

const KEY_RE = /(['"`])((?:t|c|i|ic|m|d|a|o|fx|n|bg|ui)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*(?:@[A-Za-z0-9_]+)?)\1/g;
const literal = new Map(); // key → [file:line]
for (const { f, s } of src) {
  s.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(KEY_RE)) {
      const k = m[2];
      if (!literal.has(k)) literal.set(k, []);
      literal.get(k).push(`${f}:${i + 1}`);
    }
  });
}
/* 템플릿 key (펼침 전 모양) */
const TPL_RE = /`((?:t|c|i|ic|m|d|a|o|fx|n|bg|ui)\.[^`]*\$\{[^`]*)`/g;
const templates = new Map();
for (const { f, s } of src) {
  s.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(TPL_RE)) {
      if (!templates.has(m[1])) templates.set(m[1], []);
      templates.get(m[1]).push(`${f}:${i + 1}`);
    }
  });
}

/* ── 데이터로 펼치는 key ── */
const D = JSON.parse(readFileSync(join(ROOT, 'src/data/gdd-data.json'), 'utf8'));
const expanded = new Map();
const want = (k, why) => {
  if (!expanded.has(k)) expanded.set(k, why);
};
for (const t of D.targets) {
  for (const st of ['idle', 'happy', 'hit']) want(`t.${t.id}@${st}`, 'targets × idle/happy/hit');
  if (t.beh === 'road') for (const st of ['up', 'down']) want(`t.${t.id}@${st}`, 'road targets × up/down');
  want(`t.${t.id}@blink`, 'targets × blink (EXTRA_KEYS)');
}
for (const c of D.characters) for (const st of ['idle', 'cheer']) want(`c.${c.id}@${st}`, 'characters × idle/cheer');
for (const it of D.items) want(`i.${it.id}`, 'items');
for (const [id, sk] of Object.entries(D.skills)) {
  want(`ic.${sk.icon}`, `skills.${id}.icon`);
  for (const sl of sk.sk || []) if (sl.ic) want(`ic.${sl.ic}`, `skills.${id}.sk[].ic`);
}
for (const n of D.tree) {
  want(n.icon, 'tree[].icon');
  for (const st of ['base', 'avail', 'ok', 'own']) want((n.key ? 'n.key.' : 'n.') + st, 'tree frame × state');
}
want('n.sel', 'tree sel');
want('n.key.sel', 'tree sel');
for (const d of D.districts) {
  want(`ic.dist_${d.id}`, 'districts icon');
  for (const o of ['land', 'port']) want(`m.${d.id}.ground@${o}`, 'maps ground');
  for (const o of ['land', 'port']) want(`m.${d.id}.roads@${o}`, 'maps roads');
}
for (const [did, byO] of Object.entries(D.maps)) for (const [o, m] of Object.entries(byO)) for (const dc of m.decor) want(dc.svgId, `maps.${did}.${o}.decor`);
for (let i = 1; i <= 5; i++) want(`o.gift@${i}`, 'gift tiers 1..5');
for (let i = 0; i < 4; i++) for (const ax of ['h', 'v']) want(`a.car${i}@${ax}`, 'cars × h/v');
for (let i = 0; i < 4; i++) for (const f of ['a', 'b']) want(`a.walker${i}@${f}`, 'walkers × a/b');
for (let i = 0; i < 3; i++) want(`bg.cloud${i}`, 'clouds');
for (let i = 0; i < 3; i++) want(`fx.runner${i}`, 'rush runners');
for (const o of ['land', 'port']) want(`bg.title@${o}`, 'title bg');

/* ── 그림 모듈 (vite ssr 로 실제 모듈을 불러 SVG 까지 만들어 봄) ── */
const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let reg, render, names;
const warns = [];
const ow = console.warn;
console.warn = (...a) => warns.push(a.join(' '));
try {
  reg = await server.ssrLoadModule('/src/art/registry.ts');
  render = await server.ssrLoadModule('/src/art/render.ts');
  names = await server.ssrLoadModule('/src/audio/names.ts');
} finally {
  console.warn = ow;
}
const artKeys = new Set([...reg.SPRITE_KEYS, ...reg.EXTRA_KEYS]);
const isFallback = (svg) => svg.includes('fill="#ffd6e0"') && svg.includes('stroke="#c96a86"');
const gapOf = new Map();
const artGap = (k) => {
  if (!gapOf.has(k)) {
    let bad = false;
    try {
      bad = isFallback(render.svgOfKey(k));
    } catch (e) {
      bad = 'error ' + e;
    }
    gapOf.set(k, bad);
  }
  return gapOf.get(k);
};

const report = { sprite: { literal: literal.size, expanded: expanded.size, missing: [], fallback: [], contractGaps: [] }, sfx: {}, templates: [] };
const used = new Map([...literal.entries()].map(([k, w]) => [k, w.join(', ')]));
for (const [k, why] of expanded) if (!used.has(k)) used.set(k, why);
for (const [k, where] of used) {
  if (!artKeys.has(k)) report.sprite.missing.push({ key: k, where });
  else if (artGap(k)) report.sprite.fallback.push({ key: k, where, why: artGap(k) });
}
/* 계약 전체(본체가 안 불러도) 중 그림이 비어 있는 것 */
for (const k of artKeys) if (artGap(k)) report.sprite.contractGaps.push(k);
/* 템플릿 모양이 실제 key 하나 이상과 맞는지 */
for (const [tpl, where] of templates) {
  const re = new RegExp('^' + tpl.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}(?:\})?/g, '[A-Za-z0-9_]+').replace(/\\\$\\\{.*$/, '.*') + '');
  const hit = [...artKeys].filter((k) => re.test(k));
  report.templates.push({ tpl, where: where.join(', '), matches: hit.length });
}

/* ── 소리 ── */
const sfxSet = new Set(names.sfxNames);
const trackSet = new Set(names.tracks);
const usedSfx = new Map();
const usedTrack = new Map();
for (const { f, s } of src) {
  s.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\bsfx\(\s*(?:[^'()]*\?\s*)?'([a-z_0-9]+)'(?:\s*:\s*'([a-z_0-9]+)')?/g)) {
      for (const n of [m[1], m[2]].filter(Boolean)) {
        if (!usedSfx.has(n)) usedSfx.set(n, []);
        usedSfx.get(n).push(`${f}:${i + 1}`);
      }
    }
    for (const m of line.matchAll(/\bmusic\(\s*'([a-z_0-9]+)'/g)) {
      if (!usedTrack.has(m[1])) usedTrack.set(m[1], []);
      usedTrack.get(m[1]).push(`${f}:${i + 1}`);
    }
  });
}
for (const c of D.fx.contract) if (c.sfx && !usedSfx.has(c.sfx)) usedSfx.set(c.sfx, ['gdd fx.contract[].sfx']);
/* 본체 계약 타입(contracts.ts)의 SfxName */
const contractTs = readFileSync(join(ROOT, 'src/game/contracts.ts'), 'utf8');
const typeBlock = contractTs.slice(contractTs.indexOf('export type SfxName'), contractTs.indexOf('export type Track'));
const contractSfx = [...typeBlock.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
report.sfx = {
  used: usedSfx.size,
  missing: [...usedSfx].filter(([n]) => !sfxSet.has(n)).map(([n, w]) => ({ name: n, where: w.join(', ') })),
  contractNotInAudio: contractSfx.filter((n) => !sfxSet.has(n)),
  audioNotInContract: names.sfxNames.filter((n) => !contractSfx.includes(n)),
  gddNotInAudio: (D.audioApi?.sfxNames || []).filter((n) => !sfxSet.has(n)),
  unusedByBody: names.sfxNames.filter((n) => !usedSfx.has(n)),
  tracksMissing: [...usedTrack].filter(([n]) => !trackSet.has(n)).map(([n, w]) => ({ name: n, where: w.join(', ') })),
};
await server.close();

const bad = report.sprite.missing.length + report.sprite.fallback.length + report.sfx.missing.length + report.sfx.contractNotInAudio.length + report.sfx.audioNotInContract.length + report.sfx.tracksMissing.length + report.templates.filter((t) => !t.matches).length;
if (asJson) console.log(JSON.stringify({ bad, ...report }));
else {
  console.log(`스프라이트: 본체 글자 그대로 ${literal.size}개 + 데이터로 펼친 ${expanded.size}개 = 대조 ${used.size}개, 그림 모듈 key ${artKeys.size}개`);
  console.log(`  그림 모듈에 없는 key ${report.sprite.missing.length}건`);
  for (const m of report.sprite.missing) console.log(`    - ${m.key}  (${m.where})`);
  console.log(`  기본 그림으로 떨어지는 key ${report.sprite.fallback.length}건`);
  for (const m of report.sprite.fallback) console.log(`    - ${m.key}  (${m.where})`);
  console.log(`  계약 key 중 그림 없는 것(본체 미사용 포함) ${report.sprite.contractGaps.length}건 ${report.sprite.contractGaps.join(' ')}`);
  console.log(`  템플릿 key ${report.templates.length}종, 실제 key 와 안 맞는 것 ${report.templates.filter((t) => !t.matches).length}건`);
  for (const t of report.templates.filter((t) => !t.matches)) console.log(`    - ${t.tpl}  (${t.where})`);
  console.log(`효과음: 본체 사용 ${usedSfx.size}종, 소리 모듈 ${sfxSet.size}종`);
  console.log(`  소리 모듈에 없는 이름 ${report.sfx.missing.length}건`);
  for (const m of report.sfx.missing) console.log(`    - ${m.name}  (${m.where})`);
  console.log(`  계약 타입에만 있는 이름 ${report.sfx.contractNotInAudio.length}건 ${report.sfx.contractNotInAudio.join(' ')}`);
  console.log(`  소리 모듈에만 있는 이름 ${report.sfx.audioNotInContract.length}건 ${report.sfx.audioNotInContract.join(' ')}`);
  console.log(`  설계서 목록에 있는데 소리 모듈에 없는 이름 ${report.sfx.gddNotInAudio.length}건`);
  console.log(`  소리 모듈에 있지만 본체가 안 부르는 이름 ${report.sfx.unusedByBody.length}건 ${report.sfx.unusedByBody.join(' ')}`);
  console.log(`배경음: 본체 사용 ${usedTrack.size}종, 없는 트랙 ${report.sfx.tracksMissing.length}건`);
  console.log(bad ? `불일치 ${bad}건` : '불일치 0건');
}
process.exit(bad ? 1 : 0);

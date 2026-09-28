/**
 * 지도 생성기 검사 (설계서 5장 합격 기준 5-1 ~ 5-4 · 5-8)
 *
 *   node scripts/map-check.mjs                 전부 (5-4 는 6상권 × 2방향 × 씨앗 200 × 영업일 1·60·120 = 7,200장)
 *   node scripts/map-check.mjs --quick         5-4 를 씨앗 20개로
 *   node scripts/map-check.mjs --json out.json 결과를 JSON 으로도 저장
 *   node scripts/map-check.mjs --dump <상권> <방향> <씨앗> <영업일>   지도 한 장 JSON 출력
 *
 * 종료코드 0 = 기준 전부 통과
 */
import { rolldown } from 'rolldown';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const out = join(ROOT, 'scripts', 'balance', '.cache', 'mapgen.mjs');
mkdirSync(dirname(out), { recursive: true });
const b = await rolldown({ input: join(ROOT, 'src/game/map/gen.ts'), platform: 'node', logLevel: 'silent' });
await b.write({ file: out, format: 'esm' });
await b.close();
const G = await import(pathToFileURL(out).href + '?t=' + Date.now());

const DIST = ['euljiro', 'gangnam', 'yeouido', 'pangyo', 'magok', 'sejong'];
const ORI = ['land', 'port'];

if (has('--dump')) {
  const i = argv.indexOf('--dump');
  const [d, o, s, day] = argv.slice(i + 1);
  console.log(JSON.stringify(G.genMap(d, o, Number(s), Number(day))));
  process.exit(0);
}

/* ── 지표 ── */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const mhash = (m) => hash(JSON.stringify(m));
/** 격자 안 도로 길이 중 축(0°·90°)에서 10° 넘게 벗어난 비율 */
function skew(m) {
  const g = m.grid;
  let tot = 0, off = 0;
  for (const s of m.streets || []) {
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], c = s.pts[i];
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      if (mx < g.x || mx > g.x + g.w || my < g.y || my > g.y + g.h) continue;
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      let ang = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI;
      ang = ((ang % 90) + 90) % 90;
      const dev = Math.min(ang, 90 - ang);
      tot += len;
      if (dev > 10) off += len;
    }
  }
  return tot ? off / tot : 0;
}
function dpSimplify(p, tol) {
  if (p.length < 3) return p.slice();
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const st = [[0, p.length - 1]];
  const dseg = (q, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
    let t = L2 ? ((q.x - a.x) * vx + (q.y - a.y) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(q.x - a.x - vx * t, q.y - a.y - vy * t);
  };
  while (st.length) {
    const [i, j] = st.pop();
    let mi = -1, md = tol;
    for (let k = i + 1; k < j; k++) {
      const d = dseg(p[k], p[i], p[j]);
      if (d > md) (md = d), (mi = k);
    }
    if (mi >= 0) {
      keep[mi] = 1;
      st.push([i, mi], [mi, j]);
    }
  }
  return p.filter((_, i) => keep[i]);
}
/** 사각형이 아닌 블록 비율(rel > 0 이면 단순화 허용 오차 = 블록 짧은 변 × rel, 참고용)(막다른 골목으로 합친 블록 묶음은 하나로): 꼭짓점 ≠ 4 또는 각 90±5° 밖 */
function nonRect(m, rel = 0) {
  const seen = new Set();
  let n = 0, bad = 0;
  for (const b of m.blocks) {
    if (b.grp !== undefined) {
      if (seen.has(b.grp)) continue;
      seen.add(b.grp);
      n++;
      bad++;
      continue;
    }
    n++;
    const poly = b.poly || [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    const closed = [...poly, poly[0]];
    const s = dpSimplify(closed, Math.max(2.5, rel * Math.min(b.w, b.h))).slice(0, -1);
    if (s.length !== 4) {
      bad++;
      continue;
    }
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const a = s[(i + 3) % 4], c = s[i], d = s[(i + 1) % 4];
      const v1 = { x: a.x - c.x, y: a.y - c.y }, v2 = { x: d.x - c.x, y: d.y - c.y };
      const ang = (Math.acos((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))) * 180) / Math.PI;
      if (Math.abs(ang - 90) > 5) ok = false;
    }
    if (!ok) bad++;
  }
  return n ? bad / n : 0;
}
const lotsOf = (m) => m.spawnSlots.filter((s) => s.kind === 'lot');
/** A 의 부지마다 B 의 가장 가까운 부지까지 거리 평균(lot 단위) */
function shift(A, B) {
  const a = lotsOf(A), bb = lotsOf(B);
  let s = 0;
  for (const p of a) {
    let md = Infinity;
    for (const q of bb) md = Math.min(md, Math.hypot(p.x - q.x, p.y - q.y));
    s += md;
  }
  return s / a.length / A.lot;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const fx = (v, n = 3) => Number(v.toFixed(n));

const res = { pass: {}, detail: {} };
let fail = 0;
const judge = (id, ok, info) => {
  res.pass[id] = ok;
  res.detail[id] = info;
  if (!ok) fail++;
  console.log(`${ok ? '통과' : '실패'}  ${id}  ${typeof info === 'string' ? info : JSON.stringify(info)}`);
};

/* 5-1 결정적 */
{
  let same = 0, n = 0;
  for (const d of DIST) for (const o of ORI) for (const s of [1, 7, 12345]) {
    n++;
    if (mhash(G.genMap(d, o, s, 1)) === mhash(G.genMap(d, o, s, 1))) same++;
  }
  judge('5-1', same === n, `같은 인자 두 번 해시 같음 ${same}/${n}`);
}
/* 5-2 씨앗 1~20 해시 · 연속 두 씨앗 부지 이동 */
{
  const info = {};
  let ok = true;
  for (const [d, need] of [['euljiro', 0.35], ['sejong', 0.25]]) {
    const ms = [];
    for (let s = 1; s <= 20; s++) ms.push(G.genMap(d, 'land', s, 1));
    const hs = new Set(ms.map(mhash));
    const sh = [];
    for (let i = 1; i < ms.length; i++) sh.push(shift(ms[i - 1], ms[i]));
    info[d] = { hashes: hs.size, shiftMean: fx(mean(sh)), shiftMin: fx(Math.min(...sh)), need };
    if (hs.size !== 20 || mean(sh) < need) ok = false;
  }
  /* 실제 게임 씨앗: 같은 저장(시작 시각)의 연속 10영업일 */
  const started = 1790000000000;
  for (const d of ['euljiro', 'sejong']) {
    const ms = [];
    for (let runs = 0; runs < 10; runs++) ms.push(G.genMap(d, 'land', G.mapSeed(started, runs, d, 'land'), runs + 1));
    const hs = new Set(ms.map(mhash));
    const sh = [];
    for (let i = 1; i < ms.length; i++) sh.push(shift(ms[i - 1], ms[i]));
    info[d + '_10days'] = { hashes: hs.size, shiftMean: fx(mean(sh)), shiftMin: fx(Math.min(...sh)) };
    if (hs.size !== 10) ok = false;
  }
  judge('5-2', ok, info);
}
/* 5-3 곡률·직교성 (씨앗 100, 1영업일) */
{
  const info = {};
  for (const d of DIST) {
    const sk = [], nr = [], nl = [];
    for (let s = 1; s <= 100; s++) {
      const m = G.genMap(d, 'land', s, 1);
      sk.push(skew(m));
      nr.push(nonRect(m));
      nl.push(nonRect(m, 0.02));
    }
    info[d] = { skew: fx(mean(sk)), nonRect: fx(mean(nr)), nonRectLoose: fx(mean(nl)) };
  }
  const ok = info.euljiro.skew >= 0.4 && info.sejong.skew <= 0.05 && info.euljiro.nonRect >= 0.5 && info.sejong.nonRect <= 0.1;
  judge('5-3', ok, info);
}
/* 5-8 누적 영업일 따라 정형화 (을지로 가로 씨앗 100) */
{
  const info = {};
  const days = [1, 30, 60, 120];
  for (const day of days) {
    const sk = [], nr = [], nl = [];
    for (let s = 1; s <= 100; s++) {
      const m = G.genMap('euljiro', 'land', s, day);
      sk.push(skew(m));
      nr.push(nonRect(m));
      nl.push(nonRect(m, 0.02));
    }
    info['d' + day] = { skew: fx(mean(sk)), nonRect: fx(mean(nr)), nonRectLoose: fx(mean(nl)) };
  }
  const sj = { skew: 0, nonRect: 0 };
  {
    const sk = [], nr = [];
    for (let s = 1; s <= 100; s++) {
      const m = G.genMap('sejong', 'land', s, 1);
      sk.push(skew(m));
      nr.push(nonRect(m));
    }
    sj.skew = mean(sk);
    sj.nonRect = mean(nr);
  }
  let ok = true;
  for (let i = 1; i < days.length; i++) {
    const a = info['d' + days[i - 1]], c = info['d' + days[i]];
    if (!(c.skew <= a.skew && c.nonRect <= a.nonRect)) ok = false;
  }
  const e = info.d120;
  if (e.skew > Math.max(sj.skew * 1.5, 0.005) || e.nonRect > Math.max(sj.nonRect * 1.5, 0.005)) ok = false;
  info.sejong_d1 = { skew: fx(sj.skew), nonRect: fx(sj.nonRect) };
  judge('5-8', ok, info);
}
/* 5-4 전수 검사 */
{
  const seeds = has('--quick') ? 20 : 200;
  const days = [1, 60, 120];
  const sum = { maps: 0, pair: 0, road: 0, area: 0, triple: 0, decor: 0, routeEnds: 0, bigRoad: 0, bigOverlap: 0, lotsOut: 0, bigsLow: 0, routesOut: 0, plazaBad: 0, fallback: 0, orgMaps: 0 };
  const lotsR = { min: Infinity, max: 0 }, bigR = { min: Infinity, max: 0 }, rtR = { min: Infinity, max: 0 };
  const byMode = { grid: [], org: [] };
  let tGen = 0;
  for (const d of DIST)
    for (const o of ORI)
      for (let s = 1; s <= seeds; s++)
        for (const day of days) {
          const t0 = performance.now();
          const m = G.genMap(d, o, s * 7919 + day, day);
          tGen += performance.now() - t0;
          const c = G.checkMap(m);
          sum.maps++;
          for (const k of ['pair', 'road', 'area', 'triple', 'decor', 'routeEnds', 'bigRoad', 'bigOverlap']) sum[k] += c[k];
          const lim = m.mode === 'grid' ? [50, 66] : [42, 66];
          if (c.lots < lim[0] || c.lots > lim[1]) sum.lotsOut++;
          if (c.bigs < 12 || c.bigs > 20) sum.bigsLow++;
          if (c.routes < 4 || c.routes > 6) sum.routesOut++;
          if (c.plaza !== 1) sum.plazaBad++;
          if (m.tries >= 10) sum.fallback++;
          if (G.orgFor(d, day, s * 7919 + day) >= 0.25) sum.orgMaps++;
          byMode[m.mode].push(c.lots);
          lotsR.min = Math.min(lotsR.min, c.lots);
          lotsR.max = Math.max(lotsR.max, c.lots);
          bigR.min = Math.min(bigR.min, c.bigs);
          bigR.max = Math.max(bigR.max, c.bigs);
          rtR.min = Math.min(rtR.min, c.routes);
          rtR.max = Math.max(rtR.max, c.routes);
        }
  const fbRate = sum.orgMaps ? sum.fallback / sum.orgMaps : 0;
  const ok = !sum.pair && !sum.road && !sum.area && !sum.triple && !sum.decor && !sum.routeEnds && !sum.bigRoad && !sum.bigOverlap && !sum.lotsOut && !sum.bigsLow && !sum.routesOut && !sum.plazaBad && fbRate <= 0.05;
  judge('5-4', ok, {
    ...sum, fallbackRate: fx(fbRate), lots: lotsR, bigs: bigR, routes: rtR,
    lotsMeanGrid: fx(mean(byMode.grid), 1), lotsMeanOrg: fx(mean(byMode.org), 1), genMsAvg: fx(tGen / sum.maps, 2),
  });
}

if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 1));
console.log(fail ? `실패 ${fail}건` : '전부 통과');
process.exit(fail ? 1 : 0);

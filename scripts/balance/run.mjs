/**
 * 밸런스 시뮬 실행기: sim.ts 를 rolldown 으로 묶어(node 용) 불러 돌린다.
 *
 *   node scripts/balance/run.mjs                              봇 3종 × 정책 2종 × 시드 3개, 게임 시간 4시간
 *   node scripts/balance/run.mjs --bot normal --policy cheap --seeds 5 --hours 2
 *   node scripts/balance/run.mjs --first 30 --bot normal      새 저장 첫 판만 30번 (실제 게임 대조용)
 *   node scripts/balance/run.mjs --lockcheck                 잠김 검사(1경씩 주고 모든 칸 buyNode: 선행 없이 산 칸 · 교착)
 *   node scripts/balance/run.mjs --radius 80                  새 저장 첫 영업일 반경 밀도(설계서 0-2), 보통·몰이·서툰 × 가로·세로
 *   node scripts/balance/run.mjs --label before               결과를 scripts/balance/out/before.json 으로
 *   옵션: --orient land|port  --runs N(판 수 상한)  --md 파일(표를 마크다운으로 저장)  --bot clumsyOld(옛 서툰, 비교용)
 *   환경변수 SIM_DATA=<json 경로>: src/data/gdd-data.json 대신 그 데이터로 돌림(기준선·실험용. 게임 파일은 안 건드림)
 *
 * 결과: 표준출력에 표, scripts/balance/out/<label>.json 에 판별 기록·구매 이력·이정표 전부
 */
import { rolldown } from 'rolldown';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleName, dataRedirect } from './econ.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);

/* 1) 묶기 */
const outFile = join(HERE, '.cache', bundleName('sim'));
mkdirSync(dirname(outFile), { recursive: true });
const bundle = await rolldown({ input: join(HERE, 'sim.ts'), platform: 'node', logLevel: 'silent', plugins: [dataRedirect()] });
await bundle.write({ file: outFile, format: 'esm' });
await bundle.close();

/* 2) 난수 바꿔 끼우기(게임 모듈이 읽히기 전에) */
globalThis.__simRand = () => 0.5;
Math.random = () => globalThis.__simRand();
const sim = await import(pathToFileURL(outFile).href + '?t=' + Date.now());
const { fmt } = sim;
const won = (n) => fmt(Math.round(n)) + '원';
const num = (n) => fmt(Math.round(n));
const f1 = (x) => (x == null ? '-' : (Math.round(x * 10) / 10).toString());
const f2 = (x) => (x == null ? '-' : (Math.round(x * 100) / 100).toString());
const pc = (x) => (x == null || !Number.isFinite(x) ? '-' : `${(x * 100).toFixed(1)}%`);

/* 3) 첫 판만 */
if (has('--first')) {
  const n = Number(flag('--first', 30));
  const bot = flag('--bot', 'normal');
  const rs = sim.firstRuns(bot, n, flag('--orient', 'land'));
  const k = (f) => rs.map(f);
  const st = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    const s = [...a].sort((x, y) => x - y);
    return { mean: m, sd, min: s[0], p50: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
  };
  const counts = {};
  for (const r of rs) for (const id in r.counts) counts[id] = (counts[id] || 0) + r.counts[id] / rs.length;
  const res = { bot, n, counts, rev: st(k((r) => r.rev)), gmv: st(k((r) => r.gmv)), comm: st(k((r) => r.comm)), fee: st(k((r) => r.fee)), tech: st(k((r) => r.tech)), count: st(k((r) => r.count)), corps: st(k((r) => r.corps)), stores: st(k((r) => r.stores)) };
  console.log(JSON.stringify(res));
  process.exit(0);
}

/* 3-0) 아이템 등급 첫 값 정하기(설계서 4-4): 보통·싼 칸 N시드, 등급 k 가 열린 영업일의 하루 기술력 중앙값 × K(기본 1.5), 앞 등급 × 1.2 이상 */
if (has('--itemcost')) {
  const n = Number(flag('--itemcost', 3)) || 3;
  const K = Number(flag('--k', 1.5));
  const cs = [];
  for (let s = 1; s <= n; s++) cs.push(sim.runCareer({ bot: 'normal', policy: 'cheap', seed: s, hours: 4, quiet: true }));
  const med = (a) => {
    const x = [...a].sort((p, q) => p - q);
    return x.length ? x[Math.floor(x.length / 2)] : NaN;
  };
  const r2 = (x) => {
    if (x < 100) return Math.max(1, Math.round(x));
    const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return Math.ceil(x / p) * p;
  };
  const out = [];
  const inc = [];
  for (let g = 1; g <= 20; g++) {
    const v = cs.map((c) => c.runs.find((r) => r.gradeCap >= g)).filter(Boolean).map((r) => r.tech);
    const m = med(v);
    inc.push(Math.round(m));
    let c = r2(m * K);
    if (g > 1) c = Math.max(c, r2(out[g - 2] * 1.2));
    out.push(c);
  }
  console.log(JSON.stringify({ techAtOpen: inc, first: out }));
  process.exit(0);
}

/* 3-1) 잠김 검사(설계서 4-2·4-5) */
if (has('--lockcheck')) {
  console.log(JSON.stringify(sim.lockCheck(), null, 1));
  process.exit(0);
}

/* 3-2) 반경 밀도 */
if (has('--radius')) {
  const n = Number(flag('--radius', 80));
  const bots = (flag('--bot', 'normal,cluster,clumsy')).split(',');
  const orients = (flag('--orient', 'land,port')).split(',');
  const L = [];
  L.push(`# 반경 밀도 — 새 저장 첫 영업일 ${n}판, 0.1초마다 반경 안 대상 수(logic inR), 1초마다 최선 자리 최대`);
  L.push('');
  L.push('| 방향 | 봇 | R(px) | 반경에 1곳↑ 표본 | 그중 ≤2곳 | 1곳 | 3곳↑ | 최대 | 최선 자리 ≤2 | 1일 매출 | 계약 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  const BN = { normal: '보통', cluster: '몰이', clumsy: '서툰(새)', clumsyOld: '서툰(옛)', good: '잘함' };
  const out = [];
  for (const orient of orients)
    for (const bot of bots) {
      const d = sim.firstDayRadius(bot, n, orient);
      const tot = Object.values(d.hist).reduce((a, b) => a + b, 0);
      const pos = tot - (d.hist[0] || 0);
      const le2 = (d.hist[1] || 0) + (d.hist[2] || 0);
      const potTot = Object.values(d.pot).reduce((a, b) => a + b, 0);
      const potLe2 = Object.entries(d.pot).filter(([k]) => Number(k) <= 2).reduce((a, [, v]) => a + v, 0);
      const row = { orient, bot, R: d.R, pos: pos / tot, le2: le2 / pos, one: (d.hist[1] || 0) / pos, ge3: (pos - le2) / pos, maxIn: d.maxIn, potLe2: potLe2 / potTot, rev: d.rev, count: d.count };
      out.push(row);
      L.push(`| ${orient} | ${BN[bot] || bot} | ${f1(d.R)} | ${pc(row.pos)} | ${pc(row.le2)} | ${pc(row.one)} | ${pc(row.ge3)} | ${d.maxIn} | ${pc(row.potLe2)} | ${won(d.rev)} | ${f1(d.count)} |`);
      process.stderr.write(`${orient} ${bot} 끝\n`);
    }
  mkdirSync(join(HERE, 'out'), { recursive: true });
  writeFileSync(join(HERE, 'out', `radius-${flag('--label', 'latest')}.json`), JSON.stringify(out));
  console.log(L.join('\n'));
  if (flag('--md')) writeFileSync(flag('--md'), L.join('\n'));
  process.exit(0);
}

/* 4) 경력 돌리기 */
const bots = flag('--bot', 'all') === 'all' ? ['clumsy', 'normal', 'good'] : flag('--bot').split(',');
const pols = flag('--policy', 'all') === 'all' ? ['cheap', 'eff'] : flag('--policy').split(',');
const seeds = Number(flag('--seeds', 3));
const hours = Number(flag('--hours', 4));
const maxRuns = flag('--runs') ? Number(flag('--runs')) : undefined;
const orient = flag('--orient', 'land');
const label = flag('--label', 'latest');
const t0 = Date.now();
const all = [];
for (const bot of bots) {
  for (const policy of pols) {
    const cs = [];
    for (let s = 1; s <= seeds; s++) cs.push(sim.runCareer({ bot, policy, seed: s, hours, maxRuns, orient, quiet: has('--quiet') }));
    const sum = sim.summarize(cs);
    all.push({ sum, careers: cs.map((c) => ({ opts: c.opts, milestones: c.milestones, buys: c.buys, runs: c.runs })) });
    process.stderr.write(`${sum.label} 끝 (${((Date.now() - t0) / 1000).toFixed(0)}초)\n`);
  }
}
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', `${label}.json`), JSON.stringify({ at: new Date().toISOString(), hours, seeds, orient, results: all }));

/* 5) 표 */
const L = [];
const p = (s) => L.push(s);
const tm = (m) => (m == null ? '-' : m < 60 ? `${f1(m)}분` : `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분`);
const DN = { euljiro: '을지로', gangnam: '강남', yeouido: '여의도', pangyo: '판교', magok: '마곡', sejong: '세종' };
p(`# 밸런스 시뮬 (${label}) — 시드 ${seeds}개, 게임 시간 ${hours}시간, ${orient}`);
p('');
p('## 첫 영업일 (업그레이드 없음, 시드 평균)');
p('');
p('| 봇·정책 | 매출 | 수수료 | 이용료 | 기술력 | 거래액 | 계약 | 계약 1건 매출(최소~최대) | 0원 계약 | 첫 구매 영업일(평균·최대) |');
p('|---|---|---|---|---|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${won(s.first.rev)} | ${won(s.first.comm)} | ${won(s.first.fee)} | ${num(s.first.tech)} | ${won(s.first.gmv)} | ${f1(s.first.count)} | ${won(s.first.minC)} ~ ${won(s.first.maxC)} | ${f1(s.first.zero)} | ${f1(s.first.buyRun)} · ${s.first.maxBuyRun} |`);
p('');
p('## 시점별 (매출·기술력·거래액은 시드 기하평균, R÷R₀ 는 중앙값)');
for (const { sum: s } of all) {
  p('');
  p(`### ${s.label}`);
  p('');
  p('| 시점 | 영업일 | 누적 시간 | 매출/일 | 기술력/일 | 기술력÷매출 | 거래액/일 | 트리 칸(레벨) | 레벨 | 상권 | 계약 | 최고 대상 | R÷R₀ | 설득력·반경 Lv |');
  p('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of s.checkpoints) p(`| ${c.at} | ${f1(c.run)} | ${tm(c.tMin)} | ${won(c.rev)} | ${num(c.tech)} | ${f2(c.ratio)} | ${won(c.gmvRun)} | ${f1(c.nodes)} (${f1(c.levels)}) | ${f1(c.lv)} | ${DN[c.district] || c.district} | ${f1(c.count)} | ${c.topName} | ${f2(c.Rk)} | ${f1(c.baseP)} · ${f1(c.baseR)} |`);
}
p('');
p('## 이정표 (영업일 · 누적 시간, 시드 평균. 괄호 = 도달한 시드 수)');
p('');
p('| 이정표 | ' + all.map((a) => a.sum.label).join(' | ') + ' |');
p('|---|' + all.map(() => '---').join('|') + '|');
for (let i = 0; i < all[0].sum.milestones.length; i++) {
  const m0 = all[0].sum.milestones[i];
  p(`| ${m0.name} | ` + all.map((a) => {
    const m = a.sum.milestones[i];
    return m.run == null ? '-' : `${f1(m.run)}일 · ${tm(m.tMin)}${m.n < a.sum.seeds ? ` (${m.n})` : ''}`;
  }).join(' | ') + ' |');
}
p('');
p('## 막힘·폭주 (구매 = 트리 + 기본 역량 + 스킬·아이템·관리, 레벨 올리기 포함)');
p('');
p('| 봇·정책 | 1~12일 하루 트리 칸(레벨 포함) 평균 / 최대 · 3칸 이상 날 | 1~12일 하루 구매 전체 평균 / 최대 | 1~10일 하루 구매 | 아무것도 못 산 영업일 연속 최대(시작) | 트리 구매 0 연속 최대 | 5일 이상 트리 막힘 | 전체 한 번에 산 트리 칸 최대(영업일) |');
p('|---|---|---|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${f1(s.burst.avg12tree)} / ${s.burst.max12tree} · ${s.burst.days3tree} | ${f1(s.burst.avg12)} / ${s.burst.max12} | ${s.burst.first10.map(f1).join(' ')} | ${s.stallAny.max}일 (${s.stallAny.at}일) | ${s.stall.maxNoBuy}일 | ${s.stall.streaks5} | ${s.burst.maxAll} (${s.burst.at}일) |`);
p('');
p('## 두 재화 (설계서 2-4)');
p('');
p('| 봇·정책 | 1~10일 매출로 산 레벨 | 1~10일 기술력으로 산 레벨 | 10일 구간 지출÷수입 최소(매출) | (기술력) | 구간별 기술력 지출÷수입 |');
p('|---|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${f1(s.cur.rev10)} | ${f1(s.cur.tech10)} | ${pc(s.cur.minShareRev)} | ${pc(s.cur.minShareTech)} | ${s.cur.windows.map((w) => `${w.from}:${Math.round((w.techOut / Math.max(1, w.techIn)) * 100)}`).join(' ')} |`);
p('');
p('## 기본 역량 (설계서 3장)');
p('');
p('| 봇·정책 | 10일까지 합 | 50일 설득력 · 반경 | 2레벨 이상 산 날(1~50일) | 반경 30레벨 |');
p('|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${f1(s.basic.sum10)} | ${f1(s.basic.p50)} · ${f1(s.basic.r50)} | ${pc(s.basic.days2plus)} | ${s.basic.brMaxRun == null ? '-' : f1(s.basic.brMaxRun) + '일'} |`);
p('');
p('## 아이템 등급 첫 값 ÷ 그 등급이 열린 날 하루 기술력 (설계서 4-4, 0.5~5)');
p('');
p('| 봇·정책 | 등급 1~20 |');
p('|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${s.items.map((x) => (x == null ? '-' : f2(x))).join(' ')} |`);
/* 실제 게임 대조용(play-real.cjs --repeat): 영업일별 산술 평균 */
if (has('--perday')) {
  const nDays = Number(flag('--perday', 3)) || 3;
  p('');
  p(`## 영업일별 산술 평균 (1~${nDays}영업일, 시드 ${seeds}개)`);
  p('');
  p('| 봇·정책 | 영업일 | 매출 | 기술력 | 거래액 | 계약 | 구매 |');
  p('|---|---|---|---|---|---|---|');
  const perDay = [];
  for (const { sum: s, careers } of all) {
    for (let i = 0; i < nDays; i++) {
      const rs = careers.map((c) => c.runs[i]).filter(Boolean);
      const a = (f) => rs.reduce((x, r) => x + f(r), 0) / Math.max(1, rs.length);
      const row = { label: s.label, day: i + 1, rev: a((r) => r.rev), tech: a((r) => r.tech), gmv: a((r) => r.gmv), count: a((r) => r.count), bought: a((r) => r.bought) };
      perDay.push(row);
      p(`| ${s.label} | ${i + 1} | ${f1(row.rev)} | ${f1(row.tech)} | ${f1(row.gmv)} | ${f1(row.count)} | ${f2(row.bought)} |`);
    }
  }
  writeFileSync(join(HERE, 'out', `${label}-perday.json`), JSON.stringify(perDay));
}
const md = L.join('\n');
console.log(md);
if (flag('--md')) writeFileSync(flag('--md'), md);
process.stderr.write(`총 ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);

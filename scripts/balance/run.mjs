/**
 * 밸런스 시뮬 실행기: sim.ts 를 rolldown 으로 묶어(node 용) 불러 돌린다.
 *
 *   node scripts/balance/run.mjs                              봇 3종 × 정책 2종 × 시드 3개, 게임 시간 4시간
 *   node scripts/balance/run.mjs --bot normal --policy cheap --seeds 5 --hours 2
 *   node scripts/balance/run.mjs --first 30 --bot normal      새 저장 첫 판만 30번 (실제 게임 대조용)
 *   node scripts/balance/run.mjs --label before               결과를 scripts/balance/out/before.json 으로
 *   옵션: --orient land|port  --runs N(판 수 상한)  --md 파일(표를 마크다운으로 저장)
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
  const res = { bot, n, counts, rev: st(k((r) => r.rev)), gmv: st(k((r) => r.gmv)), comm: st(k((r) => r.comm)), fee: st(k((r) => r.fee)), count: st(k((r) => r.count)), corps: st(k((r) => r.corps)), stores: st(k((r) => r.stores)) };
  console.log(JSON.stringify(res));
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
const f1 = (x) => (x == null ? '-' : (Math.round(x * 10) / 10).toString());
const tm = (m) => (m == null ? '-' : m < 60 ? `${f1(m)}분` : `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분`);
const DN = { euljiro: '을지로', gangnam: '강남', yeouido: '여의도', pangyo: '판교', magok: '마곡', sejong: '세종' };
p(`# 밸런스 시뮬 (${label}) — 시드 ${seeds}개, 게임 시간 ${hours}시간, ${orient}`);
p('');
p('## 첫 판 (업그레이드 없음, 시드 평균)');
p('');
p('| 봇·정책 | 판 매출 | 수수료 | 이용료 | 거래액 | 계약 | 계약 1건 매출(최소~최대) | 0원 계약 | 첫 구매 판 |');
p('|---|---|---|---|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${won(s.first.rev)} | ${won(s.first.comm)} | ${won(s.first.fee)} | ${won(s.first.gmv)} | ${f1(s.first.count)} | ${won(s.first.minC)} ~ ${won(s.first.maxC)} | ${f1(s.first.zero)} | ${f1(s.first.buyRun)} |`);
p('');
p('## 시점별 (판 매출·판 거래액·누적 거래액은 시드 기하평균)');
for (const { sum: s } of all) {
  p('');
  p(`### ${s.label}`);
  p('');
  p('| 시점 | 판 | 누적 시간 | 판 매출 | 판 거래액 | 누적 거래액 | 트리 칸(레벨) | 레벨 | 상권 | 계약 | 최고 대상 |');
  p('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of s.checkpoints) p(`| ${c.at} | ${f1(c.run)} | ${tm(c.tMin)} | ${won(c.rev)} | ${won(c.gmvRun)} | ${won(c.gmvTotal)} | ${f1(c.nodes)} (${f1(c.levels)}) | ${f1(c.lv)} | ${DN[c.district] || c.district} | ${f1(c.count)} | ${c.topName} |`);
}
p('');
p('## 이정표 (판 · 누적 시간, 시드 평균. 괄호 = 도달한 시드 수)');
p('');
p('| 이정표 | ' + all.map((a) => a.sum.label).join(' | ') + ' |');
p('|---|' + all.map(() => '---').join('|') + '|');
for (let i = 0; i < all[0].sum.milestones.length; i++) {
  const m0 = all[0].sum.milestones[i];
  p(`| ${m0.name} | ` + all.map((a) => {
    const m = a.sum.milestones[i];
    return m.run == null ? '-' : `${f1(m.run)}판 · ${tm(m.tMin)}${m.n < a.sum.seeds ? ` (${m.n})` : ''}`;
  }).join(' | ') + ' |');
}
p('');
p('## 막힘·폭주');
p('');
p('| 봇·정책 | 트리 구매 0 연속 최대 | 그 시작 판 | 5판 이상 막힘 횟수 | 아무것도 못 산 판 연속 최대 | 처음 10분 판당 트리 구매(평균) | 처음 10분 한 번에 산 최대 칸 | 그중 비용 ≥ 판 매출 10% 최대 | 전체 한 번에 산 최대 칸(판) | 1~10판 판당 구매 |');
p('|---|---|---|---|---|---|---|---|---|---|');
for (const { sum: s } of all) p(`| ${s.label} | ${s.stall.maxNoBuy}판 | ${s.stall.at}판 · ${tm(s.stall.tMin)} | ${s.stall.streaks5} | ${s.stallAny.max}판 | ${f1(s.burst.avg10)} | ${s.burst.max10} | ${s.burst.big10} | ${s.burst.maxAll} (${s.burst.at}판) | ${s.burst.first10.map(f1).join(' ')} |`);
const md = L.join('\n');
console.log(md);
if (flag('--md')) writeFileSync(flag('--md'), md);
process.stderr.write(`총 ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);

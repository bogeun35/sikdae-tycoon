/**
 * 트리 비용 보정: 거리 d 칸을 산 순간의 "비용 ÷ 직전 판 매출"(구매 비율)이 목표가 되도록 C1[d] 를 되풀이해 맞춘다.
 *   node scripts/balance/calib.mjs [--iter 6] [--seeds 3] [--hours 3] [--bots normal] [--target 0.5]
 * 끝나면 맞춘 C1 을 출력한다(econ.mjs SPEC.tree.C1 에 옮겨 적을 것). gdd-data.json 은 마지막 C1 로 적용된 상태로 남는다.
 * SIM_DATA=<복사본 json> 으로 돌리면 게임 데이터 대신 그 복사본을 고친다(실험용).
 *   옵션: --policies cheap,eff  --bots normal  --lv1(첫 레벨 구매만 셈)  --minstep 2.5(거리마다 최소 배수)  --targets 거리별 목표 비율
 */
import { rolldown } from 'rolldown';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SPEC, DATA_FILE, apply, bundleName, cloneSpec, dataRedirect, round2 } from './econ.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const ITER = Number(flag('--iter', 6));
const SEEDS = Number(flag('--seeds', 3));
const HOURS = Number(flag('--hours', 3));
const BOTS = flag('--bots', 'normal').split(',');
const POLS = flag('--policies', 'cheap,eff').split(',');
const TGT = Number(flag('--target', 0.5));
const ALPHA = Number(flag('--alpha', 0.8));
/** 첫 레벨 구매만 셀지 · 이웃 거리 비용의 최소 배수(단조 증가 강제) */
const LV1 = argv.includes('--lv1');
const MINSTEP = Number(flag('--minstep', 0));
/** 거리별 목표 구매 비율(없으면 --target) */
const TARGETS = flag('--targets', '') ? flag('--targets').split(',').map(Number) : [];

globalThis.__simRand = () => 0.5;
Math.random = () => globalThis.__simRand();

const spec = cloneSpec(SPEC);
const D0 = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const dOf = Object.fromEntries(D0.tree.map((n) => [n.id, n.d]));
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
mkdirSync(join(HERE, '.cache'), { recursive: true });
for (let it = 0; it <= ITER; it++) {
  const D = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  apply(D, spec);
  writeFileSync(DATA_FILE, JSON.stringify(D, null, 1));
  if (it === ITER) break;
  const outFile = join(HERE, '.cache', bundleName('sim-cal'));
  const b = await rolldown({ input: join(HERE, 'sim.ts'), platform: 'node', logLevel: 'silent', plugins: [dataRedirect()] });
  await b.write({ file: outFile, format: 'esm' });
  await b.close();
  const sim = await import(pathToFileURL(outFile).href + '?i=' + it + '_' + Date.now());
  const ratios = {};
  const done = [];
  for (const bot of BOTS) for (const policy of POLS) for (let s = 1; s <= SEEDS; s++) {
    const c = sim.runCareer({ bot, policy, seed: s, hours: HOURS, quiet: true, stopWhenDone: true });
    const fin = c.milestones.find((m) => m.key === 'treeAll');
    done.push(fin ? fin.tMin : null);
    for (const x of c.buys) {
      const d = dOf[x.id];
      if (x.id.startsWith('d_')) continue;
      if (LV1 && x.lv !== 1) continue;
      (ratios[d] = ratios[d] || []).push(x.ratio);
    }
  }
  const line = [];
  for (let d = 0; d < spec.tree.C1.length; d++) {
    const r = ratios[d];
    const m = r && r.length >= 3 ? med(r) : NaN;
    const tg = TARGETS[d] ?? TGT;
    line.push(`d${d}:${Number.isFinite(m) ? m.toFixed(2) : '-'}`);
    if (Number.isFinite(m) && m > 0) {
      const f = Math.min(3, Math.max(1 / 3, Math.pow(tg / m, ALPHA)));
      spec.tree.C1[d] = round2(spec.tree.C1[d] * f);
    }
  }
  if (MINSTEP) for (let d = 2; d < spec.tree.C1.length; d++) spec.tree.C1[d] = round2(Math.max(spec.tree.C1[d], spec.tree.C1[d - 1] * MINSTEP));
  const fin = done.filter((x) => x != null);
  process.stderr.write(`#${it} 비율 ${line.join(' ')} | 트리 완주 ${fin.length}/${done.length} 평균 ${fin.length ? (fin.reduce((a, b) => a + b, 0) / fin.length).toFixed(0) : '-'}분\n`);
}
console.log(JSON.stringify(spec.tree.C1));

/**
 * 시뮬 결과(out/<label>.json)에서 경력 한 개를 판별로 보여 준다(조정 중 눈으로 보는 용도).
 *   node scripts/balance/show.mjs <label> [--bot normal] [--policy cheap] [--seed 1] [--runs 60] [--buys]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const label = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'latest';
const J = JSON.parse(readFileSync(join(HERE, 'out', `${label}.json`), 'utf8'));
const bot = flag('--bot', 'normal');
const pol = flag('--policy', 'cheap');
const seed = Number(flag('--seed', 1));
const maxR = Number(flag('--runs', 60));
const c = J.results.flatMap((r) => r.careers).find((k) => k.opts.bot === bot && k.opts.policy === pol && k.opts.seed === seed);
if (!c) throw new Error('없음');
const U = ['', '만', '억', '조', '경'];
const f = (n) => {
  n = Math.round(n);
  if (n < 10000) return String(n);
  const u = Math.min(4, Math.floor(Math.log10(n) / 4));
  return (n / Math.pow(10, u * 4)).toFixed(n / Math.pow(10, u * 4) < 10 ? 1 : 0) + U[u];
};
console.log('판  분     판매출   거래액  계약 구매(트리+기타) 칸 레벨 Lv  P      기본P/R 최고 대상');
for (const r of c.runs.slice(0, maxR)) {
  console.log(
    [String(r.run).padStart(3), r.tMin.toFixed(1).padStart(5), f(r.rev).padStart(8), f(r.gmv).padStart(7), String(r.count).padStart(4),
      `${r.boughtTree}+${r.boughtX ?? 0}`.padStart(6), String(r.nodes).padStart(4), String(r.levels).padStart(4), String(r.lv).padStart(3),
      f(r.P ?? 0).padStart(6), `${r.baseP ?? '-'}/${r.baseR ?? '-'}`.padStart(7), r.topName, r.district].join(' '),
  );
}
if (argv.includes('--buys')) for (const b of c.buys.filter((x) => x.run <= maxR)) console.log(`${b.run}판 ${b.tMin.toFixed(1)}분 ${b.name} Lv${b.lv} ${f(b.cost)} (판 매출 ×${b.ratio.toFixed(2)})`);
console.log(c.milestones.map((m) => `${m.name} ${m.run}판·${m.tMin.toFixed(1)}분`).join(' | '));

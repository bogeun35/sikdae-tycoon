/**
 * 트리 비용 보정(경제 v4, 재화별): 거리 d 칸을 산 순간의 "비용 ÷ 직전 영업일 그 재화 수입"(구매 비율)이 목표가 되도록
 * C1rev[d](영업 가지·공통 = 매출 칸) · C1tech[d](기술 가지 = 기술력 칸)를 따로 되풀이해 맞춘다.
 *   node scripts/balance/calib.mjs [--iter 6] [--seeds 3] [--hours 3] [--bots normal] [--targets 0.6,0.6,0.5,...]
 * 끝나면 맞춘 C1rev·C1tech 를 출력한다(econ.mjs SPEC.tree 에 옮겨 적을 것). gdd-data.json 은 마지막 값으로 적용된 상태로 남는다.
 * SIM_DATA=<복사본 json> 으로 돌리면 게임 데이터 대신 그 복사본을 고친다(실험용).
 *   옵션: --policies cheap,eff  --bots normal  --lv1(첫 레벨 구매만 셈)  --minstep 2.5(거리마다 최소 배수)  --targets 거리별 목표 비율(두 재화 공통)
 *         --ttargets 기술력 칸만 다른 목표  --from 2(이 거리부터 보정)
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
const FROM = Number(flag('--from', 2));
/** 첫 레벨 구매만 셀지 · 이웃 거리 비용의 최소 배수(단조 증가 강제) */
const LV1 = argv.includes('--lv1');
const MINSTEP = Number(flag('--minstep', 0));
/** 거리별 목표 구매 비율(없으면 --target) */
const TARGETS = flag('--targets', '') ? flag('--targets').split(',').map(Number) : [];
const TTARGETS = flag('--ttargets', '') ? flag('--ttargets').split(',').map(Number) : TARGETS;
/** 구매 영업일 방식(--days): 거리 d 칸 첫 레벨을 산 영업일 중앙값이 목표 영업일(DAYS[d])이 되게. 값은 d0 부터, '-' = 보정 안 함.
 *  한 번에 × G^((목표 − 실제) × alpha)(G = --g, 기본 1.25 = 하루 수입 증가율 어림), 1/3~3배로 자름 */
const DAYS = flag('--days', '') ? flag('--days').split(',').map((x) => (x === '-' ? NaN : Number(x))) : [];
const GR = Number(flag('--g', 1.25));
/** 기술력 칸만 다른 목표 영업일(없으면 --days) */
const TDAYS = flag('--tdays', '') ? flag('--tdays').split(',').map((x) => (x === '-' ? NaN : Number(x))) : DAYS;

globalThis.__simRand = () => 0.5;
Math.random = () => globalThis.__simRand();

const spec = cloneSpec(SPEC);
/** --init '{"C1rev":[...],"C1tech":[...]}' : 이전 보정 결과에서 이어서 */
if (flag('--init', '')) Object.assign(spec.tree, JSON.parse(flag('--init')));
const CLAMP = Number(flag('--clamp', 3));
const D0 = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const dOf = Object.fromEntries(D0.tree.map((n) => [n.id, n.d]));
const curOf = Object.fromEntries(D0.tree.map((n) => [n.id, n.br === 'tech' ? 'tech' : 'rev']));
/** 보통 공식(C1)을 쓰는 칸이 하나라도 있는 (재화, 거리)만 보정 */
const usesC1 = new Set(D0.tree.filter((n) => !Array.isArray(SPEC.tree.special[n.id]) && n.ef !== 'district').map((n) => curOf[n.id] + n.d));
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
  const ratios = { rev: {}, tech: {} };
  const days = { rev: {}, tech: {} };
  const done = [];
  for (const bot of BOTS) for (const policy of POLS) for (let s = 1; s <= SEEDS; s++) {
    const c = sim.runCareer({ bot, policy, seed: s, hours: HOURS, quiet: true, stopWhenDone: true });
    const fin = c.milestones.find((m) => m.key === 'treeAll');
    done.push(fin ? fin.tMin : null);
    for (const x of c.buys) {
      const d = dOf[x.id];
      const cur = curOf[x.id];
      if (x.id.startsWith('d_')) continue;
      if (!usesC1.has(cur + d)) continue;
      if (x.lv === 1) (days[cur][d] = days[cur][d] || []).push(x.run);
      if (LV1 && x.lv !== 1) continue;
      (ratios[cur][d] = ratios[cur][d] || []).push(x.ratio);
    }
  }
  const line = [];
  for (const cur of ['rev', 'tech']) {
    const C1 = cur === 'tech' ? spec.tree.C1tech : spec.tree.C1rev;
    const TG = cur === 'tech' ? TTARGETS : TARGETS;
    const parts = [];
    for (let d = 0; d < C1.length; d++) {
      if (DAYS.length) {
        const r = days[cur][d];
        const m = r && r.length >= 3 ? med(r) : NaN;
        const tg = (cur === 'tech' ? TDAYS : DAYS)[d];
        parts.push(`${d}:${Number.isFinite(m) ? m : '-'}/${Number.isFinite(tg) ? tg : '-'}`);
        if (d >= FROM && Number.isFinite(m) && Number.isFinite(tg)) {
          const f = Math.min(CLAMP, Math.max(1 / CLAMP, Math.pow(GR, (tg - m) * ALPHA)));
          C1[d] = round2(C1[d] * f);
        }
        continue;
      }
      const r = ratios[cur][d];
      const m = r && r.length >= 3 ? med(r) : NaN;
      const tg = TG[d] ?? TGT;
      parts.push(`${d}:${Number.isFinite(m) ? m.toFixed(2) : '-'}`);
      if (d >= FROM && Number.isFinite(m) && m > 0) {
        const f = Math.min(3, Math.max(1 / 3, Math.pow(tg / m, ALPHA)));
        C1[d] = round2(C1[d] * f);
      }
    }
    if (MINSTEP) for (let d = Math.max(2, FROM); d < C1.length; d++) C1[d] = round2(Math.max(C1[d], C1[d - 1] * MINSTEP));
    line.push(`${cur} ${parts.join(' ')}`);
  }
  const fin = done.filter((x) => x != null);
  process.stderr.write(`#${it} C1 ${JSON.stringify({ C1rev: spec.tree.C1rev, C1tech: spec.tree.C1tech })}
`);
  process.stderr.write(`#${it} 비율 ${line.join(' | ')} | 트리 완주 ${fin.length}/${done.length} 평균 ${fin.length ? (fin.reduce((a, b) => a + b, 0) / fin.length).toFixed(0) : '-'}분\n`);
}
console.log(JSON.stringify({ C1rev: spec.tree.C1rev, C1tech: spec.tree.C1tech }));

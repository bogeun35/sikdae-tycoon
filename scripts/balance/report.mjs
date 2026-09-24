/**
 * 기준선 ↔ 조정 후 비교 표(마크다운). run.mjs 로 만든 out/<label>.json 두 개를 읽는다.
 *   node scripts/balance/report.mjs [--before before] [--after after]
 * BALANCE.md 의 비교 표는 이 출력을 옮긴 것이다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const load = (l) => JSON.parse(readFileSync(join(HERE, 'out', `${l}.json`), 'utf8'));
const B = load(flag('--before', 'before'));
const A = load(flag('--after', 'after'));

const UNITS = ['', '만', '억', '조', '경', '해'];
function won(n) {
  n = Math.round(n);
  if (n < 10000) return n.toLocaleString('ko-KR') + '원';
  const u = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 4));
  const head = n / Math.pow(10, u * 4);
  return (head >= 100 ? Math.round(head) : Math.round(head * 10) / 10).toLocaleString('ko-KR') + UNITS[u] + '원';
}
const f1 = (x) => (x == null ? '-' : String(Math.round(x * 10) / 10));
const tm = (m) => (m == null ? '-' : m < 60 ? `${Math.round(m)}분` : `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분`);
const DN = { euljiro: '을지로', gangnam: '강남', yeouido: '여의도', pangyo: '판교', magok: '마곡', sejong: '세종' };
const sum = (J, bot, pol) => J.results.find((r) => r.sum.bot === bot && r.sum.policy === pol).sum;
const L = [];
const p = (s) => L.push(s);

/* 1. 시점별 */
for (const bot of ['normal', 'good', 'clumsy']) {
  for (const pol of ['cheap', 'eff']) {
    const b = sum(B, bot, pol);
    const a = sum(A, bot, pol);
    p(`#### ${a.label}`);
    p('');
    p('| 시점 | 판 매출 (전 → 후) | 누적 거래액 (전 → 후) | 트리 칸 (전 → 후) | 레벨 (전 → 후) | 상권 (전 → 후) |');
    p('|---|---|---|---|---|---|');
    for (const at of ['1판', '5판', '10판', '30분', '1시간', '2시간', '4시간']) {
      const x = b.checkpoints.find((c) => c.at === at);
      const y = a.checkpoints.find((c) => c.at === at);
      p(`| ${at} | ${won(x.rev)} → **${won(y.rev)}** | ${won(x.gmvTotal)} → ${won(y.gmvTotal)} | ${f1(x.nodes)} → ${f1(y.nodes)} | ${f1(x.lv)} → ${f1(y.lv)} | ${DN[x.district]} → ${DN[y.district]} |`);
    }
    p('');
  }
}
/* 2. 이정표 */
const KEYS = ['buy1', 'd_gangnam', 'newT', 's_call', 'd_yeouido', 'c05s', 'd_pangyo', 'c08s', 'c09s', 'c10s', 'bossS', 'end', 'treeAll'];
p('| 이정표 | 보통·싼 칸 (전 → 후) | 보통·효율 (전 → 후) | 잘함·싼 칸 (전 → 후) | 서툰·싼 칸 (전 → 후) |');
p('|---|---|---|---|---|');
const ms = (s, k) => {
  const m = s.milestones.find((x) => x.key === k);
  return m && m.run != null ? `${f1(m.run)}판·${tm(m.tMin)}${m.n < s.seeds ? `(${m.n}/${s.seeds})` : ''}` : '-';
};
for (const k of KEYS) {
  const name = A.results[0].sum.milestones.find((x) => x.key === k).name;
  const cols = [['normal', 'cheap'], ['normal', 'eff'], ['good', 'cheap'], ['clumsy', 'cheap']].map(([bot, pol]) => `${ms(sum(B, bot, pol), k)} → **${ms(sum(A, bot, pol), k)}**`);
  p(`| ${name} | ${cols.join(' | ')} |`);
}
p('');
/* 3. 첫 판·막힘·폭주 */
p('| 봇·정책 | 1판 매출 (전 → 후) | 1판 거래액 (전 → 후) | 계약 1건 매출 최소~최대 (후) | 트리 0 연속 최대 (전 → 후) | 5판+ 막힘 횟수 (전 → 후) | 처음 10분 한 판 최대 칸 (전 → 후) | 그중 판 매출 10%+ 칸 (전 → 후) | 처음 10분 판당 평균 (전 → 후) |');
p('|---|---|---|---|---|---|---|---|---|');
for (const bot of ['clumsy', 'normal', 'good']) {
  for (const pol of ['cheap', 'eff']) {
    const b = sum(B, bot, pol);
    const a = sum(A, bot, pol);
    p(`| ${a.label} | ${won(b.first.rev)} → **${won(a.first.rev)}** | ${won(b.first.gmv)} → ${won(a.first.gmv)} | ${won(a.first.minC)} ~ ${won(a.first.maxC)} | ${b.stall.maxNoBuy} → ${a.stall.maxNoBuy} | ${b.stall.streaks5} → ${a.stall.streaks5} | ${b.burst.max10} → ${a.burst.max10} | ${b.burst.big10} → ${a.burst.big10} | ${f1(b.burst.avg10)} → ${f1(a.burst.avg10)} |`);
  }
}
console.log(L.join('\n'));

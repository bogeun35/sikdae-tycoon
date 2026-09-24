/**
 * 밸런스 시뮬레이터 — 게임 로직(src/game)을 그대로 불러 점심 영업을 빠르게 돌린다. 그림·소리 없음.
 *   점심 한 판   = src/game/lunch/logic.ts 의 Lunch 를 1/60초 고정 스텝으로 (게임과 같은 스텝)
 *   판 끝        = closeRun (게임과 같은 함수)
 *   사무실 구매  = src/game/shop.ts (사무실 UI 가 부르는 함수 그대로)
 * 이 파일이 새로 정하는 것은 "플레이어가 어떻게 움직이고 무엇을 사는지"(봇·구매 정책)와 시간 계산뿐이다.
 *
 * 실행: node scripts/balance/run.mjs [옵션]  (BALANCE.md 참고)
 */
import { CHARS, DISTRICTS, F, MAPS, SKILL_ORDER, SKILLS, TARGETS, TARGET_BY, TREE, TREE_BY, ITEMS, type DistrictId, type Orient, type TreeNode, type TargetDef } from '../../src/game/data';
import {
  COMMISSION_RATE, E, MATCH, RUN, SERVICE_FEE_RATE, baseCost, baseMaxed, canBuyItem, canBuyMastery, canBuyNode, canBuySk, districtUnlocked, itemCost,
  lunchTime, masteryCost, masteryOpen, nodeCost, nodeLinked, power, refreshEff, skCost, skillUnlocked, skOpen, skLv, targetUnlocked, tlv, unlockedTargets,
} from '../../src/game/rules';
import { S, resetGame } from '../../src/game/state';
import { assignRep, buyBase, buyItem, buyMastery, buyNode, buySkill, hireRep } from '../../src/game/shop';
import { Lunch, closeRun, type LunchEvents, type RunStats } from '../../src/game/lunch/logic';
// @ts-ignore — 순수 JS 모듈(브라우저 대조에도 그대로 씀)
import { BOT_SPEC, DECIDE, moveNet } from './bots.mjs';

export type BotId = 'clumsy' | 'normal' | 'good';
export type PolicyId = 'cheap' | 'eff';
const BOT_NAME: Record<BotId, string> = { clumsy: '서툰', normal: '보통', good: '잘함' };
const POLICY_NAME: Record<PolicyId, string> = { cheap: '싼 칸 우선', eff: '효율 우선' };

/* ── 난수: 게임 로직은 모듈을 읽을 때 Math.random 을 잡아 두므로 run.mjs 가 먼저 바꿔 끼운다 ── */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const G = globalThis as unknown as { __simRand: () => number };
function reseed(seed: number): void {
  G.__simRand = mulberry32(seed * 7919 + 17);
}

const NOOP = new Proxy({}, { get: () => () => {} }) as unknown as LunchEvents;
const STEP = 1 / 60;
/** 판 하나당 점심 밖 시간(초): 와이프·시작 알약·정산 모달 확인·사무실 이동. 구매 1번마다 PER_BUY 초 더함 */
export const OFFICE_SEC = 10;
export const PER_BUY_SEC = 0.5;

export interface CareerOpts { bot: BotId; policy: PolicyId; seed: number; hours: number; maxRuns?: number; orient?: Orient; quiet?: boolean; stopWhenDone?: boolean }
export interface RunRec {
  run: number; tMin: number; dur: number; rev: number; comm: number; fee: number; bonus: number; gmv: number; count: number; corps: number; stores: number;
  bestM: number; lv: number; nodes: number; levels: number; district: DistrictId; rep: string; revenueHeld: number; gmvTotal: number; revTotal: number;
  point: number; pointGain: number; topTier: number; topName: string; bought: number; boughtTree: number; boughtIds: string[]; minContractRev: number;
  maxContractRev: number; zeroRevContracts: number; pendN: number;
  /** 판 끝 설득력·기본 역량 레벨·스킬 레벨 합·아이템 종류·거래처 관리 단계 합 */
  P: number; baseP: number; baseR: number; skSum: number; itemN: number; masterySum: number; boughtX: number;
  /** 판 끝 구매 뒤 가장 싼 다음 트리 칸 비용(없으면 0) · (그 비용 − 보유) ÷ 이번 판 매출 = 모으는 데 드는 판 수 */
  nextCost: number; nextRuns: number; crits: number; lunchSec: number;
}
export interface Milestone { key: string; name: string; run: number; tMin: number }
export interface Career { opts: CareerOpts; runs: RunRec[]; milestones: Milestone[]; buys: { run: number; tMin: number; id: string; name: string; lv: number; cost: number; ratio: number }[] }

/* ── 사무실 행동 ─────────────────────────── */
/** 대표 우선순위(영입 가능하면 영입 후 이 순서로 배정) */
const REP_PREF = ['lion', 'turtle', 'rabbit', 'dog', 'hawk', 'fox', 'bear', 'raccoon', 'squirrel', 'penguin'];
function manageReps(): void {
  for (const c of CHARS) hireRep(c.id);
  for (const id of REP_PREF) if (S.reps[id]) {
    if (S.rep !== id) assignRep(id);
    break;
  }
}
function pickDistrict(): void {
  let last: DistrictId = 'euljiro';
  for (const d of DISTRICTS) if (districtUnlocked(d.id)) last = d.id;
  S.district = last;
}

function buyableNodes(): TreeNode[] {
  return TREE.filter((n) => nodeLinked(n) && tlv(n.id) < n.max);
}

/** 한 레벨 샀을 때 판 매출이 대략 몇 배 늘지(효율 우선 정책용 어림) */
function gainOf(n: TreeNode): number {
  const lvl = tlv(n.id);
  const v = n.vals[lvl] ?? n.vals[n.vals.length - 1] ?? 0;
  const pool = unlockedTargets();
  const avgVal = pool.reduce((a, t) => a + t.value * t.w, 0) / Math.max(1, pool.reduce((a, t) => a + t.w, 0));
  const topVal = pool.reduce((a, t) => Math.max(a, t.value), 0);
  switch (n.ef) {
    case 'gmv': return v / (1 + E.gmv);
    case 'gflat': return v / (avgVal + E.gflat);
    case 'tv': {
      const ids = Array.isArray(n.tg) ? n.tg : String(n.tg).split(',');
      const tot = pool.reduce((a, t) => a + t.value * t.w, 0) || 1;
      const sh = ids.reduce((a, id) => a + (targetUnlocked(TARGET_BY[id]) ? TARGET_BY[id].value * TARGET_BY[id].w : 0), 0) / tot;
      return sh * v / (1 + (E.tv[ids[0]] || 0));
    }
    case 'pflat': return 0.6 * v / (1 + E.pflat);
    case 'power': return 0.6 * v / (1 + E.power + E.all);
    case 'all': return 1.4 * v / (1 + E.all);
    case 'radius': return 0.8 * v / (1 + E.radius + E.all);
    case 'crowd': return 0.4 * v / (RUN.MAX_TARGETS + E.crowd);
    case 'spawn': return 0.5 * v / (1 + E.spawn);
    case 'fps': return 0.15 * v;
    case 'respawn': return 0.004 * v;
    case 'time': return v / lunchTime();
    case 'match': return 0.4 * v / (1 + MATCH.BASE_BONUS + E.match);
    case 'crit': return (v * (RUN.CRIT_MULT - 1)) / (1 + (RUN.CRIT_BASE + E.crit) * (RUN.CRIT_MULT - 1));
    case 'comm': return (v * 0.9) / (1 + E.comm);
    case 'fee': return (v * 0.1) / (1 + E.fee);
    case 'disc': return v * 1.5;
    case 'tgt': {
      const t = TARGET_BY[String(n.tg)];
      return t ? Math.min(3, 0.25 * t.value / Math.max(1, topVal)) + 0.2 : 0.2;
    }
    case 'district': return 0.35;
    case 'sk': return 0.3;
    case 'cap': return 0.1;
    case 'wom': case 'hot': case 'ref': return 0.1;
    case 'chest': case 'inquiry': return 0.08;
    case 'auto': return 0.3 * v;
    case 'autoMatch': return 0.05;
    default: return 0.02;
  }
}
function effScore(n: TreeNode): number {
  let g = gainOf(n);
  /* 한 칸 너머 보기: 이 칸을 사야 열리는 이웃 중 가장 좋은 것의 일부 */
  if (!tlv(n.id)) {
    let best = 0;
    for (const id of n.link) {
      const m = TREE_BY[id];
      if (!m || tlv(m.id) || nodeLinked(m)) continue;
      const gm = gainOf(m) * nodeCost(n) / (nodeCost(n) + nodeCost(m));
      if (gm > best) best = gm;
    }
    g += 0.6 * best;
  }
  return g / Math.max(1, nodeCost(n));
}

function buyTree(policy: PolicyId, incomePerRun: number, log: (n: TreeNode, cost: number) => void): number {
  let k = 0;
  for (let guard = 0; guard < 400; guard++) {
    const cand = buyableNodes();
    if (!cand.length) break;
    let pick: TreeNode | null = null;
    if (policy === 'cheap') {
      for (const n of cand) if (canBuyNode(n) && (!pick || nodeCost(n) < nodeCost(pick))) pick = n;
    } else {
      const sorted = cand.map((n) => ({ n, s: effScore(n), c: nodeCost(n) })).sort((a, b) => b.s - a.s);
      for (const o of sorted) {
        if (canBuyNode(o.n)) {
          pick = o.n;
          break;
        }
        /* 1.5판 안에 모을 수 있는 더 효율 좋은 칸이 있으면 아끼고 기다림 */
        if (o.c <= S.revenue + incomePerRun * 1.5) break;
      }
    }
    if (!pick) break;
    const cost = nodeCost(pick);
    buyNode(pick);
    log(pick, cost);
    k++;
  }
  return k;
}

/** 트리 외 지출. 서툰·보통: 기본 역량(보유 매출 10% 이하일 때) / 잘함: 기본 역량 + 스킬 + 거래처 관리 + 아이템 강화(25% 이하) */
function buyExtras(bot: BotId): number {
  let k = 0;
  const cap = (x: number) => x <= S.revenue * (bot === 'good' ? 0.25 : 0.1);
  for (let guard = 0; guard < 300; guard++) {
    let any = false;
    for (const b of ['power', 'radius'] as const) {
      if (!baseMaxed(b) && cap(baseCost(b)) && buyBase(b)) {
        k++;
        any = true;
      }
    }
    if (bot === 'good') {
      for (const id of SKILL_ORDER) {
        if (!skillUnlocked(id)) continue;
        for (let i = 0; i < 5; i++) {
          if (!skOpen(id, i) || skLv(id, i) >= SKILLS[id].sk[i].max) continue;
          const c = skCost(id, i);
          if (canBuySk(id, i) && cap(c.rev) && buySkill(id, i)) {
            k++;
            any = true;
          }
        }
      }
      for (const t of TARGETS) {
        if (!masteryOpen(t) || !canBuyMastery(t)) continue;
        if (cap(masteryCost(t).rev) && buyMastery(t)) {
          k++;
          any = true;
        }
      }
      for (const it of ITEMS) {
        if (!canBuyItem(it.id)) continue;
        if (cap(itemCost(it.id).rev) && buyItem(it.id)) {
          k++;
          any = true;
        }
      }
    }
    if (!any) break;
  }
  return k;
}

/* ── 점심 한 판 ─────────────────────────── */
interface RunOut { st: RunStats; L: Lunch; minRev: number; maxRev: number; zero: number }
export function playLunch(bot: BotId, orient: Orient, botRnd: () => number): RunOut {
  const map = MAPS[S.district][orient];
  const L = new Lunch(map, NOOP);
  let minRev = Infinity;
  let maxRev = 0;
  let zero = 0;
  /* 계약마다 매출(수수료+이용료) 기록 */
  L.ev = new Proxy({}, {
    get: (_t, k) => (k === 'contract' ? (_e: unknown, c: { rev: number; pending: boolean }) => {
      if (!c.pending) {
        minRev = Math.min(minRev, c.rev);
        maxRev = Math.max(maxRev, c.rev);
        if (Math.floor(c.rev) <= 0) zero++;
      }
    } : () => {}),
  }) as unknown as LunchEvents;
  L.begin();
  const spec = BOT_SPEC[bot];
  const decide = DECIDE[bot];
  const speed = spec.speed * (map.U / 1.42);
  const mem: Record<string, unknown> = { speed, dt: spec.think };
  let think = 0;
  let goal = { x: L.net.x, y: L.net.y };
  for (let i = 0; i < 1e6; i++) {
    think -= STEP;
    if (think <= 0) {
      think = spec.think;
      goal = decide(L, mem, botRnd);
    }
    moveNet(L, goal, speed, STEP);
    if (!L.update(STEP)) break;
  }
  return { st: L.stats, L, minRev: minRev === Infinity ? 0 : minRev, maxRev, zero };
}

/* ── 이정표 ─────────────────────────────── */
const MILESTONES: { key: string; name: string; test: () => boolean }[] = [
  { key: 'buy1', name: '첫 트리 구매', test: () => Object.keys(S.tree).length > 0 },
  { key: 'pay', name: '첫 결제 연결(결제 대기 풀림)', test: () => S.netC > 0 && S.netR > 0 },
  { key: 'd_gangnam', name: '첫 상권 해금(강남)', test: () => districtUnlocked('gangnam') },
  { key: 'newT', name: '첫 새 대상 해금(중소기업·푸드트럭)', test: () => targetUnlocked(TARGET_BY.c03) || targetUnlocked(TARGET_BY.r03) },
  { key: 's_call', name: '첫 스킬(콜드콜)', test: () => skillUnlocked('call') },
  { key: 'd_yeouido', name: '둘째 상권(여의도)', test: () => districtUnlocked('yeouido') },
  { key: 'c05u', name: '중견기업 해금', test: () => targetUnlocked(TARGET_BY.c05) },
  { key: 'c05s', name: '중견기업 첫 등장', test: () => !!S.seen.c05 },
  { key: 'd_pangyo', name: '셋째 상권(판교)', test: () => districtUnlocked('pangyo') },
  { key: 'c07s', name: '공공기관 첫 등장', test: () => !!S.seen.c07 },
  { key: 'c08s', name: '대학병원 첫 등장(첫 대형 계약 규모)', test: () => !!S.seen.c08 },
  { key: 'd_sejong', name: '마지막 상권(세종)', test: () => districtUnlocked('sejong') },
  { key: 'c09u', name: '대기업 해금', test: () => targetUnlocked(TARGET_BY.c09) },
  { key: 'c09s', name: '대기업 첫 등장', test: () => !!S.seen.c09 },
  { key: 'c10s', name: '그룹 본사 첫 등장', test: () => !!S.seen.c10 },
  { key: 'bossU', name: '최종 보스 해금(전국 식대 플랫폼)', test: () => targetUnlocked(TARGET_BY.boss) },
  { key: 'bossS', name: '최종 보스 첫 등장', test: () => !!S.seen.boss },
  { key: 'end', name: '엔딩(트윈타워 계약)', test: () => S.ending > 0 },
  { key: 'treeAll', name: '트리 전부', test: () => TREE.every((n) => tlv(n.id) >= n.max) },
];

function topTarget(): TargetDef {
  let t = TARGETS[0];
  for (const x of unlockedTargets()) if (x.tier > t.tier) t = x;
  return t;
}

export function runCareer(o: CareerOpts): Career {
  reseed(o.seed);
  const botRnd = mulberry32(o.seed * 104729 + 3);
  resetGame();
  refreshEff();
  const orient = o.orient || 'land';
  const out: Career = { opts: o, runs: [], milestones: [], buys: [] };
  const got = new Set<string>();
  let tSec = 0;
  let lastIncome = 0;
  const maxRuns = o.maxRuns || 100000;
  const checkMs = (run: number) => {
    for (const m of MILESTONES) if (!got.has(m.key) && m.test()) {
      got.add(m.key);
      out.milestones.push({ key: m.key, name: m.name, run, tMin: tSec / 60 });
    }
  };
  for (let run = 1; run <= maxRuns && tSec < o.hours * 3600; run++) {
    pickDistrict();
    const p0 = S.point;
    const r = playLunch(o.bot, orient, botRnd);
    closeRun(r.st);
    tSec += r.L.total;
    lastIncome = r.st.rev;
    const top = topTarget();
    checkMs(run);
    /* 사무실 */
    const boughtIds: string[] = [];
    const bt = buyTree(o.policy, lastIncome, (n, cost) => {
      boughtIds.push(n.id);
      out.buys.push({ run, tMin: tSec / 60, id: n.id, name: n.name, lv: tlv(n.id), cost, ratio: cost / Math.max(1, lastIncome) });
    });
    const bx = buyExtras(o.bot);
    manageReps();
    pickDistrict();
    tSec += OFFICE_SEC + PER_BUY_SEC * (bt + bx);
    const st = r.st;
    let nc = 0;
    for (const n of buyableNodes()) {
      const c = nodeCost(n);
      if (!nc || c < nc) nc = c;
    }
    out.runs.push({
      run, tMin: tSec / 60, dur: r.L.total, rev: st.rev, comm: st.comm, fee: st.fee, bonus: st.bonus, gmv: st.gmv, count: st.count, corps: st.corps, stores: st.stores,
      bestM: st.bestM, lv: S.lv, nodes: Object.keys(S.tree).length, levels: Object.values(S.tree).reduce((a, b) => a + b, 0), district: S.district, rep: S.rep,
      revenueHeld: S.revenue, gmvTotal: S.gmv, revTotal: S.revTotal, point: S.point, pointGain: st.point, topTier: top.tier, topName: top.name,
      bought: bt + bx, boughtTree: bt, boughtIds, minContractRev: r.minRev, maxContractRev: r.maxRev, zeroRevContracts: r.zero, pendN: st.pendN,
      nextCost: nc, nextRuns: nc ? Math.max(0, nc - S.revenue) / Math.max(1e-9, st.rev) : 0, crits: st.crits, lunchSec: r.L.total,
      P: power(), baseP: S.base.power, baseR: S.base.radius, skSum: Object.values(S.sk).reduce((a, b) => a + b, 0), itemN: Object.keys(S.items).length,
      masterySum: Object.values(S.mastery).reduce((a, b) => a + b, 0), boughtX: bx,
    });
    checkMs(run);
    if (o.stopWhenDone && got.has('treeAll')) break;
    if (!o.quiet && run % 50 === 0) process.stderr.write(`  ${BOT_NAME[o.bot]}/${POLICY_NAME[o.policy]} seed${o.seed} ${run}판 ${(tSec / 60).toFixed(1)}분\n`);
  }
  return out;
}

/* ── 요약 ───────────────────────────────── */
export interface Summary {
  label: string; bot: BotId; policy: PolicyId; seeds: number;
  checkpoints: { at: string; run: number; tMin: number; rev: number; gmvRun: number; gmvTotal: number; nodes: number; levels: number; lv: number; district: string; count: number; topName: string }[];
  milestones: { key: string; name: string; run: number | null; tMin: number | null; n: number }[];
  stall: { maxNoBuy: number; at: number; tMin: number; streaks5: number; list: { from: number; len: number; tMin: number }[] };
  burst: { max10: number; maxAll: number; at: number; first10: number[]; big10: number; bigAll: number; avg10: number };
  /** 아무것도 안 산(트리·기본 역량·스킬 등 전부 0) 판이 이어진 최대 길이 */
  stallAny: { max: number; at: number };
  first: { rev: number; gmv: number; comm: number; fee: number; count: number; minC: number; maxC: number; zero: number; buyRun: number };
}
const CHECKS: { at: string; run?: number; min?: number }[] = [
  { at: '1판', run: 1 }, { at: '5판', run: 5 }, { at: '10판', run: 10 }, { at: '20판', run: 20 },
  { at: '30분', min: 30 }, { at: '1시간', min: 60 }, { at: '2시간', min: 120 }, { at: '4시간', min: 240 },
];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const gavg = (a: number[]) => (a.length ? Math.exp(avg(a.map((x) => Math.log(Math.max(1e-9, x))))) : 0);

export function summarize(cs: Career[]): Summary {
  const o = cs[0].opts;
  const checkpoints = CHECKS.map((c) => {
    const rs = cs.map((k) => (c.run ? k.runs[c.run - 1] : k.runs.find((r) => r.tMin >= c.min!) || k.runs[k.runs.length - 1])).filter(Boolean) as RunRec[];
    const most = (f: (r: RunRec) => string) => {
      const m: Record<string, number> = {};
      for (const r of rs) m[f(r)] = (m[f(r)] || 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    };
    return {
      at: c.at, run: avg(rs.map((r) => r.run)), tMin: avg(rs.map((r) => r.tMin)), rev: gavg(rs.map((r) => r.rev)), gmvRun: gavg(rs.map((r) => r.gmv)), gmvTotal: gavg(rs.map((r) => r.gmvTotal)),
      nodes: avg(rs.map((r) => r.nodes)), levels: avg(rs.map((r) => r.levels)), lv: avg(rs.map((r) => r.lv)), district: most((r) => r.district), count: avg(rs.map((r) => r.count)), topName: most((r) => r.topName),
    };
  });
  const milestones = MILESTONES.map((m) => {
    const hits = cs.map((k) => k.milestones.find((x) => x.key === m.key)).filter(Boolean) as Milestone[];
    return { key: m.key, name: m.name, run: hits.length ? avg(hits.map((h) => h.run)) : null, tMin: hits.length ? avg(hits.map((h) => h.tMin)) : null, n: hits.length };
  });
  /* 막힘: 트리 구매 0 인 판이 이어진 길이(트리를 다 산 뒤는 제외) */
  let maxNoBuy = 0;
  let at = 0;
  let atMin = 0;
  let streaks5 = 0;
  const list: { from: number; len: number; tMin: number }[] = [];
  for (const k of cs) {
    const done = k.milestones.find((m) => m.key === 'treeAll')?.run ?? Infinity;
    let cur = 0;
    for (const r of k.runs) {
      if (r.run >= done) break;
      if (r.boughtTree === 0) {
        cur++;
        if (cur > maxNoBuy) {
          maxNoBuy = cur;
          at = r.run - cur + 1;
          atMin = r.tMin;
        }
      } else {
        if (cur >= 5) {
          streaks5++;
          list.push({ from: r.run - cur, len: cur, tMin: r.tMin });
        }
        cur = 0;
      }
    }
  }
  /* 폭주: 한 번에 산 트리 칸 수 */
  let max10 = 0;
  let maxAll = 0;
  let bAt = 0;
  for (const k of cs) for (const r of k.runs) {
    if (r.tMin <= 10) max10 = Math.max(max10, r.boughtTree);
    if (r.boughtTree > maxAll) {
      maxAll = r.boughtTree;
      bAt = r.run;
    }
  }
  const first10 = Array.from({ length: 10 }, (_, i) => avg(cs.map((k) => k.runs[i]?.boughtTree ?? 0)));
  /* 의미 있는 구매만(비용 ≥ 직전 판 매출의 10%): 싸게 남은 칸 쓸어 담기는 뺀 폭주 */
  let big10 = 0;
  let bigAll = 0;
  const per10: number[] = [];
  for (const k of cs) {
    const byRun: Record<number, number> = {};
    for (const b of k.buys) if (b.ratio >= 0.1) byRun[b.run] = (byRun[b.run] || 0) + 1;
    for (const r of k.runs) {
      const n = byRun[r.run] || 0;
      if (r.tMin <= 10) {
        big10 = Math.max(big10, n);
        per10.push(r.boughtTree);
      }
      bigAll = Math.max(bigAll, n);
    }
  }
  /* 아무것도 못 산 판 연속(트리 완주 전까지) */
  let saMax = 0;
  let saAt = 0;
  for (const k of cs) {
    const done = k.milestones.find((m) => m.key === 'treeAll')?.run ?? Infinity;
    let cur = 0;
    for (const r of k.runs) {
      if (r.run >= done) break;
      if (r.bought === 0) {
        cur++;
        if (cur > saMax) {
          saMax = cur;
          saAt = r.run - cur + 1;
        }
      } else cur = 0;
    }
  }
  const r1 = cs.map((k) => k.runs[0]);
  const buyRun = avg(cs.map((k) => k.milestones.find((m) => m.key === 'buy1')?.run ?? 99));
  return {
    label: `${BOT_NAME[o.bot]} · ${POLICY_NAME[o.policy]}`, bot: o.bot, policy: o.policy, seeds: cs.length, checkpoints, milestones,
    stall: { maxNoBuy, at, tMin: atMin, streaks5, list: list.slice(0, 12) },
    burst: { max10, maxAll, at: bAt, first10, big10, bigAll, avg10: avg(per10) },
    stallAny: { max: saMax, at: saAt },
    first: {
      rev: avg(r1.map((r) => r.rev)), gmv: avg(r1.map((r) => r.gmv)), comm: avg(r1.map((r) => r.comm)), fee: avg(r1.map((r) => r.fee)), count: avg(r1.map((r) => r.count)),
      minC: Math.min(...r1.map((r) => r.minContractRev)), maxC: Math.max(...r1.map((r) => r.maxContractRev)), zero: avg(r1.map((r) => r.zeroRevContracts)), buyRun,
    },
  };
}

/** 새 저장 첫 판만 여러 번(실제 게임 대조용) */
export function firstRuns(bot: BotId, n: number, orient: Orient = 'land', rng?: () => number): { rev: number; gmv: number; comm: number; fee: number; count: number; corps: number; stores: number; counts: Record<string, number> }[] {
  const out = [];
  for (let s = 1; s <= n; s++) {
    if (rng) G.__simRand = rng;
    else reseed(1000 + s);
    const botRnd = rng || mulberry32(s * 31 + 7);
    resetGame();
    refreshEff();
    const r = playLunch(bot, orient, botRnd);
    closeRun(r.st);
    out.push({ rev: r.st.rev, gmv: r.st.gmv, comm: r.st.comm, fee: r.st.fee, count: r.st.count, corps: r.st.corps, stores: r.st.stores, counts: { ...S.counts } });
  }
  return out;
}

import { fmt } from '../../src/game/format';
export { fmt };
export const info = { COMMISSION_RATE, SERVICE_FEE_RATE, F, BOT_NAME, POLICY_NAME, med, gavg, avg, TREE, costOf: (id: string) => nodeCost(TREE_BY[id]) };

/**
 * 밸런스 시뮬레이터 — 게임 로직(src/game)을 그대로 불러 영업을 빠르게 돌린다. 그림·소리 없음.
 *   영업 한 판  = src/game/lunch/logic.ts 의 Lunch 를 1/60초 고정 스텝으로 (게임과 같은 스텝)
 *   판 끝       = closeRun (게임과 같은 함수)
 *   사무실 구매 = src/game/shop.ts (사무실 UI 가 부르는 함수 그대로)
 * 이 파일이 새로 정하는 것은 "플레이어가 어떻게 움직이고 무엇을 사는지"(봇·구매 정책)와 시간 계산뿐이다.
 *
 * 경제 v4: 재화 두 개(매출 · 기술력). 트리 영업 가지·공통·기본 역량·거래처 관리 = 매출, 기술 가지·스킬·아이템 = 기술력.
 *
 * 실행: node scripts/balance/run.mjs [옵션]  (BALANCE.md 참고)
 */
import { CHARS, DISTRICTS, MAPS, SKILL_ORDER, SKILLS, TARGETS, TARGET_BY, TREE, TREE_BY, ITEMS, F, type DistrictId, type Orient, type TreeNode, type TargetDef, type MapData } from '../../src/game/data';
import {
  E, ITEM_FIRST, MATCH, RUN, baseCost, baseMaxed, baseUnlocked, canBuyBaseLv, canBuyItem, itemGradeCap, canBuyMastery, canBuyNode, canBuySk, districtUnlocked, itemCost,
  lunchTime, masteryCost, masteryOpen, nodeCost, nodeCurrency, nodeLinked, nodeReqOk, power, radiusOf, refreshEff, skCost, skillUnlocked, skOpen, skLv,
  targetUnlocked, tlv, unlockedTargets, type Currency,
} from '../../src/game/rules';
import { S, resetGame } from '../../src/game/state';
import { assignRep, buyBase, buyItem, buyMastery, buyNode, buySkill, hireRep } from '../../src/game/shop';
import { Lunch, closeRun, type LunchEvents, type RunStats } from '../../src/game/lunch/logic';
import { genMap } from '../../src/game/map/gen';
// @ts-ignore — 순수 JS 모듈(브라우저 대조에도 그대로 씀)
import { BOT_SPEC, DECIDE, moveNet } from './bots.mjs';

export type BotId = 'clumsy' | 'clumsyOld' | 'normal' | 'good';
export type PolicyId = 'cheap' | 'eff';
const BOT_NAME: Record<BotId, string> = { clumsy: '서툰', clumsyOld: '서툰(옛)', normal: '보통', good: '잘함' };
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
/** 판 하나당 영업 밖 시간(초): 와이프·시작 알약·정산 모달 확인·사무실 이동. 구매 1번마다 PER_BUY 초 더함 */
export const OFFICE_SEC = 10;
export const PER_BUY_SEC = 0.5;
/** 가로 지도 U(반경 기록용) */
const U_LAND = 1.42;

/**
 * 영업 지도: 게임과 같은 생성기(src/game/map/gen.ts)로 판마다 새로 만듦. 누적 영업일 = S.runs + 1.
 * 씨앗은 시뮬 난수(run.mjs 가 바꿔 끼운 Math.random)에서 뽑아 같은 시드면 같은 지도 순서.
 * SIM_FIXED_MAP=1 이면 옛 고정 지도(gdd-data.json maps) — 비교용
 */
export function mapFor(district: DistrictId, orient: Orient): MapData {
  if (typeof process !== 'undefined' && process.env && process.env.SIM_FIXED_MAP === '1') return MAPS[district][orient];
  return genMap(district, orient, Math.floor(Math.random() * 4294967296) >>> 0, S.runs + 1);
}

export interface CareerOpts { bot: BotId; policy: PolicyId; seed: number; hours: number; maxRuns?: number; orient?: Orient; quiet?: boolean; stopWhenDone?: boolean }
export interface RunRec {
  run: number; tMin: number; dur: number; rev: number; comm: number; fee: number; bonus: number; gmv: number; count: number; corps: number; stores: number;
  bestM: number; lv: number; nodes: number; levels: number; district: DistrictId; rep: string; revenueHeld: number; gmvTotal: number; revTotal: number;
  /** 이번 판 기술력 · 판 끝 보유 기술력 */
  tech: number; techHeld: number;
  topTier: number; topName: string; bought: number; boughtTree: number; boughtIds: string[]; minContractRev: number;
  maxContractRev: number; zeroRevContracts: number; pendN: number;
  /** 판 끝 설득력·기본 역량 레벨·스킬 레벨 합·아이템 종류·거래처 관리 단계 합 */
  P: number; baseP: number; baseR: number; skSum: number; itemN: number; masterySum: number; boughtX: number;
  /** 판 끝 구매 뒤 가장 싼 다음 트리 칸 비용(없으면 0) · (그 비용 − 보유) ÷ 이번 판 매출 = 모으는 데 드는 판 수 */
  nextCost: number; nextRuns: number; crits: number; lunchSec: number;
  /** 이번 판 사무실에서 쓴 매출·기술력, 재화별 산 레벨 수, 기본 역량 레벨 수 */
  spentRev: number; spentTech: number; buyRev: number; buyTech: number; buyBase: number;
  /** 이 판 영업 반경(가로 지도 px) · R ÷ R₀ */
  R: number; Rk: number;
  /** 판 끝 떨어지는 아이템 최고 등급 */
  gradeCap: number;
  /** 이 판 보스(트윈타워)에 준 설득량(나오지 않았으면 0) · 보스 최대 체력 */
  bossDmg: number; bossMax: number;
}
export interface Milestone { key: string; name: string; run: number; tMin: number }
export interface Career { opts: CareerOpts; runs: RunRec[]; milestones: Milestone[]; buys: { run: number; tMin: number; id: string; name: string; lv: number; cost: number; cur: Currency; ratio: number }[] }

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

/** 살 수 있는 후보(연결됨 · 선행 칸 있음 · 최대 아님). 잠긴 칸은 후보가 아님 */
function buyableNodes(): TreeNode[] {
  return TREE.filter((n) => nodeLinked(n) && nodeReqOk(n) && tlv(n.id) < n.max);
}
const held = (c: Currency) => (c === 'tech' ? S.tech : S.revenue);

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
    case 'tech': return 0.5 * v / (1 + E.tech);
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
/** 칸 비용을 그 재화의 직전 판 수입으로 나눈 값(두 재화를 한 줄로 견주기) */
function normCost(n: TreeNode, inc: Record<Currency, number>): number {
  return nodeCost(n) / Math.max(1, inc[nodeCurrency(n)]);
}
function effScore(n: TreeNode, inc: Record<Currency, number>): number {
  let g = gainOf(n);
  /* 한 칸 너머 보기: 이 칸을 사야 열리는 이웃 중 가장 좋은 것의 일부 */
  if (!tlv(n.id)) {
    let best = 0;
    for (const id of n.link) {
      const m = TREE_BY[id];
      if (!m || tlv(m.id) || nodeLinked(m)) continue;
      const gm = gainOf(m) * normCost(n, inc) / (normCost(n, inc) + normCost(m, inc));
      if (gm > best) best = gm;
    }
    g += 0.6 * best;
  }
  return g / Math.max(1e-9, normCost(n, inc));
}

/**
 * 사무실 하루 구매(경제 v4). 후보 = 트리 칸 + 기본 역량(해금 뒤) + 스킬 칸·아이템 강화·거래처 관리(모든 봇).
 *   싼 칸 우선: 살 수 있는 것 중 "비용 ÷ 그 재화 직전 영업일 수입"이 가장 작은 것부터(사람이 보이는 싼 것부터 사는 방식)
 *   효율 우선: 얻는 것 ÷ 비용 순. 1.5영업일 안에 모을 수 있는 더 좋은 것이 있으면 그 재화는 아끼고 기다림
 * 옛 규칙(기본 역량·스킬 등은 보유 재화의 10%·25% 이하일 때만)은 SIM_EXTRA=held 로 켬(비교용).
 */
interface Cand { kind: 'tree' | 'base' | 'sk' | 'item' | 'mast'; id: string; cost: number; cur: Currency; gain: number; can: () => boolean; buy: () => boolean; node?: TreeNode }
const EXTRA_MODE = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM_EXTRA || '';
const EXTRA_HELD = EXTRA_MODE === 'held';
const EXTRA_GOOD_ONLY = EXTRA_MODE === 'goodonly';

function candidates(bot: BotId, inc: Record<Currency, number>): Cand[] {
  const out: Cand[] = [];
  for (const n of buyableNodes()) out.push({ kind: 'tree', id: n.id, cost: nodeCost(n), cur: nodeCurrency(n), gain: effScore(n, inc) * normCost(n, inc), can: () => canBuyNode(n), buy: () => buyNode(n), node: n });
  if (EXTRA_HELD) return out;
  for (const b of ['power', 'radius'] as const) {
    if (!baseUnlocked(b) || baseMaxed(b)) continue;
    out.push({ kind: 'base', id: b, cost: baseCost(b), cur: 'rev', gain: b === 'power' ? 0.6 * (F.BASIC.power.mult - 1) : 0.8 * (F.BASIC.radius.mult - 1), can: () => canBuyBaseLv(b), buy: () => buyBase(b) });
  }
  /* 스킬·아이템(기술력)·거래처 관리(매출): 모든 봇이 후보로 봄(사람도 싼 것이 보이면 삼). SIM_EXTRA=goodonly 면 옛 규칙처럼 잘함만 */
  if (EXTRA_GOOD_ONLY && bot !== 'good') return out;
  const pool = unlockedTargets();
  const tot = pool.reduce((a, t) => a + t.value * t.w, 0) || 1;
  for (const id of SKILL_ORDER) {
    if (!skillUnlocked(id)) continue;
    for (let i = 0; i < 5; i++) {
      if (!skOpen(id, i) || skLv(id, i) >= SKILLS[id].sk[i].max) continue;
      out.push({ kind: 'sk', id: id + i, cost: skCost(id, i).tech, cur: 'tech', gain: 0.03, can: () => canBuySk(id, i), buy: () => buySkill(id, i) });
    }
  }
  for (const it of ITEMS) {
    const lv = S.items[it.id] || 0;
    if (!lv || lv >= F.ITEM.max) continue;
    out.push({ kind: 'item', id: it.id, cost: itemCost(it.id).tech, cur: 'tech', gain: 0.5 * it.v, can: () => canBuyItem(it.id), buy: () => buyItem(it.id) });
  }
  for (const t of pool) {
    if (!masteryOpen(t) || (S.mastery[t.id] || 0) >= F.MASTERY.max) continue;
    out.push({ kind: 'mast', id: t.id, cost: masteryCost(t).rev, cur: 'rev', gain: 0.05 * (t.value * t.w) / tot, can: () => canBuyMastery(t), buy: () => buyMastery(t) });
  }
  return out;
}

interface DayBuy { tree: number; base: number; other: number; rev: number; tech: number }
function shopDay(bot: BotId, policy: PolicyId, inc: Record<Currency, number>, log: (n: TreeNode, cost: number) => void): DayBuy {
  const r: DayBuy = { tree: 0, base: 0, other: 0, rev: 0, tech: 0 };
  const nc = (c: Cand) => c.cost / Math.max(1, inc[c.cur]);
  for (let guard = 0; guard < 600; guard++) {
    const cand = candidates(bot, inc);
    if (!cand.length) break;
    let pick: Cand | null = null;
    if (policy === 'cheap') {
      let bc = Infinity;
      for (const c of cand) {
        if (!c.can()) continue;
        const v = nc(c);
        if (v < bc) {
          bc = v;
          pick = c;
        }
      }
    } else {
      const sorted = cand.map((c) => ({ c, s: c.gain / Math.max(1e-9, nc(c)) })).sort((a, b) => b.s - a.s);
      const wait = new Set<Currency>();
      for (const o of sorted) {
        if (wait.has(o.c.cur)) continue;
        if (o.c.can()) {
          pick = o.c;
          break;
        }
        if (o.c.cost <= held(o.c.cur) + inc[o.c.cur] * 1.5) wait.add(o.c.cur);
        if (wait.size >= 2) break;
      }
    }
    if (!pick) break;
    const cost = pick.cost;
    if (!pick.buy()) break;
    if (pick.cur === 'tech') r.tech++;
    else r.rev++;
    if (pick.kind === 'tree') {
      r.tree++;
      log(pick.node!, cost);
    } else if (pick.kind === 'base') r.base++;
    else r.other++;
  }
  if (EXTRA_HELD) {
    const x = buyExtrasHeld(bot);
    r.base += x.base;
    r.other += x.k - x.base;
    r.rev += x.rev;
    r.tech += x.k - x.rev;
  }
  return r;
}

/** 옛 규칙: 서툰·보통 = 기본 역량(보유 매출 10% 이하일 때) / 잘함 = 기본 역량 + 스킬·아이템(보유 기술력 25% 이하) + 거래처 관리(보유 매출 25% 이하) */
function buyExtrasHeld(bot: BotId): { k: number; base: number; rev: number } {
  let k = 0;
  let base = 0;
  let rev = 0;
  const share = bot === 'good' ? 0.25 : 0.1;
  const capR = (x: number) => x <= S.revenue * share;
  const capT = (x: number) => x <= S.tech * share;
  for (let guard = 0; guard < 300; guard++) {
    let any = false;
    for (const b of ['power', 'radius'] as const) {
      if (baseUnlocked(b) && !baseMaxed(b) && capR(baseCost(b)) && buyBase(b)) {
        k++;
        base++;
        rev++;
        any = true;
      }
    }
    if (bot === 'good') {
      for (const id of SKILL_ORDER) {
        if (!skillUnlocked(id)) continue;
        for (let i = 0; i < 5; i++) {
          if (!skOpen(id, i) || skLv(id, i) >= SKILLS[id].sk[i].max) continue;
          if (canBuySk(id, i) && capT(skCost(id, i).tech) && buySkill(id, i)) {
            k++;
            any = true;
          }
        }
      }
      for (const t of TARGETS) {
        if (!masteryOpen(t) || !canBuyMastery(t)) continue;
        if (capR(masteryCost(t).rev) && buyMastery(t)) {
          k++;
          rev++;
          any = true;
        }
      }
      for (const it of ITEMS) {
        if (!canBuyItem(it.id)) continue;
        if (capT(itemCost(it.id).tech) && buyItem(it.id)) {
          k++;
          any = true;
        }
      }
    }
    if (!any) break;
  }
  return { k, base, rev };
}

/* ── 영업 한 판 ─────────────────────────── */
export interface RadiusRec { hist: Record<number, number>; pot: number[]; maxIn: number }
interface RunOut { st: RunStats; L: Lunch; minRev: number; maxRev: number; zero: number; rad: RadiusRec | null; bossDmg: number; bossMax: number }

/** 반경 안에 가장 많이 담기는 자리로 가는 봇(매크로 최악, 설계서 0장 '몰이 봇') */
function decideCluster(L: Lunch, mem: { goal?: { x: number; y: number } }): { x: number; y: number } {
  const R = L.R;
  const ents = L.ents.filter((e) => e.grace <= 0.2);
  if (!ents.length) return mem.goal || { x: L.net.x, y: L.net.y };
  const cands: { x: number; y: number }[] = [];
  for (const a of ents) {
    cands.push({ x: a.x, y: a.y });
    for (const b of ents) if (a.id < b.id && Math.hypot(a.x - b.x, a.y - b.y) < 2 * (R + 40)) cands.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  let best = cands[0];
  let bs = -1;
  for (const c of cands) {
    let n = 0;
    for (const e of ents) if (Math.hypot(e.x - c.x, e.y - c.y) < R + e.w * 0.3) n++;
    const s = n - Math.hypot(c.x - L.net.x, c.y - L.net.y) / 2000;
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  mem.goal = best;
  return best;
}
/** 이 순간 반경을 어디에 두든 담을 수 있는 최대(두 대상 가운데·대상 자리 후보) */
function bestSpot(L: Lunch): number {
  const ents = L.ents.filter((e) => e.grace <= 0);
  let best = 0;
  const R = L.R;
  for (const a of ents)
    for (const b of ents) {
      if (b.id < a.id) continue;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      let m = 0;
      for (const e of ents) if (Math.hypot(e.x - cx, e.y - cy) < R + e.w * 0.3) m++;
      if (m > best) best = m;
    }
  return best;
}

export function playLunch(bot: BotId | 'cluster', orient: Orient, botRnd: () => number, measure = false): RunOut {
  const map = mapFor(S.district, orient);
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
  const spec = bot === 'cluster' ? { speed: 1700, think: 0.1 } : BOT_SPEC[bot];
  const decide = bot === 'cluster' ? decideCluster : DECIDE[bot];
  const speed = spec.speed * (map.U / 1.42);
  const mem: Record<string, unknown> = { speed, dt: spec.think };
  let think = 0;
  let goal = { x: L.net.x, y: L.net.y };
  const rad: RadiusRec | null = measure ? { hist: {}, pot: [], maxIn: 0 } : null;
  let last = -1;
  let bossDmg = 0;
  let bossMax = 0;
  for (let i = 0; i < 1e6; i++) {
    think -= STEP;
    if (think <= 0) {
      think = spec.think;
      goal = decide(L, mem, botRnd);
    }
    moveNet(L, goal, speed, STEP);
    const alive = L.update(STEP);
    for (const e of L.ents) if (e.boss) {
      bossMax = e.max;
      bossDmg = Math.max(bossDmg, e.max - e.hp);
    }
    if (L.stats.bossSigned && bossMax) bossDmg = bossMax;
    if (!alive) break;
    if (rad) {
      const k = Math.floor(L.t * 10);
      if (k !== last) {
        last = k;
        let n = 0;
        for (const e of L.ents) if (e.inR) n++;
        rad.hist[n] = (rad.hist[n] || 0) + 1;
        if (n > rad.maxIn) rad.maxIn = n;
        if (k % 10 === 0) rad.pot.push(bestSpot(L));
      }
    }
  }
  return { st: L.stats, L, minRev: minRev === Infinity ? 0 : minRev, maxRev, zero, rad, bossDmg, bossMax };
}

/* ── 이정표 ─────────────────────────────── */
const MILESTONES: { key: string; name: string; test: () => boolean }[] = [
  { key: 'buy1', name: '첫 트리 구매', test: () => Object.keys(S.tree).length > 0 },
  { key: 'buyT', name: '첫 기술력 칸', test: () => Object.keys(S.tree).some((id) => TREE_BY[id]?.br === 'tech') },
  { key: 'pay', name: '첫 결제 연결(결제 대기 풀림)', test: () => S.netC > 0 && S.netR > 0 },
  { key: 'bp1', name: '첫 설득력 레벨', test: () => S.base.power > 0 },
  { key: 'br1', name: '첫 반경 레벨', test: () => S.base.radius > 0 },
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
  { key: 'brMax', name: '반경 30레벨', test: () => S.base.radius >= F.BASIC.radius.max },
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
  const maxRuns = o.maxRuns || 100000;
  const R0 = radiusOf(U_LAND);
  let bossRun = 0;
  const checkMs = (run: number) => {
    for (const m of MILESTONES) if (!got.has(m.key) && m.test()) {
      got.add(m.key);
      out.milestones.push({ key: m.key, name: m.name, run, tMin: tSec / 60 });
      if (m.key === 'bossU') bossRun = run;
    }
  };
  for (let run = 1; run <= maxRuns && tSec < o.hours * 3600; run++) {
    pickDistrict();
    refreshEff();
    const R = radiusOf(U_LAND);
    const r = playLunch(o.bot, orient, botRnd);
    closeRun(r.st);
    tSec += r.L.total;
    const inc: Record<Currency, number> = { rev: r.st.rev, tech: r.st.tech };
    const top = topTarget();
    checkMs(run);
    /* 사무실 */
    const boughtIds: string[] = [];
    const rev0 = S.revenue;
    const tech0 = S.tech;
    const day = shopDay(o.bot, o.policy, inc, (n, cost) => {
      boughtIds.push(n.id);
      const cur = nodeCurrency(n);
      out.buys.push({ run, tMin: tSec / 60, id: n.id, name: n.name, lv: tlv(n.id), cost, cur, ratio: cost / Math.max(1, inc[cur]) });
    });
    const bt = day.tree;
    const bx = { k: day.base + day.other, base: day.base };
    const buyRev = day.rev;
    const buyTech = day.tech;
    const skA = Object.values(S.sk).reduce((a, b) => a + b, 0);
    manageReps();
    pickDistrict();
    tSec += OFFICE_SEC + PER_BUY_SEC * (bt + bx.k);
    const st = r.st;
    let nc = 0;
    for (const n of buyableNodes()) {
      const c = nodeCost(n);
      if (!nc || c < nc) nc = c;
    }
    out.runs.push({
      run, tMin: tSec / 60, dur: r.L.total, rev: st.rev, comm: st.comm, fee: st.fee, bonus: st.bonus, gmv: st.gmv, count: st.count, corps: st.corps, stores: st.stores,
      bestM: st.bestM, lv: S.lv, nodes: Object.keys(S.tree).length, levels: Object.values(S.tree).reduce((a, b) => a + b, 0), district: S.district, rep: S.rep,
      revenueHeld: S.revenue, gmvTotal: S.gmv, revTotal: S.revTotal, tech: st.tech, techHeld: S.tech, topTier: top.tier, topName: top.name,
      bought: bt + bx.k, boughtTree: bt, boughtIds, minContractRev: r.minRev, maxContractRev: r.maxRev, zeroRevContracts: r.zero, pendN: st.pendN,
      nextCost: nc, nextRuns: nc ? Math.max(0, nc - S.revenue) / Math.max(1e-9, st.rev) : 0, crits: st.crits, lunchSec: r.L.total,
      P: power(), baseP: S.base.power, baseR: S.base.radius, skSum: skA, itemN: Object.keys(S.items).length,
      masterySum: Object.values(S.mastery).reduce((a, b) => a + b, 0), boughtX: bx.k,
      spentRev: rev0 - S.revenue, spentTech: tech0 - S.tech, buyRev, buyTech, buyBase: bx.base, R, Rk: R / R0, gradeCap: itemGradeCap(), bossDmg: r.bossDmg, bossMax: r.bossMax,
    });
    checkMs(run);
    if (o.stopWhenDone && got.has('treeAll')) break;
    if (!o.quiet && run % 50 === 0) process.stderr.write(`  ${BOT_NAME[o.bot]}/${POLICY_NAME[o.policy]} seed${o.seed} ${run}판 ${(tSec / 60).toFixed(1)}분\n`);
  }
  void bossRun;
  return out;
}

/* ── 요약 ───────────────────────────────── */
export interface Summary {
  label: string; bot: BotId; policy: PolicyId; seeds: number;
  checkpoints: { at: string; run: number; tMin: number; rev: number; tech: number; ratio: number; gmvRun: number; gmvTotal: number; nodes: number; levels: number; lv: number; district: string; count: number; topName: string; Rk: number; baseP: number; baseR: number }[];
  milestones: { key: string; name: string; run: number | null; tMin: number | null; n: number }[];
  stall: { maxNoBuy: number; at: number; tMin: number; streaks5: number; list: { from: number; len: number; tMin: number }[] };
  burst: { max10: number; maxAll: number; at: number; first10: number[]; big10: number; bigAll: number; avg10: number; max12: number; avg12: number; max12tree: number; avg12tree: number; days3tree: number };
  /** 아무것도 안 산(트리·기본 역량·스킬 등 전부 0) 판이 이어진 최대 길이 */
  stallAny: { max: number; at: number };
  first: { rev: number; gmv: number; comm: number; fee: number; tech: number; count: number; minC: number; maxC: number; zero: number; buyRun: number; maxBuyRun: number };
  /** 설계서 2-4 · 3장 검사 */
  cur: { rev10: number; tech10: number; windows: { from: number; revIn: number; revOut: number; techIn: number; techOut: number }[]; minShareRev: number; minShareTech: number };
  basic: { sum10: number; p50: number; r50: number; days2plus: number; brMaxRun: number | null };
  /** 설계서 4-4: 등급 k 첫 값 ÷ 그 등급이 열린 영업일 하루 기술력(시드 중앙값). 열리지 않은 등급은 null */
  items: (number | null)[];
}
const CHECKS: { at: string; run?: number; min?: number }[] = [
  { at: '1일', run: 1 }, { at: '3일', run: 3 }, { at: '5일', run: 5 }, { at: '10일', run: 10 }, { at: '25일', run: 25 }, { at: '50일', run: 50 }, { at: '100일', run: 100 },
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
      at: c.at, run: avg(rs.map((r) => r.run)), tMin: avg(rs.map((r) => r.tMin)), rev: gavg(rs.map((r) => r.rev)), tech: gavg(rs.map((r) => r.tech)),
      ratio: gavg(rs.map((r) => r.tech / Math.max(1, r.rev))), gmvRun: gavg(rs.map((r) => r.gmv)), gmvTotal: gavg(rs.map((r) => r.gmvTotal)),
      nodes: avg(rs.map((r) => r.nodes)), levels: avg(rs.map((r) => r.levels)), lv: avg(rs.map((r) => r.lv)), district: most((r) => r.district), count: avg(rs.map((r) => r.count)), topName: most((r) => r.topName),
      Rk: med(rs.map((r) => r.Rk)), baseP: avg(rs.map((r) => r.baseP)), baseR: avg(rs.map((r) => r.baseR)),
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
  /* 폭주: 한 번에 산 칸 수 */
  let max10 = 0;
  let maxAll = 0;
  let bAt = 0;
  let max12 = 0;
  const per12: number[] = [];
  let max12tree = 0;
  let days3tree = 0;
  const per12tree: number[] = [];
  for (const k of cs) for (const r of k.runs) {
    if (r.tMin <= 10) max10 = Math.max(max10, r.boughtTree);
    if (r.boughtTree > maxAll) {
      maxAll = r.boughtTree;
      bAt = r.run;
    }
    /* 8-3: 1~12영업일 한 영업일 구매(두 재화 합, 레벨 올리기 포함 = 트리 + 기본 역량 + 스킬·아이템·관리) */
    if (r.run <= 12) {
      max12 = Math.max(max12, r.bought);
      per12.push(r.bought);
      max12tree = Math.max(max12tree, r.boughtTree);
      per12tree.push(r.boughtTree);
      if (r.boughtTree >= 3) days3tree++;
    }
  }
  const first10 = Array.from({ length: 10 }, (_, i) => avg(cs.map((k) => k.runs[i]?.bought ?? 0)));
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
  /* 2-4: 1~10영업일 재화별 산 칸 수, 10일 구간마다 지출 ÷ 수입 */
  const rev10 = avg(cs.map((k) => k.runs.slice(0, 10).reduce((a, r) => a + r.buyRev, 0)));
  const tech10 = avg(cs.map((k) => k.runs.slice(0, 10).reduce((a, r) => a + r.buyTech, 0)));
  const windows: Summary['cur']['windows'] = [];
  let minShareRev = Infinity;
  let minShareTech = Infinity;
  for (let from = 1; from <= 111; from += 10) {
    const w = { from, revIn: 0, revOut: 0, techIn: 0, techOut: 0 };
    let n = 0;
    for (const k of cs) {
      const done = k.milestones.find((m) => m.key === 'treeAll')?.run ?? Infinity;
      const rs = k.runs.filter((r) => r.run >= from && r.run < from + 10 && r.run < done);
      if (rs.length < 10) continue;
      n++;
      w.revIn += rs.reduce((a, r) => a + r.rev, 0);
      w.revOut += rs.reduce((a, r) => a + r.spentRev, 0);
      w.techIn += rs.reduce((a, r) => a + r.tech, 0);
      w.techOut += rs.reduce((a, r) => a + r.spentTech, 0);
    }
    if (!n) continue;
    windows.push(w);
    minShareRev = Math.min(minShareRev, w.revOut / Math.max(1, w.revIn));
    minShareTech = Math.min(minShareTech, w.techOut / Math.max(1, w.techIn));
  }
  /* 3장: 기본 역량 */
  const sum10 = avg(cs.map((k) => (k.runs[9] ? k.runs[9].baseP + k.runs[9].baseR : 0)));
  const p50 = avg(cs.map((k) => k.runs[49]?.baseP ?? 0));
  const r50 = avg(cs.map((k) => k.runs[49]?.baseR ?? 0));
  const d2: number[] = [];
  for (const k of cs) for (const r of k.runs.slice(0, 50)) d2.push(r.buyBase >= 2 ? 1 : 0);
  const brm = cs.map((k) => k.milestones.find((m) => m.key === 'brMax')?.run).filter((x) => x != null) as number[];
  const items: (number | null)[] = [];
  for (let g = 1; g <= ITEM_FIRST.length; g++) {
    const v: number[] = [];
    for (const k of cs) {
      const r = k.runs.find((x) => x.gradeCap >= g);
      if (r) v.push(ITEM_FIRST[g - 1] / Math.max(1, r.tech));
    }
    items.push(v.length === cs.length ? med(v) : null);
  }
  const r1 = cs.map((k) => k.runs[0]);
  const buyRuns = cs.map((k) => k.milestones.find((m) => m.key === 'buy1')?.run ?? 99);
  return {
    label: `${BOT_NAME[o.bot]} · ${POLICY_NAME[o.policy]}`, bot: o.bot, policy: o.policy, seeds: cs.length, checkpoints, milestones,
    stall: { maxNoBuy, at, tMin: atMin, streaks5, list: list.slice(0, 12) },
    burst: { max10, maxAll, at: bAt, first10, big10, bigAll, avg10: avg(per10), max12, avg12: avg(per12), max12tree, avg12tree: avg(per12tree), days3tree },
    stallAny: { max: saMax, at: saAt },
    first: {
      rev: avg(r1.map((r) => r.rev)), gmv: avg(r1.map((r) => r.gmv)), comm: avg(r1.map((r) => r.comm)), fee: avg(r1.map((r) => r.fee)), tech: avg(r1.map((r) => r.tech)), count: avg(r1.map((r) => r.count)),
      minC: Math.min(...r1.map((r) => r.minContractRev)), maxC: Math.max(...r1.map((r) => r.maxContractRev)), zero: avg(r1.map((r) => r.zeroRevContracts)), buyRun: avg(buyRuns), maxBuyRun: Math.max(...buyRuns),
    },
    cur: { rev10, tech10, windows, minShareRev: minShareRev === Infinity ? 0 : minShareRev, minShareTech: minShareTech === Infinity ? 0 : minShareTech },
    basic: { sum10, p50, r50, days2plus: avg(d2), brMaxRun: brm.length === cs.length ? avg(brm) : null },
    items,
  };
}

/** 새 저장 첫 판만 여러 번(실제 게임 대조용) */
export function firstRuns(bot: BotId, n: number, orient: Orient = 'land', rng?: () => number): { rev: number; gmv: number; comm: number; fee: number; tech: number; count: number; corps: number; stores: number; counts: Record<string, number> }[] {
  const out = [];
  for (let s = 1; s <= n; s++) {
    if (rng) G.__simRand = rng;
    else reseed(1000 + s);
    const botRnd = rng || mulberry32(s * 31 + 7);
    resetGame();
    refreshEff();
    const r = playLunch(bot, orient, botRnd);
    closeRun(r.st);
    out.push({ rev: r.st.rev, gmv: r.st.gmv, comm: r.st.comm, fee: r.st.fee, tech: r.st.tech, count: r.st.count, corps: r.st.corps, stores: r.st.stores, counts: { ...S.counts } });
  }
  return out;
}

/** 새 저장 첫 영업일 반경 밀도(설계서 0-2): 0.1초마다 반경 안 대상 수, 1초마다 최선 자리 최대 */
export function firstDayRadius(bot: BotId | 'cluster', n: number, orient: Orient): { hist: Record<number, number>; pot: Record<number, number>; maxIn: number; rev: number; count: number; R: number } {
  const hist: Record<number, number> = {};
  const pot: Record<number, number> = {};
  let maxIn = 0;
  let rev = 0;
  let count = 0;
  let R = 0;
  for (let s = 1; s <= n; s++) {
    reseed(5000 + s);
    const botRnd = mulberry32(s * 131 + 11);
    resetGame();
    refreshEff();
    const r = playLunch(bot, orient, botRnd, true);
    R = r.L.R;
    rev += r.st.rev;
    count += r.st.count;
    for (const k in r.rad!.hist) hist[k] = (hist[k] || 0) + r.rad!.hist[k];
    for (const p of r.rad!.pot) pot[p] = (pot[p] || 0) + 1;
    maxIn = Math.max(maxIn, r.rad!.maxIn);
  }
  return { hist, pot, maxIn, rev: rev / n, count: count / n, R };
}

import { fmt } from '../../src/game/format';
export { lockCheck } from './lockcheck';
export { fmt };
export const info = { F, BOT_NAME, POLICY_NAME, med, gavg, avg, TREE, costOf: (id: string) => nodeCost(TREE_BY[id]) };

/**
 * 경제·공식. 상수는 설계 데이터 formulas 를 그대로 옮긴다(요율은 게임용 가정값).
 * 효과 합(E)·설득력·반경·비용·구매 가능 여부를 여기서 계산한다. 수치 정본은 scripts/balance/econ.mjs → gdd-data.json,
 * 밸런스 시뮬(scripts/balance)은 이 파일을 그대로 불러 쓴다.
 */
import {
  CHAR_BY, DISTRICT_BY, F, ITEM_ALL_KEYS, ITEM_BY, SKILLS, SKILL_ORDER, TARGETS, TREE, TREE_BY, TREE_CENTER,
  type SkillId, type TargetDef, type TreeNode,
} from './data';
import { S } from './state';

/* ── 상수 (formulas) ───────────────────────────── */
export const ECON = F.ECON;
export const COMMISSION_RATE = ECON.COMMISSION_RATE; // 제휴점 수수료율 (거래액의 10%)
export const SERVICE_FEE_RATE = ECON.SERVICE_FEE_RATE; // 고객사 이용료율 (기업 계약 규모의 5%)
export const LUNCH_PRICE = ECON.LUNCH_PRICE; // 한 끼 식대 8,000원
export const COST_SCALE = ECON.COST_SCALE; // 기본 역량·스킬·아이템 강화 비용 공식의 1 = 매출 N원 (트리 비용은 데이터에 원 단위로 들어 있음)
export const VALUE_SCALE = ECON.VALUE_SCALE; // 거래액 숫자 크기 눈금 기준(원). fx.number.magK 와 같이 씀
export const REQUIRE_BOTH_SIDES = ECON.REQUIRE_BOTH_SIDES;
export const MATCH = F.MATCH;
export const RUN = F.RUN;
export const DIST = F.DIST;

/* ── 효과 합 ───────────────────────────────────── */
export interface Eff {
  gmv: number; point: number; xp: number; time: number; spawn: number; power: number; radius: number; crit: number; itemFind: number;
  skillDmg: number; cd: number; rare: number; soft: number; per10: number; itemPow: number;
  gflat: number; xflat: number; crowd: number; respawn: number; pflat: number; all: number; disc: number; fps: number;
  womC: number; hotC: number; refN: number; match: number; autoMatch: number; comm: number; fee: number; auto: number;
  tv: Record<string, number>; cds: Record<string, number>; dbl: Record<string, number>;
  un: { tgt: Record<string, 1>; district: Record<string, 1>; sk: Record<string, 1>; cap: Record<string, 1> };
  wom: number; hot: number; ref: number; chest: number; inquiry: number;
  [k: string]: unknown;
}

function zeroEff(): Eff {
  return {
    gmv: 0, point: 0, xp: 0, time: 0, spawn: 0, power: 0, radius: 0, crit: 0, itemFind: 0, skillDmg: 0, cd: 0, rare: 0, soft: 0, per10: 0, itemPow: 0,
    gflat: 0, xflat: 0, crowd: 0, respawn: 0, pflat: 0, all: 0, disc: 0, fps: 0, womC: 0, hotC: 0, refN: 0, match: 0, autoMatch: 0, comm: 0, fee: 0, auto: 0,
    tv: {}, cds: {}, dbl: {}, un: { tgt: {}, district: {}, sk: {}, cap: {} }, wom: 0, hot: 0, ref: 0, chest: 0, inquiry: 0,
  };
}

export const tlv = (id: string) => S.tree[id] || 0;
export const owns = (id: string) => !!S.tree[id];
const sumVals = (n: TreeNode, l: number) => {
  let v = 0;
  for (let i = 0; i < l; i++) v += n.vals[i] || 0;
  return v;
};

export let E: Eff = zeroEff();

export function refreshEff(): Eff {
  const e = zeroEff();
  for (const id in S.tree) {
    const n = TREE_BY[id];
    const l = S.tree[id];
    if (!n || !l) continue;
    const v = sumVals(n, l);
    const ef = n.ef;
    if (ef === 'cds' || ef === 'dbl') {
      const tg = String(n.tg);
      e[ef][tg] = (e[ef][tg] || 0) + v;
    } else if (ef === 'tv') {
      const list = Array.isArray(n.tg) ? n.tg : String(n.tg).split(',');
      for (const t of list) e.tv[t] = (e.tv[t] || 0) + v;
    } else if (ef === 'tgt' || ef === 'district' || ef === 'sk' || ef === 'cap') {
      e.un[ef][String(n.tg)] = 1;
    } else if (ef === 'wom' || ef === 'hot' || ef === 'ref') {
      e[ef] = 1;
    } else if (ef === 'chest' || ef === 'inquiry') {
      e[ef] = Math.max(e[ef], Number(n.tg) || 1);
    } else if (typeof e[ef] === 'number') {
      (e as Record<string, number>)[ef] = (e[ef] as number) + v;
    }
  }
  const cp = CHAR_BY[S.rep] || CHAR_BY.bear;
  const relicPow = 1 + (cp.eff.itemPow || 0);
  for (const k in cp.eff) if (typeof e[k] === 'number') (e as Record<string, number>)[k] = (e[k] as number) + cp.eff[k];
  let all = 0;
  for (const id in S.items) {
    const it = ITEM_BY[id];
    const lv = S.items[id];
    if (!it || !lv) continue;
    const val = it.v * lv * relicPow;
    if (it.k === 'all') all += val;
    else if (typeof e[it.k] === 'number') (e as Record<string, number>)[it.k] = (e[it.k] as number) + val;
  }
  if (all) for (const k of ITEM_ALL_KEYS) (e as Record<string, number>)[k] = (e[k] as number) + all;
  E = e;
  return e;
}

/* ── 설득력·반경·시간 ─────────────────────────── */
/** 설득력 P(초당) = 10 × (1 + pflat) × 1.08^기본설득력 × 1.02^(레벨−1) × (1 + power + all) */
export function power(): number {
  return RUN.POWER_BASE * (1 + E.pflat) * Math.pow(F.BASIC.power.mult, S.base.power) * Math.pow(F.XP.powerPerLv, S.lv - 1) * (1 + E.power + E.all);
}
/** 반경 R = 105.4 × U × 1.04^기본반경 × (1 + radius + all) */
export function radiusOf(U: number): number {
  return DIST.radius * U * Math.pow(F.BASIC.radius.mult, S.base.radius) * (1 + E.radius + E.all);
}
export function lunchTime(): number {
  return RUN.BASE_TIME + E.time;
}
export const xpNeed = (lv: number) => Math.floor(F.XP.base * Math.pow(F.XP.growth, lv - 1));
export const lvPowerMult = (lv: number) => Math.pow(F.XP.powerPerLv, lv - 1);

/* ── 해금 ──────────────────────────────────────── */
export function targetUnlocked(t: TargetDef): boolean {
  return t.unlock === 'base' || !!E.un.tgt[t.id];
}
export function unlockedTargets(): TargetDef[] {
  return TARGETS.filter(targetUnlocked);
}
export function districtUnlocked(id: string): boolean {
  const d = DISTRICT_BY[id];
  return !!d && (d.unlock === 'base' || !!E.un.district[id]);
}
export function repUnlocked(id: string): boolean {
  const c = CHAR_BY[id];
  return !!c && (c.unlock === 'base' || !!E.un.cap[id]);
}
export function skillUnlocked(id: SkillId): boolean {
  return !!E.un.sk[id];
}

/* ── 트리 ──────────────────────────────────────── */
export function nodeCost(n: TreeNode): number {
  return Math.ceil(n.costs[Math.min(tlv(n.id), n.max - 1)] * (1 - Math.min(F.TREE.discCap, E.disc || 0)));
}
export function nodeLinked(n: TreeNode): boolean {
  return n.id === TREE_CENTER || n.link.some(owns);
}
export function nodeVisible(n: TreeNode): boolean {
  return n.id === TREE_CENTER || owns(n.id) || n.link.some(owns);
}
export function canBuyNode(n: TreeNode): boolean {
  return nodeLinked(n) && tlv(n.id) < n.max && S.revenue >= nodeCost(n);
}
export function anyNodeBuyable(): boolean {
  for (const n of TREE) if (canBuyNode(n)) return true;
  return false;
}
/** 영업력·기술력 = 가지별 보유 레벨 합 */
export function statLevels(): { sales: number; tech: number; common: number } {
  const r = { sales: 0, tech: 0, common: 0 };
  for (const id in S.tree) {
    const n = TREE_BY[id];
    if (n) r[n.br] += S.tree[id];
  }
  return r;
}
export const STAT_MAX = { sales: F.STATS.sales.max as number, tech: F.STATS.tech.max as number };

/* ── 기본 역량 ─────────────────────────────────── */
export function baseCost(k: 'power' | 'radius'): number {
  const b = F.BASIC[k];
  return Math.round(b.base * Math.pow(b.growth, S.base[k]) * COST_SCALE);
}
export const baseMaxed = (k: 'power' | 'radius') => k === 'radius' && S.base.radius >= F.BASIC.radius.max;

/* ── 스킬 ──────────────────────────────────────── */
export const skLv = (id: SkillId, i: number) => S.sk[id + i] || 0;
export function skOpen(id: SkillId, i: number): boolean {
  const k = SKILLS[id].sk[i];
  return k.need == null || skLv(id, k.need) >= (k.nl || 1);
}
export function skCost(id: SkillId, i: number): { rev: number; point: number } {
  const k = SKILLS[id].sk[i];
  const C = F.SKILL_COST;
  const pi = SKILL_ORDER.indexOf(id);
  const lv = skLv(id, i);
  const special = k.max === 1;
  return {
    rev: Math.round(C.gold * Math.pow(C.growth, lv + i * C.slotStep) * Math.pow(C.abilityGrowth, pi) * (special ? C.specialGold : 1) * COST_SCALE),
    point: Math.round((C.point[0] + C.point[1] * lv + C.point[2] * i) * (special ? C.specialPoint : 1)),
  };
}
export function skCooldown(id: SkillId): number {
  return Math.max(RUN.SKILL_CD_MIN, SKILLS[id].cd * Math.pow(F.SKILL_LEVEL.cdStep, skLv(id, 2)) * (1 - E.cd) + (E.cds[id] || 0));
}
export function canBuySk(id: SkillId, i: number): boolean {
  if (!skillUnlocked(id) || !skOpen(id, i)) return false;
  if (skLv(id, i) >= SKILLS[id].sk[i].max) return false;
  const c = skCost(id, i);
  return S.revenue >= c.rev && S.point >= c.point;
}
export function anySkBuyable(): boolean {
  for (const id of SKILL_ORDER) for (let i = 0; i < 5; i++) if (canBuySk(id, i)) return true;
  return false;
}

/* ── 거래처 관리 ───────────────────────────────── */
export function masteryOpen(t: TargetDef): boolean {
  return S.lv >= t.masteryLv;
}
export function masteryCost(t: TargetDef): { rev: number; point: number } {
  const M = F.MASTERY;
  const st = S.mastery[t.id] || 0;
  return { rev: Math.round(t.value * M.costK * Math.pow(M.growth, st)), point: Math.round(M.point[0] + M.point[1] * st + M.point[2] * t.tier) };
}
export function canBuyMastery(t: TargetDef): boolean {
  if (!masteryOpen(t) || !targetUnlocked(t)) return false;
  if ((S.mastery[t.id] || 0) >= F.MASTERY.max) return false;
  const c = masteryCost(t);
  return S.revenue >= c.rev && S.point >= c.point;
}

/* ── 아이템 ────────────────────────────────────── */
export function itemCost(id: string): { rev: number; point: number } {
  const I = F.ITEM;
  const lv = S.items[id] || 1;
  return { rev: Math.round(I.gold * Math.pow(I.growth, lv - 1) * COST_SCALE), point: Math.round(I.point[0] + I.point[1] * (lv - 1)) };
}
export function canBuyItem(id: string): boolean {
  const lv = S.items[id] || 0;
  if (!lv || lv >= F.ITEM.max) return false;
  const c = itemCost(id);
  return S.revenue >= c.rev && S.point >= c.point;
}
export function itemEffectValue(id: string, lv: number): number {
  const it = ITEM_BY[id];
  const cp = CHAR_BY[S.rep] || CHAR_BY.bear;
  return it.v * lv * (1 + (cp.eff.itemPow || 0));
}

/* ── 레벨 ──────────────────────────────────────── */
/** 경험치 더하기. 오른 레벨 수 반환 */
export function addXp(n: number): number {
  S.xp += n;
  let up = 0;
  while (S.xp >= xpNeed(S.lv)) {
    S.xp -= xpNeed(S.lv);
    S.lv++;
    up++;
    if (up > 500) break;
  }
  return up;
}
/** 다음에 열리는 거래처 관리 */
export function nextMasteryUnlock(lv: number): TargetDef | null {
  let best: TargetDef | null = null;
  for (const t of TARGETS) if (t.masteryLv > lv && (!best || t.masteryLv < best.masteryLv)) best = t;
  return best;
}
export function payable(c: { rev: number; point: number }): boolean {
  return S.revenue >= c.rev && S.point >= c.point;
}
export function pay(c: { rev: number; point: number }): void {
  S.revenue -= c.rev;
  S.point -= c.point;
}

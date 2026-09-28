/**
 * 경제·공식. 상수는 설계 데이터 formulas 를 그대로 옮긴다(요율은 게임용 가정값).
 * 효과 합(E)·설득력·반경·비용·구매 가능 여부를 여기서 계산한다. 수치 정본은 scripts/balance/econ.mjs → gdd-data.json,
 * 밸런스 시뮬(scripts/balance)은 이 파일을 그대로 불러 쓴다.
 *
 * 재화 두 개(경제 v4):
 *   매출(S.revenue)  = 영업 가지(서쪽)·공통 칸 · 기본 역량 · 거래처 관리
 *   기술력(S.tech)   = 기술 가지(동쪽) · 영업 스킬 · 아이템 강화
 * 잠김: 트리 칸 req/reqAny · 기본 역량(unlock 칸) · 거래처 관리(한 번 이상 만남) · 아이템(등급 풀) — 조건 전에는 강화 불가.
 */
import {
  CHAR_BY, DISTRICT_BY, F, ITEM_ALL_KEYS, ITEM_BY, ITEMS, SKILLS, SKILL_ORDER, TARGETS, TREE, TREE_BY, TREE_CENTER,
  type ItemDef, type SkillId, type TargetDef, type TreeNode,
} from './data';
import { S } from './state';

/* ── 상수 (formulas) ───────────────────────────── */
export const ECON = F.ECON;
export const COMMISSION_RATE = ECON.COMMISSION_RATE; // 제휴점 수수료율 (거래액의 10%)
export const SERVICE_FEE_RATE = ECON.SERVICE_FEE_RATE; // 고객사 이용료율 (기업 계약 규모의 5%)
export const LUNCH_PRICE = ECON.LUNCH_PRICE; // 한 끼 식대 8,000원
export const COST_SCALE = ECON.COST_SCALE;
export const VALUE_SCALE = ECON.VALUE_SCALE; // 거래액 숫자 크기 눈금 기준(원). fx.number.magK 와 같이 씀
export const REQUIRE_BOTH_SIDES = ECON.REQUIRE_BOTH_SIDES;
export const MATCH = F.MATCH;
export const RUN = F.RUN;
export const DIST = F.DIST;
export const TECH = F.TECH;

/** 비용·보상 한 묶음: 매출(원) · 기술력 */
export interface Cost { rev: number; tech: number }
export type Currency = 'rev' | 'tech';

/* ── 효과 합 ───────────────────────────────────── */
export interface Eff {
  gmv: number; tech: number; xp: number; time: number; spawn: number; power: number; radius: number; crit: number; itemFind: number;
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
    gmv: 0, tech: 0, xp: 0, time: 0, spawn: 0, power: 0, radius: 0, crit: 0, itemFind: 0, skillDmg: 0, cd: 0, rare: 0, soft: 0, per10: 0, itemPow: 0,
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
/** 반경 R = DIST.radius(42) × U × 1.05^기본반경 × (1 + radius + all) */
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

/* ── 재화 ──────────────────────────────────────── */
export function payable(c: Cost): boolean {
  return S.revenue >= c.rev && S.tech >= c.tech;
}
export function pay(c: Cost): void {
  S.revenue -= c.rev;
  S.tech -= c.tech;
}
/** 모자란 재화 이름(없으면 '') */
export function lackOf(c: Cost): string {
  const lr = c.rev > S.revenue;
  const lt = c.tech > S.tech;
  return lr && lt ? '매출·기술력' : lr ? '매출' : lt ? '기술력' : '';
}

/* ── 트리 ──────────────────────────────────────── */
/** 칸을 사는 재화: 기술 가지 = 기술력, 영업 가지·공통 = 매출 */
export function nodeCurrency(n: TreeNode): Currency {
  return n.br === 'tech' ? 'tech' : 'rev';
}
/** 다음 레벨 비용(그 칸 재화 단위) */
export function nodeCost(n: TreeNode): number {
  return Math.ceil(n.costs[Math.min(tlv(n.id), n.max - 1)] * (1 - Math.min(F.TREE.discCap, E.disc || 0)));
}
export function nodeCostObj(n: TreeNode): Cost {
  const c = nodeCost(n);
  return nodeCurrency(n) === 'tech' ? { rev: 0, tech: c } : { rev: c, tech: 0 };
}
export function nodeLinked(n: TreeNode): boolean {
  return n.id === TREE_CENTER || n.link.some(owns);
}
export function nodeVisible(n: TreeNode): boolean {
  return n.id === TREE_CENTER || owns(n.id) || n.link.some(owns);
}
/** 선행 칸 조건(req = 전부 · reqAny = 하나 이상) */
export function nodeReqOk(n: TreeNode): boolean {
  if (n.req && !n.req.every(owns)) return false;
  if (n.reqAny && !n.reqAny.some(owns)) return false;
  return true;
}
/** 잠김 문구에 쓸 선행 칸(아직 없는 것 중 첫 칸) */
export function nodeReqName(n: TreeNode): string {
  const list = n.req || n.reqAny || [];
  const miss = list.filter((id) => !owns(id));
  if (!miss.length) return '';
  if (n.reqAny) return miss.map((id) => TREE_BY[id]?.name || id).join(' 또는 ');
  return TREE_BY[miss[0]]?.name || miss[0];
}
export function canBuyNode(n: TreeNode): boolean {
  return nodeLinked(n) && nodeReqOk(n) && tlv(n.id) < n.max && payable(nodeCostObj(n));
}
export function anyNodeBuyable(): boolean {
  for (const n of TREE) if (canBuyNode(n)) return true;
  return false;
}
/** 가지별 보유 레벨 합(트리 머리 막대·설정 기록) */
export function statLevels(): { sales: number; tech: number; common: number } {
  const r = { sales: 0, tech: 0, common: 0 };
  for (const id in S.tree) {
    const n = TREE_BY[id];
    if (n) r[n.br] += S.tree[id];
  }
  return r;
}
export const STAT_MAX = { sales: F.STATS.sales.max as number, tech: F.STATS.tech.max as number };

/* ── 기본 역량 (매출) ─────────────────────────── */
export type BaseKey = 'power' | 'radius';
/** 열어 주는 트리 칸(설득력 = 영업 교육 Ⅰ, 반경 = 발품 영업 Ⅰ) */
export const baseUnlockNode = (k: BaseKey): TreeNode => TREE_BY[F.BASIC[k].unlock];
export function baseUnlocked(k: BaseKey): boolean {
  return owns(F.BASIC[k].unlock);
}
/** 비용 = 해금 칸 첫 값 × costK × growth^레벨 */
export function baseCost(k: BaseKey): number {
  const b = F.BASIC[k];
  return Math.round(baseUnlockNode(k).costs[0] * b.costK * Math.pow(b.growth, S.base[k]));
}
export const baseMaxed = (k: BaseKey) => k === 'radius' && S.base.radius >= F.BASIC.radius.max;
export function canBuyBaseLv(k: BaseKey): boolean {
  return baseUnlocked(k) && !baseMaxed(k) && S.revenue >= baseCost(k);
}

/* ── 스킬 (기술력) ─────────────────────────────── */
export const skLv = (id: SkillId, i: number) => S.sk[id + i] || 0;
export function skOpen(id: SkillId, i: number): boolean {
  const k = SKILLS[id].sk[i];
  return k.need == null || skLv(id, k.need) >= (k.nl || 1);
}
/** 칸 첫 값 = 그 스킬 해금 칸 첫 값 × slotK[칸], 레벨당 × growth */
export function skCost(id: SkillId, i: number): Cost {
  const C = F.SKILL_COST;
  const un = TREE_BY[SKILLS[id].unlock];
  return { rev: 0, tech: Math.round(un.costs[0] * C.slotK[i] * Math.pow(C.growth, skLv(id, i))) };
}
export function skCooldown(id: SkillId): number {
  return Math.max(RUN.SKILL_CD_MIN, SKILLS[id].cd * Math.pow(F.SKILL_LEVEL.cdStep, skLv(id, 2)) * (1 - E.cd) + (E.cds[id] || 0));
}
export function canBuySk(id: SkillId, i: number): boolean {
  if (!skillUnlocked(id) || !skOpen(id, i)) return false;
  if (skLv(id, i) >= SKILLS[id].sk[i].max) return false;
  return payable(skCost(id, i));
}
export function anySkBuyable(): boolean {
  for (const id of SKILL_ORDER) for (let i = 0; i < 5; i++) if (canBuySk(id, i)) return true;
  return false;
}

/* ── 거래처 관리 (매출) ───────────────────────── */
export function masteryOpen(t: TargetDef): boolean {
  return S.lv >= t.masteryLv;
}
/** 한 번 이상 만난 거래처만 관리 가능(??? 카드는 잠김) */
export function masterySeen(t: TargetDef): boolean {
  return !!S.seen[t.id] || !!S.counts[t.id];
}
export function masteryCost(t: TargetDef): Cost {
  const M = F.MASTERY;
  const st = S.mastery[t.id] || 0;
  return { rev: Math.round(t.value * M.costK * Math.pow(M.growth, st)), tech: 0 };
}
export function canBuyMastery(t: TargetDef): boolean {
  if (!masteryOpen(t) || !targetUnlocked(t) || !masterySeen(t)) return false;
  if ((S.mastery[t.id] || 0) >= F.MASTERY.max) return false;
  return payable(masteryCost(t));
}

/* ── 아이템 (기술력) ───────────────────────────── */
/**
 * 등급별 강화 첫 값(기술력). 데이터에 first(등급 1~20 값)가 있으면 그대로(econ.mjs 가 시뮬로 정함: 그 등급이 열리는 날 하루 기술력의 몇 배),
 * 없으면 등급 1~4 = 식권 앱 출시 첫 값 × baseK, 5~20 = 거래처 해금 칸 첫 값 오름차순 × tgtK. 둘 다 앞 등급 × step 이상
 */
export const ITEM_FIRST: number[] = (() => {
  const I = F.ITEM;
  if (Array.isArray(I.first) && I.first.length >= ITEMS.length) return I.first.slice(0, ITEMS.length);
  const base = TREE_BY[I.baseNode].costs[0];
  const tg = I.tgtNodes.map((id) => TREE_BY[id].costs[0]).sort((a, b) => a - b);
  const out: number[] = [];
  for (let g = 1; g <= ITEMS.length; g++) {
    let c = g <= I.baseK.length ? base * I.baseK[g - 1] : (tg[g - 1 - I.baseK.length] ?? tg[tg.length - 1]) * I.tgtK;
    if (g > 1) c = Math.max(c, out[g - 2] * I.step);
    out.push(Math.round(c));
  }
  return out;
})();
/** 해금한 대상 수(트윈타워 제외) */
export function unlockedTargetCount(): number {
  let n = 0;
  for (const t of TARGETS) if (t.beh !== 'boss' && targetUnlocked(t)) n++;
  return n;
}
/** 떨어질 수 있는 가장 높은 등급 = max(gradeMin, 해금 대상 수) */
export function itemGradeCap(): number {
  return Math.max(F.ITEM.gradeMin, unlockedTargetCount());
}
/** 지금 떨어지는 아이템 풀(등급 제한) */
export function itemPool(): ItemDef[] {
  const cap = itemGradeCap();
  return ITEMS.filter((it) => it.grade <= cap);
}
export function itemCost(id: string): Cost {
  const I = F.ITEM;
  const lv = S.items[id] || 1;
  const g = ITEM_BY[id].grade || 1;
  return { rev: 0, tech: Math.round(ITEM_FIRST[g - 1] * Math.pow(I.growth, lv - 1)) };
}
export function canBuyItem(id: string): boolean {
  const lv = S.items[id] || 0;
  if (!lv || lv >= F.ITEM.max) return false;
  if ((ITEM_BY[id].grade || 1) > itemGradeCap()) return false;
  return payable(itemCost(id));
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

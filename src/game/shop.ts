/**
 * 사무실에서 사는 것들의 상태 변경(그림·소리 없음). 사무실 UI 와 밸런스 시뮬(scripts/balance)이 같이 쓴다.
 * 살 수 있는지 판정·비용은 rules.ts, 여기서는 돈을 내고 레벨을 올리는 것만.
 */
import { CHAR_BY, type SkillId, type TargetDef, type TreeNode } from './data';
import {
  baseCost, baseMaxed, canBuyItem, canBuyMastery, canBuyNode, canBuySk, itemCost, masteryCost, nodeCost, pay, refreshEff, repUnlocked,
  skCost, skLv, tlv,
} from './rules';
import { S } from './state';

/** 성장 트리 한 칸 한 레벨 */
export function buyNode(n: TreeNode): boolean {
  if (!canBuyNode(n)) return false;
  const cost = nodeCost(n);
  S.revenue -= cost;
  S.treeSpent += cost;
  S.tree[n.id] = tlv(n.id) + 1;
  refreshEff();
  return true;
}

/** 기본 역량(설득력·영업 반경) 한 레벨 */
export function canBuyBase(k: 'power' | 'radius'): boolean {
  return !baseMaxed(k) && S.revenue >= baseCost(k);
}
export function buyBase(k: 'power' | 'radius'): boolean {
  if (!canBuyBase(k)) return false;
  S.revenue -= baseCost(k);
  S.base[k]++;
  return true;
}

/** 영업 스킬 칸 한 레벨 */
export function buySkill(id: SkillId, i: number): boolean {
  if (!canBuySk(id, i)) return false;
  pay(skCost(id, i));
  S.sk[id + i] = skLv(id, i) + 1;
  return true;
}

/** 영업 아이템 강화 한 레벨 */
export function buyItem(id: string): boolean {
  if (!canBuyItem(id)) return false;
  pay(itemCost(id));
  S.items[id]++;
  refreshEff();
  return true;
}

/** 거래처 관리 한 단계 */
export function buyMastery(t: TargetDef): boolean {
  if (!canBuyMastery(t)) return false;
  pay(masteryCost(t));
  S.mastery[t.id] = (S.mastery[t.id] || 0) + 1;
  return true;
}

/** 영업 대표 영입(무료) — 영입하면 바로 배정 */
export function canHireRep(id: string): boolean {
  return !!CHAR_BY[id] && !S.reps[id] && repUnlocked(id);
}
export function hireRep(id: string): boolean {
  if (!canHireRep(id)) return false;
  S.reps[id] = 1;
  S.rep = id;
  refreshEff();
  return true;
}
/** 이미 영입한 대표로 바꾸기 */
export function assignRep(id: string): boolean {
  if (!S.reps[id]) return false;
  S.rep = id;
  refreshEff();
  return true;
}

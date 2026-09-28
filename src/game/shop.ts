/**
 * 사무실에서 사는 것들의 상태 변경(그림·소리 없음). 사무실 UI 와 밸런스 시뮬(scripts/balance)이 같이 쓴다.
 * 살 수 있는지 판정·비용은 rules.ts, 여기서는 재화(매출·기술력)를 내고 레벨을 올리는 것만.
 */
import { CHAR_BY, type SkillId, type TargetDef, type TreeNode } from './data';
import {
  baseCost, canBuyBaseLv, canBuyItem, canBuyMastery, canBuyNode, canBuySk, itemCost, masteryCost, nodeCostObj, pay, refreshEff, repUnlocked,
  skCost, skLv, tlv, type BaseKey,
} from './rules';
import { S } from './state';

/** 성장 트리 한 칸 한 레벨(영업 가지·공통 = 매출, 기술 가지 = 기술력) */
export function buyNode(n: TreeNode): boolean {
  if (!canBuyNode(n)) return false;
  const c = nodeCostObj(n);
  pay(c);
  S.treeSpent += c.rev;
  S.treeSpentTech += c.tech;
  S.tree[n.id] = tlv(n.id) + 1;
  refreshEff();
  return true;
}

/** 기본 역량(설득력·영업 반경) 한 레벨 — 해금 칸 보유 뒤, 매출 */
export function canBuyBase(k: BaseKey): boolean {
  return canBuyBaseLv(k);
}
export function buyBase(k: BaseKey): boolean {
  if (!canBuyBase(k)) return false;
  S.revenue -= baseCost(k);
  S.base[k]++;
  return true;
}

/** 영업 스킬 칸 한 레벨(기술력) */
export function buySkill(id: SkillId, i: number): boolean {
  if (!canBuySk(id, i)) return false;
  pay(skCost(id, i));
  S.sk[id + i] = skLv(id, i) + 1;
  return true;
}

/** 영업 아이템 강화 한 레벨(기술력) */
export function buyItem(id: string): boolean {
  if (!canBuyItem(id)) return false;
  pay(itemCost(id));
  S.items[id]++;
  refreshEff();
  return true;
}

/** 거래처 관리 한 단계(매출) */
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

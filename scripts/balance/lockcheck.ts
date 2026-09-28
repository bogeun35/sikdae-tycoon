/**
 * 잠김 검사(설계서 4-2·4-5·3-3): 게임 규칙(rules.ts·shop.ts) 그대로.
 *   node scripts/balance/run.mjs 와 같은 방식으로 묶어 실행: node scripts/balance/lockcheck.mjs
 *   1) 새 저장에 매출·기술력 1경씩 주고 모든 칸을 id 순으로 한 번씩 buyNode → 선행(req·reqAny) 없이 산 칸 수
 *   2) 같은 상태에서 되풀이(살 수 있는 칸을 다 살 때까지) → 트리 112칸 전부 삼(교착 0)인지
 *   3) 새 저장: 기본 역량 잠김(해금 칸 전) · 못 만난 거래처 관리 잠김 · 등급 풀 밖 아이템
 */
import { TREE, TARGETS, ITEMS } from '../../src/game/data';
import { baseUnlocked, canBuyBaseLv, canBuyMastery, itemGradeCap, itemPool, nodeReqOk, owns, refreshEff, tlv } from '../../src/game/rules';
import { S, resetGame } from '../../src/game/state';
import { buyNode } from '../../src/game/shop';

export function lockCheck() {
  const out: Record<string, unknown> = {};
  resetGame();
  S.revenue = 1e16;
  S.tech = 1e16;
  refreshEff();
  /* 1) id 순 한 번씩 */
  const byId = [...TREE].sort((a, b) => (a.id < b.id ? -1 : 1));
  let badOnce = 0;
  let boughtOnce = 0;
  for (const n of byId) {
    const reqOk = nodeReqOk(n);
    if (buyNode(n)) {
      boughtOnce++;
      if (!reqOk) badOnce++;
    }
  }
  out.pass1 = { bought: boughtOnce, boughtWithoutReq: badOnce };
  /* 2) 되풀이 */
  let bad = 0;
  for (let guard = 0; guard < 2000; guard++) {
    let any = false;
    for (const n of TREE) {
      const reqOk = nodeReqOk(n);
      if (buyNode(n)) {
        any = true;
        if (!reqOk) bad++;
      }
    }
    if (!any) break;
  }
  const full = TREE.filter((n) => tlv(n.id) >= n.max).length;
  const unowned = TREE.filter((n) => !owns(n.id)).map((n) => n.id);
  out.pass2 = { nodesFull: full, of: TREE.length, unowned, boughtWithoutReq: bad };
  /* 3) 새 저장 잠김 */
  resetGame();
  S.revenue = 1e16;
  S.tech = 1e16;
  refreshEff();
  out.fresh = {
    basePowerUnlocked: baseUnlocked('power'), baseRadiusUnlocked: baseUnlocked('radius'),
    canBuyBasePower: canBuyBaseLv('power'), canBuyBaseRadius: canBuyBaseLv('radius'),
    masteryBuyableUnseen: TARGETS.filter((t) => canBuyMastery(t)).map((t) => t.id),
    itemGradeCap: itemGradeCap(), itemPool: itemPool().map((i) => i.id), items: ITEMS.length,
  };
  /* 만난 뒤에는 관리 가능(레벨 되는 곳) */
  S.seen.c01 = 1;
  S.lv = 50;
  out.afterSeen = TARGETS.filter((t) => canBuyMastery(t)).map((t) => t.id);
  return out;
}

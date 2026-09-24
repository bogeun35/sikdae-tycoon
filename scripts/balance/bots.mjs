/**
 * 점심 영업 플레이어 봇 3종 — 시뮬(sim.ts)과 실제 게임 대조(verify-real.cjs)가 같은 함수를 쓴다.
 * 이 파일의 함수는 바깥 변수를 쓰지 않는다(브라우저에 toString() 으로 넣어 그대로 돌리기 때문).
 *
 *   clumsy 서툰: 반경을 지도 위 무작위 지점으로 옮겨 다님(대상을 보지 않음)
 *   normal 보통: 가장 가까운 대상을 쫓음
 *   good   잘함: 가치 ÷ (가는 시간 + 설득 시간)이 가장 큰 대상을 쫓고, 가까운 선물 상자·문의·아이템은 먼저 주움
 *               (스킬은 게임에서 자동 발동 — 잘함 봇은 사무실에서 스킬 칸을 올린다. sim.ts 참고)
 *
 * L = 점심 로직(Lunch) 또는 같은 모양의 객체: ents, net, area, map.topLimit, chests, inquiries, items, cN, rN, P, R
 * mem = 봇 기억(판마다 새로 {}), rnd = 0~1 난수 함수
 * 반환 = 반경을 옮길 목표 지점 {x, y} (지도 좌표)
 */

export const BOT_SPEC = {
  /** 반경 이동 속도(지도 px/초, 가로 지도 1920×1080 기준) · 판단 간격(초) */
  clumsy: { speed: 650, think: 0.25 },
  normal: { speed: 1200, think: 0.15 },
  good: { speed: 1700, think: 0.1 },
};

export function decideClumsy(L, mem, rnd) {
  const a = L.area;
  const top = Math.max(a.y0, L.map.topLimit);
  const n = L.net;
  if (!mem.goal || mem.wait <= 0 || Math.hypot(mem.goal.x - n.x, mem.goal.y - n.y) < 20) {
    mem.goal = { x: a.x0 + rnd() * (a.x1 - a.x0), y: top + rnd() * (a.y1 - top) };
    mem.wait = 0.8 + rnd() * 1.6;
  }
  mem.wait -= mem.dt || 0;
  return mem.goal;
}

export function decideNormal(L, mem) {
  const n = L.net;
  let best = null;
  let bd = 1e18;
  for (const e of L.ents) {
    if (e.grace > 0) continue;
    const d = Math.hypot(e.x - n.x, e.y - n.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return mem.goal || { x: n.x, y: n.y };
  mem.goal = { x: best.x, y: best.y - best.w * 0.2 };
  return mem.goal;
}

export function decideGood(L, mem) {
  const n = L.net;
  const sp = mem.speed || 1700;
  const P = Math.max(1e-9, L.P);
  const R = L.R;
  /* 가까운 줍기 거리 안 선물 상자·문의·아이템 먼저 */
  let pick = null;
  let pd = 520;
  for (const list of [L.chests, L.inquiries, L.items]) {
    for (const c of list || []) {
      if (c.got) continue;
      const d = Math.hypot(c.x - n.x, c.y - n.y);
      if (d < pd) {
        pd = d;
        pick = c;
      }
    }
  }
  if (pick) {
    mem.goal = { x: pick.x, y: pick.y };
    return mem.goal;
  }
  /* 모자란 쪽(기업/식당) 가중 — 매칭 배율 */
  const lack = L.cN > L.rN ? 'store' : L.rN > L.cN ? 'corp' : null;
  let best = null;
  let bs = -1;
  for (const e of L.ents) {
    if (e.grace > 0.3) continue;
    const d = Math.max(0, Math.hypot(e.x - n.x, e.y - n.y) - R * 0.5);
    const v = e.t.value * (e.tank ? 1.6 : 1) * (lack && e.t.side === lack ? 1.5 : 1) * (e.damaged ? 1.15 : 1);
    /* 반경 안에 같이 들어오는 다른 대상도 조금 셈 */
    const s = v / (d / sp + Math.max(0, e.hp) / P + 0.35);
    if (s > bs) {
      bs = s;
      best = e;
    }
  }
  if (!best) return mem.goal || { x: n.x, y: n.y };
  mem.goal = { x: best.x, y: best.y - best.w * 0.2 };
  return mem.goal;
}

/** 반경을 목표 쪽으로 speed × dt 만큼 옮김(점심 화면과 같은 범위로 자름) */
export function moveNet(L, goal, speed, dt) {
  const a = L.area;
  const top = Math.max(a.y0, L.map.topLimit);
  const n = L.net;
  const dx = goal.x - n.x;
  const dy = goal.y - n.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  let x = n.x;
  let y = n.y;
  if (d <= step || d < 1e-6) {
    x = goal.x;
    y = goal.y;
  } else {
    x += (dx / d) * step;
    y += (dy / d) * step;
  }
  n.x = Math.max(a.x0, Math.min(a.x1, x));
  n.y = Math.max(top, Math.min(a.y1, y));
}

export const DECIDE = { clumsy: decideClumsy, normal: decideNormal, good: decideGood };

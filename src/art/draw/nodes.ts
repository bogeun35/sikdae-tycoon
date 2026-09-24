/**
 * 성장 트리 칸 프레임 12종 — 원작 특성 트리 노드(.tn) 그대로 옮김.
 *   기본 #3d5fb8 / 테 #2a4a9a / 바닥 그림자 #1a2f6e
 *   열림 #4a78d8 / 테 #8fc0ff
 *   살 수 있음 = 열림 + 금색 링 3px (맥동은 엔진)
 *   보유 #ffe29a → #f0b429 / 테 #fff3c4 / 그림자 #a8791a
 *   선택 = 흰 테 3px (안은 비움, 다른 칸 위에 덧그림)
 * 66×66 (모서리 12), 핵심 칸 77×77 (모서리 14). 칸 몸통 위쪽에 둥근 광택. 아이콘은 엔진이 얹음.
 * n.plus 22×22 초록 원 + · n.lock 22×22 자물쇠 배지
 */
import type { Body } from '../render';
import { C, P, R, Svg, n2 } from '../kit';

let sv: Svg;

interface Look {
  top: string;
  bot: string;
  rim: string;
  shadow: string;
  gloss: number;
}
const LOOK: Record<string, Look> = {
  base: { top: '#4467c2', bot: '#3656ad', rim: '#2a4a9a', shadow: '#1a2f6e', gloss: 0.12 },
  avail: { top: '#5a88e6', bot: '#4470d0', rim: '#8fc0ff', shadow: '#1a2f6e', gloss: 0.22 },
  ok: { top: '#5a88e6', bot: '#4470d0', rim: '#8fc0ff', shadow: '#1a2f6e', gloss: 0.22 },
  own: { top: '#ffe29a', bot: '#f0b429', rim: '#fff3c4', shadow: '#a8791a', gloss: 0.4 },
};

function frame(state: string, S: number): string {
  // S = 66 또는 77. 몸통은 (m, m) ~ (S-m, S-m-4), 그림자 4px 아래
  const k = S / 66;
  const m = 5 * k;
  const rr = (S === 77 ? 14 : 12) * (S - 2 * m) / (S === 77 ? 58 : 50) * 0.92;
  const x = m, y = m - 1 * k, w = S - 2 * m, h = S - 2 * m - 3 * k;
  const sh = 4 * k;
  if (state === 'sel') {
    return R(x - 3 * k, y - 3 * k, w + 6 * k, h + sh + 6 * k, rr + 3 * k, { fill: 'none', stroke: '#ffffff', sw: 3 * k }) +
      R(x - 5.4 * k, y - 5.4 * k, w + 10.8 * k, h + sh + 10.8 * k, rr + 5 * k, { fill: 'none', stroke: '#ffffff', sw: 1.2 * k, so: 0.45 });
  }
  const L = LOOK[state] ?? LOOK.base;
  let s = '';
  if (state === 'ok') {
    s += R(x - 3.2 * k, y - 3.2 * k, w + 6.4 * k, h + sh + 6.4 * k, rr + 3 * k, { fill: 'none', stroke: '#ffd36b', sw: 3 * k, so: 0.95 });
  }
  // 바닥 그림자
  s += R(x, y + sh, w, h, rr, { fill: L.shadow });
  // 테(3px) + 몸통
  s += R(x, y, w, h, rr, { fill: L.rim });
  const f = sv.lin([[0, L.top], [1, L.bot]]);
  const b = 3 * k;
  s += R(x + b, y + b, w - 2 * b, h - 2 * b, Math.max(2, rr - b), { fill: f });
  // 위쪽 광택
  s += P(
    `M${n2(x + b + 4 * k)} ${n2(y + b + h * 0.36)}Q${n2(x + b + 2 * k)} ${n2(y + b + 3 * k)} ${n2(x + b + 12 * k)} ${n2(y + b + 2.6 * k)}H${n2(x + w - b - 12 * k)}Q${n2(x + w - b - 2 * k)} ${n2(y + b + 3 * k)} ${n2(x + w - b - 4 * k)} ${n2(y + b + h * 0.36)}Q${n2(x + w / 2)} ${n2(y + b + h * 0.26)} ${n2(x + b + 4 * k)} ${n2(y + b + h * 0.36)}Z`,
    { fill: '#ffffff', op: L.gloss },
  );
  // 아래 안쪽 그늘
  s += R(x + b + 2 * k, y + h - b - 6 * k, w - 2 * b - 4 * k, 4 * k, 2 * k, { fill: '#000', op: state === 'own' ? 0.06 : 0.1 });
  if (state === 'own') {
    // 금 칸 반짝 점
    s += C(x + w - 11 * k, y + 10 * k, 2.2 * k, { fill: '#fff', op: 0.9 }) + C(x + w - 16 * k, y + 15 * k, 1.2 * k, { fill: '#fff', op: 0.7 });
  }
  return s;
}

function plus(): string {
  return C(11, 11.8, 9.6, { fill: '#2f6e2f', op: 0.35 }) + C(11, 11, 9.4, { fill: '#5cb85c', stroke: '#ffffff', sw: 2 }) + P('M11 6.4V15.6M6.4 11H15.6', { stroke: '#fff', sw: 2.6 });
}

function lock(): string {
  return (
    C(11, 11.8, 9.6, { fill: '#0e1a44', op: 0.4 }) +
    C(11, 11, 9.4, { fill: '#2a4a9a', stroke: '#ffffff', sw: 2 }) +
    P('M8 10V8.2Q8 5.2 11 5.2Q14 5.2 14 8.2V10', { fill: 'none', stroke: '#ffe29a', sw: 1.8 }) +
    R(6.6, 9.6, 8.8, 6.8, 1.8, { fill: '#ffd36b', stroke: '#a8791a', sw: 1 }) +
    C(11, 12.6, 1.2, { fill: '#a8791a' })
  );
}

export function nodeBody(id: string, pre: string, w: number, h: number): Body | null {
  sv = new Svg(pre);
  if (id === 'n.plus') {
    sv.add(plus());
    return { vb: [0, 0, 22, 22], body: sv.body() };
  }
  if (id === 'n.lock') {
    sv.add(lock());
    return { vb: [0, 0, 22, 22], body: sv.body() };
  }
  const m = /^n\.(key\.)?(base|avail|ok|own|sel)$/.exec(id);
  if (!m) return null;
  const S = m[1] ? 77 : 66;
  sv.add(frame(m[2], S));
  void w; void h;
  return { vb: [0, 0, S, S], body: sv.body() };
}

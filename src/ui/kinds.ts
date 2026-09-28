/**
 * 효과 종류 표시(설계서 6장): 무엇이 오르는지마다 테두리 색 + 짧은 칩 글자. 색만으로 구분하지 않게 칩 글자를 늘 같이 쓴다.
 * 정본 = gdd-data.json effectKinds (트리 칸 Pixi 그림도 같은 색).
 */
import { EFFECT_KINDS, kindOfKey, type KindId } from '../game/data';

const K = EFFECT_KINDS.kinds;
export const KIND_ORDER: KindId[] = EFFECT_KINDS.order;

/** 칩 하나: [반경] */
export function kchip(kind: KindId, text: string): string {
  return `<span class="kc k-${kind}">${text}</span>`;
}
/** 효과 키(트리 ef · 아이템 k · 대표 eff)로 칩 */
export function keyChip(key: string): string {
  const [k, t] = kindOfKey(key);
  return kchip(k, t);
}
/** 카드 테두리 class (kb = 효과 색 테두리) */
export function kcls(kind: KindId): string {
  return `kb k-${kind}`;
}

/** 범례: 종류 11개 칩(색 + 이름) */
export function legendChips(): string {
  return KIND_ORDER.map((k) => kchip(k, K[k].name)).join('');
}

/** --kc(칩·테두리 색) · --kf(칩 글자색) · --kb(테두리: 설득·반경은 위 절반 · 아래 절반) */
export function kindCss(): string {
  return KIND_ORDER.map((id) => {
    const d = K[id];
    const half = (a: string, b?: string) => (b ? `linear-gradient(180deg,${a} 50%,${b} 50%)` : a);
    return `.k-${id} { --kc:${half(d.chip || d.color, d.chip2 || d.color2)}; --kf:${d.fg}; --kb:${half(d.color, d.color2)}; }`;
  }).join('\n');
}

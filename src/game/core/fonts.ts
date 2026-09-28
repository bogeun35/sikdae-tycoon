/**
 * 캔버스 글자용 BitmapFont (loadFonts() 뒤 설치). 색은 흰 글자 + tint 로 바꾼다(테는 짙은 갈색 #4a2f12).
 *  - num: 계약 매출 "+12원"·기술력 숫자 (0~9 , + × . ! % 만 억 조 경 해 원, 결제 대기)
 *  - ev : 이벤트 글자(입소문!·핫플!·소개 영업!·대박!·기술력 +N·매칭 ×N·LEVEL UP!)
 * 트리 칸 가격·레벨 배지는 BitmapText 를 쓰지 않는다(office/tree.ts 의 Pixi Text — 1배 화면에서 쉼표가 점으로 뭉개져서).
 */
import { BitmapFont } from 'pixi.js';
import { FONT_STACK } from '../../fonts';
import { FX } from '../data';

export const NUM_FONT = 'sk-num';
export const EV_FONT = 'sk-ev';
/** 영업 중 LEVEL UP 큰 글자(연달아 오를 때마다 캔버스 글자를 다시 그리던 것 → 글자 그림 한 벌, 설계서 7장 6) */
export const LV_FONT = 'sk-lv';
export const LV_BASE = 96;
/** BitmapFont 기준 글자 크기 */
export const NUM_BASE = 96;
export const EV_BASE = 64;

/** 계약 큰 줄 = 매출 '+12원', 결제 대기 식당은 같은 자리에 '결제 대기' */
const NUM_CHARS = '0123456789,+×.!%만억조경해자양원 -xX:/결제대기';

export function installFonts(): void {
  const ev = FX.eventText as Record<string, [string, string, number]>;
  const words = [
    ...Object.values(ev).map((v) => v[0]),
    '영업 성공!', '대박!', 'LEVEL UP!', '매칭', '×', '+', '곳', '초', '0123456789', '.', ',', '-', ' ', '!', '%', '만억조경해자양원', '새 거래처!', '첫 결제 연결!', '결제 대기', '대형 계약', '전국 계약',
    '경험치', '매출', '거래액', 'NXABCDEFGHIJKLMNOPQRSTUVWYZ',
  ];
  const evChars = Array.from(new Set(words.join('').split(''))).join('');
  BitmapFont.install({
    name: NUM_FONT,
    chars: NUM_CHARS,
    resolution: 1,
    padding: 4,
    style: { fontFamily: FONT_STACK, fontSize: NUM_BASE, fill: '#ffffff', stroke: { color: '#4a2f12', width: 21, join: 'round' } },
  });
  BitmapFont.install({
    name: LV_FONT,
    chars: 'LEVEL UP!0123456789 ',
    resolution: 1,
    padding: 10,
    style: { fontFamily: FONT_STACK, fontSize: LV_BASE, fill: '#ffd36b', stroke: { color: '#8a5a1a', width: 10, join: 'round' }, dropShadow: { color: '#5c3a1a', distance: 7, blur: 0, alpha: 0.8, angle: Math.PI / 2 } },
  });
  BitmapFont.install({
    name: EV_FONT,
    chars: evChars,
    resolution: 1,
    padding: 4,
    style: { fontFamily: FONT_STACK, fontSize: EV_BASE, fill: '#ffffff', stroke: { color: '#4a2f12', width: 12, join: 'round' } },
  });
}

/**
 * 캔버스 글자용 BitmapFont (loadFonts() 뒤 설치). 색은 흰 글자 + tint 로 바꾼다(테는 짙은 갈색 #4a2f12).
 *  - num: 거래액·매출·경험치 숫자 (0~9 , + × . ! % 만 억 조 경 해 원 P)
 *  - ev : 이벤트 글자(입소문!·핫플!·소개 영업!·대박!·P +N·매칭 ×N·LEVEL UP!)
 *  - ui : 트리 칸 가격·레벨 배지 (테 없음)
 */
import { BitmapFont } from 'pixi.js';
import { FONT_STACK } from '../../fonts';
import { FX } from '../data';

export const NUM_FONT = 'sk-num';
export const EV_FONT = 'sk-ev';
export const UI_FONT = 'sk-ui';
/** BitmapFont 기준 글자 크기 */
export const NUM_BASE = 96;
export const EV_BASE = 64;
export const UI_BASE = 32;

const NUM_CHARS = '0123456789,+×.!%만억조경해자양원P -xX:/';

export function installFonts(): void {
  const ev = FX.eventText as Record<string, [string, string, number]>;
  const words = [
    ...Object.values(ev).map((v) => v[0]),
    '영업 성공!', '대박!', 'LEVEL UP!', '매칭', '×', '+', 'P', '곳', '초', '0123456789', '.', ',', '-', ' ', '!', '%', '만억조경해원', '새 거래처!', '첫 결제 연결!', '결제 대기', '대형 계약', '전국 계약',
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
    name: EV_FONT,
    chars: evChars,
    resolution: 1,
    padding: 4,
    style: { fontFamily: FONT_STACK, fontSize: EV_BASE, fill: '#ffffff', stroke: { color: '#4a2f12', width: 12, join: 'round' } },
  });
  BitmapFont.install({
    name: UI_FONT,
    chars: NUM_CHARS + '/월MAXLv',
    resolution: 2,
    padding: 2,
    style: { fontFamily: FONT_STACK, fontSize: UI_BASE, fill: '#ffffff' },
  });
}

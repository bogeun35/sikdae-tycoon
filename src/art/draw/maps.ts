/**
 * 상권 지도 SVG 키 m.<id>.ground@<orient> · m.<id>.roads@<orient> (DOM 썸네일·사무실 상권 오픈 컷용).
 * 영업 지도는 매 영업일 새로 만들어 Canvas2D 로 굽는다(src/art/index.ts loadMap → draw/mapbake.ts).
 * 이 SVG 는 씨앗 0 · 영업일 0 지도(늘 같은 그림)를 캔버스로 구워 그림 한 장으로 감싼 것. roads 는 비어 있음(바닥에 합쳐 구움).
 * DOM 이 없는 곳(검사 스크립트)에서는 바닥색 네모만.
 */
import type { Body } from '../render';
import { genMap } from '../../game/map/gen';
import { DISTRICTS, type DistrictId, type Orient } from '../registry';
import { bakeMap, type SpriteSrc } from './mapbake';

let spriteOf: ((key: string) => SpriteSrc | null) | null = null;
/** 장식 그림 공급자(아틀라스가 구워진 뒤 index.ts 가 연결) */
export function setMapSprites(fn: (key: string) => SpriteSrc | null): void {
  spriteOf = fn;
}

/** 썸네일 배율(1920 → 768) */
const THUMB = 0.4;

export function mapBody(id: string, orient: string, pre: string): Body | null {
  const mm = /^m\.(\w+)\.(ground|roads)$/.exec(id);
  if (!mm) return null;
  const did = mm[1] as DistrictId;
  const o = (orient === 'port' ? 'port' : 'land') as Orient;
  const d = DISTRICTS[did];
  if (!d) return null;
  const m = genMap(did, o, 0, 0);
  const vb: [number, number, number, number] = [0, 0, m.W, m.H];
  void pre;
  if (mm[2] === 'roads') return { vb, body: '' };
  if (typeof document === 'undefined') return { vb, body: `<rect width="${m.W}" height="${m.H}" fill="${d.pal.ground}"/>` };
  const cv = document.createElement('canvas');
  cv.width = Math.round(m.W * THUMB);
  cv.height = Math.round(m.H * THUMB);
  bakeMap(cv.getContext('2d')!, m, THUMB, spriteOf ?? undefined);
  const url = cv.toDataURL('image/jpeg', 0.86);
  return { vb, body: `<image href="${url}" x="0" y="0" width="${m.W}" height="${m.H}" preserveAspectRatio="none"/>` };
}

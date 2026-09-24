/**
 * 텍스처 도우미. 그림 모듈의 tex() 를 감싸고, lazy 그림(타이틀 배경 등)과 엔진이 만드는 그라데이션을 굽는다.
 */
import { Texture } from 'pixi.js';
import { art } from '../deps';

const missing = new Set<string>();
export function T(key: string): Texture {
  try {
    const t = art.tex(key);
    if (t && t !== Texture.EMPTY) return t;
  } catch {
    /* 아래로 */
  }
  if (!missing.has(key)) {
    missing.add(key);
    console.warn('[tex] 없음', key);
  }
  return Texture.WHITE;
}
export function has(key: string): boolean {
  try {
    const t = art.tex(key);
    return !!t && t !== Texture.WHITE && t !== Texture.EMPTY;
  } catch {
    return false;
  }
}
export function sizeOf(key: string): { w: number; h: number } {
  const s = art.SIZES[key];
  return s ? { w: s.w, h: s.h } : { w: 64, h: 64 };
}

/** SVG 문자열 → Texture (file:// 에서 fetch 없이). */
export async function rasterSvg(svgStr: string, w: number, h: number, res = 1): Promise<Texture> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  try {
    await img.decode();
  } catch {
    await new Promise<void>((r) => {
      img.onload = () => r();
      img.onerror = () => r();
    });
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * res));
  c.height = Math.max(1, Math.round(h * res));
  const g = c.getContext('2d')!;
  try {
    g.drawImage(img, 0, 0, c.width, c.height);
  } catch {
    /* 빈 그림 */
  }
  return Texture.from({ resource: c, resolution: res });
}
export async function rasterKey(key: string, res = 1): Promise<Texture> {
  const at = key.indexOf('@');
  const s = at >= 0 ? art.svg(key.slice(0, at), key.slice(at + 1)) : art.svg(key);
  const sz = sizeOf(key);
  return rasterSvg(s, sz.w, sz.h, res);
}

/** 캔버스 그라데이션 텍스처 */
export function gradientTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  return Texture.from(c);
}

/** 둥근 알약(나인슬라이스용) 흰 텍스처 */
let pillTex: Texture | null = null;
export function pill(): Texture {
  if (pillTex) return pillTex;
  pillTex = gradientTex(32, 16, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(0, 0, 32, 16, 8);
    g.fill();
  });
  return pillTex;
}
let circleTex: Texture | null = null;
export function circle(): Texture {
  if (circleTex) return circleTex;
  circleTex = gradientTex(128, 128, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
  });
  return circleTex;
}

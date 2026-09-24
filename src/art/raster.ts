/**
 * SVG → Texture. file:// 에서 fetch·Assets.load 가 막히므로 쓰지 않는다.
 * svg 문자열 → data:image/svg+xml → Image.decode → canvas 에 drawImage → CanvasSource.
 * 256px 이하는 2048² 아틀라스 몇 장에 모아 굽고 frame 으로 잘라 쓴다(배치 끊김 방지).
 * 파티클용(ParticleContainer 는 원본이 하나여야 함)과 fxTop 이 쓰는 작은 그림은 같은 아틀라스 'p' 에.
 */
import { CanvasSource, Rectangle, Texture, type Renderer } from 'pixi.js';

export const ATLAS = 2048;
const PAD = 2;

export function svgDataUrl(s: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/** SVG 문자열 → 그려진 Image (decode 실패하면 onload 로 한 번 더) */
export function decodeSvg(s: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<HTMLImageElement>((res, rej) => {
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('svg decode 실패'));
  });
  img.src = svgDataUrl(s);
  return img.decode().then(
    () => img,
    () => (img.complete && img.naturalWidth ? img : loaded),
  );
}

/** 해상도 r 에서 (pw / r) * r === pw 가 되는 픽셀 폭 (CanvasSource 가 캔버스를 다시 만들지 않게) */
export function safePx(logical: number, r: number): number {
  let pw = Math.max(1, Math.ceil(logical * r - 1e-6));
  for (let i = 0; i < 8; i++) {
    if ((pw / r) * r === pw) return pw;
    pw++;
  }
  return pw;
}

export function makeCanvas(pw: number, ph: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  return c;
}

/** 캔버스 → CanvasSource (그리기 전에 만들어서 크기 맞춤이 그림을 지우지 않게) */
export function sourceFor(canvas: HTMLCanvasElement, r: number, label?: string): CanvasSource {
  const src = new CanvasSource({ resource: canvas, resolution: r, width: canvas.width / r, height: canvas.height / r, label, scaleMode: 'linear', antialias: true });
  return src;
}

export function frameTex(src: CanvasSource, x: number, y: number, w: number, h: number, label: string): Texture {
  return new Texture({ source: src, frame: new Rectangle(x, y, w, h), label });
}

/* ───────── 아틀라스 배치 (선반 방식) ───────── */

export interface PackIn {
  key: string;
  w: number;
  h: number;
  /** 픽셀 크기 */
  pw: number;
  ph: number;
}
export interface PackOut extends PackIn {
  atlas: number;
  px: number;
  py: number;
}

export function pack(items: PackIn[], size = ATLAS): { placed: PackOut[]; heights: number[] } {
  const sorted = [...items].sort((a, b) => b.ph - a.ph || b.pw - a.pw);
  const placed: PackOut[] = [];
  const heights: number[] = [];
  let atlas = -1, x = 0, y = 0, rowH = 0;
  const next = () => {
    atlas++;
    x = PAD;
    y = PAD;
    rowH = 0;
    heights[atlas] = 0;
  };
  next();
  for (const it of sorted) {
    const w = it.pw + PAD, h = it.ph + PAD;
    if (x + w > size) {
      x = PAD;
      y += rowH;
      rowH = 0;
    }
    if (y + h > size) {
      next();
    }
    placed.push({ ...it, atlas, px: x, py: y });
    x += w;
    rowH = Math.max(rowH, h);
    heights[atlas] = Math.max(heights[atlas], y + h);
  }
  return { placed, heights };
}

/** 한 프레임 쉬기 (배경 탭이면 rAF 가 멈추므로 setTimeout 도 같이) */
export function nextFrame(): Promise<void> {
  return new Promise((res) => {
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      res();
    };
    requestAnimationFrame(go);
    setTimeout(go, 40);
  });
}

/** GPU 에 미리 올려 첫 표시 끊김을 줄임 (실패해도 무시) */
export function preUpload(renderer: Renderer | undefined, src: CanvasSource): void {
  try {
    const ts = (renderer as unknown as { texture?: { initSource?: (s: CanvasSource) => void } })?.texture;
    ts?.initSource?.(src);
  } catch {
    /* 무시 */
  }
}

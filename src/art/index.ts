/**
 * 그림 API — 설계서 8장 계약 (PixiJS v8)
 *
 *   SPRITE_KEYS · SIZES · svg(id, state) · loadAll(renderer, onProgress, opts) · loadMap(renderer, district, orient, seed?, day?)
 *   mapLayers(district, orient, seed?, day?) · tex(key)
 *
 * 지도(설계서 5장): mapLayers = 생성기(src/game/map/gen.ts) 결과, loadMap = 그 지도를 Canvas2D 한 장으로 구운 텍스처(바닥+도로+장식).
 * 씨앗을 안 주면 씨앗 0 · 영업일 0 지도(썸네일과 같은 그림).
 *
 * 그림은 전부 코드 SVG. 외부 그림 파일 0개. 시작할 때 화면에 맞는 해상도로 래스터화해 Texture 로 캐시한다.
 * 계약 밖 추가(덧붙이기만): EXTRA_KEYS(대상 눈 감은 프레임 t.<id>@blink) · loadOne · svgUrl · worldScaleNow · FX_TOP_KEYS
 */
import { Texture, type Renderer } from 'pixi.js';
import { SPRITE_KEYS, SIZES, EXTRA_KEYS, FX_TOP_KEYS, type DistrictId, type Orient, type SpriteGroup, type SpriteSize } from './registry';
import type { MapData } from '../game/data';
import { genMap } from '../game/map/gen';
import { bakeMap, type SpriteSrc } from './draw/mapbake';
import { setMapSprites } from './draw/maps';
import { svgOfKey, warnOnce } from './render';
import { ATLAS, decodeSvg, frameTex, makeCanvas, nextFrame, pack, preUpload, safePx, sourceFor, svgDataUrl, type PackIn } from './raster';

export { SPRITE_KEYS, SIZES, EXTRA_KEYS, FX_TOP_KEYS };
export type { DistrictId, Orient, SpriteGroup, SpriteSize };

export interface MapLayers extends MapData {
  /** 'm.<id>.ground@<orient>' */
  ground: string;
  /** 'm.<id>.roads@<orient>' */
  roadsLayer: string;
}

/* ───────── SVG ───────── */

function keyOf(id: string, state?: string): string {
  return state ? `${id}@${state}` : id;
}

/** SVG 문자열 하나. DOM(카드·설명 바·도감)에도 이 문자열을 그대로 씀 (<img src="data:image/svg+xml,…"> 또는 innerHTML) */
export function svg(id: string, state?: string): string {
  return svgOfKey(keyOf(id, state));
}

/** <img src> 에 바로 넣는 data URL */
export function svgUrl(id: string, state?: string): string {
  return svgDataUrl(svg(id, state));
}

/* ───────── 해상도 ───────── */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 지금 창 크기의 world 배율 (가로 1920×1080 / 세로 1080×1920 기준, 2-7) */
export function worldScaleNow(): number {
  const w = innerWidth || 1920, h = innerHeight || 1080;
  return w >= h ? Math.min(w / 1920, h / 1080) : Math.min(w / 1080, h / 1920);
}
function dpr(): number {
  return typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
}
/** loadAll 기본 해상도 = clamp(ceil(worldScale × DPR × 2) / 2, 1, 2) */
function defaultRes(): number {
  return clamp(Math.ceil(worldScaleNow() * dpr() * 2) / 2, 1, 2);
}
/** 지도·타이틀 배경 해상도 = clamp(worldScale × DPR, 1, 2) */
function viewRes(): number {
  return clamp(Math.round(worldScaleNow() * dpr() * 100) / 100, 1, 2);
}

/* ───────── 캐시 ───────── */

const TEX: Record<string, Texture> = {};
let pinkTex: Texture | null = null;

function pink(): Texture {
  if (pinkTex) return pinkTex;
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff5fa2';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  pinkTex = Texture.from(c);
  return pinkTex;
}

/** loadAll 뒤 캐시에서 꺼냄. 없으면 분홍 네모 + console.warn 1회 */
export function tex(key: string): Texture {
  const t = TEX[key];
  if (t) return t;
  warnOnce(key, SIZES[key] ? '아직 굽지 않은 그림(loadAll/loadMap 전이거나 lazy)' : '계약에 없는 key');
  return pink();
}

/* ───────── 묶음 규칙 ───────── */

/** ParticleContainer 용 — 반드시 한 아틀라스 */
const PARTICLE_KEYS = ['fx.ticket', 'fx.coin', 'fx.point', 'fx.dot', 'fx.spark', 'fx.star', 'fx.heart', 'fx.smoke', 'fx.paper', 'fx.petal', 'fx.confetti0', 'fx.confetti1', 'fx.confetti2', 'fx.confetti3', 'fx.confetti4', 'fx.confetti5'];

function resOf(key: string, base: number): number {
  const s = SIZES[key];
  if (s.res === 1) return 1;
  if (s.res === 'view') return viewRes();
  return base;
}

function isStandalone(key: string): boolean {
  const s = SIZES[key];
  return s.w > 256 || s.h > 256 || s.res !== undefined || !!s.nineSlice || !!s.tiling || !!s.lazy;
}

/** 아틀라스 묶음: p = 파티클 + fxTop 작은 것 / top = fxTop 이 쓰는 i.*·c.* / main = 나머지 */
function bucketOf(key: string): 'p' | 'top' | 'main' {
  if (PARTICLE_KEYS.includes(key) || FX_TOP_KEYS.includes(key)) return 'p';
  if (key.startsWith('i.') || key.startsWith('c.')) return 'top';
  return 'main';
}

/* ───────── loadAll ───────── */

/**
 * lazy 아닌 스프라이트 전부를 래스터화해 캐시. 반환 = key → Texture. Texture 논리 크기 = SIZES 의 w·h.
 * 한 프레임에 8장씩 끊어 await (로딩 막대가 움직이게). EXTRA_KEYS(깜빡임 프레임)도 같이 굽는다.
 */
export async function loadAll(
  renderer: Renderer,
  onProgress?: (done: number, total: number) => void,
  opts?: { resolution?: number; skipLazy?: boolean; only?: (key: string, group: string) => boolean; perFrame?: number },
): Promise<Record<string, Texture>> {
  const base = clamp(opts?.resolution ?? defaultRes(), 1, 2);
  const skipLazy = opts?.skipLazy !== false;
  /* only = 이번에 구울 것만(설계서 7-추가 로딩: 타이틀·사무실 그림 먼저, 영업 그림은 뒤에서 나눠) */
  const only = opts?.only;
  const keys = [...SPRITE_KEYS, ...EXTRA_KEYS].filter((k) => !TEX[k] && (!SIZES[k].lazy || (!skipLazy && !k.startsWith('m.'))) && (!only || only(k, SIZES[k].group)));
  const per = Math.max(1, opts?.perFrame ?? 8);
  const total = keys.length;
  let done = 0;
  onProgress?.(0, total);

  // 1) 아틀라스 배치
  const buckets: Record<string, PackIn[]> = { p: [], top: [], main: [] };
  const alone: string[] = [];
  for (const k of keys) {
    if (isStandalone(k)) {
      alone.push(k);
      continue;
    }
    const s = SIZES[k];
    buckets[bucketOf(k)].push({ key: k, w: s.w, h: s.h, pw: Math.ceil(s.w * base), ph: Math.ceil(s.h * base) });
  }
  type Job = { key: string; draw: (img: HTMLImageElement) => void; pw: number; ph: number };
  const jobs: Job[] = [];
  const sources: { src: ReturnType<typeof sourceFor> }[] = [];
  for (const b of ['p', 'top', 'main'] as const) {
    if (!buckets[b].length) continue;
    const { placed, heights } = pack(buckets[b], safePx(ATLAS / base, base) > ATLAS ? ATLAS : ATLAS);
    const atlases = heights.map((hh, i) => {
      const pw = safePx(ATLAS / base, base);
      const ph = safePx(Math.min(ATLAS, hh + 2) / base, base);
      const cv = makeCanvas(pw, ph);
      const src = sourceFor(cv, base, `art-atlas-${b}${i}`);
      sources.push({ src });
      return { cv, g: cv.getContext('2d')!, src };
    });
    for (const p of placed) {
      const a = atlases[p.atlas];
      TEX[p.key] = frameTex(a.src, p.px / base, p.py / base, p.w, p.h, p.key);
      jobs.push({ key: p.key, pw: p.pw, ph: p.ph, draw: (img) => a.g.drawImage(img, p.px, p.py, p.w * base, p.h * base) });
    }
  }
  for (const k of alone) {
    const s = SIZES[k];
    const r = resOf(k, base);
    const pw = safePx(s.w, r), ph = safePx(s.h, r);
    const cv = makeCanvas(pw, ph);
    const src = sourceFor(cv, r, k);
    sources.push({ src });
    TEX[k] = frameTex(src, 0, 0, s.w, s.h, k);
    const g = cv.getContext('2d')!;
    jobs.push({ key: k, pw: Math.round(s.w * r), ph: Math.round(s.h * r), draw: (img) => g.drawImage(img, 0, 0, s.w * r, s.h * r) });
  }

  // 2) per 장씩 그리기(기본 8)
  for (let i = 0; i < jobs.length; i += per) {
    const batch = jobs.slice(i, i + per);
    const imgs = await Promise.all(
      batch.map((j) =>
        decodeSvg(svgOfKey(j.key, j.pw, j.ph)).catch((e) => {
          warnOnce(j.key, '래스터 실패 ' + String(e));
          return null;
        }),
      ),
    );
    batch.forEach((j, n) => {
      const img = imgs[n];
      if (img) j.draw(img);
    });
    done += batch.length;
    onProgress?.(done, total);
    await nextFrame();
  }
  for (const s of sources) {
    s.src.update();
    preUpload(renderer, s.src);
  }
  const out: Record<string, Texture> = {};
  for (const k of [...SPRITE_KEYS, ...EXTRA_KEYS]) if (TEX[k]) out[k] = TEX[k];
  return out;
}

/** lazy 그림 하나를 굽기 (타이틀 배경처럼 loadAll 보다 먼저 필요할 때). 해상도 규칙은 loadAll 과 같음 */
export async function loadOne(renderer: Renderer | undefined, key: string, opts?: { resolution?: number }): Promise<Texture> {
  if (TEX[key]) return TEX[key];
  const s = SIZES[key];
  if (!s) return tex(key);
  const r = s.res === 1 ? 1 : s.res === 'view' ? viewRes() : clamp(opts?.resolution ?? defaultRes(), 1, 2);
  const pw = safePx(s.w, r), ph = safePx(s.h, r);
  const cv = makeCanvas(pw, ph);
  const src = sourceFor(cv, r, key);
  const img = await decodeSvg(svgOfKey(key, Math.round(s.w * r), Math.round(s.h * r)));
  cv.getContext('2d')!.drawImage(img, 0, 0, s.w * r, s.h * r);
  src.update();
  preUpload(renderer, src);
  TEX[key] = frameTex(src, 0, 0, s.w, s.h, key);
  return TEX[key];
}

/* ───────── 지도 ───────── */

/** 지도 생성·굽기 측정값 (검수용, 숫자만) */
export const mapPerf = { genMs: 0, bakeMs: 0, uploadMs: 0, res: 0, pw: 0, ph: 0, key: '' };

/** 아틀라스에 구운 장식 그림을 캔버스에 옮겨 그릴 때 쓰는 원본 조각 */
function spriteSrc(key: string): SpriteSrc | null {
  const t = TEX[key];
  if (!t || t.destroyed) return null;
  const src = t.source as unknown as { resource?: CanvasImageSource; resolution: number };
  if (!src.resource) return null;
  const r = src.resolution || 1;
  const f = t.frame;
  return { img: src.resource, sx: f.x * r, sy: f.y * r, sw: f.width * r, sh: f.height * r };
}
setMapSprites(spriteSrc);
/* 검수 훅: 숫자만 */
(globalThis as unknown as { __mapPerf?: typeof mapPerf }).__mapPerf = mapPerf;

/** 지도 텍스처 해상도 = min(화질 상한, worldScale × DPR). 폰(터치 · 짧은 변 < 900) 상한 1.5, 그 밖 2 */
function mapRes(): number {
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const cap = touch && Math.min(innerWidth || 1920, innerHeight || 1080) < 900 ? 1.5 : 2;
  return clamp(Math.round(worldScaleNow() * dpr() * 100) / 100, 0.5, cap);
}

const layerCache = new Map<string, MapLayers>();
const mid = (d: DistrictId, o: Orient, seed: number, day: number) => `${d}@${o}#${seed >>> 0}:${day | 0}`;

/** 지도 배치(생성기 결과) + 레이어 key. 같은 인자면 같은 지도(최근 6개 캐시) */
export function mapLayers(districtId: DistrictId, orient: Orient = 'land', seed = 0, day = 0): MapLayers {
  const id = mid(districtId, orient, seed, day);
  const hit = layerCache.get(id);
  if (hit) return hit;
  const t0 = performance.now();
  const m = genMap(districtId, orient, seed, day);
  mapPerf.genMs = Math.round((performance.now() - t0) * 10) / 10;
  const out: MapLayers = { ...m, ground: `m.${districtId}.ground@${orient}`, roadsLayer: `m.${districtId}.roads@${orient}` };
  layerCache.set(id, out);
  /* 오늘 지도 + 바로 전(방향 전환) 정도만: 6장이면 영업일마다 힙이 약 0.3MB 씩 여섯 날 늘었음(설계서 7-추가 메모리) */
  while (layerCache.size > 3) layerCache.delete(layerCache.keys().next().value!);
  return out;
}

const mapTex = new Map<string, Texture>();

/**
 * 지도 한 장: 바닥·도로·장식을 Canvas2D 한 장에 구워 텍스처 1장(roads = Texture.EMPTY).
 * 최근 2개만 캐시, 밀려난 것은 destroy(true).
 */
export async function loadMap(renderer: Renderer, districtId: DistrictId, orient: Orient, seed = 0, day = 0): Promise<{ ground: Texture; roads: Texture }> {
  const id = mid(districtId, orient, seed, day);
  const hit = mapTex.get(id);
  if (hit && !hit.destroyed) {
    mapTex.delete(id);
    mapTex.set(id, hit);
    return { ground: hit, roads: Texture.EMPTY };
  }
  const m = mapLayers(districtId, orient, seed, day);
  const r = mapRes();
  const pw = safePx(m.W, r), ph = safePx(m.H, r);
  const cv = makeCanvas(pw, ph);
  const t0 = performance.now();
  bakeMap(cv.getContext('2d', { alpha: false })!, m, r, spriteSrc);
  const t1 = performance.now();
  const src = sourceFor(cv, r, `map-${id}`);
  src.update();
  preUpload(renderer, src);
  const t2 = performance.now();
  Object.assign(mapPerf, { bakeMs: Math.round((t1 - t0) * 10) / 10, uploadMs: Math.round((t2 - t1) * 10) / 10, res: r, pw, ph, key: id });
  const tex = frameTex(src, 0, 0, m.W, m.H, id);
  mapTex.set(id, tex);
  while (mapTex.size > 2) {
    const [k, old] = mapTex.entries().next().value!;
    mapTex.delete(k);
    old.destroy(true);
  }
  return { ground: tex, roads: Texture.EMPTY };
}

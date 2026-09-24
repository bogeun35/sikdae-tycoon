/**
 * 그림 API — 설계서 8장 계약 (PixiJS v8)
 *
 *   SPRITE_KEYS · SIZES · svg(id, state) · loadAll(renderer, onProgress, opts) · loadMap(renderer, district, orient)
 *   mapLayers(district, orient) · tex(key)
 *
 * 그림은 전부 코드 SVG. 외부 그림 파일 0개. 시작할 때 화면에 맞는 해상도로 래스터화해 Texture 로 캐시한다.
 * 계약 밖 추가(덧붙이기만): EXTRA_KEYS(대상 눈 감은 프레임 t.<id>@blink) · loadOne · svgUrl · worldScaleNow · FX_TOP_KEYS
 */
import { Texture, type Renderer } from 'pixi.js';
import { SPRITE_KEYS, SIZES, EXTRA_KEYS, FX_TOP_KEYS, GDD, type DistrictId, type Orient, type SpriteGroup, type SpriteSize, type MapData } from './registry';
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
  opts?: { resolution?: number; skipLazy?: boolean },
): Promise<Record<string, Texture>> {
  const base = clamp(opts?.resolution ?? defaultRes(), 1, 2);
  const skipLazy = opts?.skipLazy !== false;
  const keys = [...SPRITE_KEYS, ...EXTRA_KEYS].filter((k) => !TEX[k] && (!SIZES[k].lazy || (!skipLazy && !k.startsWith('m.'))));
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

  // 2) 8장씩 그리기
  for (let i = 0; i < jobs.length; i += 8) {
    const batch = jobs.slice(i, i + 8);
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

const mapCache: string[] = [];

/**
 * lazy 지도 레이어 2장. 바닥과 도로를 한 장으로 합쳐 굽는다(roads = Texture.EMPTY).
 * resolution = clamp(worldScale × DPR, 1, 2). 최근 2개만 캐시, 밀려난 것은 destroy(true).
 */
export async function loadMap(renderer: Renderer, districtId: DistrictId, orient: Orient): Promise<{ ground: Texture; roads: Texture }> {
  const gk = `m.${districtId}.ground@${orient}`, rk = `m.${districtId}.roads@${orient}`;
  const id = `${districtId}@${orient}`;
  const hit = mapCache.indexOf(id);
  if (hit >= 0 && TEX[gk]) {
    mapCache.splice(hit, 1);
    mapCache.push(id);
    return { ground: TEX[gk], roads: TEX[rk] ?? Texture.EMPTY };
  }
  const s = SIZES[gk];
  const r = viewRes();
  const pw = safePx(s.w, r), ph = safePx(s.h, r);
  const cv = makeCanvas(pw, ph);
  const src = sourceFor(cv, r, gk);
  const [ig, ir] = await Promise.all([decodeSvg(svgOfKey(gk, Math.round(s.w * r), Math.round(s.h * r))), decodeSvg(svgOfKey(rk, Math.round(s.w * r), Math.round(s.h * r)))]);
  const g = cv.getContext('2d')!;
  g.drawImage(ig, 0, 0, s.w * r, s.h * r);
  g.drawImage(ir, 0, 0, s.w * r, s.h * r);
  src.update();
  preUpload(renderer, src);
  TEX[gk] = frameTex(src, 0, 0, s.w, s.h, gk);
  TEX[rk] = Texture.EMPTY;
  mapCache.push(id);
  while (mapCache.length > 2) {
    const old = mapCache.shift()!;
    const [d, o] = old.split('@');
    const ok = `m.${d}.ground@${o}`;
    TEX[ok]?.destroy(true);
    delete TEX[ok];
    delete TEX[`m.${d}.roads@${o}`];
  }
  return { ground: TEX[gk], roads: Texture.EMPTY };
}

const layerCache: Record<string, MapLayers> = {};

/** 지도 배치(= gdd-data.json maps[districtId][orient]) + 레이어 스프라이트 key. 결정적 */
export function mapLayers(districtId: DistrictId, orient: Orient = 'land'): MapLayers {
  const id = `${districtId}@${orient}`;
  if (layerCache[id]) return layerCache[id];
  const m = GDD.maps[districtId]?.[orient];
  if (!m) throw new Error(`[art] 지도 없음: ${id}`);
  const out: MapLayers = { ...m, district: districtId, orient, ground: `m.${districtId}.ground@${orient}`, roadsLayer: `m.${districtId}.roads@${orient}` };
  layerCache[id] = out;
  return out;
}

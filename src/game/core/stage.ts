/**
 * 화면 틀: 아래 stage 캔버스(WebGL) → DOM(#ui) → 위 fxTop 캔버스(WebGL, 입력 없음).
 * 논리 좌표: 가로 1920×1080 / 세로 1080×1920. world 는 min(가로비, 세로비) 로 줄여 가운데 정렬.
 * DOM 은 "디자인 px"(원작 CSS px 정도)로 짜고 #ui 전체를 kd 배로 줄인다.
 */
import { Application, Container, Graphics, Point } from 'pixi.js';
import type { Orient } from '../data';

export interface ViewInfo {
  w: number; h: number; dpr: number; orient: Orient; LW: number; LH: number; k: number; ox: number; oy: number; kd: number;
  /** 영업 중 고정된 방향(없으면 null) */
  locked: Orient | null;
}

export const view: ViewInfo = { w: 1, h: 1, dpr: 1, orient: 'land', LW: 1920, LH: 1080, k: 1, ox: 0, oy: 0, kd: 1, locked: null };

export let app!: Application;
export let fxApp!: Application;
/** stage 층 */
export const L = {
  /** 화면 좌표(CSS px) 배경 */
  bg: new Container(),
  /** 화면 좌표 셰이더 래퍼(쇼크웨이브 필터를 여기에 건다) */
  fxWrap: new Container(),
  /** 논리 좌표 세계(카메라 흔들림·줌 포함) */
  world: new Container(),
  /** 화면 좌표 앞 가림(번쩍·비네트·트리) */
  screen: new Container(),
};
/** fxTop 층: 논리 좌표(흔들림 없음) */
export const FXL = { root: new Container(), screen: new Container() };

let fxDirty = 2;
export function markFx(): void {
  fxDirty = 2;
}

const viewW = () => Math.max(1, window.innerWidth || document.documentElement.clientWidth);
const viewH = () => Math.max(1, window.innerHeight || document.documentElement.clientHeight);

const layoutListeners: (() => void)[] = [];
export function onLayout(fn: () => void): () => void {
  layoutListeners.push(fn);
  return () => {
    const i = layoutListeners.indexOf(fn);
    if (i >= 0) layoutListeners.splice(i, 1);
  };
}

export let uiRoot!: HTMLDivElement;

export async function initStage(): Promise<void> {
  const host = document.getElementById('app')!;
  const res = Math.min(window.devicePixelRatio || 1, 2);
  app = new Application();
  await app.init({
    width: viewW(), height: viewH(), resolution: res, autoDensity: true, antialias: true, preference: 'webgl',
    background: '#2b3f8a', powerPreference: 'high-performance',
  });
  app.canvas.id = 'stage';
  host.appendChild(app.canvas);

  uiRoot = document.createElement('div');
  uiRoot.id = 'ui';
  host.appendChild(uiRoot);

  fxApp = new Application();
  await fxApp.init({
    width: viewW(), height: viewH(), resolution: res, autoDensity: true, antialias: true, preference: 'webgl',
    backgroundAlpha: 0, autoStart: false,
  });
  fxApp.canvas.id = 'fxtop';
  host.appendChild(fxApp.canvas);

  L.fxWrap.addChild(L.world);
  app.stage.addChild(L.bg, L.fxWrap, L.screen);
  fxApp.stage.addChild(FXL.root, FXL.screen);

  layout();
  window.addEventListener('resize', () => layout());
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  new ResizeObserver(() => layout()).observe(host);

  app.ticker.add(() => {
    if (FXL.root.children.length || FXL.screen.children.length) fxDirty = 2;
    if (fxDirty > 0) {
      fxApp.render();
      fxDirty--;
    }
  });
}

let lastKey = '';
export function layout(force = false): void {
  const w = viewW();
  const h = viewH();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const natural: Orient = w / h < 1 ? 'port' : 'land';
  const orient = view.locked || natural;
  const key = `${w}x${h}@${dpr}:${orient}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  view.orient = orient;
  view.LW = orient === 'land' ? 1920 : 1080;
  view.LH = orient === 'land' ? 1080 : 1920;
  view.k = Math.min(w / view.LW, h / view.LH);
  view.ox = (w - view.LW * view.k) / 2;
  view.oy = (h - view.LH * view.k) / 2;
  /* DOM 배율: 원작 CSS px ≈ 가로 논리 px / 1.33 · 세로 논리 px / 2.66 */
  const kdRaw = natural === 'land' ? Math.min(w / 1920, h / 1080) * 1.33 : Math.min(w / 1080, h / 1920) * 2.66;
  view.kd = Math.max(natural === 'land' ? 0.78 : 0.86, Math.min(1.6, kdRaw));
  app.renderer.resize(w, h, dpr);
  fxApp.renderer.resize(w, h, dpr);
  L.world.scale.set(view.k);
  L.world.position.set(view.ox, view.oy);
  FXL.root.scale.set(view.k);
  FXL.root.position.set(view.ox, view.oy);
  uiRoot.style.width = `${w / view.kd}px`;
  uiRoot.style.height = `${h / view.kd}px`;
  uiRoot.style.transform = `scale(${view.kd})`;
  const dw = w / view.kd;
  const dh = h / view.kd;
  uiRoot.classList.toggle('port', natural === 'port');
  uiRoot.classList.toggle('land', natural === 'land');
  uiRoot.classList.toggle('short', dh < 640);
  uiRoot.classList.toggle('narrow', dw < 720);
  uiRoot.classList.toggle('tiny', dw < 380);
  markFx();
  for (const fn of layoutListeners.slice()) fn();
}

export function lockOrient(o: Orient | null): void {
  view.locked = o;
  layout(true);
}

/** 화면 좌표(CSS px) → fxTop 논리 좌표 */
export function screenToFx(x: number, y: number): { x: number; y: number } {
  return { x: (x - view.ox) / view.k, y: (y - view.oy) / view.k };
}
/** 화면 좌표 → 세계 논리 좌표(카메라 포함) */
export function screenToWorld(x: number, y: number, target: Container = L.world): { x: number; y: number } {
  const p = target.toLocal(new Point(x, y));
  return { x: p.x, y: p.y };
}
/** 세계 좌표(어떤 컨테이너 기준) → fxTop 논리 좌표 */
export function worldToFx(c: Container, x: number, y: number): { x: number; y: number } {
  const g = c.toGlobal(new Point(x, y));
  return screenToFx(g.x, g.y);
}
/** DOM 요소 가운데 → fxTop 논리 좌표 */
export function domToFx(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return screenToFx(r.left + r.width / 2, r.top + r.height / 2);
}

/** 전체 화면 사각형 Graphics (번쩍 등) — 화면 좌표 */
export function fullRect(g: Graphics, color: number, alpha: number): void {
  g.clear().rect(0, 0, view.w, view.h).fill({ color, alpha });
}

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
  /** 실제 렌더 해상도(화질 등급 상한 적용, 설계서 7장). dpr 은 그림·DOM 계산용 기기 배율(최대 2) */
  res: number;
}

export const view: ViewInfo = { w: 1, h: 1, dpr: 1, orient: 'land', LW: 1920, LH: 1080, k: 1, ox: 0, oy: 0, kd: 1, locked: null, res: 1 };

/** 렌더 해상도를 정하는 함수(quality.ts 가 넣음). 기본 = min(dpr, 2) */
let resFn: () => number = () => Math.min(window.devicePixelRatio || 1, 2);
export function setResolutionFn(fn: () => number): void {
  resFn = fn;
}
const stageRes = () => Math.max(0.5, Math.min(3, resFn()));

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
/** fxTop 을 2프레임 더 그림(그릴 것이 사라진 뒤 한 번 지우는 프레임 포함) */
export function markFx(): void {
  fxDirty = 2;
}
/** 루프가 부름: 이번 프레임에 fxTop 을 그릴지(markFx 뒤 2프레임) */
export function takeFx(): boolean {
  if (fxDirty <= 0) return false;
  fxDirty--;
  return true;
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

/** WebGL 을 못 만든 경우(설계서 7-추가): main 이 안내 문구를 띄운다 */
export class NoWebGLError extends Error {}

/**
 * 캔버스 두 장을 만든다. antialias = stage 안티앨리어싱(폰·저화질은 끔, 부팅 때만 정할 수 있음). fxTop 은 늘 끔.
 * WebGL2 → WebGL1 순으로 시도(Pixi 가 한 캔버스에서 webgl2 실패 시 webgl 로 다시 시도), 둘 다 안 되면 NoWebGLError.
 * 렌더는 loop.ts 가 직접 부른다(여기서는 ticker 에 렌더를 걸지 않음).
 */
export async function initStage(opts: { antialias?: boolean } = {}): Promise<void> {
  const host = document.getElementById('app')!;
  const res = stageRes();
  view.res = res;
  const make = async (o: Record<string, unknown>): Promise<Application> => {
    const a = new Application();
    try {
      await a.init({ width: viewW(), height: viewH(), resolution: res, autoDensity: true, preference: ['webgl'], ...o } as never);
      return a;
    } catch (e) {
      /* 한 번 더: WebGL1 · 성능 경고 무시 */
      const b = new Application();
      try {
        await b.init({ width: viewW(), height: viewH(), resolution: res, autoDensity: true, preference: ['webgl'], preferWebGLVersion: 1, failIfMajorPerformanceCaveat: false, ...o } as never);
        return b;
      } catch {
        throw new NoWebGLError(String((e as Error)?.message || e));
      }
    }
  };
  app = await make({ antialias: opts.antialias ?? true, background: '#2b3f8a', powerPreference: 'high-performance', autoStart: false });
  app.canvas.id = 'stage';
  host.appendChild(app.canvas);

  uiRoot = document.createElement('div');
  uiRoot.id = 'ui';
  host.appendChild(uiRoot);

  fxApp = await make({ antialias: false, backgroundAlpha: 0, autoStart: false });
  fxApp.canvas.id = 'fxtop';
  host.appendChild(fxApp.canvas);

  /*
   * Pixi 이벤트(포인터 hit test)는 쓰지 않음(입력은 전부 DOM 리스너). 켜 두면 포인터가 움직일 때마다 장면 전체를 훑어
   * 트리 112칸을 끌 때 hit test 만 폰 4배 느림에서 프레임당 수 ms(설계서 7장). 두 캔버스 모두 끔
   */
  for (const a of [app, fxApp]) {
    a.stage.eventMode = 'none';
    const ev = (a.renderer as unknown as { events?: { features?: Record<string, boolean> } }).events;
    if (ev?.features) for (const k of Object.keys(ev.features)) ev.features[k] = false;
  }
  L.fxWrap.addChild(L.world);
  app.stage.addChild(L.bg, L.fxWrap, L.screen);
  fxApp.stage.addChild(FXL.root, FXL.screen);

  layout();
  window.addEventListener('resize', () => layout());
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  new ResizeObserver(() => layout()).observe(host);
}

/** 화질이 바뀌어 렌더 해상도를 다시 맞춤 */
export function applyResolution(): void {
  layout(true);
}

let lastKey = '';
export function layout(force = false): void {
  const w = viewW();
  const h = viewH();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const res = stageRes();
  const natural: Orient = w / h < 1 ? 'port' : 'land';
  const orient = view.locked || natural;
  const key = `${w}x${h}@${dpr}/${res}:${orient}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  view.res = res;
  view.orient = orient;
  view.LW = orient === 'land' ? 1920 : 1080;
  view.LH = orient === 'land' ? 1080 : 1920;
  view.k = Math.min(w / view.LW, h / view.LH);
  view.ox = (w - view.LW * view.k) / 2;
  view.oy = (h - view.LH * view.k) / 2;
  /* DOM 배율: 원작 CSS px ≈ 가로 논리 px / 1.33 · 세로 논리 px / 2.66 */
  const kdRaw = natural === 'land' ? Math.min(w / 1920, h / 1080) * 1.33 : Math.min(w / 1080, h / 1920) * 2.66;
  view.kd = Math.max(natural === 'land' ? 0.78 : 0.86, Math.min(1.6, kdRaw));
  app.renderer.resize(w, h, res);
  fxApp.renderer.resize(w, h, res);
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

/**
 * 식권대장 타이쿤 — 본체 진입점.
 * 타이틀(로딩) → 사무실(허브) ⇄ 영업(탑뷰 상권 지도, 한 판 = 1영업일) → 정산 모달.
 * 렌더 = Pixi ticker, 영업 로직 = 누적 dt 고정 스텝(lunch/scene.ts). 저장 = 5초마다 + 영업 끝 + 탭 숨김·창 닫기.
 */
import './style.css';
import type { WebGLRenderer } from 'pixi.js';
import { loadFonts } from './fonts';
import { isFullscreen, isFullscreenSupported, onFullscreenChange, toggleFullscreen } from './fullscreen';
import { getPlatform } from './platform';
import { storage } from './storage';
import { injectStyle } from './ui/style';
import { img, installButtonFeel, mountToasts, toast } from './ui/dom';
import { LunchHud, anchorOf, bumpAnchor, snapDisplay, tickDisplay } from './ui/hud';
import { districtModal, endingModal, hideModal, modalKey, modalOpen, mountModal, settleModal, confirmBox } from './ui/modals';
import { app, initStage, layout, uiRoot, view } from './game/core/stage';
import { installFonts } from './game/core/fonts';
import { clock, onSpeed, setSpeed, stepSpeed } from './game/core/clock';
import { art, artMissing, audioDebug, music, sfx, startAudio } from './game/deps';
import { F, DISTRICT_BY, TREE, TREE_BY } from './game/data';
import { refreshEff, canBuyNode, addXp } from './game/rules';
import { S, hasSave, loadGame, resetGame, saveGame, takeMigrateToast } from './game/state';
import { OfficeScene } from './game/office/scene';
import { LunchScene } from './game/lunch/scene';
import { TitleScene } from './game/title/scene';
import { bannerStat, clearTop, confetti, cutBusy, fireworks, initTop, setHudResolver, skipCut, updateTop, wipe, wiping } from './game/fx/top';
import type { RunStats } from './game/lunch/logic';

const state: NonNullable<Window['__sikdae']> = {
  ready: false,
  platform: getPlatform(),
  renderer: '',
  gpu: '',
  fps: 0,
  launches: 0,
  fullscreen: false,
  errors: [],
};
window.__sikdae = state;
window.addEventListener('error', (e) => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => state.errors.push('unhandledrejection: ' + String(e.reason)));

function describeRenderer(): { renderer: string; gpu: string } {
  const r = app.renderer as WebGLRenderer;
  const gl = (r as unknown as { gl?: WebGLRenderingContext | WebGL2RenderingContext }).gl;
  if (!gl) return { renderer: String(app.renderer.name || app.renderer.type), gpu: '' };
  const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    gpu = '';
  }
  return { renderer: isGl2 ? 'WebGL2' : 'WebGL1', gpu };
}

async function waitForViewport(timeoutMs = 3000) {
  const t0 = performance.now();
  while ((window.innerWidth < 2 || window.innerHeight < 2) && performance.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
}

type SceneName = 'title' | 'office' | 'lunch';
let scene: SceneName = 'title';
let office!: OfficeScene;
let lunch: LunchScene | null = null;
let lunchHud!: LunchHud;
let title: TitleScene | null = null;
let busy = false;

async function boot() {
  injectStyle();
  const [fontOk] = await Promise.all([loadFonts(), waitForViewport()]);
  await initStage();
  const info = describeRenderer();
  state.renderer = info.renderer;
  state.gpu = info.gpu;
  state.launches = storage.load<number>('launches', 0) + 1;
  storage.save('launches', state.launches);
  installFonts();
  installButtonFeel(uiRoot);
  document.body.classList.add('pe-root');
  /* 마지막 입력이 터치면 body.touching — 터치에서는 hover 이름표(단축키)를 숨긴다 */
  if (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touching');
  window.addEventListener('pointerdown', (e) => document.body.classList.toggle('touching', e.pointerType === 'touch' || e.pointerType === 'pen'), true);

  loadGame();
  refreshEff();
  snapDisplay();
  const hadSave = hasSave();

  /* 타이틀 먼저 */
  title = new TitleScene(uiRoot);
  title.setFsIcon(isFullscreen());
  title.dom.querySelector('[data-a="fs"]')?.addEventListener('click', () => doFullscreen());
  if (!isFullscreenSupported()) (title.dom.querySelector('.menu') as HTMLElement).style.display = 'none';
  await title.prepare();
  music('title');

  /* DOM 틀 */
  office = new OfficeScene(uiRoot, {
    goLunch: () => void goLunch(),
    toggleFullscreen: () => doFullscreen(),
    isFullscreen: () => isFullscreen(),
    applySettings: () => saveGame(),
    resetAll: () => {
      resetGame();
      saveGame();
      location.reload();
    },
  });
  lunchHud = new LunchHud(uiRoot);
  lunchHud.endBtn.addEventListener('click', () => lunch?.finish());
  lunchHud.fsBtn.addEventListener('click', () => void doFullscreen());
  if (!isFullscreenSupported()) lunchHud.fsBtn.style.display = 'none';
  mountModal(uiRoot);
  mountToasts(uiRoot);
  const spd = document.createElement('div');
  spd.className = 'spd';
  uiRoot.appendChild(spd);
  onSpeed((s) => {
    spd.style.display = s === 1 ? 'none' : 'flex';
    spd.textContent = `×${s} 배속  ( [ ] 키 )`;
    lunchHud.setSpeed(s);
    sfx('speed_change');
  });
  if (!isFullscreenSupported()) (office.hud.menu.querySelector('[data-a="fs"]') as HTMLElement).style.display = 'none';
  initTop();
  setHudResolver(anchorOf, (id) => bumpAnchor(id));

  /* 그림 래스터화 (로딩 막대) */
  const res = Math.max(1, Math.min(2, Math.ceil(view.k * view.dpr * 2) / 2));
  await art.loadAll(app.renderer, (d, t) => title?.progress(d, t), { resolution: res });
  await art.loadMap(app.renderer, S.district, view.orient).catch(() => null);
  title.showLogo();
  title.ready(hadSave);
  title.onStart = (mode) => {
    if (busy) return;
    if (mode === 'new') {
      confirmBox('새로 시작할까요?', '지금까지의 진행이 전부 사라져요.', '새로 시작', () => {
        confirmBox('정말 지울까요?', '되돌릴 수 없어요.', '전부 지우고 시작', () => {
          resetGame();
          saveGame();
          refreshEff();
          snapDisplay();
          void enterOffice(true);
        }, true);
      }, true);
      return;
    }
    sfx('title_start');
    void enterOffice(mode === 'start' && !hadSave);
  };

  /* 입력: 첫 입력에 소리 */
  const firstInput = () => {
    void startAudio();
  };
  window.addEventListener('pointerdown', firstInput, { capture: true });
  window.addEventListener('keydown', firstInput, { capture: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', (e) => {
    if (skipCut()) e.stopPropagation();
  });
  onFullscreenChange((on) => {
    state.fullscreen = on;
    office.hud.setFullscreen(on);
    lunchHud.fsBtn.innerHTML = img(on ? 'ic.fullscreenExit' : 'ic.fullscreen');
    title?.setFsIcon(on);
    setTimeout(() => layout(true), 60);
  });
  state.fullscreen = isFullscreen();

  /* 저장 */
  setInterval(() => {
    if (scene !== 'title') saveGame();
  }, F.SAVE_EVERY * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && scene !== 'title') saveGame();
  });
  window.addEventListener('pagehide', () => scene !== 'title' && saveGame());
  window.addEventListener('beforeunload', () => scene !== 'title' && saveGame());

  /* 루프 */
  app.ticker.maxFPS = 0;
  app.ticker.add((t) => {
    const rt = Math.min(0.1, t.deltaMS / 1000);
    if (scene === 'title') title?.update(rt);
    else if (scene === 'office') office.update(rt);
    else if (scene === 'lunch' && lunch) lunch.update(rt);
    tickDisplay(rt);
    updateTop(rt);
  });
  setInterval(() => (state.fps = Math.round(app.ticker.FPS)), 500);

  installDebug();
  state.ready = true;
  console.info(
    `SIKDAE_READY platform=${state.platform} renderer=${state.renderer} gpu="${state.gpu}" ` +
      `size=${view.w}x${view.h} dpr=${view.dpr} font=${fontOk ? 'Jua' : 'fallback'} launches=${state.launches}`,
  );
}

async function doFullscreen(): Promise<void> {
  sfx('ui_fullscreen');
  await toggleFullscreen();
}

async function enterOffice(firstTime: boolean): Promise<void> {
  if (busy) return;
  busy = true;
  await wipe(() => {
    title?.destroy();
    title = null;
    scene = 'office';
    office.enter();
    const mt = takeMigrateToast();
    if (mt) setTimeout(() => toast(mt, 'ic.reset'), 500);
    if (firstTime || S.runs === 0) setTimeout(() => toast('[영업 나가기]로 시작해요', 'ic.go'), 700);
  });
  busy = false;
}

async function goLunch(): Promise<void> {
  if (busy || scene === 'lunch') return;
  busy = true;
  hideModal();
  lunch = new LunchScene(lunchHud);
  lunch.onEnd = (st, ending) => onLunchEnd(st, ending);
  await wipe(async () => {
    clearTop();
    office.exit();
    lunchHud.root.classList.add('on');
    scene = 'lunch';
    await lunch!.start();
  });
  lunch?.go();
  busy = false;
}

function onLunchEnd(st: RunStats, ending: boolean): void {
  const again = async () => {
    if (busy) return;
    busy = true;
    await wipe(async () => {
      lunch?.destroy();
      clearTop();
      lunch = new LunchScene(lunchHud);
      lunch.onEnd = (s2, e2) => onLunchEnd(s2, e2);
      await lunch.start();
    });
    lunch?.go();
    busy = false;
  };
  const toOffice = async () => {
    if (busy) return;
    busy = true;
    await wipe(() => {
      lunch?.destroy();
      lunch = null;
      clearTop();
      lunchHud.root.classList.remove('on');
      app.renderer.background.color = '#2b3f8a';
      scene = 'office';
      office.enter();
    });
    busy = false;
  };
  if (ending) {
    music('ending');
    sfx('ending');
    /* 엔딩: 폭죽 반복 */
    fireworks(4);
    confetti(40, true);
    const fw = window.setInterval(() => {
      fireworks(3);
      confetti(24, true);
    }, 1600);
    endingModal(() => {
      clearInterval(fw);
      void toOffice();
    });
    return;
  }
  settleModal({ stats: st, runNo: S.runs, districtName: DISTRICT_BY[S.district].name, onAgain: () => void again(), onOffice: () => void toOffice() });
}

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName || '';
  if (/INPUT|TEXTAREA/.test(tag)) return;
  if (e.code === 'BracketRight') {
    stepSpeed(1);
    return;
  }
  if (e.code === 'BracketLeft') {
    stepSpeed(-1);
    return;
  }
  if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') {
    if (isFullscreenSupported()) void doFullscreen();
    return;
  }
  if (e.key === 'F11' && isFullscreenSupported()) {
    e.preventDefault();
    void doFullscreen();
    return;
  }
  const enter = e.key === 'Enter' || e.code === 'Space';
  if (modalOpen()) {
    if (e.key === 'Escape') modalKey('esc');
    else if (enter) {
      e.preventDefault();
      modalKey('enter');
    }
    return;
  }
  if (wiping()) return;
  if (scene === 'title' && enter) {
    const b = title?.dom.querySelector<HTMLElement>('.tbtns.show [data-a="start"], .tbtns.show [data-a="continue"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
    return;
  }
  if (scene === 'office') {
    if (enter) {
      e.preventDefault();
      void goLunch();
      return;
    }
    office.key(e.key);
    return;
  }
  if (scene === 'lunch' && e.key === 'Escape') lunch?.finish();
}

/* ── 검수용 훅 (UI 노출 없음) ── */
function installDebug(): void {
  const game = {
    speed: (n: number) => setSpeed(n),
    give: (amount: number, point = 0, xp = 0) => {
      S.revenue += amount;
      S.point += point;
      if (xp) addXp(xp);
      office.refresh();
      return S.revenue;
    },
    get state() {
      return S;
    },
    get scene() {
      return scene;
    },
    get lunch() {
      return lunch?.lunch;
    },
    startRun: () => {
      if (scene === 'title') void enterOffice(false).then(() => goLunch());
      else void goLunch();
    },
    endRun: () => lunch?.finish(),
    office: () => office,
    openTab: (t: string) => office.openTab(t),
    district: (id: string) => {
      if (DISTRICT_BY[id]) S.district = id as typeof S.district;
      office.hud.renderDistrict();
    },
    buyNode: (id: string) => {
      const n = TREE_BY[id];
      return n ? office.buyNode(n) : false;
    },
    canBuy: (id: string) => (TREE_BY[id] ? canBuyNode(TREE_BY[id]) : false),
    districtModal: () => districtModal((id) => (S.district = id)),
    clock,
    /** 지도(논리) 좌표 → 화면 CSS px */
    toScreen: (x: number, y: number) => ({ x: view.ox + x * view.k, y: view.oy + y * view.k }),
    nodeScreen: (id: string) => office.tree?.nodeScreen(id) ?? null,
    treeIds: () => TREE.map((n) => n.id),
    nodeD: (id: string) => TREE_BY[id]?.d ?? 99,
    artMissing,
    audio: () => audioDebug(),
    cutBusy: () => cutBusy(),
    bannerStat: () => bannerStat(),
    lunchView: () => lunch?.view,
    save: () => saveGame(),
    net: (x: number, y: number) => {
      if (lunch?.lunch) {
        lunch.lunch.net.x = x;
        lunch.lunch.net.y = y;
      }
    },
  };
  (window as unknown as { __game: typeof game }).__game = game;
  (state as unknown as { debug: unknown }).debug = {
    speed: game.speed,
    cheat: (rev: number, point = 0, xp = 0) => game.give(rev, point, xp),
    buyNode: game.buyNode,
    sim: (sec: number) => {
      const L0 = lunch?.lunch;
      if (!L0) return false;
      const step = 1 / 60;
      for (let t = 0; t < sec; t += step) if (!L0.update(step)) break;
      return true;
    },
  };
}

boot().catch((err) => {
  console.error('[boot] 시작 실패', err);
  state.errors.push('boot: ' + String(err && (err as Error).message ? (err as Error).message : err));
  const box = document.createElement('div');
  box.id = 'boot-error';
  box.textContent = '게임을 시작하지 못했습니다.\n' + String(err && (err as Error).message ? (err as Error).message : err);
  document.body.appendChild(box);
});

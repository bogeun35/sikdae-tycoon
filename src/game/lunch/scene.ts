/**
 * 영업(한 판 = 1영업일) 장면: 지도 준비 → 로직 고정 스텝(1/60초, 배속·히트스톱·슬로모는 로직 dt 에만) + 렌더(ticker) →
 * 시간 끝·[사무실로]·Esc → 정산 모달("N영업일이 지났습니다"). 영업 중에는 시작할 때 방향으로 화면을 고정한다.
 */
import { DISTRICT_BY, F, FX, ITEM_BY, type SkillId } from '../data';
import { art, audio, music, sfx } from '../deps';
import { clock, resetClockFx, tickClock } from '../core/clock';
import { L, app, lockOrient, onLayout, view } from '../core/stage';
import { banner, confetti, dropQueuedBanners, flyCoin, fireworks, holdBanners, levelUpCut, rayCut, setBannerShift, type HudId } from '../fx/top';
import { E, refreshEff } from '../rules';
import { S, saveGame } from '../state';
import { Lunch, closeRun, type RunStats } from './logic';
import { LunchView, type HudHooks } from './view';
import { LunchHud, anchorOf, bumpAnchor, disp } from '../../ui/hud';
import { won } from '../format';

const STEP = 1 / 60;

export class LunchScene {
  lunch!: Lunch;
  view!: LunchView;
  private acc = 0;
  private ended = false;
  private offLayout: (() => void) | null = null;
  private pointerH: ((e: PointerEvent) => void) | null = null;
  private downH: ((e: PointerEvent) => void) | null = null;
  private upH: ((e: PointerEvent) => void) | null = null;
  private hurry = false;
  private started = false;
  private lastPtr: { x: number; y: number; touch: boolean } | null = null;
  onEnd: (stats: RunStats, ending: boolean) => void = () => {};

  constructor(readonly hud: LunchHud) {}

  async start(): Promise<void> {
    this.ended = false;
    this.started = false;
    this.acc = 0;
    this.hurry = false;
    resetClockFx();
    refreshEff();
    lockOrient(view.orient);
    const orient = view.orient;
    const did = S.district;
    const layers = art.mapLayers(did, orient);
    const tex = await art.loadMap(app.renderer, did, orient);
    const hooks: HudHooks = {
      skillFired: (sk: SkillId) => this.hud.fire(sk),
      matchUp: (step, M) => {
        this.hud.matchPop();
        this.view.nums.text(this.lunch.net.x, this.lunch.area.y0 + 60, `매칭 ×${[1.25, 1.5, 1.75, 2, 2.5, 3][step - 1] ?? M.toFixed(2)}!`, 0xff8fab, 20 + step * 1.5, 'match');
      },
      portrait: (k) => this.hud.portrait(k),
      itemGet: (id, isNew) => {
        if (isNew) {
          const it = ITEM_BY[id];
          /* 영업 중에는 가운데(배너·LEVEL UP 자리)를 비우고 오른쪽 아래(세로는 아래쪽)에 작게 */
          const land = view.orient === 'land';
          rayCut(`i.${id}`, it.name, { sub: it.u, size: 150, compact: true, x: land ? 0.83 : 0.5, y: land ? 0.6 : 0.7 });
          sfx('item_get');
        }
      },
      levelUp: (lv, gained) => this.levelUp(lv, gained),
      pendingRelease: (gmv) => this.pendingRelease(gmv),
      tick: (sec) => {
        if (sec <= 5 && !this.hurry) {
          this.hurry = true;
          audio.setHurry(true);
        }
      },
      bossAppear: () => {
        music('boss');
      },
      pendingAnchor: (): HudId => 'hud.pending',
    };
    this.view = new LunchView(layers, tex.ground, tex.roads, hooks);
    this.lunch = new Lunch(layers, this.view);
    this.view.lunch = this.lunch;
    this.view.nums.mult = this.lunch.gmvMult;
    L.world.addChild(this.view.root);
    app.renderer.background.color = DISTRICT_BY[did].pal.ground;
    this.hud.begin(this.lunch.total);
    this.hud.setSpeed(clock.speed);
    this.bindInput();
    this.offLayout = onLayout(() => this.fixLetterbox());
    this.fixLetterbox();
    document.body.classList.add('lunching');
    music('lunch');
    sfx('lunch_start');
  }
  /** 와이프가 끝난 뒤 실제 시작 */
  go(): void {
    if (this.started) return;
    this.started = true;
    this.lunch.begin();
    const pill = document.createElement('div');
    pill.className = 'startPill';
    pill.innerHTML = `<img class="ic" src="" alt="">영업 시작!`;
    const icon = document.querySelector('#office .go img') as HTMLImageElement | null;
    if (icon) (pill.querySelector('img') as HTMLImageElement).src = icon.src;
    this.hud.root.appendChild(pill);
    holdBanners(1.0);
    setTimeout(() => pill.remove(), 950);
  }

  private fixLetterbox(): void {
    /* 방향이 고정된 채 화면 비가 바뀌면 남는 띠는 상권 바닥색 */
  }

  private bindInput(): void {
    const toMap = (cx: number, cy: number) => this.view.camera.cam.toLocal({ x: cx, y: cy });
    const clampNet = (x: number, y: number) => {
      const a = this.lunch.area;
      return { x: Math.max(a.x0, Math.min(a.x1, x)), y: Math.max(Math.max(a.y0, this.lunch.map.topLimit), Math.min(a.y1, y)) };
    };
    const apply = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      this.lastPtr = { x: e.clientX, y: e.clientY, touch };
    };
    this.pointerH = (e) => {
      if (this.ended) return;
      if (e.pointerType === 'touch' && e.buttons === 0 && e.pressure === 0) return;
      apply(e);
    };
    this.downH = (e) => {
      if (this.ended) return;
      const t = e.target as HTMLElement;
      if (t && t.closest && t.closest('button')) return;
      apply(e);
    };
    this.upH = (e) => {
      if (e.pointerType === 'touch') this.view.touch = false;
    };
    window.addEventListener('pointermove', this.pointerH);
    window.addEventListener('pointerdown', this.downH);
    window.addEventListener('pointerup', this.upH);
    this.applyPtr = () => {
      const p = this.lastPtr;
      if (!p) return;
      const m = toMap(p.x, p.y);
      if (p.touch) {
        const lift = F.DIST.touchLift * this.lunch.U;
        const n = clampNet(m.x, m.y - lift);
        this.lunch.net.x = n.x;
        this.lunch.net.y = n.y;
        this.view.touch = true;
        this.view.finger = { x: m.x, y: m.y };
      } else {
        const n = clampNet(m.x, m.y);
        this.lunch.net.x = n.x;
        this.lunch.net.y = n.y;
        this.view.touch = false;
      }
    };
  }
  private applyPtr: () => void = () => {};

  /** 영업 중 레벨업: 컷·소리만. 새로 열린 거래처 관리는 토스트로 지도를 가리지 않고 정산 모달에 한 줄로 모아 보여 준다 */
  private levelUp(lv: number, gained: number): void {
    levelUpCut(lv);
    sfx('level_up');
    void gained;
  }
  private pendingRelease(gmv: number): void {
    banner(FX.pendingRelease.banner, `결제 대기 ${won(gmv)}이 풀렸어요`);
    sfx('pending_release');
    const from = anchorOf('hud.pending') || anchorOf('hud.gmv');
    if (from) for (let i = 0; i < 20; i++) flyCoin('fx.ticket', { x: from.x + (Math.random() - 0.5) * 60, y: from.y + (Math.random() - 0.5) * 20 }, 'hud.gmv', i * 0.035, 1);
    confetti(18, true);
    fireworks(2);
  }

  update(rt: number): void {
    if (!this.lunch) return;
    this.applyPtr();
    const k = tickClock(rt);
    if (!this.ended && this.started) {
      this.acc += Math.min(rt * k, F.RUN.DT_MAX);
      let n = 0;
      while (this.acc >= STEP && n < 400) {
        this.acc -= STEP;
        n++;
        if (!this.lunch.update(STEP)) {
          this.finish();
          break;
        }
      }
    }
    this.view.update(rt);
    /* 영업 HUD */
    this.hud.gain.gmv = this.lunch.stats.gmv;
    this.hud.gain.revenue = this.lunch.stats.rev;
    this.hud.gain.point = this.lunch.stats.point;
    this.hud.setTimer(this.lunch.left);
    this.hud.update(this.lunch);
    const boss = this.lunch.ents.find((e) => e.boss);
    this.hud.setBoss(boss ? Math.max(0, boss.hp / boss.max) : null, rt);
    setBannerShift(boss ? 0.12 : 0);
    /* 남은 5초 비네트 · 러시/피버 테두리 빛 */
    const cam = this.view.camera;
    const low = this.lunch.left <= FX.timerLow.from && this.lunch.left > 0;
    cam.vigTint = 0xff3b3b;
    cam.vigAlpha = low ? 0.08 + (Math.sin(clock.now * Math.PI * 2 * 2) * 0.5 + 0.5) * 0.1 : 0;
    const rush = this.lunch.fx.some((f) => f.type === 'jet');
    const fever = this.lunch.M >= 2.5;
    const target = rush || fever ? 0.22 + Math.sin(clock.now * 6) * 0.08 : 0;
    cam.borderAlpha += (target - cam.borderAlpha) * Math.min(1, rt * 6);
    cam.borderTint = rush ? 0xffc26b : 0xff8fab;
    void disp;
    void bumpAnchor;
  }

  /** 시간 끝 / 사무실로 */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.lunch.ended = true;
    sfx('lunch_end');
    audio.setHurry(false);
    dropQueuedBanners();
    const ending = closeRun(this.lunch.stats);
    saveGame();
    this.unbind();
    document.body.classList.remove('lunching');
    audio.duck(0.45, 99);
    const st = this.lunch.stats;
    if (st.count > 0 && st.best && st.best.t.grade >= 2) confetti(st.best.t.grade >= 3 ? 24 : 12, true);
    if (st.best && st.best.t.grade >= 3) fireworks(2);
    setTimeout(() => this.onEnd(st, ending), 380);
    void E;
  }

  private unbind(): void {
    if (this.pointerH) window.removeEventListener('pointermove', this.pointerH);
    if (this.downH) window.removeEventListener('pointerdown', this.downH);
    if (this.upH) window.removeEventListener('pointerup', this.upH);
    this.pointerH = this.downH = this.upH = null;
  }

  destroy(): void {
    setBannerShift(0);
    this.unbind();
    this.offLayout?.();
    document.body.classList.remove('lunching');
    audio.duck(1, 0.3);
    if (this.view) {
      this.view.destroy();
    }
    resetClockFx();
    lockOrient(null);
    this.lunch = undefined as unknown as Lunch;
  }
}


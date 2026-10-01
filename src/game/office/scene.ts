/**
 * 사무실(허브): 배경(보라→분홍 하늘·별·스카이라인) + HUD + 가운데 패널(성장 트리·대표·도감·아이템·스킬·설정)
 * + 하단 설명 바 + 좌하단 설정·상권 알약 + 우하단 [영업 나가기].
 */
import { CHAR_BY, DISTRICT_BY, SKILLS, TARGET_BY, TREE, TREE_BY, type DistrictId, type TreeNode } from '../data';
import { music, sfx } from '../deps';
import { fmt, fmtVal } from '../format';
import {
  E, anyNodeBuyable, anySkBuyable, canBuyItem, canBuyMastery, canBuyNode, nodeCost, nodeCostObj, nodeLinked, nodeReqName, nodeReqOk, nodeVisible, owns, refreshEff, repUnlocked, statLevels, STAT_MAX, tlv,
} from '../rules';
import { S, saveGame } from '../state';
import { buyNode as shopBuyNode } from '../shop';
import { TARGETS, ITEMS } from '../data';
import { L, onLayout, uiRoot, view } from '../core/stage';
import { gsapBusy, requestRender } from '../core/loop';
import { budget, type TierBudget } from '../core/quality';
import { rasterKey } from '../core/tex';
import { districtCut, sparkleAt } from '../fx/top';
import { OfficeBg } from './bg';
import { TreeView } from './tree';
import { OfficeHud, levelInfo } from '../../ui/hud';
import { Panels, type PanelHooks } from '../../ui/panels';
import { Sheet } from '../../ui/sheet';
import { img, tapKey, toast } from '../../ui/dom';
import { confirmBox, districtModal } from '../../ui/modals';
import { keyChip } from '../../ui/kinds';
import { screenToFx } from '../core/stage';

export interface OfficeHooks extends Omit<PanelHooks, 'refresh' | 'confirm'> {
  goLunch(): void;
}

const TABS = ['tree', 'reps', 'dex', 'items', 'skills'];

/** 효과 설명의 자리표시(+N · +% · +%p · +초 · N%)를 뺀다 — 값은 뒤에 "현재 → 다음"으로 붙는다 */


export class OfficeScene {
  readonly hud: OfficeHud;
  readonly sheet: Sheet;
  readonly panels: Panels;
  bg: OfficeBg | null = null;
  tree: TreeView | null = null;
  tab: string | null = 'tree';
  private offLayout: (() => void) | null = null;
  private hudRO: ResizeObserver | null = null;
  private active = false;
  private autoOn = false;
  private autoPhase: 'find' | 'move' | 'select' | 'effect' = 'find';
  private autoDelay = 0;
  private autoTarget: TreeNode | null = null;
  private autoCuts = 0;
  private autoCursor: HTMLElement | null = null;

  constructor(root: HTMLElement, readonly hooks: OfficeHooks) {
    this.hud = new OfficeHud(root);
    this.sheet = new Sheet(this.hud.sheet);
    this.panels = new Panels(this.hud.body, this.sheet, {
      refresh: () => this.refresh(),
      confirm: (t, m, ok, fn, danger) => confirmBox(t, m, ok, fn, danger),
      toggleFullscreen: () => hooks.toggleFullscreen(),
      isFullscreen: () => hooks.isFullscreen(),
      applySettings: () => hooks.applySettings(),
      resetAll: () => hooks.resetAll(),
    });
    for (const b of Array.from(this.hud.menu.querySelectorAll<HTMLElement>('.mb[data-tab]'))) {
      b.addEventListener('click', () => this.toggleTab(b.dataset.tab!));
    }
    this.hud.menu.querySelector('[data-a="fs"]')?.addEventListener('click', () => hooks.toggleFullscreen());
    this.hud.cfg.addEventListener('click', () => this.toggleTab('settings'));
    this.hud.dist.addEventListener('click', () => {
      this.setAuto(false);
      sfx('ui_open');
      districtModal((id: DistrictId) => {
        S.district = id;
        saveGame();
        this.hud.renderDistrict();
        toast(`${DISTRICT_BY[id].name} 상권으로 나가요`, `ic.dist_${id}`);
      });
    });
    this.hud.go.addEventListener('click', () => this.hooks.goLunch());
    this.hud.onLevelTap = () => {
      this.setAuto(false);
      sfx('ui_tap');
      const li = levelInfo();
      this.sheet.show('ic.level', li.title, li.desc, { extra: `<span class="pz ok">${img('ic.xp')}<small class="hl">사용자수 ${fmt(S.xp)}</small></span>` });
      if (this.tab === null) this.openTab('tree');
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setAuto(false); });
  }

  enter(): void {
    this.active = true;
    this.hud.root.classList.add('on');
    const anim = budget().officeAnim;
    this.bg = new OfficeBg(anim);
    L.bg.addChild(this.bg.root);
    this.tree = new TreeView({ tap: (n) => this.tapNode(n), interact: () => this.setAuto(false) });
    this.tree.setAnimated(anim);
    /* 출발 버튼 빛 고리를 처음부터 다시(가벼운 화질은 몇 번만 움직이고 멈춤) */
    this.hud.go.classList.toggle('re');
    L.bg.addChild(this.tree.root);
    this.offLayout = onLayout(() => this.layout());
    /* 숫자가 길어져 HUD 가 한 줄 더 늘면 패널·트리를 다시 맞춤 (폰 세로에서 메뉴 원이 패널에 가려지던 것) */
    let hudH = 0;
    this.hudRO = new ResizeObserver(() => {
      /* 좌하단 상권 알약 높이가 바뀌어도(폰 세로 줄바꿈) 패널 아래 끝을 다시 맞춤 */
      const h = this.hud.hud.offsetHeight * 10000 + this.hud.bl.offsetHeight;
      if (h !== hudH) {
        hudH = h;
        this.layout();
      }
    });
    this.hudRO.observe(this.hud.hud);
    this.hudRO.observe(this.hud.bl);
    refreshEff();
    this.hud.renderDistrict();
    this.openTab(this.tab || 'tree', true);
    this.refresh();
    this.layout();
    music('office');
  }
  exit(): void {
    this.setAuto(false);
    this.active = false;
    this.hud.root.classList.remove('on');
    this.offLayout?.();
    this.hudRO?.disconnect();
    this.hudRO = null;
    this.bg?.destroy();
    this.bg = null;
    this.tree?.destroy();
    this.tree = null;
    this.sheet.hide();
  }

  layout(): void {
    if (!this.active) return;
    this.hud.place();
    this.hud.fitPanel();
    this.bg?.layout();
    this.fitTree();
  }
  private fitTree(): void {
    if (!this.tree) return;
    const r = this.hud.panel.getBoundingClientRect();
    const b = 4 * view.kd;
    this.tree.setRect({ x: r.left + b, y: r.top + b, w: Math.max(10, r.width - b * 2), h: Math.max(10, r.height - b * 2) });
    this.tree.root.visible = this.tab === 'tree';
    this.tree.active = this.tab === 'tree';
  }

  toggleTab(t: string): void {
    if (this.tab === t) {
      sfx('ui_close');
      this.tab = null;
      this.openTab(null);
    } else {
      sfx('ui_open');
      this.openTab(t);
    }
  }
  openTab(t: string | null, silent = false): void {
    if (t !== 'tree') this.setAuto(false);
    this.tab = t;
    this.panels.tab = t === 'tree' ? null : t;
    this.hud.setTab(t);
    const p = this.hud.panel;
    this.sheet.hide();
    this.tree?.select(null);
    if (!t) {
      p.classList.remove('show', 'tree');
    } else {
      p.classList.add('show');
      p.classList.toggle('tree', t === 'tree');
      if (t === 'tree') {
        this.hud.body.innerHTML = '';
        this.renderTreeHead();
      } else {
        this.hud.treeHead.innerHTML = '';
        this.panels.render();
        this.hud.body.scrollTop = 0;
      }
    }
    if (!silent) this.refresh();
    requestAnimationFrame(() => this.fitTree());
    this.fitTree();
  }

  private renderTreeHead(): void {
    const st = statLevels();
    /* 가지 이름 옆 아이콘 = 그 가지를 사는 재화(영업력 = 매출 동전, 기술력 = 기술력 톱니) */
    const bar = (cls: string, icon: string, name: string, v: number, mx: number, col: string) =>
      `<div class="th ${cls}">${img(icon)}<span>${name}&nbsp;${v}/${mx}</span><div class="thb"><i style="width:${Math.min(100, (v / mx) * 100)}%;background:${col}"></i></div></div>`;
    const center = this.hud.treeHead.querySelector<HTMLButtonElement>('[data-a="center"]');
    const auto = this.hud.treeHead.querySelector<HTMLButtonElement>('[data-a="auto-upgrade"]');
    this.hud.treeHead.innerHTML =
      bar('l', 'ic.revenue', '영업력', st.sales, STAT_MAX.sales, 'linear-gradient(90deg,#ffb09a,#ff7b5e)') +
      bar('r', 'ic.tech', '기술력', st.tech, STAT_MAX.tech, 'linear-gradient(90deg,#9fd3ff,#4aa3df)') +
      '';
    const button = center || document.createElement('button');
    if (!center) {
      button.className = 'tcenter pe'; button.dataset.a = 'center'; button.type = 'button';
      button.innerHTML = `${img('ic.back')}가운데로`;
      button.addEventListener('click', () => { this.setAuto(false); sfx('ui_tap'); this.tree?.center(); });
    }
    this.hud.treeHead.appendChild(button);
    const autoButton = auto || document.createElement('button');
    if (!auto) {
      autoButton.className = 'auto-upgrade pe'; autoButton.dataset.a = 'auto-upgrade'; autoButton.type = 'button';
      autoButton.addEventListener('click', () => { sfx('ui_tap'); this.setAuto(!this.autoOn); });
    }
    this.hud.treeHead.appendChild(autoButton);
    this.renderAuto();

  }

  /* ── 트리 칸 ── */
  private nodeDesc(n: TreeNode): { title: string; desc: string } {
    const l = tlv(n.id);
    const title = `${n.techStage ? n.techStage + '. ' : ''}${n.name}${n.max > 1 ? ` ${l}/${n.max}` : ''}`;
    let desc = '';
    if (n.f !== 'u') {
      const value = l < n.max ? n.vals[l] : n.vals.reduce((a, b) => a + b, 0);
      desc = fmtVal(n.f, n.ef, value).replaceAll('곳', '');
    } else if (n.ef === 'tgt') desc = `${TARGET_BY[String(n.tg)].name} 해금`;
    else if (n.ef === 'district') desc = `${DISTRICT_BY[String(n.tg)].name} 해금`;
    else if (n.ef === 'cap') desc = `${CHAR_BY[String(n.tg)].name} 영입 가능`;
    else if (n.ef === 'sk') desc = `${SKILLS[String(n.tg) as keyof typeof SKILLS].name} 해금`;
    else if (n.ef === 'chest' || n.ef === 'inquiry') desc = `${n.tg}등급 해금`;
    else desc = '해금';
    return { title, desc };
  }
  private showNode(n: TreeNode): void {
    const { title, desc } = this.nodeDesc(n);
    const l = tlv(n.id);
    const icon = n.icon;
    /* 제목 옆 효과 칩(트리 칸 가격표와 같은 칩) */
    const chips = keyChip(n.ef);
    if (l >= n.max) this.sheet.show(icon, title, desc, { state: 'max', chips });
    else if (!nodeLinked(n)) this.sheet.show(icon, title, desc, { state: 'link', cost: nodeCostObj(n), chips });
    else if (!nodeReqOk(n)) this.sheet.show(icon, title, desc, { state: 'lock', lockText: `먼저: ${nodeReqName(n)}`, chips });
    else this.sheet.show(icon, title, desc, { cost: nodeCostObj(n), chips });
    this.sheet.bind(() => this.showNode(n));
  }
  private tapNode(n: TreeNode): void {
    this.setAuto(false);
    tapKey(
      'node:' + n.id,
      () => canBuyNode(n),
      () => this.buyNode(n),
      () => {
        this.tree?.select(n.id);
        this.showNode(n);
      },
      () => {
        const p = this.tree?.nodeScreen(n.id);
        if (p) sparkleAt(screenToFx(p.x, p.y), 0);
      },
    );
  }
  buyNode(n: TreeNode): boolean {
    if (!shopBuyNode(n)) return false;
    this.tree?.bought(n);
    sfx(n.key ? 'node_buy_key' : 'node_buy');
    this.afterUnlock(n);
    this.tree?.select(n.id);
    this.showNode(n);
    this.refresh();
    if (this.tab === 'tree') this.renderTreeHead();
    saveGame();
    return true;
  }
  private afterUnlock(n: TreeNode): void {
    const tg = String(n.tg);
    if (n.ef === 'district') {
      const d = DISTRICT_BY[tg];
      this.autoCuts++;
      const done = () => { this.autoCuts = Math.max(0, this.autoCuts - 1); this.hud.dist.classList.add('glow'); };
      void rasterKey(`m.${d.id}.ground@land`, 0.4).then((tex) => {
        districtCut(tex, `${d.name} 오픈!`, d.note, done);
      }).catch(() => districtCut(null, `${d.name} 오픈!`, d.note, done));
      sfx('district_open');
      setTimeout(() => this.hud.dist.classList.remove('glow'), 6000);
    } else if (n.ef === 'tgt') {
      const t = TARGET_BY[tg];
      toast(`새 거래처: ${t.name}`, `t.${t.id}@idle`);
    } else if (n.ef === 'cap') {
      const c = CHAR_BY[tg];
      toast(`${c.name} 고용 가능`, `c.${c.id}@idle`);
    } else if (n.ef === 'sk') {
      const s = SKILLS[tg as keyof typeof SKILLS];
      toast(`새 스킬: ${s.name}`, `ic.${s.icon}`);
    } else if (n.ef === 'chest' && Number(n.tg) === 1) toast('선물 상자가 나타나요', 'ic.chest');
    else if (n.ef === 'inquiry' && Number(n.tg) === 1) toast('인바운드 문의가 날아와요', 'ic.inquiry');
    else if (n.ef === 'wom') toast('입소문 해금', 'ic.ef_wom');
    else if (n.ef === 'hot') toast('핫플 해금', 'ic.ef_hot');
    else if (n.ef === 'ref') toast('소개 영업 해금', 'ic.ef_ref');
  }

  alerts(): Record<string, boolean> {
    return {
      tree: anyNodeBuyable() && this.tab !== 'tree',
      reps: Object.keys(CHAR_BY).some((id) => !S.reps[id] && repUnlocked(id)),
      dex: TARGETS.some((t) => canBuyMastery(t)),
      items: ITEMS.some((it) => canBuyItem(it.id)),
      skills: anySkBuyable(),
    };
  }

  refresh(): void {
    this.hud.update();
    this.hud.renderDistrict();
    this.hud.setAlerts(this.alerts());
    this.tree?.rebuild();
    if (this.tab === 'tree') this.renderTreeHead();
    if (this.sheet.shown) this.sheet.refresh();
  }

  key(k: string): boolean {
    if (k === 'Escape') {
      if (this.autoOn) { this.setAuto(false); return true; }
      if (this.sheet.shown) {
        this.sheet.hide();
        this.tree?.select(null);
        return true;
      }
      if (this.tab) {
        this.toggleTab(this.tab);
        return true;
      }
      return false;
    }
    const i = ['1', '2', '3', '4', '5'].indexOf(k);
    if (i >= 0) {
      const t = TABS[i];
      if (this.tab !== t) {
        sfx('ui_open');
        this.openTab(t);
      } else this.toggleTab(t);
      return true;
    }
    return false;
  }

  /** 화질 등급이 바뀜: 배경·트리 별 움직임 켜고 끔(설계서 7장) */
  applyQuality(b: TierBudget): void {
    this.bg?.setAnimated(b.officeAnim);
    this.tree?.setAnimated(b.officeAnim);
  }

  private tick = 0;
  private renderAuto(waiting = false): void {
    const b = this.hud.treeHead.querySelector<HTMLButtonElement>('[data-a="auto-upgrade"]');
    if (!b) return;
    const text = `자동 업그레이드 ${this.autoOn ? waiting ? '대기' : 'ON' : 'OFF'}`;
    if (b.textContent !== text) b.textContent = text;
    b.classList.toggle('on', this.autoOn);
    b.setAttribute('aria-pressed', String(this.autoOn));
  }
  private setAuto(on: boolean): void {
    if (!on && !this.autoOn) return;
    this.autoOn = on && this.active && this.tab === 'tree';
    this.autoPhase = 'find'; this.autoDelay = 0; this.autoTarget = null;
    this.tree?.stopFocus();
    this.autoCursor?.remove(); this.autoCursor = null;
    this.renderAuto();
    requestRender();
  }
  private autoTap(n: TreeNode): void {
    this.autoCursor?.remove(); this.autoCursor = null;
    const p = this.tree?.nodeScreen(n.id);
    if (!p) return;
    const r = uiRoot.getBoundingClientRect();
    const cursor = document.createElement('span');
    cursor.className = 'auto-tap'; cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = img('ic.doubleTap');
    cursor.style.left = `${(p.x - r.left) / view.kd}px`;
    cursor.style.top = `${(p.y - r.top) / view.kd}px`;
    this.hud.root.appendChild(cursor); this.autoCursor = cursor;
  }
  private updateAuto(dt: number): void {
    if (!this.autoOn || this.tab !== 'tree' || !this.tree) return;
    if (document.hidden || document.body.classList.contains('modal-on') || document.querySelector('dialog[open]')) { this.setAuto(false); return; }
    if (this.autoCuts > 0) return;
    this.autoDelay -= Math.min(dt, 0.1);
    if (this.autoDelay > 0) return;
    if (this.autoPhase === 'find') {
      this.autoCursor?.remove(); this.autoCursor = null;
      // Compare current discounted prices, and respect each currency's actual balance.
      const n = TREE.filter(n => nodeVisible(n) && canBuyNode(n)).sort((a, b) => nodeCost(a) - nodeCost(b))[0];
      if (!n) {
        if (TREE.every(n => tlv(n.id) >= n.max)) { this.setAuto(false); toast('스킬 업그레이드 완료', 'ic.check'); return; }
        this.renderAuto(true); this.autoDelay = 0.8; return;
      }
      this.autoTarget = n; this.renderAuto();
      this.sheet.hide(); this.tree.select(null); this.tree.focusNode(n);
      this.autoPhase = 'move'; this.autoDelay = 0.65; return;
    }
    const n = this.autoTarget;
    if (!n || (this.autoPhase !== 'effect' && (!nodeVisible(n) || !canBuyNode(n)))) {
      this.autoPhase = 'find'; this.autoDelay = 0.2; return;
    }
    if (this.autoPhase === 'move') {
      this.tree.select(n.id); this.showNode(n); this.autoTap(n); sfx('ui_tap');
      this.autoPhase = 'select'; this.autoDelay = 0.75; return;
    }
    if (this.autoPhase === 'select') {
      // Use the same purchase, save, sound, unlock and animation path as manual clicks.
      this.autoTap(n);
      if (this.buyNode(n)) { this.autoPhase = 'effect'; this.autoDelay = 1.4; }
      else { this.autoPhase = 'find'; this.autoDelay = 0.2; }
      return;
    }
    this.autoPhase = 'find'; this.autoTarget = null;
    this.autoCursor?.remove(); this.autoCursor = null;
  }
  update(dt: number, wall = dt): void {
    if (!this.active) return;
    S.play += wall;
    this.bg?.update(dt);
    this.tree?.update(dt);
    this.updateAuto(dt);
    /* 트리 칸 튀기·구매 번쩍 같은 트윈이 도는 동안만 다시 그림(가만히 있으면 사무실은 그리지 않음) */
    if (gsapBusy()) requestRender();
    this.hud.update();
    this.tick += dt;
    if (this.tick > 0.5) {
      this.tick = 0;
      this.hud.setAlerts(this.alerts());
    }
  }
}

export function findNode(id: string): TreeNode | undefined {
  return TREE_BY[id];
}
void TREE;
void E;
void owns;
void uiRoot;

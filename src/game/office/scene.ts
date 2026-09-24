/**
 * 사무실(허브): 배경(보라→분홍 하늘·별·스카이라인) + HUD + 가운데 패널(성장 트리·대표·도감·아이템·스킬·설정)
 * + 하단 설명 바 + 좌하단 설정·상권 알약 + 우하단 [영업 나가기].
 */
import { CHAR_BY, DISTRICT_BY, SKILLS, TARGET_BY, TREE, TREE_BY, type DistrictId, type TreeNode } from '../data';
import { music, sfx } from '../deps';
import { fmt, fmtVal } from '../format';
import {
  E, anyNodeBuyable, anySkBuyable, canBuyItem, canBuyMastery, canBuyNode, nodeCost, nodeLinked, owns, refreshEff, repUnlocked, statLevels, STAT_MAX, tlv,
} from '../rules';
import { S, saveGame } from '../state';
import { buyNode as shopBuyNode } from '../shop';
import { TARGETS, ITEMS } from '../data';
import { L, onLayout, uiRoot, view } from '../core/stage';
import { rasterKey } from '../core/tex';
import { districtCut, sparkleAt } from '../fx/top';
import { OfficeBg } from './bg';
import { TreeView } from './tree';
import { OfficeHud, levelInfo, modLine } from '../../ui/hud';
import { Panels, type PanelHooks } from '../../ui/panels';
import { Sheet } from '../../ui/sheet';
import { $, img, tapKey, toast } from '../../ui/dom';
import { confirmBox, districtModal } from '../../ui/modals';
import { screenToFx } from '../core/stage';

export interface OfficeHooks extends Omit<PanelHooks, 'refresh' | 'confirm'> {
  goLunch(): void;
}

const TABS = ['tree', 'reps', 'dex', 'items', 'skills'];

/** 효과 설명의 자리표시(+N · +% · +%p · +초 · N%)를 뺀다 — 값은 뒤에 "현재 → 다음"으로 붙는다 */
function labText(lab: string): string {
  return lab
    .replace(/\s*\+N원/g, '')
    .replace(/\s*\+초/g, '')
    .replace(/\s*\+%p/g, '')
    .replace(/\s*\+%/g, '')
    .replace(/\s*\+N(?![0-9A-Za-z])/g, '')
    .replace(/의 N% 피해/g, ' 비례 피해')
    .replace(/\s{2,}/g, ' ')
    .replace(/ · /g, '·')
    .trim();
}

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
      sfx('ui_tap');
      const li = levelInfo();
      this.sheet.show('ic.level', li.title, li.desc, { extra: `<span class="pz ok">${img('ic.xp')}<small class="hl">경험치 ${fmt(S.xp)}</small></span>` });
      if (this.tab === null) this.openTab('tree');
    };
  }

  enter(): void {
    this.active = true;
    this.hud.root.classList.add('on');
    this.bg = new OfficeBg();
    L.bg.addChild(this.bg.root);
    this.tree = new TreeView({ tap: (n) => this.tapNode(n) });
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
    const bar = (cls: string, icon: string, name: string, v: number, mx: number, col: string) =>
      `<div class="th ${cls}">${img(icon)}<span>${name} Lv ${v}/${mx}</span><div class="thb"><i style="width:${Math.min(100, (v / mx) * 100)}%;background:${col}"></i></div></div>`;
    this.hud.treeHead.innerHTML =
      bar('l', 'ic.sales', '영업력', st.sales, STAT_MAX.sales, 'linear-gradient(90deg,#ffb09a,#ff7b5e)') +
      bar('r', 'ic.tech', '기술력', st.tech, STAT_MAX.tech, 'linear-gradient(90deg,#9fd3ff,#4aa3df)') +
      `<div class="tcenter pe" data-a="center">${img('ic.back')}가운데로</div>`;
    $(this.hud.treeHead, '[data-a="center"]')?.addEventListener('pointerdown', () => {
      sfx('ui_tap');
      this.tree?.center();
    });
  }

  /* ── 트리 칸 ── */
  private nodeDesc(n: TreeNode): { title: string; desc: string } {
    const l = tlv(n.id);
    const title = `${n.name}${n.max > 1 ? ` ${l}/${n.max}` : ''}`;
    const sum = (k: number) => n.vals.slice(0, k).reduce((a, b) => a + b, 0);
    let desc = n.lab;
    const tg = n.tg;
    /* 설명 바는 효과 수치 위주 한 줄(제목에 칸 이름이 있음) */
    if (n.ef === 'tgt') {
      const t = TARGET_BY[String(tg)];
      desc = `새 거래처: ${t.name} (${t.sizeLabel})`;
    } else if (n.ef === 'district') {
      const d = DISTRICT_BY[String(tg)];
      desc = modLine(d.mod);
    } else if (n.ef === 'cap') {
      const c = CHAR_BY[String(tg)];
      desc = c.sk;
    } else if (n.ef === 'sk') {
      const s = SKILLS[String(tg) as keyof typeof SKILLS];
      desc = `새 스킬: ${s.name}`;
    } else if (n.ef === 'chest' || n.ef === 'inquiry') {
      desc = `${n.ef === 'chest' ? '선물 상자' : '인바운드 문의'} ${tg}등급`;
    } else if (n.ef === 'tv') {
      const list = (Array.isArray(tg) ? tg : String(tg).split(',')).map((id) => TARGET_BY[id]?.name).filter(Boolean);
      desc = `${list.join('·')} 계약 가치 ${fmtVal('p', n.ef, sum(l))}${l < n.max ? ` → ${fmtVal('p', n.ef, sum(l + 1))}` : ''}`;
    } else if (n.f !== 'u') {
      const cur = fmtVal(n.f, n.ef, sum(l));
      const nx = l < n.max ? fmtVal(n.f, n.ef, sum(l + 1)) : '';
      const tgName = n.ef === 'cds' || n.ef === 'dbl' ? `${SKILLS[String(tg) as keyof typeof SKILLS]?.name || ''} ` : '';
      desc = `${tgName}${labText(n.lab)} · ${l ? cur : '없음'}${nx ? ` → ${nx}` : ''}`;
    }
    const br = n.br === 'sales' ? '영업력' : n.br === 'tech' ? '기술력' : '공통';
    return { title, desc: `${desc} · ${br}` };
  }
  private showNode(n: TreeNode): void {
    const { title, desc } = this.nodeDesc(n);
    const l = tlv(n.id);
    const icon = n.icon;
    if (l >= n.max) this.sheet.show(icon, title, desc, { state: 'max' });
    else if (!nodeLinked(n)) this.sheet.show(icon, title, desc, { state: 'link', cost: { rev: nodeCost(n), point: 0 } });
    else this.sheet.show(icon, title, desc, { cost: { rev: nodeCost(n), point: 0 } });
    this.sheet.bind(() => this.showNode(n));
  }
  private tapNode(n: TreeNode): void {
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
      void rasterKey(`m.${d.id}.ground@land`, 0.4).then((tex) => {
        districtCut(tex, `${d.name} 오픈!`, d.note, () => this.hud.dist.classList.add('glow'));
      }).catch(() => districtCut(null, `${d.name} 오픈!`, d.note));
      sfx('district_open');
      setTimeout(() => this.hud.dist.classList.remove('glow'), 6000);
    } else if (n.ef === 'tgt') {
      const t = TARGET_BY[tg];
      toast(`새 거래처: ${t.name}`, `t.${t.id}@idle`);
    } else if (n.ef === 'cap') {
      const c = CHAR_BY[tg];
      toast(`${c.name} 영입 가능`, `c.${c.id}@idle`);
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
    this.hud.setAlerts(this.alerts());
    this.tree?.rebuild();
    if (this.tab === 'tree') this.renderTreeHead();
    if (this.sheet.shown) this.sheet.refresh();
  }

  key(k: string): boolean {
    if (k === 'Escape') {
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

  private tick = 0;
  update(dt: number): void {
    if (!this.active) return;
    S.play += dt;
    this.bg?.update(dt);
    this.tree?.update(dt);
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

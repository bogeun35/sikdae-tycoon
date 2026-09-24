/**
 * 사무실 패널(DOM): 영업 대표 · 도감(+거래처 관리) · 아이템 · 스킬(기본 역량 + 스킬판 3×3 십자) · 설정.
 * 성장 트리는 Pixi(TreeView) 가 그리고 여기서는 머리 막대만 얹는다.
 * 조작: 한 번 탭 = 설명 바 / 두 번 탭 = 구매(못 사면 오류음 + 흔들림).
 */
import { CHARS, CHAR_BY, F, ITEMS, ITEM_BY, SKILLS, SKILL_ORDER, TARGETS, TREE, UNLOCK_NODE, VERSION, type SkillId, type TargetDef } from '../game/data';
import { audio, sfx } from '../game/deps';
import { fmt, fmtTime, won } from '../game/format';
import {
  baseCost, baseMaxed, canBuyItem, canBuyMastery, canBuySk, itemCost, itemEffectValue, masteryCost, masteryOpen, payable,
  power, radiusOf, repUnlocked, skCooldown, skCost, skLv, skOpen, skillUnlocked, statLevels, STAT_MAX, targetUnlocked, lunchTime,
} from '../game/rules';
import { S, exportCode, importCode } from '../game/state';
import { assignRep, buyBase, buyItem, buyMastery, buySkill, canBuyBase, hireRep } from '../game/shop';
import { domToFx } from '../game/core/stage';
import { rayCut, sparkleAt, confetti } from '../game/fx/top';
import { $, $$, bindBuy, esc, img, toast } from './dom';
import { Sheet, costTxt } from './sheet';

export interface PanelHooks {
  refresh(): void;
  confirm(title: string, msg: string, okText: string, onOk: () => void, danger?: boolean): void;
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  applySettings(): void;
  resetAll(): void;
}

const TREE_COUNT = TREE.length;
const starCount = (n: number) => F.DEX_STARS.filter((s) => n >= s).length;
const U_LAND = 1.42;

export class Panels {
  tab: string | null = null;
  constructor(readonly body: HTMLElement, readonly sheet: Sheet, readonly hooks: PanelHooks) {}

  render(): void {
    const t = this.tab;
    const scroll = this.body.scrollTop;
    if (t === 'reps') this.reps();
    else if (t === 'dex') this.dex();
    else if (t === 'items') this.items();
    else if (t === 'skills') this.skills();
    else if (t === 'settings') this.settings();
    else this.body.innerHTML = '';
    this.body.scrollTop = scroll;
  }

  private done(el0: HTMLElement | null, star = false): void {
    const p = el0 ? domToFx(el0) : null;
    sparkleAt(p, star ? 16 : 10, star);
    this.hooks.refresh();
  }

  /* ── 영업 대표 ── */
  private reps(): void {
    const cur = CHAR_BY[S.rep] || CHAR_BY.bear;
    this.body.innerHTML =
      `<div class="repTop"><div class="portrait" style="width:86px;height:86px">${img(`c.${cur.id}@idle`, '')}</div><div><b style="font-size:19px;font-weight:normal">${cur.name}</b> <small style="color:var(--brown)">배정 중</small><br><span style="color:var(--brown)">${cur.sk}</span><br><small style="color:#a08a6a">${cur.tip}</small></div></div>` +
      `<h3>영업 대표 ${Object.keys(S.reps).length} / ${CHARS.length}<small>성장 트리에서 채용</small></h3><div class="cards">` +
      CHARS.map((c) => {
        const has = !!S.reps[c.id];
        const can = !has && repUnlocked(c.id);
        const on = c.id === S.rep;
        const cls = has ? (on ? 'on' : '') : can ? 'ok' : 'lock';
        const node = UNLOCK_NODE[c.id];
        const st = has ? (on ? `${img('ic.check')} 배정 중` : '탭해서 배정') : can ? `${img('ic.doubleTap')} 두 번 누르면 영입` : `${img('ic.lock')} 성장 트리: ${node ? node.name : ''}`;
        return `<div class="cd ${cls}" data-c="${c.id}"><div class="art"><div class="portrait" style="width:84px;height:84px">${img(`c.${c.id}@idle`, '')}</div></div><div class="nm">${c.name}</div><div class="ds">${c.sk}</div><div class="cost">${st}</div></div>`;
      }).join('') +
      '</div>';
    for (const e of $$(this.body, '.cd[data-c]')) {
      const c = CHAR_BY[e.dataset.c!];
      const info = () => {
        const has = !!S.reps[c.id];
        const node = UNLOCK_NODE[c.id];
        const extra = has
          ? c.id === S.rep
            ? `<span class="pz ok"><span class="grp">${img('ic.check')} 배정 중</span></span>`
            : `<button class="btn green tw" data-a="assign">이 대표로!</button>`
          : repUnlocked(c.id)
            ? `<span class="pz ok">무료 영입<small class="hl">${img('ic.doubleTap')} 두 번 누르면 영입!</small></span>`
            : `<span class="pz gray"><span class="grp">${img('ic.lock')}<small class="hl">성장 트리: ${node ? node.name : ''}</small></span></span>`;
        this.sheet.show(`c.${c.id}@idle`, c.name, `${c.sk} · ${c.tip}`, { extra });
        const b = $(this.sheet.el, '[data-a="assign"]');
        if (b)
          b.addEventListener('click', () => {
            assignRep(c.id);
            sfx('rep_select');
            toast(`${c.name} 배정!`, 'ic.check');
            this.render();
            this.hooks.refresh();
            info();
          });
      };
      bindBuy(
        e,
        () => !S.reps[c.id] && repUnlocked(c.id),
        () => {
          hireRep(c.id);
          sfx('rep_hire');
          rayCut(`c.${c.id}@cheer`, `${c.name} 영입!`, { sub: c.sk, size: 300 });
          confetti(16, true);
          this.render();
          this.done($(this.body, `.cd[data-c="${c.id}"]`), true);
          info();
        },
        info,
      );
    }
  }

  /* ── 도감 + 거래처 관리 ── */
  private dex(): void {
    const found = TARGETS.filter((t) => S.counts[t.id]).length;
    this.body.innerHTML =
      `<h3>도감 ${found} / ${TARGETS.length}<small>10·100·1,000·1만·10만 곳마다 별</small></h3><div class="cards">` +
      TARGETS.map((t) => this.dexCard(t)).join('') +
      '</div>';
    for (const e of $$(this.body, '.cd[data-t]')) {
      const t = TARGETS.find((x) => x.id === e.dataset.t)!;
      const info = () => this.dexInfo(t);
      bindBuy(
        e,
        () => canBuyMastery(t),
        () => {
          buyMastery(t);
          sfx('mastery_up');
          this.render();
          this.done($(this.body, `.cd[data-t="${t.id}"]`));
          info();
        },
        info,
      );
    }
  }
  private dexCard(t: TargetDef): string {
    const n = S.counts[t.id] || 0;
    const un = targetUnlocked(t);
    const seen = !!S.seen[t.id] || n > 0;
    const st = S.mastery[t.id] || 0;
    const open = masteryOpen(t);
    const max = st >= F.MASTERY.max;
    const can = canBuyMastery(t);
    const cls = !un ? 'lock' : max ? 'max' : can ? 'ok' : !seen ? 'lock' : '';
    const side = t.beh === 'boss' ? 'boss' : t.side;
    const sideLab = t.beh === 'boss' ? '최종' : t.side === 'corp' ? '기업' : '식당';
    const stars = starCount(n);
    const node = UNLOCK_NODE[t.id];
    const nm = seen ? t.name : un ? '???' : t.name;
    const art = seen || !un ? img(`t.${t.id}@idle`, '', !seen ? 'style="filter:brightness(0) opacity(.25)"' : '') : img(`t.${t.id}@idle`, '', 'style="filter:brightness(0) opacity(.25)"');
    const ds = !un ? `성장 트리: ${node ? node.name : ''}` : seen ? `${t.sizeLabel} · ${fmt(n)}곳<br>거래액 ${won(S.gmvBy[t.id] || 0)}` : '아직 못 만났어요';
    const mast = !un ? '' : !open ? `<div class="cost">${img('ic.lock')} Lv.${t.masteryLv} 관리 열림</div>` : max ? `<div class="cost" style="color:var(--purple)">관리 MAX</div>` : `<div class="bar"><i style="width:${st * 10}%"></i></div><div class="cost">관리 ${st}/10 · ${costTxt(masteryCost(t))}</div>`;
    return `<div class="cd ${cls}" data-t="${t.id}"><span class="badge ${side}">${sideLab}</span>${can ? `<span class="okTag">올리기</span>` : ''}<div class="art">${art}</div><div class="nm">${nm}</div><div class="stars">${[0, 1, 2, 3, 4].map((i) => img(i < stars ? 'ic.star' : 'ic.starEmpty')).join('')}</div><div class="ds">${ds}</div>${mast}</div>`;
  }
  private dexInfo(t: TargetDef): void {
    const un = targetUnlocked(t);
    const st = S.mastery[t.id] || 0;
    const node = UNLOCK_NODE[t.id];
    const beh = t.desc;
    if (!un) {
      this.sheet.show(`t.${t.id}@idle`, t.name, beh, { state: 'lock', lockText: `성장 트리: ${node ? node.name : ''}` });
      return;
    }
    const title = `${t.name} 관리 ${st}/10`;
    const desc = `계약 가치 +${st * 5}% → +${(st + 1) * 5}% · ${beh}`;
    if (!masteryOpen(t)) this.sheet.show(`t.${t.id}@idle`, title, desc, { state: 'lock', lockText: `레벨 ${t.masteryLv}부터` });
    else if (st >= F.MASTERY.max) this.sheet.show(`t.${t.id}@idle`, title, desc, { state: 'max' });
    else this.sheet.show(`t.${t.id}@idle`, title, desc, { cost: masteryCost(t), okText: '두 번 누르면 올리기!' });
  }

  /* ── 아이템 ── */
  private items(): void {
    const n = Object.keys(S.items).length;
    this.body.innerHTML =
      `<h3>영업 아이템 ${n} / ${ITEMS.length}<small>계약하면 가끔 떨어져요 · 중복은 대장포인트 +${F.ITEM.dupPoint}</small></h3><div class="cards">` +
      ITEMS.map((it) => {
        const lv = S.items[it.id] || 0;
        const can = canBuyItem(it.id);
        const cls = !lv ? 'lock' : lv >= F.ITEM.max ? 'max' : can ? 'ok' : '';
        const art = lv ? img(`i.${it.id}`, '') : img(`i.${it.id}`, '', 'style="filter:brightness(0) opacity(.2)"');
        return `<div class="cd ${cls}" data-i="${it.id}">${can ? `<span class="okTag">강화</span>` : ''}${lv ? `<span class="badge">Lv ${lv}/10</span>` : ''}<div class="art">${art}</div><div class="nm">${lv ? it.name : '???'}</div><div class="ds">${lv ? `${it.u.replace(/[0-9.]+/, (m) => String(Math.round(parseFloat(m) * lv * 100) / 100))}` : '아직 못 주웠어요'}</div><div class="cost">${!lv ? '' : lv >= F.ITEM.max ? '<span style="color:var(--purple)">MAX</span>' : costTxt(itemCost(it.id))}</div></div>`;
      }).join('') +
      '</div>';
    for (const e of $$(this.body, '.cd[data-i]')) {
      const id = e.dataset.i!;
      const it = ITEM_BY[id];
      const info = () => {
        const lv = S.items[id] || 0;
        if (!lv) {
          this.sheet.show(`i.${id}`, '???', '계약하면 가끔 떨어져요', { state: 'lock', lockText: '미획득' });
          return;
        }
        const now = itemEffectValue(id, lv);
        const nxt = itemEffectValue(id, lv + 1);
        const f = (v: number) => (it.k === 'time' ? `+${Math.round(v * 100) / 100}초` : `+${Math.round(v * 1000) / 10}%`);
        const desc = `${it.u.split(' ')[0]} ${f(now)}${lv < F.ITEM.max ? ` → ${f(nxt)}` : ''}`;
        if (lv >= F.ITEM.max) this.sheet.show(`i.${id}`, `${it.name} ${lv}/10`, desc, { state: 'max' });
        else this.sheet.show(`i.${id}`, `${it.name} ${lv}/10`, desc, { cost: itemCost(id), okText: '두 번 누르면 강화!' });
      };
      bindBuy(
        e,
        () => canBuyItem(id),
        () => {
          buyItem(id);
          sfx('item_up');
          this.render();
          this.done($(this.body, `.cd[data-i="${id}"]`));
          info();
        },
        info,
      );
    }
  }

  /* ── 스킬 ── */
  private skills(): void {
    const P = power();
    const R = radiusOf(U_LAND);
    const bp = baseCost('power');
    const br = baseCost('radius');
    const bpOk = S.revenue >= bp;
    const brMax = baseMaxed('radius');
    const brOk = !brMax && S.revenue >= br;
    this.body.innerHTML =
      `<h3>기본 역량<small>매출로 강화</small></h3><div class="basics">
        <div class="cd ${bpOk ? 'ok' : ''}" data-b="power"><div class="art">${img('ic.basic_power', '')}</div><div><div class="nm">설득력 Lv ${S.base.power}</div><div class="ds">초당 설득 ${fmt(P)} · 레벨당 ×1.08</div><div class="cost">${costTxt({ rev: bp, point: 0 })}</div></div></div>
        <div class="cd ${brMax ? 'max' : brOk ? 'ok' : ''}" data-b="radius"><div class="art">${img('ic.basic_radius', '')}</div><div><div class="nm">영업 반경 Lv ${S.base.radius}</div><div class="ds">반지름 ${Math.round(R)} · 레벨당 ×1.04 (최대 ${F.BASIC.radius.max})</div><div class="cost">${brMax ? 'MAX' : costTxt({ rev: br, point: 0 })}</div></div></div>
      </div>
      <h3>영업 스킬 4종<small>성장 트리에서 해금 · 자동 발동</small></h3><div class="powers">` +
      SKILL_ORDER.map((id) => this.skillPanel(id)).join('') +
      '</div>';
    const infoBase = (k: 'power' | 'radius') => {
      if (k === 'power') this.sheet.show('ic.basic_power', `설득력 Lv ${S.base.power} → ${S.base.power + 1}`, `초당 ${fmt(power())} → ${fmt(power() * F.BASIC.power.mult)}`, { cost: { rev: baseCost('power'), point: 0 } });
      else if (baseMaxed('radius')) this.sheet.show('ic.basic_radius', `영업 반경 Lv ${S.base.radius}`, `반지름 ${Math.round(radiusOf(U_LAND))}`, { state: 'max' });
      else this.sheet.show('ic.basic_radius', `영업 반경 Lv ${S.base.radius} → ${S.base.radius + 1}`, `반지름 ${Math.round(radiusOf(U_LAND))} → ${Math.round(radiusOf(U_LAND) * F.BASIC.radius.mult)}`, { cost: { rev: baseCost('radius'), point: 0 } });
    };
    for (const k of ['power', 'radius'] as const) {
      const e = $(this.body, `.cd[data-b="${k}"]`);
      bindBuy(
        e,
        () => canBuyBase(k),
        () => {
          buyBase(k);
          sfx('skill_up');
          this.render();
          this.done($(this.body, `.cd[data-b="${k}"]`));
          infoBase(k);
        },
        () => infoBase(k),
      );
    }
    for (const e of $$(this.body, '.sk[data-p]')) {
      const id = e.dataset.p as SkillId;
      const i = Number(e.dataset.i);
      const k = SKILLS[id].sk[i];
      const info = () => {
        const lv = skLv(id, i);
        const title = `${k.n} ${lv}/${k.max}`;
        const desc = `${SKILLS[id].name} · ${k.ds}${k.max === 1 ? ' — 특수 스킬' : ''}`;
        if (lv >= k.max) this.sheet.show(`ic.${k.ic}`, title, desc, { state: 'max' });
        else this.sheet.show(`ic.${k.ic}`, title, desc, { cost: skCost(id, i), okText: '두 번 누르면 강화!' });
      };
      bindBuy(
        e,
        () => canBuySk(id, i),
        () => {
          buySkill(id, i);
          sfx('skill_up');
          if (k.max === 1) {
            toast(`특수 스킬 "${k.n}" 획득!`, `ic.${k.ic}`);
            confetti(14, true);
          }
          this.render();
          this.done($(this.body, `.sk[data-p="${id}"][data-i="${i}"]`), k.max === 1);
          info();
        },
        info,
      );
    }
    for (const e of $$(this.body, '.sk.hid')) {
      e.addEventListener('pointerdown', () => {
        sfx('ui_tap');
        this.sheet.show('ic.lock', '???', e.dataset.why || '앞 스킬을 먼저 올리세요', { state: 'lock', lockText: e.dataset.why || '' });
      });
    }
    for (const e of $$(this.body, '.pw.lockd')) {
      e.addEventListener('pointerdown', () => {
        const id = e.dataset.pw as SkillId;
        sfx('ui_tap');
        this.sheet.show(`ic.${SKILLS[id].icon}`, SKILLS[id].name, SKILLS[id].d, { state: 'lock', lockText: `성장 트리: ${SKILLS[id].unlockName}` });
      });
    }
  }
  private skillPanel(id: SkillId): string {
    const p = SKILLS[id];
    const un = skillUnlocked(id);
    const got = p.sk.filter((_k, i) => skLv(id, i) > 0).length;
    if (!un)
      return `<div class="pw lockd" data-pw="${id}"><h4>${img(`ic.${p.icon}`)}${p.name}<small>${img('ic.lock')} 성장 트리: ${p.unlockName}</small></h4><p>${p.d}</p></div>`;
    return (
      `<div class="pw" data-pw="${id}"><h4>${img(`ic.${p.icon}`)}${p.name}<small>스킬 ${got}/5 · 재사용 ${skCooldown(id).toFixed(1)}초</small></h4><p>${p.d}</p><div class="sktree">` +
      p.sk
        .map((k, i) => {
          const lv = skLv(id, i);
          const max = lv >= k.max;
          if (!skOpen(id, i)) {
            const pk = k.need != null ? p.sk[k.need] : null;
            const why = `${pk ? pk.n : '앞 스킬'} ${k.nl || 1}단계`;
            return `<div class="sk ${k.p} hid" data-why="${esc(why)}">${img('ic.lock')}<div class="nm">???</div><div class="c">${why}</div></div>`;
          }
          const c = skCost(id, i);
          return `<div class="sk ${k.p} ${max ? 'maxed' : payable(c) ? 'ok' : ''}" data-p="${id}" data-i="${i}">${k.max === 1 ? '<span class="dot2">특수</span>' : ''}${img(`ic.${k.ic}`)}<div class="nm">${k.n}</div><div class="lv">${lv}/${k.max}</div><div class="c">${max ? 'MAX' : `${fmt(c.rev)} · P${c.point}`}</div></div>`;
        })
        .join('') +
      '</div></div>'
    );
  }

  /* ── 설정 ── */
  private settings(): void {
    const st = statLevels();
    const treeN = Object.keys(S.tree).length;
    const skSum = Object.values(S.sk).reduce((a, b) => a + b, 0);
    const best = S.best ? `${TARGETS.find((t) => t.id === S.best!.id)?.name || ''} ${won(S.best.gmv)}` : '-';
    const rows: [string, string][] = [
      ['마지막 저장', S.savedAt ? new Date(S.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'],
      ['영업일', `${fmt(S.runs)}일`],
      ['가장 큰 계약', best],
      ['누적 식대 거래액', won(S.gmv)],
      ['누적 매출', won(S.revTotal)],
      /* 계약 수 = 고객사 + 제휴점이라 한 줄로 */
      ['계약', `고객사 ${fmt(S.netC)}곳 · 제휴점 ${fmt(S.netR)}곳`],
      ['성장 트리', `${treeN} / ${TREE_COUNT}칸`],
      ['스킬 단계 합', `${skSum}`],
      ['영업력 · 기술력', `Lv ${st.sales}/${STAT_MAX.sales} · Lv ${st.tech}/${STAT_MAX.tech}`],
      ['플레이 시간', fmtTime(S.play)],
    ];
    const v = (k: 'master' | 'music' | 'sfx') => Math.round(audio.getVolume(k) * 100);
    const muted = audio.getVolume('master') <= 0.001;
    const q = S.settings.quality;
    this.body.innerHTML = `
      <h3>${img('ic.record')} 기록</h3><div class="stats">${rows.map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
      <h3>${img('ic.sound')} 소리</h3><div class="sets">
        <div class="ln"><span>전체 음량</span><input type="range" min="0" max="100" value="${v('master')}" data-vol="master"><b data-vv="master">${v('master')}</b></div>
        <div class="ln"><span>배경음</span><input type="range" min="0" max="100" value="${v('music')}" data-vol="music"><b data-vv="music">${v('music')}</b></div>
        <div class="ln"><span>효과음</span><input type="range" min="0" max="100" value="${v('sfx')}" data-vol="sfx"><b data-vv="sfx">${v('sfx')}</b></div>
        <div class="ln"><span>음소거</span><div class="tog ${muted ? 'on' : ''}" data-tog="mute"></div></div>
      </div>
      <h3>${img('ic.fullscreen')} 화면</h3><div class="sets">
        <div class="ln"><span>전체화면</span><div class="tog ${this.hooks.isFullscreen() ? 'on' : ''}" data-tog="fs"></div><small style="color:var(--brown)">F 키</small></div>
        <div class="ln"><span>흔들림 줄이기</span><div class="tog ${S.settings.reduceShake ? 'on' : ''}" data-tog="shake"></div><small style="color:var(--brown)">흔들림 ×0.3 · 번쩍·줌 끔</small></div>
        <div class="ln"><span>숫자 합치기</span><div class="tog ${S.settings.mergeNumbers ? 'on' : ''}" data-tog="merge"></div><small style="color:var(--brown)">가까운 숫자를 하나로</small></div>
        <div class="ln"><span>화질</span><div class="seg"><button data-q="low" class="${q === 'low' ? 'on' : ''}">저</button><button data-q="high" class="${q === 'high' ? 'on' : ''}">고</button></div><small style="color:var(--brown)">저 = 필터·파티클 줄임</small></div>
      </div>
      <h3>${img('ic.save')} 저장</h3><div class="sets">
        <div class="ln" style="color:var(--brown)">자동 저장돼요. 옮기려면 내보내기 → 가져오기.</div>
        <div class="ln"><button class="btn light tw" data-a="export">${img('ic.save')}내보내기</button><button class="btn light tw" data-a="import">${img('ic.load')}가져오기</button><button class="btn red tw" data-a="reset" style="margin-left:auto">${img('ic.reset')}초기화</button></div>
        <textarea class="code" data-v="code" placeholder="저장 코드 붙여넣기"></textarea>
      </div>
      <h3>${img('ic.help')} 어떻게 하나요?</h3><div class="howto">
        <div class="step"><div class="no">1</div><p><b>영업 나가기</b> → ${Math.round(lunchTime())}초 동안 <b>영업 반경</b>을 기업·식당 위에 올려 두세요.</p></div>
        <div class="step"><div class="no">2</div><p><b>설득 게이지</b>가 0이 되면 <b>영업 성공!</b> 오래 두면 사라져요.</p></div>
        <div class="step"><div class="no">3</div><p><b>식대 거래액</b>은 고객사·제휴점이 둘 다 있어야 생겨요. 고르게 계약하면 <b>매칭</b>이 올라가요.</p></div>
        <div class="step"><div class="no">4</div><p><b>매출</b> = 수수료(거래액 10%) + 이용료(기업 규모 5%). 매출로 <b>성장 트리</b>를 사요.</p></div>
        <div class="step"><div class="no">5</div><p>영업력(서쪽)은 상권·대표, 기술력(동쪽)은 새 거래처·<b>영업 스킬</b>. 대장포인트로 스킬·관리·아이템 강화.</p></div>
        <div class="step"><div class="no">6</div><p>트리 끝 <b>전국 식대 플랫폼</b>을 열면 대장그룹 트윈타워가 나타나요.</p></div>
      </div>
      <p style="text-align:center;font-size:12px;color:#a08a6a;margin-top:12px">식권대장 타이쿤 v${VERSION} · 수치는 게임용 가정값</p>`;
    for (const r of $$<HTMLInputElement>(this.body, 'input[data-vol]')) {
      r.addEventListener('input', () => {
        const k = r.dataset.vol as 'master' | 'music' | 'sfx';
        audio.setVolume(k, Number(r.value) / 100);
        const b = $(this.body, `[data-vv="${k}"]`);
        if (b) b.textContent = r.value;
        if (k === 'master') $(this.body, '[data-tog="mute"]')?.classList.toggle('on', Number(r.value) === 0);
      });
      r.addEventListener('change', () => sfx('ui_toggle'));
    }
    let lastMaster = Math.max(0.3, audio.getVolume('master'));
    for (const t of $$(this.body, '.tog')) {
      t.addEventListener('click', () => {
        const k = t.dataset.tog;
        sfx('ui_toggle');
        if (k === 'mute') {
          const on = !t.classList.contains('on');
          if (on) {
            lastMaster = Math.max(0.3, audio.getVolume('master'));
            audio.setVolume('master', 0);
          } else audio.setVolume('master', lastMaster);
          this.render();
          return;
        }
        if (k === 'fs') {
          this.hooks.toggleFullscreen();
          setTimeout(() => this.render(), 300);
          return;
        }
        if (k === 'shake') S.settings.reduceShake = !S.settings.reduceShake;
        if (k === 'merge') S.settings.mergeNumbers = !S.settings.mergeNumbers;
        this.hooks.applySettings();
        this.render();
      });
    }
    for (const b of $$(this.body, '.seg button[data-q]')) {
      b.addEventListener('click', () => {
        S.settings.quality = b.dataset.q as 'high' | 'low';
        sfx('ui_toggle');
        this.hooks.applySettings();
        this.render();
      });
    }
    const code = $<HTMLTextAreaElement>(this.body, '[data-v="code"]')!;
    $(this.body, '[data-a="export"]')?.addEventListener('click', () => {
      const s = exportCode();
      code.value = s;
      code.select();
      try {
        void navigator.clipboard?.writeText(s).then(
          () => toast('저장 코드를 복사했어요', 'ic.save'),
          () => toast('아래 칸의 코드를 복사해 두세요', 'ic.save'),
        );
      } catch {
        toast('아래 칸의 코드를 복사해 두세요', 'ic.save');
      }
    });
    $(this.body, '[data-a="import"]')?.addEventListener('click', () => {
      const s = code.value.trim();
      if (!s) {
        toast('코드를 먼저 붙여넣으세요', 'ic.warn');
        return;
      }
      this.hooks.confirm('가져오기', '지금 진행을 이 코드로 바꿀까요?', '가져오기', () => {
        if (importCode(s)) location.reload();
        else toast('코드가 올바르지 않아요', 'ic.warn');
      });
    });
    $(this.body, '[data-a="reset"]')?.addEventListener('click', () => {
      this.hooks.confirm('처음부터 할까요?', '거래액·매출·트리·도감이 전부 사라져요.', '초기화', () => {
        this.hooks.confirm('정말 지울까요?', '되돌릴 수 없어요.', '전부 지우기', () => this.hooks.resetAll(), true);
      }, true);
    });
  }
}


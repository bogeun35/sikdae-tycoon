/**
 * 하단 설명 바: [아이콘] [제목 / 설명] [가격 + 두 줄]. 가격 자리 상태 5가지(원작 그대로):
 *  살 수 있음 = 초록 "두 번 누르면 구매!" / 돈 부족 = 빨강 "매출 N 부족"(· P N 부족) / 이웃 미보유 = 회색 "연결된 칸 먼저" / 최대 = 보라 "최대" / 잠김 = 회색 조건 문구
 */
import { fmt } from '../game/format';
import { S } from '../game/state';
import { img } from './dom';

export type SheetState = 'buy' | 'max' | 'link' | 'lock' | 'none';
export interface Cost { rev: number; point: number }

export class Sheet {
  constructor(readonly el: HTMLElement) {}
  private cur: (() => void) | null = null;

  show(icon: string, name: string, desc: string, o: { cost?: Cost | null; state?: SheetState; lockText?: string; extra?: string; sub?: string; okText?: string } = {}): void {
    const iconHtml = icon.startsWith('<') ? icon : img(icon, '');
    const own = `<small class="own">보유 매출 ${fmt(S.revenue)} · P ${fmt(S.point)}</small>`;
    let right = o.extra || '';
    const st = o.state || (o.cost ? 'buy' : 'none');
    if (st === 'max') right = `<span class="pz max"><span class="mxl">${img('ic.max', 'mxi')}최대</span>${own}</span>`;
    else if (st === 'link') right = `<span class="pz gray"><span class="grp">${o.cost ? costTxt(o.cost) : ''}</span><small class="hl">연결된 칸 먼저</small>${own}</span>`;
    else if (st === 'lock') right = `<span class="pz gray"><span class="grp">${img('ic.lock')}<small class="hl">${o.lockText || '잠김'}</small></span>${own}</span>`;
    else if (st === 'buy' && o.cost) {
      const c = o.cost;
      const ok = S.revenue >= c.rev && S.point >= c.point;
      const lr = Math.max(0, c.rev - S.revenue);
      const lp = Math.max(0, c.point - S.point);
      const lack = [lr ? `매출 ${fmt(lr)} 부족` : '', lp ? `P ${fmt(lp)} 부족` : ''].filter(Boolean).join(' · ');
      right = `<span class="pz ${ok ? 'ok' : 'no'}"><span class="grp">${costTxt(c)}</span><small class="hl">${ok ? `${img('ic.doubleTap')} ${o.okText || '두 번 누르면 구매!'}` : lack}</small>${own}</span>`;
    }
    this.el.innerHTML = `<div class="sic">${iconHtml}</div><div class="t"><div class="nm">${name}${o.sub ? `<small>${o.sub}</small>` : ''}</div><div class="ds">${desc}</div></div>${right}`;
    this.el.classList.add('show');
  }
  hide(): void {
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    this.cur = null;
  }
  get shown(): boolean {
    return this.el.classList.contains('show');
  }
  /** 다시 그리기용 */
  bind(fn: (() => void) | null): void {
    this.cur = fn;
  }
  refresh(): void {
    this.cur?.();
  }
}

export function costTxt(c: Cost): string {
  /* 아이콘과 숫자가 줄바꿈으로 갈라지지 않게 묶음 */
  return `<span class="nw">${img('ic.revenue')}${fmt(c.rev)}</span>${c.point ? ` <span class="nw">${img('ic.point')}${fmt(c.point)}</span>` : ''}`;
}

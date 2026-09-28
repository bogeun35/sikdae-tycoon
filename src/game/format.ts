/**
 * 한국식 숫자 (참치 타이쿤 fmt 그대로): 1만 미만은 콤마, 그 위는 두 단위까지.
 *   1만 8,500 · 4,200만 · 34억 · 1조 2,300억 · 49억 9,902만
 */
const UNITS = ['', '만', '억', '조', '경', '해', '자', '양', '구'];

const comma = (n: number) => {
  const s = String(Math.floor(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 0) return '-' + fmt(-n);
  n = Math.floor(n);
  if (n < 10000) return comma(n);
  const u = Math.floor(Math.log10(n) / 4);
  if (u >= UNITS.length) return n.toExponential(2).replace('+', '');
  const p = Math.pow(10, u * 4);
  const head = Math.floor(n / p);
  const rest = Math.floor((n % p) / Math.pow(10, (u - 1) * 4));
  if (head >= 1000 || rest === 0) return comma(head) + UNITS[u];
  return head + UNITS[u] + ' ' + comma(rest) + (u >= 2 ? UNITS[u - 1] : '');
}

/** fmt(n) 이 화면에 보여 주는 값(두 단위 아래는 버림). 정산에서 보이는 항목을 더한 값이 합계와 맞게 쓸 때 */
export function shown(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  n = Math.floor(n);
  if (n < 10000) return n;
  const u = Math.floor(Math.log10(n) / 4);
  if (u >= UNITS.length) return n;
  const p = Math.pow(10, u * 4);
  const head = Math.floor(n / p);
  const q = Math.pow(10, (u - 1) * 4);
  const rest = Math.floor((n % p) / q);
  if (head >= 1000 || rest === 0) return head * p;
  return head * p + rest * q;
}

/**
 * 합계용: 아랫단위를 버리지 않고 위에서 세 단위까지 모두(0인 단위는 건너뜀). "1,036억 9,377만" · "1조 2,305억 1,234만".
 * fmt 는 "1,036억" 처럼 천 단위가 넘으면 아랫단위를 버려서, 보이는 항목을 더한 값과 합계가 다르게 보였다.
 */
export function fmtAll(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 0) return '-' + fmtAll(-n);
  n = Math.floor(n);
  if (n < 10000) return comma(n);
  const u = Math.floor(Math.log10(n) / 4);
  if (u >= UNITS.length) return fmt(n);
  const out: string[] = [];
  for (let k = u; k >= Math.max(0, u - 2); k--) {
    const g = Math.floor(n / Math.pow(10, k * 4)) % 10000;
    if (g > 0) out.push(comma(g) + UNITS[k]);
  }
  return out.join(' ');
}

/** 금액: "1만 8,500원" */
export const won = (n: number) => fmt(n) + '원';

/** 트리 칸 값 표기 */
export function fmtVal(f: string, ef: string, v: number): string {
  if (f === 'p') return `+${Math.round(v * 1000) / 10}%`;
  if (f === 'q') return `+${Math.round(v * 100) / 100}%p`;
  if (f === 's') return `${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}초`;
  if (f === 'w') return `+${fmt(v)}원`;
  if (f === 'x') return `+${Math.round(v * 100) / 100}`;
  if (f === 'n') {
    if (ef === 'pflat') return `+${Math.round(v * 100)}%`;
    if (ef === 'crowd' || ef === 'fps' || ef === 'refN') return `+${fmt(v)}곳`;
    return `+${fmt(v)}`;
  }
  return '';
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  return `${m}분`;
}

export function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

/**
 * 좁은 자리(성장 트리 칸 가격표)용: 1만 미만은 콤마, 그 위는 한 단위 + 소수 한 자리(버림).
 *   45억 9,000만 → 45.9억 · 19억 8,000만 → 19.8억 · 1,234만 → 1,234만. 정확한 값은 설명 바(fmt)에.
 *   가격표 왼쪽에 효과 칩이 붙어(v2 설계서 6장) 이웃 칸 가격표와 겹치지 않게 줄인다.
 */
export function fmtShort(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 0) return '-' + fmtShort(-n);
  n = Math.floor(n);
  if (n < 10000) return comma(n);
  const u = Math.floor(Math.log10(n) / 4);
  if (u >= UNITS.length) return fmt(n);
  const v = n / Math.pow(10, u * 4);
  if (v >= 100) return comma(Math.floor(v)) + UNITS[u];
  const d = Math.floor(v * 10 + 1e-9) / 10;
  return (Number.isInteger(d) ? String(d) : d.toFixed(1)) + UNITS[u];
}

/**
 * 저장 상태. 키 = formulas.SAVE_KEY (sikdae_tycoon_v2, storage.ts 가 sikdae-tycoon: 접두어를 붙임).
 * 불러오기 = fresh() 위에 저장본을 깊게 병합. treeVer 가 다르면 옛 트리를 비우고 쓴 매출을 돌려준다.
 * v2(2026-09-24) = 경제 재조정(초반 몇백 원 → 후반 조 단위). 옛 경제(v1) 저장은 키가 달라 읽지 않고 새로 시작하며,
 * 저장 코드 가져오기도 ver 가 다르면 받지 않는다(옛 돈 단위가 섞이지 않게).
 */
import { storage } from '../storage';
import { F, TREE_BY, type DistrictId } from './data';

export interface Settings {
  reduceShake: boolean;
  mergeNumbers: boolean;
  quality: 'high' | 'low';
}

export interface BestDeal { id: string; gmv: number }

export interface SaveState {
  ver: number;
  treeVer: number;
  /** 보유 매출(쓰는 재화) */
  revenue: number;
  /** 누적 거래액 — 절대 줄지 않음 */
  gmv: number;
  /** 누적 매출(번 것 전부) */
  revTotal: number;
  /** 누적 수수료 / 이용료 */
  commTotal: number;
  feeTotal: number;
  point: number;
  xp: number;
  lv: number;
  tree: Record<string, number>;
  /** 옛 트리 비용 합(이관 환불용) */
  treeSpent: number;
  base: { power: number; radius: number };
  /** 스킬 칸 레벨: key = skillId + slotIndex */
  sk: Record<string, number>;
  items: Record<string, number>;
  mastery: Record<string, number>;
  counts: Record<string, number>;
  gmvBy: Record<string, number>;
  seen: Record<string, number>;
  rep: string;
  reps: Record<string, number>;
  district: DistrictId;
  /** 누적 영업일(한 판 = 1영업일, 판 끝에 +1 · 정산 모달 "N영업일이 지났습니다"). 키 sikdae_tycoon_v2 에 그대로 저장 */
  runs: number;
  /** 플레이 시간(초) */
  play: number;
  best: BestDeal | null;
  /** 고객사·제휴점 수 = 누적 계약 수 (기업 / 식당) */
  netC: number;
  netR: number;
  /** 결제 대기(반대편이 0곳일 때) */
  pendG: number;
  pendC: number;
  /** 엔딩 본 판 번호(0 = 아직) */
  ending: number;
  savedAt: number;
  started: number;
  /** 튜토리얼 안내를 본 적 있는지 */
  tutorial: number;
  settings: Settings;
}

export function fresh(): SaveState {
  return {
    ver: F.SAVE.ver,
    treeVer: F.SAVE.treeVer,
    revenue: 0,
    gmv: 0,
    revTotal: 0,
    commTotal: 0,
    feeTotal: 0,
    point: 0,
    xp: 0,
    lv: 1,
    tree: {},
    treeSpent: 0,
    base: { power: 0, radius: 0 },
    sk: {},
    items: {},
    mastery: {},
    counts: {},
    gmvBy: {},
    seen: {},
    rep: 'bear',
    reps: { bear: 1 },
    district: 'euljiro',
    runs: 0,
    play: 0,
    best: null,
    netC: 0,
    netR: 0,
    pendG: 0,
    pendC: 0,
    ending: 0,
    savedAt: 0,
    started: Date.now(),
    tutorial: 0,
    settings: { reduceShake: false, mergeNumbers: true, quality: 'high' },
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
/** base 위에 src 를 깊게 덮어씀(타입이 다른 값은 버림) */
function deepMerge<T>(base: T, src: unknown): T {
  if (!isObj(src) || !isObj(base)) return base;
  const out = base as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const sv = src[k];
    const bv = out[k];
    if (bv === undefined) {
      out[k] = sv;
    } else if (bv === null) {
      out[k] = sv;
    } else if (isObj(bv) && isObj(sv)) {
      out[k] = deepMerge(bv, sv);
    } else if (typeof bv === typeof sv && !isObj(bv)) {
      if (typeof sv === 'number' && !Number.isFinite(sv)) continue;
      out[k] = sv;
    } else if (isObj(bv) && sv === null) {
      /* 기본값 유지 */
    } else if (bv !== null && sv !== null && typeof bv === 'object' && typeof sv === 'object') {
      out[k] = sv;
    }
  }
  return base;
}

export let S: SaveState = fresh();
let migrateToast = '';

export function loadGame(): boolean {
  migrateToast = '';
  const raw = storage.load<unknown>(F.SAVE_KEY, null);
  if (!isObj(raw)) {
    S = fresh();
    return false;
  }
  if ((raw as Record<string, unknown>).ver !== F.SAVE.ver) {
    S = fresh();
    return false;
  }
  const st = deepMerge(fresh(), raw);
  if (st.treeVer !== F.SAVE.treeVer) {
    /* 옛 트리 → 비우고 쓴 매출 전액 환불 */
    const refund = st.treeSpent || 0;
    st.tree = {};
    st.revenue += refund;
    st.treeSpent = 0;
    st.treeVer = F.SAVE.treeVer;
    migrateToast = `성장 트리가 새로 바뀌어 쓴 매출을 돌려드렸어요`;
  }
  /* 사라진 칸 정리 */
  for (const id of Object.keys(st.tree)) if (!TREE_BY[id]) delete st.tree[id];
  if (!st.reps[st.rep]) st.rep = 'bear';
  st.reps.bear = 1;
  S = st;
  return true;
}

export function takeMigrateToast(): string {
  const t = migrateToast;
  migrateToast = '';
  return t;
}

export function hasSave(): boolean {
  const raw = storage.load<unknown>(F.SAVE_KEY, null);
  return isObj(raw) && typeof (raw as Record<string, unknown>).runs === 'number' && (raw as Record<string, unknown>).ver === F.SAVE.ver;
}

export function saveGame(): void {
  S.savedAt = Date.now();
  storage.save(F.SAVE_KEY, S);
}

export function resetGame(): void {
  storage.remove(F.SAVE_KEY);
  S = fresh();
}

export function replaceState(st: SaveState): void {
  S = deepMerge(fresh(), st);
}

export function exportCode(): string {
  const json = JSON.stringify(S);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importCode(code: string): boolean {
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!isObj(v) || typeof v.revenue !== 'number') return false;
    if (v.ver !== F.SAVE.ver) return false;
    S = deepMerge(fresh(), v);
    saveGame();
    return true;
  } catch {
    return false;
  }
}

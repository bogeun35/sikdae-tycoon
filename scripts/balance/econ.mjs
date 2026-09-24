/**
 * 경제 수치 정본 — 대상 가치·트리 비용·공식 상수를 여기(SPEC)에서 정하고 src/data/gdd-data.json 에 써 넣는다.
 * 현재 JSON 값이 아니라 SPEC 에서만 계산하므로 몇 번을 돌려도 결과가 같다.
 *
 *   node scripts/balance/econ.mjs            적용 (gdd-data.json 덮어씀, 들여쓰기 1칸 형식 유지)
 *   node scripts/balance/econ.mjs --dry      적용하지 않고 바뀌는 항목 수만
 *   node scripts/balance/econ.mjs --table    대상 가치·거리별 첫 레벨 비용 표(마크다운)
 *
 * 트리 비용 = 2자리 반올림( C1[거리] × 레벨 배율 LVM × (해금 칸이면 unlockMult) ). 예외는 special(레벨별 값 그대로)·상권 districtCost.
 * 모든 금액 단위는 원. (옛 경제는 "원작 골드 × 260" 이었고 C1·special·districtCost 가 골드 단위였다)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 게임 데이터 정본. SIM_DATA 환경변수로 다른 파일(실험용 복사본)을 가리킬 수 있다 */
export const DATA_FILE = process.env.SIM_DATA || join(HERE, '..', '..', 'src', 'data', 'gdd-data.json');

/** 시뮬 묶음(rolldown)에서 게임 데이터 import 를 SIM_DATA 로 돌리는 플러그인 */
export function dataRedirect() {
  return {
    name: 'sim-data-redirect',
    resolveId(id) {
      if (process.env.SIM_DATA && /gdd-data.json$/.test(id)) return process.env.SIM_DATA;
      return null;
    },
  };
}
/** SIM_DATA 별로 다른 묶음 파일 이름(동시에 돌려도 서로 덮어쓰지 않게) */
export function bundleName(base) {
  if (!process.env.SIM_DATA) return base + '.mjs';
  let h = 0;
  for (const c of process.env.SIM_DATA) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${base}-${(h >>> 0).toString(36)}.mjs`;
}

export const SPEC = {
  /** 대상 1곳 계약 규모(거래액, 원). 매칭·노하우·대박 전 기본값 */
  values: {
    c01: 32, r01: 96, c02: 128, r02: 192,
    c03: 2400, r03: 4000,
    c04: 16000, r04: 36000,
    c05: 80000, r05: 190000,
    r06: 420000, c06: 900000,
    r07: 1800000, c07: 3800000,
    c08: 11000000, r08: 26000000,
    r09: 75000000, c09: 264000000,
    r10: 480000000, c10: 1200000000,
    boss: 1600000000,
  },
  /** 기본 거래액(gflat) 칸 레벨별 값(원) */
  gflat: {
    app: [160, 160, 160],
    base2: [800, 800, 800, 800],
    base3: [10000, 10000, 10000, 10000, 10000],
  },
  tree: {
    /** 거리 d(중앙에서 맨해튼 거리)별 첫 레벨 비용(원) */
    C1: [100, 130, 2800, 19000, 83000, 210000, 530000, 10000000, 67000000, 300000000, 1200000000, 6100000000, 140000000000, 350000000000, 1400000000000, 3500000000000],
    LVM: { 1: [1], 3: [1, 2.5, 6], 4: [1, 2.5, 6, 12], 5: [1, 2.5, 6, 12, 24] },
    unlockMult: 1.2,
    /** 해금 칸(비용 × unlockMult) 효과 종류 */
    unlockEf: ['tgt', 'sk', 'cap', 'chest', 'inquiry', 'wom', 'hot', 'ref'],
    /** 효과 종류별 추가 배수: 센 효과는 비싸게·약한 효과는 싸게(같은 거리 칸이 한꺼번에 사지지 않게), 새 대상 해금 칸은 그 고리를 거의 다 산 뒤에 닿도록 */
    efMult: {
      tgt: 1.5,
      pflat: 1.5, gflat: 1.5, gmv: 1.5, all: 1.5, tv: 1.4, power: 1.4,
      xflat: 0.6, xp: 0.6, point: 0.6, respawn: 0.7, disc: 0.7, cds: 0.7, dbl: 0.7, womC: 0.7, hotC: 0.7, refN: 0.7,
    },
    /** 같은 거리·같은 종류 칸이 같은 값으로 몰리지 않게 칸 id 로 정해지는 고정 흔들림: × e^(spread × (−1 ~ +1)) */
    spread: 0.3,
    districtCost: 130,
    /** 예외 칸: 배열 = 레벨별 비용 그대로(원) / { k } = 보통 공식 비용 × k */
    special: {
      start: [80, 160, 320],
      app: { k: 1.8 },
      f_r07: { k: 1.6 },
      f_c10: { k: 2.4 },
      f_boss: { k: 5.2 },
    },
  },
  /** formulas 안 값 바꾸기: 'A.B.C' = 값 */
  formulas: {
    'ECON.COST_SCALE': 1.3,
    'BASIC.power.growth': 1.25,
    'BASIC.radius.growth': 1.45,
    'ECON.VALUE_SCALE': 1.5,
    'CHEST.revMin': 32,
    'INQUIRY.revMin': 32,
    SAVE_KEY: 'sikdae_tycoon_v2',
    'SAVE.ver': 2,
    'SAVE.treeVer': 2,
  },
  /** fx 안 값 바꾸기 */
  fx: {
    'number.magK': 0.7,
    'number.mag': 'log10(max(1, 거래액 ÷ (VALUE_SCALE 1.5 × 판 배율))) × magK 0.7. 1인 사무실 ≈ 1, 대장그룹 트윈타워 ≈ 6.3(옛 경제 눈금과 같게 맞춤). 판 배율 = 영업 시작 때의 (1 + 트리 gmv + 대표·아이템 gmv + 상권 gmv) — 판 안에서는 고정. 배율을 빼서 대상 규모·노하우·매칭·대박 차이만 남김. 크기 = (base + min(maxAdd, perMag × mag)) × logicalK × (대박 crit) × (보스 boss)',
  },
};

/** 2자리 유효숫자 반올림(100 미만은 정수) */
export function round2(x) {
  if (!(x > 0)) return 0;
  if (x < 100) return Math.max(1, Math.round(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

/** 칸 id → 0~1 고정값(FNV-1a) */
export function idHash(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function treeCosts(n, T = SPEC.tree) {
  const sp = T.special[n.id];
  if (Array.isArray(sp)) return sp.map(round2);
  if (n.ef === 'district') return [round2(T.districtCost)];
  const lvm = T.LVM[n.max] || [1];
  const j = T.spread && n.ef !== 'tgt' ? Math.exp(T.spread * (idHash(n.id) * 2 - 1)) : 1;
  const k = (T.unlockEf.includes(n.ef) ? T.unlockMult : 1) * ((T.efMult || {})[n.ef] || 1) * (sp ? sp.k : 1) * j;
  return lvm.map((m) => round2(T.C1[n.d] * m * k));
}

function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  const last = ks[ks.length - 1];
  const old = o[last];
  o[last] = v;
  return JSON.stringify(old) !== JSON.stringify(v);
}

/** spec 을 JSON 으로 복제(보정 스크립트가 고쳐 쓰는 용도) */
export const cloneSpec = (s = SPEC) => JSON.parse(JSON.stringify(s));

export function apply(D, spec = SPEC) {
  let changed = 0;
  for (const t of D.targets) {
    const v = spec.values[t.id];
    if (v == null) throw new Error('가치 없음: ' + t.id);
    if (t.value !== v) changed++;
    t.value = v;
  }
  for (const n of D.tree) {
    const c = treeCosts(n, spec.tree);
    if (JSON.stringify(c) !== JSON.stringify(n.costs)) changed++;
    n.costs = c;
    if (spec.gflat[n.id]) {
      if (JSON.stringify(n.vals) !== JSON.stringify(spec.gflat[n.id])) changed++;
      n.vals = spec.gflat[n.id].slice();
    }
  }
  const T = D.formulas.TREE;
  for (const k of ['C1', 'LVM', 'unlockMult', 'efMult', 'spread', 'districtCost', 'special']) {
    if (JSON.stringify(T[k]) !== JSON.stringify(spec.tree[k])) changed++;
    T[k] = JSON.parse(JSON.stringify(spec.tree[k]));
  }
  T.unit = '원';
  for (const [p, v] of Object.entries(spec.formulas)) if (setPath(D.formulas, p, v)) changed++;
  for (const [p, v] of Object.entries(spec.fx || {})) if (setPath(D.fx, p, v)) changed++;
  return changed;
}

export function table(D) {
  const L = [];
  const f = (n) => Math.round(n).toLocaleString('ko-KR');
  L.push('| 티어 | 대상 | 가치(원) | 앞 티어 대비 |', '|---|---|---|---|');
  let prev = 0;
  for (const t of D.targets) {
    L.push(`| ${t.tier} | ${t.name} | ${f(t.value)} | ${prev ? '×' + (t.value / prev).toFixed(2) : '-'} |`);
    prev = t.value;
  }
  L.push('', '| 거리 | 첫 레벨 비용(원) | 앞 거리 대비 |', '|---|---|---|');
  const C1 = D.formulas.TREE.C1;
  C1.forEach((c, d) => L.push(`| ${d} | ${f(c)} | ${d ? '×' + (c / C1[d - 1]).toFixed(2) : '-'} |`));
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const D = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const n = apply(D);
  if (process.argv.includes('--table')) console.log(table(D));
  else if (process.argv.includes('--dry')) console.log(`바뀌는 항목 ${n}개 (적용 안 함)`);
  else {
    writeFileSync(DATA_FILE, JSON.stringify(D, null, 1));
    console.log(`gdd-data.json 적용: 바뀐 항목 ${n}개`);
  }
}

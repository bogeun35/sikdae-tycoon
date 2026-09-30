export const STRATEGIES = [
  {id:'sales',name:'영업 중심',icon:'ic.sales',desc:'영업기술 +25% · 현장 계약 속도에 집중',eff:{power:0.25}},
  {id:'tech',name:'기술 중심',icon:'ic.tech',desc:'기술력 획득 +35% · 제품 개발에 집중',eff:{tech:0.35}},
  {id:'business',name:'사업 중심',icon:'ic.revenue',desc:'계약 거래액 +20% · 매출 규모에 집중',eff:{gmv:0.2}},
  {id:'marketing',name:'마케팅 중심',icon:'ic.ef_spawn',desc:'고객서치 +25% · 사업자 체력 −10%',eff:{spawn:0.25,soft:0.1}},
  {id:'users',name:'사용자 성장',icon:'ic.xp',desc:'사용자수 획득 +40% · 레벨 성장에 집중',eff:{xp:0.4}},
] as const;
export type StrategyId = typeof STRATEGIES[number]['id'];

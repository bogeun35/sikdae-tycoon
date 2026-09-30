/** A store encounter signs ten partner locations. Rewards remain per encounter. */
export const STORES_PER_CONTRACT = 10;
export const storeContracts = (locations: number) => locations / STORES_PER_CONTRACT;
/** Regional character stays visible, but network shortages outweigh regional bias. */
export function corpShare(corps: number, stores: number, corpBias = 1, storeBias = 1, autoMatch = 0): number {
  const restaurants = storeContracts(stores);
  const imbalance = (restaurants - corps) / (corps + restaurants + 4);
  const regional = Math.max(-0.08, Math.min(0.08, Math.log(corpBias / storeBias) * 0.08));
  return Math.max(0.2, Math.min(0.8, 0.5 + regional + imbalance * (0.8 + Math.min(0.5, autoMatch))));
}

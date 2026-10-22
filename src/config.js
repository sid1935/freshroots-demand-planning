// Raghav's documented rules, as data. Change numbers here, not in rules.js.
export const CONFIG = {
  spikeThreshold: 0.2, // last 4 wks > 20% above 12-wk avg => high demand
  spikeQtyMultiplier: 1.5,
  recentWeeks: 4,
  baselineWeeks: 12,
  festivalMonths: [10, 11, 3], // Oct, Nov, Mar (1-based)
  festivalUplift: 0.25,
  standard: { minCoverWeeks: 6, maxCoverWeeks: 14 },
  perishable: { minCoverWeeks: 3, maxCoverWeeks: 4 },
  minHistoryWeeks: 12, // below this the SKU is a "new launch" => human judgment
};

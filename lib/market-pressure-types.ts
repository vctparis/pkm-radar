export type PressureVerdictStatus =
  | "collecting"
  | "insufficient_sample"
  | "buyer"
  | "seller"
  | "mixed";

export type PressureFlow = {
  from: string;
  to: string;
  newListings: number;
  exits: number;
  likelyRelists: number;
  adjustedNewListings: number;
  adjustedExits: number;
  quantityComparableListings: number;
  quantityIncreaseUnits: number;
  quantityDecreaseUnits: number;
  knownNewUnits: number;
  knownExitUnits: number;
  knownInflowUnits: number;
  knownOutflowUnits: number;
  listingImbalance: number | null;
  unitImbalance: number | null;
  stockChange: number;
  stockChangePct: number | null;
  floor10ChangePct: number | null;
  medianChangePct: number | null;
  suspectEmptyCrawl: boolean;
};

export type PressureSnapshot = {
  date: string;
  activeListings: number;
  activeUnitsKnown: number;
  listingsWithQuantity: number;
  quantityCoverage: number;
  sellers: number;
  sellerIdentityCoverage: number;
  bestAsk: number | null;
  floor10: number | null;
  medianAsk: number | null;
  depth5Listings: number;
  depth10Listings: number;
  depth10UnitsKnown: number;
  sellerHhi: number | null;
  crawl: {
    captured: number | null;
    totalAvailable: number | null;
    pages: number | null;
    complete: true;
    scope: Record<string, unknown> | null;
  };
  flowFromPrevious?: PressureFlow;
};

export type PressureSourceSeries = {
  source: "ebay" | "cardtrader";
  language: string | null;
  languageScopeMode: "api_scope" | "quote_language" | "target_language" | "fallback_depth" | "unavailable";
  coverage: {
    completeDays: number;
    firstDate: string | null;
    lastDate: string | null;
    minimumDaysForVerdict: number;
    stage: "collecting" | "exploratory" | "established" | "calibrated";
  };
  verdict: {
    status: PressureVerdictStatus;
    label: string;
    confidence: string;
    reason: string;
  };
  latest: PressureSnapshot | null;
  history: PressureSnapshot[];
};

export type MarketPressureSet = {
  id: string;
  name: string;
  era: string;
  jpOnly: boolean;
  sources: {
    ebay: PressureSourceSeries | null;
    cardtrader: PressureSourceSeries | null;
  };
};

export type MarketPressureData = {
  schemaVersion: number;
  modelVersion: string;
  generatedAt: string;
  asOf: string | null;
  subject: "sealed_booster";
  readiness: {
    minimumDaysForVerdict: number;
    completeDaysMax: number;
    seriesReady: number;
    seriesTotal: number;
  };
  methodology: {
    unit: string;
    timezone: string;
    sourcesCombined: false;
    buyerCountAvailable: false;
    exitIsSale: false;
    priceBasis: string;
    sellerPriceWeighting: string;
    flowDefinition: string;
    verdictDefinition: string;
    knownLimitations: string[];
  };
  sources: { id: "ebay" | "cardtrader"; label: string; scope: string }[];
  sets: MarketPressureSet[];
};

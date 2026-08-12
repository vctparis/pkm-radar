export type DropV2Class = {
  rarity: string;
  count: number;
  rateLo: number;
  rateHi: number;
  oneInAny: number;
  oneInSpecific: number;
  premium: boolean;
  baselineContribution: number;
  centralContribution: number;
  quickContribution: number;
};

export type DropV2Card = {
  number: string;
  name: string;
  rarity: string;
  oneIn: number;
  median: number;
  floor10: number;
  offers: number;
  sellers: number;
  latestSeen: string;
  floorIndicative: boolean;
  contribution: number;
};

export type DropV2Conflict = {
  number: string;
  name: string;
  rarity: string;
  anchorGross: number;
  anchorMethod: "opening_reference" | "cards_index_reference" | "reconstructed_from_rounded_share";
  marketMedian: number;
  ratio: number;
  direction: "below" | "above";
  blocking: boolean;
  offers: number;
  sellers: number;
  latestSeen: string;
  ageDays: number;
  sourceOffers: { ebayFR: number; cardTraderFR: number };
};

export type DropV2BoosterHistoryPoint = {
  date: string;
  cardmarketTrend?: number | null;
  cardmarketAvg?: number | null;
  cardmarketLow?: number | null;
  cardmarketSourceCreatedAt?: string | null;
  ebayP10?: number | null;
  ebayMedian?: number | null;
  ebayOffers?: number | null;
  ebaySellers?: number | null;
  ebayTrusted?: number | null;
  ebayReview?: number | null;
  ebayQuarantined?: number | null;
  ebayComplete?: boolean | null;
};

export type DropV2BoosterMarketHistory = {
  windowDays: number;
  from: string;
  to: string;
  observations: DropV2BoosterHistoryPoint[];
  coverage: {
    cardmarketDays: number;
    ebayDays: number;
    bothDays: number;
    firstObserved: string | null;
    lastObserved: string | null;
  };
  doctrine: { cardmarket: string; ebay: string };
};

export type DropV2Set = {
  id: string;
  name: string;
  nameEN: string | null;
  era: string;
  logo: string | null;
  boosterPrice: number;
  grossCentral: number;
  grossQuick: number;
  netCentralLo: number;
  netCentralHi: number;
  netCentralMid: number;
  netQuickLo: number;
  netQuickHi: number;
  netQuickMid: number;
  lossPct: number | null;
  quickLossPct: number | null;
  coverage: number;
  trackedCoverage: number;
  freshnessDays: number;
  confidence: "élevée" | "moyenne" | "faible";
  rateConfidence: string;
  conflicts: number;
  blockingConflicts: number;
  conflictDetails: DropV2Conflict[];
  sample: string | null;
  sampleSource: string | null;
  partialNote: string | null;
  evCoverageTruncated: boolean;
  coverageBreakdown: {
    repriced: number;
    trackedFallbackThin: number;
    trackedFallbackConflict: number;
    trackedFallbackUnavailable: number;
    untracked: number;
  };
  study: {
    trackedCards: number;
    repricedCards: number;
    observedOffers: number;
    sellerCardVoices: number;
    sourceOffers: { ebayFR: number; cardTraderFR: number };
    crawlHealth: {
      available: boolean;
      expected: number;
      complete: number;
      completeZero: number;
      incomplete: number;
      error: number;
      missing: number;
    };
  };
  boosterMarketHistory: DropV2BoosterMarketHistory;
  classes: DropV2Class[];
  cards: DropV2Card[];
};

export type DropV2Data = {
  generatedAt: string;
  modelVersion: string;
  definition: {
    languageDoctrine: string;
    conditions: string[];
    priceGrain: string;
    minimumOffers: number;
    minimumSellers: number;
    maximumAgeDays: number;
    minimumReferenceRatio: number;
    maximumReferenceRatio: number;
    fees: number;
    bulkThreshold: number;
  };
  sets: DropV2Set[];
};

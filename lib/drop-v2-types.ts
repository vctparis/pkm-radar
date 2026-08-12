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
  sample: string | null;
  sampleSource: string | null;
  partialNote: string | null;
  classes: DropV2Class[];
  cards: DropV2Card[];
};

export type DropV2Data = {
  generatedAt: string;
  modelVersion: string;
  definition: {
    conditions: string[];
    priceGrain: string;
    minimumOffers: number;
    minimumSellers: number;
    maximumAgeDays: number;
    fees: number;
    bulkThreshold: number;
  };
  sets: DropV2Set[];
};

export type TrackerReference = {
  source: "cardmarket_guide" | "cardtrader_floor";
  price: number;
  avg30: number | null;
  avg7: number | null;
  avg1: number | null;
  currency: "EUR";
};

/** Entrée de l'index de recherche — volontairement légère (pas d'image,
 *  pas de référence détaillée : elles vivent dans le détail par set). */
export type TrackerCard = {
  id: string;
  nameEN: string;
  nameFR: string | null;
  number: string;
  rarity: string | null;
  setId: string;
  price: number;
  followed: boolean;
};

export type TrackerCardDetail = {
  image: string | null;
  reference: TrackerReference;
};

export type TrackerSet = {
  nameFR: string;
  nameEN: string;
  japanese: boolean;
  aliases: string[];
};

export type TrackerEvidence = {
  title: string | null;
  url: string | null;
  price: number;
  condition: string | null;
  trust: "trusted" | "review";
};

export type TrackerMarketSummary = {
  source: "ebay" | "cardtrader" | "combined";
  priceType: "active_ask";
  /** La langue du set : français, ou japonais si la série n'existe qu'en japonais. */
  language: "fr" | "jp";
  conditionScope: "EX+";
  median: number;
  floor10: number;
  /** L'offre crédible la moins chère : ce qu'on paie réellement. */
  bestAsk?: number;
  offers: number;
  sellers: number;
  trusted: number;
  review: number;
  excluded: number;
  latestSeen: string;
  complete: boolean | null;
  confidence: "élevée" | "moyenne" | "faible";
  evidence: TrackerEvidence[];
};

export type TrackerHistoryPoint = {
  date: string;
  median: number;
  floor10: number;
  offers: number;
  sellers: number;
};

export type TrackerCardmarketGuide = {
  idProduct: number;
  /** Offre la moins chère de leur carnet, toutes conditions et toutes langues. */
  low: number | null;
  trend: number | null;
  avg30: number | null;
  avg7: number | null;
  avg1: number | null;
};

export type TrackerGradedAsk = {
  company: string;
  grade: number;
  priceType: "active_ask";
  bestAsk: number;
  median: number;
  offers: number;
  sellers: number;
  confidence: "élevée" | "moyenne" | "faible";
  evidence: TrackerEvidence[];
};

export type TrackerCardMarket = {
  rawFR: TrackerMarketSummary | null;
  ebayFR: TrackerMarketSummary | null;
  cardTraderFR: TrackerMarketSummary | null;
  /** Repère produit Cardmarket — contrepoint, jamais fusionné aux cotations. */
  cardmarketGuide?: TrackerCardmarketGuide;
  history: TrackerHistoryPoint[];
  /** Demandes gradées relevées sur eBay.fr — clé « PSA:10 », « PCA:9.5 »… */
  gradedAsks?: Record<string, TrackerGradedAsk>;
  grades: Record<string, {
    company: "PSA";
    grade: number;
    soldMedian90: number | null;
    lastSold: number | null;
    sales90: number;
    population: number | null;
    populationHigher: number | null;
    observedAt: string;
    priceSource: string | null;
  }>;
};

export type CardTrackerData = {
  generatedAt: string;
  modelVersion: string;
  definitions: {
    identityGrain: string;
    rawPrice: string;
    history: string;
    grades: string;
  };
  sets: Record<string, TrackerSet>;
  cards: TrackerCard[];
  sources: Array<{
    id: "ebay" | "cardmarket" | "cardtrader" | "tcgplayer" | "leboncoin" | "psa";
    label: string;
    status: "active" | "partial" | "blocked";
    role: string;
    limit: string;
  }>;
};

/** Fichier public/card-tracker/<setId>.json — chargé à la sélection. */
export type TrackerSetDetail = {
  generatedAt: string;
  cards: Record<string, TrackerCardDetail>;
  markets: Record<string, TrackerCardMarket>;
};

export type Segment = {
  cards: number;
  change30: number | null;
  changeMovers: number | null;
  stale: number | null;
  diffusion: number | null;
};

export type Stratum = {
  key: string;
  label: string;
  cards: number;
  growth: number | null;
  basketValue?: number;
  driver: { name: string; number: string; change: number; share: number } | null;
};

export type GrowthPoint = { date: string; sample: number; growth: number; basketValue: number };

export type TierKey = "top1" | "r2_5" | "r6_15" | "r16_50" | "fond";
export type GrowthBundle = Record<TierKey, GrowthPoint[]>;

export type Pick = {
  id: string;
  name: string;
  nameFR?: string | null;
  marketFR?: FRBoosterQuote;
  number: string;
  rarity: string;
  image: string | null;
  price: number;
  momentum30: number | null;
  relativeStrength: number | null;
  sellers: number | null;
  offers: number | null;
  marketFloor: number | null;
  score: number | null;
  components: { relative: number; tightness: number; marketBreadth: number; discount: number } | null;
  url?: string | null;
};

export type SealedQuote = {
  price: number | null;
  floor10?: number | null;
  offers: number;
  quantity: number;
  sellers: number;
  /** Langue effectivement retenue : fr si disponible, sinon jp, en, ou la moins chère. */
  language: string | null;
} | null;

export type FRBoosterQuote = {
  price: number | null;
  priceUrl?: string | null;
  floor10: number | null;
  floor10Url?: string | null;
  median?: number | null;
  offers: number;
  sellers: number;
  matched: number;
  scanned: number;
  /** Plancher toutes annonces éligibles (y compris à risque) — transparence à côté du périmètre retenu. */
  observedFloor?: number | null;
  /** Annonces écartées des métriques (risque d'intégrité élevé). */
  quarantined?: number;
  /** Annonces à signal faible, conservées dans les métriques mais suivies. */
  review?: number;
  /** Annonces sans aucun signal. Retenues (= métriques) = trusted + review. */
  trusted?: number;
  /** La capture a-t-elle couvert tout le résultat annoncé par l'API ? */
  complete?: boolean;
  totalAvailable?: number;
  /** Le p10 est descriptif mais fragile en dessous de 10 annonces retenues. */
  sampleSufficient?: boolean;
  /** Référence d'intégrité disponible ou non pour cette capture. */
  referenceBasis?: "established" | "insufficient";
} | null;

export type BestCard = {
  name: string;
  nameFR?: string | null;
  image?: string | null;
  /** Plancher p10 des annonces françaises (eBay.fr) — le vrai prix FR. */
  priceFR?: number | null;
  offersFR?: number | null;
  number: string;
  rarity: string;
  price: number;
  change30: number | null;
  url: string | null;
} | null;

export type ProvenanceStats = {
  evNet: number;
  p25: number;
  median: number;
  p75: number;
  pRecoup: number;
  pLoseHalf: number;
  pDouble: number;
};

export type BoxOpening = {
  mode: "box";
  packsPerBox: number;
  boosterPrice: number | null;
  confidence: string;
  note: string;
  sample?: string | null;
  sampleSource?: string | null;
  slots: {
    key: string;
    label: string;
    countLo: number;
    countHi: number;
    poolSize: number;
    meanNet: number;
    top: { name: string; number: string; price: number | null }[];
  }[];
};

export type Opening = {
  mode?: "booster";
  distribution?: {
    jackpotNet: number;
    byProvenance: Record<"sealedBox" | "freshBox" | "trustedLoose" | "unknownLoose", ProvenanceStats>;
  } | null;
  boosterPrice: number;
  netLo: number;
  netHi: number;
  ratioLo: number;
  ratioHi: number;
  /** Plancher « lot trié » (premium à zéro). En modèle "independent", égal à netLo/netHi : pas de décote défendable. */
  looseLo: number;
  looseHi: number;
  recoupLo: number;
  recoupHi: number;
  recoupLooseLo?: number;
  recoupLooseHi?: number;
  topPulls: { name: string; nameFR?: string | null; number: string; rarity: string; price: number; oneIn: number; contribution?: number; premium: boolean }[];
  /** Cartes portant 80 % de l'EV — périmètre du ledger et poids du futur EV-weighted Supply Pressure. */
  evCoverage?: { number: string; name: string; rarity: string; share: number }[];
  evCoverageTruncated?: boolean;
  top1: {
    name: string;
    nameFR?: string | null;
    number: string;
    buyPrice: number;
    oneInLo: number;
    oneInHi: number;
    expectedCostLo: number;
    expectedCostHi: number;
    buyPriceFR?: number | null;
    perDisplay: number | null;
  } | null;
  boostersPerDisplay: number | null;
  confidence: string;
  partialNote: string | null;
  /** "mappable" : worst-case « lot trié » crédible (toggle loose affiché) ; "independent" : taux valides en loose, risque non quantifié — mêmes chiffres, note statique. */
  looseModel?: "independent" | "mappable";
} | null;

export type DropRates = {
  classes: {
    rarity: string;
    count: number;
    rateLo: number;
    rateHi: number;
    oneInAny: number;
    oneInSpecific: number;
    median: number;
    mean?: number;
    contribution: number;
    premium: boolean;
  }[];
  grossPerBooster: number;
  confidence: string;
  eraLabel?: string;
  sample?: string | null;
  sampleSource?: string | null;
  partialNote: string | null;
  /** "mappable" : worst-case « lot trié » crédible (toggle loose affiché) ; "independent" : taux valides en loose, risque non quantifié — mêmes chiffres, note statique. */
  looseModel?: "independent" | "mappable";
} | null;

export type SetEntry = {
  id: string;
  name: string;
  nameEN?: string;
  era: string;
  jpOnly?: boolean;
  releaseDate: string | null;
  ageYears: number | null;
  score: number;
  components: { breadth: number; scarcity: number; psaResistance: number; spread: number; maturity: number };
  verdict: string;
  concentration: number | null;
  cardsTracked: number;
  history: {
    points: { date: string; sample: number; momentum: number; diffusion: number }[];
    window: { from: string; to: string } | null;
    path: { label: string; offset: number; value: number }[];
  };
  segments: { chase: Segment; mid: Segment; commons: Segment } | null;
  bestCard: BestCard;
  podium?: NonNullable<BestCard>[];
  boosterFR: FRBoosterQuote;
  opening: Opening | BoxOpening | null;
  dropRates: DropRates;
  logo?: string | null;
  strata: Stratum[];
  growthSeries: { monthly: GrowthBundle; quarterly: GrowthBundle };
  contentValue: GrowthPoint[];
  live: { booster: SealedQuote; boosterBox: SealedQuote; singles: { tracked: number; offers: number } } | null;
  liveHistory: {
    date: string;
    boosterPrice: number;
    boosterOffers: number;
    boosterLanguage?: string | null;
    boxPrice: number | null;
    singlesOffers: number;
    top5Value?: number | null;
    top12ex5Value?: number | null;
    boosterFRp10?: number | null;
    boosterFRmedian?: number | null;
    boosterFRoffers?: number | null;
    boosterFRsellers?: number | null;
  }[];
  psa: { gemRate: number; growth30: number | null; history: { date: string; total: number }[] } | null;
  picks: Pick[];
};

export type RadarData = {
  generatedAt: string;
  sets: SetEntry[];
  sources: { id: string; label: string; role: string; note: string }[];
};

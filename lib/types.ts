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

export type Pick = {
  id: string;
  name: string;
  number: string;
  rarity: string;
  image: string | null;
  price: number;
  momentum30: number;
  relativeStrength: number;
  sellers: number | null;
  offers: number | null;
  marketFloor: number | null;
  score: number;
  components: { relative: number; tightness: number; liquidity: number; discount: number };
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

export type BestCard = {
  name: string;
  number: string;
  rarity: string;
  price: number;
  change30: number | null;
  url: string | null;
} | null;

export type SetEntry = {
  id: string;
  name: string;
  era: string;
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
  segments: { chase: Segment; mid: Segment; commons: Segment };
  bestCard: BestCard;
  strata: Stratum[];
  growthSeries: Record<"mid" | "commons", GrowthPoint[]>;
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
  }[];
  psa: { gemRate: number; growth30: number | null; history: { date: string; total: number }[] } | null;
  picks: Pick[];
};

export type RadarData = {
  generatedAt: string;
  sets: SetEntry[];
  sources: { id: string; label: string; role: string; note: string }[];
};

export interface TcgDexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgDexSet {
  id: string;
  name: string;
  serie?: {
    id?: string;
    name?: string;
  };
}

export interface TcgDexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  hp?: number;
  types?: string[];
  supertype?: string;
  subtypes?: string[];
  trainerType?: string;
  description?: string;
  stage?: string;
  dexId?: number[];
  regulationMark?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  variants?: Record<string, boolean>;
  set?: {
    id: string;
    name: string;
    serie?: {
      id?: string;
      name?: string;
    };
    logo?: string;
    symbol?: string;
    cardCount?: {
      official?: number;
      total?: number;
    };
  };
  attacks?: Array<{
    name?: string;
    effect?: string;
    damage?: string | number;
  }>;
}

const directApiBaseUrl = 'https://api.tcgdex.net/v2/en';
const proxyApiBaseUrl = '/api/tcgdex';
const apiBaseUrl = resolveApiBaseUrl();

function resolveApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_TCGDEX_API_BASE_URL?: string } }).env;
  const configuredUrl = env?.VITE_TCGDEX_API_BASE_URL?.trim();

  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return directApiBaseUrl;
  }

  return proxyApiBaseUrl;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}
let cardsCache: TcgDexCardBrief[] | undefined;
const cardDetailCache = new Map<string, TcgDexCard>();
const setDetailCache = new Map<string, TcgDexSet>();

export async function listCards(): Promise<TcgDexCardBrief[]> {
  if (cardsCache) {
    return cardsCache;
  }

  const response = await fetch(apiBaseUrl + '/cards');

  if (!response.ok) {
    throw new Error('TCGdex no pudo entregar el listado de cartas.');
  }

  cardsCache = await response.json() as TcgDexCardBrief[];
  return cardsCache;
}

export async function getCard(cardId: string): Promise<TcgDexCard> {
  const cached = cardDetailCache.get(cardId);

  if (cached) {
    return cached;
  }

  const response = await fetch(apiBaseUrl + '/cards/' + encodePathSegment(cardId));

  if (!response.ok) {
    throw new Error('TCGdex no encontro la carta ' + cardId + '.');
  }

  const card = await response.json() as TcgDexCard;
  const enrichedCard = await enrichCardSetSerie(card);
  cardDetailCache.set(cardId, enrichedCard);
  return enrichedCard;
}

async function enrichCardSetSerie(card: TcgDexCard): Promise<TcgDexCard> {
  if (!card.set?.id || card.set.serie?.name) {
    return card;
  }

  try {
    const set = await getSet(card.set.id);

    return {
      ...card,
      set: {
        ...card.set,
        serie: set.serie
      }
    };
  } catch {
    return card;
  }
}

async function getSet(setId: string): Promise<TcgDexSet> {
  const cached = setDetailCache.get(setId);

  if (cached) {
    return cached;
  }

  const response = await fetch(apiBaseUrl + '/sets/' + encodePathSegment(setId));

  if (!response.ok) {
    throw new Error('TCGdex no encontro la expansion ' + setId + '.');
  }

  const set = await response.json() as TcgDexSet;
  setDetailCache.set(setId, set);
  return set;
}

function encodePathSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

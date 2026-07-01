export interface TcgDexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
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
  description?: string;
  stage?: string;
  set?: {
    id: string;
    name: string;
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

const apiBaseUrl = 'https://api.tcgdex.net/v2/en';
let cardsCache: TcgDexCardBrief[] | undefined;
const cardDetailCache = new Map<string, TcgDexCard>();

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

  const response = await fetch(apiBaseUrl + '/cards/' + encodeURIComponent(cardId));

  if (!response.ok) {
    throw new Error('TCGdex no encontro la carta ' + cardId + '.');
  }

  const card = await response.json() as TcgDexCard;
  cardDetailCache.set(cardId, card);
  return card;
}

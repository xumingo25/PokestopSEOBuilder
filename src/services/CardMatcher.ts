import type { CardMatch, EnrichedProduct } from '../domain/Product';
import { normalizeCardName, parseCardIdentity, tokenizeCardName } from './CardIdentityParser';
import { getCard, listCards, type TcgDexCard, type TcgDexCardBrief } from './TcgDexApi';

interface RankedBrief {
  card: TcgDexCardBrief;
  score: number;
}

interface RankedCard {
  card: TcgDexCard;
  score: number;
  reasons: string[];
}

export async function findBestCardMatch(product: EnrichedProduct): Promise<{ match: CardMatch; card?: TcgDexCard }> {
  const identity = parseCardIdentity(product.name);

  if (!identity.normalizedName && !identity.localId) {
    return {
      match: createMatch('not_found', 0, 'No se pudo extraer nombre ni numero de carta desde el producto')
    };
  }

  const cards = await listCards();
  const rankedBriefs = cards
    .map((card) => ({ card, score: scoreBrief(card, identity.normalizedName, identity.localId) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (!rankedBriefs.length) {
    return {
      match: createMatch('not_found', 0, 'No hay candidatos para ' + product.name)
    };
  }

  const detailedCards = await Promise.allSettled(rankedBriefs.map((entry) => getCard(entry.card.id)));
  const rankedCards = detailedCards
    .map((result, index): RankedCard | undefined => {
      if (result.status !== 'fulfilled') {
        return undefined;
      }

      return scoreDetailedCard(result.value, rankedBriefs[index], identity.normalizedName, identity.localId, identity.setTotal);
    })
    .filter((entry): entry is RankedCard => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  const best = rankedCards[0];

  if (!best || best.score < 70) {
    return {
      match: createMatch('not_found', best?.score ?? 0, 'Ningun candidato supero el umbral de confianza')
    };
  }

  const second = rankedCards[1];

  if (second && best.score - second.score <= 8) {
    return {
      match: createMatch('ambiguous', best.score, 'Hay mas de una carta posible: ' + best.card.name + ' / ' + second.card.name, best.card)
    };
  }

  return {
    card: best.card,
    match: createMatch('found', best.score, best.reasons.join(', '), best.card)
  };
}

function scoreBrief(card: TcgDexCardBrief, normalizedName: string, localId: string): number {
  const cardName = normalizeCardName(card.name);
  const nameScore = scoreName(cardName, normalizedName);
  const localIdScore = localId && normalizeLocalId(card.localId) === normalizeLocalId(localId) ? 50 : 0;

  if (localId && localIdScore === 0 && nameScore < 35) {
    return 0;
  }

  return localIdScore + nameScore;
}

function scoreDetailedCard(
  card: TcgDexCard,
  brief: RankedBrief,
  normalizedName: string,
  localId: string,
  setTotal?: number
): RankedCard {
  const reasons: string[] = [];
  let score = brief.score;

  if (localId && normalizeLocalId(card.localId) === normalizeLocalId(localId)) {
    reasons.push('numero local coincide');
  }

  const cardName = normalizeCardName(card.name);
  const nameScore = scoreName(cardName, normalizedName);

  if (nameScore < 20) {
    score -= 40;
    reasons.push('nombre debil');
  } else if (nameScore >= 45) {
    reasons.push('nombre coincide');
  }

  if (setTotal && card.set?.cardCount?.official === setTotal) {
    score += 20;
    reasons.push('total oficial del set coincide');
  } else if (setTotal && card.set?.cardCount?.total === setTotal) {
    score += 10;
    reasons.push('total del set coincide');
  }

  return { card, score, reasons };
}

function scoreName(cardName: string, productName: string): number {
  if (!productName) {
    return 0;
  }

  if (cardName === productName) {
    return 45;
  }

  const productTokens = tokenizeCardName(productName);
  const cardTokens = new Set(tokenizeCardName(cardName));

  if (!productTokens.length) {
    return 0;
  }

  const matchedTokens = productTokens.filter((token) => cardTokens.has(token));
  const ratio = matchedTokens.length / productTokens.length;
  const containmentBonus = cardName.includes(productName) || productName.includes(cardName) ? 10 : 0;

  return Math.round(ratio * 35) + containmentBonus;
}

function createMatch(status: CardMatch['status'], confidence: number, reason: string, card?: TcgDexCard): CardMatch {
  return {
    status,
    tcgdexId: card?.id ?? '',
    cardName: card?.name ?? '',
    setName: card?.set?.name ?? '',
    localId: card?.localId ?? '',
    confidence: Math.min(100, Math.max(0, Math.round(confidence))),
    reason
  };
}

function normalizeLocalId(value: string): string {
  return value.trim().toLowerCase().replace(/^0+/, '');
}

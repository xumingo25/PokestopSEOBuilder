import type { CardMatch, EnrichedProduct, ParsedCardIdentity } from '../domain/Product';
import { normalizeCardName, normalizeLocalId, parseCardIdentity, parseLocalId, tokenizeCardName } from './CardIdentityParser';
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
  const identity = buildProductIdentity(product);

  if (!identity.normalizedName && !identity.localId) {
    return {
      match: createMatch('not_found', 0, 'No se pudo extraer nombre ni numero de carta desde el producto')
    };
  }

  const cards = await listCards();
  const rankedBriefs = cards
    .map((card) => ({ card, score: scoreBrief(card, identity) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, identity.localPrefix ? 40 : 16);

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

      return scoreDetailedCard(result.value, rankedBriefs[index], identity);
    })
    .filter((entry): entry is RankedCard => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  const best = rankedCards[0];

  if (!best || best.score < 70) {
    const bestReason = best
      ? 'Ningun candidato supero el umbral de confianza. Mejor candidato: ' + best.card.name + ' [' + best.card.localId + '] con ' + Math.round(best.score) + '%'
      : 'Ningun candidato supero el umbral de confianza. No fue posible cargar el detalle de los candidatos';

    return {
      match: createMatch('not_found', best?.score ?? 0, bestReason, best?.card)
    };
  }

  const second = rankedCards[1];

  if (second && best.score - second.score <= 8) {
    return {
      card: best.card,
      match: createMatch('ambiguous', best.score, 'Hay mas de una carta posible: ' + best.card.name + ' / ' + second.card.name, best.card)
    };
  }

  return {
    card: best.card,
    match: createMatch('found', best.score, best.reasons.join(', '), best.card)
  };
}

function scoreBrief(card: TcgDexCardBrief, identity: ParsedCardIdentity): number {
  const cardName = normalizeCardName(card.name);
  const nameScore = scoreName(cardName, identity.normalizedName);
  const localIdScore = scoreLocalId(card.localId, identity);

  if (identity.localId && localIdScore === 0 && nameScore < 35) {
    return 0;
  }

  return localIdScore + nameScore;
}

function buildProductIdentity(product: EnrichedProduct): ParsedCardIdentity {
  const identity = parseCardIdentity(product.name);
  const productText = normalizeCardName([
    product.name,
    product.category,
    product.tags
  ].filter(Boolean).join(' '));

  if (!productText.includes('celebrations')) {
    return identity;
  }

  return {
    ...identity,
    expansionHints: Array.from(new Set([
      ...identity.expansionHints,
      'celebrations',
      'sword shield',
      'swsh'
    ]))
  };
}

function scoreDetailedCard(card: TcgDexCard, brief: RankedBrief, identity: ParsedCardIdentity): RankedCard {
  const reasons: string[] = [];
  let score = brief.score;
  const localScore = scoreLocalId(card.localId, identity);

  if (localScore >= 70) {
    reasons.push('codigo local exacto coincide');
  } else if (localScore >= 45) {
    reasons.push('numero local coincide');
  }

  const expansionScore = scoreExpansionHint(card, identity);

  if (expansionScore) {
    score += expansionScore;
    reasons.push('expansion/promocional coincide');
  }

  const cardName = normalizeCardName(card.name);
  const nameScore = scoreName(cardName, identity.normalizedName);

  if (nameScore < 20) {
    score -= 40;
    reasons.push('nombre debil');
  } else if (nameScore >= 45) {
    reasons.push('nombre coincide');
  }

  const celebrationsScore = scoreCelebrationsSet(card, identity);

  if (celebrationsScore) {
    score += celebrationsScore;
    reasons.push(celebrationsScore > 0 ? 'celebrations coincide' : 'celebrations no coincide');
  }

  const setTotalScore = scoreSetTotal(card, identity);

  if (setTotalScore) {
    score += setTotalScore;
    reasons.push('tamano de expansion coincide');
  }

  if (isBeyondOfficialCount(card)) {
    score += 8;
    reasons.push('carta fuera del listado oficial del set');
  }

  return { card, score, reasons };
}

function scoreLocalId(cardLocalId: string, identity: ParsedCardIdentity): number {
  if (!identity.localId) {
    return 0;
  }

  const cardNormalized = normalizeLocalId(cardLocalId);
  const cardParts = parseLocalId(cardLocalId);

  if (cardNormalized === identity.localId) {
    return 75;
  }

  if (identity.localPrefix && cardParts.prefix === identity.localPrefix && cardParts.number === identity.localNumber) {
    return 70;
  }

  if (!identity.localPrefix && cardParts.number === identity.localNumber) {
    return 50;
  }

  if (identity.localPrefix && cardParts.number === identity.localNumber) {
    return 45;
  }

  return 0;
}

function scoreCelebrationsSet(card: TcgDexCard, identity: ParsedCardIdentity): number {
  if (!identity.expansionHints.includes('celebrations')) {
    return 0;
  }

  const setText = normalizeCardName([
    card.set?.id ?? '',
    card.set?.name ?? '',
    card.set?.serie?.name ?? ''
  ].join(' '));

  return setText.includes('celebrations') ? 80 : -120;
}

function scoreSetTotal(card: TcgDexCard, identity: ParsedCardIdentity): number {
  if (!identity.setTotal) {
    return 0;
  }

  if (card.set?.cardCount?.official === identity.setTotal) {
    return 20;
  }

  if (card.set?.cardCount?.total === identity.setTotal) {
    return 15;
  }

  return 0;
}

function isBeyondOfficialCount(card: TcgDexCard): boolean {
  const cardNumber = Number(parseLocalId(card.localId).number);
  const officialCount = card.set?.cardCount?.official;
  const totalCount = card.set?.cardCount?.total;

  return Boolean(
    cardNumber
      && officialCount
      && totalCount
      && cardNumber > officialCount
      && cardNumber <= totalCount
  );
}

function scoreExpansionHint(card: TcgDexCard, identity: ParsedCardIdentity): number {
  if (!identity.expansionHints.length) {
    return 0;
  }

  const setText = normalizeCardName([
    card.set?.id ?? '',
    card.set?.name ?? ''
  ].join(' '));

  if (!setText) {
    return 0;
  }

  const matchedHint = identity.expansionHints.find((hint) => setText.includes(hint) || hint.includes(setText));

  if (matchedHint) {
    return 35;
  }

  const setTokens = new Set(tokenizeCardName(setText));
  const bestTokenRatio = Math.max(
    0,
    ...identity.expansionHints.map((hint) => {
      const hintTokens = tokenizeCardName(hint);

      if (!hintTokens.length) {
        return 0;
      }

      return hintTokens.filter((token) => setTokens.has(token)).length / hintTokens.length;
    })
  );

  if (bestTokenRatio >= 0.75) {
    return 25;
  }

  if (bestTokenRatio >= 0.5) {
    return 15;
  }

  return 0;
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

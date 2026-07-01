import type { CardMatch, ProductInput, ProductSuggestion } from '../domain/Product';
import type { TcgDexCard } from './TcgDexApi';

export const pendingCardMatch: CardMatch = {
  status: 'pending',
  tcgdexId: '',
  cardName: '',
  setName: '',
  localId: '',
  confidence: 0,
  reason: 'Sin consulta API'
};

export function buildEmptySuggestion(product: ProductInput): ProductSuggestion {
  return {
    suggestedSeoTitle: '',
    suggestedSeoDescription: '',
    improvedDescriptionHtml: '',
    focusKeyword: buildFocusKeyword(product),
    match: pendingCardMatch
  };
}

export function buildSuggestionFromCard(product: ProductInput, card: TcgDexCard, match: CardMatch): ProductSuggestion {
  return {
    suggestedSeoTitle: buildSeoTitle(card),
    suggestedSeoDescription: buildSeoDescription(card),
    improvedDescriptionHtml: buildImprovedDescription(card),
    focusKeyword: buildFocusKeyword(product),
    match
  };
}

export function buildSuggestionFromMatch(match: CardMatch, product: ProductInput): ProductSuggestion {
  return {
    ...buildEmptySuggestion(product),
    match
  };
}

function buildSeoTitle(card: TcgDexCard): string {
  const setName = card.set?.name ? ' - ' + card.set.name : '';
  return truncate([card.name, card.localId].filter(Boolean).join(' ') + setName + ' | Pokestop', 60);
}

function buildSeoDescription(card: TcgDexCard): string {
  const pieces = [
    card.name,
    card.rarity,
    card.types?.length ? 'tipo ' + card.types.join('/') : '',
    card.set?.name ? 'edicion ' + card.set.name : '',
    card.description
  ].filter(Boolean);

  return truncate(pieces.join('. '), 155);
}

function buildImprovedDescription(card: TcgDexCard): string {
  const rows = [
    ['Edicion', card.set?.name],
    ['Numero', card.localId],
    ['Rareza', card.rarity],
    ['Tipo', card.types?.join(', ')],
    ['Ilustrador', card.illustrator]
  ].filter(([, value]) => Boolean(value));
  const attacks = card.attacks?.filter((attack) => attack.name || attack.effect || attack.damage) ?? [];

  return [
    '<section class="pokemon-card-description">',
    '<h2>' + escapeHtml(card.name) + '</h2>',
    card.description ? '<p>' + escapeHtml(card.description) + '</p>' : '',
    rows.length ? '<ul>' + rows.map(([label, value]) => '<li><strong>' + label + ':</strong> ' + escapeHtml(String(value)) + '</li>').join('') + '</ul>' : '',
    attacks.length ? '<h3>Ataques</h3><ul>' + attacks.map((attack) => '<li><strong>' + escapeHtml(attack.name ?? 'Ataque') + ':</strong> ' + escapeHtml([attack.damage, attack.effect].filter(Boolean).join(' - ')) + '</li>').join('') + '</ul>' : '',
    '</section>'
  ].filter(Boolean).join('');
}

function buildFocusKeyword(product: ProductInput): string {
  return [product.name, product.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const safeText = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;

  return safeText.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  const setLabel = card.set?.name ?? card.set?.id ?? '';
  const setUrl = buildPokestopSetUrl(setLabel);
  const setValue = setUrl
    ? '<a href="' + setUrl + '">' + escapeHtml(setLabel) + '</a>'
    : escapeHtml(setLabel);
  const identityRows: Array<[string, string | undefined, boolean?]> = [
    ['Nombre', card.name],
    ['Expansion', setValue, true],
    ['Numero de carta', card.localId],
    ['Rareza', card.rarity],
    ['Estado', 'NM (Near Mint)']
  ];
  const classificationRows: Array<[string, string | undefined, boolean?]> = [
    ['Supertipo', card.supertype || card.category],
    ['Subtipos', card.subtypes?.join(', ')],
    ['Tipo', card.types?.join(', ')],
    ['Etapa', card.stage],
    ['HP', card.hp ? String(card.hp) : ''],
    ['Pokedex', card.dexId?.join(', ')],
    ['Marca de regulacion', card.regulationMark],
    ['Ilustrador', card.illustrator]
  ];
  const legalRows: Array<[string, string | undefined, boolean?]> = [
    ['Standard', formatBoolean(card.legal?.standard)],
    ['Expanded', formatBoolean(card.legal?.expanded)]
  ];
  const variantRows = Object.entries(card.variants ?? {})
    .filter(([, available]) => available)
    .map(([variant]) => ['Variante', formatLabel(variant)] as [string, string]);
  const attacks = card.attacks?.filter((attack) => attack.name || attack.effect || attack.damage) ?? [];

  return [
    '<section class="pokemon-card-description">',
    '<h2>' + escapeHtml(card.name) + '</h2>',
    '<p><strong>Condicion:</strong> NM (Near Mint).</p>',
    card.description ? '<p>' + escapeHtml(card.description) + '</p>' : '',
    buildDefinitionList('Datos de la carta', identityRows),
    buildDefinitionList('Clasificacion', classificationRows),
    variantRows.length ? buildDefinitionList('Variantes disponibles', variantRows) : '',
    buildDefinitionList('Valido en formato Standard/Expanded', legalRows),
    attacks.length ? '<h3>Ataques</h3><ul>' + attacks.map((attack) => '<li><strong>' + escapeHtml(attack.name ?? 'Ataque') + ':</strong> ' + escapeHtml([attack.damage, attack.effect].filter(Boolean).join(' - ')) + '</li>').join('') + '</ul>' : '',
    '</section>'
  ].filter(Boolean).join('');
}

function buildPokestopSetUrl(setName: string): string {
  const slug = slugifySetName(setName);

  return slug ? 'https://pokestop.cl/singles/' + slug + '/' : '';
}

function slugifySetName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDefinitionList(title: string, rows: Array<[string, string | undefined, boolean?]>): string {
  const items = rows
    .filter(([, value]) => Boolean(value))
    .map(([label, value, isHtml]) => '<li><strong>' + escapeHtml(label) + ':</strong> ' + (isHtml ? value : escapeHtml(String(value))) + '</li>')
    .join('');

  return items ? '<h3>' + escapeHtml(title) + '</h3><ul>' + items + '</ul>' : '';
}

function formatBoolean(value?: boolean): string {
  if (value === undefined) {
    return '';
  }

  return value ? 'Legal' : 'No legal';
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
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

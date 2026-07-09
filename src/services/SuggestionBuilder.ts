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
    suggestedCategories: [],
    focusKeyword: buildFocusKeyword(product),
    match: pendingCardMatch
  };
}

export function buildSuggestionFromCard(product: ProductInput, card: TcgDexCard, match: CardMatch): ProductSuggestion {
  return {
    suggestedSeoTitle: buildSeoTitle(card),
    suggestedSeoDescription: buildSeoDescription(card),
    improvedDescriptionHtml: buildImprovedDescription(card),
    suggestedCategories: buildSuggestedCategories(card),
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
  return [
    '<section class="pokemon-card-description" style="max-width: 720px;">',

    buildInfoTable(card),
    '</section>'
  ].filter(Boolean).join('');
}

function buildInfoTable(card: TcgDexCard): string {
  const rows: Array<[string, string | undefined, boolean?]> = [
    ['Expansión', buildExpansionValue(card), true],
    ['Numero de carta', card.localId],
    ['Rareza', buildRarityValue(card), true],
    [buildHelpLabel('Estado', 'https://pokestop.cl/estado-de-las-cartas', 'Ver mas sobre estados de las cartas'), 'NM (Near Mint)', true],
    ['Supertipo', card.supertype || card.category],
    ['Subtipos', buildSubtypeValue(card), true],
    ['Tipo', card.types?.join(', ')],
    ['Etapa', card.stage],
    ['HP', card.hp ? String(card.hp) : ''],
    ['Pokedex', buildPokedexValue(card), true],
    [buildHelpLabel('Marca de regulacion', 'https://pokestop.cl/regulacion-cartas', 'Ver mas sobre la regulacion de las cartas'), card.regulationMark, true],
    ['Ilustrador', card.illustrator],
    ...buildVariantRows(card)
  ];

  return buildTable(card.name, 'Datos de la carta', rows);
}

function buildExpansionValue(card: TcgDexCard): string {
  const setLabel = card.set?.name ?? card.set?.id ?? '';
  const setUrl = buildPokestopSetUrl(card);

  return setUrl
    ? buildCategoryLink(setUrl, setLabel)
    : escapeHtml(setLabel);
}

function buildRarityValue(card: TcgDexCard): string {
  const rarity = normalizeKnownRarity(card.rarity ?? '');
  const label = card.rarity || rarity;
  const url = rarity && !isPromoCard(card) ? 'https://pokestop.cl/singles/rareza/' + slugifySetName(rarity) + '/' : '';

  return url
    ? buildCategoryLink(url, label)
    : escapeHtml(label);
}

function buildSubtypeValue(card: TcgDexCard): string {
  const subtypes = card.subtypes ?? [];
  const normalizedSubtypes = subtypes.map(normalizeText);

  if (!isTrainerCard(card, normalizedSubtypes)) {
    return escapeHtml(subtypes.join(', '));
  }

  const trainerCategory = findTrainerCategory(normalizedSubtypes, card);

  if (!trainerCategory) {
    return escapeHtml(subtypes.join(', '));
  }

  return buildCategoryLink('https://pokestop.cl/singles/tipo-de-carta/trainers/' + trainerCategory.slug + '/', trainerCategory.label);
}

function buildPokedexValue(card: TcgDexCard): string {
  if (isTagTeamCard(card) || isMegaEvolutionCard(card)) {
    return '';
  }

  return (card.dexId ?? [])
    .map((dexId) => {
      const region = getPokedexRegion(dexId);
      const label = String(dexId) + ' (' + region + ')';
      const url = 'https://pokestop.cl/singles/pokedex/' + slugifySetName(region) + '/';

      return buildCategoryLink(url, label);
    })
    .join(', ');
}

function buildVariantRows(card: TcgDexCard): Array<[string, string]> {
  return Object.entries(card.variants ?? {})
    .filter(([, available]) => available)
    .map(([variant]) => ['Variante', formatLabel(variant)]);
}

function buildPokestopSetUrl(card: TcgDexCard): string {
  const setName = card.set?.name ?? card.set?.id ?? '';
  const editionName = inferEditionName(card);
  const setSlug = slugifySetName(setName);
  const editionSlug = slugifySetName(editionName);

  return setSlug && editionSlug
    ? 'https://pokestop.cl/singles/ediciones/' + editionSlug + '/' + setSlug + '/'
    : '';
}

function buildSuggestedCategories(card: TcgDexCard): string[] {
  return uniqueValues([
    buildEditionCategory(card),
    buildRarityCategory(card),
    ...buildCardTypeCategories(card),
    ...buildPokedexCategories(card)
  ]);
}

function buildEditionCategory(card: TcgDexCard): string {
  const setName = card.set?.name?.trim();

  if (!setName) {
    return '';
  }

  const editionName = inferEditionName(card);

  return editionName
    ? 'Singles > Ediciones > ' + editionName + ' > ' + setName
    : 'Singles > Ediciones > ' + setName;
}

function buildRarityCategory(card: TcgDexCard): string {
  if (isPromoCard(card)) {
    return '';
  }

  const rarity = normalizeKnownRarity(card.rarity ?? '');

  return rarity ? 'Singles > Rareza > ' + rarity : '';
}

function buildCardTypeCategories(card: TcgDexCard): string[] {
  const supertype = normalizeText(card.supertype || card.category || '');
  const subtypes = card.subtypes ?? [];
  const normalizedSubtypes = subtypes.map(normalizeText);
  const categories: string[] = [];

  if (supertype.includes('pokemon')) {
    categories.push('Singles > Tipo de Carta > Pokémon');

    const pokemonSubtype = findPokemonSubtype(normalizedSubtypes, card);

    if (pokemonSubtype) {
      categories.push('Singles > Tipo de Carta > Pokémon > ' + pokemonSubtype);
    }
  } else if (isTrainerCard(card, normalizedSubtypes)) {
    const trainerCategory = findTrainerCategory(normalizedSubtypes, card);
    categories.push('Singles > Tipo de Carta > Trainers' + (trainerCategory ? ' > ' + trainerCategory.label : ''));
  } else if (supertype.includes('energy') || normalizedSubtypes.includes('energy')) {
    categories.push('Singles > Tipo de Carta > Energias');
  }

  return categories;
}

function buildPokedexCategories(card: TcgDexCard): string[] {
  if (isTagTeamCard(card)) {
    return [];
  }

  return uniqueValues((card.dexId ?? [])
    .map(getPokedexRegion)
    .filter(Boolean)
    .map((region) => 'Singles > Pokédex > ' + region));
}

function inferEditionName(card: TcgDexCard): string {
  const serieName = card.set?.serie?.name?.trim();

  if (serieName) {
    return serieName;
  }

  const setId = normalizeText(card.set?.id ?? '');
  const setName = normalizeText(card.set?.name ?? '');
  const combined = [setId, setName].join(' ');

  if (combined.includes('mega evolution') || /^me/.test(setId)) {
    return 'Mega Evolution';
  }

  if (combined.includes('scarlet') || /^sv/.test(setId)) {
    return 'Scarlet & Violet';
  }

  if (combined.includes('sword') || /^swsh/.test(setId)) {
    return 'Sword & Shield';
  }

  if (combined.includes('sun') || /^sm/.test(setId)) {
    return 'Sun & Moon';
  }

  if (/^xy/.test(setId)) {
    return 'XY';
  }

  if (combined.includes('black') || /^bw/.test(setId)) {
    return 'Black & White';
  }

  return '';
}

function isPromoCard(card: TcgDexCard): boolean {
  const values = [
    card.localId,
    card.id,
    card.set?.id,
    card.set?.name,
    card.set?.serie?.name,
    card.rarity
  ].map((value) => normalizeText(value ?? ''));

  return values.some((value) => value.includes('promo') || /^(svp|mep|swsh|sm|xy|bw)\d+/.test(value));
}

function normalizeKnownRarity(value: string): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    return '';
  }

  const rules: Array<[string, string]> = [
    ['special illustration rare', 'Special Illustration Rare'],
    ['illustration rare', 'Illustration Rare'],
    ['full art', 'Full Art'],
    ['ultra rare', 'Ultra Rare'],
    ['secret rare', 'Secret Rare'],
    ['hyper rare', 'Hyper Rare'],
    ['double rare', 'Double Rare'],
    ['rare holo', 'Rare Holo'],
    ['amazing rare', 'Amazing Rare'],
    ['radiant rare', 'Radiant Rare'],
    ['common', 'Common'],
    ['uncommon', 'Uncommon'],
    ['rare', 'Rare']
  ];
  const match = rules.find(([needle]) => normalized.includes(needle));

  return match?.[1] ?? formatLabel(value);
}

function findPokemonSubtype(normalizedSubtypes: string[], card?: TcgDexCard): string {
  const subtypeLabels: Array<[string, string]> = [
    ['vmax', 'VMAX'],
    ['vstar', 'VSTAR'],
    ['v union', 'V-UNION'],
    ['ex', 'EX'],
    ['mega', 'Mega'],
    ['gx', 'GX'],
    ['tag team', 'Tag Team'],
    ['break', 'BREAK'],
    ['legend', 'LEGEND'],
    ['v', 'V']
  ];
  const subtypeMatch = subtypeLabels.find(([needle]) => normalizedSubtypes.includes(needle));

  if (subtypeMatch) {
    return subtypeMatch[1];
  }

  return card ? inferPokemonSubtypeFromName(card.name) : '';
}

function inferPokemonSubtypeFromName(name: string): string {
  const normalizedName = normalizeText(name);
  const suffixes: Array<[RegExp, string]> = [
    [/(^| )vmax$/, 'VMAX'],
    [/(^| )vstar$/, 'VSTAR'],
    [/(^| )ex$/, 'EX'],
    [/(^| )gx$/, 'GX'],
    [/(^| )v$/, 'V']
  ];
  const match = suffixes.find(([pattern]) => pattern.test(normalizedName));

  return match?.[1] ?? '';
}

function isTagTeamCard(card: TcgDexCard): boolean {
  const rawName = card.name.toLowerCase();
  const normalizedName = normalizeText(card.name);
  const normalizedSubtypes = (card.subtypes ?? []).map(normalizeText);

  return normalizedName.includes('tag team')
    || rawName.includes('&')
    || normalizedName.includes(' and ')
    || normalizedSubtypes.includes('tag team');
}

function isMegaEvolutionCard(card: TcgDexCard): boolean {
  const normalizedName = normalizeText(card.name);
  const normalizedSubtypes = (card.subtypes ?? []).map(normalizeText);

  return normalizedName.includes('mega') || normalizedSubtypes.includes('mega');
}

function isTrainerSubtype(subtype: string): boolean {
  return ['item', 'tool', 'pokemon tool', 'supporter', 'stadium', 'pokeball', 'poke ball'].includes(subtype);
}

function isTrainerCard(card: TcgDexCard, normalizedSubtypes = (card.subtypes ?? []).map(normalizeText)): boolean {
  const supertype = normalizeText(card.supertype || card.category || '');

  return supertype.includes('trainer') || normalizedSubtypes.some(isTrainerSubtype);
}

function findTrainerCategory(normalizedSubtypes: string[], card?: TcgDexCard): { label: string; slug: string } | undefined {
  const normalizedName = normalizeText(card?.name ?? '');

  if (normalizedSubtypes.some((subtype) => subtype.includes('tool'))) {
    return { label: 'Tools', slug: 'tools' };
  }

  if (normalizedSubtypes.some((subtype) => subtype.includes('supporter'))) {
    return { label: 'Supporters', slug: 'supporters' };
  }

  if (normalizedSubtypes.some((subtype) => subtype.includes('stadium'))) {
    return { label: 'Estadios', slug: 'estadios' };
  }

  if (normalizedSubtypes.some((subtype) => subtype.includes('pokeball') || subtype.includes('poke ball')) || normalizedName.includes('poke ball') || normalizedName.includes('pokeball')) {
    return { label: 'Pokeballs', slug: 'pokeballs' };
  }

  if (normalizedSubtypes.some((subtype) => subtype.includes('item'))) {
    return { label: 'Items', slug: 'items' };
  }

  return undefined;
}

function getPokedexRegion(dexId: number): string {
  if (dexId >= 1 && dexId <= 151) {
    return 'Kanto';
  }

  if (dexId <= 251) {
    return 'Johto';
  }

  if (dexId <= 386) {
    return 'Hoenn';
  }

  if (dexId <= 493) {
    return 'Sinnoh';
  }

  if (dexId <= 649) {
    return 'Unova';
  }

  if (dexId <= 721) {
    return 'Kalos';
  }

  if (dexId <= 809) {
    return 'Alola';
  }

  if (dexId <= 905) {
    return 'Galar';
  }

  return 'Paldea';
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

function buildTable(cardName: string, subtitle: string, rows: Array<[string, string | undefined, boolean?]>): string {
  const items = rows
    .filter(([, value]) => Boolean(value))
    .map(([label, value, isHtml]) => [
      '<tr>',
      '<th scope="row" style="width: 38%; padding: 12px 14px; border: 1px solid #d8d8d8; background: #fff7f7; color: #353535; text-align: left; vertical-align: top; font-weight: 800;">' + (isHtml ? label : escapeHtml(label)) + '</th>',
      '<td style="padding: 12px 14px; border: 1px solid #d8d8d8; background: #ffffff; color: #222222; text-align: left; vertical-align: top;">' + (isHtml ? value : escapeHtml(String(value))) + '</td>',
      '</tr>'
    ].join(''))
    .join('');

  return items
    ? [
      '<div style="border: 3px solid #111111; border-radius: 12px; overflow: hidden; margin: 14px 0 24px; background: #fffafa; box-shadow: 0 4px 0 #111111;">',
      '<div style="padding: 16px 18px; background: #d62828; color: #ffffff; text-align: left; border-bottom: 3px solid #111111;">',
      '<div style="display: table; width: 100%;">',
      '<div style="display: table-cell; vertical-align: middle;">',
      '<h2 style="margin: 0 0 5px; color: #ffffff; font-size: 24px; line-height: 1.25;">' + escapeHtml(cardName) + '</h2>',
      '<h3 style="margin: 0; color: #ffe5e5; font-size: 18px; line-height: 1.3;">' + escapeHtml(subtitle) + '</h3>',
      '</div>',
      '<div style="display: table-cell; width: 156px; text-align: right; vertical-align: middle; white-space: nowrap;">',
      '<span style="display: inline-block; width: 46px; height: 46px; margin-left: 6px; border: 3px solid #111111; border-radius: 50%; background: #45b7ff; box-shadow: inset 0 0 0 7px #b9ecff; vertical-align: middle;"></span>',
      '<span style="display: inline-block; width: 16px; height: 16px; margin-left: 8px; border: 2px solid #111111; border-radius: 50%; background: #ff3b30; vertical-align: middle;"></span>',
      '<span style="display: inline-block; width: 16px; height: 16px; margin-left: 6px; border: 2px solid #111111; border-radius: 50%; vertical-align: middle; background: #ffd23f;"></span>',
      '<span style="display: inline-block; width: 16px; height: 16px; margin-left: 6px; border: 2px solid #111111; border-radius: 50%; vertical-align: middle; background: #2fbf71;"></span>',
      '</div>',
      '</div>',
      '</div>',
      '<div style="padding: 10px; background: #f2f2f2;">',
      '<table style="width: 100%; border-collapse: collapse; text-align: left; background: #ffffff;"><tbody>' + items + '</tbody></table>',
      '</div>',
      '</div>'
    ].join('')
    : '';
}

function buildCategoryLink(url: string, label: string): string {
  return '<a href="' + url + '" style="color: #0f6f63; font-weight: 700; text-decoration: underline; text-underline-offset: 3px;">' + escapeHtml(label) + '</a>';
}

function buildHelpLabel(label: string, url: string, title: string): string {
  return escapeHtml(label) + ' <a href="' + url + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '" style="display: inline-block; margin-left: 5px; color: #0f6f63; font-weight: 800; text-decoration: none;">(?)</a>';
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

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeText(value);

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
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

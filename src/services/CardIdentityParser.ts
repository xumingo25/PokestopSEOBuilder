import type { ParsedCardIdentity } from '../domain/Product';

const ignoredNameTokens = new Set([
  'pokemon',
  'tcg',
  'carta',
  'card',
  'ingles',
  'english',
  'japones',
  'japanese',
  'holo',
  'foil',
  'reverse',
  'rare',
  'ultra',
  'secret',
  'promo'
]);

export function parseCardIdentity(productName: string): ParsedCardIdentity {
  const bracketMatch = productName.match(/\[\s*([^\]/]+?)\s*(?:\/\s*([^\]]+?))?\s*\]/);
  const rawLocalId = extractLocalId(bracketMatch?.[1] ?? '');
  const rawName = productName.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedName = normalizeCardName(rawName);
  const localParts = parseLocalId(rawLocalId);
  const totalNumber = extractLocalId(bracketMatch?.[2] ?? '').match(/\d+/)?.[0];

  return {
    rawName,
    normalizedName,
    localId: normalizeLocalId(rawLocalId),
    localNumber: localParts.number,
    localPrefix: localParts.prefix,
    expansionHints: buildExpansionHints(localParts.prefix, productName),
    setTotal: totalNumber ? Number(totalNumber) : undefined
  };
}

export function normalizeCardName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !ignoredNameTokens.has(token))
    .join(' ')
    .trim();
}

export function normalizeLocalId(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '');
}

function extractLocalId(value: string): string {
  const compactValue = normalizeLocalId(value);
  const directMatch = compactValue.match(/[a-z]*\d+[a-z0-9]*/);

  if (directMatch) {
    return directMatch[0];
  }

  return compactValue;
}

function buildExpansionHints(prefix: string, productName: string): string[] {
  const normalizedName = normalizeCardName(productName);
  const hintsByPrefix: Record<string, string[]> = {
    cel: ['celebrations', 'classic collection', 'sword shield', 'cel25'],
    cel25: ['celebrations', 'classic collection', 'sword shield', 'cel25'],
    gg: ['galarian gallery', 'sword shield', 'crown zenith', 'swsh'],
    tg: ['trainer gallery', 'sword shield', 'brilliant stars', 'astral radiance', 'lost origin', 'silver tempest', 'swsh'],
    svp: ['scarlet violet promo', 'scarlet violet promos', 'scarlet violet', 'svp'],
    swsh: ['sword shield promo', 'sword shield promos', 'sword shield', 'swsh'],
    mep: ['mega evolution promo', 'mega evolution promos', 'mega evolution', 'mep'],
    sm: ['sun moon promo', 'sun moon promos', 'sun moon', 'sm'],
    xy: ['xy promo', 'xy promos', 'xy'],
    bw: ['black white promo', 'black white promos', 'black white', 'bw'],
    dp: ['diamond pearl promo', 'diamond pearl promos', 'diamond pearl', 'dp'],
    hgss: ['heartgold soulsilver promo', 'heartgold soulsilver promos', 'heartgold soulsilver', 'hgss']
  };
  const normalizedPrefix = prefix.toLowerCase();
  const hints = [...(hintsByPrefix[normalizedPrefix] ?? [])];

  if (normalizedName.includes('galarian gallery')) {
    hints.push('galarian gallery', 'sword shield', 'crown zenith');
  }

  if (normalizedName.includes('trainer gallery')) {
    hints.push('trainer gallery', 'sword shield');
  }

  if (hasCelebrationsSignal(normalizedName)) {
    hints.push('celebrations', 'classic collection', 'sword shield', 'cel25');
  }

  if (normalizedName.includes('mega evolution')) {
    hints.push('mega evolution promo', 'mega evolution');
  }

  if (normalizedName.includes('scarlet violet')) {
    hints.push('scarlet violet promo', 'scarlet violet');
  }

  if (normalizedName.includes('sword shield')) {
    hints.push('sword shield promo', 'sword shield');
  }

  if (normalizedName.includes('sun moon')) {
    hints.push('sun moon promo', 'sun moon');
  }

  if (normalizedName.includes('black white')) {
    hints.push('black white promo', 'black white');
  }

  if (normalizedName.includes('diamond pearl')) {
    hints.push('diamond pearl promo', 'diamond pearl');
  }

  if (normalizedName.includes('heartgold soulsilver')) {
    hints.push('heartgold soulsilver promo', 'heartgold soulsilver');
  }

  return Array.from(new Set(hints.map(normalizeCardName).filter(Boolean)));
}

export function parseLocalId(value: string): { prefix: string; number: string } {
  const normalized = normalizeLocalId(value);
  const match = normalized.match(/^([a-z]*)(\d+)([a-z0-9]*)$/);

  if (!match) {
    return { prefix: '', number: normalized.replace(/^0+/, '') };
  }

  return {
    prefix: match[1] + match[3],
    number: match[2].replace(/^0+/, '') || '0'
  };
}

function hasCelebrationsSignal(value: string): boolean {
  return value.includes('celebrations')
    || value.includes('celebration')
    || value.includes('classic collection')
    || value.includes('cel25')
    || value.split(' ').includes('ccc');
}

export function tokenizeCardName(value: string): string[] {
  return normalizeCardName(value).split(' ').filter(Boolean);
}

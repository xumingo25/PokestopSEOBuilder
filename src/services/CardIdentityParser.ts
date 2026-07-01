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
  const directMatch = compactValue.match(/[a-z]*\d+[a-z]*/);

  if (directMatch) {
    return directMatch[0];
  }

  return compactValue;
}

export function parseLocalId(value: string): { prefix: string; number: string } {
  const normalized = normalizeLocalId(value);
  const match = normalized.match(/^([a-z]*)(\d+)([a-z]*)$/);

  if (!match) {
    return { prefix: '', number: normalized.replace(/^0+/, '') };
  }

  return {
    prefix: match[1] + match[3],
    number: match[2].replace(/^0+/, '') || '0'
  };
}

export function tokenizeCardName(value: string): string[] {
  return normalizeCardName(value).split(' ').filter(Boolean);
}

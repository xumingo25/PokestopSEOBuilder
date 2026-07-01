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
  const bracketMatch = productName.match(/\[\s*([A-Za-z]*\d+[A-Za-z]*)\s*(?:\/\s*(\d+))?\s*\]/);
  const rawName = productName.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedName = normalizeCardName(rawName);

  return {
    rawName,
    normalizedName,
    localId: bracketMatch?.[1] ?? '',
    setTotal: bracketMatch?.[2] ? Number(bracketMatch[2]) : undefined
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

export function tokenizeCardName(value: string): string[] {
  return normalizeCardName(value).split(' ').filter(Boolean);
}

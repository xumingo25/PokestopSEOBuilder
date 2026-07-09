import type { ColumnMap, EnrichedProduct, ProductInput, ProductRow, ProductSuggestion } from '../domain/Product';
import { readMappedValue } from './ColumnMapper';
import { buildEmptySuggestion } from './SuggestionBuilder';

const fallbackSeoTitleColumn = 'Titulo SEO';
const fallbackSeoDescriptionColumn = 'Descripcion SEO';
const fallbackDescriptionColumn = 'Descripcion';
const fallbackCategoryColumn = 'Categoria';

export function createProductInput(row: ProductRow, sourceIndex: number, columnMap: ColumnMap): ProductInput {
  const currentDescription = readMappedValue(row, columnMap.description);

  return {
    row,
    sourceIndex,
    name: readMappedValue(row, columnMap.name),
    descriptionHtml: currentDescription,
    sku: readMappedValue(row, columnMap.sku),
    brand: readMappedValue(row, columnMap.brand),
    category: readMappedValue(row, columnMap.category),
    tags: readMappedValue(row, columnMap.tags),
    price: readMappedValue(row, columnMap.price),
    currentSeoTitle: readMappedValue(row, columnMap.seoTitle),
    currentSeoDescription: readMappedValue(row, columnMap.seoDescription),
    currentDescription
  };
}

export function enrichProducts(rows: ProductRow[], columnMap: ColumnMap): EnrichedProduct[] {
  return rows.map((row, index) => {
    const product = createProductInput(row, index, columnMap);

    return {
      ...product,
      suggestion: buildEmptySuggestion(product)
    };
  });
}

export function withSuggestion(product: EnrichedProduct, suggestion: ProductSuggestion): EnrichedProduct {
  return {
    ...product,
    suggestion
  };
}

export function toExportRows(
  products: EnrichedProduct[],
  updatedSeoIndexes: number[],
  updatedDescriptionIndexes: number[],
  updatedCategoryIndexes: number[],
  columnMap: ColumnMap
): ProductRow[] {
  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const updatedCategorySet = new Set(updatedCategoryIndexes);
  const seoTitleColumn = columnMap.seoTitle ?? fallbackSeoTitleColumn;
  const seoDescriptionColumn = columnMap.seoDescription ?? fallbackSeoDescriptionColumn;
  const descriptionColumn = columnMap.description ?? fallbackDescriptionColumn;
  const categoryColumn = columnMap.category ?? fallbackCategoryColumn;

  return products.map((product) => {
    const hasSeoSuggestion = hasSeoSuggestionValues(product);
    const hasDescriptionSuggestion = hasDescriptionSuggestionValue(product);
    const hasCategorySuggestion = hasCategorySuggestionValue(product);
    const isSeoContentReady = isCurrentSeoReady(product);
    const isDescriptionContentReady = isCurrentDescriptionReady(product);
    const isCategoryContentReady = isCurrentCategoryReady(product);
    const isSeoMarkedUpdated = updatedSeoSet.has(product.sourceIndex) || isSeoContentReady;
    const isDescriptionMarkedUpdated = updatedDescriptionSet.has(product.sourceIndex) || isDescriptionContentReady;
    const isCategoryMarkedUpdated = updatedCategorySet.has(product.sourceIndex) || isCategoryContentReady;
    const isSeoUpdated = isSeoMarkedUpdated && hasSeoSuggestion;
    const isDescriptionUpdated = isDescriptionMarkedUpdated && hasDescriptionSuggestion;
    const isCategoryUpdated = isCategoryMarkedUpdated && hasCategorySuggestion;
    const row: ProductRow = { ...product.row };

    if (isSeoUpdated) {
      row[seoTitleColumn] = product.suggestion.suggestedSeoTitle;
      row[seoDescriptionColumn] = product.suggestion.suggestedSeoDescription;
    }

    if (isDescriptionUpdated) {
      row[descriptionColumn] = product.suggestion.improvedDescriptionHtml;
    }

    if (isCategoryUpdated) {
      row[categoryColumn] = product.suggestion.suggestedCategories.join(', ');
    }

    return row;
  });
}

function isCurrentSeoReady(product: EnrichedProduct): boolean {
  if (!hasSeoSuggestionValues(product)) {
    return false;
  }

  return normalizeComparableValue(product.currentSeoTitle) === normalizeComparableValue(product.suggestion.suggestedSeoTitle)
    && normalizeComparableValue(product.currentSeoDescription) === normalizeComparableValue(product.suggestion.suggestedSeoDescription);
}

function isCurrentDescriptionReady(product: EnrichedProduct): boolean {
  if (!hasDescriptionSuggestionValue(product)) {
    return false;
  }

  return normalizeComparableValue(product.currentDescription) === normalizeComparableValue(product.suggestion.improvedDescriptionHtml);
}

function isCurrentCategoryReady(product: EnrichedProduct): boolean {
  if (!hasCategorySuggestionValue(product)) {
    return false;
  }

  const currentCategories = normalizeCategoryValues(product.category);
  const suggestedCategories = normalizeCategoryValues(product.suggestion.suggestedCategories.join(','));

  return currentCategories.length === suggestedCategories.length
    && currentCategories.every((category, index) => category === suggestedCategories[index]);
}

function normalizeComparableValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeCategoryValues(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((category) => normalizeComparableValue(category).toLowerCase())
    .filter(Boolean)
    .sort();
}

export function hasSeoSuggestionValues(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.suggestedSeoTitle || product.suggestion.suggestedSeoDescription);
}

export function hasDescriptionSuggestionValue(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.improvedDescriptionHtml);
}

export function hasCategorySuggestionValue(product: EnrichedProduct): boolean {
  return product.suggestion.suggestedCategories.length > 0;
}

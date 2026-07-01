import type { ColumnMap, EnrichedProduct, ProductInput, ProductRow, ProductSuggestion } from '../domain/Product';
import { readMappedValue } from './ColumnMapper';

const fallbackSeoTitleColumn = 'Titulo SEO';
const fallbackSeoDescriptionColumn = 'Descripcion SEO';
const fallbackDescriptionColumn = 'Descripcion';
const suggestedSeoTitleColumn = 'Titulo SEO Sugerido';
const suggestedSeoDescriptionColumn = 'Descripcion SEO Sugerida';
const improvedDescriptionColumn = 'Descripcion Mejorada';
const seoStatusColumn = 'Estado SEO';
const descriptionStatusColumn = 'Estado Descripcion';

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

export function buildProductSuggestion(product: ProductInput): ProductSuggestion {
  return {
    suggestedSeoTitle: '',
    suggestedSeoDescription: '',
    improvedDescriptionHtml: '',
    focusKeyword: buildFocusKeyword(product)
  };
}

export function enrichProducts(rows: ProductRow[], columnMap: ColumnMap): EnrichedProduct[] {
  return rows.map((row, index) => {
    const product = createProductInput(row, index, columnMap);

    return {
      ...product,
      suggestion: buildProductSuggestion(product)
    };
  });
}

export function toExportRows(
  products: EnrichedProduct[],
  updatedSeoIndexes: number[],
  updatedDescriptionIndexes: number[],
  columnMap: ColumnMap
): ProductRow[] {
  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const seoTitleColumn = columnMap.seoTitle ?? fallbackSeoTitleColumn;
  const seoDescriptionColumn = columnMap.seoDescription ?? fallbackSeoDescriptionColumn;
  const descriptionColumn = columnMap.description ?? fallbackDescriptionColumn;

  return products.map((product) => {
    const hasSeoSuggestion = hasSeoSuggestionValues(product);
    const hasDescriptionSuggestion = hasDescriptionSuggestionValue(product);
    const isSeoUpdated = updatedSeoSet.has(product.sourceIndex) && hasSeoSuggestion;
    const isDescriptionUpdated = updatedDescriptionSet.has(product.sourceIndex) && hasDescriptionSuggestion;
    const row: ProductRow = {
      ...product.row,
      [suggestedSeoTitleColumn]: product.suggestion.suggestedSeoTitle,
      [suggestedSeoDescriptionColumn]: product.suggestion.suggestedSeoDescription,
      [improvedDescriptionColumn]: product.suggestion.improvedDescriptionHtml,
      [seoStatusColumn]: getExportStatus(isSeoUpdated, hasSeoSuggestion),
      [descriptionStatusColumn]: getExportStatus(isDescriptionUpdated, hasDescriptionSuggestion)
    };

    if (isSeoUpdated) {
      row[seoTitleColumn] = product.suggestion.suggestedSeoTitle;
      row[seoDescriptionColumn] = product.suggestion.suggestedSeoDescription;
    }

    if (isDescriptionUpdated) {
      row[descriptionColumn] = product.suggestion.improvedDescriptionHtml;
    }

    return row;
  });
}

export function hasSeoSuggestionValues(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.suggestedSeoTitle || product.suggestion.suggestedSeoDescription);
}

export function hasDescriptionSuggestionValue(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.improvedDescriptionHtml);
}

function getExportStatus(isUpdated: boolean, hasSuggestion: boolean): string {
  if (isUpdated) {
    return 'Actualizado';
  }

  return hasSuggestion ? 'Pendiente' : 'Sin sugerencia';
}

function buildFocusKeyword(product: ProductInput): string {
  return [product.name, product.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

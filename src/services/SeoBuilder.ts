import type { ColumnMap, EnrichedProduct, ProductInput, ProductRow, ProductSuggestion } from '../domain/Product';
import { readMappedValue } from './ColumnMapper';
import { buildEmptySuggestion } from './SuggestionBuilder';

const fallbackSeoTitleColumn = 'Titulo SEO';
const fallbackSeoDescriptionColumn = 'Descripcion SEO';
const fallbackDescriptionColumn = 'Descripcion';
const suggestedSeoTitleColumn = 'Titulo SEO Sugerido';
const suggestedSeoDescriptionColumn = 'Descripcion SEO Sugerida';
const improvedDescriptionColumn = 'Descripcion Mejorada';
const seoStatusColumn = 'Estado SEO';
const descriptionStatusColumn = 'Estado Descripcion';
const tcgdexIdColumn = 'TCGdex ID';
const tcgdexMatchColumn = 'TCGdex Match';
const tcgdexConfidenceColumn = 'TCGdex Confianza';
const tcgdexSetColumn = 'TCGdex Set';

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
    const isSeoMarkedUpdated = updatedSeoSet.has(product.sourceIndex);
    const isDescriptionMarkedUpdated = updatedDescriptionSet.has(product.sourceIndex);
    const isSeoUpdated = isSeoMarkedUpdated && hasSeoSuggestion;
    const isDescriptionUpdated = isDescriptionMarkedUpdated && hasDescriptionSuggestion;
    const row: ProductRow = {
      ...product.row,
      [suggestedSeoTitleColumn]: product.suggestion.suggestedSeoTitle,
      [suggestedSeoDescriptionColumn]: product.suggestion.suggestedSeoDescription,
      [improvedDescriptionColumn]: product.suggestion.improvedDescriptionHtml,
      [seoStatusColumn]: getExportStatus(isSeoMarkedUpdated, hasSeoSuggestion, 'Actualizado'),
      [descriptionStatusColumn]: getExportStatus(isDescriptionMarkedUpdated, hasDescriptionSuggestion, 'Mejorado'),
      [tcgdexIdColumn]: product.suggestion.match.tcgdexId,
      [tcgdexMatchColumn]: product.suggestion.match.status,
      [tcgdexConfidenceColumn]: product.suggestion.match.confidence ? String(product.suggestion.match.confidence) : '',
      [tcgdexSetColumn]: product.suggestion.match.setName
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

function getExportStatus(isUpdated: boolean, hasSuggestion: boolean, updatedLabel: string): string {
  if (isUpdated) {
    return updatedLabel;
  }

  return hasSuggestion ? 'Pendiente' : 'Sin sugerencia';
}

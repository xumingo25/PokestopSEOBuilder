import type { EnrichedProduct, ImportResult, ProductSuggestion } from '../domain/Product';
import { importCsvFile, toCsv } from '../services/CsvService';
import { findBestCardMatch } from '../services/CardMatcher';
import { buildSuggestionFromCard, buildSuggestionFromMatch } from '../services/SuggestionBuilder';
import {
  enrichProducts,
  hasDescriptionSuggestionValue,
  hasSeoSuggestionValues,
  toExportRows,
  withSuggestion
} from '../services/SeoBuilder';

const pageSize = 30;

interface CatalogBuildResult {
  products: EnrichedProduct[];
  omittedVariantRows: number;
}

interface AppState {
  importResult?: ImportResult;
  products: EnrichedProduct[];
  updatedSeoIndexes: number[];
  updatedDescriptionIndexes: number[];
  omittedVariantRows: number;
  currentPage: number;
  error?: string;
  apiMessage?: string;
  isLoading: boolean;
  isGeneratingSuggestions: boolean;
}

const initialState: AppState = {
  products: [],
  updatedSeoIndexes: [],
  updatedDescriptionIndexes: [],
  omittedVariantRows: 0,
  currentPage: 1,
  isLoading: false,
  isGeneratingSuggestions: false
};

export function createApp(root: HTMLElement): void {
  let state: AppState = { ...initialState };

  const setState = (nextState: Partial<AppState>) => {
    state = { ...state, ...nextState };
    render();
  };

  const handleFile = async (file?: File) => {
    if (!file) {
      return;
    }

    setState({
      isLoading: true,
      error: undefined,
      currentPage: 1,
      updatedSeoIndexes: [],
      updatedDescriptionIndexes: [],
      apiMessage: undefined
    });

    try {
      const importResult = await importCsvFile(file);
      const catalog = buildCatalog(importResult);
      setState({
        importResult,
        ...catalog,
        updatedSeoIndexes: [],
        updatedDescriptionIndexes: [],
        currentPage: 1,
        isLoading: false
      });
      void generateSuggestionsForPage(1, catalog.products);
    } catch (error) {
      setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'No fue posible procesar el archivo.'
      });
    }
  };

  const updateProductSeo = (sourceIndex: number) => {
    if (state.updatedSeoIndexes.includes(sourceIndex)) {
      return;
    }

    setState({ updatedSeoIndexes: [...state.updatedSeoIndexes, sourceIndex] });
  };

  const updateProductDescription = (sourceIndex: number) => {
    if (state.updatedDescriptionIndexes.includes(sourceIndex)) {
      return;
    }

    setState({ updatedDescriptionIndexes: [...state.updatedDescriptionIndexes, sourceIndex] });
  };

  const generateSuggestionsForPage = async (page: number, sourceProducts = state.products) => {
    if (!sourceProducts.length || state.isGeneratingSuggestions) {
      return;
    }

    const { startIndex, endIndex } = getPageRange(page, sourceProducts.length);
    const pageProducts = sourceProducts.slice(startIndex, endIndex);
    const pendingCount = pageProducts.filter((product) => product.suggestion.match.status === 'pending').length;

    if (!pendingCount) {
      return;
    }

    setState({
      isGeneratingSuggestions: true,
      apiMessage: 'Consultando TCGdex para pagina ' + page + ' (' + pendingCount + ' pendientes)'
    });
    const nextProducts = [...sourceProducts];

    for (let index = startIndex; index < endIndex && index < nextProducts.length; index += 1) {
      const product = nextProducts[index];

      if (product.suggestion.match.status !== 'pending') {
        continue;
      }

      const searchingSuggestion: ProductSuggestion = {
        ...product.suggestion,
        match: {
          ...product.suggestion.match,
          status: 'searching',
          reason: 'Consultando TCGdex'
        }
      };
      nextProducts[index] = withSuggestion(product, searchingSuggestion);
      setState({ products: [...nextProducts], apiMessage: 'Consultando ' + product.name });

      try {
        const result = await findBestCardMatch(product);
        const suggestion = result.card
          ? buildSuggestionFromCard(product, result.card, result.match)
          : buildSuggestionFromMatch(result.match, product);
        nextProducts[index] = withSuggestion(product, suggestion);
      } catch (error) {
        nextProducts[index] = withSuggestion(product, buildSuggestionFromMatch({
          status: 'error',
          tcgdexId: '',
          cardName: '',
          setName: '',
          localId: '',
          confidence: 0,
          reason: 'Error consultando TCGdex',
          error: error instanceof Error ? error.message : 'Error desconocido'
        }, product));
      }

      setState({ products: [...nextProducts] });
    }

    setState({
      isGeneratingSuggestions: false,
      apiMessage: 'Pagina ' + page + ' consultada'
    });
  };

  const downloadCsv = () => {
    if (!state.products.length || !state.importResult) {
      return;
    }

    const csv = toCsv(
      toExportRows(
        state.products,
        state.updatedSeoIndexes,
        state.updatedDescriptionIndexes,
        state.importResult.columnMap
      )
    );
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFileName(state.importResult.fileName);
    link.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setState({ ...initialState });
  };

  const goToPreviousPage = () => {
    const nextPage = Math.max(1, state.currentPage - 1);
    setState({ currentPage: nextPage });
    void generateSuggestionsForPage(nextPage);
  };

  const goToNextPage = () => {
    const totalPages = getTotalPages(state.products.length);
    const nextPage = Math.min(totalPages, state.currentPage + 1);
    setState({ currentPage: nextPage });
    void generateSuggestionsForPage(nextPage);
  };

  const render = () => {
    root.innerHTML = layout(state);
    root.querySelector<HTMLInputElement>('#product-file')?.addEventListener('change', (event: Event) => {
      const input = event.target as HTMLInputElement | null;

      if (!input) {
        return;
      }

      void handleFile(input.files?.[0]);
    });
    root.querySelector<HTMLButtonElement>('#download-csv')?.addEventListener('click', downloadCsv);
    root.querySelector<HTMLButtonElement>('#generate-suggestions')?.addEventListener('click', () => { void generateSuggestionsForPage(state.currentPage); });
    root.querySelector<HTMLButtonElement>('#reset-app')?.addEventListener('click', reset);
    root.querySelector<HTMLButtonElement>('#preview-prev')?.addEventListener('click', goToPreviousPage);
    root.querySelector<HTMLButtonElement>('#preview-next')?.addEventListener('click', goToNextPage);
    root.querySelectorAll<HTMLButtonElement>('[data-update-seo]').forEach((button) => {
      button.addEventListener('click', () => updateProductSeo(Number(button.dataset.updateSeo)));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-update-description]').forEach((button) => {
      button.addEventListener('click', () => updateProductDescription(Number(button.dataset.updateDescription)));
    });
  };

  render();
}

function layout(state: AppState): string {
  return [
    '<div class="app-shell">',
    '<header class="topbar"><div class="topbar__content">',
    '<div class="brand"><h1 class="brand__name">Pokestop SEO Builder</h1><p class="brand__tagline">Generador local de columnas SEO para catalogos de Tienda Nube.</p></div>',
    '<div class="status-pill">Sprint 3</div>',
    '</div></header>',
    '<main class="workspace">',
    importSection(state),
    summarySection(state),
    apiStatusSection(state),
    previewSection(state.products, state.updatedSeoIndexes, state.updatedDescriptionIndexes, state.currentPage),
    '</main></div>'
  ].join('');
}

function importSection(state: AppState): string {
  const disabled = state.products.length && !state.isGeneratingSuggestions ? '' : 'disabled';
  const loading = state.isLoading ? '<p class="muted">Procesando archivo...</p>' : '';
  const error = state.error ? '<div class="error-box">' + escapeHtml(state.error) + '</div>' : '';

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Importar catalogo</h2><p class="panel__hint">Carga un CSV o TSV exportado desde Tienda Nube.</p></div>',
    '<div class="actions">',
    '<button class="button button--secondary" id="reset-app" type="button" ' + disabled + '>Limpiar</button>',
    '<button class="button button--secondary" id="generate-suggestions" type="button" ' + disabled + '>Generar pagina visible</button>',
    '<button class="button button--primary" id="download-csv" type="button" ' + disabled + '>Descargar CSV</button>',
    '</div></div>',
    '<div class="panel__body"><label class="upload-zone" for="product-file">',
    '<strong>Selecciona el archivo de productos</strong>',
    '<span>El sistema detecta separador, encoding, columnas SEO actuales y descripciones HTML.</span>',
    '<input class="file-input" id="product-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" />',
    '</label>' + loading + error + '</div></section>'
  ].join('');
}

function apiStatusSection(state: AppState): string {
  if (!state.isGeneratingSuggestions && !state.apiMessage) {
    return '';
  }

  return '<section class="notice-panel">' + escapeHtml(state.apiMessage ?? '') + '</section>';
}

function summarySection(state: AppState): string {
  const detected = state.importResult?.columnMap;
  const mappedCount = detected ? Object.values(detected).filter(Boolean).length : 0;

  return [
    '<section class="summary-grid" aria-label="Resumen de importacion">',
    metric('Archivo', state.importResult?.fileName ?? 'Sin archivo'),
    metric('Productos validos', String(state.products.length)),
    metric('SEO actualizados', String(state.updatedSeoIndexes.length)),
    metric('Descripciones actualizadas', String(state.updatedDescriptionIndexes.length)),
    metric('API encontradas', String(state.products.filter((product) => product.suggestion.match.status === 'found').length)),
    metric('Variantes omitidas', String(state.omittedVariantRows)),
    metric('Col. titulo SEO', detected?.seoTitle ?? 'No detectada'),
    metric('Col. desc. SEO', detected?.seoDescription ?? 'No detectada'),
    metric('Columnas detectadas', String(mappedCount)),
    '</section>'
  ].join('');
}

function previewSection(
  products: EnrichedProduct[],
  updatedSeoIndexes: number[],
  updatedDescriptionIndexes: number[],
  currentPage: number
): string {
  if (!products.length) {
    return '<section class="empty-state">Importa un archivo para ver la grilla comparativa.</section>';
  }

  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const totalPages = getTotalPages(products.length);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleProducts = products.slice(startIndex, endIndex);
  const rows = visibleProducts.map((product) => productRow(
    product,
    updatedSeoSet.has(product.sourceIndex),
    updatedDescriptionSet.has(product.sourceIndex)
  )).join('');

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Vista previa SEO y descripcion</h2><p class="panel__hint">Mostrando ' + (startIndex + 1) + '-' + Math.min(endIndex, products.length) + ' de ' + products.length + ' productos validos.</p></div>',
    paginationControls(safeCurrentPage, totalPages),
    '</div>',
    '<div class="panel__body"><div class="table-wrap"><table class="seo-grid">',
    '<thead><tr><th>Producto</th><th>API</th><th>Match</th><th>Titulo SEO actual</th><th>Descripcion SEO actual</th><th>Titulo SEO sugerido</th><th>Descripcion SEO sugerida</th><th>Descripcion actual</th><th>Descripcion mejorada</th><th>Estado SEO</th><th>Accion SEO</th><th>Estado descripcion</th><th>Accion descripcion</th></tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '</table></div></div></section>'
  ].join('');
}

function productRow(product: EnrichedProduct, isSeoUpdated: boolean, isDescriptionUpdated: boolean): string {
  const hasSeoSuggestion = hasSeoSuggestionValues(product);
  const hasDescriptionSuggestion = hasDescriptionSuggestionValue(product);

  return [
    '<tr>',
    '<td><div class="product-name">' + escapeHtml(product.name) + '</div><div class="muted">' + escapeHtml(product.sku || 'Sin SKU') + '</div></td>',
    '<td>' + apiBadge(product) + '</td>',
    '<td>' + matchSummary(product) + '</td>',
    '<td>' + valueOrEmpty(product.currentSeoTitle) + '</td>',
    '<td>' + valueOrEmpty(product.currentSeoDescription) + '</td>',
    '<td>' + valueOrEmpty(product.suggestion.suggestedSeoTitle) + '</td>',
    '<td>' + valueOrEmpty(product.suggestion.suggestedSeoDescription) + '</td>',
    '<td>' + htmlValueOrEmpty(product.currentDescription) + '</td>',
    '<td>' + htmlValueOrEmpty(product.suggestion.improvedDescriptionHtml) + '</td>',
    '<td>' + statusBadge(isSeoUpdated, hasSeoSuggestion) + '</td>',
    '<td>' + actionButton('seo', product.sourceIndex, isSeoUpdated, hasSeoSuggestion) + '</td>',
    '<td>' + statusBadge(isDescriptionUpdated, hasDescriptionSuggestion) + '</td>',
    '<td>' + actionButton('description', product.sourceIndex, isDescriptionUpdated, hasDescriptionSuggestion) + '</td>',
    '</tr>'
  ].join('');
}

function apiBadge(product: EnrichedProduct): string {
  const status = product.suggestion.match.status;
  const labelByStatus: Record<string, string> = {
    pending: 'Pendiente',
    searching: 'Consultando',
    found: 'Encontrada',
    ambiguous: 'Ambigua',
    not_found: 'No encontrada',
    error: 'Error'
  };
  const className = status === 'found'
    ? 'status-badge status-badge--done'
    : status === 'pending'
      ? 'status-badge status-badge--idle'
      : status === 'searching'
        ? 'status-badge'
        : 'status-badge status-badge--error';

  return '<span class="' + className + '">' + escapeHtml(labelByStatus[status] ?? status) + '</span>';
}

function matchSummary(product: EnrichedProduct): string {
  const match = product.suggestion.match;

  if (match.status === 'pending') {
    return '<span class="muted">Sin consulta</span>';
  }

  if (match.status === 'found' || match.status === 'ambiguous') {
    return [
      '<div class="product-name">' + escapeHtml(match.cardName || match.tcgdexId) + '</div>',
      '<div class="muted">' + escapeHtml([match.tcgdexId, match.setName, match.confidence ? match.confidence + '%' : ''].filter(Boolean).join(' - ')) + '</div>'
    ].join('');
  }

  return '<span class="muted">' + escapeHtml(match.reason || match.error || 'Sin resultado') + '</span>';
}

function buildCatalog(importResult: ImportResult): CatalogBuildResult {
  const enrichedProducts = enrichProducts(importResult.rows, importResult.columnMap);
  const products = enrichedProducts.filter((product) => hasValidProductName(product.name));

  return {
    products,
    omittedVariantRows: enrichedProducts.length - products.length
  };
}

function statusBadge(isUpdated: boolean, hasSuggestion: boolean): string {
  if (isUpdated) {
    return '<span class="status-badge status-badge--done">Actualizado</span>';
  }

  if (!hasSuggestion) {
    return '<span class="status-badge status-badge--idle">Sin sugerencia</span>';
  }

  return '<span class="status-badge">Pendiente</span>';
}

function actionButton(kind: 'seo' | 'description', sourceIndex: number, isUpdated: boolean, hasSuggestion: boolean): string {
  if (isUpdated) {
    return '<button class="button button--secondary button--small" type="button" disabled>Aplicado</button>';
  }

  if (!hasSuggestion) {
    return '<button class="button button--secondary button--small" type="button" disabled>Sin dato</button>';
  }

  if (kind === 'seo') {
    return '<button class="button button--primary button--small" type="button" data-update-seo="' + sourceIndex + '">Actualizar SEO</button>';
  }

  return '<button class="button button--primary button--small" type="button" data-update-description="' + sourceIndex + '">Actualizar descripcion</button>';
}

function paginationControls(currentPage: number, totalPages: number): string {
  const previousDisabled = currentPage <= 1 ? 'disabled' : '';
  const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

  return [
    '<nav class="pagination" aria-label="Paginacion de productos">',
    '<button class="pagination__button" id="preview-prev" type="button" ' + previousDisabled + ' aria-label="Pagina anterior">Anterior</button>',
    '<span class="pagination__status">Pagina ' + currentPage + ' de ' + totalPages + '</span>',
    '<button class="pagination__button" id="preview-next" type="button" ' + nextDisabled + ' aria-label="Pagina siguiente">Siguiente</button>',
    '</nav>'
  ].join('');
}

function getTotalPages(totalItems: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function getPageRange(page: number, totalItems: number): { startIndex: number; endIndex: number } {
  const safePage = Math.min(Math.max(page, 1), getTotalPages(totalItems));
  const startIndex = (safePage - 1) * pageSize;

  return {
    startIndex,
    endIndex: Math.min(startIndex + pageSize, totalItems)
  };
}

function metric(label: string, value: string): string {
  return '<article class="metric"><p class="metric__label">' + escapeHtml(label) + '</p><p class="metric__value">' + escapeHtml(value) + '</p></article>';
}

function valueOrEmpty(value: string): string {
  return value ? escapeHtml(value) : '<span class="muted">Sin dato</span>';
}

function htmlValueOrEmpty(value: string): string {
  return value ? '<code class="html-preview">' + escapeHtml(value) + '</code>' : '<span class="muted">Sin dato</span>';
}

function buildExportFileName(fileName: string): string {
  return fileName.replace(/\.(csv|tsv)$/i, '') + '-seo-descripcion-actualizado.csv';
}

function hasValidProductName(name: string): boolean {
  const normalizedName = normalizeValue(name);

  return normalizedName.length > 0 && normalizedName !== 'producto sin nombre';
}

function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

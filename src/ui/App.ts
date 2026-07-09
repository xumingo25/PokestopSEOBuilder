import type { EnrichedProduct, ImportResult, ProductRow, ProductSuggestion } from '../domain/Product';
import { importCsvFile, toCsv } from '../services/CsvService';
import { parseCardIdentity } from '../services/CardIdentityParser';
import { findBestCardMatch } from '../services/CardMatcher';
import { buildSuggestionFromCard, buildSuggestionFromMatch } from '../services/SuggestionBuilder';
import {
  enrichProducts,
  hasCategorySuggestionValue,
  hasDescriptionSuggestionValue,
  hasSeoSuggestionValues,
  toExportRows,
  withSuggestion
} from '../services/SeoBuilder';

const pageSize = 30;
type PreviewFilter = 'all' | 'unmatched' | 'needs_update';

interface CatalogBuildResult {
  products: EnrichedProduct[];
  omittedVariantRows: number;
  updatedSeoIndexes: number[];
  updatedDescriptionIndexes: number[];
  updatedCategoryIndexes: number[];
}

interface AppState {
  importResult?: ImportResult;
  products: EnrichedProduct[];
  updatedSeoIndexes: number[];
  updatedDescriptionIndexes: number[];
  updatedCategoryIndexes: number[];
  omittedVariantRows: number;
  currentPage: number;
  previewFilter: PreviewFilter;
  hasCompletedUnmatchedScan: boolean;
  error?: string;
  apiMessage?: string;
  isLoading: boolean;
  isGeneratingSuggestions: boolean;
  isScanningUnmatched: boolean;
}

const initialState: AppState = {
  products: [],
  updatedSeoIndexes: [],
  updatedDescriptionIndexes: [],
  updatedCategoryIndexes: [],
  omittedVariantRows: 0,
  currentPage: 1,
  previewFilter: 'all',
  hasCompletedUnmatchedScan: false,
  isLoading: false,
  isGeneratingSuggestions: false,
  isScanningUnmatched: false
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
      updatedCategoryIndexes: [],
      apiMessage: undefined,
      previewFilter: 'all',
      hasCompletedUnmatchedScan: false,
      isScanningUnmatched: false
    });

    try {
      const importResult = await importCsvFile(file);
      const catalog = buildCatalog(importResult);
      setState({
        importResult,
        ...catalog,
        updatedSeoIndexes: catalog.updatedSeoIndexes,
        updatedDescriptionIndexes: catalog.updatedDescriptionIndexes,
        updatedCategoryIndexes: catalog.updatedCategoryIndexes,
        currentPage: 1,
        previewFilter: 'all',
        hasCompletedUnmatchedScan: false,
        isLoading: false,
        apiMessage: 'Archivo cargado. Presiona Iniciar scanner para consultar TCGdex.'
      });
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


  const confirmAmbiguousMatch = (sourceIndex: number) => {
    const nextProducts = state.products.map((product) => {
      if (product.sourceIndex !== sourceIndex || product.suggestion.match.status !== 'ambiguous') {
        return product;
      }

      return withSuggestion(product, {
        ...product.suggestion,
        match: {
          ...product.suggestion.match,
          status: 'found',
          confidence: 100,
          reason: 'Coincidencia ambigua confirmada manualmente'
        }
      });
    });

    setState({
      products: nextProducts,
      apiMessage: 'Coincidencia confirmada manualmente.'
    });
  };

  const generateSuggestionsForPage = async (page: number, sourceProducts = state.products) => {
    if (!sourceProducts.length || state.isGeneratingSuggestions || state.isScanningUnmatched) {
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
        const errorMessage = getErrorMessage(error);
        nextProducts[index] = withSuggestion(product, buildSuggestionFromMatch({
          status: 'error',
          tcgdexId: '',
          cardName: '',
          setName: '',
          localId: '',
          confidence: 0,
          reason: 'Error consultando TCGdex: ' + errorMessage,
          error: errorMessage
        }, product));
      }

      setState({ products: [...nextProducts] });
    }

    setState({
      isGeneratingSuggestions: false,
      apiMessage: 'Pagina ' + page + ' consultada'
    });
  };

  const scanAllProductsForUnmatched = async (sourceProducts = state.products) => {
    if (!sourceProducts.length || state.isGeneratingSuggestions || state.isScanningUnmatched) {
      return;
    }

    const pendingCount = sourceProducts.filter((product) => product.suggestion.match.status === 'pending').length;

    if (!pendingCount) {
      setState({
        hasCompletedUnmatchedScan: true,
        apiMessage: 'Revision completa terminada. Cartas por corregir: ' + getUnmatchedProducts(sourceProducts).length
      });
      return;
    }

    setState({
      isScanningUnmatched: true,
      hasCompletedUnmatchedScan: false,
      apiMessage: 'Revision completa en segundo plano: 0 de ' + pendingCount + ' cartas consultadas'
    });

    const nextProducts = [...sourceProducts];
    let processedCount = 0;

    for (let index = 0; index < nextProducts.length; index += 1) {
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
      setState({
        products: [...nextProducts],
        apiMessage: 'Revision completa en segundo plano: ' + processedCount + ' de ' + pendingCount + ' cartas consultadas'
      });

      try {
        const result = await findBestCardMatch(product);
        const suggestion = result.card
          ? buildSuggestionFromCard(product, result.card, result.match)
          : buildSuggestionFromMatch(result.match, product);
        nextProducts[index] = withSuggestion(product, suggestion);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        nextProducts[index] = withSuggestion(product, buildSuggestionFromMatch({
          status: 'error',
          tcgdexId: '',
          cardName: '',
          setName: '',
          localId: '',
          confidence: 0,
          reason: 'Error consultando TCGdex: ' + errorMessage,
          error: errorMessage
        }, product));
      }

      processedCount += 1;
      setState({
        products: [...nextProducts],
        apiMessage: 'Revision completa en segundo plano: ' + processedCount + ' de ' + pendingCount + ' cartas consultadas'
      });
    }

    setState({
      products: [...nextProducts],
      isScanningUnmatched: false,
      hasCompletedUnmatchedScan: true,
      currentPage: 1,
      apiMessage: 'Revision completa terminada. Cartas por corregir: ' + getUnmatchedProducts(nextProducts).length
    });
  };

  const downloadCsv = () => {
    downloadExportCsv(state.updatedSeoIndexes, state.updatedDescriptionIndexes, state.updatedCategoryIndexes);
  };

  const downloadExportCsv = (updatedSeoIndexes: number[], updatedDescriptionIndexes: number[], updatedCategoryIndexes: number[]) => {
    if (!state.products.length || !state.importResult) {
      return;
    }

    const csv = toCsv(
      toExportRows(
        state.products,
        updatedSeoIndexes,
        updatedDescriptionIndexes,
        updatedCategoryIndexes,
        state.importResult.columnMap
      ),
      state.importResult.delimiter
    );
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFileName(state.importResult.fileName);
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateAllFoundProducts = () => {
    const foundProducts = state.products.filter((product) => product.suggestion.match.status === 'found');
    updateProductSet(foundProducts, 'No hay cartas encontradas para actualizar.');
  };

  const updateAllFoundCategories = () => {
    if (!state.products.length || !state.importResult || state.isScanningUnmatched) {
      return;
    }

    const foundProductsWithCategories = state.products.filter((product) => (
      product.suggestion.match.status === 'found' && hasCategorySuggestionValue(product)
    ));

    if (!foundProductsWithCategories.length) {
      setState({ apiMessage: 'No hay categorias encontradas para actualizar.' });
      return;
    }

    const nextCategoryIndexes = mergeIndexes(
      state.updatedCategoryIndexes,
      foundProductsWithCategories.map((product) => product.sourceIndex)
    );

    setState({
      updatedCategoryIndexes: nextCategoryIndexes,
      apiMessage: 'Actualizacion masiva de categorias lista. Productos actualizados: ' + foundProductsWithCategories.length
    });
    downloadExportCsv(state.updatedSeoIndexes, state.updatedDescriptionIndexes, nextCategoryIndexes);
  };

  const updateNeedsUpdateProducts = () => {
    const needsUpdateProducts = getNeedsUpdateProducts(
      state.products,
      state.updatedSeoIndexes,
      state.updatedDescriptionIndexes,
      state.updatedCategoryIndexes
    );
    updateProductSet(needsUpdateProducts, 'No hay productos por actualizar.');
  };

  const updateProductSet = (targetProducts: EnrichedProduct[], emptyMessage: string) => {
    if (!state.products.length || !state.importResult || state.isScanningUnmatched) {
      return;
    }

    const nextSeoIndexes = mergeIndexes(
      state.updatedSeoIndexes,
      targetProducts.filter(hasSeoSuggestionValues).map((product) => product.sourceIndex)
    );
    const nextDescriptionIndexes = mergeIndexes(
      state.updatedDescriptionIndexes,
      targetProducts.filter(hasDescriptionSuggestionValue).map((product) => product.sourceIndex)
    );
    const nextCategoryIndexes = mergeIndexes(
      state.updatedCategoryIndexes,
      targetProducts.filter(hasCategorySuggestionValue).map((product) => product.sourceIndex)
    );

    if (!targetProducts.length) {
      setState({ apiMessage: emptyMessage });
      return;
    }

    setState({
      updatedSeoIndexes: nextSeoIndexes,
      updatedDescriptionIndexes: nextDescriptionIndexes,
      updatedCategoryIndexes: nextCategoryIndexes,
      apiMessage: 'Actualizacion masiva lista. Productos actualizados: ' + targetProducts.length
    });
    downloadExportCsv(nextSeoIndexes, nextDescriptionIndexes, nextCategoryIndexes);
  };



  const downloadUnmatchedCsv = () => {
    const rows = buildUnmatchedRows(state.products);
    const pendingCount = state.products.filter((product) => ['pending', 'searching'].includes(product.suggestion.match.status)).length;

    if (!rows.length) {
      const pendingMessage = pendingCount ? ' Aun hay ' + pendingCount + ' cartas sin consultar.' : '';
      setState({ apiMessage: 'No hay cartas consultadas pendientes de correccion manual.' + pendingMessage });
      return;
    }

    const csv = toCsv(rows);
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cartas-no-encontradas.csv';
    link.click();
    URL.revokeObjectURL(url);
    setState({
      apiMessage: 'Listado generado con ' + rows.length + ' cartas para revisar manualmente.'
        + (pendingCount ? ' Aun hay ' + pendingCount + ' cartas sin consultar.' : '')
    });
  };

  const reset = () => {
    setState({ ...initialState });
  };

  const goToPreviousPage = () => {
    const nextPage = Math.max(1, state.currentPage - 1);
    setState({ currentPage: nextPage });
  };

  const goToNextPage = () => {
    const totalPages = getTotalPages(getPreviewProducts(state.products, state.previewFilter, state.updatedSeoIndexes, state.updatedDescriptionIndexes, state.updatedCategoryIndexes).length);
    const nextPage = Math.min(totalPages, state.currentPage + 1);
    setState({ currentPage: nextPage });
  };

  const showUnmatchedProducts = () => {
    setState({ previewFilter: 'unmatched', currentPage: 1 });
  };

  const showNeedsUpdateProducts = () => {
    setState({ previewFilter: 'needs_update', currentPage: 1 });
  };

  const showAllProducts = () => {
    setState({ previewFilter: 'all', currentPage: 1 });
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
    root.querySelector<HTMLButtonElement>('#download-unmatched')?.addEventListener('click', downloadUnmatchedCsv);
    root.querySelector<HTMLButtonElement>('#show-unmatched')?.addEventListener('click', showUnmatchedProducts);
    root.querySelector<HTMLButtonElement>('#show-needs-update')?.addEventListener('click', showNeedsUpdateProducts);
    root.querySelector<HTMLButtonElement>('#show-all')?.addEventListener('click', showAllProducts);
    root.querySelector<HTMLButtonElement>('#start-scanner')?.addEventListener('click', () => { void scanAllProductsForUnmatched(); });
    root.querySelector<HTMLButtonElement>('#bulk-update-found')?.addEventListener('click', updateAllFoundProducts);
    root.querySelector<HTMLButtonElement>('#bulk-update-categories')?.addEventListener('click', updateAllFoundCategories);
    root.querySelector<HTMLButtonElement>('#bulk-update-needs')?.addEventListener('click', updateNeedsUpdateProducts);
    root.querySelector<HTMLButtonElement>('#reset-app')?.addEventListener('click', reset);
    root.querySelector<HTMLButtonElement>('#preview-prev')?.addEventListener('click', goToPreviousPage);
    root.querySelector<HTMLButtonElement>('#preview-next')?.addEventListener('click', goToNextPage);
    root.querySelectorAll<HTMLButtonElement>('[data-update-seo]').forEach((button) => {
      button.addEventListener('click', () => updateProductSeo(Number(button.dataset.updateSeo)));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-update-description]').forEach((button) => {
      button.addEventListener('click', () => updateProductDescription(Number(button.dataset.updateDescription)));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-confirm-match]').forEach((button) => {
      button.addEventListener('click', () => confirmAmbiguousMatch(Number(button.dataset.confirmMatch)));
    });
  };

  render();
}

function layout(state: AppState): string {
  return [
    '<div class="app-shell">',
    '<header class="topbar"><div class="topbar__content">',
    '<div class="brand"><h1 class="brand__name">Pokestop SEO Builder</h1><p class="brand__tagline">Generador local de columnas SEO para catalogos de Tienda Nube.</p></div>',
    '<div class="status-pill">Sprint 7</div>',
    '</div></header>',
    '<main class="workspace">',
    importSection(state),
    summarySection(state),
    apiStatusSection(state),
    previewSection(state.products, state.updatedSeoIndexes, state.updatedDescriptionIndexes, state.updatedCategoryIndexes, state.currentPage, state.previewFilter),
    '</main></div>'
  ].join('');
}

function importSection(state: AppState): string {
  const hasProductsDisabled = state.products.length ? '' : 'disabled';
  const scannerDisabled = state.products.length && !state.isScanningUnmatched && !state.isGeneratingSuggestions ? '' : 'disabled';
  const resultActionsDisabled = state.products.length && state.hasCompletedUnmatchedScan ? '' : 'disabled';
  const bulkUpdateDisabled = state.products.length && state.hasCompletedUnmatchedScan && !state.isScanningUnmatched ? '' : 'disabled';
  const loading = state.isLoading ? '<p class="muted">Procesando archivo...</p>' : '';
  const error = state.error ? '<div class="error-box">' + escapeHtml(state.error) + '</div>' : '';

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Importar catalogo</h2><p class="panel__hint">Carga un CSV o TSV exportado desde Tienda Nube.</p></div>',
    '<div class="actions actions--file">',
    '<button class="button button--secondary" id="reset-app" type="button" ' + hasProductsDisabled + '>Limpiar</button>',
    '<button class="button button--primary" id="download-csv" type="button" ' + hasProductsDisabled + '>Descargar Excel</button>',
    '</div></div>',
    '<div class="panel__body"><label class="upload-zone" for="product-file">',
    '<strong>Selecciona el archivo de productos</strong>',
    '<span>El sistema detecta separador, encoding, columnas SEO actuales y descripciones HTML.</span>',
    '<input class="file-input" id="product-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" />',
    '</label>' + loading + error,
    '<div class="result-actions" aria-label="Acciones sobre resultados">',
    '<button class="button button--secondary" id="start-scanner" type="button" ' + scannerDisabled + '>Iniciar scanner</button>',
    '<button class="button button--secondary" id="bulk-update-found" type="button" ' + bulkUpdateDisabled + '>Actualizar todos los encontrados</button>',
    '<button class="button button--secondary" id="bulk-update-categories" type="button" ' + bulkUpdateDisabled + '>Actualizar categorias encontradas</button>',
    '<button class="button button--secondary" id="bulk-update-needs" type="button" ' + bulkUpdateDisabled + '>Actualizar por actualizar</button>',
    '<button class="button button--secondary" id="show-needs-update" type="button" ' + resultActionsDisabled + '>Mostrar por actualizar</button>',
    '<button class="button button--secondary" id="show-unmatched" type="button" ' + resultActionsDisabled + '>Mostrar no encontrados</button>',
    '<button class="button button--secondary" id="show-all" type="button" ' + hasProductsDisabled + '>Mostrar todos</button>',
    '<button class="button button--secondary" id="download-unmatched" type="button" ' + resultActionsDisabled + '>Descargar no encontrados</button>',
    '</div></div></section>'
  ].join('');
}

function apiStatusSection(state: AppState): string {
  if (!state.isGeneratingSuggestions && !state.isScanningUnmatched && !state.apiMessage) {
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
    metric('Categorias actualizadas', String(state.updatedCategoryIndexes.length)),
    metric('API encontradas', String(state.products.filter((product) => product.suggestion.match.status === 'found').length)),
    metric('Consultadas API', String(state.products.filter((product) => product.suggestion.match.status !== 'pending').length)),
    metric('Por actualizar', String(getNeedsUpdateProducts(state.products, state.updatedSeoIndexes, state.updatedDescriptionIndexes, state.updatedCategoryIndexes).length)),
    metric('Por corregir', String(getUnmatchedProducts(state.products).length)),
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
  updatedCategoryIndexes: number[],
  currentPage: number,
  previewFilter: PreviewFilter
): string {
  if (!products.length) {
    return '<section class="empty-state">Importa un archivo para ver la grilla comparativa.</section>';
  }

  const previewProducts = getPreviewProducts(products, previewFilter, updatedSeoIndexes, updatedDescriptionIndexes, updatedCategoryIndexes);

  if (!previewProducts.length) {
    return '<section class="empty-state">No hay productos para mostrar con el filtro actual.</section>';
  }

  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const updatedCategorySet = new Set(updatedCategoryIndexes);
  const totalPages = getTotalPages(previewProducts.length);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleProducts = previewProducts.slice(startIndex, endIndex);
  const rows = visibleProducts.map((product) => productRow(
    product,
    updatedSeoSet.has(product.sourceIndex),
    updatedDescriptionSet.has(product.sourceIndex),
    updatedCategorySet.has(product.sourceIndex)
  )).join('');

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Vista previa SEO y descripcion</h2><p class="panel__hint">' + previewTitle(previewFilter) + '. Mostrando ' + (startIndex + 1) + '-' + Math.min(endIndex, previewProducts.length) + ' de ' + previewProducts.length + ' productos.</p></div>',
    paginationControls(safeCurrentPage, totalPages),
    '</div>',
    '<div class="panel__body"><div class="table-wrap"><table class="seo-grid">',
    '<thead><tr><th>Producto</th><th>API</th><th>Match</th><th>Categoria actual</th><th>Categoria sugerida</th><th>Estado categoria</th><th>Titulo SEO actual</th><th>Descripcion SEO actual</th><th>Titulo SEO sugerido</th><th>Descripcion SEO sugerida</th><th>Descripcion actual</th><th>Descripcion mejorada</th><th>Estado SEO</th><th>Accion SEO</th><th>Estado descripcion</th><th>Accion descripcion</th></tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '</table></div></div></section>'
  ].join('');
}

function productRow(product: EnrichedProduct, isSeoUpdated: boolean, isDescriptionUpdated: boolean, isCategoryUpdated: boolean): string {
  const hasSeoSuggestion = hasSeoSuggestionValues(product);
  const hasDescriptionSuggestion = hasDescriptionSuggestionValue(product);
  const hasCategorySuggestion = hasCategorySuggestionValue(product);
  const isSeoReady = isSeoUpdated || isCurrentSeoReady(product);
  const isDescriptionReady = isDescriptionUpdated || isCurrentDescriptionReady(product);
  const isCategoryReady = isCategoryUpdated || isCurrentCategoryReady(product);

  return [
    '<tr>',
    '<td><div class="product-name">' + escapeHtml(product.name) + '</div><div class="muted">' + escapeHtml(product.sku || 'Sin SKU') + '</div></td>',
    '<td>' + apiBadge(product) + '</td>',
    '<td>' + matchSummary(product) + confirmMatchButton(product) + '</td>',
    '<td>' + valueOrEmpty(product.category) + '</td>',
    '<td>' + categoryValueOrEmpty(product.suggestion.suggestedCategories) + '</td>',
    '<td>' + statusBadge(isCategoryReady, hasCategorySuggestion) + '</td>',
    '<td>' + valueOrEmpty(product.currentSeoTitle) + '</td>',
    '<td>' + valueOrEmpty(product.currentSeoDescription) + '</td>',
    '<td>' + valueOrEmpty(product.suggestion.suggestedSeoTitle) + '</td>',
    '<td>' + valueOrEmpty(product.suggestion.suggestedSeoDescription) + '</td>',
    '<td>' + htmlValueOrEmpty(product.currentDescription) + '</td>',
    '<td>' + htmlValueOrEmpty(product.suggestion.improvedDescriptionHtml) + '</td>',
    '<td>' + statusBadge(isSeoReady, hasSeoSuggestion) + '</td>',
    '<td>' + actionButton('seo', product.sourceIndex, isSeoReady, hasSeoSuggestion) + '</td>',
    '<td>' + statusBadge(isDescriptionReady, hasDescriptionSuggestion) + '</td>',
    '<td>' + actionButton('description', product.sourceIndex, isDescriptionReady, hasDescriptionSuggestion) + '</td>',
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

function confirmMatchButton(product: EnrichedProduct): string {
  if (product.suggestion.match.status !== 'ambiguous') {
    return '';
  }

  return '<button class="button button--primary button--small match-action" type="button" data-confirm-match="' + product.sourceIndex + '">Confirmar</button>';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Error desconocido';
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Error desconocido';
  }
}
function buildCatalog(importResult: ImportResult): CatalogBuildResult {
  const enrichedProducts = enrichProducts(importResult.rows, importResult.columnMap);
  const products = enrichedProducts.filter((product) => hasValidProductName(product.name));

  return {
    products,
    omittedVariantRows: enrichedProducts.length - products.length,
    updatedSeoIndexes: products
      .filter((product) => isReadyStatus(product.row['Estado SEO']) || isUpdatedStatus(product.row['Estado SEO']))
      .map((product) => product.sourceIndex),
    updatedDescriptionIndexes: products
      .filter((product) => isReadyStatus(product.row['Estado Descripcion']) || isUpdatedStatus(product.row['Estado Descripcion']) || isImprovedStatus(product.row['Estado Descripcion']))
      .map((product) => product.sourceIndex),
    updatedCategoryIndexes: products
      .filter((product) => isReadyStatus(product.row['Estado Categoria']) || isUpdatedStatus(product.row['Estado Categoria']))
      .map((product) => product.sourceIndex)
  };
}

function statusBadge(isReady: boolean, hasSuggestion: boolean): string {
  if (isReady) {
    return '<span class="status-badge status-badge--done">Listo</span>';
  }

  if (!hasSuggestion) {
    return '<span class="status-badge status-badge--idle">Sin sugerencia</span>';
  }

  return '<span class="status-badge">Por actualizar</span>';
}

function actionButton(kind: 'seo' | 'description', sourceIndex: number, isReady: boolean, hasSuggestion: boolean): string {
  if (isReady) {
    return '<button class="button button--secondary button--small" type="button" disabled>Listo</button>';
  }

  if (!hasSuggestion) {
    return '<button class="button button--secondary button--small" type="button" disabled>Sin dato</button>';
  }

  if (kind === 'seo') {
    return '<button class="button button--primary button--small" type="button" data-update-seo="' + sourceIndex + '">Actualizar SEO</button>';
  }


  return '<button class="button button--primary button--small" type="button" data-update-description="' + sourceIndex + '">Actualizar descripcion</button>';
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

function mergeIndexes(currentIndexes: number[], newIndexes: number[]): number[] {
  return Array.from(new Set([...currentIndexes, ...newIndexes]));
}

function getPreviewProducts(
  products: EnrichedProduct[],
  previewFilter: PreviewFilter,
  updatedSeoIndexes: number[] = [],
  updatedDescriptionIndexes: number[] = [],
  updatedCategoryIndexes: number[] = []
): EnrichedProduct[] {
  if (previewFilter === 'unmatched') {
    return getUnmatchedProducts(products);
  }

  if (previewFilter === 'needs_update') {
    return getNeedsUpdateProducts(products, updatedSeoIndexes, updatedDescriptionIndexes, updatedCategoryIndexes);
  }

  return products;
}

function previewTitle(previewFilter: PreviewFilter): string {
  if (previewFilter === 'unmatched') {
    return 'Solo cartas no encontradas';
  }

  if (previewFilter === 'needs_update') {
    return 'Solo productos por actualizar';
  }

  return 'Todos los productos validos';
}

function getNeedsUpdateProducts(
  products: EnrichedProduct[],
  updatedSeoIndexes: number[] = [],
  updatedDescriptionIndexes: number[] = [],
  updatedCategoryIndexes: number[] = []
): EnrichedProduct[] {
  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const updatedCategorySet = new Set(updatedCategoryIndexes);

  return products.filter((product) => {
    const hasSeoPending = hasSeoSuggestionValues(product)
      && !updatedSeoSet.has(product.sourceIndex)
      && !isCurrentSeoReady(product);
    const hasDescriptionPending = hasDescriptionSuggestionValue(product)
      && !updatedDescriptionSet.has(product.sourceIndex)
      && !isCurrentDescriptionReady(product);
    const hasCategoryPending = hasCategorySuggestionValue(product)
      && !updatedCategorySet.has(product.sourceIndex)
      && !isCurrentCategoryReady(product);

    return product.suggestion.match.status === 'found' && (hasSeoPending || hasDescriptionPending || hasCategoryPending);
  });
}

function getUnmatchedProducts(products: EnrichedProduct[]): EnrichedProduct[] {
  return products.filter((product) => ['ambiguous', 'not_found', 'error'].includes(product.suggestion.match.status));
}

function buildUnmatchedRows(products: EnrichedProduct[]): ProductRow[] {
  return getUnmatchedProducts(products).map((product) => {
    const identity = parseCardIdentity(product.name);

    return {
      producto: product.name,
      sku: product.sku,
      codigo_extraido: identity.localId,
      numero_extraido: identity.localNumber,
      prefijo_extraido: identity.localPrefix,
      total_set_extraido: identity.setTotal ? String(identity.setTotal) : '',
      estado_api: product.suggestion.match.status,
      motivo: product.suggestion.match.reason || product.suggestion.match.error || '',
      tcgdex_id_detectado: product.suggestion.match.tcgdexId,
      carta_detectada: product.suggestion.match.cardName,
      expansion_detectada: product.suggestion.match.setName,
      confianza: product.suggestion.match.confidence ? String(product.suggestion.match.confidence) : '',
      titulo_seo_actual: product.currentSeoTitle,
      descripcion_seo_actual: product.currentSeoDescription
    };
  });
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

function categoryValueOrEmpty(values: string[]): string {
  return values.length ? '<code class="html-preview">' + escapeHtml(values.join(', ')) + '</code>' : '<span class="muted">Sin dato</span>';
}

function buildExportFileName(fileName: string): string {
  return fileName.replace(/\.(csv|tsv)$/i, '') + '-seo-descripcion-actualizado.csv';
}

function hasValidProductName(name: string): boolean {
  const normalizedName = normalizeValue(name);

  return normalizedName.length > 0 && normalizedName !== 'producto sin nombre';
}

function isReadyStatus(value: string | undefined): boolean {
  return normalizeValue(value ?? '') === 'listo';
}

function isUpdatedStatus(value: string | undefined): boolean {
  return normalizeValue(value ?? '') === 'actualizado';
}

function isImprovedStatus(value: string | undefined): boolean {
  return normalizeValue(value ?? '') === 'mejorado';
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

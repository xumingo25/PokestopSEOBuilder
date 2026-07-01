import type { EnrichedProduct, ImportResult } from '../domain/Product';
import { importCsvFile, toCsv } from '../services/CsvService';
import { enrichProducts, toExportRows } from '../services/SeoBuilder';

const pageSize = 30;

interface AppState {
  importResult?: ImportResult;
  products: EnrichedProduct[];
  omittedVariantRows: number;
  currentPage: number;
  error?: string;
  isLoading: boolean;
}

const initialState: AppState = {
  products: [],
  omittedVariantRows: 0,
  currentPage: 1,
  isLoading: false
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

    setState({ isLoading: true, error: undefined, currentPage: 1 });

    try {
      const importResult = await importCsvFile(file);
      const enrichedProducts = enrichProducts(importResult.rows, importResult.columnMap);
      const products = enrichedProducts.filter((product) => hasValidProductName(product.name));
      const omittedVariantRows = enrichedProducts.length - products.length;

      setState({ importResult, products, omittedVariantRows, currentPage: 1, isLoading: false });
    } catch (error) {
      setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'No fue posible procesar el archivo.'
      });
    }
  };

  const downloadCsv = () => {
    if (!state.products.length) {
      return;
    }

    const csv = toCsv(toExportRows(state.products));
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFileName(state.importResult?.fileName ?? 'pokestop-products.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setState({ ...initialState });
  };

  const goToPreviousPage = () => {
    setState({ currentPage: Math.max(1, state.currentPage - 1) });
  };

  const goToNextPage = () => {
    const totalPages = getTotalPages(state.products.length);
    setState({ currentPage: Math.min(totalPages, state.currentPage + 1) });
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
    root.querySelector<HTMLButtonElement>('#reset-app')?.addEventListener('click', reset);
    root.querySelector<HTMLButtonElement>('#preview-prev')?.addEventListener('click', goToPreviousPage);
    root.querySelector<HTMLButtonElement>('#preview-next')?.addEventListener('click', goToNextPage);
  };

  render();
}

function layout(state: AppState): string {
  return [
    '<div class="app-shell">',
    '<header class="topbar"><div class="topbar__content">',
    '<div class="brand"><h1 class="brand__name">Pokestop SEO Builder</h1><p class="brand__tagline">Generador local de columnas SEO para catalogos de Tienda Nube.</p></div>',
    '<div class="status-pill">Sprint 1.5 MVP</div>',
    '</div></header>',
    '<main class="workspace">',
    importSection(state),
    summarySection(state),
    previewSection(state.products, state.currentPage),
    '</main></div>'
  ].join('');
}

function importSection(state: AppState): string {
  const disabled = state.products.length ? '' : 'disabled';
  const loading = state.isLoading ? '<p class="muted">Procesando archivo...</p>' : '';
  const error = state.error ? '<div class="error-box">' + escapeHtml(state.error) + '</div>' : '';

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Importar catalogo</h2><p class="panel__hint">Carga un CSV o TSV exportado desde Tienda Nube.</p></div>',
    '<div class="actions">',
    '<button class="button button--secondary" id="reset-app" type="button" ' + disabled + '>Limpiar</button>',
    '<button class="button button--primary" id="download-csv" type="button" ' + disabled + '>Descargar CSV</button>',
    '</div></div>',
    '<div class="panel__body"><label class="upload-zone" for="product-file">',
    '<strong>Selecciona el archivo de productos</strong>',
    '<span>El sistema detecta separador, encoding, columnas principales y descripciones HTML.</span>',
    '<input class="file-input" id="product-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" />',
    '</label>' + loading + error + '</div></section>'
  ].join('');
}

function summarySection(state: AppState): string {
  const detected = state.importResult?.columnMap;
  const mappedCount = detected ? Object.values(detected).filter(Boolean).length : 0;

  return [
    '<section class="summary-grid" aria-label="Resumen de importacion">',
    metric('Archivo', state.importResult?.fileName ?? 'Sin archivo'),
    metric('Productos validos', String(state.products.length)),
    metric('Variantes omitidas', String(state.omittedVariantRows)),
    metric('Encoding', state.importResult?.encoding ?? '-'),
    metric('Columnas detectadas', String(mappedCount)),
    metric('Separador', formatDelimiter(state.importResult?.delimiter)),
    '</section>'
  ].join('');
}

function previewSection(products: EnrichedProduct[], currentPage: number): string {
  if (!products.length) {
    return '<section class="empty-state">Importa un archivo para ver la previsualizacion de productos enriquecidos.</section>';
  }

  const totalPages = getTotalPages(products.length);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleProducts = products.slice(startIndex, endIndex);
  const rows = visibleProducts.map((product) => [
    '<tr>',
    '<td><div class="product-name">' + escapeHtml(product.name) + '</div><div class="muted">' + escapeHtml(product.sku || 'Sin SKU') + '</div></td>',
    '<td>' + escapeHtml(product.category || 'Sin categoria') + '</td>',
    '<td>' + escapeHtml(product.seo.seoTitle) + '</td>',
    '<td>' + escapeHtml(product.seo.metaDescription) + '</td>',
    '<td>' + escapeHtml(product.seo.slug) + '</td>',
    '</tr>'
  ].join('')).join('');

  return [
    '<section class="panel">',
    '<div class="panel__header"><div><h2 class="panel__title">Vista previa SEO</h2><p class="panel__hint">Mostrando ' + (startIndex + 1) + '-' + Math.min(endIndex, products.length) + ' de ' + products.length + ' productos validos.</p></div>',
    paginationControls(safeCurrentPage, totalPages),
    '</div>',
    '<div class="panel__body"><div class="table-wrap"><table>',
    '<thead><tr><th>Producto</th><th>Categoria</th><th>Titulo SEO</th><th>Meta descripcion</th><th>Slug</th></tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '</table></div>',
    '</div></section>'
  ].join('');
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

function metric(label: string, value: string): string {
  return '<article class="metric"><p class="metric__label">' + escapeHtml(label) + '</p><p class="metric__value">' + escapeHtml(value) + '</p></article>';
}

function formatDelimiter(delimiter?: string): string {
  if (!delimiter) {
    return '-';
  }

  return delimiter === '\t' ? 'Tab' : delimiter;
}

function buildExportFileName(fileName: string): string {
  return fileName.replace(/\.(csv|tsv)$/i, '') + '-seo.csv';
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

const upstreamBaseUrl = 'https://api.tcgdex.net/v2/en';

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.status(204).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  try {
    const requestUrl = new URL(request.url ?? '', 'https://proxy.local');
    const upstreamPath = resolveUpstreamPath(request, requestUrl);
    const upstreamUrl = upstreamBaseUrl + upstreamPath + buildUpstreamSearch(requestUrl);
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'PokestopSEOBuilder/1.0 (+https://pokestop.cl)'
      }
    });
    const body = await upstreamResponse.text();
    const isDebug = requestUrl.searchParams.get('debug') === '1';

    if (isDebug) {
      response.status(200).json(buildDebugPayload(upstreamUrl, upstreamResponse, body));
      return;
    }

    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', shouldCache(body) ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store');
    response.status(upstreamResponse.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    response.status(502).json({ error: 'No fue posible consultar TCGdex desde el proxy.', detail: message });
  }
}

function resolveUpstreamPath(request: any, requestUrl: URL): string {
  const pathFromUrl = requestUrl.pathname.replace(/^\/api\/tcgdex/, '');

  if (pathFromUrl && pathFromUrl !== '/') {
    return pathFromUrl;
  }

  const queryPath = request.query?.path ?? request.query?.['...path'];

  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return '/' + queryPath.map(encodeURIComponent).join('/');
  }

  if (typeof queryPath === 'string' && queryPath.trim()) {
    return '/' + queryPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  return '/cards';
}

function buildUpstreamSearch(requestUrl: URL): string {
  const params = new URLSearchParams(requestUrl.searchParams);
  params.delete('debug');
  params.delete('path');
  params.delete('...path');

  const search = params.toString();
  return search ? '?' + search : '';
}

function shouldCache(body: string): boolean {
  return body.trim() !== '[]';
}

function buildDebugPayload(upstreamUrl: string, upstreamResponse: Response, body: string): Record<string, unknown> {
  let parsedLength: number | undefined;
  let sample: unknown;

  try {
    const parsed = JSON.parse(body) as unknown;

    if (Array.isArray(parsed)) {
      parsedLength = parsed.length;
      sample = parsed.slice(0, 3);
    } else {
      sample = parsed;
    }
  } catch {
    sample = body.slice(0, 300);
  }

  return {
    upstreamUrl,
    upstreamStatus: upstreamResponse.status,
    contentType: upstreamResponse.headers.get('content-type'),
    bodyBytes: body.length,
    parsedLength,
    sample
  };
}

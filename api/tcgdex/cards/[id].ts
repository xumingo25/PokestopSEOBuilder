const upstreamBaseUrl = 'https://api.tcgdex.net/v2/en/cards';

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
    const cardId = String(request.query?.id ?? '').trim();

    if (!cardId) {
      response.status(400).json({ error: 'Falta el id de la carta.' });
      return;
    }

    const upstreamUrl = upstreamBaseUrl + '/' + encodeURIComponent(cardId) + buildUpstreamSearch(requestUrl);
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'PokestopSEOBuilder/1.0 (+https://pokestop.cl)'
      }
    });
    const body = await upstreamResponse.text();

    if (requestUrl.searchParams.get('debug') === '1') {
      response.status(200).json(buildDebugPayload(upstreamUrl, upstreamResponse, body));
      return;
    }

    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', upstreamResponse.ok ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store');
    response.status(upstreamResponse.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    response.status(502).json({ error: 'No fue posible consultar TCGdex desde el proxy.', detail: message });
  }
}

function buildUpstreamSearch(requestUrl: URL): string {
  const params = new URLSearchParams(requestUrl.searchParams);
  params.delete('debug');
  params.delete('id');

  const search = params.toString();
  return search ? '?' + search : '';
}

function buildDebugPayload(upstreamUrl: string, upstreamResponse: Response, body: string): Record<string, unknown> {
  let sample: unknown;

  try {
    sample = JSON.parse(body) as unknown;
  } catch {
    sample = body.slice(0, 300);
  }

  return {
    upstreamUrl,
    upstreamStatus: upstreamResponse.status,
    contentType: upstreamResponse.headers.get('content-type'),
    bodyBytes: body.length,
    sample
  };
}

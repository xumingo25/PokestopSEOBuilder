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
    const upstreamPath = requestUrl.pathname.replace(/^\/api\/tcgdex/, '') || '/cards';
    const upstreamUrl = upstreamBaseUrl + upstreamPath + requestUrl.search;
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: 'application/json'
      }
    });
    const body = await upstreamResponse.text();

    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    response.status(upstreamResponse.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    response.status(502).json({ error: 'No fue posible consultar TCGdex desde el proxy.', detail: message });
  }
}
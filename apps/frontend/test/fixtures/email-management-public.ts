// Test-process preload only. The optimized application and its assets are unchanged.
// Identity pages render from the owner's management view in the browser, so the server never
// needs identity data: any server-side API read gets a not-found answer and nothing else leaves
// the machine.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === 'https://api.opensignet.com') {
    if (
      request.method !== 'GET' ||
      request.headers.has('authorization') ||
      request.headers.has('cookie')
    )
      throw new Error('Unexpected private context in server fixture');
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Browser fixture forbids external server fetches');
  return originalFetch(input, init);
};

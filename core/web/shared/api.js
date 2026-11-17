export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth')) window.dispatchEvent(new Event('qh:unauthorized'));
    throw new ApiError(data.error || `Erro ${res.status}`, res.status);
  }
  return data;
}

/** Cliente já apontado para a API de um módulo: moduleApi('frotas').get('/meus') */
export function moduleApi(key) {
  const base = `/api/m/${key}`;
  return {
    get: (p) => api(base + p),
    post: (p, body = {}) => api(base + p, { method: 'POST', body }),
    put: (p, body = {}) => api(base + p, { method: 'PUT', body }),
    patch: (p, body = {}) => api(base + p, { method: 'PATCH', body }),
    del: (p) => api(base + p, { method: 'DELETE' }),
  };
}

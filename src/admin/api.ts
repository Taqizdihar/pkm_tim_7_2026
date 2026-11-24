let csrf = '';
export function setCsrf(value: string) { csrf=value; }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api(path: string, method = 'GET', body?: unknown) {
  const form = body instanceof FormData;
  const response = await fetch(`/api/v1/admin${path}`, { method, credentials: 'same-origin',
    headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
    body: body ? form ? body as FormData : JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && window.location.pathname !== '/admin/login') window.location.assign('/admin/login');
    throw new ApiError(response.status,result.error?.message || 'Permintaan gagal.');
  }
  if (result.data?.csrfToken) csrf=result.data.csrfToken;
  return result.data;
}

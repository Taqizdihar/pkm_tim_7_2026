export type FailureCode = 'not_configured' | 'timeout' | 'network' | 'unavailable' | 'rate_limited' | 'quota_exhausted' | 'invalid_credentials' | 'invalid_model' | 'invalid_response' | 'unsupported_modality' | 'privacy' | 'busy' | 'disabled' | 'safety_refusal';
export class ProviderError extends Error {
  constructor(public code: FailureCode, public retryAfterMs = 0) { super(code); }
}
export function normalizeError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const e = (error&&typeof error==='object'?error:{}) as { status?: number; message?: string; name?: string; error?: { details?: { retryDelay?: string }[] }; headers?: { get?: (key: string) => string | null } };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return new ProviderError('timeout');
  const message = typeof e.message==='string'?e.message:'';
  if(/\b(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|CONTENT_FILTERED)\b/.test(message))return new ProviderError('safety_refusal');
  let details = e.error?.details;
  try { details ??= JSON.parse(message).error?.details; } catch { /* SDK errors may be plain text. */ }
  const delay = Array.isArray(details)?details.find(d => d.retryDelay)?.retryDelay:undefined;
  const retryAfter = e.headers?.get?.('retry-after');
  const retryMs = Math.max(0, delay ? parseFloat(delay) * 1000 : retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 60000);
  if (e.status === 429) return new ProviderError(/per.?day|daily|requestsperday/i.test(message) ? 'quota_exhausted' : 'rate_limited', Number.isFinite(retryMs) ? retryMs : 60000);
  if (e.status === 401 || e.status === 403 || /API_KEY_INVALID/.test(message)) return new ProviderError('invalid_credentials');
  if (e.status === 400 || e.status === 404) return new ProviderError('invalid_model');
  if (e.status && e.status >= 500) return new ProviderError('unavailable');
  return new ProviderError('network');
}

export async function bounded<T>(action: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  if(signal.aborted)throw new ProviderError('timeout');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(AbortSignal.any([signal, controller.signal])),
      new Promise<never>((_resolve, reject) => {
        const cancel = () => reject(new ProviderError('timeout'));
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) controller.abort();
        timer = setTimeout(() => controller.abort(), milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

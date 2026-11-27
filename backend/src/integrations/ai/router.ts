import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { bounded, normalizeError, ProviderError } from './errors.js';
import { GeminiProvider } from './gemini.js';
import type { ConsultationProvider, ConsultationRequest, ConsultationResponse } from './types.js';

export function createAI(config?: Env, geminiOverride?: GeminiProvider, rag?: ConsultationProvider) {
  const gemini = geminiOverride ?? (config ? new GeminiProvider(config) : undefined);
  const demoIds = new Set((config?.AI_DEMO_MEMBER_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
  let concurrent = 0;
  let lastTest: { state: string; at: string; latencyMs?: number; model?: string } | null = null;
  const externalFor = (userId: string) => Boolean(config?.AI_ENABLED && config.AI_EXTERNAL_MODE === 'demo' && demoIds.has(userId));
  const providerOrder = () => [...new Set([config?.AI_PRIMARY_PROVIDER || 'gemini', config?.AI_FALLBACK_PROVIDER || 'local', ...(config?.AI_LOCAL_FALLBACK_ENABLED !== false ? ['local' as const] : [])])];
  async function generate(request: ConsultationRequest, local: ConsultationProvider): Promise<ConsultationResponse> {
    const start = Date.now(), total = config?.AI_TOTAL_TIMEOUT_MS ?? 30000;
    let reason: string | undefined;
    for (const id of providerOrder()) {
      const provider = id === 'gemini' ? gemini : id === 'rag' ? (config?.RAG_ENABLED ? rag : undefined) : local;
      if (id !== 'local' && (!config?.AI_ENABLED || !request.externalAllowed)) { reason = config?.AI_ENABLED ? 'privacy' : 'disabled'; continue; }
      if (id === 'local' && config?.AI_LOCAL_FALLBACK_ENABLED === false) continue;
      if (!provider?.configured) { reason = 'not_configured'; continue; }
      if (id !== 'local' && request.image && !provider.capabilities.imageUnderstanding) { reason = 'unsupported_modality'; continue; }
      if (id !== 'local' && concurrent >= (config?.AI_MAX_CONCURRENT_REQUESTS ?? 2)) { reason = 'busy'; continue; }
      if (id !== 'local' && Date.now()-start>=total) { reason='timeout';continue; }
      try {
        if (id !== 'local') concurrent++;
        const response = await bounded(signal => provider.generate(request, signal), new AbortController().signal, id === 'local' ? 5000 : Math.max(1, total - (Date.now() - start)));
        if (!response.text.trim()) throw new ProviderError('invalid_response');
        return { ...response, mode: request.image&&response.imageAnalyzed ? 'image_understanding' : 'text', fallbackUsed: Boolean(reason)||response.keySlot==='fallback', fallbackReason: reason||response.fallbackReason, correlationId: randomUUID() };
      } catch (error) {
        const failure = normalizeError(error);
        if (failure.code === 'safety_refusal') throw failure;
        reason = failure.code;
      } finally { if (id !== 'local') concurrent--; }
    }
    throw new ProviderError((reason as ProviderError['code']) || 'unavailable');
  }
  function capabilities(userId: string) {
    const status = gemini?.status();
    const externalEnabled = externalFor(userId), order=providerOrder();
    const geminiUsable=order.includes('gemini')&&Boolean(status?.configured)&&['verified','not_tested'].includes(String(status?.state));
    const ragUsable=order.includes('rag')&&Boolean(config?.RAG_ENABLED&&rag?.configured);
    const available = externalEnabled && (geminiUsable||ragUsable);
    return { text: available || config?.AI_LOCAL_FALLBACK_ENABLED !== false, imageAnalysis: available && (geminiUsable || ragUsable&&Boolean(rag?.capabilities.imageUnderstanding)),
      externalEnabled: available, demoAuthorized: externalEnabled, mode: available ? 'external_demo' : 'local', localFallback: config?.AI_LOCAL_FALLBACK_ENABLED !== false,
      connectionVerified: Boolean(status?.lastSuccess), privacyNotice: 'Teks dan foto contoh dapat diproses layanan AI eksternal. Jangan kirim identitas, wajah, nomor HP, alamat, dokumen rahasia, atau data pribadi. Penyaringan otomatis tidak menjamin semua data pribadi terhapus.' };
  }
  return {
    generate, capabilities, externalFor,
    maxContext: config?.AI_MAX_CONTEXT_MESSAGES ?? 12, rateLimit: config?.AI_MAX_REQUESTS_PER_MINUTE ?? 5, totalTimeout: config?.AI_TOTAL_TIMEOUT_MS ?? 30000,
    diagnostics: () => ({ enabled: config?.AI_ENABLED ?? false, primary: config?.AI_PRIMARY_PROVIDER ?? 'gemini', fallback: config?.AI_FALLBACK_PROVIDER ?? 'local',
      localFallback: config?.AI_LOCAL_FALLBACK_ENABLED !== false, externalMode: config?.AI_EXTERNAL_MODE ?? 'off', demoAccountCount: demoIds.size,
      gemini: gemini?.status() ?? { configured: false, state: 'not_configured', model: config?.GEMINI_MODEL ?? 'gemini-3.5-flash-lite', keys: [], lastSuccess: null },
      rag: { configured: Boolean(config?.RAG_ENABLED && rag?.configured), state: rag?.configured ? 'configured' : 'awaiting_contract' }, lastTest }),
    async testConnection() {
      const start = Date.now();
      try {
        if (!config?.AI_ENABLED || config.AI_EXTERNAL_MODE !== 'demo' || !gemini) throw new ProviderError('disabled');
        if (concurrent >= config.AI_MAX_CONCURRENT_REQUESTS) throw new ProviderError('busy');
        concurrent++;
        try {
          const result = await bounded(signal => gemini.generate({ question: 'Sebutkan satu langkah aman menjaga drainase media tanam sorgum.', intent: 'care', context: [], externalAllowed: true }, signal), new AbortController().signal, config.AI_TOTAL_TIMEOUT_MS);
          lastTest = { state: result.refused ? 'safety_refusal' : 'verified', at: new Date().toISOString(), latencyMs: Date.now() - start, model: result.model };
        } finally { concurrent--; }
      } catch (error) { lastTest = { state: normalizeError(error).code, at: new Date().toISOString(), latencyMs: Date.now() - start }; }
      return lastTest;
    },
  };
}
export type AIService = ReturnType<typeof createAI>;

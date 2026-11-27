import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import type { Env } from '../../config/env.js';
import type { ConsultationProvider, ConsultationRequest, ProviderResponse } from './types.js';
import { bounded, normalizeError, ProviderError } from './errors.js';
import { SYSTEM_INSTRUCTION } from './prompts.js';

export type GeminiClient = { models: { generateContent(input: GenerateContentParameters): Promise<GenerateContentResponse> } };
export class GeminiProvider implements ConsultationProvider {
  readonly id = 'gemini';
  readonly capabilities = { text: true, imageUnderstanding: true };
  private slots: { client: GeminiClient; slot: 'primary' | 'fallback'; blockedUntil: number; error?: string }[];
  private blockedUntil = 0;
  private failure?: string;
  private verified?: { at: string; latencyMs: number; model: string; imageAnalyzed: boolean };
  constructor(private config: Pick<Env, 'GEMINI_API_KEY' | 'GEMINI_API_KEY_FALLBACK' | 'GEMINI_MODEL' | 'AI_REQUEST_TIMEOUT_MS' | 'AI_MAX_OUTPUT_TOKENS'>,
    factory: (key: string) => GeminiClient = key => new GoogleGenAI({ apiKey: key, httpOptions: { retryOptions: { attempts: 1 } } })) {
    const keys = [config.GEMINI_API_KEY, config.GEMINI_API_KEY_FALLBACK];
    this.slots = keys.flatMap((key, index) => key && keys.indexOf(key) === index ? [{ client: factory(key), slot: index === 0 ? 'primary' as const : 'fallback' as const, blockedUntil: 0 }] : []);
  }
  get configured() { return this.slots.length > 0; }
  status() {
    return { configured: this.configured, model: this.config.GEMINI_MODEL, keys: this.slots.map(s => ({ slot: s.slot, state: s.blockedUntil > Date.now() ? s.error : 'ready' })),
      state: !this.configured ? 'not_configured' : this.blockedUntil > Date.now() ? this.failure : this.slots.every(s => s.blockedUntil > Date.now()) ? (this.slots.every(s=>s.blockedUntil===Infinity)?'configuration_error':'unavailable') : this.verified ? 'verified' : 'not_tested', lastSuccess: this.verified ?? null };
  }
  async generate(request: ConsultationRequest, signal: AbortSignal): Promise<ProviderResponse> {
    if (!this.configured) throw new ProviderError('not_configured');
    if (this.blockedUntil > Date.now()) throw new ProviderError(this.failure === 'quota_exhausted' ? 'quota_exhausted' : this.failure === 'invalid_model' ? 'invalid_model' : 'rate_limited');
    const start = Date.now();
    let last = new ProviderError((this.failure as ProviderError['code'])||'invalid_credentials');
    for (const slot of this.slots) {
      if (slot.blockedUntil > Date.now()) continue;
      try {
        const parts = [{ text: `Tujuan: ${request.intent}. Jenis yang disebut pengguna: ${request.species || 'belum diketahui'}.\n${request.question}` },
          ...(request.image ? [{ inlineData: { mimeType: request.image.mimeType, data: request.image.data.toString('base64') } }] : [])];
        const response = await bounded(abortSignal => slot.client.models.generateContent({
          model: this.config.GEMINI_MODEL,
          contents: [...request.context.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })), { role: 'user', parts }],
          config: { systemInstruction: SYSTEM_INSTRUCTION, maxOutputTokens: this.config.AI_MAX_OUTPUT_TOKENS, abortSignal,
            httpOptions: { timeout: this.config.AI_REQUEST_TIMEOUT_MS, retryOptions: { attempts: 1 } } },
        }), signal, this.config.AI_REQUEST_TIMEOUT_MS);
        const candidate = response.candidates?.[0];
        const refused = Boolean(response.promptFeedback?.blockReason && response.promptFeedback.blockReason !== 'BLOCKED_REASON_UNSPECIFIED') ||
          Boolean(candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason));
        const text = refused ? 'Permintaan ini belum dapat dijawab oleh layanan AI. Ajukan pertanyaan budidaya yang aman dengan keterangan yang sesuai.' : response.text?.trim();
        if (!text) throw new ProviderError('invalid_response');
        if (text.length > 20000) throw new ProviderError('invalid_response');
        const result: ProviderResponse = { provider: 'gemini', model: response.modelVersion || this.config.GEMINI_MODEL, text, imageAnalyzed: Boolean(request.image) && !refused,
          latencyMs: Date.now() - start, sources: [], keySlot: slot.slot, refused,
          fallbackReason: slot.slot==='fallback'?(this.slots.find(s=>s.slot==='primary')?.error||'primary_unavailable'):undefined,
          usage: { inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount } };
        this.failure = undefined;
        if (!refused) this.verified = { at: new Date().toISOString(), latencyMs: result.latencyMs, model: result.model!, imageAnalyzed: result.imageAnalyzed };
        return result;
      } catch (error) {
        last = normalizeError(error); slot.error = last.code;
        if(last.code==='safety_refusal')throw last;
        if (last.code === 'invalid_credentials') slot.blockedUntil = Infinity;
        else if (last.code === 'invalid_model') { this.failure = last.code; this.blockedUntil = Infinity; throw last; }
        else if (last.code === 'rate_limited' || last.code === 'quota_exhausted') {
          // Project quotas may be shared by both keys. Do not rotate keys to retry exhaustion.
          this.failure = last.code;
          this.blockedUntil = Date.now() + Math.max(last.retryAfterMs, last.code === 'quota_exhausted' ? 86400000 : 60000);
          throw last;
        } else slot.blockedUntil = Date.now() + 15000;
        if (signal.aborted) throw new ProviderError('timeout');
      }
    }
    this.failure = last.code;
    throw last;
  }
}

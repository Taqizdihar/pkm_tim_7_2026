export type ProviderId = 'gemini' | 'rag' | 'local';
export type Intent = 'identify' | 'condition' | 'cause' | 'grow' | 'care';
export interface ConsultationRequest {
  question: string;
  context: { role: 'user' | 'assistant'; text: string }[];
  species?: string;
  intent: Intent;
  image?: { data: Buffer; mimeType: 'image/webp' };
  externalAllowed: boolean;
}
export interface ProviderResponse {
  text: string;
  provider: ProviderId;
  model?: string;
  imageAnalyzed: boolean;
  latencyMs: number;
  sources: string[];
  usage?: { inputTokens?: number; outputTokens?: number };
  keySlot?: 'primary' | 'fallback';
  refused?: boolean;
  fallbackReason?: string;
}
export interface ConsultationResponse extends ProviderResponse {
  mode: 'text' | 'image_understanding';
  fallbackUsed: boolean;
  fallbackReason?: string;
  correlationId: string;
}
export interface ConsultationProvider {
  id: ProviderId;
  configured: boolean;
  capabilities: { text: boolean; imageUnderstanding: boolean };
  generate(request: ConsultationRequest, signal: AbortSignal): Promise<ProviderResponse>;
}

import type { ConsultationProvider } from './ai/types.js';

// Supply a real adapter to createAI only after its contract and privacy policy are agreed.
// No HTTP request is made to RAG_API_URL by the placeholder boundary.
export type RagProvider = ConsultationProvider & { id: 'rag' };

import type { ConsultationProvider } from './types.js';

export function localProvider(reply: (question: string, species?: string) => Promise<string>): ConsultationProvider {
  return {
    id: 'local', configured: true, capabilities: { text: true, imageUnderstanding: false },
    async generate(request) {
      const start = Date.now();
      const text = await reply(request.question, request.species);
      return { provider: 'local', imageAnalyzed: false, text: `${request.image ? 'Foto belum dapat dianalisis saat ini. Berikut panduan umum berdasarkan keterangan yang Anda berikan.\n\n' : ''}${text}`, latencyMs: Date.now() - start, sources: [] };
    },
  };
}

// Server-side integration boundary. Add a provider only after its API contract and
// credentials are available; current consultation remains local in the frontend.
export interface RagProvider {
  answer(input: { question: string; userId: string }): Promise<{ answer: string; sources?: string[] }>;
}

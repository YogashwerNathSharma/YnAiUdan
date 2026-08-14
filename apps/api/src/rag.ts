import { db } from "./db.js";
import { embedText, cosineSimilarity } from "./memory-embedding.js";

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 250;

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = normalized.slice(start, start + CHUNK_SIZE).trim();
    if (chunk) chunks.push(chunk);
    if (start + CHUNK_SIZE >= normalized.length) break;
  }
  return chunks;
}

export async function ingestKnowledge(input: { tenantId: string; userId: string; projectId?: string; title: string; source?: string; text: string }) {
  const chunks = chunkText(input.text);
  if (!chunks.length) throw new Error("Knowledge document is empty");
  const document = await db.knowledgeDocument.create({ data: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, title: input.title.slice(0, 300), source: input.source?.slice(0, 1000), status: "PROCESSING" } });
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const text = chunks[index]!;
      const embedding = await embedText(text);
      await db.knowledgeChunk.create({ data: { documentId: document.id, chunkIndex: index, content: text, embedding: embedding?.vector, embeddingModel: embedding?.model } });
    }
    return db.knowledgeDocument.update({ where: { id: document.id }, data: { status: "READY", chunkCount: chunks.length } });
  } catch (error) {
    await db.knowledgeDocument.update({ where: { id: document.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Knowledge ingestion failed" } });
    throw error;
  }
}

export async function retrieveKnowledge(query: string, context: { tenantId: string; userId: string; projectId?: string; limit?: number }) {
  const limit = Math.min(context.limit ?? 6, 20);
  const embedding = await embedText(query);
  const chunks = await db.knowledgeChunk.findMany({ where: { document: { tenantId: context.tenantId, userId: context.userId, status: "READY", OR: [{ projectId: context.projectId ?? undefined }, { projectId: null }] } }, include: { document: true }, take: 200 });
  const queryWords = new Set(query.toLowerCase().split(/\W+/).filter(word => word.length >= 3));
  return chunks.map(chunk => {
    const keyword = [...queryWords].filter(word => chunk.content.toLowerCase().includes(word)).length / Math.max(queryWords.size, 1);
    const semantic = embedding ? cosineSimilarity(embedding.vector, chunk.embedding) : 0;
    const projectBoost = chunk.document.projectId === context.projectId ? 0.1 : 0;
    return { chunk, score: semantic * 0.7 + keyword * 0.2 + projectBoost };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

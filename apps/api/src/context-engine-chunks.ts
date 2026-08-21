import { chunkSourceFile, selectRelevantChunks, type CodeChunk } from "./code-chunk-context.js";
import type { ContextPackage } from "./context-engine.js";

export type ContextChunkPackage = ContextPackage & { chunks: CodeChunk[] };

export function addRelevantChunks(context: ContextPackage, task: string, maxChunks = 20): ContextChunkPackage {
  const allChunks = context.files.flatMap(file => chunkSourceFile(file.path, file.content));
  const chunks = selectRelevantChunks(task, allChunks, Math.min(50, Math.max(1, maxChunks)));
  return { ...context, chunks };
}

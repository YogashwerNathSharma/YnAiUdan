import { createHash } from "node:crypto";
import { db } from "./db.js";
import { appendExecutionEvidence } from "./universal-execution-ledger.js";

export type ArtifactInput = {
  taskId: string;
  tenantId: string;
  userId?: string;
  artifactType: string;
  name: string;
  path?: string;
  content: string | Buffer;
  agent?: string;
  tool?: string;
  sourceStepId?: string;
  verificationStatus?: string;
  provenance?: Record<string, unknown>;
};

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function recordArtifact(input: ArtifactInput) {
  const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
  const digest = sha256(content);
  const artifact = await db.artifact.upsert({
    where: { taskId_sha256: { taskId: input.taskId, sha256: digest } },
    create: {
      taskId: input.taskId,
      tenantId: input.tenantId,
      userId: input.userId,
      artifactType: input.artifactType,
      name: input.name,
      path: input.path,
      sha256: digest,
      sizeBytes: content.byteLength,
      agent: input.agent,
      tool: input.tool,
      sourceStepId: input.sourceStepId,
      verificationStatus: input.verificationStatus ?? "UNVERIFIED",
      provenance: input.provenance,
    },
    update: {
      name: input.name,
      path: input.path,
      sizeBytes: content.byteLength,
      agent: input.agent,
      tool: input.tool,
      sourceStepId: input.sourceStepId,
      verificationStatus: input.verificationStatus ?? "UNVERIFIED",
      provenance: input.provenance,
    },
  });
  await appendExecutionEvidence(input.taskId, input.tenantId, {
    kind: "ARTIFACT_CREATED",
    actor: "AGENT",
    summary: `Artifact ${input.name} recorded with SHA-256 provenance`,
    data: { artifactId: artifact.id, artifactType: input.artifactType, path: input.path, sha256: digest, sizeBytes: content.byteLength, tool: input.tool, agent: input.agent, sourceStepId: input.sourceStepId },
  }).catch(() => undefined);
  return artifact;
}

export async function getTaskArtifacts(taskId: string, tenantId: string) {
  return db.artifact.findMany({ where: { taskId, tenantId }, orderBy: { createdAt: "asc" } });
}

export async function verifyArtifactHash(taskId: string, tenantId: string, artifactId: string, content: string | Buffer) {
  const artifact = await db.artifact.findFirst({ where: { id: artifactId, taskId, tenantId } });
  if (!artifact) return { verified: false, reason: "ARTIFACT_NOT_FOUND" as const };
  const actual = sha256(content);
  const verified = actual === artifact.sha256;
  if (verified && artifact.verificationStatus !== "VERIFIED") {
    await db.artifact.update({ where: { id: artifact.id }, data: { verificationStatus: "VERIFIED" } });
  }
  return { verified, expectedSha256: artifact.sha256, actualSha256: actual };
}

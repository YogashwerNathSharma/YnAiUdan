export type ArtifactKind = "WEB_APP" | "ANDROID_APP" | "API" | "DATABASE" | "IMAGE" | "VIDEO" | "OTHER";
export type ArtifactStatus = "PLANNED" | "GENERATING" | "GENERATED" | "VERIFIED" | "FAILED";

export type ArtifactSpec = {
  id: string;
  kind: ArtifactKind;
  name: string;
  target: string;
  sourceWorkItemId: string;
  dependsOn: string[];
  status: ArtifactStatus;
  acceptanceCriteria: string[];
};

export type ArtifactBuildResult = {
  artifactId: string;
  status: ArtifactStatus;
  files: string[];
  evidence: string[];
  verification: string[];
  architectureChanges: string[];
};

export function createArtifactSpec(input: Omit<ArtifactSpec, "status">): ArtifactSpec {
  return { ...input, status: "PLANNED" };
}

export function validateArtifactResult(spec: ArtifactSpec, result: ArtifactBuildResult): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (result.artifactId !== spec.id) reasons.push("ARTIFACT_MISMATCH");
  if (result.status !== "VERIFIED") reasons.push("ARTIFACT_NOT_VERIFIED");
  if (!result.files.length) reasons.push("NO_ARTIFACT_FILES");
  if (!result.evidence.length) reasons.push("NO_BUILD_EVIDENCE");
  if (!result.verification.length) reasons.push("NO_VERIFICATION");
  return { valid: reasons.length === 0, reasons };
}

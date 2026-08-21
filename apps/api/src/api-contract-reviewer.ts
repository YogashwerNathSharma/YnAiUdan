export type ContractFinding = { severity: "HIGH" | "MEDIUM" | "LOW"; rule: string; message: string; path?: string };
export type ApiContractReview = { approved: boolean; findings: ContractFinding[] };

export function reviewApiContracts(files: Array<{ path: string; content: string }>): ApiContractReview {
  const findings: ContractFinding[] = [];
  for (const file of files) {
    if (!/(routes|api)/i.test(file.path)) continue;
    if (/req\.body\b/.test(file.content) && !/(zod|schema|validate|validator)/i.test(file.content)) findings.push({ severity: "MEDIUM", rule: "UNVALIDATED_BODY", message: "Request body appears to be used without visible schema validation.", path: file.path });
    if (/req\.(params|query)\b/.test(file.content) && !/(zod|schema|validate|validator)/i.test(file.content)) findings.push({ severity: "MEDIUM", rule: "UNVALIDATED_INPUT", message: "Route parameters/query input appear to lack visible validation.", path: file.path });
    if (/status\(500\).*send\([^)]*error/i.test(file.content) || /reply\.status\(500\).*send\([^)]*error/i.test(file.content)) findings.push({ severity: "LOW", rule: "ERROR_LEAK", message: "Internal error details may be exposed through a 500 response.", path: file.path });
  }
  return { approved: !findings.some(f => f.severity === "HIGH"), findings };
}

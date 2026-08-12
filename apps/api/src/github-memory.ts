import { z } from "zod";

export const githubProjectContextSchema = z.object({
  repository: z.object({ owner: z.string(), name: z.string(), defaultBranch: z.string().optional() }),
  workingBranch: z.string().optional(),
  lastInspectedAt: z.string().datetime().optional()
});
export type GitHubProjectContext = z.infer<typeof githubProjectContextSchema>;

export function createGitHubContext(input: unknown): GitHubProjectContext { return githubProjectContextSchema.parse(input); }

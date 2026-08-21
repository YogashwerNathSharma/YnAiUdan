import { z } from "zod";

export type ToolRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ToolExecutionContext = { userId?: string; tenantId?: string; projectId?: string };
export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  risk: ToolRisk;
  permissions: string[];
  timeoutMs: number;
  execute: (input: TInput, context?: ToolExecutionContext) => Promise<TOutput>;
};

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool as ToolDefinition);
  }
  get(name: string): ToolDefinition | undefined { return this.tools.get(name); }
  list(): Array<Pick<ToolDefinition, "name" | "description" | "risk" | "permissions" | "timeoutMs">> {
    return [...this.tools.values()].map(({ name, description, risk, permissions, timeoutMs }) => ({ name, description, risk, permissions, timeoutMs }));
  }
}

export const toolRegistry = new ToolRegistry();

toolRegistry.register({
  name: "system.echo",
  description: "Return a supplied string. Development-safe tool used to validate the tool execution pipeline.",
  inputSchema: z.object({ text: z.string().max(10_000) }),
  risk: "LOW",
  permissions: [],
  timeoutMs: 5_000,
  execute: async ({ text }) => ({ text })
});

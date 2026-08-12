import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";

type AuthPayload = { tenantId: string };
const urlSchema = z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !['localhost','127.0.0.1','0.0.0.0','::1'].includes(url.hostname); }, "Only public HTTPS URLs are allowed");
const searchSchema = z.object({ query: z.string().trim().min(2).max(500), maxResults: z.number().int().min(1).max(10).default(5) });
const openSchema = z.object({ url: urlSchema });

export type ResearchSource = { url: string; title?: string; content: string };

async function fetchPublicPage(url: string): Promise<ResearchSource> {
  const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "YnAiUdan-Research/0.1" }, signal: AbortSignal.timeout(15_000) });
  if ([301,302,303,307,308].includes(response.status)) throw new Error("Redirects are disabled for safe research fetches");
  if (!response.ok) throw new Error(`Research fetch failed: HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("text/plain") && !type.includes("application/json")) throw new Error("Unsupported response content type");
  const text = (await response.text()).slice(0, 500_000);
  return { url, title: text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim(), content: text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100_000) };
}

export function registerResearchTools(): void {
  if (!toolRegistry.get("web.open")) toolRegistry.register({ name: "web.open", description: "Open a public HTTPS web page with SSRF-safe restrictions.", inputSchema: openSchema, risk: "LOW", permissions: [], timeoutMs: 20_000, execute: async ({ url }) => fetchPublicPage(url) });
}

export async function registerResearchRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/research/open", { preHandler: authenticate }, async (request, reply) => { const input = openSchema.parse(request.body); try { return reply.send(await fetchPublicPage(input.url)); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Research request failed" }); } });
  app.post("/api/v1/research/search", { preHandler: authenticate }, async (request, reply) => { const input = searchSchema.parse(request.body); return reply.send({ query: input.query, results: [], status: "SEARCH_PROVIDER_REQUIRED", message: "Search provider adapter is not configured yet; no fabricated results are returned." }); });
}

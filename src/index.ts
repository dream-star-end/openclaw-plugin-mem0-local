/**
 * OpenClaw Memory (mem0-local) Plugin
 *
 * Long-term memory via local mem0 server:
 * DeepSeek LLM + DashScope embedding + ChromaDB vector store.
 * Compatible with mem0 API, runs entirely on localhost.
 */

import { Type } from "@sinclair/typebox";
import { mem0LocalConfigSchema, type Mem0LocalConfig } from "./config";
import { Mem0Client } from "./client";

// Type stubs for OpenClaw Plugin API (since we can't import directly)
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
}

interface OpenClawPluginApi {
  pluginConfig: unknown;
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
  registerTool(
    def: {
      name: string;
      label: string;
      description: string;
      parameters: unknown;
      execute(toolCallId: string, params: Record<string, unknown>): Promise<ToolResult>;
    },
    opts: { name: string }
  ): void;
  registerCli(
    fn: (ctx: { program: any }) => void,
    opts: { commands: string[] }
  ): void;
  registerService(svc: {
    id: string;
    start: () => Promise<void>;
    stop: () => void;
  }): void;
  on(
    event: string,
    handler: (event: any, ctx?: any) => Promise<any>
  ): void;
}

// Unified user_id — all agents share the same memory pool
const UNIFIED_USER_ID = "openclaw";

const mem0Plugin = {
  id: "memory-mem0-local",
  name: "Memory (mem0 Local)",
  description:
    "Local mem0 memory server: DeepSeek LLM + DashScope embedding + ChromaDB. No cloud dependency for vector storage.",
  kind: "memory" as const,
  configSchema: mem0LocalConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg: Mem0LocalConfig = mem0LocalConfigSchema.parse(api.pluginConfig);
    const client = new Mem0Client(cfg.endpoint);

    api.logger.info(
      `memory-mem0-local: registered (endpoint: ${cfg.endpoint}, autoCapture: ${cfg.autoCapture}, autoRecall: ${cfg.autoRecall})`
    );

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "memory_recall",
        label: "Memory Recall",
        description:
          "Search through long-term memories. Use when you need context about user preferences, past decisions, or previously discussed topics.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query" }),
          limit: Type.Optional(
            Type.Number({ description: "Max results (default: 5)" })
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const query = params.query as string;
          const limit = (params.limit as number) ?? 5;
          const userId = UNIFIED_USER_ID;
          try {
            const results = await client.search(
              query,
              userId,
              limit,
              cfg.scoreThreshold
            );
            if (results.length === 0) {
              return {
                content: [
                  { type: "text", text: "No relevant memories found." },
                ],
                details: { count: 0 },
              };
            }
            const text = results
              .map(
                (r, i) =>
                  `${i + 1}. ${r.memory} (score: ${(r.score ?? 0).toFixed(3)})`
              )
              .join("\n");
            return {
              content: [
                {
                  type: "text",
                  text: `Found ${results.length} memories:\n\n${text}`,
                },
              ],
              details: {
                count: results.length,
                memories: results.map((r) => ({
                  id: r.id,
                  text: r.memory,
                  score: r.score,
                })),
              },
            };
          } catch (err) {
            api.logger.warn(
              `memory-mem0-local: recall failed: ${String(err)}`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Memory search failed: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "memory_recall" }
    );

    api.registerTool(
      {
        name: "memory_store",
        label: "Memory Store",
        description:
          "Save important information in long-term memory. Use for preferences, facts, decisions, and other information worth remembering across sessions.",
        parameters: Type.Object({
          text: Type.String({
            description: "Information to remember",
          }),
          importance: Type.Optional(
            Type.Number({
              description: "Importance 0-1 (default: 0.7)",
            })
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const text = params.text as string;
          const importance = (params.importance as number) ?? 0.7;
          const userId = UNIFIED_USER_ID;
          try {
            const result = await client.add(text, userId, { importance });
            return {
              content: [
                { type: "text", text: "Memory stored successfully." },
              ],
              details: { action: "stored", result },
            };
          } catch (err) {
            api.logger.warn(
              `memory-mem0-local: store failed: ${String(err)}`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to store memory: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "memory_store" }
    );

    api.registerTool(
      {
        name: "memory_forget",
        label: "Memory Forget",
        description: "Delete specific memories from long-term storage.",
        parameters: Type.Object({
          query: Type.Optional(
            Type.String({ description: "Search to find memory to delete" })
          ),
          memoryId: Type.Optional(
            Type.String({ description: "Specific memory ID to delete" })
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const query = params.query as string | undefined;
          const memoryId = params.memoryId as string | undefined;
          try {
            if (memoryId) {
              await client.delete(memoryId);
              return {
                content: [
                  {
                    type: "text",
                    text: `Memory ${memoryId} forgotten.`,
                  },
                ],
                details: { action: "deleted", id: memoryId },
              };
            }
            if (query) {
              const results = await client.search(
                query,
                UNIFIED_USER_ID,
                5,
                cfg.scoreThreshold
              );
              if (results.length === 0) {
                return {
                  content: [
                    { type: "text", text: "No matching memories found." },
                  ],
                  details: { found: 0 },
                };
              }
              const list = results
                .map(
                  (r) =>
                    `- [${r.id.slice(0, 8)}] ${r.memory.slice(0, 80)}...`
                )
                .join("\n");
              return {
                content: [
                  {
                    type: "text",
                    text: `Found ${results.length} candidates. Specify memoryId to delete:\n${list}`,
                  },
                ],
                details: {
                  action: "candidates",
                  candidates: results.map((r) => ({
                    id: r.id,
                    text: r.memory,
                    score: r.score,
                  })),
                },
              };
            }
            return {
              content: [
                { type: "text", text: "Provide query or memoryId." },
              ],
              details: { error: "missing_param" },
            };
          } catch (err) {
            api.logger.warn(
              `memory-mem0-local: forget failed: ${String(err)}`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to forget: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "memory_forget" }
    );

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }: { program: any }) => {
        const mem0 = program
          .command("mem0")
          .description("Local mem0 memory commands");

        mem0
          .command("search")
          .description("Search memories")
          .argument("<query>", "Search query")
          .option("--user <id>", "User/agent ID", "default")
          .option("--limit <n>", "Max results", "5")
          .action(async (query: string, opts: any) => {
            const results = await client.search(
              query,
              opts.user,
              parseInt(opts.limit, 10),
              cfg.scoreThreshold
            );
            console.log(JSON.stringify(results, null, 2));
          });

        mem0
          .command("add")
          .description("Add a memory")
          .argument("<text>", "Content to store")
          .option("--user <id>", "User/agent ID", "default")
          .action(async (text: string, opts: any) => {
            const result = await client.add(text.trim(), opts.user);
            console.log("Stored:", JSON.stringify(result, null, 2));
          });

        mem0
          .command("list")
          .description("List all memories")
          .option("--user <id>", "User/agent ID")
          .action(async (opts: any) => {
            const items = await client.list(opts.user);
            console.log(JSON.stringify(items, null, 2));
          });

        mem0
          .command("delete")
          .description("Delete a memory by ID")
          .argument("<memoryId>", "Memory ID")
          .action(async (memoryId: string) => {
            await client.delete(memoryId.trim());
            console.log(`Memory ${memoryId} deleted.`);
          });

        mem0
          .command("health")
          .description("Check mem0 server connectivity")
          .action(async () => {
            try {
              const h = await client.health();
              console.log(
                `mem0: ${h.status === "ok" ? "OK" : "FAIL"} — ${h.total_memories} memories`
              );
              if (h.status !== "ok") process.exitCode = 1;
            } catch (err) {
              console.error("mem0 health check failed:", err);
              process.exitCode = 1;
            }
          });
      },
      { commands: ["mem0"] }
    );

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    if (cfg.autoRecall) {
      api.on("before_agent_start", async (event: any, ctx?: any) => {
        if (!event.prompt || event.prompt.length < 5) return;
        const userId = UNIFIED_USER_ID;
        try {
          const results = await client.search(
            event.prompt,
            userId,
            3,
            cfg.scoreThreshold
          );
          if (results.length === 0) return;

          const memoryContext = results
            .map((r) => `- ${r.memory}`)
            .join("\n");

          api.logger.info(
            `memory-mem0-local: injecting ${results.length} memories (user: ${userId})`
          );

          return {
            prependContext: `<relevant-memories>\nThe following memories from long-term storage may be relevant:\n${memoryContext}\n</relevant-memories>`,
          };
        } catch (err) {
          api.logger.warn(
            `memory-mem0-local: autoRecall failed: ${String(err)}`
          );
        }
      });
    }

    if (cfg.autoCapture) {
      api.on("agent_end", async (event: any, ctx?: any) => {
        if (!event.success || !event.messages || event.messages.length === 0)
          return;

        const userId = UNIFIED_USER_ID;
        try {
          const texts: string[] = [];
          for (const msg of event.messages) {
            if (!msg || typeof msg !== "object") continue;
            const role = (msg as any).role;
            if (role !== "user" && role !== "assistant") continue;
            const content = (msg as any).content;
            if (typeof content === "string") {
              texts.push(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block?.type === "text" &&
                  typeof block.text === "string"
                ) {
                  texts.push(block.text);
                }
              }
            }
          }

          const MIN_LEN = 10;
          const MAX_CHUNK_LEN = 6000;
          const MAX_CHUNKS = 3;

          const sanitized = texts
            .filter((t) => t.trim().length >= MIN_LEN)
            .map((t) => t.trim())
            .filter(
              (t) =>
                !t.includes("<relevant-memories>") &&
                !(t.startsWith("<") && t.includes("</"))
            );

          if (sanitized.length === 0) return;

          const combined = sanitized.join("\n\n");
          const chunks: string[] = [];
          for (let i = 0; i < combined.length; i += MAX_CHUNK_LEN) {
            if (chunks.length >= MAX_CHUNKS) break;
            chunks.push(combined.slice(i, i + MAX_CHUNK_LEN));
          }

          let submitted = 0;
          for (const chunk of chunks) {
            await client.add(chunk, userId);
            submitted++;
          }

          if (submitted > 0) {
            api.logger.info(
              `memory-mem0-local: auto-captured ${submitted} chunk(s) (user: ${userId})`
            );
          }
        } catch (err) {
          api.logger.warn(
            `memory-mem0-local: autoCapture failed: ${String(err)}`
          );
        }
      });
    }

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "memory-mem0-local",
      start: async () => {
        try {
          const h = await client.health();
          api.logger.info(
            `memory-mem0-local: initialized (${h.total_memories} memories, status: ${h.status})`
          );
        } catch (err) {
          api.logger.warn(
            `memory-mem0-local: health check failed at startup: ${String(err)}`
          );
        }
      },
      stop: () => {
        api.logger.info("memory-mem0-local: stopped");
      },
    });
  },
};

export default mem0Plugin;

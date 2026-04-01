/**
 * Configuration for mem0-local plugin.
 */

export interface Mem0LocalConfig {
  endpoint: string;
  autoCapture: boolean;
  autoRecall: boolean;
  scoreThreshold: number;
}

export const mem0LocalConfigSchema = {
  parse(value: unknown): Mem0LocalConfig {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : "http://127.0.0.1:8300",
      autoCapture: typeof raw.autoCapture === "boolean" ? raw.autoCapture : true,
      autoRecall: typeof raw.autoRecall === "boolean" ? raw.autoRecall : true,
      // Score = distance (lower = more relevant). Default threshold 1.5.
      scoreThreshold: typeof raw.scoreThreshold === "number" ? raw.scoreThreshold : 1.5,
    };
  },
};

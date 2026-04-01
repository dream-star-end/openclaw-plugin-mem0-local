/**
 * HTTP client for local mem0 server API.
 */

export interface Mem0Memory {
  id: string;
  memory: string;
  score?: number;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0SearchResult {
  results: Mem0Memory[];
  total_raw: number;
  threshold: number;
}

export interface Mem0HealthResult {
  status: string;
  service: string;
  total_memories: number;
  [key: string]: unknown;
}

export class Mem0Client {
  private endpoint: string;
  private timeout: number;

  constructor(endpoint: string, timeout = 30000) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.timeout = timeout;
  }

  private async fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      if (!res.ok) {
        throw new Error(`mem0 API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: string, userId: string, limit = 5, threshold?: number): Promise<Mem0Memory[]> {
    const body: Record<string, unknown> = { query, user_id: userId, limit };
    if (threshold !== undefined) body.threshold = threshold;
    const data = await this.fetchJson<Mem0SearchResult>("/api/memory/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data.results || [];
  }

  async add(text: string, userId: string, metadata?: Record<string, unknown>): Promise<unknown> {
    const body: Record<string, unknown> = { text, user_id: userId };
    if (metadata) body.metadata = metadata;
    return this.fetchJson("/api/memory/add", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async list(userId?: string): Promise<Mem0Memory[]> {
    const body: Record<string, unknown> = {};
    if (userId) body.user_id = userId;
    const data = await this.fetchJson<{ memories: Mem0Memory[] }>("/api/memory/list", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data.memories || [];
  }

  async delete(memoryId: string): Promise<void> {
    await this.fetchJson("/api/memory/delete", {
      method: "POST",
      body: JSON.stringify({ memory_id: memoryId }),
    });
  }

  async health(): Promise<Mem0HealthResult> {
    return this.fetchJson<Mem0HealthResult>("/api/health");
  }
}

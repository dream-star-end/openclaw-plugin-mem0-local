# openclaw-plugin-mem0-local

🧠 Local long-term memory plugin for [OpenClaw](https://github.com/openclaw/openclaw), powered by [mem0](https://github.com/mem0ai/mem0).

**Stack**: DeepSeek LLM (fact extraction & dedup) → DashScope text-embedding-v4 (vectorization) → ChromaDB (local vector store)

> No cloud vector DB needed. Everything runs on your machine.

## Features

- **Auto-Recall**: Automatically injects relevant memories before each conversation turn
- **Auto-Capture**: Automatically extracts and stores important facts after each turn
- **3 Agent Tools**: `memory_recall`, `memory_store`, `memory_forget`
- **CLI Commands**: `openclaw mem0 search/add/list/delete/health`
- **Cross-Agent Memory**: All agents share a unified memory pool (configurable)
- **Smart Dedup**: mem0 uses LLM to detect duplicates and update conflicting facts

## Architecture

```
OpenClaw Gateway
  └── openclaw-plugin-mem0-local (TypeScript plugin)
        ├── autoRecall → search mem0 → inject context
        ├── autoCapture → extract facts → store in mem0
        └── tools: memory_recall / memory_store / memory_forget
              ↕ HTTP (localhost)
        mem0_server.py (Flask, 127.0.0.1:8300)
        ├── LLM: DeepSeek (fact extraction)
        ├── Embedding: DashScope text-embedding-v4 (1024d)
        └── ChromaDB (local vector store)
```

## Quick Start

### 1. Set up mem0 server

```bash
cd server
chmod +x setup.sh
./setup.sh
```

### 2. Configure API keys

```bash
export MEM0_LLM_API_KEY="your-deepseek-api-key"
export MEM0_EMBEDDER_API_KEY="your-dashscope-api-key"
```

### 3. Start the server

```bash
# Manual
./server/venv/bin/python3 server/mem0_server.py

# Or auto-start on macOS
cp launchd/ai.openclaw.mem0.plist ~/Library/LaunchAgents/
# Edit the plist with your paths and API keys
launchctl load ~/Library/LaunchAgents/ai.openclaw.mem0.plist
```

### 4. Build and install the plugin

```bash
npm install
npm run build
```

### 5. Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["memory-mem0-local"],
    "load": {
      "paths": ["/path/to/openclaw-plugin-mem0-local"]
    },
    "slots": {
      "memory": "memory-mem0-local"
    },
    "entries": {
      "memory-mem0-local": {
        "enabled": true,
        "config": {
          "endpoint": "http://127.0.0.1:8300",
          "autoCapture": true,
          "autoRecall": true,
          "scoreThreshold": 1.5
        }
      }
    }
  }
}
```

Restart the OpenClaw gateway.

### 6. Import existing memories (optional)

```bash
cd server
./venv/bin/python3 import_openclaw_memories.py
```

Imports `MEMORY.md` and `TOOLS.md` from all OpenClaw agent workspaces.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/memory/add` | Add memory (`{text, user_id, metadata}`) |
| POST | `/api/memory/search` | Semantic search (`{query, user_id, limit, threshold}`) |
| POST | `/api/memory/list` | List all memories (`{user_id}`) |
| POST | `/api/memory/delete` | Delete memory (`{memory_id}`) |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `endpoint` | `http://127.0.0.1:8300` | mem0 server URL |
| `autoCapture` | `true` | Auto-store facts from conversations |
| `autoRecall` | `true` | Auto-inject relevant memories |
| `scoreThreshold` | `1.5` | Distance threshold (lower = stricter) |

### Environment Variables (server)

| Variable | Default | Description |
|----------|---------|-------------|
| `MEM0_LLM_API_KEY` | — | DeepSeek API key |
| `MEM0_EMBEDDER_API_KEY` | — | DashScope API key |
| `MEM0_CHROMA_PATH` | `~/.openclaw/mem0-local/chroma_db` | ChromaDB storage path |
| `MEM0_PORT` | `8300` | Server port |
| `MEM0_SCORE_THRESHOLD` | `1.5` | Default search threshold |

## Important Notes

- **Score = distance** (not similarity). Lower scores mean more relevant results.
- **Unified user_id**: By default all agents share `user_id: "openclaw"`. Memories are cross-agent.
- **Conflict resolution**: mem0 uses LLM to detect and merge conflicting facts. UPDATE overwrites the old memory (no version history).
- **Backup**: Back up `~/.openclaw/mem0-local/chroma_db/` to preserve your memories.

## 中文说明

本插件为 OpenClaw 提供基于 mem0 的本地长期记忆能力。

- **LLM**: DeepSeek（事实提取与去重）
- **Embedding**: 阿里百炼 DashScope text-embedding-v4
- **向量存储**: ChromaDB（本地）
- **自动召回**: 每轮对话前自动搜索相关记忆注入上下文
- **自动捕获**: 每轮对话后自动提取重要信息存入记忆
- **跨 Agent 共享**: 所有 Agent 共用同一份记忆池

## License

MIT

---
name: mem0-local-memory
description: 本地 mem0 长期记忆系统。使用 DeepSeek LLM + DashScope Embedding + ChromaDB 向量存储，为 OpenClaw 所有 Agent 提供跨会话语义记忆。当用户提到"安装mem0"、"本地记忆"、"mem0记忆系统"、"长期记忆"、"记忆服务"、"向量记忆"时使用此技能。
---

# mem0 Local Memory System

Local long-term memory for OpenClaw agents via mem0 + ChromaDB.

## Architecture

- **mem0 Server** (`~/.openclaw/mem0-local/mem0_server.py`): Python Flask API on `127.0.0.1:8300`
- **OpenClaw Plugin** (`~/.openclaw/plugins/openclaw-plugin-mem0-local/`): TypeScript plugin providing `memory_recall`, `memory_store`, `memory_forget` tools
- **Stack**: DeepSeek LLM (fact extraction) → DashScope Embedding (vectorization) → ChromaDB (local vector store)

## Installation

### Step 1: Set up mem0 server

```bash
cd ~/.openclaw/mem0-local
chmod +x setup.sh
./setup.sh
```

Or run the bundled script: `scripts/setup.sh`

The script creates a Python venv and installs dependencies (mem0ai, flask, chromadb, openai).

### Step 2: Configure API keys

Edit `~/.openclaw/mem0-local/mem0_server.py` or set environment variables:

```bash
export MEM0_LLM_API_KEY="your-deepseek-key"
export MEM0_EMBEDDER_API_KEY="your-dashscope-key"
```

### Step 3: Start the server

**Manual:**
```bash
~/.openclaw/mem0-local/venv/bin/python3 ~/.openclaw/mem0-local/mem0_server.py
```

**Auto-start (macOS launchd):**

Copy the plist template (see `~/.openclaw/mem0-local/ai.openclaw.mem0.plist`):

```bash
cp ~/.openclaw/mem0-local/ai.openclaw.mem0.plist ~/Library/LaunchAgents/
# Edit the plist: replace paths and API keys with your own values
launchctl load ~/Library/LaunchAgents/ai.openclaw.mem0.plist
```

### Step 4: Build and register the plugin

```bash
cd ~/.openclaw/plugins/openclaw-plugin-mem0-local
npm install && npm run build
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "memory-mem0-local": {
        "enabled": true,
        "package": "~/.openclaw/plugins/openclaw-plugin-mem0-local",
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

## Importing Existing Memories

Import MEMORY.md and TOOLS.md from all agent workspaces:

```bash
cd ~/.openclaw/mem0-local
./venv/bin/python3 import_openclaw_memories.py
```

Or use the bundled script: `scripts/import_openclaw_memories.py`

The script splits files by Markdown sections and adds each as a separate memory with source metadata.

## Verification

```bash
# Health check
curl http://127.0.0.1:8300/api/health

# Search via CLI
openclaw mem0 search "test query"

# List all memories
openclaw mem0 list
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused :8300` | Server not running | Start server or check launchd status: `launchctl list | grep mem0` |
| `mem0 API error: 500` | LLM/embedding API issue | Check API keys; check proxy settings if behind firewall |
| Search returns nothing | Threshold too strict or no matching memories | Increase `scoreThreshold` (e.g. 2.0) or check `openclaw mem0 list` |
| Duplicate memories | Normal — mem0 may create near-duplicates | mem0 deduplicates via LLM fact extraction; near-duplicates resolve over time |

## Important Notes

- **Score = distance** (not similarity). Lower scores = more relevant. The default threshold (1.5) is permissive; tighten to 0.8–1.0 for precision.
- **Unified user_id**: All agents share `user_id: "openclaw"`. Memories are cross-agent by design.
- **Memory conflicts**: When mem0 detects a new fact contradicting an existing memory, it updates the existing one (LLM-driven deduplication).
- **Data location**: ChromaDB data at `~/.openclaw/mem0-local/chroma_db/`. Back up this directory to preserve memories.
- **Proxy**: If your network requires a proxy for DeepSeek/DashScope API calls, set `HTTP_PROXY`/`HTTPS_PROXY` in the launchd plist or environment.

## Key Files

- `~/.openclaw/mem0-local/mem0_server.py` — Server source
- `~/.openclaw/mem0-local/setup.sh` — Installation script
- `~/.openclaw/mem0-local/ai.openclaw.mem0.plist` — launchd config
- `~/.openclaw/mem0-local/import_openclaw_memories.py` — Bulk import script
- `~/.openclaw/mem0-local/requirements.txt` — Python dependencies

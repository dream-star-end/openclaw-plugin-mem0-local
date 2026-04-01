#!/usr/bin/env python3
"""
Local mem0 memory server for OpenClaw.
Binds to 127.0.0.1 only (no external access).
"""
import socket
_orig = socket.getaddrinfo
def _ipv4_only(*args, **kwargs):
    return [r for r in _orig(*args, **kwargs) if r[0] == socket.AF_INET]
socket.getaddrinfo = _ipv4_only

import os
import logging

# API keys from env with defaults
LLM_API_KEY = os.environ.get("MEM0_LLM_API_KEY", "YOUR_DEEPSEEK_API_KEY")
EMBEDDER_API_KEY = os.environ.get("MEM0_EMBEDDER_API_KEY", "YOUR_DASHSCOPE_API_KEY")
CHROMA_PATH = os.environ.get("MEM0_CHROMA_PATH", os.path.expanduser("~/.openclaw/mem0-local/chroma_db"))
PORT = int(os.environ.get("MEM0_PORT", "8300"))
# Score = distance (lower = more relevant). Filter out results above this threshold.
SCORE_THRESHOLD = float(os.environ.get("MEM0_SCORE_THRESHOLD", "1.5"))

os.environ["OPENAI_API_KEY"] = LLM_API_KEY

from flask import Flask, request, jsonify
from mem0 import Memory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("mem0-local")

config = {
    "llm": {"provider": "openai", "config": {
        "model": "deepseek-chat",
        "api_key": LLM_API_KEY,
        "openai_base_url": "https://api.deepseek.com/v1"
    }},
    "embedder": {"provider": "openai", "config": {
        "model": "text-embedding-v4",
        "api_key": EMBEDDER_API_KEY,
        "openai_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "embedding_dims": 1024
    }},
    "vector_store": {"provider": "chroma", "config": {
        "collection_name": "openclaw_memories",
        "path": CHROMA_PATH
    }},
    "version": "v1.1"
}

logger.info(f"Initializing mem0 with ChromaDB at {CHROMA_PATH}")
memory = Memory.from_config(config)
app = Flask(__name__)


@app.route("/api/memory/add", methods=["POST"])
def add_memory():
    data = request.json
    if not data or "text" not in data:
        return jsonify({"ok": False, "error": "missing 'text' field"}), 400
    result = memory.add(
        data["text"],
        user_id=data.get("user_id", "default"),
        metadata=data.get("metadata")
    )
    return jsonify({"ok": True, "result": result})


@app.route("/api/memory/search", methods=["POST"])
def search_memory():
    data = request.json
    if not data or "query" not in data:
        return jsonify({"ok": False, "error": "missing 'query' field"}), 400
    threshold = data.get("threshold", SCORE_THRESHOLD)
    raw = memory.search(
        data["query"],
        user_id=data.get("user_id", "default"),
        limit=data.get("limit", 10)
    )
    items = raw.get("results", [])
    # score = distance: lower is more relevant. Keep results BELOW threshold.
    filtered = [x for x in items if x.get("score", 999) <= threshold]
    return jsonify({"results": filtered, "total_raw": len(items), "threshold": threshold})


@app.route("/api/memory/list", methods=["GET", "POST"])
def list_memories():
    data = request.json if request.is_json else {}
    user_id = (data or {}).get("user_id") or request.args.get("user_id", "default")
    col = memory.vector_store.collection
    total = col.count()
    all_items = []
    offset = 0
    while offset < total:
        res = col.get(limit=500, offset=offset)
        for i, mid in enumerate(res["ids"]):
            meta = res["metadatas"][i] if res.get("metadatas") else {}
            item_user = meta.get("user_id", "default")
            if user_id != "default" and user_id != item_user:
                continue
            all_items.append({
                "id": mid,
                "memory": meta.get("data", ""),
                "user_id": item_user,
                "metadata": {k: v for k, v in meta.items() if k not in ("data", "user_id", "hash")}
            })
        if not res["ids"]:
            break
        offset += len(res["ids"])
    return jsonify({"memories": all_items, "total": len(all_items)})


@app.route("/api/memory/delete", methods=["POST"])
def delete_memory():
    data = request.json
    if not data or "memory_id" not in data:
        return jsonify({"ok": False, "error": "missing 'memory_id' field"}), 400
    memory.delete(data["memory_id"])
    return jsonify({"ok": True})


@app.route("/api/health")
def health():
    col = memory.vector_store.collection
    count = col.count()
    return jsonify({
        "status": "ok",
        "service": "mem0-local",
        "llm": "deepseek-chat",
        "embedder": "dashscope/text-embedding-v4",
        "score_threshold": SCORE_THRESHOLD,
        "total_memories": count,
        "chroma_path": CHROMA_PATH
    })


if __name__ == "__main__":
    logger.info(f"Starting mem0-local on 127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT)

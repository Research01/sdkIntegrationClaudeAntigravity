# Claude Integration for Antigravity

> **v3.0.0** — CLI + MCP server with **dual-backend switching**.
> Toggle between **Claude API** (pay-as-you-go) and **Antigravity** (subscription) with a single command.
> Features: streaming, vision, file processing, tool chaining, response cache, analytics dashboard.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [**Backend Switching**](#backend-switching) ← NEW v3
- [CLI Usage](#cli-usage)
- [MCP Server Usage](#mcp-server-usage)
- [Register MCP Server in Antigravity](#register-mcp-server-in-antigravity)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Next Steps](#next-steps)

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|----------------|
| Node.js     | 20.0.0+        |
| npm         | 9.0.0+         |
| Anthropic API Key | [Get one here](https://console.anthropic.com/) |

Verify your Node.js version:

```bash
node --version   # must be >= 20.0.0
npm --version    # must be >= 9.0.0
```

---

## Installation

```bash
# 1. Navigate to the integration directory
cd claude-integration

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Copy the environment template
cp .env.example .env

# 5. Edit .env and set your API key
#    Replace sk-ant-... with your real Anthropic API key
```

---

## Configuration

Edit the `.env` file with your settings:

```env
# Required (only for Claude API backend)
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here

# Optional — all have sensible defaults
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_TIMEOUT_MS=120000
ANTHROPIC_TEMPERATURE=0.7

# v3 — Response Cache
CACHE_ENABLED=false        # Set to true to enable on-disk caching
CACHE_TTL_HOURS=24         # Cache expiry in hours
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | ✅* | — | Anthropic API key (*not needed in Antigravity mode) |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-4-20250514` | Default model |
| `ANTHROPIC_MAX_TOKENS` | ❌ | `4096` | Max tokens per response |
| `ANTHROPIC_BASE_URL` | ❌ | `https://api.anthropic.com` | API base URL |
| `ANTHROPIC_TIMEOUT_MS` | ❌ | `120000` | Request timeout (ms) |
| `ANTHROPIC_TEMPERATURE` | ❌ | `0.7` | Generation temperature (0.0–1.0) |
| `CACHE_ENABLED` | ❌ | `false` | Enable response caching |
| `CACHE_TTL_HOURS` | ❌ | `24` | Cache entry TTL in hours |

---

---

## Backend Switching

Switch between **Claude API** (pay-as-you-go) and **Antigravity** (subscription) at any time:

```bash
npm run backend            # Show active backend
npm run use:claude         # ← Switch to Claude API (uses ANTHROPIC_API_KEY)
npm run use:antigravity    # ← Switch to Antigravity (uses subscription)
```

The active backend is persisted in `~/.claude-integration/config.json`.
Every CLI command and MCP tool respects the active backend automatically.

| Backend | Cost | Requires |
|---------|------|----------|
| `claude` | Pay-per-token (ANTHROPIC_API_KEY) | API key in `.env` |
| `antigravity` | Subscription (no per-token cost) | Antigravity CLI installed |

> **Note:** When `antigravity` mode is active and the Antigravity binary is not found,
> the system automatically falls back to Claude API with a warning.

---

## CLI Usage

### Check Health

Verify your API key and connectivity:

```bash
npm run health
```

Expected output:
```
Checking Claude API health...

✅ Status:          OK
📦 Model:           claude-sonnet-4-20250514
🔑 API Key:         Configured
🌐 API Reachable:   Yes
⏱️  Latency:         842ms
```

### Ask a Question

Send a single prompt and get a response:

```bash
npm run ask -- "Explain what a MCP server is"
```

With options:

```bash
npm run ask -- "Explain monads" --model claude-sonnet-4-20250514 --max-tokens 2000 --temperature 0.3
```

With a system prompt:

```bash
npm run ask -- "What is TypeScript?" --system "You are a senior engineer. Be concise."
```

**v2 — Streaming mode** (real-time output):

```bash
npm run ask -- "Write a poem about TypeScript" --stream
```

**v2 — Cost estimation** before sending:

```bash
npm run ask -- "Your prompt" --estimate-cost
```

Combine both:

```bash
npm run ask -- "Explain async/await" --stream --estimate-cost
```

### Interactive Chat

Start a multi-turn conversation:

```bash
npm run chat
```

With custom settings:

```bash
npm run chat -- --model claude-sonnet-4-20250514 --system "You are a helpful coding assistant"
```

**v2 — Streaming mode:**

```bash
npm run chat -- --stream
```

**v2 — Named persistent sessions** (saved to `~/.claude-integration/conversations/`):

```bash
npm run chat -- --session my-project
```

**v2 — Show cost estimation per turn:**

```bash
npm run chat -- --session my-project --stream --estimate-cost
```

Chat commands:
- `/quit` — Exit (auto-saves session)
- `/clear` — Clear conversation history
- `/save <name>` — Save session with a name
- `/load <name>` — Load a previously saved session
- `/sessions` — List all saved sessions
- `/help` — Show available commands

### List Available Models

```bash
npm run models
```

### Image Analysis — Vision (v3)

```bash
# Analyze a local image
npm run vision -- ./screenshot.png "What's in this image?"

# Analyze a remote image
npm run vision -- https://example.com/diagram.png "Explain this diagram"

# With custom system prompt
npm run vision -- ./code.png "What bug do you see?" --system "You are a code reviewer"
```

### Tool Chaining (v3)

Create a `chain.json` file:

```json
{
  "name": "Summarize then Translate",
  "steps": [
    { "id": "summary", "tool": "ask", "prompt": "Summarize this text:\n{{input}}" },
    { "id": "translate", "tool": "ask", "prompt": "Translate to Spanish:\n{{summary}}" }
  ]
}
```

Run it:

```bash
npm run chain -- chain.json "My long text to process..."
npm run chain -- chain.json --input-file document.txt --verbose
```

### Response Cache (v3)

Enable in `.env` (`CACHE_ENABLED=true`) then manage:

```bash
npm run cache:stats    # Show cache hit rate, size, TTL
npm run cache:prune    # Remove expired entries
npm run cache:clear    # Delete all cached responses
```

### Analytics Dashboard (v3)

```bash
npm run dashboard                  # Opens http://localhost:4321
npm run dashboard -- --port 8080   # Custom port
npm run dashboard -- --no-open     # Don't auto-open browser
```

The dashboard shows: requests over time, cost breakdown by model and backend,
cache statistics, and backend switching history. Auto-refreshes every 30 seconds.

### Verbose Mode

Add `-v` for debug output:

```bash
npm run ask -- -v "Hello Claude"
```

---

## MCP Server Usage

### Start the MCP Server

For development (build + start):

```bash
npm run mcp:dev
```

For production (pre-built):

```bash
npm run mcp:start
```

The server communicates over **stdio** using the MCP protocol (JSON-RPC). It does **not** open a network port.

### Exposed Tools

**v1 Tools**

| Tool | Description |
|------|-------------|
| `claude_ask` | Send a prompt to Claude |
| `claude_health` | Check API connectivity |
| `claude_list_models` | List available models |
| `claude_explain_project` | Explain code or project summary |

**v2 Tools**

| Tool | Description |
|------|-------------|
| `claude_estimate_cost` | Estimate request cost before sending |
| `claude_session_list` | List saved conversation sessions |
| `claude_session_load` | Load a session's history |
| `claude_session_chat` | Continue a persisted conversation |

**v3 Tools**

| Tool | Description |
|------|-------------|
| `claude_vision` | Analyze images (file path or URL) |
| `claude_analyze_file` | Read + analyze a single file |
| `claude_process_files` | Batch analyze up to 10 files |
| `claude_chain` | Execute a JSON-defined pipeline |
| `claude_cache_stats` | Show response cache statistics |
| `claude_backend_status` | Show active backend (claude \| antigravity) |

### MCP Resources (v2 + v3)

| Resource URI | Description |
|-------------|-------------|
| `claude://models` | Live list of available Claude models |
| `claude://conversations` | Persisted conversation sessions |
| `claude://analytics` | Usage analytics summary |

### MCP Prompts (v2)

| Prompt | Arguments |
|--------|-----------|
| `code_review` | `code` (req), `language`, `focus` |
| `explain_code` | `code` (req), `language`, `audience` |
| `write_tests` | `code` (req), `language`, `framework` |
| `summarize` | `text` (req), `format`, `max_words` |
| `debug_error` | `error` (req), `code`, `language`, `context` |

### Verbose MCP Logging

Set the environment variable for debug output on stderr:

```bash
MCP_VERBOSE=true npm run mcp:start
```

---

## Register MCP Server in Antigravity

### Option 1: Edit `mcp_config.json` (Recommended)

Antigravity stores MCP config at:

```
~/.gemini/antigravity/mcp_config.json
```

Add the following configuration:

```json
{
  "mcpServers": {
    "claude-integration": {
      "command": "node",
      "args": [
        "/Users/ufunesqa/Documents/SDKIntegration/claude-integration/dist/mcp/server.js"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key-here"
      }
    }
  }
}
```

> **⚠️ Security Note:** If you prefer not to put the API key in the config file,
> set `ANTHROPIC_API_KEY` in your shell environment and the server will read it from there.
> In that case, omit the `env` block.

### Option 2: Use `.env` file (No key in config)

If the `.env` file is configured in the `claude-integration` directory, the server
will automatically load it. You can simplify the config:

```json
{
  "mcpServers": {
    "claude-integration": {
      "command": "node",
      "args": [
        "/Users/ufunesqa/Documents/SDKIntegration/claude-integration/dist/mcp/server.js"
      ]
    }
  }
}
```

### After Registration

1. Restart Antigravity (or reload MCP servers if the option is available)
2. The tools `claude_ask`, `claude_health`, `claude_list_models`, and `claude_explain_project` will be available
3. You can invoke them from Antigravity like any other MCP tool

---

## Troubleshooting

### API Key Invalid

```
Authentication failed. Please check your ANTHROPIC_API_KEY.
```

**Fix:** Verify your key at [console.anthropic.com](https://console.anthropic.com/). Ensure it starts with `sk-ant-` and is not revoked.

### Model Not Found

```
Model not found. The specified model may not exist...
```

**Fix:** Run `npm run models` to see available models. Update `ANTHROPIC_MODEL` in `.env`.

### Rate Limit Exceeded

```
Rate limit exceeded. Please wait a moment...
```

**Fix:** Wait 30–60 seconds. If persistent, check your [plan limits](https://console.anthropic.com/).

### Request Timeout

```
Request timed out.
```

**Fix:** Increase `ANTHROPIC_TIMEOUT_MS` in `.env`. Default is 120000ms (2 minutes).

### Node.js Version Incompatible

```
SyntaxError: Cannot use import statement outside a module
```

**Fix:** This project requires Node.js 20+. Check with `node --version`.

### MCP Server: Logs Breaking stdio

The server writes **all** logs to `stderr`, never to `stdout`. If you see JSON parse errors in Antigravity:

1. Ensure you're running the built version (`dist/mcp/server.js`), not the TypeScript source
2. Check that no other process is writing to the same stdout pipe
3. Enable verbose mode: `MCP_VERBOSE=true npm run mcp:start` and check stderr for diagnostic info

### Connection Errors

```
Could not connect to the Anthropic API.
```

**Fix:** Check your internet connection. If behind a proxy, configure `ANTHROPIC_BASE_URL`.

---

## Architecture

```
claude-integration/
├── package.json              # Scripts: ask, chat, vision, chain, dashboard, backend...
├── tsconfig.json             # TypeScript (ES2022, Node16 modules)
├── .env.example              # Environment variable template
└── src/
    ├── index.ts              # CLI entry point (Commander.js)
    ├── config.ts             # Environment loading & validation
    ├── types.ts              # TypeScript interfaces
    ├── anthropicClient.ts    # Legacy compat shim → providers/
    ├── providers/            # ← v3: Backend abstraction layer
    │   ├── aiProvider.ts     # AIProvider interface
    │   ├── claudeProvider.ts # Anthropic SDK (pay-as-you-go)
    │   ├── antigravityProvider.ts  # Antigravity CLI (subscription)
    │   └── providerFactory.ts      # Returns active provider
    ├── cli/
    │   ├── ask.ts            # ask — with --stream, --estimate-cost
    │   ├── chat.ts           # chat — --session, /save, /load
    │   ├── health.ts         # API health check
    │   ├── listModels.ts     # List available models
    │   ├── backend.ts        # backend / use:claude / use:antigravity  ← v3
    │   ├── vision.ts         # Image analysis                          ← v3
    │   ├── chain.ts          # Multi-step pipeline executor             ← v3
    │   └── dashboard.ts      # Local analytics web server              ← v3
    ├── mcp/
    │   ├── server.ts         # MCP server v3 (stdio, 14 tools, 3 resources)
    │   ├── handlers.ts       # v1+v2 tool handlers
    │   ├── prompts.ts        # v2 prompt templates
    │   ├── visionHandler.ts  # claude_vision                           ← v3
    │   ├── fileHandler.ts    # claude_analyze_file / process_files     ← v3
    │   └── chainHandler.ts   # claude_chain                            ← v3
    ├── analytics/            # ← v3: Usage tracking
    │   ├── collector.ts      # Append JSONL events per API call
    │   └── aggregator.ts     # Aggregate metrics for dashboard
    ├── dashboard/
    │   └── index.html        # Web UI (dark theme, bar charts)         ← v3
    ├── test/
    │   └── integration.test.ts  # node:test test suite                 ← v3
    └── utils/
        ├── logger.ts         # Safe logging (stderr for MCP)
        ├── errors.ts         # Anthropic error classification
        ├── validation.ts     # Input validation helpers
        ├── costEstimator.ts  # Token pricing + cost estimation          ← v2
        ├── conversationStore.ts  # Session CRUD persistence            ← v2
        ├── backendManager.ts # Backend config persistence               ← v3
        ├── responseCache.ts  # SHA-256 disk cache with TTL             ← v3
        └── toolChain.ts      # Pipeline executor engine                ← v3
```

### Design Principles

- **Provider abstraction**: `AIProvider` interface decouples Claude API from Antigravity
- **Backend switching**: One command toggles backend; all tools react automatically
- **Single config dir**: `~/.claude-integration/` holds sessions, cache, analytics, config
- **Safe logging**: MCP mode never writes to stdout (reserved for JSON-RPC)
- **Analytics-first**: Every API call records an event for the dashboard
- **Cache-optional**: SHA-256 response cache opt-in via `CACHE_ENABLED=true`
- **Typed everything**: Full TypeScript with strict mode

---

## Next Steps

### v2 Improvements ✅
- [x] Add MCP **resources** (`claude://models`, `claude://conversations`)
- [x] Add MCP **prompts** (`code_review`, `explain_code`, `write_tests`, `summarize`, `debug_error`)
- [x] Streaming responses (`--stream` flag in `ask` and `chat`)
- [x] Token cost estimation before requests (`--estimate-cost` + `claude_estimate_cost` tool)
- [x] Conversation persistence (`--session <name>`, `/save`, `/load`, `/sessions`)
- [x] Multiple concurrent conversations (each session has a unique UUID, stored independently)

### v3 Expansion ✅
- [x] Image analysis support — `npm run vision` + `claude_vision` MCP tool
- [x] File upload and processing via MCP — `claude_analyze_file`, `claude_process_files`
- [x] Custom tool chaining — `npm run chain` + `claude_chain` MCP tool
- [x] Response caching layer — SHA-256 disk cache, TTL, `cache:stats/clear/prune`
- [x] Usage analytics and cost tracking dashboard — `npm run dashboard` at localhost:4321
- [x] Integration tests — `npm run test` with `node:test` runner

### Backend Switching ✅ (v3 extra)
- [x] `npm run use:claude` — Claude API mode (pay-as-you-go)
- [x] `npm run use:antigravity` — Antigravity subscription mode
- [x] `npm run backend` — Show active backend status
- [x] Auto-fallback to Claude API if Antigravity binary not found

---

## npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Watch mode — recompile on changes |
| `npm run test` | Run integration tests |
| `npm run ask -- "prompt"` | Send a single prompt |
| `npm run chat` | Interactive multi-turn conversation |
| `npm run vision -- <img> "prompt"` | Analyze an image |
| `npm run chain -- chain.json` | Run a tool pipeline |
| `npm run dashboard` | Start analytics UI at localhost:4321 |
| `npm run health` | Check API status |
| `npm run models` | List available models |
| `npm run backend` | Show active backend |
| `npm run use:claude` | Switch to Claude API |
| `npm run use:antigravity` | Switch to Antigravity |
| `npm run cache:stats` | Show cache statistics |
| `npm run cache:clear` | Delete all cached responses |
| `npm run cache:prune` | Delete expired cache entries |
| `npm run mcp:dev` | Build + start MCP server |
| `npm run mcp:start` | Start MCP server (pre-built) |

---

## License

MIT

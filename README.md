# Claude Integration for Antigravity

> **Claude pay-as-you-go** integration — CLI + MCP server for Google Antigravity.
> Use Claude directly from your terminal or expose Claude tools inside Antigravity via MCP.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
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
# Required
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here

# Optional — all have sensible defaults
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_TIMEOUT_MS=120000
ANTHROPIC_TEMPERATURE=0.7
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Anthropic API key |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-4-20250514` | Default model |
| `ANTHROPIC_MAX_TOKENS` | ❌ | `4096` | Max tokens per response |
| `ANTHROPIC_BASE_URL` | ❌ | `https://api.anthropic.com` | API base URL |
| `ANTHROPIC_TIMEOUT_MS` | ❌ | `120000` | Request timeout (ms) |
| `ANTHROPIC_TEMPERATURE` | ❌ | `0.7` | Generation temperature (0.0–1.0) |

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

### Interactive Chat

Start a multi-turn conversation:

```bash
npm run chat
```

With custom settings:

```bash
npm run chat -- --model claude-sonnet-4-20250514 --system "You are a helpful coding assistant"
```

Chat commands:
- `/quit` — Exit the chat
- `/clear` — Clear conversation history
- `/help` — Show available commands

### List Available Models

```bash
npm run models
```

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

| Tool | Description | Inputs |
|------|-------------|--------|
| `claude_ask` | Send a prompt to Claude | `prompt` (required), `system`, `model`, `max_tokens`, `temperature` |
| `claude_health` | Check API connectivity | — |
| `claude_list_models` | List available models | — |
| `claude_explain_project` | Explain code or project summary | `code_or_summary` (required), `language`, `context` |

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
├── package.json              # Scripts: ask, chat, health, models, mcp:dev, mcp:start
├── tsconfig.json             # TypeScript configuration (ES2022, Node16 modules)
├── .env.example              # Environment variable template
├── .gitignore                # Excludes .env, node_modules, dist
└── src/
    ├── index.ts              # CLI entry point (Commander.js)
    ├── config.ts             # Environment loading & validation
    ├── types.ts              # TypeScript interfaces
    ├── anthropicClient.ts    # Shared Anthropic SDK client (singleton)
    ├── cli/
    │   ├── ask.ts            # Single-prompt command
    │   ├── chat.ts           # Interactive multi-turn chat
    │   ├── health.ts         # API health check
    │   └── listModels.ts     # List available models
    ├── mcp/
    │   ├── server.ts         # MCP server (stdio transport)
    │   ├── tools.ts          # Tool definitions with Zod schemas
    │   └── handlers.ts       # Tool implementation handlers
    └── utils/
        ├── logger.ts         # Safe logging (stderr for MCP)
        ├── errors.ts         # Anthropic error classification
        └── validation.ts     # Input validation helpers
```

### Design Principles

- **Single client**: One `Anthropic` instance shared across CLI and MCP
- **Layer separation**: CLI and MCP have their own entry points but share `anthropicClient.ts`
- **Safe logging**: MCP mode never writes to stdout (reserved for JSON-RPC)
- **Typed everything**: Full TypeScript with strict mode
- **Validated inputs**: All user inputs validated before hitting the API
- **Graceful errors**: Every Anthropic error type mapped to actionable user messages

---

## Next Steps

### v2 Improvements
- [ ] Add MCP **resources** (expose conversation history, model list as resources)
- [ ] Add MCP **prompts** (pre-built prompt templates for common tasks)
- [ ] Streaming responses for real-time output
- [ ] Token cost estimation before requests
- [ ] Conversation persistence (save/load chat history)
- [ ] Multiple concurrent conversations

### v3 Expansion
- [ ] Image analysis support (Claude vision)
- [ ] File upload and processing via MCP
- [ ] Custom tool chaining (combine multiple Claude calls)
- [ ] Response caching layer
- [ ] Usage analytics and cost tracking dashboard
- [ ] Integration tests with mock API

---

## npm Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Compile TypeScript to JavaScript |
| `dev` | `npm run dev` | Watch mode — recompile on changes |
| `ask` | `npm run ask -- "prompt"` | Send a single prompt |
| `chat` | `npm run chat` | Interactive conversation |
| `health` | `npm run health` | Check API status |
| `models` | `npm run models` | List available models |
| `mcp:dev` | `npm run mcp:dev` | Build + start MCP server |
| `mcp:start` | `npm run mcp:start` | Start MCP server (pre-built) |

---

## License

MIT

# Nexxupp MCP Server

> [!NOTE]
>
> We've introduced **hosted mode**: run one Nexxupp MCP server for your whole
> team with per-user login — no API tokens in chat configs anymore:
>
> - Easy installation via standard OAuth. Users click Connect, log in with
>   Nexxupp, approve scopes. No need to fiddle with JSON or API tokens.
> - Powerful tools tailored to AI agents across three products: Cortex memory,
>   NWS workspace, and Calendar. Descriptions carry the conventions models need
>   (datetime format, per-user scoping), keeping token consumption low.
>
> We are prioritizing, and actively supporting, **hosted mode**. Local stdio
> keeps working for personal use.

This project implements an [MCP server](https://spec.modelcontextprotocol.io/)
for Nexxupp: private memory (Cortex), programmable workspace (NWS), and
scheduling (Calendar).

---

## Tools (21)

| Prefix | Tools |
|---|---|
| `cortex_*` | `memory_store`, `memory_search`, `turn` |
| `nws_*` | `search`, `summarize_station`, `create_task`, `open_page_for_event`, `search_blocks`, `read_database`, `upsert_rows`, `create_chart`, `apply_template_blocks`, `summarize_database`, `station_assist`, `list_stations` |
| `calendar_*` | `list_calendars`, `list_events`, `create_event`, `update_event`, `delete_event`, `ai_assist` |

Conventions the models must follow are in each tool description: datetimes are
`YYYY-MM-DD HH:MM:SS`, memory calls are scoped per end-user id.

---

### Installation

#### 1. Get your credentials

- **Cortex tools** need a per-tenant key (`cortex_...`).
- **NWS + Calendar tools** need your Nexxupp login (email + password). The
  server logs in once and refreshes behind the scenes. Prefer this over a
  static access token (15-minute life, no refresh).

> [!WARNING]
> Credentials in an MCP config act as you. Keep them on personal machines —
> never on shared servers. On shared servers, use hosted mode below.

#### 2. Adding MCP config to your client

##### Using npm

###### Cursor & Claude

Add the following to your `.cursor/mcp.json` or `claude_desktop_config.json`
(MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "nexxupp": {
      "command": "npx",
      "args": ["-y", "@nexxupp/mcp"],
      "env": {
        "NEXXUPP_API_URL": "https://api.nexxupp.com",
        "CORTEX_API_URL": "https://api.cortex.nexxupp.com",
        "CORTEX_API_KEY": "cortex_...",
        "NEXXUPP_EMAIL": "you@example.com",
        "NEXXUPP_PASSWORD": "..."
      }
    }
  }
}
```

For local development against your own stack, point at localhost:

```json
{
  "mcpServers": {
    "nexxupp-local": {
      "command": "node",
      "args": ["/absolute/path/to/nexxupp/mcp/dist/index.js"],
      "env": {
        "NEXXUPP_API_URL": "http://localhost:8080",
        "CORTEX_API_URL": "http://localhost:8081",
        "CORTEX_API_KEY": "cortex_...",
        "NEXXUPP_EMAIL": "you@example.com",
        "NEXXUPP_PASSWORD": "..."
      }
    }
  }
}
```

###### Zed

Add the following to your `settings.json`

```json
{
  "context_servers": {
    "nexxupp": {
      "command": {
        "path": "npx",
        "args": ["-y", "@nexxupp/mcp"],
        "env": {
          "NEXXUPP_API_URL": "https://api.nexxupp.com",
          "CORTEX_API_URL": "https://api.cortex.nexxupp.com",
          "CORTEX_API_KEY": "cortex_...",
          "NEXXUPP_EMAIL": "you@example.com",
          "NEXXUPP_PASSWORD": "..."
        }
      },
      "settings": {}
    }
  }
}
```

###### GitHub Copilot CLI

Use the Copilot CLI to interactively add the MCP server:

```bash
/mcp add
```

Alternatively, create or edit `~/.copilot/mcp-config.json` and add:

```json
{
  "mcpServers": {
    "nexxupp": {
      "command": "npx",
      "args": ["-y", "@nexxupp/mcp"],
      "env": {
        "NEXXUPP_API_URL": "https://api.nexxupp.com",
        "CORTEX_API_URL": "https://api.cortex.nexxupp.com",
        "CORTEX_API_KEY": "cortex_...",
        "NEXXUPP_EMAIL": "you@example.com",
        "NEXXUPP_PASSWORD": "..."
      }
    }
  }
}
```

##### Using Docker

Build the image locally (no public registry yet):

```bash
docker build -t nexxupp-mcp:0.1.0 .
```

Then add the following to your `.cursor/mcp.json` or `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nexxupp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "NEXXUPP_API_URL",
        "-e", "CORTEX_API_URL",
        "-e", "CORTEX_API_KEY",
        "-e", "NEXXUPP_EMAIL",
        "-e", "NEXXUPP_PASSWORD",
        "nexxupp-mcp:0.1.0"
      ],
      "env": {
        "NEXXUPP_API_URL": "https://api.nexxupp.com",
        "CORTEX_API_URL": "https://api.cortex.nexxupp.com",
        "CORTEX_API_KEY": "cortex_...",
        "NEXXUPP_EMAIL": "you@example.com",
        "NEXXUPP_PASSWORD": "..."
      }
    }
  }
}
```

### Transport options

#### STDIO transport (default)

The default transport uses standard input/output. This is what desktop clients
like Claude Desktop and Cursor expect.

```bash
# Run with default stdio transport
npx -y @nexxupp/mcp

# Or explicitly specify stdio
npx -y @nexxupp/mcp --transport stdio
```

#### Streamable HTTP transport

For web-based applications or bridged setups, run Streamable HTTP:

```bash
# Run on port 3100 (default), localhost only
npx -y @nexxupp/mcp --transport http

# Run on a custom port
npx -y @nexxupp/mcp --transport http --port 8080

# Bind to a different host. The default is 127.0.0.1.
npx -y @nexxupp/mcp --transport http --host 0.0.0.0
```

The server answers at `http://127.0.0.1:<port>/mcp`. Health at `/health`,
dependency status at `/ready`, counters at `/metrics`.

##### Authentication

Local HTTP mode has no gateway auth and binds localhost by default — keep it
that way. For anything shared, use hosted mode:

```bash
MCP_MODE=hosted MCP_TRANSPORT=http MCP_PORT=3100 \
MCP_PUBLIC_URL=https://mcp.nexxupp.com npm start
```

In hosted mode every `/mcp` request must carry `Authorization: Bearer <user
access token>`. The server validates it against the backend and scopes all
`nws_*` / `calendar_*` calls to that caller — no token, or a bad token, gets
`401` before any tool runs. `cortex_*` tools additionally accept a per-call
`apiKey` (the caller's own tenant key); never set a global `CORTEX_API_KEY` on
a shared server.

```bash
# Example request
curl -H "Authorization: Bearer <user-access-token>" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}' \
     http://localhost:3100/mcp
```

##### Hosted setup (operator checklist)

1. Deploy the Docker image beside the API with `MCP_MODE=hosted` and
   `MCP_PUBLIC_URL` set to its public URL.
2. Set backend `OAUTH_API_BASE=https://api.nexxupp.com` so discovery
   advertises reachable URLs.
3. Register one OAuth client per bot via `POST /oauth/clients` with the bot's
   redirect URIs and scopes (`openid profile email calendar`).
4. Users connect from the bot, approve scopes in the Nexxupp consent screen,
   and manage grants at `GET /oauth/consents` / `DELETE /oauth/consents/{client_id}`
   (revoking kills the bot's refresh tokens immediately; access tokens expire
   within ~15 minutes).

### Examples

1. Using the following instruction

```text
Remember that Maya prefers oat-milk lattes
```

AI will call `cortex_memory_store` with your user id, and the memory comes back
versioned as a brick.

1. Similarly, the following instruction summarizes a whole workspace

```text
Summarize my station, including open tasks and recent pages
```

AI will call `nws_summarize_station` (listing stations first if it doesn't know
the id), and may follow up with `nws_search_blocks` for detail.

1. You may also schedule in plain language

```text
Find us 30 minutes next week for a design review
```

AI will call `calendar_ai_assist`, which reads the calendar and returns
executable scheduling actions.

### Development

#### Build & test

```bash
npm install
npm run build
npm test
```

`npm test` runs 11 tests (unit + live transport/auth-matrix tests, no external
services required).

#### Execute

```bash
npm start
```

Testing changes locally in Cursor:

1. Run `npm link` from the repository root.
2. Merge the snippet below into Cursor's `mcp.json`.
3. (Cleanup) run `npm unlink` from the repository root.

```json
{
  "mcpServers": {
    "nexxupp-local-package": {
      "command": "nexxupp-mcp",
      "env": {
        "NEXXUPP_API_URL": "http://localhost:8080",
        "CORTEX_API_URL": "http://localhost:8081",
        "CORTEX_API_KEY": "cortex_...",
        "NEXXUPP_EMAIL": "you@example.com",
        "NEXXUPP_PASSWORD": "..."
      }
    }
  }
}
```

#### Publish

```bash
npm login
npm publish --access public
```

### Observability

- Logs: stderr, one line per request (`LOG_LEVEL=debug|info|warn|error`).
- `GET /ready` returns 503 while the backend is unreachable — wire alerts
  there, not to the container healthcheck (`GET /health`).
- Tune with `MCP_REQUEST_TIMEOUT_MS` (default 60000), `MCP_MAX_BODY_BYTES`
  (default 1048576), `MCP_UPSTREAM_TIMEOUT_MS` (default 20000).

## License

MIT — see [LICENSE](./LICENSE).

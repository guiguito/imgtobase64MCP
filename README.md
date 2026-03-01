# imgtobase64-mcp-server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that converts images to base64-encoded data. Designed for LLMs with vision capabilities that need images as base64 input.

Works with any MCP-compatible client — Claude Desktop, Claude Code, Cursor, and more — over **stdio** (local) or **HTTP** (remote/Docker).

## Tools

### `image_url_to_base64`

Fetch an image from a URL and convert it to base64.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Image URL to fetch |
| `timeout_ms` | number | No | Request timeout in ms (1000–120000, default 30000) |

### `image_file_to_base64`

Read a local image file and convert it to base64.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Path to the local image file |

### Response format

Both tools return a JSON object:

```json
{
  "base64": "iVBORw0KGgo...",
  "mimeType": "image/png",
  "sizeBytes": 24680,
  "width": 800,
  "height": 600,
  "dataUri": "data:image/png;base64,iVBORw0KGgo..."
}
```

`image_file_to_base64` also includes `resolvedPath` (the absolute path that was read).

`width` and `height` are extracted from image headers when possible (PNG, JPEG, GIF, BMP, WebP) without any native dependencies.

### Supported formats

PNG, JPEG, GIF, WebP, BMP, SVG, TIFF, ICO, AVIF

MIME type is detected via magic bytes ([file-type](https://github.com/sindresorhus/file-type)) with a fallback to file extension. Maximum file size is **20 MB**.

## Getting started

### Prerequisites

- Node.js >= 20

### Install and build

```bash
npm install
npm run build
```

### Run locally (stdio)

```bash
node dist/index.js
```

### Run locally (HTTP)

```bash
TRANSPORT=http node dist/index.js
# or
node dist/index.js --transport http
```

The server listens on `http://0.0.0.0:3000` by default. Check with:

```bash
curl http://localhost:3000/health
```

## Client configuration

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "imgtobase64": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add imgtobase64 node /absolute/path/to/dist/index.js
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "imgtobase64": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

### Remote (HTTP) clients

Point your client to `http://<host>:3000/mcp`. The server implements the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) with session management.

## Docker

### Docker Compose

```bash
docker compose up --build
```

### Standalone

```bash
docker build -t imgtobase64-mcp-server .
docker run -p 3000:3000 imgtobase64-mcp-server
```

The Docker image:
- Uses a multi-stage build (compile in builder, run with production deps only)
- Runs as non-root user `mcpuser`
- Defaults to HTTP transport on port 3000
- Includes a health check at `/health`

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | `3000` | HTTP server port (HTTP mode only) |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

The `--transport` CLI flag takes precedence over the `TRANSPORT` env var.

All logs are written to **stderr** (JSON format), keeping stdout clean for the MCP stdio protocol.

## HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | MCP protocol (initialize + tool calls) |
| `GET` | `/mcp` | SSE stream for notifications |
| `DELETE` | `/mcp` | Terminate a session |
| `GET` | `/health` | Health check |

## Development

```bash
npm run dev          # Watch mode (recompile on change)
npm run lint         # Check with Biome
npm run lint:fix     # Auto-fix lint/format issues
npm run inspect      # Open MCP Inspector
```

## Project structure

```
src/
├── index.ts              # Entry point — transport selection (stdio/http)
├── server.ts             # McpServer creation + tool registration
├── tools/
│   ├── imageUrlToBase64.ts   # image_url_to_base64 tool
│   └── imageFileToBase64.ts  # image_file_to_base64 tool
└── utils/
    ├── imageUtils.ts     # MIME detection, base64 encoding, dimension parsing
    └── logger.ts         # stderr-only JSON logger
```

## License

[MIT](LICENSE)

# MCP Client README

This repository provides:

- **`mcpClient.js`**: Core MCP Client implementation with robust error handling.
- **`agent.js`**: Agent bootstrap and managed MCP server lifecycle.
- **`test-harness.js`**: Bulk testing of connections and tools.
- **Next.js API**: `/api/invoke-mcp` for UI integration.
- **React UI**: A component under `components/MCPToolRunner.tsx`.

## Architecture Overview

```mermaid
flowchart LR
  subgraph Backend
    A[config.json] --> B[mcpClient.js]
    B --> C[invokeMcpTool]
    C -->|stdio| D[StdIO Transport]
    C -->|SSE| E[SSE Transport]
    C -->|WebSocket| F[WebSocket Transport]
    C --> G[LLM Tool Call]
  end

  subgraph API
    H[/api/invoke-mcp] --> B
  end

  subgraph Frontend
    I[MCPToolRunner React] --> H
    I --> J[User Input]
    I --> K[Result / Error Display]
  end

  G --> J
  G --> K
```

## SDK Stdio Transport Fix & Workaround  

### A. Explicit Transport Passing to connect()  
Due to a bug in `@modelcontextprotocol/sdk@1.11.4`, the Client constructor’s `transport` option is not applied inside `client.connect()`. This leaves `this._transport` undefined and leads to errors like `Cannot set properties of undefined (setting 'onclose')`.  

**Solution:** Always pass the transport directly into `connect()`, rather than relying on the constructor.  

```js
// Before (fails silently):
const client = new Client({ transport });
await client.connect(); // transport not set internally

// After (correct):
const client = new Client({ name: 'advanced-chat-ui', version: '1.0.0' });
await client.connect(transport);
```

In your Next.js route (`src/app/api/chat/route.ts`), update accordingly:

```diff
- const client = new Client({ transport });
- await client.connect();
+ const client = new Client({ name: 'advanced-chat-ui', version: '1.0.0' });
+ await client.connect(transport);
```

### B. Prototype Polyfill for onerror/onclose

As a safety net (to guard against missing hooks on the transport), polyfill `onerror` and `onclose` on the prototype of `StdioClientTransport`. Place this at the top of `mcp_ui_client.mjs`, **before** any `client.connect()` call:

```js
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Polyfill missing hooks so assignments don't crash
const proto = StdioClientTransport.prototype;
if (!Object.getOwnPropertyDescriptor(proto, 'onerror')) {
  Object.defineProperty(proto, 'onerror', { value: null, writable: true });
}
if (!Object.getOwnPropertyDescriptor(proto, 'onclose')) {
  Object.defineProperty(proto, 'onclose', { value: null, writable: true });
}
```

With these two changes, the UI client should be able to establish a Stdio transport connection without hitting the `onclose`/`onerror` undefined errors. Once the SDK is patched, you can remove the polyfill section.

# Technical Context: AI Agent for Content Analysis & Personalized Assistance

## 1. Core Technologies & Environment
-   **Runtime Environment:** Node.js v18.20.5 (confirmed from test outputs).
-   **Programming Language:** JavaScript (ES Modules syntax: `import`/`export`).
-   **Package Manager:** npm (manages dependencies via `package.json` and `package-lock.json`).
-   **Operating System Context:** Developed and primarily tested on macOS, with user's default shell being zsh. PowerShell is also mentioned in relation to environment variable setup in `.clinerules`.

## 2. Key Node.js Core Modules Used
-   **`readline`:** For CLI interactions in `src/agent.js`.
-   **`fs/promises`:** For asynchronous file system operations.
-   **`path`:** For platform-independent path manipulation.
-   **`child_process` (`exec` via `util.promisify`, `spawn`):** Used in `src/github.js` and potentially by `StdioClientTransport`.
-   **`util` (`promisify`):** Used for converting callback-based functions to Promise-based.
-   **`url` (`fileURLToPath`):** Used for module path resolution.
-   **`http`:** Used by `sse_echo_server.mjs`.
-   **`crypto` (`randomUUID`):** Used by `sse_echo_server.mjs`.

## 3. Key Internal Utilities
-   **`src/logger.js`:** Shared structured JSON logging utility used by `src/agent.js` and `src/mcpClient.js`. Provides `createLogger` for module-specific logger instances.

## 4. Key External Dependencies
    -   **`@modelcontextprotocol/sdk` (v1.11.4):** Key dependency for `src/mcpClient.js` and `src/advanced-chat-ui/src/lib/mcp_ui_client.mjs`. Provides `Client`, `SSEClientTransport`, `StdioClientTransport`, and server components like `McpServer`.
        -   **Observed Issues with v1.11.4 in Node.js v18.20.5 ESM environment:** See Section 8: Technical Constraints & Considerations.
    -   **`node-fetch`:** Used for HTTP requests to LLM APIs.
    -   **`youtube-transcript-plus`:** Used for fetching YouTube transcripts.
    -   **`@lancedb/lancedb` & `apache-arrow`:** Used for LanceDB vector database interaction.
    -   **`glob`:** Used for file pattern matching.
    -   **`express` & `body-parser`:** Used in `src/agent.js` for the Memory Visualization UI backend.
    -   **For `src/memory-ui/` (React App):** Standard React dependencies.
    -   **For `src/advanced-chat-ui/` (Next.js Chat App):** `next`, `react`, `ai` (Vercel AI SDK), `@ai-sdk/react`, `@ai-sdk/openai`, `tailwindcss`, `zod`.

## 5. External Services and APIs
-   DeepSeek API, OpenAI API (Chat & Embeddings), GitHub, YouTube.
-   Model Context Protocol (MCP) Servers (interaction via `src/mcpClient.js`).

## 6. Data Storage
-   `config.json`: Main configuration, including `mcp_servers` section.
-   (Other storage as previously listed: `memory-store.json`, `memory-hierarchy/`, `developer-profiles/`, `vector-memory/lancedb-data/`, `output/`, `temp-clones/`).

## 7. Development Setup and Tooling
-   (As previously listed, with Node.js v18.20.5 confirmed).

## 8. Technical Constraints & Considerations
-   **`@modelcontextprotocol/sdk@1.11.4` Stability and Compatibility (Node.js v18.20.5 ESM):**
    -   **`StdioClientTransport`:**
        -   Connection establishment is unreliable; `client.connect()` may time out.
        -   The `Client` object's internal state (`client.state`) often remains `undefined` even if some underlying communication is successful (e.g., a tool call to a mock server using SDK's `McpServer` can succeed).
        -   This inconsistent state can lead to errors like `client.disconnect is not a function` if `disconnect` is called when the state isn't as expected by the SDK.
        -   Server-side errors thrown by tools are not consistently propagated as client-side exceptions by `client.callTool()`. The call may resolve successfully, with the error details potentially in the result payload.
    -   **`SSEClientTransport`:**
        -   Connections frequently fail with a generic `"SSE error: undefined"`. This might be an issue with the SDK's SSE transport layer or its dependency on the `eventsource` package in the current environment.
    -   **ESM Imports:**
        -   **Client-side:** Deep imports like `@modelcontextprotocol/sdk/client/index.js` (for `Client`), `...@sdk/client/stdio.js` (for `StdioClientTransport`), and `...@sdk/client/sse.js` (for `SSEClientTransport`) appear to be the correct paths based on the SDK's `package.json#exports` and are used.
        -   **Server-side:** The correct import for `McpServer` is `@modelcontextprotocol/sdk/server/mcp.js` (not `...@sdk/server/index.js`).
        -   General ESM compatibility issues have been reported by other users for this SDK (e.g., GitHub issues #427, #460), suggesting its ESM support might have rough edges, especially with bundlers or specific Node.js module resolution behaviors.
    -   **Current Recommendation:** Due to these issues, Stdio and SSE transports via this SDK version are considered unreliable. Prioritize thorough testing and consider workarounds or alternative approaches if MCP functionality is critical and these issues persist. The `src/mcpClient.js` has been designed to be robust around these failures (e.g., timeouts, retries for initial connection).
-   (Other constraints as previously listed: `git` CLI, API keys, network, permissions, content limits, error handling, cross-platform, shared code, Vercel AI SDK types).

## 9. Code Style and Structure
-   (As previously listed).
-   **Logging:** Standardized on a shared structured JSON logger (`src/logger.js`) for `src/agent.js` and `src/mcpClient.js`.

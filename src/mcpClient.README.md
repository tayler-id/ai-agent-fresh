# `mcpClient.js` Documentation

## 1. Overview

`mcpClient.js` provides a robust client for interacting with Model Context Protocol (MCP) servers. It is designed to be used within the AI Agent project (`ai-agent-fresh`). Key features include:

-   Support for multiple transport mechanisms:
    -   Server-Sent Events (SSE)
    -   Standard Input/Output (Stdio)
-   Integration with agent-managed Stdio servers (lifecycle managed by `agent.js`).
-   Per-call connections for unmanaged Stdio servers and SSE servers.
-   Robust error handling, including timeouts and reconnection attempts for initial connections.
-   Configuration-driven server definitions.
-   Functions for validating server configurations and testing connections.
-   Structured JSON logging for diagnostics.

## 2. Core Functions

### `async invokeMcpTool(getManagedMcpClientFunc, serverIdentifier, toolName, parameters, options = {})`

This is the primary function for invoking a tool on an MCP server.

-   **Parameters:**
    -   `getManagedMcpClientFunc` (Function): A function (typically passed from `agent.js`) that takes a `serverIdentifier` and returns an active, connected MCP `Client` instance if the server is managed by the agent. For unmanaged servers, this function's return value is not critical, but it must be provided.
    -   `serverIdentifier` (String): The unique key of the MCP server as defined in the `mcp_servers` section of `config.json`.
    -   `toolName` (String): The name of the tool to invoke on the MCP server.
    -   `parameters` (Object): An object containing the arguments for the tool.
    -   `options` (Object, optional):
        -   `timeout` (Number): Timeout in milliseconds for the entire operation (connection and tool call). Defaults to `30000` (30 seconds).
        -   `allowReconnect` (Boolean): Whether to attempt reconnection if the initial connection fails. Defaults to `true`. Max `MAX_RECONNECT_ATTEMPTS` (3) with `RECONNECT_DELAY_MS` (2 seconds) delay.

-   **Returns:** (Promise<any>): A promise that resolves with the result from the MCP tool.
-   **Throws:** (Error): Throws an error if:
    -   Server configuration is not found or invalid.
    -   The server is disabled.
    -   Connection to the server fails after exhausting retries (if applicable).
    -   The tool invocation times out.
    -   The MCP server returns an error for the tool call (should be propagated by the SDK).
    -   Other unexpected errors occur.

### `async validateMcpConfigurations()`

Validates all enabled MCP server configurations found in `config.json` under the `mcp_servers` key.

-   **Parameters:** None.
-   **Returns:** (Promise<Array<string>>): A promise that resolves with an array of string messages describing any validation issues found. An empty array indicates all configurations are structurally valid.
-   **Usage:** Can be called on agent startup or via a diagnostic command to check configuration integrity.

### `async testMcpServerConnection(getManagedMcpClientFunc, serverIdentifier, options = {})`

Tests the connection to a specific MCP server.

-   **Parameters:**
    -   `getManagedMcpClientFunc` (Function): Same as for `invokeMcpTool`.
    -   `serverIdentifier` (String): The identifier of the server to test.
    -   `options` (Object, optional):
        -   `timeout` (Number): Timeout in milliseconds for the connection attempt. Defaults to `30000` (30 seconds).
-   **Returns:** (Promise<Object>): A promise that resolves with an object:
    -   `{ success: true, message: string }` if the connection is successful.
    -   `{ success: false, error: string }` if the connection fails.
-   **Behavior:**
    -   For managed Stdio servers, it checks if an active client exists via `getManagedMcpClientFunc` and its state.
    -   For unmanaged servers (Stdio/SSE), it attempts a full connect and disconnect cycle.

## 3. Configuration (`config.json`)

MCP server configurations are defined within the main `config.json` file, under the `mcp_servers` key. Each entry in `mcp_servers` is an object keyed by a unique `serverIdentifier`.

```json
{
  "mcp_servers": {
    "my_sse_server_example": {
      "displayName": "My SSE Example Server",
      "description": "An example SSE-based MCP server.",
      "transport": "sse",
      "url": "http://localhost:5000/sse_endpoint",
      "enabled": true
    },
    "my_unmanaged_stdio_server": {
      "displayName": "My Unmanaged Stdio Tool",
      "description": "A Stdio server that mcpClient starts per call.",
      "transport": "stdio",
      "command": "node",
      "args": ["./path/to/my_stdio_server.js"],
      "cwd": "./path/to", // Optional, defaults to agent's CWD
      "env": { // Optional, extends default inherited env vars
        "CUSTOM_VAR": "value"
      },
      "stderrBehavior": "inherit", // "pipe" or "inherit", defaults to "inherit" for unmanaged
      "enabled": true,
      "manageProcess": false // Explicitly unmanaged
    },
    "my_agent_managed_stdio_server": {
      "displayName": "Agent Managed Stdio Service",
      "description": "A Stdio server whose lifecycle is managed by agent.js.",
      "transport": "stdio",
      "command": "python3",
      "args": ["-u", "./mcp_services/my_python_service.py"],
      "cwd": "./mcp_services",
      "stderrBehavior": "pipe", // Recommended for agent.js to capture stderr
      "enabled": true,
      "manageProcess": true // Key for agent.js to manage it
    },
    "disabled_example": {
      "displayName": "Disabled Example",
      "transport": "stdio",
      "command": "echo",
      "enabled": false
    }
  }
  // ... other agent configurations
}
```

-   **Common Fields:**
    -   `displayName` (String, optional): A user-friendly name for the server.
    -   `description` (String, optional): A brief description.
    -   `transport` (String, required): Type of transport. Supported: `"sse"`, `"stdio"`.
    -   `enabled` (Boolean, optional): Set to `false` to disable this server configuration. Defaults to `true` if not present.
-   **SSE Specific Fields:**
    -   `url` (String, required): The full URL to the SSE endpoint of the MCP server.
-   **Stdio Specific Fields:**
    -   `command` (String, required): The command to execute to start the server.
    -   `args` (Array<string>, optional): Arguments to pass to the command.
    -   `cwd` (String, optional): The working directory for the server process. Defaults to the agent's current working directory.
    -   `env` (Object, optional): Additional environment variables for the server process. These are merged with a set of default inherited environment variables.
    -   `stderrBehavior` (String, optional): How to handle the Stdio server's stderr.
        -   `"pipe"`: Stderr is piped; useful if `agent.js` (for managed servers) or another process needs to capture it.
        -   `"inherit"`: Stderr is inherited by the parent process (agent's terminal). Default for unmanaged Stdio servers in `mcpClient.js`. For managed servers, `agent.js` defaults this to `"pipe"`.
    -   `manageProcess` (Boolean, optional): Only for `"stdio"` transport.
        -   If `true`, `agent.js` is responsible for starting, stopping, and managing the lifecycle of this server. `mcpClient.js` will use a pre-existing connection provided by `agent.js`.
        -   If `false` (or not present), `mcpClient.js` will start and stop the Stdio server process for each `invokeMcpTool` call (per-call connection).

## 4. Usage Patterns

### Calling `invokeMcpTool`

```javascript
import { invokeMcpTool } from './src/mcpClient.js';
import { getManagedMcpClient } from './src/agent.js'; // Assuming called from agent.js context

async function exampleUsage() {
  try {
    // Example for an unmanaged server (SSE or Stdio with manageProcess:false)
    // getManagedMcpClient will return null, invokeMcpTool handles it.
    const resultUnmanaged = await invokeMcpTool(
      getManagedMcpClient, // or a dummy function like () => null if not in agent.js context
      "my_sse_server_example", 
      "some_tool_on_sse_server",
      { arg1: "value1" },
      { timeout: 15000, allowReconnect: true } // Optional options
    );
    console.log("Unmanaged SSE Result:", resultUnmanaged);

    // Example for an agent-managed Stdio server
    // agent.js provides the getManagedMcpClient function.
    const resultManaged = await invokeMcpTool(
      getManagedMcpClient,
      "my_agent_managed_stdio_server",
      "tool_on_managed_server",
      { data: "important_data" }
    );
    console.log("Managed Stdio Result:", resultManaged);

  } catch (error) {
    // The structured logger in mcpClient will have already logged details
    console.error("Example Usage Error in invoking tool:", error.message);
  }
}
```

## 5. Troubleshooting

-   **Structured Logs:** `mcpClient.js` uses a structured JSON logger. Check the console output for detailed logs from the "MCPClient" module. Debug logs can be enabled by setting the `MCP_CLIENT_DEBUG=true` environment variable.
-   **Configuration Issues:**
    -   Run `await validateMcpConfigurations()` to check for structural problems in your `config.json`'s `mcp_servers` section.
    -   Ensure `config.json` exists at the project root and contains an `mcp_servers` object.
-   **Connection Timeouts:**
    -   Verify the MCP server is running and accessible at the configured URL (for SSE) or via the command (for Stdio).
    -   Check network connectivity, firewalls.
    -   Increase the `timeout` option in `invokeMcpTool` if servers are slow to respond.
-   **`ECONNREFUSED` (SSE):** The target server at the specified URL/port is not running or not accepting connections.
-   **SDK-Related Issues (using `@modelcontextprotocol/sdk@1.11.4` with Node.js v18.20.5 ESM):**
    -   **Stdio `Client.state` undefined / Connection Timeouts:** `StdioClientTransport` connections may fail to fully establish, or the `Client` object's internal state (`client.state`) may not update correctly, remaining `undefined` even if some communication occurs. This can lead to timeouts or errors like `client.disconnect is not a function`. This appears to be an SDK instability. Minimal reproduction tests (`test_sdk_stdio_minimal.mjs`) confirm this behavior.
        -   **Workaround/Current Status:** Stdio communication is unreliable. While some tool calls might surprisingly succeed (as seen with mock servers using the SDK's `McpServer`), the client state is inconsistent.
    -   **Stdio Server-Side Errors Not Thrown by `client.callTool`:** If a Stdio server's tool throws an error, the SDK's `client.callTool` may resolve successfully instead of throwing a client-side exception. The error from the server might be in the result payload. Test scripts should check the result object for an `.error` property.
    -   **SSE `SSE error: undefined`:** SSE connections may fail with this vague error. This could be an issue with the `SSEClientTransport` or the underlying `eventsource` package it uses in the current Node.js environment. Ensure the SSE server is running and correctly implementing the SSE protocol, including heartbeats if expected.
    -   **ESM Import Errors (`ERR_PACKAGE_PATH_NOT_EXPORTED`, `McpServer` not found):**
        -   The SDK `package.json` (v1.11.0 inspected) has an `exports` map that *should* allow deep imports like `@modelcontextprotocol/sdk/client/index.js` or `@modelcontextprotocol/sdk/server/mcp.js`.
        -   If these errors occur, ensure you are using the correct deep import paths as shown in SDK examples (e.g., `McpServer` is from `.../sdk/server/mcp.js`, not `.../sdk/server/index.js`).
        -   Known GitHub issues (#427, #460 for `typescript-sdk`) indicate other users have faced ESM-related import problems.
        -   These issues might be more prevalent in complex bundling environments (e.g., Next.js/Turbopack).
-   **"Managed stdio server ... not currently available":** If `agent.js` is supposed to manage a Stdio server, this error means the agent either failed to start it, or the server crashed/exited, and `agent.js` has not (or could not) restart it. Check `agent.js` logs (module "AgentMCPManager").

## 6. Extensibility

To add support for a new transport type (e.g., "myNewTransport"):

1.  **Implement a new Transport Class:** This class would need to conform to the implicit interface expected by the `@modelcontextprotocol/sdk` `Client` (e.g., have `connect()`, `send()`, `onmessage`, `onerror`, `onclose` mechanisms).
2.  **Update `createTransport` in `src/mcpClient.js`:**
    Add an `else if (serverConfig.transport === "myNewTransport")` block to instantiate your new transport class, passing necessary parameters from `serverConfig`.
3.  **Update Configuration Schema (Mental/Doc):** Define what fields in `config.json` would be needed for "myNewTransport".
4.  **Update `validateMcpConfigurations`:** Add validation rules for the new transport type.
5.  **Update `testMcpServerConnection` and Test Cases:** Add tests for the new transport.

## 7. Logging

`mcpClient.js` uses a shared structured JSON logger (from `src/logger.js`).
-   Logs are output to `console.log` (for INFO, DEBUG) and `console.error` (for ERROR, WARN).
-   Each log entry is a JSON string with `timestamp`, `level`, `module` ("MCPClient"), `message`, and optional `details`.
-   **Debug Logging:** To enable more verbose debug logs from `mcpClient.js`, set the environment variable `MCPCLIENT_DEBUG=true` (or `DEBUG=true` for all modules using the shared logger with this pattern).

This documentation should provide a good overview for using and understanding `src/mcpClient.js`.

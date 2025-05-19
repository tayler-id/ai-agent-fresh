# Enhanced MCP Client Implementation

This directory contains an enhanced implementation of the Model Context Protocol (MCP) client designed to be robust, server-agnostic, and compatible with standard MCP implementations.

## Features

- **Transport Agnostic**: Supports SSE and stdio transports with extensibility for future transport types
- **Robust Error Handling**: Comprehensive error handling with detailed logging
- **Reconnection Support**: Automatic reconnection attempts for transient failures
- **Timeout Management**: Configurable timeouts for connections and tool invocations
- **Configuration Validation**: Built-in validation of server configurations
- **Connection Testing**: Ability to test server connections without tool invocation
- **Managed Server Support**: Integration with agent-managed stdio servers

## Files

- `mcpClient.js`: The enhanced MCP client implementation
- `mcp-test.js`: Test script for validating the MCP client
- `mcp-config-sample.json`: Sample configuration file for testing

## Usage

### Basic Tool Invocation

```javascript
import { invokeMcpTool } from './mcpClient.js';

try {
  const result = await invokeMcpTool('server_identifier', 'tool_name', { param1: 'value1' });
  console.log('Tool result:', result);
} catch (error) {
  console.error('Tool invocation failed:', error.message);
}
```

### Advanced Options

```javascript
import { invokeMcpTool } from './mcpClient.js';

try {
  const result = await invokeMcpTool(
    'server_identifier', 
    'tool_name', 
    { param1: 'value1' },
    { 
      timeout: 60000,        // 60 second timeout
      allowReconnect: true   // Enable reconnection attempts
    }
  );
  console.log('Tool result:', result);
} catch (error) {
  console.error('Tool invocation failed:', error.message);
}
```

### Configuration Validation

```javascript
import { validateMcpConfigurations } from './mcpClient.js';

async function checkConfigurations() {
  const issues = await validateMcpConfigurations();
  if (issues.length === 0) {
    console.log('All server configurations are valid');
  } else {
    console.log('Found configuration issues:', issues);
  }
}
```

### Connection Testing

```javascript
import { testMcpServerConnection } from './mcpClient.js';

async function testConnection() {
  const result = await testMcpServerConnection('server_identifier');
  if (result.success) {
    console.log('Connection successful:', result.message);
  } else {
    console.log('Connection failed:', result.error);
  }
}
```

## Configuration

The MCP client uses a configuration file to define server connections. By default, it looks for `mcp-config.json` in the current working directory, with fallback to `config.json` (looking for the `mcp_servers` property).

Example configuration:

```json
{
  "server_identifier": {
    "displayName": "Human-readable name",
    "description": "Server description",
    "transport": "sse",
    "url": "http://localhost:5000/sse",
    "enabled": true
  },
  "another_server": {
    "displayName": "Another Server",
    "description": "Stdio-based server",
    "transport": "stdio",
    "command": "node",
    "args": ["./server-script.js"],
    "cwd": "/path/to/working/directory",
    "env": {
      "API_KEY": "your-api-key"
    },
    "enabled": true,
    "manageProcess": false
  }
}
```

## Testing

Run the test script to validate the MCP client implementation:

```bash
node mcp-test.js
```

This will:
1. Create a mock MCP server for testing
2. Validate server configurations
3. Test connections to configured servers
4. Test tool invocation

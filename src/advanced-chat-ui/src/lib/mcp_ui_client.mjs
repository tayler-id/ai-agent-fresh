import fs from 'fs/promises';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// SDK Stdio Transport Workaround (Polyfill for onerror/onclose)
const stdioProto = StdioClientTransport.prototype;
if (!Object.getOwnPropertyDescriptor(stdioProto, 'onerror')) {
  Object.defineProperty(stdioProto, 'onerror', { value: null, writable: true, configurable: true });
}
if (!Object.getOwnPropertyDescriptor(stdioProto, 'onclose')) {
  Object.defineProperty(stdioProto, 'onclose', { value: null, writable: true, configurable: true });
}

const MCP_CONFIG_PATH = path.join(process.cwd(), 'mcp-config.json'); // Assumes mcp-config.json is in the root of the Next.js app

let mcpConfigCache = null;

async function loadMcpConfig(forceRefresh = false) {
  if (mcpConfigCache && !forceRefresh) {
    return mcpConfigCache;
  }
  try {
    const rawConfig = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
    mcpConfigCache = JSON.parse(rawConfig);
    console.log('[MCP UI Client] Successfully loaded mcp-config.json');
    return mcpConfigCache;
  } catch (error) {
    console.error(`[MCP UI Client] Error loading or parsing mcp-config.json from ${MCP_CONFIG_PATH}:`, error);
    mcpConfigCache = null; // Invalidate cache on error
    throw new Error(`Failed to load MCP configuration: ${error.message}`);
  }
}

export async function invokeMcpTool(serverName, toolName, toolArgs = {}) {
  console.log(`[MCP UI Client] Attempting to invoke tool: ${toolName} on server: ${serverName} with args:`, toolArgs);
  let client;
  let transport;

  try {
    const config = await loadMcpConfig();
    if (!config || !config.mcp_servers) {
      throw new Error('MCP configuration is missing or invalid (mcp_servers not found).');
    }

    const serverConfig = config.mcp_servers[serverName];

    if (!serverConfig) {
      throw new Error(`MCP server "${serverName}" not found in configuration.`);
    }

    if (!serverConfig.enabled) {
      throw new Error(`MCP server "${serverName}" is disabled in configuration.`);
    }

    console.log(`[MCP UI Client] Found configuration for server "${serverName}":`, serverConfig);

    if (serverConfig.transport === 'sse') {
      if (!serverConfig.url) {
        throw new Error(`SSE transport for server "${serverName}" requires a 'url'.`);
      }
      console.log(`[MCP UI Client] Creating SSE transport for ${serverConfig.url}`);
      transport = new SSEClientTransport({ url: serverConfig.url });
    } else if (serverConfig.transport === 'stdio') {
      if (!serverConfig.command) {
        throw new Error(`Stdio transport for server "${serverName}" requires a 'command'.`);
      }
      const stdioOptions = {
        command: serverConfig.command,
        args: serverConfig.args || [],
        cwd: serverConfig.cwd || process.cwd(), // Default to Next.js app root
        env: { ...process.env, ...serverConfig.env }, // Merge process env with server-specific env
      };
      console.log('[MCP UI Client] Creating Stdio transport with options:', stdioOptions);
      transport = new StdioClientTransport(stdioOptions);
    } else {
      throw new Error(`Unsupported transport type "${serverConfig.transport}" for server "${serverName}".`);
    }

    // Corrected Client instantiation and connect call as per user feedback
    client = new Client({ name: `mcp-ui-client-${serverName}`, version: '1.0.0' });

    console.log(`[MCP UI Client] Connecting to server "${serverName}"...`);
    await client.connect(transport); // Pass transport directly to connect
    console.log(`[MCP UI Client] Connected. Client state:`, client.state); // Log state after connect

    // Check if callTool method exists
    if (typeof client.callTool !== 'function') {
        console.error('[MCP UI Client] client.callTool is not a function. Client object:', client);
        // Attempt to list properties for debugging, if possible
        try {
            console.log('[MCP UI Client] Client properties:', Object.keys(client));
            if (client.constructor && client.constructor.prototype) {
                console.log('[MCP UI Client] Client prototype properties:', Object.getOwnPropertyNames(client.constructor.prototype));
            }
        } catch (e) {
            console.error('[MCP UI Client] Error listing client properties:', e);
        }
        throw new Error('client.callTool is not available on the Client instance. SDK issue suspected.');
    }

    console.log(`[MCP UI Client] Calling tool "${toolName}" with args:`, toolArgs);
    const result = await client.callTool({ name: toolName, arguments: toolArgs });
    console.log(`[MCP UI Client] Tool "${toolName}" on server "${serverName}" executed. Result:`, result);

    return result;

  } catch (error) {
    console.error(`[MCP UI Client] Error invoking tool "${toolName}" on server "${serverName}":`, error);
    // Log additional client/transport info if they exist
    if (transport) console.error('[MCP UI Client] Transport details on error:', transport);
    if (client) console.error('[MCP UI Client] Client details on error (state, etc.):', { state: client.state, clientObj: client });
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    if (client && typeof client.disconnect === 'function') {
      try {
        console.log(`[MCP UI Client] Disconnecting from server "${serverName}"...`);
        await client.disconnect();
        console.log(`[MCP UI Client] Disconnected from server "${serverName}".`);
      } catch (disconnectError) {
        console.error(`[MCP UI Client] Error disconnecting from server "${serverName}":`, disconnectError);
      }
    } else if (client && typeof client.close === 'function') { // Fallback for older SDK versions or aliases
        try {
            console.log(`[MCP UI Client] Closing connection to server "${serverName}" (using close)...`);
            await client.close();
            console.log(`[MCP UI Client] Connection closed for server "${serverName}".`);
        } catch (closeError) {
            console.error(`[MCP UI Client] Error closing connection for server "${serverName}":`, closeError);
        }
    } else if (client) {
        console.warn(`[MCP UI Client] Client for server "${serverName}" exists but disconnect/close method not found.`);
    }
  }
}

// Optional: Function to explicitly refresh the config if needed
export async function refreshMcpConfig() {
  console.log('[MCP UI Client] Forcing refresh of MCP configuration.');
  return loadMcpConfig(true);
}

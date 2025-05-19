// Enhanced MCP Client for Model Context Protocol (Node.js)
// Supports SSE, Stdio, and WebSocket transports with robust error handling
// Integrates with agent-managed stdio servers and provides reconnection capabilities

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { promises as fs } from 'fs';
import path from 'path';
import process from "node:process";

// Import the function to get managed clients from agent.js
// This might cause a circular dependency if agent.js also imports invokeMcpTool directly.
// If issues arise, consider passing getManagedMcpClient as a parameter to invokeMcpTool.
import { getManagedMcpClient } from './agent.js'; 

// Constants for configuration and error handling
const CONFIG_FILENAME = 'mcp-config.json';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds timeout for operations
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000; // 2 seconds between reconnection attempts

// Default environment variables to inherit for stdio processes
const DEFAULT_INHERITED_ENV_VARS = process.platform === "win32"
  ? [ "APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE" ]
  : [ "HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER" ];

/**
 * Helper function to load MCP server configurations from config file
 * @returns {Promise<Object>} The MCP server configurations
 */
async function getMcpServerConfigs() {
  // First try mcp-config.json, then fall back to config.json
  const configPaths = [
    path.resolve(process.cwd(), CONFIG_FILENAME),
    path.resolve(process.cwd(), 'config.json')
  ];
  
  for (const configPath of configPaths) {
    try {
      const configFile = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configFile);
      
      // If using config.json, look for mcp_servers property
      const servers = configPath.endsWith('config.json') 
        ? (config.mcp_servers || {}) 
        : config;
        
      console.log(`[MCPCLIENT_INFO] Loaded MCP server configurations from ${configPath}`);
      return servers;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[MCPCLIENT_ERROR] Error parsing ${configPath}:`, error.message);
      }
      // Continue to next config path if file not found or has parsing error
    }
  }
  
  console.warn(`[MCPCLIENT_WARN] No MCP server configuration files found. Using empty configuration.`);
  return {};
}

/**
 * Gets the default environment variables for stdio processes
 * @returns {Object} Environment variables object
 */
function getDefaultEnvironment() {
  const env = {};
  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined) continue;
    if (value.startsWith("()")) continue;
    env[key] = value;
  }
  return env;
}

/**
 * Creates a transport based on server configuration
 * @param {string} serverIdentifier - The server identifier
 * @param {Object} serverConfig - The server configuration
 * @returns {Object} The transport object
 * @throws {Error} If transport creation fails
 */
function createTransport(serverIdentifier, serverConfig) {
  if (serverConfig.transport === "sse") {
    if (!serverConfig.url) {
      throw new Error(`[MCPCLIENT_ERROR] SSE transport configured for ${serverIdentifier}, but no URL provided.`);
    }
    
    console.log(`[MCPCLIENT_INFO] Using SSE transport. Original URL: ${serverConfig.url}`);
    let sseUrl = serverConfig.url;
    
    try {
      const parsedUrl = new URL(sseUrl);
      if (parsedUrl.hostname === 'localhost') {
        // Try replacing localhost with 127.0.0.1 to prefer IPv4 if ::1 is causing issues
        parsedUrl.hostname = '127.0.0.1';
        sseUrl = parsedUrl.toString();
        console.log(`[MCPCLIENT_INFO] Modified SSE URL to: ${sseUrl} (to prefer IPv4 for localhost)`);
      }
      return new SSEClientTransport(new URL(sseUrl));
    } catch (e) {
      throw new Error(`[MCPCLIENT_ERROR] Invalid URL for SSE server ${serverIdentifier}: ${serverConfig.url} (processed as ${sseUrl}). Error: ${e.message}`);
    }
  } else if (serverConfig.transport === "stdio") {
    if (!serverConfig.command) {
      throw new Error(`[MCPCLIENT_ERROR] Stdio transport configured for ${serverIdentifier}, but no command provided.`);
    }
    
    console.log(`[MCPCLIENT_INFO] Using Stdio transport (unmanaged). Command: ${serverConfig.command} ${(serverConfig.args || []).join(' ')}`);
    
    const stdioParams = {
      command: serverConfig.command,
      args: serverConfig.args || [],
      cwd: serverConfig.cwd || process.cwd(),
      env: { ...getDefaultEnvironment(), ...(serverConfig.env || {}) },
      stderr: serverConfig.stderrBehavior || "inherit",
    };
    
    return new StdioClientTransport(stdioParams);
  } else if (serverConfig.transport === "websocket") {
    // For future WebSocket transport support
    throw new Error(`[MCPCLIENT_ERROR] WebSocket transport not yet implemented for server ${serverIdentifier}.`);
  } else {
    throw new Error(`[MCPCLIENT_ERROR] Unsupported transport type '${serverConfig.transport}' for server ${serverIdentifier}.`);
  }
}

/**
 * Invokes an MCP tool on the specified server with robust error handling and reconnection.
 * @param {string} serverIdentifier - The unique key of the MCP server in config.json.
 * @param {string} toolName - The name of the tool to invoke.
 * @param {object} parameters - The parameters for the tool.
 * @param {object} options - Additional options for the invocation.
 * @param {number} options.timeout - Timeout in milliseconds for the operation.
 * @param {boolean} options.allowReconnect - Whether to attempt reconnection on failure.
 * @returns {Promise<any>} - The tool result.
 * @throws {Error} if server configuration is invalid, connection fails, or tool invocation fails.
 */
export async function invokeMcpTool(
  serverIdentifier, 
  toolName, 
  parameters, 
  options = {}
) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    allowReconnect = true
  } = options;
  
  // Load server configurations
  const mcpServerConfigs = await getMcpServerConfigs();
  const serverConfig = mcpServerConfigs[serverIdentifier];

  if (!serverConfig) {
    throw new Error(`[MCPCLIENT_ERROR] MCP server configuration not found for identifier: ${serverIdentifier}. Please check configuration files.`);
  }
  
  if (serverConfig.enabled === false) {
    throw new Error(`[MCPCLIENT_ERROR] MCP server ${serverIdentifier} is disabled in configuration.`);
  }

  // Check if this is a managed stdio server
  if (serverConfig.transport === "stdio" && serverConfig.manageProcess === true) {
    return invokeToolOnManagedServer(serverIdentifier, toolName, parameters, timeout);
  }

  // For unmanaged servers, create a new connection for each call
  return invokeToolWithNewConnection(serverIdentifier, serverConfig, toolName, parameters, {
    timeout,
    allowReconnect,
    reconnectAttempts: 0
  });
}

/**
 * Invokes a tool on a managed MCP server.
 * @param {string} serverIdentifier - The server identifier.
 * @param {string} toolName - The name of the tool to invoke.
 * @param {object} parameters - The parameters for the tool.
 * @param {number} timeout - Timeout in milliseconds.
 * @returns {Promise<any>} The tool result.
 * @throws {Error} If the managed server is not available or tool invocation fails.
 */
async function invokeToolOnManagedServer(serverIdentifier, toolName, parameters, timeout) {
  const managedClient = getManagedMcpClient(serverIdentifier);
  
  if (!managedClient) {
    console.error(`[MCPCLIENT_ERROR] Stdio server '${serverIdentifier}' is configured as managed, but no active client found. It might have failed to start or crashed.`);
    throw new Error(`[MCPCLIENT_ERROR] Managed stdio server '${serverIdentifier}' is not currently available.`);
  }
  
  console.log(`[MCPCLIENT_INFO] Using agent-managed client for stdio server '${serverIdentifier}'. Client state: ${managedClient.state}. Invoking tool: '${toolName}'...`);
  
  try {
    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`[MCPCLIENT_ERROR] Tool invocation timed out after ${timeout}ms`)), timeout);
    });
    
    // Race the tool call against the timeout
    const result = await Promise.race([
      managedClient.callTool({ name: toolName, arguments: parameters }),
      timeoutPromise
    ]);
    
    console.log(`[MCPCLIENT_INFO] Tool '${toolName}' invoked successfully on managed server '${serverIdentifier}'.`);
    return result;
  } catch (error) {
    console.error(`[MCPCLIENT_ERROR] Error invoking tool on managed server '${serverIdentifier}' (Tool: '${toolName}'):`, error.message);
    // Agent.js's error/close handlers for the transport should deal with marking it unhealthy.
    throw error;
  }
}

/**
 * Invokes a tool with a new connection to an MCP server.
 * @param {string} serverIdentifier - The server identifier.
 * @param {Object} serverConfig - The server configuration.
 * @param {string} toolName - The name of the tool to invoke.
 * @param {object} parameters - The parameters for the tool.
 * @param {object} options - Additional options.
 * @returns {Promise<any>} The tool result.
 * @throws {Error} If connection fails or tool invocation fails.
 */
async function invokeToolWithNewConnection(
  serverIdentifier, 
  serverConfig, 
  toolName, 
  parameters, 
  options
) {
  const { timeout, allowReconnect, reconnectAttempts } = options;
  
  console.log(`[MCPCLIENT_INFO] Preparing per-call connection for tool '${toolName}' on server '${serverIdentifier}' (Transport: ${serverConfig.transport})`);
  
  let transport;
  let client;
  
  try {
    // Create the appropriate transport
    transport = createTransport(serverIdentifier, serverConfig);
    
    // Create the client
    client = new Client({
      name: `ai-agent-per-call-${serverIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}`,
      version: "1.0.0"
    });
    
    // Set up error and close handlers
    if (transport.onerror) {
      const originalOnError = transport.onerror;
      transport.onerror = (error) => {
        console.error(`[MCPCLIENT_ERROR] Transport error for ${serverIdentifier}:`, error.message);
        originalOnError(error);
      };
    }
    
    if (transport.onclose) {
      const originalOnClose = transport.onclose;
      transport.onclose = () => {
        console.log(`[MCPCLIENT_INFO] Transport closed for ${serverIdentifier}.`);
        originalOnClose();
      };
    }
    
    // Connect to the server with timeout
    console.log(`[MCPCLIENT_INFO] Attempting per-call connect to MCP server '${serverIdentifier}'...`);
    
    try {
      // Create a promise that will reject after the timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`[MCPCLIENT_ERROR] Connection timed out after ${timeout}ms`)), timeout);
      });
      
      // Race the connection against the timeout
      await Promise.race([
        client.connect(transport),
        timeoutPromise
      ]);
      
      console.log(`[MCPCLIENT_INFO] Connected (per-call) to MCP server '${serverIdentifier}'. Client state: ${client.state}. Invoking tool: '${toolName}'...`);
    } catch (connectError) {
      console.error(`[MCPCLIENT_ERROR] client.connect() threw an error for ${serverIdentifier}:`, connectError.message);
      
      // Attempt reconnection if allowed and not exceeded max attempts
      if (allowReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.log(`[MCPCLIENT_INFO] Attempting reconnection (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}) after delay...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
        
        // Recursive call with incremented reconnect attempts
        return invokeToolWithNewConnection(serverIdentifier, serverConfig, toolName, parameters, {
          ...options,
          reconnectAttempts: reconnectAttempts + 1
        });
      }
      
      throw connectError;
    }
    
    // Invoke the tool with timeout
    try {
      // Create a promise that will reject after the timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`[MCPCLIENT_ERROR] Tool invocation timed out after ${timeout}ms`)), timeout);
      });
      
      // Race the tool call against the timeout
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: parameters }),
        timeoutPromise
      ]);
      
      console.log(`[MCPCLIENT_INFO] Tool '${toolName}' invoked successfully on '${serverIdentifier}' (per-call).`);
      
      // Disconnect from the server
      await client.disconnect();
      console.log(`[MCPCLIENT_INFO] Disconnected (per-call) from MCP server '${serverIdentifier}'.`);
      
      return result;
    } catch (toolError) {
      console.error(`[MCPCLIENT_ERROR] Error invoking tool '${toolName}' on server '${serverIdentifier}':`, toolError.message);
      
      // Ensure disconnection even after error
      if (client.state === 'connected' || client.state === 'connecting') {
        try {
          await client.disconnect();
          console.log(`[MCPCLIENT_INFO] Disconnected (per-call) from '${serverIdentifier}' after error.`);
        } catch (disconnectError) {
          console.error(`[MCPCLIENT_ERROR] Error during per-call disconnect from '${serverIdentifier}' after initial error:`, disconnectError.message);
        }
      }
      
      throw toolError;
    }
  } catch (error) {
    console.error(`[MCPCLIENT_ERROR] Error during per-call MCP interaction with server '${serverIdentifier}' (Tool: '${toolName}'):`, error.message);
    
    // Ensure disconnection in case of any error
    if (client && (client.state === 'connected' || client.state === 'connecting')) {
      try {
        await client.disconnect();
        console.log(`[MCPCLIENT_INFO] Disconnected (per-call) from '${serverIdentifier}' after error.`);
      } catch (disconnectError) {
        console.error(`[MCPCLIENT_ERROR] Error during per-call disconnect from '${serverIdentifier}' after initial error:`, disconnectError.message);
      }
    }
    
    throw error;
  }
}

/**
 * Validates MCP server configurations and returns any issues found.
 * @returns {Promise<Array>} Array of validation issues
 */
export async function validateMcpConfigurations() {
  const mcpServerConfigs = await getMcpServerConfigs();
  const validationIssues = [];
  
  for (const [serverIdentifier, serverConfig] of Object.entries(mcpServerConfigs)) {
    // Skip disabled servers
    if (serverConfig.enabled === false) continue;
    
    // Check transport type
    if (!serverConfig.transport) {
      validationIssues.push(`Server '${serverIdentifier}' is missing transport type.`);
      continue;
    }
    
    // Validate based on transport type
    if (serverConfig.transport === "sse") {
      if (!serverConfig.url) {
        validationIssues.push(`SSE server '${serverIdentifier}' is missing URL.`);
      } else {
        try {
          new URL(serverConfig.url);
        } catch (e) {
          validationIssues.push(`SSE server '${serverIdentifier}' has invalid URL: ${serverConfig.url}`);
        }
      }
    } else if (serverConfig.transport === "stdio") {
      if (!serverConfig.command) {
        validationIssues.push(`Stdio server '${serverIdentifier}' is missing command.`);
      }
    } else if (serverConfig.transport === "websocket") {
      validationIssues.push(`WebSocket transport for server '${serverIdentifier}' is not yet implemented.`);
    } else {
      validationIssues.push(`Server '${serverIdentifier}' has unsupported transport type: ${serverConfig.transport}`);
    }
  }
  
  return validationIssues;
}

/**
 * Tests connection to an MCP server without invoking any tools.
 * @param {string} serverIdentifier - The server identifier.
 * @param {object} options - Additional options.
 * @returns {Promise<Object>} Connection test result.
 */
export async function testMcpServerConnection(serverIdentifier, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT_MS
  } = options;
  
  const mcpServerConfigs = await getMcpServerConfigs();
  const serverConfig = mcpServerConfigs[serverIdentifier];
  
  if (!serverConfig) {
    return {
      success: false,
      error: `MCP server configuration not found for identifier: ${serverIdentifier}`
    };
  }
  
  if (serverConfig.enabled === false) {
    return {
      success: false,
      error: `MCP server ${serverIdentifier} is disabled in configuration`
    };
  }
  
  // For managed stdio servers, just check if the client is available
  if (serverConfig.transport === "stdio" && serverConfig.manageProcess === true) {
    const managedClient = getManagedMcpClient(serverIdentifier);
    
    if (!managedClient) {
      return {
        success: false,
        error: `Managed stdio server '${serverIdentifier}' is not currently available`
      };
    }
    
    return {
      success: true,
      message: `Managed stdio server '${serverIdentifier}' is available. Client state: ${managedClient.state}`
    };
  }
  
  // For unmanaged servers, try to connect and disconnect
  let transport;
  let client;
  
  try {
    transport = createTransport(serverIdentifier, serverConfig);
    
    client = new Client({
      name: `ai-agent-test-${serverIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}`,
      version: "1.0.0"
    });
    
    // Connect with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Connection timed out after ${timeout}ms`)), timeout);
    });
    
    await Promise.race([
      client.connect(transport),
      timeoutPromise
    ]);
    
    // Disconnect
    await client.disconnect();
    
    return {
      success: true,
      message: `Successfully connected to and disconnected from MCP server '${serverIdentifier}'`
    };
  } catch (error) {
    // Ensure disconnection in case of error
    if (client && (client.state === 'connected' || client.state === 'connecting')) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors during testing
      }
    }
    
    return {
      success: false,
      error: `Error connecting to MCP server '${serverIdentifier}': ${error.message}`
    };
  }
}

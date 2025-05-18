// Enhanced MCP Client for Model Context Protocol (Node.js)
// Supports SSE, Stdio, and WebSocket transports with robust error handling
// Integrates with agent-managed stdio servers and provides reconnection capabilities

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { promises as fs } from 'fs';
import path from 'path';
import process from "node:process";
import { createLogger } from './logger.js'; // Import shared logger

const logger = createLogger("MCPClient"); // Create a logger instance for this module

// Constants for configuration and error handling
const CONFIG_FILENAME = 'mcp-config.json'; // User might prefer this to be 'config.json' with mcp_servers key
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
  // Standard config file is 'config.json', look for 'mcp_servers' key within it.
  // The user might also have a dedicated 'mcp-config.json'.
  // For this project, let's assume 'config.json' is primary and contains 'mcp_servers'.
  const primaryConfigPath = path.resolve(process.cwd(), 'config.json');
  
  try {
    const configFile = await fs.readFile(primaryConfigPath, 'utf-8');
    const config = JSON.parse(configFile);
      const servers = config.mcp_servers || {}; // Expect mcp_servers key
        
    logger.info(`Loaded MCP server configurations from ${primaryConfigPath}`);
    return servers;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Primary configuration file ${primaryConfigPath} not found.`);
    } else {
      logger.error(`Error reading or parsing ${primaryConfigPath}`, error);
    }
  }
  
  logger.warn(`Could not load MCP server configurations from ${primaryConfigPath}. Using empty configuration.`);
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
    
    logger.info(`Using SSE transport. Original URL: ${serverConfig.url}`, { serverIdentifier });
    let sseUrl = serverConfig.url;
    
    try {
      const parsedUrl = new URL(sseUrl);
      if (parsedUrl.hostname === 'localhost') {
        parsedUrl.hostname = '127.0.0.1';
        sseUrl = parsedUrl.toString();
        logger.info(`Modified SSE URL to: ${sseUrl} (to prefer IPv4 for localhost)`, { serverIdentifier });
      }
      return new SSEClientTransport(new URL(sseUrl));
    } catch (e) {
      throw new Error(`[MCPCLIENT_ERROR] Invalid URL for SSE server ${serverIdentifier}: ${serverConfig.url} (processed as ${sseUrl}). Error: ${e.message}`); // Keep as throw for now
    }
  } else if (serverConfig.transport === "stdio") {
    if (!serverConfig.command) {
      throw new Error(`[MCPCLIENT_ERROR] Stdio transport configured for ${serverIdentifier}, but no command provided.`); // Keep as throw
    }
    
    logger.info(`Using Stdio transport. Command: ${serverConfig.command} ${(serverConfig.args || []).join(' ')}`, { serverIdentifier });
    
    const stdioParams = {
      command: serverConfig.command,
      args: serverConfig.args || [],
      cwd: serverConfig.cwd || process.cwd(),
      env: { ...getDefaultEnvironment(), ...(serverConfig.env || {}) },
      stderr: serverConfig.stderrBehavior || "inherit", // Changed from "pipe" to "inherit" for unmanaged, can be "pipe" for managed if agent handles it
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
 * @param {function} getManagedMcpClientFunc - Function to retrieve a managed client instance.
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
  getManagedMcpClientFunc, // Added parameter to resolve circular dependency
  serverIdentifier, 
  toolName, 
  parameters, 
  options = {}
) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    allowReconnect = true // Defaulting to true, can be overridden by caller
  } = options;
  
  const mcpServerConfigs = await getMcpServerConfigs();
  const serverConfig = mcpServerConfigs[serverIdentifier];

  if (!serverConfig) {
    throw new Error(`[MCPCLIENT_ERROR] MCP server configuration not found for identifier: ${serverIdentifier}. Please check config.json.`); // Keep as throw
  }
  
  if (serverConfig.enabled === false) {
    throw new Error(`[MCPCLIENT_ERROR] MCP server ${serverIdentifier} is disabled in configuration.`); // Keep as throw
  }

  if (serverConfig.transport === "stdio" && serverConfig.manageProcess === true) {
    return invokeToolOnManagedServer(getManagedMcpClientFunc, serverIdentifier, toolName, parameters, timeout);
  }

  return invokeToolWithNewConnection(serverIdentifier, serverConfig, toolName, parameters, {
    timeout,
    allowReconnect,
    reconnectAttempts: 0 
  });
}

/**
 * Invokes a tool on a managed MCP server.
 * @param {function} getManagedMcpClientFunc - Function to retrieve a managed client instance.
 * @param {string} serverIdentifier - The server identifier.
 * @param {string} toolName - The name of the tool to invoke.
 * @param {object} parameters - The parameters for the tool.
 * @param {number} timeout - Timeout in milliseconds.
 * @returns {Promise<any>} The tool result.
 * @throws {Error} If the managed server is not available or tool invocation fails.
 */
async function invokeToolOnManagedServer(getManagedMcpClientFunc, serverIdentifier, toolName, parameters, timeout) {
  const managedClient = getManagedMcpClientFunc(serverIdentifier); // Use passed-in function
  
  if (!managedClient) {
    logger.error(`Stdio server '${serverIdentifier}' is configured as managed, but no active client found. It might have failed to start or crashed.`, null, { serverIdentifier, toolName });
    throw new Error(`Managed stdio server '${serverIdentifier}' is not currently available.`);
  }
  
  logger.info(`Using agent-managed client for stdio server. Client state: ${managedClient.state}. Invoking tool: '${toolName}'...`, { serverIdentifier, toolName, clientState: managedClient.state });
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool invocation timed out after ${timeout}ms on managed server '${serverIdentifier}'`)), timeout);
    });
    
    const result = await Promise.race([
      managedClient.callTool({ name: toolName, arguments: parameters }),
      timeoutPromise
    ]);
    
    logger.info(`Tool '${toolName}' invoked successfully on managed server '${serverIdentifier}'.`, { serverIdentifier, toolName });
    return result;
  } catch (error) {
    logger.error(`Error invoking tool on managed server '${serverIdentifier}' (Tool: '${toolName}')`, error, { serverIdentifier, toolName });
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
  
  logger.info(`Preparing per-call connection for tool '${toolName}' on server '${serverIdentifier}' (Transport: ${serverConfig.transport}, Attempt: ${reconnectAttempts + 1})`, { serverIdentifier, toolName, transport: serverConfig.transport, attempt: reconnectAttempts + 1 });
  
  let transport;
  let client;
  
  try {
    transport = createTransport(serverIdentifier, serverConfig);
    
    client = new Client({
      name: `ai-agent-per-call-${serverIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}`,
      version: "1.0.0"
    });
    
    // Setup transport event handlers for logging/debugging
    if (transport.onerror) {
        const originalOnError = transport.onerror.bind(transport);
        transport.onerror = (error) => {
            logger.error(`Transport error for ${serverIdentifier}`, error, { serverIdentifier, event: "onerror" });
            if (originalOnError) originalOnError(error);
        };
    } else { 
        if (transport._process && transport._process.on) { 
            transport._process.on('error', (err) => {
                 logger.error(`Transport child process error for ${serverIdentifier}`, err, { serverIdentifier, event: "process_error" });
            });
        }
    }
    if (transport.onclose) {
        const originalOnClose = transport.onclose.bind(transport);
        transport.onclose = () => {
            logger.info(`Transport closed for ${serverIdentifier}.`, { serverIdentifier, event: "onclose" });
            if (originalOnClose) originalOnClose();
        };
    } else {
        if (transport._process && transport._process.on) {
            transport._process.on('close', (code, signal) => {
                logger.info(`Transport child process close for ${serverIdentifier}. Code: ${code}, Signal: ${signal}`, { serverIdentifier, event: "process_close", code, signal });
            });
             transport._process.on('exit', (code, signal) => {
                logger.info(`Transport child process exit for ${serverIdentifier}. Code: ${code}, Signal: ${signal}`, { serverIdentifier, event: "process_exit", code, signal });
            });
        }
    }
    
    logger.info(`Attempting per-call connect to MCP server '${serverIdentifier}'... Current client state: ${client.state}`, { serverIdentifier, clientState: client.state });
    
    try {
      const connectTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Connection to '${serverIdentifier}' timed out after ${timeout}ms`)), timeout);
      });
      
      await Promise.race([
        client.connect(transport),
        connectTimeoutPromise
      ]);
      
      logger.info(`Connected (per-call) to MCP server '${serverIdentifier}'. Client state: ${client.state}. Invoking tool: '${toolName}'...`, { serverIdentifier, clientState: client.state, toolName });
    } catch (connectError) {
      logger.error(`client.connect() failed for ${serverIdentifier}`, connectError, { serverIdentifier });
      
      if (allowReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        logger.info(`Attempting reconnection to '${serverIdentifier}' (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}) after ${RECONNECT_DELAY_MS}ms delay...`, { serverIdentifier, attempt: reconnectAttempts + 1, maxAttempts: MAX_RECONNECT_ATTEMPTS });
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
        return invokeToolWithNewConnection(serverIdentifier, serverConfig, toolName, parameters, {
          ...options,
          reconnectAttempts: reconnectAttempts + 1
        });
      }
      throw connectError; // Re-throw after exhausting retries or if not allowed
    }
    
    // Invoke the tool
    try {
      const toolTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tool invocation '${toolName}' on '${serverIdentifier}' timed out after ${timeout}ms`)), timeout);
      });
      
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: parameters }),
        toolTimeoutPromise
      ]);
      
      logger.info(`Tool '${toolName}' invoked successfully on '${serverIdentifier}' (per-call).`, { serverIdentifier, toolName });
      return result; // Result obtained, return before disconnect
    } catch (toolError) {
      logger.error(`Error invoking tool '${toolName}' on server '${serverIdentifier}'`, toolError, { serverIdentifier, toolName });
      throw toolError; // Re-throw to be caught by outer try-finally
    }

  } finally { // Ensure disconnect happens
    if (client && (client.state === 'connected' || client.state === 'connecting')) {
      try {
        logger.info(`Attempting to disconnect (per-call) from '${serverIdentifier}'. Current state: ${client.state}`, { serverIdentifier, clientState: client.state });
        await client.disconnect();
        logger.info(`Disconnected (per-call) from MCP server '${serverIdentifier}'.`, { serverIdentifier });
      } catch (disconnectError) {
        logger.error(`Error during per-call disconnect from '${serverIdentifier}'`, disconnectError, { serverIdentifier });
      }
    }
    // Transport specific cleanup if needed, though client.disconnect() should handle transport.close()
    if (transport && typeof transport.close === 'function' && client && client.state !== 'connected' && client.state !== 'connecting') {
        // If client never fully connected or errored out before disconnect, ensure transport is closed.
        // StdioClientTransport.close() is typically called by client.disconnect().
        // This is a fallback.
        // logger.info(`Ensuring transport for '${serverIdentifier}' is closed.`, { serverIdentifier });
        // transport.close(); 
    }
  }
}

/**
 * Validates MCP server configurations and returns any issues found.
 * @returns {Promise<Array<string>>} Array of validation issue strings
 */
export async function validateMcpConfigurations() {
  const mcpServerConfigs = await getMcpServerConfigs();
  const validationIssues = [];
  
  if (Object.keys(mcpServerConfigs).length === 0) {
    logger.warn("No MCP server configurations found in config.json under 'mcp_servers' for validation.");
    validationIssues.push("No MCP server configurations found in config.json under 'mcp_servers'.");
    return validationIssues;
  }
  
  for (const [serverIdentifier, serverConfig] of Object.entries(mcpServerConfigs)) {
    if (serverConfig.enabled === false) {
      logger.info(`Server '${serverIdentifier}' is disabled, skipping validation.`, { serverIdentifier });
      continue;
    }
    
    if (!serverConfig.transport) {
      validationIssues.push(`Server '${serverIdentifier}': Missing 'transport' type (e.g., "sse", "stdio").`);
    } else {
      if (serverConfig.transport === "sse") {
        if (!serverConfig.url) {
          validationIssues.push(`Server '${serverIdentifier}' (SSE): Missing 'url'.`);
        } else {
          try {
            new URL(serverConfig.url);
          } catch (e) {
            validationIssues.push(`Server '${serverIdentifier}' (SSE): Invalid 'url': ${serverConfig.url}. Error: ${e.message}`);
          }
        }
      } else if (serverConfig.transport === "stdio") {
        if (!serverConfig.command) {
          validationIssues.push(`Server '${serverIdentifier}' (stdio): Missing 'command'.`);
        }
        // Args, cwd, env, stderrBehavior are optional with defaults
      } else if (serverConfig.transport === "websocket") {
        validationIssues.push(`Server '${serverIdentifier}': WebSocket transport is not yet implemented.`);
      } else {
        validationIssues.push(`Server '${serverIdentifier}': Unsupported 'transport' type: ${serverConfig.transport}.`);
      }
    }
    if (serverConfig.manageProcess === true && serverConfig.transport !== "stdio") {
        validationIssues.push(`Server '${serverIdentifier}': 'manageProcess: true' is only applicable for 'stdio' transport, not '${serverConfig.transport}'.`);
    }
  }
  
  return validationIssues;
}

/**
 * Tests connection to an MCP server without invoking any tools.
 * @param {function} getManagedMcpClientFunc - Function to retrieve a managed client instance.
 * @param {string} serverIdentifier - The server identifier.
 * @param {object} options - Additional options.
 * @param {number} options.timeout - Timeout in milliseconds.
 * @returns {Promise<Object>} Connection test result { success: boolean, message?: string, error?: string }.
 */
export async function testMcpServerConnection(getManagedMcpClientFunc, serverIdentifier, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS } = options;
  
  const mcpServerConfigs = await getMcpServerConfigs();
  const serverConfig = mcpServerConfigs[serverIdentifier];
  
  if (!serverConfig) {
    return { success: false, error: `MCP server configuration not found for identifier: ${serverIdentifier}` };
  }
  if (serverConfig.enabled === false) {
    return { success: false, error: `MCP server ${serverIdentifier} is disabled in configuration` };
  }
  
  if (serverConfig.transport === "stdio" && serverConfig.manageProcess === true) {
    const managedClient = getManagedMcpClientFunc(serverIdentifier); // Use passed-in function
    if (!managedClient) {
      return { success: false, error: `Managed stdio server '${serverIdentifier}' is not currently available (no active client).` };
    }
    // For a managed client, "available" means the agent has it. Its state reflects connection.
    return { 
        success: managedClient.state === 'connected', 
        message: `Managed stdio server '${serverIdentifier}' is available. Client state: ${managedClient.state}.`,
        error: managedClient.state !== 'connected' ? `Client not in 'connected' state.` : undefined
    };
  }
  
  let transport;
  let client;
  try {
    logger.info(`Testing connection to unmanaged server '${serverIdentifier}'...`, { serverIdentifier });
    transport = createTransport(serverIdentifier, serverConfig);
    client = new Client({ name: `ai-agent-conn-test-${serverIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}`, version: "1.0.0" });
    
    const connectTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Connection test to '${serverIdentifier}' timed out after ${timeout}ms`)), timeout);
    });
    
    await Promise.race([ client.connect(transport), connectTimeoutPromise ]);
    // Check if client.disconnect is a function before calling, especially if state is not 'connected'
    if (client.state === 'connected' && typeof client.disconnect === 'function') {
      await client.disconnect();
    } else if (typeof client.disconnect !== 'function') {
      logger.warn(`client.disconnect is not a function for server '${serverIdentifier}'. State: ${client.state}`, { serverIdentifier, clientState: client.state });
    } else {
      logger.info(`Client for '${serverIdentifier}' not in 'connected' state (state: ${client.state}), skipping explicit disconnect in test. Transport should close on its own if connection failed.`, { serverIdentifier, clientState: client.state });
    }
    logger.info(`Connection test to '${serverIdentifier}' (connect phase) successful.`, { serverIdentifier });
    return { success: true, message: `Successfully attempted connection to MCP server '${serverIdentifier}'. Disconnect (if applicable) also attempted.` };
  } catch (error) {
    logger.error(`Connection test to '${serverIdentifier}' failed`, error, { serverIdentifier });
    // Attempt to disconnect/close transport even on error if client/transport exists
    if (client && typeof client.disconnect === 'function' && (client.state === 'connected' || client.state === 'connecting')) {
      try { await client.disconnect(); } catch (e) { logger.warn(`Ignoring error during disconnect after test failure for ${serverIdentifier}`, { serverIdentifier, disconnectError: e.message }); }
    } else if (transport && typeof transport.close === 'function') {
      // If client didn't fully form or connect, try closing transport directly
      try { transport.close(); } catch (e) { logger.warn(`Ignoring error during transport.close after test failure for ${serverIdentifier}`, { serverIdentifier, transportCloseError: e.message }); }
    }
    return { success: false, error: `Error connecting to MCP server '${serverIdentifier}': ${error.message}` };
  }
}

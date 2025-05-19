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

// Custom Error Class for MCP Client
class McpClientError extends Error {
  constructor(message, { serverId, toolName, originalError, ...additionalContext } = {}) {
    super(message);
    this.name = "McpClientError";
    this.serverId = serverId;
    this.toolName = toolName;
    if (originalError) {
      this.originalError = originalError;
      // Preserve stack from original error if it's more informative, or append
      if (originalError.stack) {
        this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
      }
    }
    this.additionalContext = additionalContext; // For any other relevant info
    
    // Log the error creation automatically if logger is available
    // Avoid logging if the error is being created as part of a logging call itself to prevent loops
    if (logger && logger.error && !(originalError instanceof McpClientError && originalError.message.includes('Error creating McpClientError'))) {
        try {
            logger.error(`McpClientError created: ${message}`, {
                serverId: this.serverId,
                toolName: this.toolName,
                originalErrorMessage: originalError ? originalError.message : undefined,
                additionalContext: this.additionalContext,
                // stack: this.stack // Stack can be very long, log selectively if needed
            });
        } catch (logError) {
            // Fallback console log if logger itself fails during error creation
            console.error("Critical: Error creating McpClientError and also failed to log it.", logError, message, serverId, toolName);
        }
    }
  }
}

let cachedMainConfig = null; // Renamed for clarity, will store the whole config
let mcpClientDefaultTimeoutMs = 30000; // Default, can be overridden by config

// Constants for configuration and error handling
const CONFIG_FILENAME = 'mcp-config.json'; 
// DEFAULT_TIMEOUT_MS is now mcpClientDefaultTimeoutMs
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000; // 2 seconds between reconnection attempts

// Default environment variables to inherit for stdio processes
const DEFAULT_INHERITED_ENV_VARS = process.platform === "win32"
  ? [ "APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE" ]
  : [ "HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER" ];

/**
 * Helper function to load MCP server configurations from config file
 * @returns {Promise<Object>} The main configuration object
 */
async function getMainConfig() { // Renamed function
  if (cachedMainConfig !== null) {
    logger.debug("Returning cached main configuration.");
    return cachedMainConfig;
  }

  // When running within Next.js API route, process.cwd() is src/advanced-chat-ui/
  // The main config.json is in the project root, so we need to go up two levels.
  const primaryConfigPath = path.resolve(process.cwd(), '../../config.json'); 
  logger.info(`Attempting to load main configuration from ${primaryConfigPath} (cwd: ${process.cwd()})`);
  
  try {
    const configFile = await fs.readFile(primaryConfigPath, 'utf-8');
    cachedMainConfig = JSON.parse(configFile); // Cache the whole config
        
    logger.info(`Successfully loaded and cached main configuration from ${primaryConfigPath}.`);

    // Update default timeout if specified in config
    if (cachedMainConfig && typeof cachedMainConfig.mcpClientDefaultTimeoutMs === 'number' && cachedMainConfig.mcpClientDefaultTimeoutMs > 0) {
      mcpClientDefaultTimeoutMs = cachedMainConfig.mcpClientDefaultTimeoutMs;
      logger.info(`MCP client default timeout overridden by config.json: ${mcpClientDefaultTimeoutMs}ms`);
    }
    return cachedMainConfig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Primary configuration file ${primaryConfigPath} not found. Using default settings and empty MCP servers config.`);
    } else {
      logger.error(`Error reading or parsing ${primaryConfigPath}. Using default settings and empty MCP servers config.`, error);
    }
  }
  
  cachedMainConfig = {}; // Cache empty config on error
  logger.warn(`Could not load main configuration from ${primaryConfigPath}. Using and caching empty configuration.`);
  return cachedMainConfig;
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
      throw new McpClientError(`SSE transport configured but no URL provided.`, { serverId: serverIdentifier });
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
      throw new McpClientError(`Invalid URL for SSE server: ${serverConfig.url} (processed as ${sseUrl}).`, { serverId: serverIdentifier, originalError: e });
    }
  } else if (serverConfig.transport === "stdio") {
    if (!serverConfig.command) {
      throw new McpClientError(`Stdio transport configured but no command provided.`, { serverId: serverIdentifier });
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
    throw new McpClientError(`WebSocket transport not yet implemented.`, { serverId: serverIdentifier });
  } else {
    throw new McpClientError(`Unsupported transport type '${serverConfig.transport}'.`, { serverId: serverIdentifier });
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
    timeout = mcpClientDefaultTimeoutMs, // Use the potentially config-updated default
    allowReconnect = true // Defaulting to true, can be overridden by caller
  } = options;
  
  const mainConfig = await getMainConfig(); // Ensure config is loaded
  const mcpServerConfigs = mainConfig.mcp_servers || {};
  const serverConfig = mcpServerConfigs[serverIdentifier];

  if (!serverConfig) {
    throw new McpClientError(`MCP server configuration not found. Please check config.json.`, { serverId: serverIdentifier, toolName });
  }
  
  if (serverConfig.enabled === false) {
    throw new McpClientError(`MCP server is disabled in configuration.`, { serverId: serverIdentifier, toolName });
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
    const errorMessage = `Managed stdio server is not currently available (no active client). It might have failed to start or crashed.`;
    logger.error(errorMessage, null, { serverIdentifier, toolName });
    throw new McpClientError(errorMessage, { serverId: serverIdentifier, toolName });
  }
  
  logger.info(`Using agent-managed client for stdio server. Client state: ${managedClient.state}. Invoking tool: '${toolName}'...`, { serverIdentifier, toolName, clientState: managedClient.state });
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new McpClientError(`Tool invocation timed out after ${timeout}ms on managed server.`, { serverId: serverIdentifier, toolName, timeout })), timeout);
    });
    
    const result = await Promise.race([
      managedClient.callTool({ name: toolName, arguments: parameters }),
      timeoutPromise
    ]);
    
    logger.info(`Tool '${toolName}' invoked successfully on managed server '${serverIdentifier}'.`, { serverIdentifier, toolName });
    return result;
  } catch (error) {
    const errorMessage = `Error invoking tool on managed server.`;
    logger.error(errorMessage, error, { serverIdentifier, toolName });
    throw new McpClientError(errorMessage, { serverId: serverIdentifier, toolName, originalError: error });
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
      version: "1.0.0",
      transport // Pass transport to the constructor
    });
    
    // Setup transport event handlers for logging/debugging
    if (transport.onerror) {
        const originalOnError = transport.onerror.bind(transport);
        transport.onerror = (error) => {
            logger.error(`Transport error for ${serverIdentifier}`, error, { serverIdentifier, event: "onerror" });
            if (originalOnError) originalOnError(error);
        };
    }
    // Removed fallback to transport._process.on('error', ...) to adhere to public API usage.
    // If transport.onerror is not available, error logging for the transport itself might be reduced for some transport types/states.

    if (transport.onclose) {
        const originalOnClose = transport.onclose.bind(transport);
        transport.onclose = () => {
            logger.info(`Transport closed for ${serverIdentifier}.`, { serverIdentifier, event: "onclose" });
            if (originalOnClose) originalOnClose();
        };
    }
    // Removed fallback to transport._process.on('close', ...) and transport._process.on('exit', ...)
    // to adhere to public API usage. Logging for these events might be reduced for Stdio if not exposed via transport.onclose.
    
    logger.info(`Attempting per-call connect to MCP server '${serverIdentifier}'... Current client state: ${client.state}`, { serverIdentifier, clientState: client.state });
    
    try {
      const connectTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new McpClientError(`Connection timed out after ${timeout}ms.`, { serverId: serverIdentifier, toolName, timeout })), timeout);
      });
      
      await Promise.race([
        client.connect(transport),
        connectTimeoutPromise
      ]);
      
      logger.info(`Connected (per-call) to MCP server '${serverIdentifier}'. Client state: ${client.state}. Invoking tool: '${toolName}'...`, { serverIdentifier, clientState: client.state, toolName });
    } catch (connectError) {
      const errorMessage = `client.connect() failed.`;
      logger.error(errorMessage, connectError, { serverIdentifier, toolName });
      
      if (allowReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        logger.info(`Attempting reconnection to '${serverIdentifier}' (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}) after ${RECONNECT_DELAY_MS}ms delay...`, { serverIdentifier, toolName, attempt: reconnectAttempts + 1, maxAttempts: MAX_RECONNECT_ATTEMPTS });
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
        return invokeToolWithNewConnection(serverIdentifier, serverConfig, toolName, parameters, {
          ...options,
          reconnectAttempts: reconnectAttempts + 1
        });
      }
      throw new McpClientError(errorMessage, { serverId: serverIdentifier, toolName, originalError: connectError, reconnectAttempts });
    }
    
    // Invoke the tool
    try {
      const toolTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new McpClientError(`Tool invocation timed out after ${timeout}ms.`, { serverId: serverIdentifier, toolName, timeout })), timeout);
      });
      
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: parameters }),
        toolTimeoutPromise
      ]);
      
      logger.info(`Tool '${toolName}' invoked successfully on '${serverIdentifier}' (per-call).`, { serverIdentifier, toolName });
      return result; // Result obtained, return before disconnect
    } catch (toolError) {
      const errorMessage = `Error invoking tool.`;
      logger.error(errorMessage, toolError, { serverIdentifier, toolName });
      throw new McpClientError(errorMessage, { serverId: serverIdentifier, toolName, originalError: toolError });
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
        logger.info(`Ensuring transport for '${serverIdentifier}' is closed if client didn't handle it.`, { serverIdentifier, clientState: client ? client.state : 'client_undefined' });
        transport.close(); 
    }
  }
}

/**
 * Validates MCP server configurations and returns any issues found.
 * @returns {Promise<Array<string>>} Array of validation issue strings
 */
export async function validateMcpConfigurations() {
  const mainConfig = await getMainConfig(); // Ensure config is loaded
  const mcpServerConfigs = mainConfig.mcp_servers || {};
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
  const { timeout = mcpClientDefaultTimeoutMs } = options; // Use the potentially config-updated default
  
  const mainConfig = await getMainConfig(); // Ensure config is loaded
  const mcpServerConfigs = mainConfig.mcp_servers || {};
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

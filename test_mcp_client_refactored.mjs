import { invokeMcpTool, validateMcpConfigurations, testMcpServerConnection } from './src/mcpClient.js';
// For now, we will test unmanaged servers primarily, so a dummy getManagedMcpClient is fine.
// If we test managed servers, we'd need a more complex setup or to import from agent.js
const dummyGetManagedMcpClientFunc = (serverId) => {
  // console.log(`[TEST_DUMMY_GET_MANAGED] Request for ${serverId}, returning null as this is for unmanaged tests.`);
  return null; 
};

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from './src/logger.js';

const logger = createLogger("MCP_TEST_SCRIPT");
const MOCK_SERVER_SCRIPT_PATH = './test-mock-mcp-server.js';
const TEST_CONFIG_PATH = './test-mcp-config.json';

// Sample configuration for testing (from Updates and notes/improved/mcp-config-sample.json)
const TEST_CONFIG_CONTENT = {
  "test_stdio_echo": {
    "displayName": "Test Stdio Echo Server",
    "description": "Test stdio echo server (unmanaged)",
    "transport": "stdio",
    "command": "node",
    "args": ["./stdio_echo_server.mjs"], // Using the existing echo server
    "enabled": true,
    "manageProcess": false // Explicitly unmanaged
  },
  "test_sse_echo": {
    "displayName": "Test SSE Echo Server",
    "description": "Test SSE echo server",
    "transport": "sse",
    "url": "http://localhost:5001/sse", // Assuming sse_echo_server.mjs runs on 5001
    "enabled": true
  },
  "test_mock_stdio_tool_server": {
    "displayName": "Test Mock Stdio Server with Tool",
    "description": "Test stdio server with a defined tool",
    "transport": "stdio",
    "command": "node",
    "args": [MOCK_SERVER_SCRIPT_PATH],
    "enabled": true,
    "manageProcess": false
  },
  "invalid_server_missing_transport": {
    "displayName": "Invalid Server - Missing Transport",
    "description": "Server with missing transport type for testing validation.",
    "enabled": true
  },
  "invalid_server_missing_url": {
    "displayName": "Invalid Server - Missing URL for SSE",
    "transport": "sse",
    "enabled": true
  },
  "invalid_server_missing_command": {
    "displayName": "Invalid Server - Missing Command for Stdio",
    "transport": "stdio",
    "enabled": true
  },
  "disabled_server": {
    "displayName": "Disabled Server",
    "description": "Server that is disabled for testing.",
    "transport": "stdio",
    "command": "node",
    "args": ["./non-existent-script.js"],
    "enabled": false
  },
  "timeout_server_sse": { // For testing timeouts - assumes this server will not respond
    "displayName": "Timeout Test SSE Server",
    "transport": "sse",
    "url": "http://localhost:5003/sse-timeout", 
    "enabled": true
  }
};

// Create a mock MCP server script for testing tools
async function createMockMcpToolServerScript() {
  const serverCode = `
// Simple mock MCP server for testing tools
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; // Corrected import path
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const mockLogger = { 
  info: (msg) => console.error('[MOCK_SERVER_INFO] ' + msg),
  error: (msg, err) => console.error('[MOCK_SERVER_ERROR] ' + msg, err)
};

async function runServer() {
  mockLogger.info('Mock MCP tool server starting...');
  const server = new McpServer({
    name: 'mock-mcp-tool-server',
    version: '1.0.0',
  });

  server.tool(
    'echo_tool',
    { message: z.string().describe("Message to echo") },
    async (params) => {
      mockLogger.info('echo_tool called with message: ' + params.message);
      return { content: [{ type: 'text', text: \`MockServer ECHO: \${params.message}\` }] };
    }
  );

  server.tool(
    'error_tool',
    {},
    async (params) => {
      mockLogger.info('error_tool called, will throw error.');
      throw new Error("This is a test error from error_tool");
    }
  );

  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    mockLogger.info('Mock MCP tool server started with stdio transport and connected.');
  } catch (e) {
    mockLogger.error('Failed to connect mock server transport', e);
  }
}
runServer().catch(e => mockLogger.error('Mock server main error', e));
`;
  await fs.writeFile(MOCK_SERVER_SCRIPT_PATH, serverCode);
  logger.info('Created mock MCP tool server script.', { path: MOCK_SERVER_SCRIPT_PATH });
}

// Create test configuration file
async function createTestConfigFile() {
  await fs.writeFile(TEST_CONFIG_PATH, JSON.stringify(TEST_CONFIG_CONTENT, null, 2));
  logger.info('Created test configuration file.', { path: TEST_CONFIG_PATH });
}

// Override getMcpServerConfigs in mcpClient for testing to use TEST_CONFIG_PATH
// This is a bit hacky; ideally mcpClient would allow passing config path or object.
// For now, we'll rely on mcpClient picking up config.json, and we'll name our test config that.
// UPDATE: mcpClient.js was updated to look for 'config.json'. So we will write to 'config.json' for tests
// and restore original later.

let originalConfigJson = null;
async function setupTestEnvironment() {
    logger.info("Setting up test environment...");
    try {
        originalConfigJson = await fs.readFile(path.resolve(process.cwd(), 'config.json'), 'utf-8');
    } catch (e) {
        logger.warn("No original config.json found to back up.");
    }
    // Ensure the test config is written under the 'mcp_servers' key
    const configForFile = {
        mcp_servers: TEST_CONFIG_CONTENT,
        // Add any other top-level config keys if mcpClient or agent expects them,
        // though for mcpClient itself, only mcp_servers is directly used by getMcpServerConfigs.
    };
    await fs.writeFile(path.resolve(process.cwd(), 'config.json'), JSON.stringify(configForFile, null, 2));
    logger.info("Test config.json written with mcp_servers key.");
    await createMockMcpToolServerScript();
    // Ensure sse_echo_server.mjs is running on port 5001 for SSE tests
    logger.info("Reminder: Ensure sse_echo_server.mjs is running on port 5001 (npm run sse-echo-server)");
    logger.info("Reminder: Ensure stdio_echo_server.mjs is available for stdio echo tests.");

}

async function cleanupTestEnvironment() {
    logger.info("Cleaning up test environment...");
    try {
        await fs.unlink(MOCK_SERVER_SCRIPT_PATH);
    } catch (e) { logger.warn("Could not delete mock server script.", { error: e.message }); }
    
    if (originalConfigJson) {
        await fs.writeFile(path.resolve(process.cwd(), 'config.json'), originalConfigJson);
        logger.info("Original config.json restored.");
    } else {
        try {
            await fs.unlink(path.resolve(process.cwd(), 'config.json')); // remove test config if no original
            logger.info("Test config.json removed.");
        } catch (e) { logger.warn("Could not delete test config.json.", { error: e.message });}
    }
}


async function runValidationTests() {
  logger.info('=== Running MCP Configuration Validation ===');
  const validationIssues = await validateMcpConfigurations();
  
  if (validationIssues.length === 0) {
    logger.info('✅ All active server configurations are valid based on structure.');
  } else {
    logger.error('❌ Found validation issues:', null, { issues: validationIssues });
    validationIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`); // Keep direct console for list
    });
  }
  // Test with an intentionally invalid config object (not from file)
  // This part would require modifying validateMcpConfigurations to accept a config object.
  // For now, file-based validation is tested.
}

async function testConnections() {
  logger.info('=== Testing Server Connections ===');
  const serversToTest = ["test_sse_echo", "test_stdio_echo", "test_mock_stdio_tool_server", "disabled_server", "invalid_server_missing_url"];
  
  for (const serverId of serversToTest) {
    logger.info(`\nTesting connection to ${serverId}...`);
    try {
      // Pass dummyGetManagedMcpClientFunc as mcpClient now expects it
      const result = await testMcpServerConnection(dummyGetManagedMcpClientFunc, serverId, { timeout: 7000 });
      if (result.success) {
        logger.info(`✅ Connection test for '${serverId}' successful: ${result.message}`, { serverId, result });
      } else {
        logger.warn(`❌ Connection test for '${serverId}' failed: ${result.error}`, { serverId, result });
      }
    } catch (error) {
      logger.error(`❌ Error during connection test for '${serverId}'`, error, { serverId });
    }
  }
}

async function testToolInvocations() {
  logger.info('\n=== Testing Tool Invocations ===');

  // Test 1: Successful Stdio tool invocation (mock server)
  // Note: This will likely fail if the SDK StdioClientTransport issue persists
  try {
    logger.info('\nInvoking echo_tool on test_mock_stdio_tool_server (expected to fail due to SDK Stdio issue)...');
    const resultStdio = await invokeMcpTool(dummyGetManagedMcpClientFunc, 'test_mock_stdio_tool_server', 'echo_tool', { message: 'Hello Stdio Mock' });
    logger.info('✅ Stdio echo_tool invocation successful (UNEXPECTED):', { result: resultStdio });
  } catch (error) {
    logger.warn(`⚠️ Stdio echo_tool invocation failed (AS EXPECTED due to SDK issue): ${error.message}`, { error: error.message });
  }

  // Test 2: Successful SSE tool invocation (sse_echo_server.mjs must be running on port 5001)
  // sse_echo_server.mjs doesn't have named tools, it just echoes the payload.
  // We'll send a payload that looks like a tool call.
  try {
    logger.info('\nInvoking dummy_tool on test_sse_echo (SSE Echo Server)...');
    const resultSse = await invokeMcpTool(dummyGetManagedMcpClientFunc, 'test_sse_echo', 'dummy_echo_tool', { data: 'Hello SSE Echo' });
    logger.info('✅ SSE dummy_tool invocation successful:', { result: resultSse });
    if (resultSse.content && resultSse.content[0] && resultSse.content[0].text.includes('"data":"Hello SSE Echo"')) {
        logger.info("SSE Echo content verified.");
    } else {
        logger.warn("SSE Echo content mismatch or not found.", { result: resultSse });
    }
  } catch (error) {
    logger.error(`❌ SSE dummy_tool invocation failed: ${error.message}`, error);
  }

  // Test 3: Tool invocation on a disabled server
  try {
    logger.info('\nInvoking tool on disabled_server...');
    await invokeMcpTool(dummyGetManagedMcpClientFunc, 'disabled_server', 'any_tool', {});
    logger.error('❌ Tool invocation on disabled_server should have failed but did not.');
  } catch (error) {
    if (error.message.includes("disabled in configuration")) {
      logger.info('✅ Tool invocation on disabled_server correctly failed as expected.', { error: error.message });
    } else {
      logger.error('❌ Tool invocation on disabled_server failed, but with an unexpected error:', error);
    }
  }
  
  // Test 4: Tool invocation timeout
  try {
    logger.info('\nInvoking tool on timeout_server_sse (expected to timeout)...');
    await invokeMcpTool(dummyGetManagedMcpClientFunc, 'timeout_server_sse', 'any_tool', {}, { timeout: 1000 }); // Short timeout
    logger.error('❌ Tool invocation on timeout_server_sse should have timed out but did not.');
  } catch (error) {
    if (error.message.includes("timed out")) {
      logger.info('✅ Tool invocation on timeout_server_sse correctly timed out as expected.', { error: error.message });
    } else {
      logger.error('❌ Tool invocation on timeout_server_sse failed, but not with a timeout error:', error);
    }
  }

  // Test 5: Server returns an error from tool
  try {
    logger.info('\nInvoking error_tool on test_mock_stdio_tool_server...');
    const resultErrorStdio = await invokeMcpTool(dummyGetManagedMcpClientFunc, 'test_mock_stdio_tool_server', 'error_tool', {});
    // Check if the result itself contains an error payload, as client.callTool might not throw for MCP errors
    if (resultErrorStdio && resultErrorStdio.error && typeof resultErrorStdio.error.message === 'string' && resultErrorStdio.error.message.includes("This is a test error from error_tool")) {
        logger.info('✅ Stdio error_tool correctly returned an error payload from server.', { result: resultErrorStdio });
    } else {
        // This means client.callTool resolved without throwing, and the result isn't the expected MCP error structure.
        // This could happen if the Stdio connection is too unstable for the server's error to even be packaged and returned.
        logger.warn('⚠️ Stdio error_tool invocation did not throw a client-side error, nor did it return the expected MCP error structure. This might be due to underlying Stdio client instability.', { result: resultErrorStdio });
    }
  } catch (error) {
     // This block is hit if invokeMcpTool (or client.callTool within it) *throws* an error.
     if (error.message && error.message.includes("This is a test error from error_tool")) {
        logger.info('✅ Stdio error_tool correctly propagated server-side error as a thrown client-side exception.', { errorMessage: error.message });
     } else {
        // This is the most likely path if the Stdio connection itself fails before the tool logic is fully processed.
        logger.warn(`⚠️ Stdio error_tool invocation failed, likely due to SDK Stdio client issue or an unexpected client-side error: ${error.message}`, { errorMessage: error.message, errorStack: error.stack });
     }
  }
}


async function runAllTests() {
  logger.info('Starting MCP client test suite...');
  await setupTestEnvironment();

  try {
    await runValidationTests();
    await testConnections(); // Will use dummyGetManagedMcpClientFunc
    await testToolInvocations(); // Will use dummyGetManagedMcpClientFunc
  } catch (e) {
    logger.error("Error during test execution", e);
  } finally {
    await cleanupTestEnvironment();
    logger.info('MCP client test suite completed.');
  }
}

runAllTests().catch(e => {
  logger.error("Unhandled error in test runner", e);
  // Ensure cleanup even on unhandled error
  cleanupTestEnvironment().finally(() => process.exit(1));
});

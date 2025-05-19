// Test script for the enhanced MCP client
import { invokeMcpTool, validateMcpConfigurations, testMcpServerConnection } from './mcpClient.js';
import fs from 'fs/promises';
import path from 'path';

// Sample configuration for testing
const TEST_CONFIG = {
  "test_sse_server": {
    "displayName": "Test SSE Server",
    "description": "Test SSE server for validation",
    "transport": "sse",
    "url": "http://localhost:5000/sse",
    "enabled": true
  },
  "test_stdio_server": {
    "displayName": "Test Stdio Server",
    "description": "Test stdio server for validation",
    "transport": "stdio",
    "command": "node",
    "args": ["./mock-mcp-server.js"],
    "enabled": true
  }
};

// Create a mock MCP server for testing
async function createMockMcpServer() {
  const serverCode = `
// Simple mock MCP server for testing
import { createServer } from 'http';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Create a simple MCP server with a test tool
const server = new MCPServer({
  name: 'mock-mcp-server',
  version: '1.0.0',
  tools: [
    {
      name: 'test_tool',
      description: 'A test tool for validation',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'A test message'
          }
        },
        required: ['message']
      }
    }
  ]
});

// Register tool handler
server.registerToolHandler('test_tool', async (params) => {
  console.log('Test tool called with message:', params.message);
  return {
    status: 'success',
    message: \`Received: \${params.message}\`
  };
});

// Use stdio transport
const transport = new StdioServerTransport();
server.listen(transport);

console.log('Mock MCP server started with stdio transport');
`;

  await fs.writeFile('./mock-mcp-server.js', serverCode);
  console.log('Created mock MCP server script');
}

// Create test configuration file
async function createTestConfig() {
  await fs.writeFile('./mcp-config.json', JSON.stringify(TEST_CONFIG, null, 2));
  console.log('Created test configuration file');
}

// Run validation tests
async function runValidationTests() {
  console.log('\n=== Running MCP Configuration Validation ===');
  const validationIssues = await validateMcpConfigurations();
  
  if (validationIssues.length === 0) {
    console.log('✅ All server configurations are valid');
  } else {
    console.log('❌ Found validation issues:');
    validationIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  }
}

// Test connection to servers
async function testConnections() {
  console.log('\n=== Testing Server Connections ===');
  
  for (const [serverId, _] of Object.entries(TEST_CONFIG)) {
    console.log(`\nTesting connection to ${serverId}...`);
    try {
      const result = await testMcpServerConnection(serverId, { timeout: 5000 });
      if (result.success) {
        console.log(`✅ Connection successful: ${result.message}`);
      } else {
        console.log(`❌ Connection failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error testing connection: ${error.message}`);
    }
  }
}

// Test tool invocation
async function testToolInvocation() {
  console.log('\n=== Testing Tool Invocation ===');
  
  try {
    console.log('\nInvoking test_tool on test_stdio_server...');
    const result = await invokeMcpTool('test_stdio_server', 'test_tool', { message: 'Hello from test script' });
    console.log('✅ Tool invocation successful:');
    console.log(result);
  } catch (error) {
    console.error(`❌ Tool invocation failed: ${error.message}`);
  }
}

// Main test function
async function runTests() {
  console.log('Starting MCP client validation tests...');
  
  try {
    await createMockMcpServer();
    await createTestConfig();
    
    await runValidationTests();
    await testConnections();
    await testToolInvocation();
    
    console.log('\n=== Test Summary ===');
    console.log('MCP client validation tests completed');
  } catch (error) {
    console.error('Error during tests:', error);
  }
}

// Run the tests
runTests().catch(console.error);

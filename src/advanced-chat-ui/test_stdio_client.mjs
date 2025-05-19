import { invokeMcpTool } from './src/lib/mcp_ui_client.mjs';

async function testStdio() {
  console.log('--- Starting Stdio MCP Client Test ---');
  const serverName = 'exa_search_ui';
  // Assuming the Exa MCP server provides a tool named 'web_search_exa'
  // This tool name is based on common patterns for Exa MCP servers.
  const toolName = 'web_search_exa'; 
  const toolArgs = { query: 'latest AI advancements' };

  try {
    console.log(`Attempting to call ${toolName} on ${serverName} with args:`, toolArgs);
    const result = await invokeMcpTool(serverName, toolName, toolArgs);
    console.log('--- Test Result ---');
    console.log('Status: Success');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('--- Test Result ---');
    console.error('Status: Failed');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    // Log the full error object if it has more details
    if (typeof error === 'object' && error !== null && Object.keys(error).length > 0) {
        console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
  } finally {
    console.log('--- Stdio MCP Client Test Finished ---');
  }
}

testStdio();

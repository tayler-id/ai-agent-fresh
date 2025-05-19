import { invokeMcpTool } from './src/lib/mcp_ui_client.mjs';

async function testSse() {
  console.log('--- Starting SSE MCP Client Test ---');
  const serverName = 'sse_echo_server_ui';
  // Attempting to use 'echoTool' from the simple SSE echo server.
  const toolName = 'echoTool'; 
  const toolArgs = { message: "Hello from SSE Client Test!" };

  console.log(`Attempting to call ${toolName} on ${serverName} (SSE) with args:`, toolArgs);
  console.log(`Please ensure the Simple SSE Echo server is running at http://localhost:5003/sse.`);

  try {
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
    if (error.message && error.message.includes('ECONNREFUSED')) {
      console.error('Hint: ECONNREFUSED suggests the SSE server is not running or not reachable at the configured URL.');
    }
    // Log the full error object if it has more details
    if (typeof error === 'object' && error !== null && Object.keys(error).length > 0) {
        console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
  } finally {
    console.log('--- SSE MCP Client Test Finished ---');
  }
}

testSse();

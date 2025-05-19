import { invokeMcpTool } from './src/mcpClient.js';
import { createLogger } from './src/logger.js';

const logger = createLogger('MCPDemoScript');

// Mock getManagedMcpClientFunc as it's required by invokeMcpTool,
// but for unmanaged servers or new connections, it won't actually be used to retrieve a client.
// For managed servers, this mock would mean a new connection is always attempted.
const getManagedMcpClientFunc = (serverIdentifier) => {
  logger.info(`Mock getManagedMcpClientFunc called for: ${serverIdentifier}. Returning null as this demo focuses on unmanaged or new connections.`);
  return null; 
};

async function main() {
  const serverIdentifier = 'exa_search_stdio_unmanaged';
  const toolName = 'web_search_exa'; // Assuming this is the tool name from exa-mcp-server
  const parameters = {
    query: 'latest AI news',
    numResults: 2
  };

  logger.info(`Attempting to call tool '${toolName}' on server '${serverIdentifier}' with params:`, parameters);

  try {
    const result = await invokeMcpTool(
      getManagedMcpClientFunc,
      serverIdentifier,
      toolName,
      parameters,
      { timeout: 45000 } // Increased timeout for potentially slower stdio server startup
    );
    logger.info(`Tool call successful. Result for '${toolName}':`, result);
    console.log("\nMCP Tool Call Result:\n", JSON.stringify(result, null, 2));
  } catch (error) {
    logger.error(`Tool call failed for '${toolName}' on '${serverIdentifier}'. Error:`, error.message);
    if (error.originalError) {
      logger.error('Original error details:', error.originalError);
    }
    if (error.stack) {
        logger.error('Stacktrace:', error.stack);
    }
    console.error("\nMCP Tool Call Failed:\n", error);
  }
}

main();

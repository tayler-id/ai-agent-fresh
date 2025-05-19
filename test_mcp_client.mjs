import { invokeMcpTool } from './src/mcpClient.js';
import { promises as fs } from 'fs';

// Load config to ensure mcpClient can find the server URL
async function loadAgentConfig() {
  try {
    const configFileContent = await fs.readFile('config.json', 'utf8');
    return JSON.parse(configFileContent);
  } catch (e) {
    console.error('Failed to load config.json for test:', e);
    return { mcp_servers: {} }; // Fallback
  }
}

async function testTaskManager() {
  const agentConfig = await loadAgentConfig();
  const serverIdentifier = "github.com/pashpashpash/mcp-taskmanager";

  if (!agentConfig.mcp_servers || !agentConfig.mcp_servers[serverIdentifier] || !agentConfig.mcp_servers[serverIdentifier].url) {
    console.error(`Task Manager MCP server URL not found in config.json for server: ${serverIdentifier}. Ensure it's configured correctly.`);
    return;
  }
  
  const serverName = serverIdentifier;
  const toolName = "list_requests"; // This tool takes no arguments
  const params = {}; 
  console.log(`Attempting to call ${toolName} on ${serverName} with params:`, params);
  try {
    const result = await invokeMcpTool(serverName, toolName, params);
    console.log("Task Manager 'list_requests' Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error during Task Manager test:", error);
  }
}
testTaskManager();

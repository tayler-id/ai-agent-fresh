// test_markdownify_managed.mjs
import { invokeMcpTool } from './src/mcpClient.js';
import { getManagedMcpClient } from './src/agent.js'; // This will be used by invokeMcpTool

async function testMarkdownify() {
  const serverId = 'markdownify_stdio_managed';
  const toolName = 'webpage-to-markdown';
  const toolArgs = { url: 'https://www.example.com' };

  console.log(`Attempting to call tool "${toolName}" on managed server "${serverId}" with args:`, toolArgs);

  try {
    // Since agent.js is running separately, getManagedMcpClient here will likely NOT find
    // the client instance managed by that separate agent.js process.
    // invokeMcpTool will then see that serverConfig.manageProcess is true,
    // but getManagedMcpClient (from this script's perspective) returns null.
    // This will result in an error "Managed stdio server is not currently available".
    //
    // For a true test of the agent's managed client, the agent itself would need to expose
    // a way to use its managed clients (e.g. via another MCP server it hosts, or an API).
    //
    // However, if we temporarily set manageProcess: false for markdownify_stdio_managed
    // in config.json, then invokeMcpTool would fall back to creating a new connection
    // per call, which would at least test if the Markdownify server itself works.
    //
    // For now, let's see the expected error with manageProcess: true.
    const result = await invokeMcpTool(getManagedMcpClient, serverId, toolName, toolArgs);
    console.log('Tool call successful. Result:');
    console.dir(result, { depth: null });
  } catch (error) {
    console.error(`Error calling tool "${toolName}" on server "${serverId}":`);
    console.error(error);
  }
}

testMarkdownify();

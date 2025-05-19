// test-harness.js
import fs from 'fs';
import path from 'path';
import { invokeMcpTool } from './src/mcpClient.js'; // Path is correct if harness is in root
import { getManagedMcpClient } from './src/agent.js'; // Path is correct if harness is in root

(async () => {
  // Load your MCP servers config
  const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'config.json'), 'utf8'));
  const servers = config.mcp_servers || {};
  console.log('Found servers:', Object.keys(servers));

  for (const serverId of Object.keys(servers)) {
    console.log(`\n== Testing server: ${serverId} ==`);
    try {
      // 1) Test connection via test endpoint
      const connResult = await invokeMcpTool(getManagedMcpClient, serverId, 'testConnection', {});
      console.log('Connection test:', connResult);
    } catch (err) {
      console.error('Connection failed:', err);
    }

    try {
      // 2) Invoke a sample tool (replace 'ping' with an actual tool you have)
      const pingResult = await invokeMcpTool(getManagedMcpClient, serverId, 'ping', {});
      console.log('Ping tool result:', pingResult);
    } catch (err) {
      console.error('Tool invocation failed:', err);
    }
  }
})();

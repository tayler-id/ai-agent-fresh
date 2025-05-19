// test_sdk_stdio.mjs (in project root)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

const DEFAULT_INHERITED_ENV_VARS = process.platform === "win32"
  ? [ "APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE" ]
  : [ "HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER" ];

function getDefaultEnvironment() {
  const env = {};
  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined || value.startsWith("()")) continue;
    env[key] = value;
  }
  return env;
}

async function main() {
  console.log("Starting Minimal StdioClientTransport Test...");

  // --- Configuration for your test MCP server ---
  // Replace with a simple, reliable stdio MCP server you can run.
  // For example, the Exa server if you can run it manually:
  const serverCommand = "node"; // Or python, or whatever your MCP server needs
  const serverArgs = ["/Users/tramsay/Documents/Cline/MCP/exa-mcp-server/build/index.js"]; // Path to Exa server
  const serverCwd = "/Users/tramsay/Documents/Cline/MCP/exa-mcp-server"; // CWD for Exa server
  const serverEnv = {
    EXA_API_KEY: "020c7c83-1758-43ac-98ed-1abecd44ae76", // Actual EXA_API_KEY
    // Add any other env vars the server needs
  };
  const toolToCall = { name: "web_search_exa", arguments: { query: "test" } }; // Example tool
  // --- End Configuration ---

  const stdioParams = {
    command: serverCommand,
    args: serverArgs,
    cwd: serverCwd,
    env: { ...getDefaultEnvironment(), ...serverEnv },
    stderr: "inherit", // "pipe" or "inherit"
  };

  let client;
  try {
    const transport = new StdioClientTransport(stdioParams);
    client = new Client({ name: "minimal-stdio-test", version: "1.0.0" });

    console.log("Attempting to connect...");
    await client.connect(transport);
    console.log("Connected.");
    console.log("Client state:", client.state);
    console.log("typeof client.callTool:", typeof client.callTool);

    if (client.state === "connected" && typeof client.callTool === 'function') {
      console.log(`Attempting to call tool: ${toolToCall.name}`);
      const result = await client.callTool(toolToCall);
      console.log("Tool call result:", result);
    } else {
      console.error("Client not in expected state or callTool not available.");
    }

  } catch (error) {
    console.error("Error during Stdio test:", error);
  } finally {
    if (client && client.state === "connected") {
      console.log("Attempting to disconnect...");
      await client.disconnect();
      console.log("Disconnected.");
    }
  }
}

main();

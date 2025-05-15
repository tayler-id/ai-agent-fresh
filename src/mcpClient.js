// MCP Client for FastMCP tool invocation (Node.js)
// Requires: @modelcontextprotocol/sdk

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const MCP_SERVER_URL = "http://localhost:5000/sse"; // Adjust if using /stream

/**
 * Invokes a FastMCP tool on the running server.
 * @param {string} toolName - The name of the tool (e.g., "get_youtube_video_transcript")
 * @param {object} parameters - The tool parameters (e.g., { url: "..." })
 * @returns {Promise<any>} - The tool result
 */
export async function invokeMcpTool(toolName, parameters) {
  const client = new Client({
    name: "ai-agent",
    version: "1.0.0"
  });
  const transport = new SSEClientTransport(new URL(MCP_SERVER_URL));
  await client.connect(transport);

  const result = await client.invokeTool(toolName, parameters);
  await client.disconnect();
  return result;
}

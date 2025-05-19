// src/advanced-chat-ui/src/pages/api/invoke-mcp.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { invokeMcpTool } from '../../lib/mcpClient.js'; // Path to local copy
import { getManagedMcpClient } from '../../lib/agent.js'; // Path to local copy

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverName, toolName, toolArgs } = req.body;
  if (typeof serverName !== 'string' || typeof toolName !== 'string') {
    return res.status(400).json({ error: 'Invalid parameters: serverName and toolName must be strings' });
  }

  // Ensure toolArgs is an object, default to empty object if not provided or not an object
  const finalToolArgs = (typeof toolArgs === 'object' && toolArgs !== null) ? toolArgs : {};

  try {
    // Note: getManagedMcpClient is passed, mcpClient.js will use it to get the client instance
    const result = await invokeMcpTool(getManagedMcpClient, serverName, toolName, finalToolArgs);
    res.status(200).json(result);
  } catch (errorUnknown: unknown) { 
    console.error('[API /invoke-mcp] Error invoking MCP:', errorUnknown);
    
    let errorMessage = 'MCP invocation failed';
    const errorDetails: Record<string, string | undefined> = {}; // Use const and more specific type

    const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown));
    errorMessage = error.message;

    // Check for custom properties if it's potentially an McpClientError
    if (error.name === "McpClientError") {
        const mcpError = error as { serverId?: string, toolName?: string, originalError?: Error }; // More specific cast
        errorDetails.serverId = mcpError.serverId;
        errorDetails.toolNameCalled = mcpError.toolName;
        if (mcpError.originalError && mcpError.originalError.message) {
            errorMessage += ` (Original: ${mcpError.originalError.message})`;
            errorDetails.originalErrorMsg = mcpError.originalError.message;
        }
    }
    
    res.status(500).json({ 
        error: errorMessage,
        ...errorDetails
        // stack: error?.stack // Optionally include stack for debugging, be cautious in production
    });
  }
}

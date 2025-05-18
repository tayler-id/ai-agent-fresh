import http from 'http';
import { randomUUID } from 'crypto';

const PORT = 5001; // Changed to 5001 for test_mcp_client_refactored.mjs

console.log(`Starting Simple SSE Echo MCP Server on port ${PORT}...`);

const server = http.createServer((req, res) => {
  if (req.url === '/sse' && req.headers.accept === 'text/event-stream') {
    console.log('[SSE Echo Server] Client connected for SSE');

    // SSE Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*', // Allow all origins for simplicity
    });
    res.write('\n'); // Initial newline to establish connection

    // Send a capabilities message (optional, but good practice for MCP)
    const capabilities = {
      jsonrpc: '2.0',
      method: 'mcp/capabilities',
      params: {
        clientInfo: { name: 'simple-sse-echo-server', version: '1.0.0' },
        tools: [
          {
            name: 'echoTool',
            description: 'Echoes back the arguments it receives.',
            inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
            outputSchema: { type: 'object' },
          },
        ],
      },
    };
    res.write(`id: ${randomUUID()}\nevent: mcp_notification\ndata: ${JSON.stringify(capabilities)}\n\n`);


    req.on('data', (chunk) => {
      // This server doesn't expect data via POST body for SSE,
      // MCP requests come via client-side EventSource sending GET with query params or similar.
      // However, MCP tool calls are typically initiated by the client *after* connection.
      // This simple server will react to "tool call" like messages if they were sent via some other means,
      // but standard MCP client would use client.callTool() which sends its own formatted SSE messages.
      // For this echo server, we'll assume the client sends a specific event type or we just echo anything.
      // Let's assume the client will use a method that results in an mcp_request event.
      // A real MCP server would parse `event: mcp_request` and `data: ...` from the client.
      // This simple echo server won't implement full client-side message parsing.
      // It will primarily respond to `client.callTool` which the SDK translates into specific messages.
      console.log(`[SSE Echo Server] Received raw data (should be empty for SSE GET): ${chunk}`);
    });

    // Keep connection alive
    const intervalId = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 10000);

    req.on('close', () => {
      console.log('[SSE Echo Server] Client disconnected');
      clearInterval(intervalId);
      res.end();
    });

    // This is where a real MCP server would listen for messages from the client.
    // For an echo server, we'd expect the SDK's client.callTool to send a message,
    // and the server would need to parse it.
    // The @modelcontextprotocol/sdk's SSEClientTransport doesn't directly expose a way for the *server*
    // to receive arbitrary messages from the client *through the EventSource connection itself*
    // beyond the initial HTTP request. Communication is typically client-initiated tool calls.
    // So, this echo server will just be ready to respond if the client *could* send it a message
    // that it's supposed to echo.
    // The SDK's `client.callTool` will send a structured message.
    // This basic server won't fully parse it but will demonstrate connectivity.

    // Let's simulate receiving a tool call for 'echoTool'
    // A real server would parse incoming mcp_request events.
    // This is a simplification for testing client connectivity.
    // The client will call `echoTool`. The SDK handles sending the request.
    // The server needs to send back a response.

    // We can't directly "receive" the client's `callTool` message here in this simple model.
    // Instead, we'll just send a predefined response when a client connects and calls a tool.
    // This isn't a true echo, but tests if the client can connect and receive *a* response.

    // To make it slightly more "echo-like", let's assume any `callTool` from the client
    // is for "echoTool". The SDK handles the request part.
    // The server's job is to send the mcp_response.
    // This part is tricky for a *simple* echo server without full MCP message parsing.

    // A true MCP server would have a more complex request/response handling loop.
    // For now, this server will just confirm connection and be ready.
    // The test script `test_sse_client.mjs` will attempt `client.callTool`.
    // If the SDK's `SSEClientTransport` has issues like the `onclose` error,
    // it will fail before even properly sending the tool call.

  } else if (req.method === 'POST' && req.url === '/mcp') {
    // Basic MCP POST endpoint for non-SSE clients or initial handshake if needed
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        console.log('[SSE Echo Server] Received POST /mcp:', body);
        try {
            const request = JSON.parse(body);
            if (request.method === 'mcp/tool/call' && request.params && request.params.toolName === 'echoTool') {
                const response = {
                    jsonrpc: '2.0',
                    result: {
                        toolName: request.params.toolName,
                        arguments: request.params.arguments,
                        echoed: true,
                        message: `Echoing your message: ${request.params.arguments.message}`
                    },
                    id: request.id
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
                return;
            }
        } catch (e) {
            console.error('[SSE Echo Server] Error parsing POST /mcp body:', e);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request' }));
    });


  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[SSE Echo Server] Listening on http://localhost:${PORT}`);
  console.log(`[SSE Echo Server] SSE endpoint available at http://localhost:${PORT}/sse`);
  console.log(`[SSE Echo Server] Basic POST MCP endpoint available at http://localhost:${PORT}/mcp`);
});

process.on('SIGINT', () => {
  console.log('[SSE Echo Server] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

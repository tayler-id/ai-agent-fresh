import readline from 'readline';

console.error('[STDIO_ECHO_SERVER] Starting...');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  console.error(`[STDIO_ECHO_SERVER] Received: ${line}`);
  // MCP messages are JSON, so we expect JSON lines.
  // For a simple echo, we'll just echo the line back.
  // A real MCP server would parse and construct proper MCP responses.
  try {
    const request = JSON.parse(line);
    // Simple echo for testing basic communication
    const response = {
      type: "response",
      id: request.id || "unknown", // Try to echo back the request ID
      result: {
        content: [{ type: "text", text: `ECHO: ${JSON.stringify(request.payload || request)}` }]
      }
    };
    console.log(JSON.stringify(response));
  } catch (e) {
    // If not JSON, just echo raw for basic non-MCP stdio testing
    console.error(`[STDIO_ECHO_SERVER] Line was not valid JSON: ${line}. Echoing raw.`);
    const errorResponse = {
        type: "response",
        id: "error-parsing",
        error: { message: `Server received non-JSON line: ${line}` }
    };
    console.log(JSON.stringify(errorResponse));
  }
});

rl.on('close', () => {
  console.error('[STDIO_ECHO_SERVER] stdin closed. Exiting.');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[STDIO_ECHO_SERVER] Received SIGINT. Exiting.');
  process.exit(0);
});

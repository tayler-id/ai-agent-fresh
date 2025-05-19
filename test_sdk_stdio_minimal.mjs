import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";
import path from 'node:path';

const LOG_PREFIX = "[MINIMAL_TEST_STDIO]";

async function main() {
  console.log(`${LOG_PREFIX} Starting minimal test for @modelcontextprotocol/sdk StdioClientTransport (target SDK v1.11.4)...`);

  const serverCommand = 'node';
  const serverArgs = [path.resolve(process.cwd(), 'stdio_echo_server.mjs')];

  console.log(`${LOG_PREFIX} Stdio server command: ${serverCommand} ${serverArgs.join(' ')}`);

  const stdioParams = {
    command: serverCommand,
    args: serverArgs,
    cwd: process.cwd(),
    env: { ...process.env }, // Inherit current env
    stderr: "pipe", // Pipe to capture stderr from the echo server
  };

  let transport;
  try {
    console.log(`${LOG_PREFIX} Attempting to create StdioClientTransport...`);
    transport = new StdioClientTransport(stdioParams);
    console.log(`${LOG_PREFIX} StdioClientTransport created successfully.`);

    transport.onerror = (error) => {
      console.error(`${LOG_PREFIX} Transport onerror:`, error);
    };
    transport.onclose = () => {
      console.log(`${LOG_PREFIX} Transport onclose event.`);
    };
     // Capture stderr from the transport's child process
    if (transport.stderr) {
        transport.stderr.on('data', (data) => {
            console.error(`[STDIO_ECHO_SERVER_STDERR_VIA_TRANSPORT] ${data.toString().trim()}`);
        });
    } else {
        console.warn(`${LOG_PREFIX} transport.stderr stream not available immediately after transport creation.`);
    }


  } catch (e) {
    console.error(`${LOG_PREFIX} Error creating StdioClientTransport:`, e);
    return;
  }

  const client = new Client({
    name: "minimal-stdio-test-client",
    version: "1.0.0"
  });
  console.log(`${LOG_PREFIX} Client instance created.`);
  console.log(`${LOG_PREFIX} Initial client.state: ${client.state}`);


  try {
    console.log(`${LOG_PREFIX} Attempting client.connect(transport)...`);
    // Wrap connect in a promise with timeout, as it might hang
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("client.connect() timed out after 10 seconds")), 10000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    
    console.log(`${LOG_PREFIX} client.connect() promise resolved.`);
    console.log(`${LOG_PREFIX} Client state after connect: ${client.state}`);
    console.log(`${LOG_PREFIX} Client object keys: ${Object.keys(client).join(', ')}`);
    console.log(`${LOG_PREFIX} Client prototype: ${Object.getPrototypeOf(client)}`);
    console.log(`${LOG_PREFIX} typeof client.callTool: ${typeof client.callTool}`);


    if (client.state === "connected") {
      console.log(`${LOG_PREFIX} Client connected. Attempting to send a listResources request (as a generic MCP message)...`);
      
      // Try a low-level request first, as callTool might be part of the issue
      const listResourcesRequest = {
        type: "request",
        id: "test-list-resources-1",
        payload: {
          type: "listResources",
          // No specific params for listResources usually
        }
      };
      
      console.log(`${LOG_PREFIX} Sending request: ${JSON.stringify(listResourcesRequest)}`);
      
      // The SDK's Client class does not have a generic 'send' method.
      // It uses callTool, callResource, etc.
      // Let's try callTool with a dummy tool if the echo server can handle it.
      // The echo server will just echo.
      
      if (typeof client.callTool === 'function') {
        const toolParams = { greeting: "hello from minimal client" };
        console.log(`${LOG_PREFIX} Attempting client.callTool({ name: 'echoTest', arguments: ${JSON.stringify(toolParams)} })...`);
        const result = await client.callTool({ name: "echoTest", arguments: toolParams });
        console.log(`${LOG_PREFIX} client.callTool result:`, result);
      } else {
        console.error(`${LOG_PREFIX} client.callTool is not a function. State: ${client.state}`);
      }

    } else {
      console.error(`${LOG_PREFIX} Client did not connect. State: ${client.state}. Cannot send request.`);
    }

  } catch (error) {
    console.error(`${LOG_PREFIX} Error during client.connect() or tool invocation:`, error);
    console.error(`${LOG_PREFIX} Client state at time of error: ${client.state}`);
  } finally {
    if (client.state === "connected" || client.state === "connecting") {
      console.log(`${LOG_PREFIX} Attempting client.disconnect()...`);
      await client.disconnect();
      console.log(`${LOG_PREFIX} client.disconnect() completed. Final client.state: ${client.state}`);
    } else {
      console.log(`${LOG_PREFIX} Client not in connected/connecting state, no disconnect needed. Final client.state: ${client.state}`);
    }
    // Ensure transport is closed if it has a close method and was initialized
    if (transport && typeof transport.close === 'function') {
        console.log(`${LOG_PREFIX} Attempting transport.close()...`);
        transport.close(); // This should terminate the child process
        console.log(`${LOG_PREFIX} transport.close() called.`);
    }
  }
}

main().catch(e => {
  console.error(`${LOG_PREFIX} Unhandled error in main:`, e);
});

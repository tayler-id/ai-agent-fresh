import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

async function runMinimalTest() {
  console.log("--- Starting Minimal SDK Stdio Test ---");

  const stdioParams = {
    command: "node",
    args: ["-e", "console.log('MCP Server Mock Started'); setInterval(() => {}, 1000);"], // Keeps process alive
    cwd: process.cwd(),
    // env: {}, // Using an empty env caused ENOENT, let StdioClientTransport use its default (inherit) or provide a minimal one with PATH
    // StdioClientTransport defaults to inheriting PATH, HOME, SHELL, LOGNAME, USER, TERM if env is not provided or if specific keys are missing.
    // Let's rely on its default internal environment setup by not passing `env` or passing undefined.
    // Alternatively, explicitly pass process.env or a filtered version.
    // Forcing a minimal PATH for testing:
    env: { PATH: process.env.PATH }, // Pass at least PATH
    stderr: "inherit",
  };

  let transport;
  let client;

  try {
    console.log("[MinimalTest] Creating StdioClientTransport...");
    transport = new StdioClientTransport(stdioParams);
    console.log("[MinimalTest] StdioClientTransport created.");

    console.log("[MinimalTest] Creating Client...");
    client = new Client({ name: "minimal-test-client", version: "1.0.0" });
    console.log("[MinimalTest] Client created.");
    
    console.log(`[MinimalTest] Client object before connect:`, client);
    console.log(`[MinimalTest] Client state before connect: ${client.state}`);
    console.log(`[MinimalTest] typeof client.invokeTool before connect: ${typeof client.invokeTool}`);


    console.log("[MinimalTest] Attempting client.connect(transport)...");
    await client.connect(transport);
    console.log("[MinimalTest] client.connect() promise resolved.");

    console.log("--- After Connect ---");
    console.log(`[MinimalTest] Client object:`, client);
    console.log(`[MinimalTest] Client state: ${client.state}`);
    console.log(`[MinimalTest] Client object keys: ${Object.keys(client).join(', ')}`);
    console.log(`[MinimalTest] Client prototype: ${Object.getPrototypeOf(client)}`);
    console.log(`[MinimalTest] typeof client.invokeTool: ${typeof client.invokeTool}`);

    if (typeof client.invokeTool === 'function') {
      console.log("[MinimalTest] client.invokeTool IS a function. Attempting dummy invoke...");
      // This mock server doesn't actually implement MCP, so invokeTool will likely fail,
      // but we are checking if the method *exists* and can be called.
      try {
        await client.invokeTool("dummyTool", {});
        console.log("[MinimalTest] Dummy invokeTool call did not throw (unexpected for mock server).");
      } catch (invokeError) {
        console.log(`[MinimalTest] Dummy invokeTool call threw (as expected for mock server): ${invokeError.message}`);
      }
    } else {
      console.error("[MinimalTest] client.invokeTool IS NOT a function.");
    }

  } catch (error) {
    console.error("[MinimalTest_ERROR] Error during minimal test:", error.message, error.stack);
  } finally {
    if (client && (client.state === 'connected' || client.state === 'connecting')) {
      console.log("[MinimalTest] Attempting client.disconnect()...");
      try {
        await client.disconnect();
        console.log("[MinimalTest] client.disconnect() successful.");
      } catch (disconnectError) {
        console.error("[MinimalTest_ERROR] Error during disconnect:", disconnectError.message);
      }
    } else if (transport && transport.state !== 'closed') { // If client didn't connect, transport might still be open
        console.log("[MinimalTest] Client not connected, attempting transport.close()...");
        try {
            await transport.close();
            console.log("[MinimalTest] transport.close() successful.");
        } catch (transportCloseError) {
            console.error("[MinimalTest_ERROR] Error during transport.close():", transportCloseError.message);
        }
    }
    console.log("--- Minimal SDK Stdio Test Complete ---");
  }
}

runMinimalTest();

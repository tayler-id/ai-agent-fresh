import { invokeMcpTool } from './src/mcpClient.js';
// For testing managed servers, we need access to agent.js's management functions
// This assumes agent.js exports them and handles its own config loading.
import { startManagedMcpServers, stopManagedMcpServers, getManagedMcpClient } from './src/agent.js';
import { promises as fs } from 'fs';
import path from 'path';
import process from 'node:process';

// Helper to load config directly for test verification if needed
async function getTestConfig() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  const configFile = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configFile);
}

async function runTests() {
  console.log("--- Starting MCP Client and Server Management Tests ---");

  // Ensure user has updated the placeholder path for Exa server
  const currentConfig = await getTestConfig();
  const exaManagedConfig = currentConfig.mcp_servers.exa_search_stdio_managed;
  if (exaManagedConfig && exaManagedConfig.args[0].includes("/path/to/your")) {
    console.error("\n🛑 ERROR: Please update the placeholder path in config.json for 'exa_search_stdio_managed' and 'exa_search_stdio_unmanaged' before running tests.\n");
    return;
  }
  
  // --- Test Suite ---
  const results = {
    test_sse_taskmanager: { status: 'pending', details: '' },
    test_unmanaged_stdio_exa: { status: 'pending', details: '' },
    test_managed_stdio_startup: { status: 'pending', details: '' },
    test_managed_stdio_invocation_exa: { status: 'pending', details: '' },
    test_managed_stdio_reuse_exa: { status: 'pending', details: '' },
    test_error_non_existent_server: { status: 'pending', details: '' },
    test_error_disabled_server: { status: 'pending', details: '' },
    // test_managed_stdio_shutdown is implicitly part of overall cleanup
  };

  // Test 1: SSE (Task Manager - list_requests, assuming it's running)
  console.log("\n--- Test 1: SSE (Task Manager - list_requests) ---");
  try {
    // Assuming taskmanager_sse is configured and the server is running
    const sseResult = await invokeMcpTool('taskmanager_sse', 'list_requests', {});
    results.test_sse_taskmanager.status = 'passed';
    results.test_sse_taskmanager.details = `Received: ${JSON.stringify(sseResult).substring(0,100)}...`;
    console.log("SSE Test Passed. Result:", sseResult);
  } catch (e) {
    results.test_sse_taskmanager.status = 'failed';
    results.test_sse_taskmanager.details = e.message;
    console.error("SSE Test Failed:", e.message);
  }

  // Test 2: Unmanaged Stdio (Exa Search)
  console.log("\n--- Test 2: Unmanaged Stdio (Exa Search - web_search_exa) ---");
  try {
    const unmanagedStdioResult = await invokeMcpTool('exa_search_stdio_unmanaged', 'web_search_exa', { query: "test query" });
    results.test_unmanaged_stdio_exa.status = 'passed';
    results.test_unmanaged_stdio_exa.details = `Received: ${JSON.stringify(unmanagedStdioResult).substring(0,100)}...`;
    console.log("Unmanaged Stdio Test Passed. Result:", unmanagedStdioResult);
  } catch (e) {
    results.test_unmanaged_stdio_exa.status = 'failed';
    results.test_unmanaged_stdio_exa.details = e.message;
    console.error("Unmanaged Stdio Test Failed:", e.message);
  }

  // Test 3: Managed Stdio - Startup
  // This requires agent.js's config loading to have run.
  // For an isolated test, we might need to call a simulated agent.loadConfig() or ensure it's done.
  // startManagedMcpServers in agent.js already calls loadConfig implicitly if config is not pre-loaded.
  // However, agent.js's loadConfig is internal. For this test script, we assume config.json is read by agent.js functions.
  console.log("\n--- Test 3: Managed Stdio - Startup ---");
  try {
    await startManagedMcpServers(); // This will load config and start servers marked manageProcess:true
    const managedClientEntry = getManagedMcpClient('exa_search_stdio_managed');
    if (managedClientEntry) {
      results.test_managed_stdio_startup.status = 'passed';
      results.test_managed_stdio_startup.details = 'Managed Exa server client found after startup.';
      console.log("Managed Stdio Startup Test Passed: Client entry found.");
    } else {
      results.test_managed_stdio_startup.status = 'failed';
      results.test_managed_stdio_startup.details = 'Managed Exa server client NOT found after startup.';
      console.error("Managed Stdio Startup Test Failed: Client entry NOT found.");
    }
  } catch (e) {
    results.test_managed_stdio_startup.status = 'failed';
    results.test_managed_stdio_startup.details = e.message;
    console.error("Managed Stdio Startup Test Failed:", e.message);
  }

  // Test 4: Managed Stdio - Invocation (Exa Search)
  if (results.test_managed_stdio_startup.status === 'passed') {
    console.log("\n--- Test 4: Managed Stdio - Invocation (Exa Search) ---");
    try {
      const managedStdioResult = await invokeMcpTool('exa_search_stdio_managed', 'web_search_exa', { query: "managed test query" });
      results.test_managed_stdio_invocation_exa.status = 'passed';
      results.test_managed_stdio_invocation_exa.details = `Received: ${JSON.stringify(managedStdioResult).substring(0,100)}...`;
      console.log("Managed Stdio Invocation Test Passed. Result:", managedStdioResult);
    } catch (e) {
      results.test_managed_stdio_invocation_exa.status = 'failed';
      results.test_managed_stdio_invocation_exa.details = e.message;
      console.error("Managed Stdio Invocation Test Failed:", e.message);
    }
  } else {
     results.test_managed_stdio_invocation_exa.status = 'skipped';
     results.test_managed_stdio_invocation_exa.details = 'Skipped due to startup failure.';
  }

  // Test 5: Managed Stdio - Reuse (Exa Search)
  if (results.test_managed_stdio_invocation_exa.status === 'passed') {
    console.log("\n--- Test 5: Managed Stdio - Reuse (Exa Search) ---");
    try {
      // Check logs from mcpClient.js to confirm "Using agent-managed client" is logged
      // and no new spawning messages appear for 'exa_search_stdio_managed'.
      console.log("NOTE: For this test, manually check console logs for 'Using agent-managed client' and absence of new spawn messages for exa_search_stdio_managed.");
      const managedStdioResultReuse = await invokeMcpTool('exa_search_stdio_managed', 'web_search_exa', { query: "managed test query reuse" });
      results.test_managed_stdio_reuse_exa.status = 'passed'; // Relies on log inspection
      results.test_managed_stdio_reuse_exa.details = `Received: ${JSON.stringify(managedStdioResultReuse).substring(0,100)}... Check logs for reuse confirmation.`;
      console.log("Managed Stdio Reuse Test Passed (check logs). Result:", managedStdioResultReuse);
    } catch (e) {
      results.test_managed_stdio_reuse_exa.status = 'failed';
      results.test_managed_stdio_reuse_exa.details = e.message;
      console.error("Managed Stdio Reuse Test Failed:", e.message);
    }
  } else {
    results.test_managed_stdio_reuse_exa.status = 'skipped';
    results.test_managed_stdio_reuse_exa.details = 'Skipped due to previous managed invocation failure.';
  }
  
  // Test 6: Error Handling - Non-existent server
  console.log("\n--- Test 6: Error Handling - Non-existent server ---");
  try {
    await invokeMcpTool('non_existent_server_id', 'some_tool', {});
    results.test_error_non_existent_server.status = 'failed';
    results.test_error_non_existent_server.details = 'Error was NOT thrown for non-existent server.';
    console.error("Error Non-existent Server Test Failed: No error thrown.");
  } catch (e) {
    if (e.message.includes("MCP server configuration not found")) {
      results.test_error_non_existent_server.status = 'passed';
      results.test_error_non_existent_server.details = `Correctly failed with: ${e.message}`;
      console.log("Error Non-existent Server Test Passed.");
    } else {
      results.test_error_non_existent_server.status = 'failed';
      results.test_error_non_existent_server.details = `Incorrect error: ${e.message}`;
      console.error("Error Non-existent Server Test Failed: Incorrect error message.");
    }
  }

  // Test 7: Error Handling - Disabled server
  console.log("\n--- Test 7: Error Handling - Disabled server ---");
  try {
    await invokeMcpTool('disabled_test_server', 'any_tool', {});
    results.test_error_disabled_server.status = 'failed';
    results.test_error_disabled_server.details = 'Error was NOT thrown for disabled server.';
    console.error("Error Disabled Server Test Failed: No error thrown.");
  } catch (e) {
    if (e.message.includes("is disabled in config.json")) {
      results.test_error_disabled_server.status = 'passed';
      results.test_error_disabled_server.details = `Correctly failed with: ${e.message}`;
      console.log("Error Disabled Server Test Passed.");
    } else {
      results.test_error_disabled_server.status = 'failed';
      results.test_error_disabled_server.details = `Incorrect error: ${e.message}`;
      console.error("Error Disabled Server Test Failed: Incorrect error message.");
    }
  }

  // Cleanup: Stop managed servers
  console.log("\n--- Test Cleanup: Stopping managed servers ---");
  await stopManagedMcpServers();
  console.log("Managed servers stop signal sent.");

  // --- Summary ---
  console.log("\n\n--- Test Summary ---");
  for (const testName in results) {
    console.log(`${testName}: ${results[testName].status.toUpperCase()} - ${results[testName].details}`);
  }
  console.log("--- Testing Complete ---");
}

runTests().catch(err => {
  console.error("Unhandled error during test execution:", err);
  // Ensure managed servers are stopped even if tests crash
  stopManagedMcpServers().finally(() => process.exit(1));
});

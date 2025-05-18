import 'dotenv/config'; // Load .env file contents into process.env
import { fileURLToPath } from 'url';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import process from "node:process"; // Explicit import for process object

import { fetchTranscript } from './youtube.js';
import { parseGitHubUrl, cloneRepo, getRepoContentForAnalysis, cleanupRepo } from './github.js';
import { analyzeTranscript, analyzeRepoContent, getFollowUpAnswer } from './llm.js';
import { generatePrompts, generateRepoPrompts } from './promptGenerator.js';
import { loadMemory, addMemoryEntry, getRelevantMemory } from './memory.js';
import { invokeMcpTool } from './mcpClient.js';

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// StdioServerParameters is an interface used by StdioClientTransport's constructor,
// but not directly exported. We construct a compatible object.
// Assuming getDefaultEnvironment is part of StdioClientTransport or its utils, or we define it.
// For now, let's define a simple version here if not directly available from SDK.
import { spawn } from "node:child_process"; // Needed if StdioClientTransport doesn't expose child or if we manage stderr pipe

import { addMemoryEntry as addHierarchicalMemoryEntry, getMemoryEntries as getHierarchicalMemoryEntries } from './hierarchicalMemory.js';
import { buildContextWindow } from './contextWindowManager.js';
import { loadDeveloperProfile, updateDeveloperProfile, addCodingPattern } from './developerProfile.js';
import LanceVectorMemory from '../vector-memory/lanceVectorMemory.js';
import { createLogger } from './logger.js';

const agentLogger = createLogger("Agent");
const mcpManagerLogger = createLogger("AgentMCPManager");

const DEFAULT_CONFIG = {
  deepseekApiKey: "",
  openaiApiKey: "",
  githubPat: "",
  llmModelYouTube: "deepseek-chat",
  llmModelRepo: "deepseek-chat",
  llmModelFollowUp: "deepseek-chat",
  maxTokensYouTube: 1024,
  maxTokensRepo: 1024,
  maxTokensFollowUp: 500,
  temperatureYouTube: 0.3,
  temperatureRepo: 0.3,
  temperatureFollowUp: 0.2,
  outputDir: "output",
  tempClonesBaseDir: "temp-clones",
  maxTotalContentSize: 102400,
  maxSourceFilesToScan: 5,
  maxSourceFileSize: 51200,
  mcp_servers: {} // Default for MCP server configurations
};

let config = { ...DEFAULT_CONFIG };
const managedMcpClients = new Map(); // Stores { client: Client, transport: StdioClientTransport }

// Default environment variables to inherit (copied from mcpClient.js design)
const DEFAULT_INHERITED_ENV_VARS = process.platform === "win32"
  ? [ "APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE" ]
  : [ "HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER" ];

function getLocalDefaultEnvironment() { // Renamed to avoid conflict if SDK exports one
  const env = {};
  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined) continue;
    if (value.startsWith("()")) continue; // Skip functions
    env[key] = value;
  }
  return env;
}


async function loadConfig() {
  try {
    const configFileContent = await fs.promises.readFile('config.json', 'utf8');
    const userConfig = JSON.parse(configFileContent);
    config = { ...DEFAULT_CONFIG, ...userConfig }; // Ensure mcp_servers default is there
    agentLogger.info("Loaded configuration from config.json");
  } catch (e) {
    if (e.code === 'ENOENT') {
      agentLogger.info('No config.json found. Using default settings and environment variables.');
    } else {
      agentLogger.warn('Error reading or parsing config.json. Using default settings and environment variables.', { errorMessage: e.message });
    }
  }
  config.deepseekApiKey = process.env.DEEPSEEK_API_KEY || config.deepseekApiKey;
  config.openaiApiKey = process.env.OPENAI_API_KEY || (config.apiKeys && config.apiKeys.openai) || config.openaiApiKey;
  if (config.openaiApiKey) agentLogger.info("OpenAI API Key loaded.", { source: config.apiKeys && config.apiKeys.openai ? 'config.json' : 'env/default' });
  else agentLogger.warn("OpenAI API Key NOT found in config or environment variables.");
  config.githubPat = process.env.GITHUB_PAT || config.githubPat;
}

let configLoaded = false; // Flag to ensure config is loaded once

async function ensureConfigLoaded() {
  if (!configLoaded) {
    await loadConfig(); // loadConfig sets the global config variable
    configLoaded = true; // Mark as loaded
  }
}

async function startManagedMcpServers() {
  await ensureConfigLoaded(); // Ensure config is loaded before proceeding
  mcpManagerLogger.info("Starting managed MCP servers...");
  if (!config.mcp_servers || Object.keys(config.mcp_servers).length === 0) {
    mcpManagerLogger.info("No mcp_servers configuration found or empty in config.json.");
    return;
  }

  for (const serverIdentifier in config.mcp_servers) {
    const serverConfig = config.mcp_servers[serverIdentifier];
    mcpManagerLogger.debug(`Checking server config: ${serverIdentifier}`, { serverIdentifier, config: serverConfig });
    if (serverConfig.transport === "stdio" && serverConfig.manageProcess === true && serverConfig.enabled !== false) {
      mcpManagerLogger.info(`Attempting to start and manage stdio server: ${serverIdentifier} (${serverConfig.displayName || serverIdentifier})`, { serverIdentifier });
      mcpManagerLogger.debug(`Config for ${serverIdentifier}:`, { serverIdentifier, configDetails: serverConfig });
      if (!serverConfig.command) {
        mcpManagerLogger.error(`Stdio server ${serverIdentifier} has manageProcess=true but no command provided.`, null, { serverIdentifier });
        continue;
      }

      const stdioParams = {
        command: serverConfig.command,
        args: serverConfig.args || [],
        cwd: serverConfig.cwd || process.cwd(),
        env: { ...getLocalDefaultEnvironment(), ...(serverConfig.env || {}) },
        stderr: serverConfig.stderrBehavior || "pipe", // Default to pipe for managed
      };

      try {
        const transport = new StdioClientTransport(stdioParams);
        const client = new Client({
          name: `ai-agent-managed-${serverIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}`, // Sanitize name
          version: "1.0.0"
        });

        // The StdioClientTransport's underlying child process's stderr needs to be handled.
        // The SDK's StdioClientTransport has a `get stderr()` method that returns a stream.
        if (transport.stderr && stdioParams.stderr === "pipe") {
            transport.stderr.on('data', (data) => {
                // Using console.error directly for stderr stream to keep it distinct
                console.error(`[MCP_STDERR:${serverIdentifier}] ${data.toString().trim()}`);
            });
        }
        
        // Handle transport errors for this specific managed client
        transport.onerror = (error) => {
            mcpManagerLogger.error(`Transport error for ${serverIdentifier}`, error, { serverIdentifier });
            // Potentially attempt restart or mark as unhealthy
            managedMcpClients.delete(serverIdentifier); // Remove on error
        };
        transport.onclose = () => {
            mcpManagerLogger.info(`Transport closed for ${serverIdentifier}.`, { serverIdentifier });
            managedMcpClients.delete(serverIdentifier); // Remove on close
        };

        await client.connect(transport); // This calls transport.start() which spawns the process
        
        managedMcpClients.set(serverIdentifier, { client, transport, config: serverConfig });
        mcpManagerLogger.info(`Successfully started and connected to managed stdio server: ${serverIdentifier}`, { serverIdentifier, clientState: client.state });
      } catch (error) {
        mcpManagerLogger.error(`Failed to start or connect to managed stdio server ${serverIdentifier}`, error, { serverIdentifier });
      }
    }
  }
}

export function getManagedMcpClient(serverIdentifier) {
  const entry = managedMcpClients.get(serverIdentifier);
  if (entry && entry.client.state === "connected") {
    return entry.client;
  }
  return null;
}

async function stopManagedMcpServers() {
  mcpManagerLogger.info("Stopping managed MCP servers...");
  if (managedMcpClients.size === 0) {
    mcpManagerLogger.info("No managed MCP servers were active.");
    return;
  }
  for (const [identifier, entry] of managedMcpClients) {
    try {
      mcpManagerLogger.info(`Disconnecting from managed server: ${identifier}`, { serverIdentifier: identifier });
      await entry.client.disconnect(); 
      mcpManagerLogger.info(`Disconnected from ${identifier}.`, { serverIdentifier: identifier });
    } catch (error) {
      mcpManagerLogger.error(`Error disconnecting from managed server ${identifier}`, error, { serverIdentifier: identifier });
    }
  }
  managedMcpClients.clear();
  mcpManagerLogger.info("All managed MCP servers signaled to stop and map cleared.");
}


async function setupMemoryApi(app) {
  // ... (existing setupMemoryApi code remains unchanged) ...
  const expressModule = await import('express');
  const express = expressModule.default;
  const bodyParser = await import('body-parser');
  app.use(bodyParser.default.json());
  const memoryEntries = [];
  const developerProfiles = [];
  const generateId = () => Math.random().toString(36).substr(2, 9);
  app.get('/api/memory', (req, res) => {
    let results = memoryEntries;
    if (req.query.layer && req.query.layer !== 'all') {
      results = results.filter(e => e.layer === req.query.layer);
    }
    if (req.query.search) {
      const searchLower = req.query.search.toLowerCase();
      results = results.filter(e => (e.title && e.title.toLowerCase().includes(searchLower)) || (e.content && e.content.toLowerCase().includes(searchLower)));
    }
    res.json(results);
  });
  app.get('/api/memory/:id', (req, res) => {
    const entry = memoryEntries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Memory entry not found' });
    res.json(entry);
  });
  app.put('/api/memory/:id', (req, res) => {
    const index = memoryEntries.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Memory entry not found' });
    memoryEntries[index] = { ...memoryEntries[index], ...req.body };
    res.json(memoryEntries[index]);
  });
  app.delete('/api/memory/:id', (req, res) => {
    const index = memoryEntries.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Memory entry not found' });
    memoryEntries.splice(index, 1);
    res.json({ success: true });
  });
  app.get('/api/profiles', (req, res) => { res.json(developerProfiles); });
  app.get('/api/profiles/:id', (req, res) => {
    const profile = developerProfiles.find(p => p.id === req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  });
  app.put('/api/profiles/:id', (req, res) => {
    const index = developerProfiles.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Profile not found' });
    developerProfiles[index] = { ...developerProfiles[index], ...req.body };
    res.json(developerProfiles[index]);
  });
  app.post('/api/memory', (req, res) => {
    const newEntry = { id: generateId(), ...req.body };
    memoryEntries.push(newEntry);
    res.status(201).json(newEntry);
  });
  app.post('/api/profiles', (req, res) => {
    const newProfile = { id: generateId(), ...req.body };
    developerProfiles.push(newProfile);
    res.status(201).json(newProfile);
  });
}

export { 
    setupMemoryApi, // Keep this export if Memory UI still uses it
    startManagedMcpServers,
    stopManagedMcpServers
};
// getManagedMcpClient is already exported by its own line: export function getManagedMcpClient...

async function processInternalMemoryQuery(queryType, queryString, developerId) {
  // ... (existing processInternalMemoryQuery code remains unchanged) ...
  agentLogger.info(`Processing internal memory query. Type: ${queryType}, Query: "${queryString}", DeveloperID: ${developerId}`, { queryType, queryString, developerId });
  try {
    if (queryType === 'semantic_search') {
      if (!config.openaiApiKey) {
        agentLogger.warn("OpenAI API Key is not configured. Cannot perform semantic search.", { queryType, queryString });
        return { status: "error", message: "OpenAI API Key is not configured. Cannot perform semantic search." };
      }
      const lanceMemory = new LanceVectorMemory({ openaiApiKey: config.openaiApiKey });
      await lanceMemory.init();
      const results = await lanceMemory.search(queryString, 3); 
      return { status: "success", queryType, queryString, data: results };
    } else if (queryType === 'hierarchical_lookup') {
      const layersToSearch = ['session', 'project', 'global'];
      let allEntries = [];
      for (const layer of layersToSearch) {
        const entries = await getHierarchicalMemoryEntries(layer);
        allEntries.push(...entries.map(e => ({ ...e, layer })));
      }
      const lowerQueryString = queryString.toLowerCase();
      const filteredEntries = allEntries.filter(entry => 
        (entry.title && entry.title.toLowerCase().includes(lowerQueryString)) ||
        (entry.summary && entry.summary.toLowerCase().includes(lowerQueryString)) ||
        (entry.content && typeof entry.content === 'string' && entry.content.toLowerCase().includes(lowerQueryString)) ||
        (entry.key && entry.key.toLowerCase().includes(lowerQueryString))
      );
      return { status: "success", queryType, queryString, data: filteredEntries.slice(0, 5) };
    } else {
      agentLogger.warn(`Unsupported memory query type: ${queryType}`, { queryType });
      return { status: "error", message: `Unsupported memory query type: ${queryType}` };
    }
  } catch (error) {
    agentLogger.error(`Error in processInternalMemoryQuery`, error, { queryType, queryString });
    return { status: "error", queryType, queryString, message: error.message, data: [] };
  }
}

async function handleLlmResponseAndMemoryQueries(initialAnalysis, originalContent, llmConfigForRefinement, developerId, analysisFunctionName) {
  // ... (existing handleLlmResponseAndMemoryQueries code remains largely unchanged, 
  //      it already calls invokeMcpTool which will be updated next) ...
  let currentAnalysis = initialAnalysis;
  let iteration = 0;
  const MAX_TOOL_ITERATIONS = 5; 

  while (currentAnalysis && currentAnalysis.tool_calls && Array.isArray(currentAnalysis.tool_calls) && currentAnalysis.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    agentLogger.info(`LLM response included tool_calls. Iteration: ${iteration}`, { iteration });
    const toolResultsForLlm = [];
    for (const toolCall of currentAnalysis.tool_calls) {
      if (!toolCall.function || !toolCall.function.name || !toolCall.function.arguments) {
        agentLogger.warn(`Invalid tool_call structure: ${JSON.stringify(toolCall)}. Skipping.`, { toolCall });
        toolResultsForLlm.push({ tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name || "unknown_tool", content: JSON.stringify({ status: "error", message: "Invalid tool_call structure from LLM." }) });
        continue;
      }
      const toolName = toolCall.function.name;
      let toolArgs;
      try {
        toolArgs = typeof toolCall.function.arguments === 'string' ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
      } catch (e) {
        agentLogger.error(`Error parsing arguments for tool ${toolName}`, e, { toolName });
        toolResultsForLlm.push({ tool_call_id: toolCall.id, role: "tool", name: toolName, content: JSON.stringify({ status: "error", message: `Error parsing arguments for tool ${toolName}: ${e.message}` }) });
        continue;
      }
      let result;
      agentLogger.info(`Processing tool call: ${toolName}`, { toolName, toolArgs });
      if (toolName === 'query_memory') {
        if (!toolArgs || typeof toolArgs.query_type !== 'string' || typeof toolArgs.query_string !== 'string') {
          agentLogger.warn("Invalid arguments for query_memory: query_type and query_string are required.", { toolArgs });
          result = { status: "error", message: "Invalid arguments for query_memory: query_type and query_string are required." };
        } else {
          result = await processInternalMemoryQuery(toolArgs.query_type, toolArgs.query_string, developerId);
        }
      } else { // Assumed to be an MCP tool call like web_search_exa
        const serverIdentifier = toolArgs.server_name; // LLM must provide this
        if (!serverIdentifier) {
          agentLogger.warn(`LLM tool_call for '${toolName}' missing 'server_name'.`, { toolName, toolArgs });
          result = { status: "error", message: `LLM tool_call for '${toolName}' missing 'server_name'.` };
        } else {
          try {
            // Pass the getManagedMcpClient function from agent.js to invokeMcpTool
            result = await invokeMcpTool(getManagedMcpClient, serverIdentifier, toolName, toolArgs /* pass all args from LLM */);
          } catch (e) {
            agentLogger.error(`Error invoking MCP tool ${toolName} for server ${serverIdentifier}`, e, { toolName, serverIdentifier });
            result = { status: "error", message: `Error invoking MCP tool ${toolName}: ${e.message}` };
          }
        }
      }
      agentLogger.info(`Result for ${toolName}: ${JSON.stringify(result).substring(0, 200)}...`, { toolName });
      toolResultsForLlm.push({ tool_call_id: toolCall.id, role: "tool", name: toolName, content: JSON.stringify(result) });
    }
    const messagesForRefinement = [
      { role: "user", content: `Original Content/Context:\n${originalContent}` },
      { role: "assistant", content: JSON.stringify(currentAnalysis) },
      ...toolResultsForLlm.map(tr => ({ role: tr.role, tool_call_id: tr.tool_call_id, name: tr.name, content: tr.content })),
      { role: "user", content: `Instructions: You previously decided to call one or more tools. Above are the results. Refine your JSON blueprint. If more tools needed, use 'tool_calls'. Else, final analysis without 'tool_calls'.`}
    ];
    agentLogger.info("Sending tool results to LLM for refinement...");
    if (analysisFunctionName === 'analyzeRepoContent') {
      currentAnalysis = await analyzeRepoContent(messagesForRefinement, llmConfigForRefinement, true);
    } else if (analysisFunctionName === 'analyzeTranscript') {
      currentAnalysis = await analyzeTranscript(messagesForRefinement, llmConfigForRefinement, true);
    } else {
      agentLogger.error(`Unknown analysis function name: ${analysisFunctionName}. Cannot refine.`, { analysisFunctionName });
      break;
    }
    if (currentAnalysis && currentAnalysis.tool_calls && Array.isArray(currentAnalysis.tool_calls) && currentAnalysis.tool_calls.length > 0) {
      agentLogger.info("LLM wants to call tools again...");
    } else {
      agentLogger.info("LLM provided refined analysis or no further tool calls needed.");
      break;
    }
  }
  if (iteration >= MAX_TOOL_ITERATIONS) agentLogger.warn("Reached maximum tool_call iterations.", { maxIterations: MAX_TOOL_ITERATIONS });
  return currentAnalysis;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
}

async function main() {
  await loadConfig();
  await startManagedMcpServers(); // Start managed servers

  const expressModule = await import('express');
  const express = expressModule.default;
  const app = express();
  const port = 4000; // TODO: Make port configurable
  await setupMemoryApi(app); // This uses console.log internally for now
  app.listen(port, () => {
    agentLogger.info(`Memory Visualization API server running at http://localhost:${port}`, { port });
  });

  const rlDev = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askDev = (q) => new Promise(res => rlDev.question(q, res));
  const developerId = (await askDev('Enter your developer ID (or username): ')).trim() || 'default';
  rlDev.close();

  let developerProfile = await loadDeveloperProfile(developerId);
  if (developerProfile) {
    agentLogger.info(`Loaded developer profile for "${developerId}".`, { developerId });
  } else {
    agentLogger.info(`No profile found for "${developerId}". New profile will be created.`, { developerId });
    developerProfile = {};
  }

  // ... (rest of main loop as before, no changes needed here for managed MCPs,
  //      as invokeMcpTool (called by handleLlmResponseAndMemoryQueries) will handle it)
  const allMemory = await loadMemory();
  agentLogger.info(`Loaded ${allMemory.length} memory entries from simple memory.`, { count: allMemory.length });
  const sessionMemory = await getHierarchicalMemoryEntries('session');
  const projectMemory = await getHierarchicalMemoryEntries('project');
  const globalMemory = await getHierarchicalMemoryEntries('global');
  agentLogger.info(`Hierarchical memory counts: Session: ${sessionMemory.length}, Project: ${projectMemory.length}, Global: ${globalMemory.length}`);
  
  const tempClonesBaseDir = path.resolve(config.tempClonesBaseDir);
  const outputDir = path.resolve(config.outputDir);
  try {
    await fs.promises.mkdir(tempClonesBaseDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });
  } catch (err) {
    agentLogger.error(`Failed to create base directories`, err); return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  agentLogger.info('Welcome to the AI Agent! CLI is ready.'); // Changed from console.log
  function ask(question) { return new Promise(resolve => rl.question(question, resolve)); }

  // Graceful shutdown
  const shutdown = async (signal) => {
    agentLogger.info(`Received ${signal}. Shutting down managed MCP servers...`, { signal });
    await stopManagedMcpServers();
    agentLogger.info("Agent shutdown complete.");
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('exit', async (code) => { // Fallback for non-signal exits
      agentLogger.info(`Agent exiting with code ${code}. Ensuring managed servers are stopped.`, { exitCode: code });
      await stopManagedMcpServers(); // Ensure cleanup
  });


  while (true) {
    const url = await ask('Enter a YouTube video URL, GitHub repository URL, or local path (or type "exit" to quit): ');
    if (url.trim().toLowerCase() === 'exit' || url.trim().toLowerCase() === 'quit') {
      // rl.close() will be handled by shutdown signal or natural exit
      await shutdown('user_exit'); // Call shutdown explicitly
      break; 
    }

    const getApiKeyForModel = (modelName) => {
      if (modelName.toLowerCase().startsWith('gpt-')) return config.openaiApiKey;
      return config.deepseekApiKey; 
    };
    const llmRepoConfig = { apiKey: getApiKeyForModel(config.llmModelRepo), model: config.llmModelRepo, maxTokens: config.maxTokensRepo, temperature: config.temperatureRepo };
    const llmYouTubeConfig = { apiKey: getApiKeyForModel(config.llmModelYouTube), model: config.llmModelYouTube, maxTokens: config.maxTokensYouTube, temperature: config.temperatureYouTube };
    const llmFollowUpConfig = { apiKey: getApiKeyForModel(config.llmModelFollowUp), model: config.llmModelFollowUp, maxTokens: config.maxTokensFollowUp, temperature: config.temperatureFollowUp };
    const fileReadConfig = { maxTotalContentSize: config.maxTotalContentSize, maxSourceFilesToScan: config.maxSourceFilesToScan, maxSourceFileSize: config.maxSourceFileSize };

    try {
      let isLocalPath = false;
      try {
        const stats = await fs.promises.stat(url);
        if (stats.isDirectory()) isLocalPath = true;
      } catch (e) { /* not a path */ }

      if (isLocalPath) {
        agentLogger.info(`Local directory detected: ${url}`, { url });
        // ... (local path processing logic - no changes needed here for MCP management)
        try {
          let projectTypeHint = 'unknown';
          if (await fs.promises.stat(path.join(url, 'package.json')).catch(() => false)) projectTypeHint = 'nodejs';
          else if (await fs.promises.stat(path.join(url, 'requirements.txt')).catch(() => false) || await fs.promises.stat(path.join(url, 'pyproject.toml')).catch(() => false)) projectTypeHint = 'python';
          else if (await fs.promises.stat(path.join(url, 'pom.xml')).catch(() => false)) projectTypeHint = 'java_maven';
          if (projectTypeHint !== 'unknown') agentLogger.info(`Detected project type: ${projectTypeHint}`, { projectTypeHint });
          let priorityPaths = [];
          try {
            const includeContent = await fs.promises.readFile(path.join(url, '.agentinclude'), 'utf8');
            priorityPaths = includeContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
          } catch (e) { /* no .agentinclude */ }
          let localProjectContent = await getRepoContentForAnalysis(url, priorityPaths, projectTypeHint, fileReadConfig); 
          if (!localProjectContent) { agentLogger.warn('Could not extract relevant content for local path.', { path: url }); } else {
            agentLogger.info('Local project content extracted. Analyzing...', { path: url });
            const localMemory = await getRelevantMemory(url);
            let profileContext = developerProfile && developerProfile.preferences ? 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n' : '';
            const contextWindow = buildContextWindow(localMemory, profileContext + localProjectContent, llmRepoConfig.maxTokens);
            let analysis = await analyzeRepoContent(contextWindow, llmRepoConfig, false);
            analysis = await handleLlmResponseAndMemoryQueries(analysis, localProjectContent, llmRepoConfig, developerId, 'analyzeRepoContent');
            await addMemoryEntry('local', url, analysis.originalProjectSummary.purpose);
            await addHierarchicalMemoryEntry('project', { type: 'local', key: url, summary: analysis.originalProjectSummary.purpose });
            if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
              for (const pattern of analysis.originalProjectSummary.coreMechanics) await addCodingPattern(developerId, pattern);
            }
            const { markdownBlueprint, consolePrompts } = generateRepoPrompts(analysis, url, "Local Project"); 
            // Use agentLogger for consolePrompts, but keep blueprint saving as is for now
            agentLogger.info('\nConsole Prompts (Local Project):\n' + consolePrompts.join('\n'));
            const projectName = sanitizeFilename(path.basename(url) || 'local_project');
            const outputPath = path.join(outputDir, `local_${projectName}_blueprint.md`);
            fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
            agentLogger.info(`Blueprint saved to ${outputPath}`, { outputPath });
            while (true) {
              const followup = await ask('Follow-up, refine, or "back": ');
              if (followup.trim().toLowerCase() === 'back') break;
              if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { await shutdown('user_exit_followup'); return; }
              try {
                const followupAnswerString = await getFollowUpAnswer(localProjectContent, analysis, followup, llmFollowUpConfig);
                agentLogger.info('\nFollow-up Answer:\n' + followupAnswerString);
              } catch (err) { agentLogger.error('Error in follow-up', err); }
            }
          }
        } catch (error) { agentLogger.error(`Error processing local project`, error, { path: url }); }

      } else if (url.includes('github.com')) {
        agentLogger.info(`GitHub URL detected: ${url}`, { url });
        // ... (github processing logic - no changes needed here for MCP management)
        const repoInfo = parseGitHubUrl(url);
        if (!repoInfo) { agentLogger.warn('Invalid GitHub URL.', { url }); continue; }
        const { owner, repo } = repoInfo;
        let clonedRepoPath = '';
        try {
          clonedRepoPath = await cloneRepo(owner, repo, config.tempClonesBaseDir, config.githubPat);
          if (!clonedRepoPath) { agentLogger.warn('Cloning failed.', { owner, repo }); continue; }
          let projectTypeHintGh = 'unknown'; // Add hints as for local
          let priorityPathsGh = [];
          try {
            const includeContentGh = await fs.promises.readFile(path.join(clonedRepoPath, '.agentinclude'), 'utf8');
            priorityPathsGh = includeContentGh.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
          } catch (e) { /* no .agentinclude */ }
          const repoMainContent = await getRepoContentForAnalysis(clonedRepoPath, priorityPathsGh, projectTypeHintGh, fileReadConfig);
          if (!repoMainContent) { agentLogger.warn('Could not extract content from repo.', { owner, repo }); } else {
            agentLogger.info('Repo content extracted. Analyzing...', { owner, repo });
            const repoMemory = await getRelevantMemory(url);
            let profileContextGh = developerProfile && developerProfile.preferences ? 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n' : '';
            const contextWindow = buildContextWindow(repoMemory, profileContextGh + repoMainContent, llmRepoConfig.maxTokens);
            let analysis = await analyzeRepoContent(contextWindow, llmRepoConfig, false);
            analysis = await handleLlmResponseAndMemoryQueries(analysis, repoMainContent, llmRepoConfig, developerId, 'analyzeRepoContent');
            await addMemoryEntry('repo', url, analysis.originalProjectSummary.purpose);
            await addHierarchicalMemoryEntry('project', { type: 'repo', key: url, summary: analysis.originalProjectSummary.purpose });
            if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
              for (const pattern of analysis.originalProjectSummary.coreMechanics) await addCodingPattern(developerId, pattern);
            }
            const { markdownBlueprint, consolePrompts } = generateRepoPrompts(analysis, url, "GitHub Repository");
            agentLogger.info('\nConsole Prompts (GitHub Repo):\n' + consolePrompts.join('\n'));
            const safeRepoName = sanitizeFilename(`${owner}_${repo}`);
            const outputPath = path.join(outputDir, `github_${safeRepoName}_blueprint.md`);
            fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
            agentLogger.info(`Blueprint saved to ${outputPath}`, { outputPath });
            while (true) {
              const followup = await ask('Follow-up, refine, or "back": ');
              if (followup.trim().toLowerCase() === 'back') break;
              if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { if (clonedRepoPath) await cleanupRepo(clonedRepoPath); await shutdown('user_exit_followup'); return; }
              try {
                const followupAnswerString = await getFollowUpAnswer(repoMainContent, analysis, followup, llmFollowUpConfig);
                agentLogger.info('\nFollow-up Answer:\n' + followupAnswerString);
              } catch (err) { agentLogger.error('Error in follow-up', err); }
            }
          }
        } catch (error) { agentLogger.error(`Error processing GitHub repo`, error, { owner, repo });} 
        finally { if (clonedRepoPath) await cleanupRepo(clonedRepoPath); }

      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        agentLogger.info('Fetching YouTube transcript...', { url });
        // ... (youtube processing logic - no changes needed here for MCP management)
        const ytMemory = await getRelevantMemory(url);
        const transcript = await fetchTranscript(url);
        if (!transcript) { agentLogger.warn('Could not fetch transcript.', { url }); continue; }
        agentLogger.info('Transcript fetched. Analyzing...', { url });
        let profileContextYt = developerProfile && developerProfile.preferences ? 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n' : '';
        const contextWindow = buildContextWindow(ytMemory, profileContextYt + transcript, llmYouTubeConfig.maxTokens);
        let analysis = await analyzeTranscript(contextWindow, llmYouTubeConfig, false);
        analysis = await handleLlmResponseAndMemoryQueries(analysis, transcript, llmYouTubeConfig, developerId, 'analyzeTranscript');
        await addMemoryEntry('youtube', url, analysis.originalProjectSummary.purpose);
        await addHierarchicalMemoryEntry('project', { type: 'youtube', key: url, summary: analysis.originalProjectSummary.purpose });
        if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
          for (const pattern of analysis.originalProjectSummary.coreMechanics) await addCodingPattern(developerId, pattern);
        }
        const { markdownBlueprint, consolePrompts } = generatePrompts(analysis, url);
        agentLogger.info('\nConsole Prompts (YouTube):\n' + consolePrompts.join('\n'));
        let videoId = 'video'; try { const vu = new URL(url); if (vu.hostname === 'youtu.be') videoId = vu.pathname.substring(1); else if (vu.searchParams.has('v')) videoId = vu.searchParams.get('v'); videoId = sanitizeFilename(videoId); } catch(e){}
        const outputPath = path.join(outputDir, `youtube_${videoId}_${new Date().toISOString().replace(/[:.]/g, '-')}_blueprint.md`);
        fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
        agentLogger.info(`Blueprint saved to ${outputPath}`, { outputPath });
        while (true) {
          const followup = await ask('Follow-up, refine, or "back": ');
          if (followup.trim().toLowerCase() === 'back') break;
          if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { await shutdown('user_exit_followup'); return; }
          try {
            const followupAnswerString = await getFollowUpAnswer(transcript, analysis, followup, llmFollowUpConfig);
            agentLogger.info('\nFollow-up Answer:\n' + followupAnswerString);
          } catch (err) { agentLogger.error('Error in follow-up', err); }
        }
        
      } else {
        agentLogger.warn('Invalid URL. Please enter a YouTube video URL, GitHub repository URL, or local path.', { url });
      }
    } catch (err) {
      agentLogger.error('Error in main loop', err);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    agentLogger.error("Unhandled error in main", err);
    stopManagedMcpServers().finally(() => process.exit(1));
  });
}

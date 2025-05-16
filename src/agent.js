import 'dotenv/config'; // Load .env file contents into process.env
import { fileURLToPath } from 'url';
import readline from 'readline';
import fs from 'fs';
import path from 'path'; // Import the path module

import { fetchTranscript } from './youtube.js';
import { parseGitHubUrl, cloneRepo, getRepoContentForAnalysis, cleanupRepo } from './github.js'; 
import { analyzeTranscript, analyzeRepoContent, getFollowUpAnswer } from './llm.js'; // Added getFollowUpAnswer
import { generatePrompts, generateRepoPrompts } from './promptGenerator.js';
import { loadMemory, addMemoryEntry, getRelevantMemory } from './memory.js';

import { addMemoryEntry as addHierarchicalMemoryEntry, getMemoryEntries as getHierarchicalMemoryEntries } from './hierarchicalMemory.js';
import { buildContextWindow } from './contextWindowManager.js';
import { loadDeveloperProfile, updateDeveloperProfile, addCodingPattern } from './developerProfile.js';
import LanceVectorMemory from '../vector-memory/lanceVectorMemory.js'; // Added for processInternalMemoryQuery

const DEFAULT_CONFIG = {
  deepseekApiKey: "",
  openaiApiKey: "", // Added for OpenAI
  githubPat: "", 
  llmModelYouTube: "deepseek-chat", // User can change to "gpt-3.5-turbo" etc. in config.json
  llmModelRepo: "deepseek-chat",    // User can change to "gpt-3.5-turbo" etc. in config.json
  llmModelFollowUp: "deepseek-chat",// User can change to "gpt-3.5-turbo" etc. in config.json
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
  maxSourceFileSize: 51200 
};

let config = { ...DEFAULT_CONFIG };

async function loadConfig() {
  try {
    const configFileContent = await fs.promises.readFile('config.json', 'utf8');
    const userConfig = JSON.parse(configFileContent);
    config = { ...config, ...userConfig };
    console.log("Loaded configuration from config.json");
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('No config.json found. Using default settings and environment variables.');
    } else {
      console.warn('Error reading or parsing config.json. Using default settings and environment variables.', e.message);
    }
  }
  // Environment variables override config file for sensitive keys
  config.deepseekApiKey = process.env.DEEPSEEK_API_KEY || config.deepseekApiKey;
  // Load OpenAI API key: from .env first, then from config.json's apiKeys.openai, then from top-level config.openaiApiKey
  config.openaiApiKey = process.env.OPENAI_API_KEY || (config.apiKeys && config.apiKeys.openai) || config.openaiApiKey;
  if (config.openaiApiKey) {
    console.log("[Config] OpenAI API Key loaded.");
  } else {
    console.log("[Config] OpenAI API Key NOT found in .env or config.json (checked OPENAI_API_KEY, config.apiKeys.openai, config.openaiApiKey).");
  }
  config.githubPat = process.env.GITHUB_PAT || config.githubPat; 
}

async function setupMemoryApi(app) {
  const expressModule = await import('express');
  const express = expressModule.default;
  const bodyParser = await import('body-parser');
  app.use(bodyParser.default.json());

  // In-memory cache for memory entries and profiles for demo purposes
  // In production, integrate with actual memory and profile modules
  const memoryEntries = [];
  const developerProfiles = [];

  // Helper to simulate ID generation
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // GET /api/memory?search=&layer=
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

  // GET /api/memory/:id
  app.get('/api/memory/:id', (req, res) => {
    const entry = memoryEntries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Memory entry not found' });
    res.json(entry);
  });

  // PUT /api/memory/:id
  app.put('/api/memory/:id', (req, res) => {
    const index = memoryEntries.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Memory entry not found' });
    memoryEntries[index] = { ...memoryEntries[index], ...req.body };
    res.json(memoryEntries[index]);
  });

  // DELETE /api/memory/:id
  app.delete('/api/memory/:id', (req, res) => {
    const index = memoryEntries.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Memory entry not found' });
    memoryEntries.splice(index, 1);
    res.json({ success: true });
  });

  // GET /api/profiles
  app.get('/api/profiles', (req, res) => {
    res.json(developerProfiles);
  });

  // GET /api/profiles/:id
  app.get('/api/profiles/:id', (req, res) => {
    const profile = developerProfiles.find(p => p.id === req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  });

  // PUT /api/profiles/:id
  app.put('/api/profiles/:id', (req, res) => {
    const index = developerProfiles.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Profile not found' });
    developerProfiles[index] = { ...developerProfiles[index], ...req.body };
    res.json(developerProfiles[index]);
  });

  // POST /api/memory to add new memory entry (optional)
  app.post('/api/memory', (req, res) => {
    const newEntry = { id: generateId(), ...req.body };
    memoryEntries.push(newEntry);
    res.status(201).json(newEntry);
  });

  // POST /api/profiles to add new profile (optional)
  app.post('/api/profiles', (req, res) => {
    const newProfile = { id: generateId(), ...req.body };
    developerProfiles.push(newProfile);
    res.status(201).json(newProfile);
  });
}

export { setupMemoryApi };

async function processInternalMemoryQuery(queryType, queryString, developerId) {
  console.log(`[Agent] Processing internal memory query. Type: ${queryType}, Query: "${queryString}", DeveloperID: ${developerId}`);
  try {
    if (queryType === 'semantic_search') {
      if (!config.openaiApiKey) {
        return { status: "error", message: "OpenAI API Key is not configured. Cannot perform semantic search." };
      }
      const lanceMemory = new LanceVectorMemory({ openaiApiKey: config.openaiApiKey });
      await lanceMemory.init();
      // TODO: Consider if developerId or other context should be used as a filter for semantic search
      // For now, searching globally. topK can be configurable.
      const results = await lanceMemory.search(queryString, 3); 
      return { status: "success", queryType, queryString, data: results };
    } else if (queryType === 'hierarchical_lookup') {
      const layersToSearch = ['session', 'project', 'global']; // Or make this configurable
      let allEntries = [];
      for (const layer of layersToSearch) {
        const entries = await getHierarchicalMemoryEntries(layer); // Already imported
        allEntries.push(...entries.map(e => ({ ...e, layer })));
      }
      
      const lowerQueryString = queryString.toLowerCase();
      const filteredEntries = allEntries.filter(entry => {
        // Simple substring search in title, summary, or content if they exist
        return (entry.title && entry.title.toLowerCase().includes(lowerQueryString)) ||
               (entry.summary && entry.summary.toLowerCase().includes(lowerQueryString)) ||
               (entry.content && typeof entry.content === 'string' && entry.content.toLowerCase().includes(lowerQueryString)) ||
               (entry.key && entry.key.toLowerCase().includes(lowerQueryString)); // Search in key as well
      });
      // TODO: Potentially filter by developerId if hierarchical entries store such info
      return { status: "success", queryType, queryString, data: filteredEntries.slice(0, 5) }; // Return top 5 matches
    } else {
      return { status: "error", message: `Unsupported memory query type: ${queryType}` };
    }
  } catch (error) {
    console.error(`[Agent] Error in processInternalMemoryQuery: ${error.message}`, error);
    return { status: "error", queryType, queryString, message: error.message, data: [] };
  }
}

async function handleLlmResponseAndMemoryQueries(initialAnalysis, originalContent, llmConfigForRefinement, developerId, analysisFunctionName) {
  let currentAnalysis = initialAnalysis;
  let iteration = 0;
  const MAX_MEMORY_QUERIES = 3; // To prevent infinite loops

  // Check if currentAnalysis and currentAnalysis.tool_calls are defined
  while (currentAnalysis && currentAnalysis.tool_calls && Array.isArray(currentAnalysis.tool_calls) && currentAnalysis.tool_calls.some(tc => tc.function && tc.function.name === 'query_memory') && iteration < MAX_MEMORY_QUERIES) {
    const memoryQueryCall = currentAnalysis.tool_calls.find(tc => tc.function && tc.function.name === 'query_memory');
    
    // If no valid memoryQueryCall is found (e.g. function or name is missing), break the loop
    if (!memoryQueryCall || !memoryQueryCall.function || !memoryQueryCall.function.arguments) {
        console.log("[Agent] Invalid or no memory_query tool_call found in LLM response. Proceeding with current analysis.");
        break;
    }

    console.log(`[Agent] LLM requested memory query: ${JSON.stringify(memoryQueryCall.function.arguments)}`);
    iteration++;

    let memoryQueryResult;
    let queryArgs;
    try {
      // It's safer to parse arguments, as LLM might not always produce perfect JSON string for arguments
      if (typeof memoryQueryCall.function.arguments === 'string') {
        queryArgs = JSON.parse(memoryQueryCall.function.arguments);
      } else {
        queryArgs = memoryQueryCall.function.arguments; // Assume it's already an object
      }
      
      if (!queryArgs || typeof queryArgs.query_type !== 'string' || typeof queryArgs.query_string !== 'string') {
        throw new Error("Invalid arguments for query_memory: query_type and query_string are required.");
      }
      memoryQueryResult = await processInternalMemoryQuery(queryArgs.query_type, queryArgs.query_string, developerId);
    } catch (e) {
      console.error(`[Agent] Error processing memory query: ${e.message}`);
      memoryQueryResult = { status: "error", message: `Error processing memory query: ${e.message}` };
    }

    console.log(`[Agent] Memory query result: ${JSON.stringify(memoryQueryResult).substring(0, 200)}...`);
    
    const combinedContentForRefinement = `
      Original Content/Context:
      ${originalContent}

      Previous LLM Analysis (that triggered memory query):
      ${JSON.stringify(currentAnalysis, null, 2)}
      
      Memory Query Result (for query: ${JSON.stringify(queryArgs)}):
      ${JSON.stringify(memoryQueryResult, null, 2)}

      Instructions: You previously decided to call the 'query_memory' tool. Above is the result of that query.
      Please use this information to refine your analysis and provide an updated JSON blueprint.
      If you need to query memory again, use the 'query_memory' tool in the 'tool_calls' section of your response.
      Otherwise, provide your final, refined analysis without any 'tool_calls'.
      Ensure your response is in the same JSON blueprint format as your initial analysis.
    `;
    
    console.log("[Agent] Sending memory query result to LLM for refinement...");
    // Determine which analysis function to call for refinement (analyzeRepoContent or analyzeTranscript)
    if (analysisFunctionName === 'analyzeRepoContent') {
        currentAnalysis = await analyzeRepoContent(combinedContentForRefinement, llmConfigForRefinement);
    } else if (analysisFunctionName === 'analyzeTranscript') {
        currentAnalysis = await analyzeTranscript(combinedContentForRefinement, llmConfigForRefinement);
    } else {
        console.error(`[Agent] Unknown analysis function name: ${analysisFunctionName}. Cannot refine.`);
        break; // Break if we don't know how to refine
    }

    if (currentAnalysis && currentAnalysis.tool_calls && Array.isArray(currentAnalysis.tool_calls) && currentAnalysis.tool_calls.some(tc => tc.function && tc.function.name === 'query_memory')) {
      console.log("[Agent] LLM wants to query memory again...");
    } else {
      console.log("[Agent] LLM provided refined analysis or no further memory queries needed.");
      break; 
    }
  }
  if (iteration >= MAX_MEMORY_QUERIES) {
    console.warn("[Agent] Reached maximum memory query iterations.");
  }
  return currentAnalysis;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
}

async function main() {
  await loadConfig(); // Load configuration at the start

  // Setup Express server for Memory Visualization UI API
  const expressModule = await import('express');
  const express = expressModule.default;
  const app = express();
  const port = 4000;

  await setupMemoryApi(app);

  app.listen(port, () => {
    console.log(`Memory Visualization API server running at http://localhost:${port}`);
  });

  // Prompt for developer ID
  const rlDev = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const askDev = (q) => new Promise(res => rlDev.question(q, res));
  const developerId = (await askDev('Enter your developer ID (or username): ')).trim() || 'default';
  rlDev.close();

  // Load developer profile
  let developerProfile = await loadDeveloperProfile(developerId);
  if (developerProfile) {
    console.log(`Loaded developer profile for "${developerId}":`);
    if (developerProfile.codingPatterns) {
      console.log('  Coding Patterns:', developerProfile.codingPatterns.join(', '));
    }
    if (developerProfile.preferences) {
      console.log('  Preferences:', JSON.stringify(developerProfile.preferences));
    }
  } else {
    console.log(`No profile found for "${developerId}". A new profile will be created as you interact.`);
    developerProfile = {};
  }

  const allMemory = await loadMemory();
  console.log(`Loaded ${allMemory.length} memory entries`);

  // Load hierarchical memory layers
  const sessionMemory = await getHierarchicalMemoryEntries('session');
  const projectMemory = await getHierarchicalMemoryEntries('project');
  const globalMemory = await getHierarchicalMemoryEntries('global');
  console.log(`Session memory entries: ${sessionMemory.length}`);
  console.log(`Project memory entries: ${projectMemory.length}`);
  console.log(`Global memory entries: ${globalMemory.length}`);

  const tempClonesBaseDir = path.resolve(config.tempClonesBaseDir);
  const outputDir = path.resolve(config.outputDir);

  try {
    await fs.promises.mkdir(tempClonesBaseDir, { recursive: true });
    console.log(`Ensured base temporary directory exists: ${tempClonesBaseDir}`);
    await fs.promises.mkdir(outputDir, { recursive: true });
    console.log(`Ensured output directory exists: ${outputDir}`);
  } catch (err) {
    console.error(`Failed to create base directories ('${tempClonesBaseDir}' or '${outputDir}'):`, err);
    console.error("Cannot proceed without base directories. Exiting.");
    return; 
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Welcome to the AI Agent!');

  function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
  }

  while (true) {
    const url = await ask('Enter a YouTube video URL, GitHub repository URL, or local path (or type "exit" to quit): ');
    if (url.trim().toLowerCase() === 'exit' || url.trim().toLowerCase() === 'quit') {
      rl.close();
      break;
    }

    const getApiKeyForModel = (modelName) => {
      if (modelName.toLowerCase().startsWith('gpt-')) {
        return config.openaiApiKey;
      }
      // Default to DeepSeek if not specified or not OpenAI
      return config.deepseekApiKey; 
    };

    const llmRepoConfig = { 
      apiKey: getApiKeyForModel(config.llmModelRepo), 
      model: config.llmModelRepo, 
      maxTokens: config.maxTokensRepo, 
      temperature: config.temperatureRepo 
    };
    const llmYouTubeConfig = { 
      apiKey: getApiKeyForModel(config.llmModelYouTube), 
      model: config.llmModelYouTube, 
      maxTokens: config.maxTokensYouTube, 
      temperature: config.temperatureYouTube 
    };
    const llmFollowUpConfig = { 
      apiKey: getApiKeyForModel(config.llmModelFollowUp), 
      model: config.llmModelFollowUp, 
      maxTokens: config.maxTokensFollowUp, 
      temperature: config.temperatureFollowUp 
    };
    const fileReadConfig = { maxTotalContentSize: config.maxTotalContentSize, maxSourceFilesToScan: config.maxSourceFilesToScan, maxSourceFileSize: config.maxSourceFileSize };

    try {
      let isLocalPath = false;
      try {
        const stats = await fs.promises.stat(url);
        if (stats.isDirectory()) isLocalPath = true;
      } catch (e) { /* not a path or not accessible */ }

      if (isLocalPath) {
        console.log(`Local directory detected: ${url}`);
        try {
          let projectTypeHint = 'unknown';
          if (await fs.promises.stat(path.join(url, 'package.json')).catch(() => false)) projectTypeHint = 'nodejs';
          else if (await fs.promises.stat(path.join(url, 'requirements.txt')).catch(() => false) || await fs.promises.stat(path.join(url, 'pyproject.toml')).catch(() => false)) projectTypeHint = 'python';
          else if (await fs.promises.stat(path.join(url, 'pom.xml')).catch(() => false)) projectTypeHint = 'java_maven';
          // Add other hints here
          if (projectTypeHint !== 'unknown') console.log(`Detected project type: ${projectTypeHint}`);

          let priorityPaths = [];
          try {
            const includeContent = await fs.promises.readFile(path.join(url, '.agentinclude'), 'utf8');
            priorityPaths = includeContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
            if (priorityPaths.length > 0) console.log(`Found .agentinclude, prioritizing: ${priorityPaths.join(', ')}`);
          } catch (e) { console.log('No .agentinclude file found or it could not be read.'); }

          console.log(`[DEBUG_AGENT_LOCAL_PATH] Attempting to get content for local path: ${url}`);
          console.log(`[DEBUG_AGENT_LOCAL_PATH] Parameters for getRepoContentForAnalysis: path=${url}, priorityPaths=${JSON.stringify(priorityPaths)}, hint=${projectTypeHint}, config=${JSON.stringify(fileReadConfig)}`);
          let localProjectContent;
          try {
            localProjectContent = await getRepoContentForAnalysis(url, priorityPaths, projectTypeHint, fileReadConfig); 
            console.log(`[DEBUG_AGENT_LOCAL_PATH] Result from getRepoContentForAnalysis (length): ${localProjectContent ? localProjectContent.length : 'null or empty'}`);
          } catch (getContentError) {
            console.error(`[DEBUG_AGENT_LOCAL_PATH] Error calling getRepoContentForAnalysis:`, getContentError);
            localProjectContent = null;
          }

          if (!localProjectContent) {
            console.log('Could not extract relevant content from the local project.');
          } else {
            console.log('Local project content extracted. Analyzing with LLM...');
            const localMemory = await getRelevantMemory(url);
            if (localMemory.length) {
              console.log('Relevant Memory for this local project:');
              localMemory.forEach(m => console.log(`- [${m.timestamp}] ${m.summary}`));
            }
            // Use dynamic context window management here
            // Incorporate developer profile preferences into context if available
            let profileContext = '';
            if (developerProfile && developerProfile.preferences) {
              profileContext = 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n';
            }
            const contextWindow = buildContextWindow(localMemory, profileContext + localProjectContent, llmRepoConfig.maxTokens);
            let analysis = await analyzeRepoContent(contextWindow, llmRepoConfig);

            // Handle potential memory queries from the LLM
            analysis = await handleLlmResponseAndMemoryQueries(analysis, localProjectContent, llmRepoConfig, developerId, 'analyzeRepoContent');
            
            await addMemoryEntry('local', url, analysis.originalProjectSummary.purpose);
            await addHierarchicalMemoryEntry('project', { type: 'local', key: url, summary: analysis.originalProjectSummary.purpose });

            // Update developer profile with new coding patterns if found
            if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
              for (const pattern of analysis.originalProjectSummary.coreMechanics) {
                await addCodingPattern(developerId, pattern);
              }
            }

            console.log('Analysis complete. Generating blueprint...');
            const { markdownBlueprint, consolePrompts } = generateRepoPrompts(analysis, url, "Local Project"); 
            
            console.log('\nConsole Prompts (Local Project):');
            consolePrompts.forEach((p, i) => console.log(`${i + 1}. ${p}`));
            
            const projectName = sanitizeFilename(path.basename(url) || 'local_project');
            const outputFilename = `local_${projectName}_blueprint.md`;
            const outputPath = path.join(outputDir, outputFilename);
            fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
            console.log(`\nBlueprint has been saved to ${outputPath}\n`);

            while (true) {
              const followup = await ask('\nAsk a follow-up, request refinement on a blueprint section, or type "back" to analyze a new URL/path: ');
              if (followup.trim().toLowerCase() === 'back') break;
              if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { rl.close(); return; }
              try {
                const followupAnswerString = await getFollowUpAnswer(localProjectContent, analysis, followup, llmFollowUpConfig);
                console.log('\nFollow-up Answer:\n', followupAnswerString);
              } catch (err) { console.error('Error answering local project follow-up:', err.message); }
            }
          }
        } catch (error) { console.error(`Error processing local project: ${error.message}`); }
        continue;
      } else if (url.includes('github.com')) {
        console.log(`GitHub URL detected: ${url}`);
        const repoInfo = parseGitHubUrl(url);
        if (!repoInfo) { console.log('Invalid GitHub URL format.'); continue; }

        const { owner, repo } = repoInfo;
        let clonedRepoPath = '';
        try {
          clonedRepoPath = await cloneRepo(owner, repo, config.tempClonesBaseDir, config.githubPat); // Pass config.githubPat
          if (!clonedRepoPath) { console.log('Repository cloning failed.'); continue; }

          let projectTypeHintGh = 'unknown';
          if (await fs.promises.stat(path.join(clonedRepoPath, 'package.json')).catch(() => false)) projectTypeHintGh = 'nodejs';
          // Add other hints
          if (projectTypeHintGh !== 'unknown') console.log(`Detected project type in cloned repo: ${projectTypeHintGh}`);
          
          let priorityPathsGh = [];
          try {
            const includeContentGh = await fs.promises.readFile(path.join(clonedRepoPath, '.agentinclude'), 'utf8');
            priorityPathsGh = includeContentGh.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
            if (priorityPathsGh.length > 0) console.log(`Found .agentinclude in cloned repo, prioritizing: ${priorityPathsGh.join(', ')}`);
          } catch (e) { console.log('No .agentinclude file found in cloned repo.'); }
          
          const repoMainContent = await getRepoContentForAnalysis(clonedRepoPath, priorityPathsGh, projectTypeHintGh, fileReadConfig);
          if (!repoMainContent) {
            console.log('Could not extract relevant content from the repository.');
          } else {
            console.log('Repository content extracted. Analyzing with LLM...');
            const repoMemory = await getRelevantMemory(url);
            if (repoMemory.length) {
              console.log('Relevant Memory for this repository:');
              repoMemory.forEach(m => console.log(`- [${m.timestamp}] ${m.summary}`));
            }
            // Use dynamic context window management here
            // Incorporate developer profile preferences into context if available
            let profileContextGh = '';
            if (developerProfile && developerProfile.preferences) {
              profileContextGh = 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n';
            }
            const contextWindow = buildContextWindow(repoMemory, profileContextGh + repoMainContent, llmRepoConfig.maxTokens);
            let analysis = await analyzeRepoContent(contextWindow, llmRepoConfig);

            // Handle potential memory queries from the LLM
            analysis = await handleLlmResponseAndMemoryQueries(analysis, repoMainContent, llmRepoConfig, developerId, 'analyzeRepoContent');

            await addMemoryEntry('repo', url, analysis.originalProjectSummary.purpose);
            await addHierarchicalMemoryEntry('project', { type: 'repo', key: url, summary: analysis.originalProjectSummary.purpose });

            // Update developer profile with new coding patterns if found
            if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
              for (const pattern of analysis.originalProjectSummary.coreMechanics) {
                await addCodingPattern(developerId, pattern);
              }
            }

            console.log('Analysis complete. Generating blueprint...');
            const { markdownBlueprint, consolePrompts } = generateRepoPrompts(analysis, url, "GitHub Repository");
            
            console.log('\nConsole Prompts (GitHub Repo):');
            consolePrompts.forEach((p, i) => console.log(`${i + 1}. ${p}`));
            
            const safeRepoName = sanitizeFilename(`${owner}_${repo}`);
            const outputFilename = `github_${safeRepoName}_blueprint.md`;
            const outputPath = path.join(outputDir, outputFilename);
            fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
            console.log(`\nBlueprint has been saved to ${outputPath}\n`);

            while (true) {
              const followup = await ask('\nAsk a follow-up, request refinement on a blueprint section, or type "back" to analyze a new URL: ');
              if (followup.trim().toLowerCase() === 'back') break;
              if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { rl.close(); if (clonedRepoPath) await cleanupRepo(clonedRepoPath); return; }
              try {
                const followupAnswerString = await getFollowUpAnswer(repoMainContent, analysis, followup, llmFollowUpConfig);
                console.log('\nFollow-up Answer:\n', followupAnswerString);
              } catch (err) { console.error('Error answering GitHub follow-up:', err.message); }
            }
          }
        } catch (error) { console.error(`Error processing GitHub repository: ${error.message}`);} 
        finally { if (clonedRepoPath) await cleanupRepo(clonedRepoPath); }
        continue;
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        console.log('Fetching YouTube transcript...');
        const ytMemory = await getRelevantMemory(url);
        if (ytMemory.length) {
          console.log('Relevant Memory for this YouTube video:');
          ytMemory.forEach(m => console.log(`- [${m.timestamp}] ${m.summary}`));
        }
        const transcript = await fetchTranscript(url); // Assuming fetchTranscript doesn't need config for now
        if (!transcript) { console.log('Could not fetch transcript.'); continue; }

        console.log('Transcript fetched. Analyzing with LLM...');
        // Use dynamic context window management here
        // Incorporate developer profile preferences into context if available
        let profileContextYt = '';
        if (developerProfile && developerProfile.preferences) {
          profileContextYt = 'Developer Preferences:\n' + JSON.stringify(developerProfile.preferences, null, 2) + '\n';
        }
        const contextWindow = buildContextWindow(ytMemory, profileContextYt + transcript, llmYouTubeConfig.maxTokens);
        let analysis = await analyzeTranscript(contextWindow, llmYouTubeConfig);

        // Handle potential memory queries from the LLM
        analysis = await handleLlmResponseAndMemoryQueries(analysis, transcript, llmYouTubeConfig, developerId, 'analyzeTranscript');

        await addMemoryEntry('youtube', url, analysis.originalProjectSummary.purpose);
        await addHierarchicalMemoryEntry('project', { type: 'youtube', key: url, summary: analysis.originalProjectSummary.purpose });

        // Update developer profile with new coding patterns if found
        if (analysis.originalProjectSummary && Array.isArray(analysis.originalProjectSummary.coreMechanics)) {
          for (const pattern of analysis.originalProjectSummary.coreMechanics) {
            await addCodingPattern(developerId, pattern);
          }
        }

        console.log('Analysis complete. Generating blueprint...');
        const { markdownBlueprint, consolePrompts } = generatePrompts(analysis, url);

        console.log('\nConsole Prompts (YouTube):');
        consolePrompts.forEach((p, i) => console.log(`${i + 1}. ${p}`));

        let videoId = 'video';
        try {
          const videoUrl = new URL(url);
          if (videoUrl.hostname === 'youtu.be') videoId = videoUrl.pathname.substring(1);
          else if (videoUrl.hostname.includes('youtube.com') && videoUrl.searchParams.has('v')) videoId = videoUrl.searchParams.get('v');
          videoId = sanitizeFilename(videoId);
        } catch (e) { console.warn("Could not parse video ID from URL."); }
        
        const timestampForFile = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFilename = `youtube_${videoId}_${timestampForFile}_blueprint.md`;
        const outputPath = path.join(outputDir, outputFilename);
        fs.writeFileSync(outputPath, markdownBlueprint, 'utf8');
        console.log(`\nBlueprint has been saved to ${outputPath}\n`);

        while (true) {
          const followup = await ask('Ask a follow-up question about the video/prompts, or type "back" to analyze a new video: ');
          if (followup.trim().toLowerCase() === 'back') break;
          if (followup.trim().toLowerCase() === 'exit' || followup.trim().toLowerCase() === 'quit') { rl.close(); return; }
          try {
            const followupAnswerString = await getFollowUpAnswer(transcript, analysis, followup, llmFollowUpConfig);
            console.log('\nFollow-up Answer:\n', followupAnswerString);
          } catch (err) { console.error('Error answering follow-up:', err.message); }
        }
      } else {
        console.log('Invalid URL. Please enter a YouTube video URL, GitHub repository URL, or local path.');
        continue;
      }
    } catch (err) {
      console.error('Error in main loop:', err.message || err);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

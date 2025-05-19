import { Message, streamText, StreamData, ToolCallPart, ToolResultPart, tool } from 'ai'; // Removed StreamingTextResponse for now
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod'; // Import Zod
import { randomUUID } from 'crypto'; // For generating message IDs
import { invokeMcpTool } from '@/lib/mcp_ui_client.mjs'; // Updated to .mjs
import { parseGitHubUrl, cloneRepo, getRepoContentForAnalysis } from '@/lib/github';
import { analyzeRepoContent, analyzeTranscript } from '@/lib/llm';
import { fetchTranscript } from '@/lib/youtube';
import { buildContextWindow } from '@/lib/contextWindowManager';
import { loadDeveloperProfile } from '@/lib/developerProfile';
import { getRelevantMemory as getSimpleMemory, addMemoryEntry as addSimpleMemoryEntry } from '@/lib/memory';
import { getMemoryEntries as getHierarchicalMemoryEntries, addMemoryEntry as addHierarchicalMemoryEntry } from '@/lib/hierarchicalMemory';
import LanceVectorMemory from '@/lib/lanceVectorMemory'; // Added for LanceDB
import path from 'path';
import fs from 'fs/promises';
// ToolDefinition removed, will use OpenAI tool structure

// MCP Config Loading
const MCP_UI_CONFIG_PATH = path.join(process.cwd(), 'mcp-config.json');
let mcpUiConfigCache: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadMcpUiConfig(forceRefresh = false) {
  if (mcpUiConfigCache && !forceRefresh) {
    return mcpUiConfigCache;
  }
  try {
    const rawConfig = await fs.readFile(MCP_UI_CONFIG_PATH, 'utf-8');
    mcpUiConfigCache = JSON.parse(rawConfig);
    console.log('[ChatAPI MCP] Successfully loaded mcp-config.json for UI');
    return mcpUiConfigCache;
  } catch (error) {
    console.error(`[ChatAPI MCP] Error loading or parsing mcp-config.json from ${MCP_UI_CONFIG_PATH}:`, error);
    mcpUiConfigCache = null;
    return null; // Return null on error, handle upstream
  }
}

// Initialize LanceVectorMemory
// OPENAI_API_KEY needs to be set in the environment for embeddingProvider to work
const lvmConfig = { 
  openaiApiKey: process.env.OPENAI_API_KEY 
  // lanceOptions can be added here if needed for db path, e.g. { dbPath: 'src/advanced-chat-ui/vector-memory/lancedb-data' }
  // However, the copied lancedb.js and lanceVectorMemory.js are set up to use a path relative to process.cwd()
};
const lvm = new LanceVectorMemory(lvmConfig);
let lvmInitialized = false; // To ensure init is called only once or as needed

interface DeveloperProfileData {
  codingStyle?: string;
  interests?: string[];
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any 
}

export const maxDuration = 120;

function detectUrlType(text: string): { type: 'github' | 'youtube' | 'other'; url?: string } {
  const githubRegex = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+/;
  const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  let match = text.match(githubRegex);
  if (match) return { type: 'github', url: match[0] };
  match = text.match(youtubeRegex);
  if (match) return { type: 'youtube', url: match[0] };
  return { type: 'other' };
}

const availableSystemPrompts: Record<string, string> = {
  default: 'You are a helpful assistant.',
  code_explainer: 'You are an expert software engineer. Explain the following code snippet or concept clearly and concisely, assuming the user has some technical background.',
  creative_writer: 'You are a creative writer. Generate a short story, poem, or a creative piece based on the user\'s input or theme.',
  technical_architect: 'You are a seasoned software architect. Provide high-level architectural advice, design patterns, or system design insights based on the user\'s query.',
};

export async function POST(req: Request) {
  let streamDataForResponse: StreamData | undefined;

  try {
    const { messages, promptId, developerId: reqDeveloperId }: { messages: Message[]; promptId?: string; developerId?: string } = await req.json();

    if (!process.env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY is not set.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const deepseekProvider = createOpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
      compatibility: 'strict',
    });

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    let systemPromptContent = (promptId && availableSystemPrompts[promptId]) ? availableSystemPrompts[promptId] : availableSystemPrompts.default;
    const messagesToLLM: Message[] = [...messages];

    // --- MCP Call Handling (New) ---
    if (lastUserMessage && lastUserMessage.content && typeof lastUserMessage.content === 'string' && lastUserMessage.content.startsWith('/mcp_call ')) {
      let serverIdForError = 'unknown_server';
      let toolNameForError = 'unknown_tool';
      try {
        console.log('[ChatAPI MCP Trigger] Received /mcp_call command:', lastUserMessage.content);
        const commandParts = lastUserMessage.content.substring('/mcp_call '.length).split(' ');
        const serverId = commandParts[0];
        const toolName = commandParts[1];
        serverIdForError = serverId; // Assign for catch block
        toolNameForError = toolName; // Assign for catch block
        const paramsString = commandParts.slice(2).join(' '); // Corrected: use commandParts
        let params = {};
        if (paramsString) {
          try {
            params = JSON.parse(paramsString);
          } catch (parseErrorUnknown) {
            const parseError = parseErrorUnknown instanceof Error ? parseErrorUnknown : new Error(String(parseErrorUnknown));
            console.error('[ChatAPI MCP Trigger] JSON parse error for params:', parseError);
            const errorResponse: Message = { id: randomUUID(), role: 'assistant', content: `Error: Invalid JSON parameters for /mcp_call: ${parseError.message}` };
            // For non-streaming error, just return a Response
            return new Response(JSON.stringify(errorResponse), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }
        }

        console.log(`[ChatAPI MCP Trigger] Parsed - Server: ${serverId}, Tool: ${toolName}, Params:`, params);
        if (!streamDataForResponse) streamDataForResponse = new StreamData();
        streamDataForResponse.append({ status: `Attempting MCP call to ${serverId} -> ${toolName}...` });
        
        const mcpResult = await invokeMcpTool(serverId, toolName, params);
        
        console.log('[ChatAPI MCP Trigger] MCP call result:', mcpResult);
        const successResponse: Message = { id: randomUUID(), role: 'assistant', content: `MCP Call Success:\nServer: ${serverId}\nTool: ${toolName}\nResult: ${JSON.stringify(mcpResult, null, 2)}` };
        streamDataForResponse.append({ mcpCallResult: successResponse.content });
        streamDataForResponse.close();
        // Return as a non-streaming response for simplicity in this direct call
         return new Response(JSON.stringify(successResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });


      } catch (mcpErrorUnknown: unknown) {
        const mcpError = mcpErrorUnknown instanceof Error ? mcpErrorUnknown : new Error(String(mcpErrorUnknown));
        console.error('[ChatAPI MCP Trigger] Error during /mcp_call:', mcpError);
        const errorContent = `Error during MCP call to ${serverIdForError} -> ${toolNameForError}: ${mcpError.message || 'Unknown error'}`;
        const errorResponse: Message = { id: randomUUID(), role: 'assistant', content: errorContent };
        if (streamDataForResponse) {
            streamDataForResponse.append({ mcpCallError: errorResponse.content });
            streamDataForResponse.close();
        }
         return new Response(JSON.stringify(errorResponse), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
    // --- End MCP Call Handling ---

    // --- MCP Tool Definitions and Prompt Augmentation ---
    const mcpToolsForSdk: Record<string, ReturnType<typeof tool>> = {};
    let mcpToolPromptInfo = "\n\n## Available Tools:\nYou can use the following tools by calling them with their specified name and arguments format. Tool names must follow the pattern: mcpTool_serverName_toolName.\n";

    const mcpAppConfig = await loadMcpUiConfig();
    if (mcpAppConfig && mcpAppConfig.mcp_servers) {
      for (const serverKey in mcpAppConfig.mcp_servers) {
        const server = mcpAppConfig.mcp_servers[serverKey];
        if (server.enabled) {
            if (serverKey === 'exa_search_ui') {
                const toolName = 'web_search_exa';
                const fullToolNameForLlm = `mcpTool_${serverKey}_${toolName}`;
                const description = server.description || `Performs a web search using Exa. Example: { "query": "latest AI news" }`;
                mcpToolsForSdk[fullToolNameForLlm] = tool({
                    description: description,
                    parameters: z.object({ query: z.string().describe('The search query.') })
                    // execute is not defined here as it's handled by invokeMcpTool later
                });
                mcpToolPromptInfo += `\n### Tool: ${fullToolNameForLlm}\nDescription: ${description}\nArguments (Zod Schema): query: string\n`;
            }
            // Temporarily disabling taskmanager_ui tool for debugging the '_def' error
            /*
            if (serverKey === 'taskmanager_ui') {
                const exampleToolName = 'get_next_task';
                const fullToolNameForLlm = `mcpTool_${serverKey}_${exampleToolName}`;
                const description = server.description || `Interacts with the Task Manager. Example: { "requestId": "req-123" }`;
                mcpToolsForSdk[fullToolNameForLlm] = tool({
                    description: description,
                    parameters: z.object({ 
                      requestId: z.string().optional().describe('The ID of the request if applicable.'), 
                      command: z.string().optional().describe('Specific task manager command.')
                    })
                });
                mcpToolPromptInfo += `\n### Tool: ${fullToolNameForLlm}\nDescription: ${description}\nArguments (Zod Schema): requestId?: string, command?: string\n`;
            }
            */
        }
      }
    }

    if (Object.keys(mcpToolsForSdk).length === 0) {
      mcpToolPromptInfo = "\n\n(No external MCP tools are currently configured or available for use.)";
    }
    systemPromptContent += mcpToolPromptInfo;
    // --- End MCP Tool Definitions ---

    // Use reqDeveloperId from the request, with a fallback.
    const activeDeveloperId = reqDeveloperId || 'default_profile'; // Use a generic default or 'tramsay' if preferred as default
    let dynamicContext = '';
    // Initialize contextMetadata with the id that will actually be used.
    const contextMetadata = { 
      profileLoaded: 'none', 
      simpleMemoryItems: 0, 
      hierarchicalMemoryItems: 0,
      vectorSearchResults: 0 // Added for LVM
    };


    try {
      // Ensure LVM is initialized
      if (!lvmInitialized && process.env.OPENAI_API_KEY) { // Only init if API key is present
        try {
          await lvm.init();
          lvmInitialized = true;
          console.log('[ChatAPI LVM] LanceDB Vector Memory initialized successfully.');
        } catch (lvmInitError) {
          console.error('[ChatAPI LVM] LanceDB Vector Memory initialization failed:', lvmInitError);
          // lvmInitialized remains false, search will be skipped
        }
      }

      const profile = await loadDeveloperProfile(activeDeveloperId) as DeveloperProfileData | null;
      if (profile) {
        contextMetadata.profileLoaded = activeDeveloperId; // Reflect the ID used
        dynamicContext += `Developer Profile (${activeDeveloperId}):\nPreferred Style: ${profile.codingStyle || 'not set'}\nInterests: ${(profile.interests || []).join(', ')}\n`;
      } else {
        contextMetadata.profileLoaded = `attempted: ${activeDeveloperId} (not found)`;
        if (reqDeveloperId) { // If a specific ID was requested but not found
             dynamicContext += `Developer Profile for '${reqDeveloperId}' not found. Using general context.\n`;
        }
      }
      const simpleMemoryEntries = await getSimpleMemory(null, 3);
      contextMetadata.simpleMemoryItems = simpleMemoryEntries.length;
      const sessionMemoryEntries = await getHierarchicalMemoryEntries('session', null, 2);
      const projectMemoryEntries = await getHierarchicalMemoryEntries('project', null, 2);
      contextMetadata.hierarchicalMemoryItems = sessionMemoryEntries.length + projectMemoryEntries.length;
      const allMemoryForContext = [...simpleMemoryEntries, ...sessionMemoryEntries, ...projectMemoryEntries];
      if (allMemoryForContext.length > 0) {
        const formattedMemoryEntries = allMemoryForContext.map(m => ({ summary: m.summary || JSON.stringify(m), timestamp: m.timestamp || new Date(0).toISOString() }));
        const memoryContext = buildContextWindow(formattedMemoryEntries, '', 300); // Reduced size to make space for LVM results
        if (memoryContext) dynamicContext += `\n\nRecent Activity/Memory (File-based):\n${memoryContext}`;
      }

      // Perform Semantic Search with LanceDB if initialized and user message exists
      if (lvmInitialized && lastUserMessage && lastUserMessage.content) {
        try {
          console.log('[ChatAPI LVM] Performing semantic search.');
          const semanticSearchResults = await lvm.search(lastUserMessage.content, 3); // Get top 3 results
          contextMetadata.vectorSearchResults = semanticSearchResults.length;
          if (semanticSearchResults && semanticSearchResults.length > 0) {
            let semanticContext = "\n\nRelevant Information (from Semantic Search):\n";
            semanticSearchResults.forEach(item => {
              semanticContext += `- ${item.text_chunk} (Similarity: ${item.score ? item.score.toFixed(4) : 'N/A'})\n`;
            });
            dynamicContext += semanticContext;
            console.log(`[ChatAPI LVM] Added ${semanticSearchResults.length} semantic search results to context.`);
          } else {
            console.log('[ChatAPI LVM] No relevant semantic search results found.');
          }
        } catch (searchError) {
          console.error('[ChatAPI LVM] Semantic search failed:', searchError);
          // Optionally append error to streamDataForResponse or dynamicContext
          dynamicContext += "\n\n[Note: Semantic search encountered an error.]";
          contextMetadata.vectorSearchResults = -1; // Indicate error
        }
      }


      if (dynamicContext) {
        systemPromptContent = `Relevant Context:\n${dynamicContext}\n\n---\n\nSystem Instruction: ${systemPromptContent}`;
      }
      if (!streamDataForResponse) streamDataForResponse = new StreamData();
      streamDataForResponse.append({ contextInfo: contextMetadata }); // contextMetadata now includes vectorSearchResults
    } catch (e: unknown) {
      const contextError = e instanceof Error ? e : new Error(String(e));
      console.error('[Context Building Error]', contextError);
      if (!streamDataForResponse) streamDataForResponse = new StreamData();
      streamDataForResponse.append({ error: `Error building context: ${contextError.message}` });
    }

    if (lastUserMessage && lastUserMessage.content) {
      const urlDetection = detectUrlType(lastUserMessage.content);
      if (urlDetection.type === 'github' && urlDetection.url) {
        if (!streamDataForResponse) streamDataForResponse = new StreamData();
        streamDataForResponse.append({ status: 'GitHub URL detected. Starting analysis...' });
        const repoInfo = parseGitHubUrl(urlDetection.url);
        if (repoInfo) {
          try {
            streamDataForResponse.append({ status: `Cloning ${repoInfo.owner}/${repoInfo.repo}...` });
            const tempDirRoot = path.join(process.cwd(), '.temp-clones-chat');
            await fs.mkdir(tempDirRoot, { recursive: true });
            const repoPath = await cloneRepo(repoInfo.owner, repoInfo.repo, undefined, tempDirRoot);
            streamDataForResponse.append({ status: 'Repository cloned. Extracting content...' });
            let priorityPathsOrGlobs: string[] = [];
            const agentIncludePathString = path.join(repoPath, '.agentinclude');
            try {
              const agentIncludeContent = await fs.readFile(agentIncludePathString, 'utf-8');
              priorityPathsOrGlobs = agentIncludeContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
              if (priorityPathsOrGlobs.length > 0) streamDataForResponse.append({ status: `Found .agentinclude with patterns: ${priorityPathsOrGlobs.join(', ')}` });
              else streamDataForResponse.append({ status: '.agentinclude is empty or not found, proceeding with default file discovery.' });
            } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
              streamDataForResponse.append({ status: '.agentinclude not found, proceeding with default file discovery.' });
            }
            const extractionConfig = { maxSourceFilesToScan: 50, maxSourceFileSize: 100000, maxTotalContentSize: 1000000 };
            const projectTypeHint = 'unknown';
            const { concatenatedContent, fileCount, totalSize } = await getRepoContentForAnalysis(repoPath, priorityPathsOrGlobs, projectTypeHint, extractionConfig);
            streamDataForResponse.append({ status: `Content extracted (${fileCount} files, ${totalSize} bytes). Analyzing with LLM...` });
            const llmConfig = { apiKey: process.env.DEEPSEEK_API_KEY!, model: 'deepseek-chat', maxTokens: 4096, temperature: 0.3 };
            const blueprint = await analyzeRepoContent(concatenatedContent, llmConfig);
            streamDataForResponse.append({ status: 'Analysis complete. Blueprint generated.' });
            await fs.rm(repoPath, { recursive: true, force: true });
            systemPromptContent = `The user provided a GitHub URL which has been analyzed. Here is the generated blueprint: \n\n${JSON.stringify(blueprint, null, 2)}\n\nPlease discuss this blueprint with the user, explaining its key findings and suggestions. \n\n(Remember to consider the general context and original system instruction provided earlier in this system message).`;
          } catch (e: unknown) {
            const analysisError = e instanceof Error ? e : new Error(String(e));
            console.error('[GitHub Analysis Error]', analysisError);
            if (streamDataForResponse) streamDataForResponse.append({ error: `Error during GitHub analysis: ${analysisError.message}` });
            systemPromptContent = `I tried to analyze the GitHub URL ${urlDetection.url} for ${repoInfo.owner}/${repoInfo.repo}, but an error occurred: ${analysisError.message}. I can still discuss it generally.`;
          }
        } else {
          systemPromptContent = `The user provided a GitHub URL: ${urlDetection.url}, but I couldn't parse it correctly. Please check the URL format.`;
        }
      } else if (urlDetection.type === 'youtube' && urlDetection.url) {
        if (!streamDataForResponse) streamDataForResponse = new StreamData();
        streamDataForResponse.append({ status: 'YouTube URL detected. Starting analysis...' });
        try {
          streamDataForResponse.append({ status: `Fetching transcript for ${urlDetection.url}...` });
          const transcript = await fetchTranscript(urlDetection.url);
          streamDataForResponse.append({ status: 'Transcript fetched. Analyzing with LLM...' });
          const llmConfig = { apiKey: process.env.DEEPSEEK_API_KEY!, model: 'deepseek-chat', maxTokens: 4096, temperature: 0.3 };
          const blueprint = await analyzeTranscript(transcript, llmConfig);
          streamDataForResponse.append({ status: 'Transcript analysis complete. Blueprint generated.' });
          systemPromptContent = `The user provided a YouTube URL which has been analyzed. Here is the generated blueprint: \n\n${JSON.stringify(blueprint, null, 2)}\n\nPlease discuss this blueprint with the user, explaining its key findings and suggestions. \n\n(Remember to consider the general context and original system instruction provided earlier in this system message).`;
        } catch (e: unknown) {
          const analysisError = e instanceof Error ? e : new Error(String(e));
          console.error('[YouTube Analysis Error]', analysisError);
          if (streamDataForResponse) streamDataForResponse.append({ error: `Error during YouTube analysis: ${analysisError.message}` });
          systemPromptContent = `I tried to analyze the YouTube URL ${urlDetection.url}, but an error occurred: ${analysisError.message}. I can still discuss it generally.`;
        }
      }
    }

    // First LLM call
    let result = await streamText({
      model: deepseekProvider('deepseek-chat'),
      messages: messagesToLLM,
      system: systemPromptContent,
      tools: Object.keys(mcpToolsForSdk).length > 0 ? mcpToolsForSdk : undefined,
    });

    let firstPassFullResponse = "";
    const collectedToolCalls: ToolCallPart[] = [];

    // Process the stream from the first LLM call
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        firstPassFullResponse += part.textDelta;
      } else if (part.type === 'tool-call') {
        collectedToolCalls.push(part);
      } else if (part.type === 'error') {
        console.error('[ChatAPI] Error part in stream:', part.error);
        if (streamDataForResponse) streamDataForResponse.append({ error: `LLM stream error: ${part.error}` });
      } else if (part.type === 'finish') {
        console.log('[ChatAPI] Stream finished. Reason:', part.finishReason, 'Usage:', part.usage);
        if (streamDataForResponse) streamDataForResponse.append({ streamFinishInfo: { reason: part.finishReason, usage: part.usage }});
      }
    }
    
    // If there are tool calls, process them and call LLM again
    if (collectedToolCalls.length > 0) {
      if (!streamDataForResponse) streamDataForResponse = new StreamData();
      streamDataForResponse.append({ status: `Detected ${collectedToolCalls.length} tool_calls. Executing...` });
      console.log(`[ChatAPI] Detected ${collectedToolCalls.length} tool_calls. Assistant message part: "${firstPassFullResponse}"`);

      const toolCallMessages: Message[] = []; // Use Message type
      if (firstPassFullResponse.trim().length > 0 || collectedToolCalls.length > 0) {
        const assistantMsg: Message = {
          id: randomUUID(),
          role: 'assistant',
          content: firstPassFullResponse.trim() || "", // Ensure content is string, can be empty
        };
        if (collectedToolCalls.length > 0) {
          // The Vercel AI SDK expects tool_calls on the message object, not inside content for role: 'assistant'
          (assistantMsg as any).toolCalls = collectedToolCalls.map(tc => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args,
          }));
        }
        toolCallMessages.push(assistantMsg);
      }
      
      const toolResultParts: ToolResultPart[] = [];

      for (const toolCallPart of collectedToolCalls) {
        const { toolCallId, toolName, args } = toolCallPart; // toolName is like "mcpTool_serverKey_actualToolName"
        console.log(`[ChatAPI] Executing tool: ${toolName} with ID: ${toolCallId} and args:`, args);
        streamDataForResponse.append({ status: `Executing tool: ${toolName}...` });

        let serverName: string | undefined = undefined;
        let actualToolNameForMcp: string | undefined = undefined;

        if (toolName.startsWith('mcpTool_')) {
          const toolNameWithoutPrefix = toolName.substring('mcpTool_'.length);
          const knownServerKeys = mcpAppConfig && mcpAppConfig.mcp_servers ? Object.keys(mcpAppConfig.mcp_servers) : [];
          
          // Sort server keys by length descending to match longest possible key first
          const sortedServerKeys = knownServerKeys.sort((a, b) => b.length - a.length);

          for (const key of sortedServerKeys) {
            if (toolNameWithoutPrefix.startsWith(key + '_')) {
              serverName = key;
              actualToolNameForMcp = toolNameWithoutPrefix.substring(key.length + 1);
              break;
            }
          }
        }

        if (!serverName || !actualToolNameForMcp) {
          console.warn(`[ChatAPI] Tool name "${toolName}" could not be parsed into serverName and actualToolNameForMcp. Expected format: mcpTool_serverKey_actualToolName. Skipping.`);
          streamDataForResponse.append({ warning: `Tool name "${toolName}" has an unexpected format or unknown server key. Skipping.` });
          toolResultParts.push({ type: 'tool-result', toolCallId, toolName, result: { error: "Invalid tool name format or unknown server key" } });
          continue;
        }
        
        try {
          const toolResultContent = await invokeMcpTool(serverName, actualToolNameForMcp, args as Record<string, unknown>);
          toolResultParts.push({ type: 'tool-result', toolCallId, toolName, result: toolResultContent });
          console.log(`[ChatAPI] Tool ${actualToolNameForMcp} on ${serverName} executed. Result:`, toolResultContent);
          streamDataForResponse.append({ status: `Tool ${actualToolNameForMcp} on ${serverName} executed successfully.` });
        } catch (error: unknown) { // Changed from 'any' to 'unknown'
          const message = error instanceof Error ? error.message : 'Unknown error during tool execution';
          console.error(`[ChatAPI] Error executing tool ${actualToolNameForMcp} on ${serverName}:`, error);
          toolResultParts.push({ type: 'tool-result', toolCallId, toolName, result: { error: message } });
          if (streamDataForResponse) streamDataForResponse.append({ error: `Error executing tool ${actualToolNameForMcp} on ${serverName}: ${message}` });
        }
      }

      // Add tool results to messages for the second LLM call
      const messagesForFinalCall: Message[] = [...messagesToLLM, ...toolCallMessages]; 
      if (toolResultParts.length > 0) {
        // Workaround for "Unsupported role: tool" with deepseekProvider
        // Format tool results as a user message string
        let toolResultsText = "Tool execution results were as follows:\n";
        toolResultParts.forEach(part => {
          toolResultsText += `\nTool Call ID: ${part.toolCallId}\nTool Name: ${part.toolName}\nResult: ${JSON.stringify(part.result, null, 2)}\n---`;
        });
        
        const toolResultsAsUserMessage: Message = {
            id: randomUUID(),
            role: 'user', // Using 'user' role to feed back tool results as text
            content: toolResultsText,
        };
        messagesForFinalCall.push(toolResultsAsUserMessage);
        console.log('[ChatAPI] Formatted tool results as a user message:', toolResultsText);
      }
      
      console.log('[ChatAPI] Calling LLM again with tool results (if any).');
      streamDataForResponse.append({ status: 'Calling LLM again with tool results...' });

      result = await streamText({ // Re-assign result
        model: deepseekProvider('deepseek-chat'),
        messages: messagesForFinalCall,
        system: systemPromptContent, // System prompt might need adjustment if it's a tool-response context
      });
    }
    
    // Common logic for saving the *final* LLM response to memory
    // This needs to await the full text from the potentially second streamText call
    result.text.then(async (finalLlmResponseText: string) => { // Added type for finalLlmResponseText
      try {
        const userQuery = lastUserMessage?.content || "N/A";
        let interactionKey = `chat:${new Date().toISOString()}`;
        let interactionType = 'general-chat';
        // ... (rest of memory saving logic remains similar, using finalLlmResponseText) ...
        const urlDetectionForSave = lastUserMessage?.content ? detectUrlType(lastUserMessage.content) : { type: 'other', url: undefined };
        if (urlDetectionForSave.url) {
          interactionKey = urlDetectionForSave.url;
          if (urlDetectionForSave.type === 'github') interactionType = 'github-chat';
          else if (urlDetectionForSave.type === 'youtube') interactionType = 'youtube-chat';
        }
        const summaryToSave = `User: ${userQuery.substring(0, 100)}...\nAssistant: ${finalLlmResponseText.substring(0, 150)}...`;
        await addSimpleMemoryEntry(interactionType, interactionKey, summaryToSave);
        console.log(`[Simple Memory Save] Interaction saved for key: ${interactionKey}`);
        const hierarchicalEntry = { type: interactionType, key: interactionKey, userQuery, llmResponsePreview: finalLlmResponseText.substring(0, 200) + (finalLlmResponseText.length > 200 ? "..." : ""), fullLLMResponse: finalLlmResponseText, summary: summaryToSave, source: 'advanced-chat-ui' };
        await addHierarchicalMemoryEntry('session', hierarchicalEntry);
        console.log(`[Hierarchical Session Memory Save] Interaction saved for key: ${interactionKey}`);

        if (lvmInitialized) {
          try {
            const textToEmbed = `User Query: ${userQuery}\nLLM Response: ${finalLlmResponseText}`;
            const vectorMetadata = {
              source_id: interactionKey, 
              content_type: 'chat-interaction',
              timestamp: new Date().toISOString(),
            };
            await lvm.addEntry(interactionKey, textToEmbed, vectorMetadata);
            console.log(`[ChatAPI LVM] Interaction embedded and saved for key: ${interactionKey}`);
          } catch (lvmSaveError) {
            console.error('[ChatAPI LVM] Save Error]', lvmSaveError);
          }
        }
      } catch (saveError) {
        console.error('[Memory Save Error]', saveError);
      }
    }).catch((streamReadError: unknown) => { 
      const error = streamReadError instanceof Error ? streamReadError : new Error(String(streamReadError));
      console.error('[LLM Stream Read Error for Memory Save]', error);
    });

    if (streamDataForResponse) {
      streamDataForResponse.close();
    }
    return result.toDataStreamResponse({ data: streamDataForResponse }); // Corrected: Pass StreamData in an options object

  } catch (error) {
    console.error('[API Chat Error]', error);
    if (streamDataForResponse) { 
      streamDataForResponse.close();
    }
    // Removed redundant close, already handled above
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

import { Message, streamText, StreamData } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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
    const messagesToLLM = [...messages];

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
          console.log('[LVM Route] LanceDB Vector Memory initialized successfully.');
        } catch (lvmInitError) {
          console.error('[LVM Route] LanceDB Vector Memory initialization failed:', lvmInitError);
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
          console.log(`[LVM Route] Performing semantic search for query: "${lastUserMessage.content.substring(0, 50)}..."`);
          const semanticSearchResults = await lvm.search(lastUserMessage.content, 3); // Get top 3 results
          contextMetadata.vectorSearchResults = semanticSearchResults.length;
          if (semanticSearchResults && semanticSearchResults.length > 0) {
            let semanticContext = "\n\nRelevant Information (from Semantic Search):\n";
            semanticSearchResults.forEach(item => {
              semanticContext += `- ${item.text_chunk} (Similarity: ${item.score ? item.score.toFixed(4) : 'N/A'})\n`;
            });
            dynamicContext += semanticContext;
            console.log(`[LVM Route] Added ${semanticSearchResults.length} semantic search results to context.`);
          } else {
            console.log('[LVM Route] No relevant semantic search results found.');
          }
        } catch (searchError) {
          console.error('[LVM Route] Semantic search failed:', searchError);
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

    const result = await streamText({
      model: deepseekProvider('deepseek-chat'),
      messages: messagesToLLM,
      system: systemPromptContent,
    });

    if (streamDataForResponse) {
      streamDataForResponse.close();
    }

    result.text.then(async (llmResponseText) => {
      try {
        const userQuery = lastUserMessage?.content || "N/A";
        let interactionKey = `chat:${new Date().toISOString()}`;
        let interactionType = 'general-chat';
        const urlDetectionForSave = lastUserMessage?.content ? detectUrlType(lastUserMessage.content) : { type: 'other', url: undefined };
        if (urlDetectionForSave.url) {
          interactionKey = urlDetectionForSave.url;
          if (urlDetectionForSave.type === 'github') interactionType = 'github-chat';
          else if (urlDetectionForSave.type === 'youtube') interactionType = 'youtube-chat';
        }
        const summaryToSave = `User: ${userQuery.substring(0, 100)}...\nAssistant: ${llmResponseText.substring(0, 150)}...`;
        await addSimpleMemoryEntry(interactionType, interactionKey, summaryToSave);
        console.log(`[Simple Memory Save] Interaction saved for key: ${interactionKey}`);
        const hierarchicalEntry = { type: interactionType, key: interactionKey, userQuery, llmResponsePreview: llmResponseText.substring(0, 200) + (llmResponseText.length > 200 ? "..." : ""), fullLLMResponse: llmResponseText, summary: summaryToSave, source: 'advanced-chat-ui' };
        await addHierarchicalMemoryEntry('session', hierarchicalEntry);
        console.log(`[Hierarchical Session Memory Save] Interaction saved for key: ${interactionKey}`);

        // Add to LanceDB Vector Memory
        if (lvmInitialized) {
          try {
            const textToEmbed = `User Query: ${userQuery}\nLLM Response: ${llmResponseText}`;
            const vectorMetadata = {
              source_id: interactionKey, // Use the same key
              content_type: 'chat-interaction',
              timestamp: new Date().toISOString(),
              // project_id and session_id will use defaults from LanceVectorMemory if not provided
            };
            await lvm.addEntry(interactionKey, textToEmbed, vectorMetadata);
            console.log(`[LanceDB Save] Interaction embedded and saved for key: ${interactionKey}`);
          } catch (lvmSaveError) {
            console.error('[LanceDB Save Error]', lvmSaveError);
          }
        }

      } catch (saveError) {
        console.error('[Memory Save Error]', saveError);
      }
    }).catch(streamReadError => {
      console.error('[LLM Stream Read Error for Memory Save]', streamReadError);
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error('[API Chat Error]', error);
    if (streamDataForResponse) {
      streamDataForResponse.close();
    }
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

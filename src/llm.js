// LLM analysis module

import fetch from 'node-fetch';

/**
 * Analyzes a YouTube transcript using an LLM API.
 * @param {string|Array<object>} contentOrMessages - The transcript text (string) or an array of messages for tool follow-up.
 * @param {object} llmConfig - Configuration for the LLM call (apiKey, model, maxTokens, temperature).
 * @param {boolean} [isToolResultFollowup=false] - Flag indicating if this call is a follow-up to a tool result.
 * @returns {Promise<object>} - Analysis result (summary, key concepts, steps)
 */
export async function analyzeTranscript(contentOrMessages, llmConfig, isToolResultFollowup = false) {
  const { apiKey, model, maxTokens, temperature } = llmConfig;
  if (!apiKey) {
    console.error(`API key not provided for model ${model} in analyzeTranscript.`);
    throw new Error(`API key not configured for model ${model} in transcript analysis.`);
  }

  let endpoint;
  let effectiveModel = model;
  const isOpenAI = model.toLowerCase().startsWith('gpt-');

  if (isOpenAI) {
    endpoint = "https://api.openai.com/v1/chat/completions";
    console.log(`[LLM_DEBUG] Using OpenAI provider for model (analyzeTranscript): ${model}`);
  } else { // Assume DeepSeek
    endpoint = "https://api.deepseek.com/v1/chat/completions";
    console.log(`[LLM_DEBUG] Using DeepSeek provider for model (analyzeTranscript): ${model}`);
  }

  const promptSystemBase = `You are an expert technical analyst and educator. Your task is to analyze the provided content and generate a detailed "Improvement and Re-implementation Blueprint".
This blueprint should enable another AI coding agent to build a significantly improved version of the project/concept, or a more robust alternative.`;

  const toolInstructions = `
Tool Usage (Optional):
You have access to the following tools. If you need to use them, include a 'tool_calls' array in your JSON response. Each object in this array should represent a tool call with "type": "function" and a "function" object containing "name" and "arguments" (as a JSON string).

1. 'query_memory': Use this to query the agent's internal memory.
   Function Signature: query_memory(query_type: string, query_string: string)
   Example:
   {
     "type": "function",
     "function": {
       "name": "query_memory",
       "arguments": "{\\"query_type\\": \\"semantic_search\\", \\"query_string\\": \\"implementations of quicksort algorithm\\"}"
     }
   }

2. 'web_search_exa': Use this to perform a web search for external information.
   Function Signature: web_search_exa(server_name: string, query: string, numResults?: number)
   Example:
   {
     "type": "function",
     "function": {
       "name": "web_search_exa",
       "arguments": "{\\"server_name\\": \\"github.com/exa-labs/exa-mcp-server\\", \\"query\\": \\"documentation for XYZ.js library\\", \\"numResults\\": 3}"
     }
   }
   Note: 'server_name' for 'web_search_exa' must be "github.com/exa-labs/exa-mcp-server".

If you use these tools, the agent will execute them and provide results back to you for refining your blueprint.
If no tools are needed, omit 'tool_calls' or provide an empty array.
Consider using tools if:
- You need to recall specific details about previously analyzed related projects/videos (use 'query_memory').
- You need current information, external documentation, or to explore topics not covered in the provided content (use 'web_search_exa').
- Accessing historical context or external information would significantly improve your blueprint.

Respond ONLY with a valid JSON object with the following structure (and optionally 'tool_calls'):
`;

  const blueprintStructurePrompt = `
{
  "originalProjectSummary": {
    "purpose": "Concise purpose of the project or concept explained in the video.",
    "coreMechanics": ["List key concepts, algorithms, or distinct operational steps demonstrated or explained in the video."]
  },
  "suggestedEnhancedVersion": {
    "concept": "Propose a clear concept for an enhanced or alternative version of what is taught in the video.",
    "keyEnhancements": [
      {
        "enhancementTitle": "Provide a short, descriptive title for this enhancement.",
        "description": "Detail what this enhancement involves and how it improves upon what was shown in the video.",
        "reasoning": "Explain why this enhancement is valuable.",
        "actionableStepsForCodingAgent": ["Provide 3-5 concrete, actionable steps a coding agent could take to implement this enhancement."],
        "relevantOriginalContext": ["Briefly mention parts of the video transcript that this enhancement builds upon or replaces, if applicable."]
      }
    ],
    "suggestedTechStack": ["List key technologies for implementing the enhanced version."],
    "criticalFilesToCreateOrModify": ["Identify a few critical new files or key code structures."],
    "suggestedBoilerplate": "Provide a single string with suggested code snippets, file structures, or scaffolding guidance.",
    "gapAnalysis": ["List specific gaps in the original project and potential areas for unique value."]
  }
}
Ensure all fields are populated. For arrays, provide at least 1-2 items. If info isn't clear, make reasonable inferences or state 'Not clearly determinable'.
Focus on practical, actionable information for a downstream AI coding agent.
`;

  let messages;
  if (isToolResultFollowup) {
    messages = contentOrMessages; // contentOrMessages is already the full message array from agent.js
  } else {
    const userPromptForInitialAnalysis = `
${promptSystemBase}

Provided YouTube Transcript:
"""
${contentOrMessages}
"""

${toolInstructions}
${blueprintStructurePrompt}
`;
    messages = [
      { role: "system", content: "You are an expert technical analyst and educator." },
      { role: "user", content: userPromptForInitialAnalysis }
    ];
  }

  const body = {
    model: effectiveModel,
    messages: messages,
    temperature: temperature || 0.3,
    max_tokens: maxTokens || 1024,
    // Instructing the model to use tools if it deems necessary.
    // The exact format for tool_choice/tools depends on the API (OpenAI vs DeepSeek)
    // For OpenAI-compatible APIs (like DeepSeek's chat completions):
    tools: [
      {
        type: "function",
        function: {
          name: "query_memory",
          description: "Queries the agent's internal memory (semantic or hierarchical).",
          parameters: {
            type: "object",
            properties: {
              query_type: { type: "string", enum: ["semantic_search", "hierarchical_lookup"], description: "Type of memory query." },
              query_string: { type: "string", description: "The search query or lookup term." }
            },
            required: ["query_type", "query_string"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "web_search_exa",
          description: "Performs a web search using Exa Search MCP for external information.",
          parameters: {
            type: "object",
            properties: {
              server_name: { type: "string", description: "Must be 'github.com/exa-labs/exa-mcp-server'."},
              query: { type: "string", description: "The web search query." },
              numResults: { type: "number", description: "Number of search results to return (optional, default 5)." }
            },
            required: ["server_name", "query"]
          }
        }
      }
    ],
    tool_choice: "auto" // Let the model decide if it needs to call a tool
  };


  const providerNameForLog = isOpenAI ? "OpenAI" : "DeepSeek";
  console.log(`[${providerNameForLog} LLM] Requesting (analyzeTranscript):`, endpoint);
  // console.log(`[${providerNameForLog} LLM] Body:`, JSON.stringify(body, null, 2)); // Can be very verbose

  let res;
  try {
    // DNS lookup can be removed if not actively debugging network issues
    // ... (DNS lookup code omitted for brevity but can be re-added if needed) ...
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (fetchError) {
    console.error(`[LLM_DEBUG] Network or fetch-related error occurred (analyzeTranscript):`, fetchError);
    throw new Error(`Network error during fetch to ${providerNameForLog} API (analyzeTranscript): ${fetchError.message}`);
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[${providerNameForLog} LLM] API Error Status (analyzeTranscript):`, res.status, res.statusText);
    console.error(`[${providerNameForLog} LLM] API Error Body (analyzeTranscript):`, errorBody);
    throw new Error(`${providerNameForLog} API error (analyzeTranscript): ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  // The response might contain content OR tool_calls
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const message = data.choices[0].message;
    if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      console.log(`[LLM] Received tool_calls from LLM (analyzeTranscript):`, JSON.stringify(message.tool_calls));
      // Return the whole message object so agent.js can process tool_calls
      return { tool_calls: message.tool_calls, /* other parts of message if needed by agent */ };
    } else if (message.content) {
      try {
        let jsonString = message.content.replace(/```json|```/gi, '').trim();
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonString);
        }
        throw new Error("No valid JSON object found in LLM content for transcript.");
      } catch (err) {
        console.error("Failed to parse LLM content for transcript as JSON. Raw content:\n", message.content);
        throw new Error("Failed to parse LLM content for transcript as JSON: " + err.message);
      }
    }
  }
  throw new Error(`No response content or tool_calls from ${providerNameForLog} LLM (analyzeTranscript)`);
}

export async function getFollowUpAnswer(contextContent, initialAnalysis, userQuestion, llmConfig) {
  const { apiKey, model, maxTokens, temperature } = llmConfig;
  if (!apiKey) {
    console.error(`API key not provided for model ${model} in getFollowUpAnswer.`);
    return `API key not configured for model ${model}. Cannot answer follow-up.`;
  }
  
  let endpointFollowUp;
  let effectiveModelFollowUp = model;
  const isOpenAIFollowUp = model.toLowerCase().startsWith('gpt-');

  if (isOpenAIFollowUp) {
    endpointFollowUp = "https://api.openai.com/v1/chat/completions";
  } else { 
    endpointFollowUp = "https://api.deepseek.com/v1/chat/completions";
  }
  const providerName = isOpenAIFollowUp ? "OpenAI" : "DeepSeek";
  console.log(`[LLM_DEBUG] Using ${providerName} provider for model (getFollowUpAnswer): ${model}`);

  const systemMessage = `You are an expert assistant. Your task is to answer the user's question or refine a part of the provided "Initial Improvement & Re-implementation Blueprint".
Base your response *only* on the provided context (original content and the initial blueprint).
If the user asks a question, answer it directly.
If the user asks to refine a section of the blueprint, provide the refined text or an updated version of the relevant section.
If the information isn't in the context for a direct question, state that clearly.

Tool Usage (Optional - if you determine a web search is needed to answer the user's request):
You can use the 'web_search_exa' tool. Include a 'tool_calls' array in your response if you use it.
Example:
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "web_search_exa",
        "arguments": "{\\"server_name\\": \\"github.com/exa-labs/exa-mcp-server\\", \\"query\\": \\"relevant search query\\", \\"numResults\\": 3}"
      }
    }
  ]
}
If you use this, the agent will provide results, and you can then formulate your final answer. Otherwise, answer directly.`;
  
  const userPrompt = `
Original Content Summary (for broader context if needed):
"""
${contextContent.substring(0, 2000)}... 
"""

Initial Improvement & Re-implementation Blueprint:
\`\`\`json
${JSON.stringify(initialAnalysis, null, 2)}
\`\`\`

User's Request: "${userQuestion}"

Response:`;

  const body = {
    model: effectiveModelFollowUp, 
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt }
    ],
    max_tokens: maxTokens || 500, 
    temperature: temperature || 0.2,
    tools: [ // Making tools available for follow-up too
      {
        type: "function",
        function: {
          name: "web_search_exa",
          description: "Performs a web search using Exa Search MCP for external information.",
          parameters: {
            type: "object",
            properties: {
              server_name: { type: "string", description: "Must be 'github.com/exa-labs/exa-mcp-server'."},
              query: { type: "string", description: "The web search query." },
              numResults: { type: "number", description: "Number of search results to return (optional, default 5)." }
            },
            required: ["server_name", "query"]
          }
        }
      }
    ],
    tool_choice: "auto"
  };

  try {
    // ... (DNS lookup code omitted for brevity) ...
    const response = await fetch(endpointFollowUp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[${providerName} LLM] API Error in getFollowUpAnswer: ${response.status} ${response.statusText}`);
      console.error(`[${providerName} LLM] API Error Body for getFollowUpAnswer:`, errorBody);
      return `Error from ${providerName} LLM API: ${response.statusText}`;
    }

    const data = await response.json();
    // Check for tool_calls first in follow-up as well
    if (data.choices && data.choices[0] && data.choices[0].message) {
        const message = data.choices[0].message;
        if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
          console.log(`[LLM] Received tool_calls from LLM (getFollowUpAnswer):`, JSON.stringify(message.tool_calls));
          // The agent.js main loop for follow-ups currently doesn't handle iterative tool calls.
          // This would be an enhancement. For now, we'd ideally return the tool_calls object
          // for agent.js to process if it were equipped.
          // Returning a string indicating tool use for now.
          return `LLM requested to use tools: ${JSON.stringify(message.tool_calls)}. Agent's follow-up loop needs enhancement to process this.`;
        } else if (message.content) {
          return message.content.trim();
        }
    }
    console.error(`No content or tool_calls in ${providerName} LLM response for getFollowUpAnswer:`, data);
    return `Could not get a follow-up answer from ${providerName} LLM.`;
  } catch (error) {
    console.error(`Error in getFollowUpAnswer ${providerName} LLM call:`, error);
    return `Error during follow-up ${providerName} LLM call: ${error.message}`;
  }
}

/**
 * Analyzes GitHub repository content using an LLM API.
 * @param {string|Array<object>} contentOrMessages - Concatenated string of key repository files or an array of messages for tool follow-up.
 * @param {object} llmConfig - Configuration for the LLM call (apiKey, model, maxTokens, temperature).
 * @param {boolean} [isToolResultFollowup=false] - Flag indicating if this call is a follow-up to a tool result.
 * @returns {Promise<object>} - Analysis result.
 */
export async function analyzeRepoContent(contentOrMessages, llmConfig, isToolResultFollowup = false) {
  const { apiKey, model, maxTokens, temperature } = llmConfig;
   if (!apiKey) {
    console.error(`API key not provided for model ${model} in analyzeRepoContent.`);
    throw new Error(`API key not configured for model ${model} in repository analysis.`);
  }

  let endpoint;
  let effectiveModel = model;
  const isOpenAI = model.toLowerCase().startsWith('gpt-');

  if (isOpenAI) {
    endpoint = "https://api.openai.com/v1/chat/completions";
  } else { 
    endpoint = "https://api.deepseek.com/v1/chat/completions";
  }
  const providerName = isOpenAI ? "OpenAI" : "DeepSeek";
  console.log(`[LLM_DEBUG] Using ${providerName} provider for model (analyzeRepoContent): ${model}`);
  
  const promptSystemBaseRepo = `You are an expert software architect and reverse engineer. Your task is to analyze the provided GitHub repository content and generate a detailed "Improvement and Re-implementation Blueprint".
This blueprint should enable another AI coding agent to build a significantly improved version or a more robust alternative.`;
  
  // Tool instructions are the same as for analyzeTranscript
  const toolInstructionsRepo = `
Tool Usage (Optional):
You have access to the following tools. If you need to use them, include a 'tool_calls' array in your JSON response. Each object in this array should represent a tool call with "type": "function" and a "function" object containing "name" and "arguments" (as a JSON string).

1. 'query_memory': Use this to query the agent's internal memory.
   Function Signature: query_memory(query_type: string, query_string: string)
   Example:
   {
     "type": "function",
     "function": {
       "name": "query_memory",
       "arguments": "{\\"query_type\\": \\"semantic_search\\", \\"query_string\\": \\"microservice architecture patterns for e-commerce\\"}"
     }
   }

2. 'web_search_exa': Use this to perform a web search for external information.
   Function Signature: web_search_exa(server_name: string, query: string, numResults?: number)
   Example:
   {
     "type": "function",
     "function": {
       "name": "web_search_exa",
       "arguments": "{\\"server_name\\": \\"github.com/exa-labs/exa-mcp-server\\", \\"query\\": \\"best practices for FastAPI security\\", \\"numResults\\": 3}"
     }
   }
   Note: 'server_name' for 'web_search_exa' must be "github.com/exa-labs/exa-mcp-server".

If you use these tools, the agent will execute them and provide results back to you for refining your blueprint.
If no tools are needed, omit 'tool_calls' or provide an empty array.
Consider using tools if:
- You need to recall specific details about previously analyzed related projects (use 'query_memory').
- You need current information, external documentation, or to explore topics not covered in the provided content (use 'web_search_exa').
- Accessing historical context or external information would significantly improve your blueprint.

Respond ONLY with a valid JSON object with the following structure (and optionally 'tool_calls'):
`;

  const blueprintStructurePromptRepo = `
{
  "originalProjectSummary": {
    "purpose": "Concise purpose of the original project based on the provided content.",
    "coreMechanics": ["List key algorithms, data flows, or distinct operational steps observed in the original project content."]
  },
  "suggestedEnhancedVersion": {
    "concept": "Propose a clear concept for an enhanced or alternative version.",
    "keyEnhancements": [
      {
        "enhancementTitle": "Provide a short, descriptive title for this enhancement.",
        "description": "Detail what this enhancement involves and how it improves upon the original.",
        "reasoning": "Explain why this enhancement is valuable.",
        "actionableStepsForCodingAgent": ["Provide 3-5 concrete, actionable steps a coding agent could take to implement this enhancement."],
        "relevantOriginalContext": ["Briefly mention parts of the original content that this enhancement builds upon or replaces, if applicable."]
      }
    ],
    "suggestedTechStack": ["List key technologies for implementing the enhanced version."],
    "criticalFilesToCreateOrModify": ["Identify a few critical new files or key code structures."],
    "suggestedBoilerplate": "Provide a single string with suggested code snippets, file structures, or scaffolding guidance.",
    "gapAnalysis": ["List specific gaps in the original project and potential areas for unique value."]
  }
}
Ensure all fields are populated. For arrays, provide at least 1-2 items. If info isn't clear, make reasonable inferences or state 'Not clearly determinable'.
Focus on providing practical, actionable information for a downstream AI coding agent.
`;
  
  let messagesRepo;
  if (isToolResultFollowup) {
    messagesRepo = contentOrMessages; 
  } else {
    const userPromptForInitialRepoAnalysis = `
${promptSystemBaseRepo}

Provided Repository Content:
"""
${contentOrMessages}
"""

${toolInstructionsRepo}
${blueprintStructurePromptRepo}
`;
    messagesRepo = [
      { role: "system", content: "You are an expert software architect and technical analyst." },
      { role: "user", content: userPromptForInitialRepoAnalysis }
    ];
  }

  const body = {
    model: effectiveModel, 
    messages: messagesRepo,
    temperature: temperature || 0.3,
    max_tokens: maxTokens || 1024,
    tools: [
      {
        type: "function",
        function: {
          name: "query_memory",
          description: "Queries the agent's internal memory (semantic or hierarchical).",
          parameters: {
            type: "object",
            properties: {
              query_type: { type: "string", enum: ["semantic_search", "hierarchical_lookup"], description: "Type of memory query." },
              query_string: { type: "string", description: "The search query or lookup term." }
            },
            required: ["query_type", "query_string"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "web_search_exa",
          description: "Performs a web search using Exa Search MCP for external information.",
          parameters: {
            type: "object",
            properties: {
              server_name: { type: "string", description: "Must be 'github.com/exa-labs/exa-mcp-server'."},
              query: { type: "string", description: "The web search query." },
              numResults: { type: "number", description: "Number of search results to return (optional, default 5)." }
            },
            required: ["server_name", "query"]
          }
        }
      }
    ],
    tool_choice: "auto"
  };
  
  // console.log(`[${providerName} LLM] Requesting (analyzeRepoContent):`, endpoint);
  // console.log(`[${providerName} LLM] Body:`, JSON.stringify(body, null, 2));


  let resRepo;
  try {
    // ... (DNS lookup code omitted for brevity) ...
    resRepo = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (fetchErrorRepo) {
    console.error(`[LLM_DEBUG] Network or fetch-related error occurred (analyzeRepoContent):`, fetchErrorRepo);
    throw new Error(`Network error during fetch to ${providerName} API (analyzeRepoContent): ${fetchErrorRepo.message}`);
  }

  if (!resRepo.ok) {
    const errorBody = await resRepo.text();
    console.error(`[${providerName} LLM] API Error Status (analyzeRepoContent):`, resRepo.status, resRepo.statusText);
    console.error(`[${providerName} LLM] API Error Body (analyzeRepoContent):`, errorBody);
    throw new Error(`${providerName} API error (analyzeRepoContent): ${resRepo.status} ${resRepo.statusText} - ${errorBody}`);
  }

  const data = await resRepo.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const message = data.choices[0].message;
    if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
       console.log(`[LLM] Received tool_calls from LLM (analyzeRepoContent):`, JSON.stringify(message.tool_calls));
      return { tool_calls: message.tool_calls };
    } else if (message.content) {
      try {
        let jsonString = message.content.replace(/```json|```/gi, '').trim();
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonString);
        }
        throw new Error("No valid JSON object found in LLM content for repository analysis.");
      } catch (err) {
        console.error("Failed to parse LLM content for repo analysis as JSON. Raw content:\n", message.content);
        throw new Error("Failed to parse LLM content for repo analysis as JSON: " + err.message);
      }
    }
  }
  throw new Error(`No response content or tool_calls from ${providerName} LLM (analyzeRepoContent)`);
}

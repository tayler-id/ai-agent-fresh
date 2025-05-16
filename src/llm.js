// LLM analysis module

import fetch from 'node-fetch';

/**
 * Analyzes a YouTube transcript using DeepSeek LLM API.
 * @param {string} transcript - The transcript text.
 * @param {object} llmConfig - Configuration for the LLM call (apiKey, model, maxTokens, temperature).
 * @returns {Promise<object>} - Analysis result (summary, key concepts, steps)
 */
export async function analyzeTranscript(transcript, llmConfig) {
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

  const prompt = `
You are an expert technical analyst and educator. Your task is to analyze the provided YouTube video transcript and generate a detailed "Improvement and Re-implementation Blueprint".
This blueprint should enable another AI coding agent to build a significantly improved version of the project/concept explained in the video, or a more robust alternative.

Provided YouTube Transcript:
"""
${transcript}
"""

Tool Usage (Optional):
If, during your analysis and planning, you determine that you need specific information from the agent's internal memory to provide a better blueprint, you can request it using the 'query_memory' tool.
To do this, include a 'tool_calls' array in your JSON response. Each object in this array should represent a tool call.

For 'query_memory', the structure is:
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "query_memory",
        "arguments": "{\"query_type\": \"semantic_search | hierarchical_lookup\", \"query_string\": \"your specific query here\"}"
      }
    }
  ]
}

Parameters for 'query_memory':
- "query_type": (string, required) Specify either "semantic_search" (for finding conceptually similar information) or "hierarchical_lookup" (for retrieving structured entries, e.g., by keywords or path-like queries).
- "query_string": (string, required) The actual search query or lookup term.

Example of using 'query_memory':
If you are analyzing a YouTube video about a specific algorithm and want to see if the agent has stored previous analyses or implementations of similar algorithms, you might include:
\"tool_calls\": [
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"query_memory\",
      \"arguments\": \"{\\\"query_type\\\": \\\"semantic_search\\\", \\\"query_string\\\": \\\"implementations of quicksort algorithm\\\"}\"
    }
  }
]

If you use this tool, the agent will execute the memory query and provide the results back to you. You should then use these results to refine your blueprint.
If you do not need to query memory, omit the 'tool_calls' field or provide an empty array in your JSON response.
Consider using this tool if:
- You need to recall specific details about previously analyzed related projects/videos.
- You want to check for existing solutions or patterns relevant to the current analysis.
- You feel that accessing historical context would significantly improve the quality or relevance of your suggested enhancements.

Respond ONLY with a valid JSON object with the following structure (and optionally include the 'tool_calls' field as described above if you need to query memory):
{
  "originalProjectSummary": {
    "purpose": "Concise purpose of the project or concept explained in the video.",
    "coreMechanics": ["List key concepts, algorithms, or distinct operational steps demonstrated or explained in the video."]
  },
  "suggestedEnhancedVersion": {
    "concept": "Propose a clear concept for an enhanced or alternative version of what is taught in the video (e.g., 'A web application demonstrating X with added user accounts', 'A more performant version of algorithm Y using Z technique').",
    "keyEnhancements": [
      {
        "enhancementTitle": "Provide a short, descriptive title for this enhancement (e.g., Add interactive UI elements).",
        "description": "Detail what this enhancement involves and how it improves upon what was shown in the video.",
        "reasoning": "Explain why this enhancement is valuable (e.g., 'improves user engagement, provides better visualization, makes it more practical').",
        "actionableStepsForCodingAgent": [
          "Provide 3-5 concrete, actionable steps a coding agent could take to implement this enhancement. Be specific."
        ],
        "relevantOriginalContext": ["Briefly mention parts of the video transcript (e.g., specific timestamps or concepts) that this enhancement builds upon or replaces, if applicable."]
      }
    ],
    "suggestedTechStack": ["List key technologies (languages, frameworks, libraries) for implementing the enhanced version, with a brief rationale if they differ from the original or are new additions based on the video's topic."],
    "criticalFilesToCreateOrModify": ["Identify a few critical new files a coding agent would need to create, or key code structures, for the enhanced version."],
    "suggestedBoilerplate": "Provide a single string containing suggested code snippets, file structures, or scaffolding guidance (e.g., a basic class definition, a file header, a directory structure) that would help a coding agent start implementing the enhancements. Format this as a Markdown code block if applicable.",
    "gapAnalysis": ["List specific gaps in the original project (e.g., missing features, lack of tests, poor documentation) and potential areas for competitive advantage or unique value proposition for the enhanced version."]
  }
}

Ensure all fields are populated. For arrays like 'coreMechanics', 'keyEnhancements', and 'gapAnalysis', provide at least 1-2 items, and for 'actionableStepsForCodingAgent', provide 3-5 steps per enhancement. If specific information isn't clear from the transcript, make reasonable inferences or state 'Not clearly determinable from provided transcript'.
Focus on providing practical, actionable information for a downstream AI coding agent.
`;

  const body = {
    model: effectiveModel,
    messages: [
      { role: "system", content: "You are an expert technical analyst and educator." },
      { role: "user", content: prompt }
    ],
    temperature: temperature || 0.3,
    max_tokens: maxTokens || 1024
  };

  // Debug: log the request details for troubleshooting
  const providerNameForLog = isOpenAI ? "OpenAI" : "DeepSeek";
  console.log(`[${providerNameForLog} LLM] Requesting (analyzeTranscript):`, endpoint);
  console.log(`[${providerNameForLog} LLM] Headers:`, {
    "Authorization": `Bearer ${apiKey ? apiKey.slice(0, 8) + '...' : ''}`,
    "Content-Type": "application/json"
  });
  console.log(`[${providerNameForLog} LLM] Body:`, JSON.stringify(body, null, 2));

  let res;
  try {
    const domainToLookup = new URL(endpoint).hostname;
    // Add DNS lookup for debugging
    const dns = await import('dns');
    await new Promise((resolve, reject) => {
      dns.default.lookup(domainToLookup, { family: 4 }, (err, address, family) => {
        if (err) {
          console.error(`[LLM_DEBUG] dns.lookup (IPv4) FAILED for ${domainToLookup} (analyzeTranscript):`, err);
          // We don't reject here, let fetch try anyway to see its specific error
        } else {
          console.log(`[LLM_DEBUG] dns.lookup SUCCEEDED for ${domainToLookup} (analyzeTranscript): Address: ${address}, Family: ${family}`);
        }
        resolve();
      });
    });

    console.log(`[LLM_DEBUG] Attempting fetch to: ${endpoint} with API key (first 8 chars): ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT PROVIDED'} (analyzeTranscript)`);
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (fetchError) {
    console.error(`[LLM_DEBUG] Network or fetch-related error occurred:`, fetchError);
    // Log more details if available, e.g., error.cause on newer Node versions
    if (fetchError.cause) {
        console.error(`[LLM_DEBUG] Fetch error cause:`, fetchError.cause);
    }
    const providerName = isOpenAI ? "OpenAI" : "DeepSeek";
    throw new Error(`Network error during fetch to ${providerName} API (analyzeTranscript): ${fetchError.message}`);
  }

  if (!res.ok) {
    const errorBody = await res.text();
    const providerName = isOpenAI ? "OpenAI" : "DeepSeek";
    console.error(`[${providerName} LLM] API Error Status (analyzeTranscript):`, res.status, res.statusText);
    console.error(`[${providerName} LLM] API Error Body (analyzeTranscript):`, errorBody);
    throw new Error(`${providerName} API error (analyzeTranscript): ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No response from ${isOpenAI ? "OpenAI" : "DeepSeek"} LLM (analyzeTranscript)`);

  // Try to parse the JSON from the LLM response
  try {
    let jsonString = content;

    // Remove Markdown code block markers if present
    jsonString = jsonString.replace(/```json|```/gi, '').trim();

    // Attempt to extract JSON from a string that might contain it within other text or markdown
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    } else {
      // If no braces, it's not JSON, or malformed beyond simple extraction
      console.error("Could not find JSON object in LLM response for transcript. Raw content:", content);
      throw new Error("No valid JSON object found in LLM response for transcript. The model may have returned the prompt or an error instead of a result.");
    }

    // Try to parse, but if truncated, attempt to recover
    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (err) {
      // Try to fix common truncation: find last complete object/array
      const truncated = jsonString.replace(/,\s*("[^"]*"\s*:\s*[^,}]*\s*)*$/, '');
      try {
        result = JSON.parse(truncated);
        console.warn("Parsed truncated JSON from LLM output.");
      } catch (err2) {
        throw new Error("Failed to parse LLM response for transcript analysis as JSON: " + err.message + "\nRaw output:\n" + content);
      }
    }

    // Basic validation for the new blueprint structure
    if (result.originalProjectSummary && result.suggestedEnhancedVersion && 
        Array.isArray(result.suggestedEnhancedVersion.keyEnhancements) &&
        result.suggestedEnhancedVersion.keyEnhancements.every(e => e.actionableStepsForCodingAgent)) {
      return result;
    }
    // If the result is just the prompt or doesn't match, show a clear error
    if (jsonString.trim().startsWith("{") && jsonString.trim().endsWith("}")) {
      console.error("LLM response for transcript analysis did not match expected blueprint structure. Raw JSON:", jsonString);
      throw new Error("The LLM did not return a valid blueprint. It may have returned the prompt or an error. Please check your model, API key, and try again.");
    }
    throw new Error("Incomplete or malformed blueprint from LLM for transcript content.");
  } catch (err) {
    console.error("Failed to parse LLM response for transcript analysis as JSON. Raw output:\n", content);
    throw new Error("Failed to parse LLM response for transcript analysis as JSON: " + err.message + "\nRaw output:\n" + content);
  } // This closes the catch (err)
} // This correctly closes analyzeTranscript

export async function getFollowUpAnswer(contextContent, initialAnalysis, userQuestion, llmConfig) {
  const { apiKey, model, maxTokens, temperature } = llmConfig; // model here is the original model name from config
  if (!apiKey) {
    console.error(`API key not provided for model ${model} in getFollowUpAnswer.`);
    return `API key not configured for model ${model}. Cannot answer follow-up.`;
  }
  
  let endpointFollowUp;
  let effectiveModelFollowUp = model;
  const isOpenAIFollowUp = model.toLowerCase().startsWith('gpt-');

  if (isOpenAIFollowUp) {
    endpointFollowUp = "https://api.openai.com/v1/chat/completions";
    console.log(`[LLM_DEBUG] Using OpenAI provider for model (getFollowUpAnswer): ${model}`);
  } else { // Assume DeepSeek
    endpointFollowUp = "https://api.deepseek.com/v1/chat/completions";
    console.log(`[LLM_DEBUG] Using DeepSeek provider for model (getFollowUpAnswer): ${model}`);
  }

  // The 'initialAnalysis' is now the full blueprint object.
  // 'contextContent' is the original repo/transcript content.
  const systemMessage = `You are an expert assistant. Your task is to answer the user's question or refine a part of the provided "Initial Improvement & Re-implementation Blueprint".
Base your response *only* on the provided context (original content and the initial blueprint).
If the user asks a question, answer it directly.
If the user asks to refine a section of the blueprint (e.g., "Refine enhancement X by adding Y" or "Make step Z more detailed"), provide the refined text for that part or an updated version of the relevant section.
If the information isn't in the context for a direct question, state that clearly.`;
  
  const userPrompt = `
Original Content Summary (for broader context if needed):
"""
${contextContent.substring(0, 2000)}... 
"""
(Note: Original content might be very long, only a snippet is shown here for brevity in this prompt, but you should assume the full original content was used for the initial blueprint generation if you need to refer to it conceptually.)

Initial Improvement & Re-implementation Blueprint:
\`\`\`json
${JSON.stringify(initialAnalysis, null, 2)}
\`\`\`

User's Request (this could be a question OR a refinement instruction): "${userQuestion}"

Response:`;

  try {
    const domainToLookup = new URL(endpointFollowUp).hostname;
    const dnsFollowUp = await import('dns');
    await new Promise((resolve, reject) => {
      dnsFollowUp.default.lookup(domainToLookup, { family: 4 }, (err, address, family) => {
        if (err) {
          console.error(`[LLM_DEBUG] dns.lookup (IPv4) FAILED for ${domainToLookup} (getFollowUpAnswer):`, err);
        } else {
          console.log(`[LLM_DEBUG] dns.lookup SUCCEEDED for ${domainToLookup} (getFollowUpAnswer): Address: ${address}, Family: ${family}`);
        }
        resolve();
      });
    });

    console.log(`[LLM_DEBUG] Attempting fetch (getFollowUpAnswer) to: ${endpointFollowUp} with API key (first 8 chars): ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT PROVIDED'}`);
    const response = await fetch(endpointFollowUp, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: effectiveModelFollowUp, 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens || 500, 
        temperature: temperature || 0.2,
      })
    });

    const providerName = isOpenAIFollowUp ? "OpenAI" : "DeepSeek";
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[${providerName} LLM] API Error in getFollowUpAnswer: ${response.status} ${response.statusText}`);
      console.error(`[${providerName} LLM] API Error Body for getFollowUpAnswer:`, errorBody);
      return `Error from ${providerName} LLM API: ${response.statusText}`;
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.trim();
    } else {
      console.error(`No content in ${providerName} LLM response for getFollowUpAnswer:`, data);
      return `Could not get a follow-up answer from ${providerName} LLM.`;
    }
  } catch (error) {
    const providerName = isOpenAIFollowUp ? "OpenAI" : "DeepSeek";
    console.error(`Error in getFollowUpAnswer ${providerName} LLM call:`, error);
    return `Error during follow-up ${providerName} LLM call: ${error.message}`;
  }
}

/**
 * Analyzes GitHub repository content using DeepSeek LLM API.
 * @param {string} repoContentString - Concatenated string of key repository files.
 * @param {object} llmConfig - Configuration for the LLM call (apiKey, model, maxTokens, temperature).
 * @returns {Promise<object>} - Analysis result.
 */
export async function analyzeRepoContent(repoContentString, llmConfig) {
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
    console.log(`[LLM_DEBUG] Using OpenAI provider for model: ${model}`);
  } else { // Assume DeepSeek
    endpoint = "https://api.deepseek.com/v1/chat/completions";
    console.log(`[LLM_DEBUG] Using DeepSeek provider for model: ${model}`);
  }

  const prompt = `
You are an expert software architect and reverse engineer. Your task is to analyze the provided GitHub repository content and generate a detailed "Improvement and Re-implementation Blueprint".
This blueprint should enable another AI coding agent to build a significantly improved version or a more robust alternative.

Provided Repository Content:
"""
${repoContentString}
"""

Tool Usage (Optional):
If, during your analysis and planning, you determine that you need specific information from the agent's internal memory to provide a better blueprint, you can request it using the 'query_memory' tool.
To do this, include a 'tool_calls' array in your JSON response. Each object in this array should represent a tool call.

For 'query_memory', the structure is:
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "query_memory",
        "arguments": "{\"query_type\": \"semantic_search | hierarchical_lookup\", \"query_string\": \"your specific query here\"}"
      }
    }
  ]
}

Parameters for 'query_memory':
- "query_type": (string, required) Specify either "semantic_search" (for finding conceptually similar information) or "hierarchical_lookup" (for retrieving structured entries, e.g., by keywords or path-like queries).
- "query_string": (string, required) The actual search query or lookup term.

Example of using 'query_memory':
If you are analyzing a GitHub repository and want to know if similar architectural patterns have been discussed or stored previously, you might include:
\"tool_calls\": [
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"query_memory\",
      \"arguments\": \"{\\\"query_type\\\": \\\"semantic_search\\\", \\\"query_string\\\": \\\"microservice architecture patterns for e-commerce\\\"}\"
    }
  }
]

If you use this tool, the agent will execute the memory query and provide the results back to you. You should then use these results to refine your blueprint.
If you do not need to query memory, omit the 'tool_calls' field or provide an empty array in your JSON response.
Consider using this tool if:
- You need to recall specific details about previously analyzed related projects.
- You want to check for existing solutions or patterns relevant to the current analysis.
- You feel that accessing historical context would significantly improve the quality or relevance of your suggested enhancements.

Respond ONLY with a valid JSON object with the following structure (and optionally include the 'tool_calls' field as described above if you need to query memory):
{
  "originalProjectSummary": {
    "purpose": "Concise purpose of the original project based on the provided content.",
    "coreMechanics": ["List key algorithms, data flows, or distinct operational steps observed in the original project content."]
  },
  "suggestedEnhancedVersion": {
    "concept": "Propose a clear concept for an enhanced or alternative version (e.g., 'A more modular microservice version of X', 'A version of Y with an added REST API and improved error handling').",
    "keyEnhancements": [
      {
        "enhancementTitle": "Provide a short, descriptive title for this enhancement (e.g., Implement a REST API for core features).",
        "description": "Detail what this enhancement involves and how it improves upon the original.",
        "reasoning": "Explain why this enhancement is valuable (e.g., 'improves scalability, allows external integrations, enhances user experience').",
        "actionableStepsForCodingAgent": [
          "Provide 3-5 concrete, actionable steps a coding agent could take to implement this enhancement. Be specific."
        ],
        "relevantOriginalContext": ["Briefly mention parts of the original content (e.g., specific files or concepts) that this enhancement builds upon or replaces, if applicable."]
      }
    ],
    "suggestedTechStack": ["List key technologies (languages, frameworks, libraries) for implementing the enhanced version, with a brief rationale if they differ significantly from the original or are new additions."],
    "criticalFilesToCreateOrModify": ["Identify a few critical new files a coding agent would need to create, or existing files that would require significant modification for the enhanced version."],
    "suggestedBoilerplate": "Provide a single string containing suggested code snippets, file structures, or scaffolding guidance (e.g., a basic class definition, a file header, a directory structure) that would help a coding agent start implementing the enhancements. Format this as a Markdown code block if applicable.",
    "gapAnalysis": ["List specific gaps in the original project (e.g., missing features, lack of tests, poor documentation) and potential areas for competitive advantage or unique value proposition for the enhanced version."]
  }
}

Ensure all fields are populated. For arrays like 'coreMechanics', 'keyEnhancements', and 'gapAnalysis', provide at least 1-2 items, and for 'actionableStepsForCodingAgent', provide 3-5 steps per enhancement. If specific information isn't clear from the text, make reasonable inferences or state 'Not clearly determinable from provided content'.
Focus on providing practical, actionable information for a downstream AI coding agent.
`;

  const body = {
    model: effectiveModel, // Use effectiveModel which might be different from original llmConfig.model if provider changes
    messages: [
      { role: "system", content: "You are an expert software architect and technical analyst." },
      { role: "user", content: prompt }
    ],
    temperature: temperature || 0.3,
    max_tokens: maxTokens || 1024
  };

  let resRepo;
  try {
    const domainToLookup = new URL(endpoint).hostname;
    // Add DNS lookup for debugging
    const dnsRepo = await import('dns');
    await new Promise((resolve, reject) => {
      dnsRepo.default.lookup(domainToLookup, { family: 4 }, (err, address, family) => {
        if (err) {
          console.error(`[LLM_DEBUG] dns.lookup (IPv4) FAILED for ${domainToLookup} (analyzeRepoContent):`, err);
        } else {
          console.log(`[LLM_DEBUG] dns.lookup SUCCEEDED for ${domainToLookup} (analyzeRepoContent): Address: ${address}, Family: ${family}`);
        }
        resolve();
      });
    });
    
    console.log(`[LLM_DEBUG] Attempting fetch (analyzeRepoContent) to: ${endpoint} with API key (first 8 chars): ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT PROVIDED'}`);
    resRepo = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (fetchErrorRepo) {
    console.error(`[LLM_DEBUG] Network or fetch-related error occurred (analyzeRepoContent):`, fetchErrorRepo);
    if (fetchErrorRepo.cause) {
        console.error(`[LLM_DEBUG] Fetch error cause (analyzeRepoContent):`, fetchErrorRepo.cause);
    }
    const providerName = isOpenAI ? "OpenAI" : "DeepSeek";
    throw new Error(`Network error during fetch to ${providerName} API (analyzeRepoContent): ${fetchErrorRepo.message}`);
  }

  if (!resRepo.ok) {
    const errorBody = await resRepo.text();
    const providerName = isOpenAI ? "OpenAI" : "DeepSeek";
    console.error(`[${providerName} LLM] API Error Status (analyzeRepoContent):`, resRepo.status, resRepo.statusText);
    console.error(`[${providerName} LLM] API Error Body (analyzeRepoContent):`, errorBody);
    throw new Error(`${providerName} API error (analyzeRepoContent): ${resRepo.status} ${resRepo.statusText} - ${errorBody}`);
  }

  const data = await resRepo.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No response from ${isOpenAI ? "OpenAI" : "DeepSeek"} LLM for repo analysis`);

  try {
    let jsonString = content;
    // Attempt to extract JSON from a string that might contain it within other text or markdown
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    } else {
      // If no braces, it's not JSON, or malformed beyond simple extraction
      console.error("Could not find JSON object in LLM response for repository. Raw content:", content);
      throw new Error("No valid JSON object found in LLM response for repository.");
    }

    const result = JSON.parse(jsonString); // Attempt to parse the extracted string

    // Basic validation for the new blueprint structure
    if (result.originalProjectSummary && result.suggestedEnhancedVersion && 
        Array.isArray(result.suggestedEnhancedVersion.keyEnhancements) &&
        result.suggestedEnhancedVersion.keyEnhancements.every(e => e.actionableStepsForCodingAgent)) {
      return result;
    }
    console.error("LLM response for repo analysis did not match expected blueprint structure:", result);
    throw new Error("Incomplete or malformed blueprint from LLM for repo content.");
  } catch (err) {
    console.error("Failed to parse LLM response for repo analysis as JSON. Raw output:\n", content);
    throw new Error("Failed to parse LLM response for repo analysis as JSON: " + err.message);
  }
}

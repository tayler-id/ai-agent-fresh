/**
 * Context Window Manager
 * 
 * Manages dynamic context window for LLM input by prioritizing, scoring,
 * and compressing memory entries and content to fit within token limits.
 */

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Estimate token count for a given text.
 * This is a simple heuristic: 1 token ~ 4 characters.
 * @param {string} text 
 * @returns {number} estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Prioritize memory entries by recency (newest first).
 * @param {Array} entries Array of memory entries with timestamp.
 * @returns {Array} Sorted entries by timestamp descending.
 */
function prioritizeEntries(entries) {
  return entries.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Compress content by truncating to maxTokens.
 * In future, can replace with summarization.
 * @param {string} content 
 * @param {number} maxTokens 
 * @returns {string} compressed content
 */
function compressContent(content, maxTokens) {
  const estimatedTokens = estimateTokens(content);
  if (estimatedTokens <= maxTokens) return content;
  // Approximate truncation by characters
  const maxChars = maxTokens * 4;
  return content.substring(0, maxChars) + '...';
}

/**
 * Build a dynamic context window from memory entries and additional content.
 * Prioritizes entries by recency, compresses if needed to fit maxTokens.
 * @param {Array} memoryEntries Array of memory entries (each with summary and timestamp).
 * @param {string} additionalContent Optional additional content to include.
 * @param {number} maxTokens Maximum tokens allowed in context window.
 * @returns {string} Combined context window string.
 */
function buildContextWindow(memoryEntries, additionalContent = '', maxTokens = DEFAULT_MAX_TOKENS) {
  const prioritized = prioritizeEntries(memoryEntries);
  let contextParts = [];
  let tokensUsed = 0;

  for (const entry of prioritized) {
    const summary = entry.summary || '';
    const summaryTokens = estimateTokens(summary);
    if (tokensUsed + summaryTokens > maxTokens) {
      // Stop adding more entries if token limit reached
      break;
    }
    contextParts.push(`- [${entry.timestamp}] ${summary}`);
    tokensUsed += summaryTokens;
  }

  let combinedContext = contextParts.join('\n');
  if (additionalContent) {
    const additionalTokens = estimateTokens(additionalContent);
    if (tokensUsed + additionalTokens > maxTokens) {
      // Compress additional content to fit remaining tokens
      const remainingTokens = maxTokens - tokensUsed;
      combinedContext += '\n\n' + compressContent(additionalContent, remainingTokens);
    } else {
      combinedContext += '\n\n' + additionalContent;
    }
  }

  return combinedContext;
}

export {
  estimateTokens,
  prioritizeEntries,
  compressContent,
  buildContextWindow
};

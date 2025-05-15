/**
 * embeddingProvider.js
 * 
 * EmbeddingProvider implementation using OpenAI API for text embedding.
 * 
 * Requires: npm install node-fetch
 */

import fetch from 'node-fetch';
// fs and path were imported in the original but not used by this class. Removed for cleanliness.

class EmbeddingProvider {
  /**
   * @param {object} config - { openaiApiKey: string, model?: string }
   */
  constructor(config = {}) { 
    if (config.openaiApiKey) {
      this.apiKey = config.openaiApiKey;
    } else {
      this.apiKey = process.env.OPENAI_API_KEY;
    }

    if (!this.apiKey) {
      // For server-side Next.js, process.env is populated from .env.local (or other .env files)
      // For client-side, env vars need to be prefixed with NEXT_PUBLIC_
      // Since this is for the /api route (server-side), process.env.OPENAI_API_KEY should work if set in .env.local
      console.error("OpenAI API key not provided in constructor config and not found in OPENAI_API_KEY environment variable for UI backend.");
      throw new Error("OpenAI API key not configured for UI backend embedding provider.");
    }
    
    this.model = config.model || "text-embedding-ada-002";
  }

  /**
   * Generate an embedding for a given text using OpenAI API.
   * @param {string} text 
   * @returns {Promise<Array<number>>}
   */
  async embed(text) {
    const endpoint = "https://api.openai.com/v1/embeddings";
    const body = {
      input: text,
      model: this.model
    };
    
    console.log(`[EmbeddingProvider UI] Requesting embedding for text (length: ${text.length}) using model ${this.model}`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[EmbeddingProvider UI] OpenAI embedding error: ${res.status} - ${errText}`);
      throw new Error(`OpenAI embedding error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      console.error("[EmbeddingProvider UI] No embedding returned from OpenAI. Response:", data);
      throw new Error("No embedding returned from OpenAI");
    }
    return data.data[0].embedding;
  }
}

export default EmbeddingProvider;

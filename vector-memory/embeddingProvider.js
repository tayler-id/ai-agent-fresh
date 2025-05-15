/**
 * embeddingProvider.js
 * 
 * EmbeddingProvider implementation using OpenAI API for text embedding.
 * 
 * Requires: npm install node-fetch
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

class EmbeddingProvider {
  /**
   * @param {object} config - { openaiApiKey: string, model?: string }
   */
  constructor(config = {}) { // Added default empty object for config
    // Prioritize API key passed in constructor config, then directly from process.env
    if (config.openaiApiKey) {
      this.apiKey = config.openaiApiKey;
    } else {
      this.apiKey = process.env.OPENAI_API_KEY;
    }

    if (!this.apiKey) {
      throw new Error("OpenAI API key not provided in constructor config and not found in OPENAI_API_KEY environment variable.");
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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embedding error: ${res.status} ${err}`);
    }
    const data = await res.json();
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error("No embedding returned from OpenAI");
    }
    return data.data[0].embedding;
  }
}

export default EmbeddingProvider;

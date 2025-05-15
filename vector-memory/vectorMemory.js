/**
 * vectorMemory.js
 * 
 * Implementation for ChromaDB backend with OpenAI embedding.
 */

import EmbeddingProvider from './embeddingProvider.js';
import {
  chromaAdd,
  chromaSearch,
  chromaDelete,
  chromaList
} from './chromaClient.js';
import fs from 'fs';

class VectorMemory {
  /**
   * @param {object} config - { backend, embeddingProvider, openaiApiKey, chroma }
   */
  constructor(config) {
    this.config = config;
    this.collection = config.chroma?.collection || 'ai-agent-memory';
    this.embeddingProvider = new EmbeddingProvider(config);
  }

  /**
   * Add a memory entry with embedding.
   * @param {string} id - Unique identifier for the entry.
   * @param {string} text - The text to embed and store.
   * @param {object} metadata - Additional metadata (type, tags, etc.).
   * @returns {Promise<void>}
   */
  async addEntry(id, text, metadata = {}) {
    const embedding = await this.embeddingProvider.embed(text);
    await chromaAdd(this.collection, [id], [embedding], [metadata]);
  }

  /**
   * Search for similar entries using a query string.
   * @param {string} query - The search query.
   * @param {number} topK - Number of top results to return.
   * @returns {Promise<Array<{id: string, score: number, metadata: object}>>}
   */
  async search(query, topK = 5) {
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const results = await chromaSearch(this.collection, queryEmbedding, topK);
    // Chroma returns {ids, distances, metadatas}
    if (!results.ids || !results.ids[0]) return [];
    return results.ids[0].map((id, i) => ({
      id,
      score: results.distances[0][i],
      metadata: results.metadatas[0][i]
    }));
  }

  /**
   * Delete a memory entry by ID.
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async deleteEntry(id) {
    await chromaDelete(this.collection, id);
  }

  /**
   * List all entries (for debugging/visualization).
   * @returns {Promise<Array<{id: string, metadata: object}>>}
   */
  async listEntries() {
    const results = await chromaList(this.collection);
    if (!results.ids) return [];
    return results.ids.map((id, i) => ({
      id,
      metadata: results.metadatas[i]
    }));
  }
}

export default VectorMemory;

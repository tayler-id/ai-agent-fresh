/**
 * lanceVectorMemory.js
 * 
 * Vector memory implementation using LanceDB and OpenAI embeddings.
 * Requires: npm install @lancedb/lancedb apache-arrow node-fetch
 */

import EmbeddingProvider from './embeddingProvider.js';
import {
  connectLanceDB,
  ensureSemanticMemoryTable,
  insertSemanticMemory,
  querySemanticMemory
} from '../src/lancedb.js';

class LanceVectorMemory {
  /**
   * @param {object} config - { openaiApiKey, model, lanceOptions }
   */
  constructor(config) {
    this.config = config;
    this.embeddingProvider = new EmbeddingProvider(config);
    this.db = null;
    this.ready = false;
  }

  /**
   * Initialize LanceDB connection and ensure table exists.
   */
  async init() {
    if (this.ready) return;
    this.db = await connectLanceDB();
    await ensureSemanticMemoryTable(this.db);
    this.ready = true;
  }

  /**
   * Add a memory entry with embedding and metadata.
   * @param {string} id - Unique identifier for the entry.
   * @param {string} text - The text to embed and store.
   * @param {object} metadata - Additional metadata (should include required LanceDB fields).
   * @returns {Promise<void>}
   */
  async addEntry(id, text, metadata = {}) {
    await this.init();
    const embedding = await this.embeddingProvider.embed(text);
    // Compose entry for LanceDB schema
    const entry = {
      vector: embedding,
      text_chunk: text,
      source_id: metadata.source_id || id,
      content_type: metadata.content_type || 'text',
      chunk_index: metadata.chunk_index || 0,
      line_start: metadata.line_start || 0,
      line_end: metadata.line_end || 0,
      timestamp: metadata.timestamp || new Date().toISOString(),
      project_id: metadata.project_id || 'default',
      session_id: metadata.session_id || 'default'
    };
    console.log("[LanceVectorMemory] Adding entry:", JSON.stringify(entry, null, 2));
    await insertSemanticMemory(this.db, entry);
  }

  /**
   * Search for similar entries using a query string.
   * @param {string} query - The search query.
   * @param {number} topK - Number of top results to return.
   * @param {object} filter - Optional metadata filter.
   * @returns {Promise<Array<{text_chunk: string, score: number, metadata: object}>>}
   */
  async search(query, topK = 5, filter = {}) {
    await this.init();
    const queryEmbedding = await this.embeddingProvider.embed(query);
    console.log("[LanceVectorMemory] Searching with embedding:", queryEmbedding);
    let results = await querySemanticMemory(this.db, queryEmbedding, topK, filter);
    // Properly materialize the RecordBatchIterator if needed
    if (typeof results[Symbol.asyncIterator] === 'function') {
      // It's an iterator, materialize all batches
      let allRows = [];
      for await (const batch of results) {
        for (let i = 0; i < batch.numRows; i++) {
          const row = {};
          for (const col of batch.schema.fields) {
            row[col.name] = batch.get(col.name).get(i);
          }
          allRows.push({
            text_chunk: row.text_chunk,
            score: row._distance !== undefined ? row._distance : null,
            metadata: row
          });
        }
      }
      console.log("[LanceVectorMemory] Final search output (materialized):", allRows);
      return allRows;
    } else {
      // Assume it's an Arrow Table
      const output = [];
      for (let i = 0; i < results.numRows; i++) {
        const row = {};
        for (const col of results.schema.fields) {
          row[col.name] = results.get(col.name).get(i);
        }
        output.push({
          text_chunk: row.text_chunk,
          score: row._distance !== undefined ? row._distance : null,
          metadata: row
        });
      }
      console.log("[LanceVectorMemory] Final search output:", output);
      return output;
    }
  }

  /**
   * Delete a memory entry by ID.
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async deleteEntry(id) {
    // Not implemented: LanceDB delete API would be needed
    throw new Error('deleteEntry not implemented for LanceDB');
  }

  /**
   * List all entries (for debugging/visualization).
   * @returns {Promise<Array<{text_chunk: string, metadata: object}>>}
   */
  async listEntries() {
    await this.init();
    // Try a direct scan/iteration over all rows in the table
    const table = await this.db.openTable("semantic_memory");
    let allRows = [];
    for await (const batch of table.scan()) {
      for (let i = 0; i < batch.numRows; i++) {
        const row = {};
        for (const col of batch.schema.fields) {
          row[col.name] = batch.get(col.name).get(i);
        }
        allRows.push({
          text_chunk: row.text_chunk,
          metadata: row
        });
      }
    }
    console.log("[LanceVectorMemory] All entries via table scan:", allRows);
    return allRows;
  }
}

export default LanceVectorMemory;

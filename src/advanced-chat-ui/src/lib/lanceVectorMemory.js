/**
 * lanceVectorMemory.js
 * 
 * Vector memory implementation using LanceDB and OpenAI embeddings.
 * Requires: npm install @lancedb/lancedb apache-arrow node-fetch
 */

import EmbeddingProvider from './embeddingProvider.js'; // Adjusted path
import {
  connectLanceDB,
  ensureSemanticMemoryTable,
  insertSemanticMemory,
  querySemanticMemory
} from './lancedb.js'; // Adjusted path

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
    // For UI, LanceDB path will be relative to UI project root (e.g., src/advanced-chat-ui/vector-memory/lancedb-data)
    // The connectLanceDB function in the copied lancedb.js will need to handle this.
    this.db = await connectLanceDB('vector-memory/lancedb-data'); // Pass UI-specific path if needed, or let lancedb.js handle it
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
      project_id: metadata.project_id || 'default-ui-project', // UI specific project_id
      session_id: metadata.session_id || 'default-ui-session'  // UI specific session_id
    };
    console.log("[LanceVectorMemory UI] Adding entry:", JSON.stringify(entry, null, 2));
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
    console.log("[LanceVectorMemory UI] Searching with embedding (first 5 dims):", queryEmbedding.slice(0,5));
    let results = await querySemanticMemory(this.db, queryEmbedding, topK, filter); // This now returns an array
    
    if (Array.isArray(results)) {
        console.log(`[LanceVectorMemory UI] Found ${results.length} results (from direct array).`);
        return results.map(row => ({
            text_chunk: row.text_chunk,
            score: row._distance !== undefined ? row._distance : null, // LanceDB uses _distance for similarity
            metadata: row 
        }));
    } else {
        // This case should ideally not be hit if querySemanticMemory behaves as expected.
        console.warn("[LanceVectorMemory UI] Search returned unexpected result format (expected array):", results);
        // Attempt to handle potential async iterator or Arrow Table as a fallback, though less likely now.
        if (results && typeof results[Symbol.asyncIterator] === 'function') {
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
            console.log(`[LanceVectorMemory UI] Found ${allRows.length} results (materialized from iterator fallback).`);
            return allRows;
        } else if (results && results.numRows !== undefined) { 
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
            console.log(`[LanceVectorMemory UI] Found ${output.length} results (from Arrow Table fallback).`);
            return output;
        }
        return []; // Return empty if still unhandled
    }
  }

  /**
   * Delete a memory entry by ID.
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async deleteEntry(id) {
    // Not implemented: LanceDB delete API would be needed
    console.warn(`[LanceVectorMemory UI] deleteEntry for ID '${id}' not implemented.`);
    throw new Error('deleteEntry not implemented for LanceDB');
  }

  /**
   * List all entries (for debugging/visualization).
   * @returns {Promise<Array<{text_chunk: string, metadata: object}>>}
   */
  async listEntries() {
    await this.init();
    const table = await this.db.openTable("semantic_memory");
    let allRows = [];
    // LanceDB scan() returns an async iterator of RecordBatches
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
    console.log(`[LanceVectorMemory UI] Listed ${allRows.length} entries via table scan.`);
    return allRows;
  }
}

export default LanceVectorMemory;

import lancedb from "@lancedb/lancedb";
import path from "path";
import { FixedSizeList, Field, Float32, Utf8, Int32 } from "apache-arrow";

// LanceDB database location (can be configured)
console.log("[LanceDB] process.cwd():", process.cwd());
const DB_PATH = path.resolve(process.cwd(), "vector-memory", "lancedb-data");
console.log("[LanceDB] DB_PATH:", DB_PATH);

// Example schema for semantic memory
// Each row: { vector: Float32Array, text_chunk: string, source_id: string, content_type: string, chunk_index: number, line_start: number, line_end: number, timestamp: string, project_id: string, session_id: string }
const DEFAULT_TABLE = "semantic_memory";

// Connect to LanceDB (creates DB if not exists)
export async function connectLanceDB() {
  const db = await lancedb.connect(DB_PATH);
  return db;
}

export async function ensureSemanticMemoryTable(db) {
  // Try to open the table; only create if error indicates "not found"
  try {
    const table = await db.openTable(DEFAULT_TABLE);
    const schema = await table.schema();
    console.log("[LanceDB] Opened semantic_memory table. Schema:", schema);
    if (schema && schema.fields) {
      console.log("[LanceDB] Schema fields:", schema.fields.map(f => `${f.name}:${f.type}`));
    } else {
      console.log("[LanceDB] Schema fields are undefined!");
    }
  } catch (err) {
    // Only create if error message indicates table does not exist
    if (
      err.message &&
      (err.message.includes("not found") ||
        err.message.includes("does not exist") ||
        err.message.includes("No such table"))
    ) {
      console.log("[LanceDB] Creating semantic_memory table with 1536-dim vector...");
      await db.createTable({
        name: DEFAULT_TABLE,
        schema: {
          fields: [
            { name: "vector", type: new FixedSizeList(1536, new Field("item", new Float32(), false)), nullable: false },
            { name: "text_chunk", type: new Utf8(), nullable: false },
            { name: "source_id", type: new Utf8(), nullable: false },
            { name: "content_type", type: new Utf8(), nullable: false },
            { name: "chunk_index", type: new Int32(), nullable: false },
            { name: "line_start", type: new Int32(), nullable: false },
            { name: "line_end", type: new Int32(), nullable: false },
            { name: "timestamp", type: new Utf8(), nullable: false },
            { name: "project_id", type: new Utf8(), nullable: false },
            { name: "session_id", type: new Utf8(), nullable: false }
          ]
        },
        data: []
      });
      const table = await db.openTable(DEFAULT_TABLE);
      const schema = await table.schema();
      if (schema && schema.fields) {
        console.log("[LanceDB] Created semantic_memory table. Schema fields:", schema.fields.map(f => `${f.name}:${f.type}`));
      } else {
        console.log("[LanceDB] Created semantic_memory table. Schema fields are undefined!");
      }
    } else {
      // Rethrow if error is not "table not found"
      throw err;
    }
  }
}

// Insert a vector and metadata into the semantic memory table
export async function insertSemanticMemory(db, entry) {
  const table = await db.openTable(DEFAULT_TABLE);
  await table.add([entry]);
}

// Query LanceDB for nearest neighbors (vector similarity), with optional metadata filter
export async function querySemanticMemory(db, queryVector, k = 5, filter = {}) {
  const table = await db.openTable(DEFAULT_TABLE);
  let q = table.search(queryVector).limit(k);
  // Apply metadata filters if provided
  for (const [key, value] of Object.entries(filter)) {
    q = q.where(`${key} == "${value}"`);
  }
  const results = await q.execute();
  return results;
}

// Update or delete entries as needed (to be implemented as needed)

export default {
  connectLanceDB,
  ensureSemanticMemoryTable,
  insertSemanticMemory,
  querySemanticMemory
};

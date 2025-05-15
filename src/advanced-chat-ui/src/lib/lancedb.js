import * as lancedb from "@lancedb/lancedb";
import path from "path";
import { FixedSizeList, Field, Float32, Utf8, Int32 } from "apache-arrow";

const DEFAULT_DB_PATH_SUFFIX = "vector-memory/lancedb-data";
const DEFAULT_TABLE = "semantic_memory";

// Connect to LanceDB (creates DB if not exists)
// Accepts an optional suffix for the DB path, relative to process.cwd()
export async function connectLanceDB(dbPathSuffix = DEFAULT_DB_PATH_SUFFIX) {
  const resolvedDbPath = path.resolve(process.cwd(), dbPathSuffix);
  console.log(`[LanceDB UI] Attempting to connect to DB at: ${resolvedDbPath}`);
  // Ensure the directory exists before connecting, lancedb.connect might expect it.
  // However, lancedb.connect itself creates the directory if it doesn't exist.
  // For clarity, we can add fs.mkdir if issues arise, but usually not needed.
  // await fs.promises.mkdir(path.dirname(resolvedDbPath), { recursive: true }); // Potentially needed if connect fails on non-existent parent
  const db = await lancedb.connect(resolvedDbPath);
  console.log(`[LanceDB UI] Connected to DB at: ${resolvedDbPath}`);
  return db;
}

export async function ensureSemanticMemoryTable(db) {
  try {
    const table = await db.openTable(DEFAULT_TABLE);
    const schema = await table.schema();
    console.log("[LanceDB UI] Opened semantic_memory table. Schema fields:", schema.fields.map(f => `${f.name}:${f.type}`));
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("not found") ||
        err.message.includes("does not exist") ||
        err.message.includes("No such table"))
    ) {
      console.log("[LanceDB UI] Creating semantic_memory table with 1536-dim vector...");
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
        mode: "create", // Explicitly set mode, though 'create' is often default
        data: [] // Provide an empty array for initial data
      });
      const table = await db.openTable(DEFAULT_TABLE);
      const schema = await table.schema();
      console.log("[LanceDB UI] Created semantic_memory table. Schema fields:", schema.fields.map(f => `${f.name}:${f.type}`));
    } else {
      console.error("[LanceDB UI] Error ensuring semantic_memory table:", err);
      throw err;
    }
  }
}

export async function insertSemanticMemory(db, entry) {
  const table = await db.openTable(DEFAULT_TABLE);
  await table.add([entry]);
}

export async function querySemanticMemory(db, queryVector, k = 5, filter = {}) {
  const table = await db.openTable(DEFAULT_TABLE);
  let q = table.search(queryVector).limit(k);
  for (const [key, value] of Object.entries(filter)) {
    q = q.where(`${key} = "${value}"`);
  }
  const results = await q.toArray();
  return results;
}

export default {
  connectLanceDB,
  ensureSemanticMemoryTable,
  insertSemanticMemory,
  querySemanticMemory
};

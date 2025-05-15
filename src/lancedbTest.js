import { connectLanceDB, ensureSemanticMemoryTable, insertSemanticMemory, querySemanticMemory } from './lancedb.js';

async function testLanceDB() {
  try {
    const db = await connectLanceDB();
    console.log('Connected to LanceDB.');

    // Skip table creation if it already exists
    try {
      await ensureSemanticMemoryTable(db);
      console.log('Ensured semantic memory table exists.');
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("Table already exists, skipping creation.");
      } else {
        throw e;
      }
    }

    // Example entry to insert
    const exampleEntry = {
      vector: [0.1, 0.2, 0.3],
      text_chunk: 'Example text chunk for testing LanceDB integration.',
      source_id: 'test_source',
      content_type: 'test',
      chunk_index: 1,
      line_start: 0,
      line_end: 0,
      timestamp: new Date().toISOString(),
      project_id: 'test_project',
      session_id: 'test_session'
    };

    await insertSemanticMemory(db, exampleEntry);
    console.log('Inserted example semantic memory entry.');

    // Query with a similar vector
    const queryVector = new Float32Array([0.1, 0.2, 0.25]);
    const results = await querySemanticMemory(db, queryVector, 3);

    // Debug: log type and structure of results
    console.log('Type of results:', typeof results);
    if (results && typeof results === 'object') {
      console.log('Result constructor:', results.constructor?.name);
      console.log('Result keys:', Object.keys(results));
    }

    // Try to inspect the result of results.next()
    if (results && typeof results.next === 'function') {
      const first = results.next();
      if (first && typeof first.then === 'function') {
        // It's a Promise, so await it
        const awaited = await first;
        console.log('Awaited first result:', JSON.stringify(awaited, null, 2));
        if (awaited && awaited.value && typeof awaited.value === 'object') {
          const batch = awaited.value;
          const numRows = batch.length ?? batch.numRows ?? 0;
          const rows = [];
          for (let i = 0; i < numRows; i++) {
            const row = {};
            if (batch.schema && batch.schema.fields && batch.getChildAt) {
              batch.schema.fields.forEach((field, idx) => {
                row[field.name] = batch.getChildAt(idx).get(i);
              });
            }
            rows.push(row);
          }
          console.log('Query results (rows):', JSON.stringify(rows, null, 2));
        }
      } else {
        console.log('First result of results.next():', JSON.stringify(first, null, 2));
      }
    } else if (results && typeof results.toArray === 'function') {
      const arr = await results.toArray();
      console.log('Query results (toArray):', JSON.stringify(arr, null, 2));
    } else if (results && typeof results.toJSON === 'function') {
      const arr = results.toJSON();
      console.log('Query results (toJSON):', JSON.stringify(arr, null, 2));
    } else if (Array.isArray(results)) {
      console.log('Query results (array):', JSON.stringify(results, null, 2));
    } else if (results && Array.isArray(results.data)) {
      console.log('Query results (data array):', JSON.stringify(results.data, null, 2));
    } else {
      console.log('Query results (raw):', JSON.stringify(results, null, 2));
    }

  } catch (error) {
    console.error('Error during LanceDB test:', error);
  }
}

testLanceDB();

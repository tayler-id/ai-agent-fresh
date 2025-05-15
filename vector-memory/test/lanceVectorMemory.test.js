/**
 * lanceVectorMemory.test.js
 * 
 * Integration test for LanceVectorMemory (LanceDB + OpenAI embeddings).
 * 
 * NOTE: Set OPENAI_API_KEY in your environment or config for real embedding.
 */

import LanceVectorMemory from '../lanceVectorMemory.js';

const config = {
  model: 'text-embedding-ada-002'
};

async function runTest() {
  const vm = new LanceVectorMemory(config);

  // Add entries
  console.log('Adding entries...');
  await vm.addEntry('id1', 'The quick brown fox jumps over the lazy dog', {
    source_id: 'doc1',
    content_type: 'sentence',
    chunk_index: 0,
    project_id: 'test',
    session_id: 'test-session'
  });
  await vm.addEntry('id2', 'A fast brown fox leaps over a sleepy dog', {
    source_id: 'doc2',
    content_type: 'sentence',
    chunk_index: 1,
    project_id: 'test',
    session_id: 'test-session'
  });
  await vm.addEntry('id3', 'Completely unrelated text about the weather', {
    source_id: 'doc3',
    content_type: 'sentence',
    chunk_index: 2,
    project_id: 'test',
    session_id: 'test-session'
  });

  // Search for similar entries
  console.log('\nSemantic search for: "brown fox"');
  const results = await vm.search('brown fox', 3);
  console.log(JSON.stringify(results, null, 2));

  // List all entries
  console.log('\nAll entries in LanceDB:');
  const allEntries = await vm.listEntries();
  console.log(JSON.stringify(allEntries, null, 2));
}

runTest().catch(err => {
  console.error('Test failed:', err);
});

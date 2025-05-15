import fs from 'fs/promises';
import path from 'path';

const MEMORY_FILE = path.resolve('memory-store.json');

/**
 * Load all memory entries from disk.
 * @returns {Promise<Array>} Array of memory entries.
 */
async function loadMemory() {
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Save memory entries to disk.
 * @param {Array} entries Array of memory entries to save.
 */
async function saveMemory(entries) {
  await fs.writeFile(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Add a new memory entry.
 * @param {string} type Type of context ('youtube', 'repo', 'local').
 * @param {string} key Identifier for the context (URL or path).
 * @param {string} summary Short summary of what was learned.
 */
async function addMemoryEntry(type, key, summary) {
  const entries = await loadMemory();
  entries.push({
    type,
    key,
    summary,
    timestamp: new Date().toISOString()
  });
  await saveMemory(entries);
}

/**
 * Retrieve relevant memory entries. If a key is provided, filters by that key.
 * Otherwise, returns the most recent entries across all keys.
 * @param {string | null | undefined} key Context identifier to filter by (URL or path). Optional.
 * @param {number} [maxEntries=5] Maximum number of entries to return.
 * @returns {Promise<Array>} Array of matching memory entries, sorted by recency.
 */
async function getRelevantMemory(key, maxEntries = 5) {
  const entries = await loadMemory();
  let filtered = entries;
  if (key !== undefined && key !== null) { // Check if key is provided for filtering
    filtered = entries.filter(e => e.key === key);
  }
  // Sort by timestamp descending to get recent entries if no key or after filtering
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return filtered.slice(0, maxEntries);
}

export {
  loadMemory,
  saveMemory,
  addMemoryEntry,
  getRelevantMemory
};

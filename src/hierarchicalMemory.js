/**
 * Hierarchical Memory Module
 * 
 * Implements a multi-level memory system for the ai-agent.
 * Supports session-level, project-level, and global memory layers.
 * Stores and retrieves contextual information with granularity.
 */

import fs from 'fs/promises';
import path from 'path';

const MEMORY_DIR = path.resolve('memory-hierarchy');
const SESSION_FILE = path.join(MEMORY_DIR, 'session-memory.json');
const PROJECT_FILE = path.join(MEMORY_DIR, 'project-memory.json');
const GLOBAL_FILE = path.join(MEMORY_DIR, 'global-memory.json');

async function ensureMemoryDir() {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }
}

async function loadMemoryFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveMemoryFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Session Memory
async function loadSessionMemory() {
  await ensureMemoryDir();
  return loadMemoryFile(SESSION_FILE);
}

async function saveSessionMemory(entries) {
  await ensureMemoryDir();
  return saveMemoryFile(SESSION_FILE, entries);
}

// Project Memory
async function loadProjectMemory() {
  await ensureMemoryDir();
  return loadMemoryFile(PROJECT_FILE);
}

async function saveProjectMemory(entries) {
  await ensureMemoryDir();
  return saveMemoryFile(PROJECT_FILE, entries);
}

// Global Memory
async function loadGlobalMemory() {
  await ensureMemoryDir();
  return loadMemoryFile(GLOBAL_FILE);
}

async function saveGlobalMemory(entries) {
  await ensureMemoryDir();
  return saveMemoryFile(GLOBAL_FILE, entries);
}

// Add entry to a specific memory layer
async function addMemoryEntry(layer, entry) {
  let loadFunc, saveFunc;
  switch (layer) {
    case 'session':
      loadFunc = loadSessionMemory;
      saveFunc = saveSessionMemory;
      break;
    case 'project':
      loadFunc = loadProjectMemory;
      saveFunc = saveProjectMemory;
      break;
    case 'global':
      loadFunc = loadGlobalMemory;
      saveFunc = saveGlobalMemory;
      break;
    default:
      throw new Error(`Unknown memory layer: ${layer}`);
  }
  const entries = await loadFunc();
  entries.push({ ...entry, timestamp: new Date().toISOString() });
  await saveFunc(entries);
}

// Retrieve entries from a specific memory layer, optionally filtered by key
async function getMemoryEntries(layer, key = null, maxEntries = 10) {
  let loadFunc;
  switch (layer) {
    case 'session':
      loadFunc = loadSessionMemory;
      break;
    case 'project':
      loadFunc = loadProjectMemory;
      break;
    case 'global':
      loadFunc = loadGlobalMemory;
      break;
    default:
      throw new Error(`Unknown memory layer: ${layer}`);
  }
  const entries = await loadFunc();
  let filtered = entries;
  if (key) {
    filtered = entries.filter(e => e.key === key);
  }
  return filtered.slice(-maxEntries);
}

export {
  addMemoryEntry,
  getMemoryEntries,
  loadSessionMemory,
  saveSessionMemory,
  loadProjectMemory,
  saveProjectMemory,
  loadGlobalMemory,
  saveGlobalMemory
};

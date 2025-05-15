/**
 * chromaClient.js
 * 
 * Thin wrapper for connecting to a local ChromaDB instance using the chromadb Python package via child_process.
 * Provides methods to add, search, and delete vectors in a collection.
 * 
 * This version uses Python scripts for ChromaDB operations, called from Node.js.
 */

import { spawn } from 'child_process';
import path from 'path';

const PYTHON_SCRIPT = path.resolve('ai-agent/vector-memory/chroma_bridge.py');

function runPythonScript(args, input = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [PYTHON_SCRIPT, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve(stdout.trim());
        }
      } else {
        reject(new Error(stderr.trim() || `Python script exited with code ${code}`));
      }
    });
    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

export async function chromaAdd(collection, ids, embeddings, metadatas) {
  return runPythonScript(['add', collection], JSON.stringify({ ids, embeddings, metadatas }));
}

export async function chromaSearch(collection, queryEmbedding, topK = 5) {
  return runPythonScript(['search', collection, topK.toString()], JSON.stringify({ queryEmbedding }));
}

export async function chromaDelete(collection, id) {
  return runPythonScript(['delete', collection, id]);
}

export async function chromaList(collection) {
  return runPythonScript(['list', collection]);
}

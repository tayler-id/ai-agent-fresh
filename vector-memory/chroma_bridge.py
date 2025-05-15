"""
chroma_bridge.py

Python bridge for ChromaDB operations, called from Node.js via child_process.
Supports add, search, delete, and list operations for a given collection.

Requires: chromadb (pip install chromadb)
"""

import sys
import json
import chromadb
from chromadb.config import Settings

def get_client():
    return chromadb.Client(Settings(
        chroma_db_impl="duckdb+parquet",
        persist_directory="./chroma-data"
    ))

def add(collection_name, ids, embeddings, metadatas):
    client = get_client()
    col = client.get_or_create_collection(collection_name)
    col.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas
    )
    print(json.dumps({"status": "ok"}))

def search(collection_name, query_embedding, top_k):
    client = get_client()
    col = client.get_or_create_collection(collection_name)
    results = col.query(
        query_embeddings=[query_embedding],
        n_results=top_k
    )
    print(json.dumps(results))

def delete(collection_name, id):
    client = get_client()
    col = client.get_or_create_collection(collection_name)
    col.delete(ids=[id])
    print(json.dumps({"status": "ok"}))

def list_entries(collection_name):
    client = get_client()
    col = client.get_or_create_collection(collection_name)
    # Chroma does not have a direct "list all" API, so we use get() with no filters
    results = col.get()
    print(json.dumps(results))

def main():
    if len(sys.argv) < 3:
        print("Usage: chroma_bridge.py <add|search|delete|list> <collection> [args...]", file=sys.stderr)
        sys.exit(1)
    op = sys.argv[1]
    collection = sys.argv[2]
    if op == "add":
        data = json.load(sys.stdin)
        add(collection, data["ids"], data["embeddings"], data["metadatas"])
    elif op == "search":
        top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        data = json.load(sys.stdin)
        search(collection, data["queryEmbedding"], top_k)
    elif op == "delete":
        id = sys.argv[3]
        delete(collection, id)
    elif op == "list":
        list_entries(collection)
    else:
        print(f"Unknown operation: {op}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

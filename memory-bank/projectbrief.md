# Project Brief: AI Agent for Content Analysis & Personalized Assistance

## 1. Project Title
AI Agent for YouTube, GitHub, and Local Project Analysis with Semantic Memory and Personalized Context

## 2. Project Goal
To develop a sophisticated Node.js command-line AI agent capable of analyzing content from YouTube videos (via transcripts), public/private GitHub repositories, and local file system projects. The agent leverages Large LanguageModels (LLMs) like DeepSeek to understand content, generate detailed "Improvement and Re-implementation Blueprints," and utilizes multiple memory systems (including semantic vector search with LanceDB and hierarchical file-based memory) and developer profiles to provide personalized and context-aware assistance. The project also includes a web-based UI for memory and profile visualization/management.

## 3. Core Requirements

### 3.1. Input Handling & Content Sourcing:
    -   Accept YouTube video URLs, public/private GitHub repository URLs (with PAT support), and local file system paths via CLI.
    -   **YouTube Analysis (`src/youtube.js`):**
        -   Fetch video transcripts (currently using `youtube-transcript-plus`, with potential for MCP tool integration).
    -   **GitHub Repository Analysis (`src/github.js`):**
        -   Parse GitHub URLs to identify owner and repository.
        -   Clone repositories locally into a temporary directory (supports `GITHUB_PAT`).
        -   Extract and concatenate content from key files (READMEs, package manifests, selected source files, `memory-bank/*.md` files).
        -   Support for `.agentinclude` file within repositories to prioritize specific files/paths for analysis.
        -   Implement configurable limits for content size and file scanning.
    -   **Local Project Analysis (`src/agent.js`, `src/github.js`):**
        -   Similar content extraction logic as GitHub, including `.agentinclude` support and basic project type hinting.

### 3.2. LLM Integration & Analysis (`src/llm.js`):
    -   Interact with LLM APIs (primarily DeepSeek, configurable) for content analysis.
    -   Generate detailed "Improvement and Re-implementation Blueprints" in JSON format, covering:
        -   Original project summary (purpose, core mechanics).
        -   Suggested enhanced version (concept, key enhancements with actionable steps, tech stack, critical files, boilerplate, gap analysis).
    -   Support follow-up questions and blueprint refinements based on initial analysis.
    -   Manage API keys via environment variables (`DEEPSEEK_API_KEY`) and `config.json`.

### 3.3. Output & Prompt Generation (`src/promptGenerator.js`):
    -   Format LLM JSON blueprints into:
        -   Detailed Markdown files.
        -   Concise console prompts.
    -   Save generated blueprints to a configurable `output/` directory.

### 3.4. Memory Systems:
    -   **Simple Key-Value Memory (`src/memory.js`):**
        -   Store basic summaries against URLs/paths in `memory-store.json` for quick recall.
    -   **Hierarchical File-Based Memory (`src/hierarchicalMemory.js`):**
        -   Manage session-level, project-level, and global memory layers.
        -   Store structured entries in separate JSON files within `memory-hierarchy/`.
    -   **Semantic Vector Memory (LanceDB):**
        -   `src/lancedb.js`: Low-level interface for LanceDB.
        -   `vector-memory/lanceVectorMemory.js`: High-level class for adding text entries with embeddings and performing semantic searches.
        -   `vector-memory/embeddingProvider.js`: Generate text embeddings using OpenAI API (e.g., `text-embedding-ada-002`).
        -   Store embeddings and associated metadata (text chunk, source, content type, project/session IDs) in LanceDB.

### 3.5. Developer Personalization:
    -   **Developer Profiles (`src/developerProfile.js`):**
        -   Load, save, and update personalized developer profiles (coding patterns, preferences) stored as JSON files in `developer-profiles/`.
        -   Incorporate profile information into LLM context and agent behavior.
    -   **Context Window Management (`src/contextWindowManager.js`):**
        -   Dynamically build context for LLM prompts by prioritizing recent memory entries (from various memory systems) and developer profile information.
        -   Compress content if necessary to fit LLM token limits.

### 3.6. System & UI:
    -   **Modularity:** Structure code into logical ES modules.
    -   **Configuration (`config.json`, `src/agent.js`):** Manage settings for LLMs, API keys, file paths, and content processing limits.
    -   **Error Handling:** Implement robust error handling for API calls, file operations, and external processes.
    -   **Resource Management:** Ensure cleanup of temporary files and directories.
    -   **CLI (`src/agent.js`):** Provide clear command-line prompts and feedback.
    -   **Memory Visualization UI (`src/memory-ui/`, `src/agent.js`):**
        -   Backend: Express.js server in `agent.js` providing API endpoints (currently mocked in-memory) for memory and profiles.
        -   Frontend: React application (`src/memory-ui/src/App.js`) to browse, search, filter, edit, and delete memory entries and profiles.
    -   **MCP Client (`src/mcpClient.js`):**
        -   Integrate with Model Context Protocol (MCP) servers to invoke external tools.
        -   Supports connections via HTTP Server-Sent Events (SSE) and direct stdio.
        -   Includes agent-managed lifecycle for designated stdio MCP servers, configured via `config.json`.

## 4. Scope

### 4.1. Current Implemented & Core Features:
    -   CLI for YouTube, GitHub (public/private with PAT), and local project analysis.
    -   LLM-based generation of detailed "Improvement and Re-implementation Blueprints."
    -   Multiple memory systems: simple key-value, hierarchical file-based, and LanceDB-backed semantic vector memory with OpenAI embeddings.
    -   Developer profile management for personalization.
    -   Dynamic context window construction for LLMs.
    -   Basic Memory Visualization UI (React frontend with mock backend API in `agent.js`).
    -   Content extraction from repositories/local paths with `.agentinclude` support.
    -   MCP client for potential external tool use.

### 4.2. Immediate Next Steps (Post-Audit):
    -   Fully integrate the Memory Visualization UI backend with the persistent memory systems (`hierarchicalMemory.js`, `lanceVectorMemory.js`, `developerProfile.js`) instead of the current in-memory mock.
    -   Refine and test the end-to-end analysis and memory storage/retrieval workflows.
    -   Enhance error handling and user feedback across all modules.
    -   Begin work on more sophisticated prompt engineering based on combined memory and profile context.

### 4.3. Future Enhancements (Potential):
    -   Advanced agent autonomy and task chaining.
    -   Expanded plugin/tooling ecosystem via MCP.
    -   More sophisticated file selection heuristics and content summarization for context window.
    -   Analysis of other content types.
    -   Interactive refinement of generated blueprints directly via LLM follow-ups.
    -   Cloud deployment and multi-user support.

## 5. Key Stakeholders
    -   Primary User (driving development and testing)
    -   Cline (AI agent assisting with development)

## 6. Success Criteria
    -   The agent successfully analyzes diverse content sources (YouTube, GitHub, local) and generates insightful, actionable blueprints.
    -   Memory systems effectively capture and retrieve relevant context, improving analysis quality and personalization.
    -   Developer profiles demonstrably tailor agent behavior and outputs.
    -   The Memory Visualization UI allows effective management of stored knowledge.
    -   The system is robust, handles errors gracefully, and manages resources efficiently.
    -   Documentation (Memory Bank) accurately reflects the system's capabilities and is kept up-to-date.

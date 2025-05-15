# Technical Context: AI Agent for Content Analysis & Personalized Assistance

## 1. Core Technologies & Environment
-   **Runtime Environment:** Node.js (version specified in `.nvmrc`, likely a recent LTS like 18.x or 20.x).
-   **Programming Language:** JavaScript (ES Modules syntax: `import`/`export`).
-   **Package Manager:** npm (manages dependencies via `package.json` and `package-lock.json`).
-   **Operating System Context:** Developed and primarily tested on macOS, with user's default shell being zsh. PowerShell is also mentioned in relation to environment variable setup in `.clinerules`.

## 2. Key Node.js Core Modules Used
-   **`readline`:** For CLI interactions in `src/agent.js`.
-   **`fs/promises`:** For asynchronous file system operations (directory creation, file read/write, delete) across various modules (`agent.js`, `github.js`, `memory.js`, `hierarchicalMemory.js`, `developerProfile.js`).
-   **`path`:** For platform-independent path manipulation.
-   **`child_process` (`exec` via `util.promisify`):** In `src/github.js` for executing `git clone` commands.
-   **`util` (`promisify`):** Used for converting callback-based functions to Promise-based.
-   **`url` (`fileURLToPath`):** Used in `src/agent.js` for module path resolution.

## 3. Key External Dependencies (Inferred from Imports & Functionality)
    -   **`node-fetch`:** Used in `src/llm.js` and `vector-memory/embeddingProvider.js` for making HTTP requests to DeepSeek and OpenAI APIs.
    -   **`youtube-transcript-plus`:** Used in `src/youtube.js` for fetching YouTube video transcripts.
    -   **`@lancedb/lancedb`:** Used in `src/lancedb.js` for interacting with the LanceDB vector database.
    -   **`apache-arrow`:** Used in `src/lancedb.js` for schema definitions with LanceDB.
    -   **`glob`:** Used in `src/github.js` for file pattern matching during content extraction.
    -   **`express`:** Used in `src/agent.js` to set up the backend API server for the Memory Visualization UI.
    -   **`body-parser`:** Used with Express in `src/agent.js` for parsing JSON request bodies.
    -   **`@modelcontextprotocol/sdk`:** Used in `src/mcpClient.js` for interacting with MCP servers.
    -   **For `src/memory-ui/` (React App):**
        -   `react`, `react-dom`
        -   `axios` (for API calls to the backend)
        -   Likely other standard React development dependencies (e.g., `react-scripts` if Create React App was used).
    -   **For `src/advanced-chat-ui/` (Next.js Chat App):**
        -   `next`: Framework.
        -   `react`, `react-dom`: UI library.
        -   `ai`: Vercel AI SDK core utilities.
        -   `@ai-sdk/react`: Vercel AI SDK React hooks (e.g., `useChat`).
        -   `@ai-sdk/openai`: Vercel AI SDK provider for OpenAI/DeepSeek compatible APIs.
        -   `tailwindcss`: CSS framework.
        -   `glob`: Used by the local copy of `github.js` within this app.

## 4. External Services and APIs
-   **DeepSeek API (`https://api.deepseek.com/v1/chat/completions`):**
    -   One of the primary LLMs for content analysis and blueprint generation.
    -   Requires `DEEPSEEK_API_KEY` (from `.env` or `config.json`).
-   **OpenAI API:**
    -   **Chat Completions (`https://api.openai.com/v1/chat/completions`):**
        -   Alternative LLM provider for content analysis and blueprint generation.
        -   Requires `OPENAI_API_KEY` (from `.env` or `config.json` via `apiKeys.openai` or `openaiApiKey`).
        -   Provider selected based on model name prefix (e.g., "gpt-") in `config.json` settings like `llmModelRepo`.
    -   **Embeddings (`https://api.openai.com/v1/embeddings`):**
        -   Used by `vector-memory/embeddingProvider.js` to generate text embeddings (model `text-embedding-ada-002`).
        -   Requires `OPENAI_API_KEY`.
-   **GitHub:**
    -   Public and private repositories are cloned using the `git` CLI.
    -   `GITHUB_PAT` environment variable or `config.json` entry can be used for private repository access.
-   **YouTube:**
    -   Transcripts fetched via `youtube-transcript-plus`.
-   **Model Context Protocol (MCP) Server (Optional):**
    -   `src/mcpClient.js` connects to an MCP server (default `http://localhost:5000/sse`) to invoke external tools.

## 5. Data Storage
-   **Configuration:** `config.json` for general settings.
-   **Simple Key-Value Memory:** `memory-store.json` (managed by `src/memory.js`).
-   **Hierarchical Memory:** `memory-hierarchy/` directory containing `session-memory.json`, `project-memory.json`, `global-memory.json` (managed by `src/hierarchicalMemory.js`).
-   **Developer Profiles:** `developer-profiles/` directory containing `{developerId}.json` files (managed by `src/developerProfile.js`).
-   **Semantic Vector Memory (LanceDB):** `vector-memory/lancedb-data/` directory (managed by `src/lancedb.js` and `vector-memory/lanceVectorMemory.js`).
-   **Output:** `output/` directory for generated Markdown blueprints.
-   **Temporary Clones:** `temp-clones/` directory for temporarily cloned GitHub repositories.

## 6. Development Setup and Tooling
-   **Version Control:** Git.
-   **`.nvmrc`:** Specifies Node.js version.
    -   **`.npmrc`:** Potential npm configurations (project root `.npmrc` was modified to fix cache issues).
    -   **`package.json` / `package-lock.json`:** Project metadata and dependency management (main project and also for `src/advanced-chat-ui` and `src/memory-ui`).
    -   **CLI Execution:** Main agent run via `node src/agent.js`.
    -   **Memory UI Development (`src/memory-ui/`):** Standard React application setup.
    -   **Advanced Chat UI Development (`src/advanced-chat-ui/`):**
        -   Next.js application using App Router, TypeScript, Tailwind CSS.
        -   Has its own `package.json`, `tsconfig.json`, `next.config.ts`.
        -   Run via `npm run dev` from within `src/advanced-chat-ui/`.
        -   Requires its own `.env.local` file for API keys like `DEEPSEEK_API_KEY`.

## 7. Technical Constraints & Considerations
-   **`git` CLI Dependency:** Essential for GitHub repository analysis. Must be in PATH.
-   **API Key Management:**
    -   Main Agent: Critical for DeepSeek, OpenAI, GitHub PAT. Managed via `.env` at project root and `config.json`.
    -   Advanced Chat UI: Requires its own `.env.local` in `src/advanced-chat-ui/` for `DEEPSEEK_API_KEY` (and potentially others).
-   **Network Connectivity:** Required for API calls, `git clone`, and YouTube transcript fetching.
-   **File System Permissions:** Agent needs permissions for creating/writing/deleting in its operational directories (`output/`, `temp-clones/`, `memory-hierarchy/`, `developer-profiles/`, `vector-memory/lancedb-data/`).
-   **Content & Token Limits:** Configurable limits (`maxTotalContentSize`, `maxSourceFilesToScan`, `maxSourceFileSize`, LLM `maxTokens`) are crucial for performance, cost management, and API constraints.
-   **Error Handling:** Implemented across modules for external processes, API calls, and file operations.
-   **Cross-Platform Compatibility:** Node.js is cross-platform, but `git` CLI availability is a system dependency.
-   **Alternative Implementations:** Presence of `vector-memory/vectorMemory.js` (ChromaDB client) suggests flexibility or evolution in vector store choice.
-   **Shared Code with Nested Next.js App:** Importing modules from the parent project (`ai-agent/src/`) into the nested Next.js app (`src/advanced-chat-ui/`) proved problematic. Current workaround involves copying `github.js` into `src/advanced-chat-ui/src/lib/`. Long-term, a monorepo setup or local package structure would be more maintainable.

## 8. Code Style and Structure
-   **ES Modules:** Consistent use of `import`/`export`.
-   **Modularity:** Code is well-organized into feature-specific modules.
-   **Asynchronous Programming:** `async/await` is used extensively.
-   **Configuration Files:** `config.json` plays a central role in customizing agent behavior.

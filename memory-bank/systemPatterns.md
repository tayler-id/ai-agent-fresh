# System Patterns: AI Agent for Content Analysis & Personalized Assistance

## Core Architecture Overview
The AI agent is a Node.js application with a command-line interface (CLI) for its primary analysis functions and an auxiliary Express.js backend serving a React-based web UI for memory and profile visualization. It processes URLs (YouTube, GitHub) and local paths, interacts with LLMs for deep analysis, and leverages multiple, sophisticated memory systems.

```mermaid
graph TD
    subgraph UserInterfaces
        CLI[User CLI: Input URL/Path]
        WebUI[Web UI: Memory/Profile Management via React App (src/memory-ui)]
        AdvancedChatUI[Advanced Chat UI (src/advanced-chat-ui, Next.js)]
    end

    subgraph BackendAPIs
        ExpressAPI[agent.js: Express API for Memory Vis. UI (Mocked)]
        NextJS_Chat_API[advanced-chat-ui: Next.js API Route (/api/chat)]
    end

    subgraph CoreAgentLogic
        Agent[src/agent.js: Main Orchestrator]
        Config[config.json & Env Vars]
        DevProfile[src/developerProfile.js]
        ContextMgr[src/contextWindowManager.js]
    end

    subgraph ContentProcessingModules
        YouTubeMod[src/youtube.js: Fetch Transcript]
        GitHubMod[src/github.js: Clone & Extract Content]
        LocalPathMod[src/agent.js: Local Path Content Extraction]
    end

    subgraph LLMInteraction
        LLMMod[src/llm.js: DeepSeek/OpenAI API Interaction]
        PromptGen[src/promptGenerator.js: Blueprint Formatting]
    end

    subgraph MemorySystems
        SimpleMem[src/memory.js: memory-store.json]
        HierarchicalMem[src/hierarchicalMemory.js: session/project/global JSONs]
        subgraph SemanticVectorMemory
            LanceVecMem[vector-memory/lanceVectorMemory.js]
            LanceDB[src/lancedb.js: LanceDB Interface]
            EmbeddingMod[vector-memory/embeddingProvider.js: OpenAI Embeddings]
        end
    end
    
    subgraph ExternalServices
        DeepSeek[DeepSeek LLM API (Chat)]
        OpenAI_Chat[OpenAI LLM API (Chat)]
        OpenAI_Embed[OpenAI Embedding API]
        GitHub[GitHub.com]
        YouTube[YouTube Platform]
        MCP[MCP Server (Optional)]
    end

    CLI --> Agent;
    WebUI --> ExpressAPI;
    AdvancedChatUI --> NextJS_Chat_API;
    
    Agent -- Loads --> Config;
    Agent -- Uses --> DevProfile;
    Agent -- Uses --> ContextMgr;
    Agent -- RoutesTo --> YouTubeMod;
    Agent -- RoutesTo --> GitHubMod;
    Agent -- Handles --> LocalPathMod;
    
    YouTubeMod -- Transcript --> LLMMod;
    GitHubMod -- RepoContent --> LLMMod;
    LocalPathMod -- LocalContent --> LLMMod;
    
    ContextMgr -- ProvidesContextTo --> LLMMod;
    DevProfile -- ProvidesProfileTo --> ContextMgr;
    
    LLMMod -- RawBlueprint --> PromptGen;
    LLMMod -- InteractsWith --> DeepSeek;
    LLMMod -- InteractsWith --> OpenAI_Chat;
    
    PromptGen -- FormattedOutput --> Agent;
    Agent -- SavesOutput --> OutputDir[output/blueprints.md];

    Agent -- InteractsWith --> SimpleMem;
    Agent -- InteractsWith --> HierarchicalMem;
    Agent -- InteractsWith --> LanceVecMem;
    
    LanceVecMem -- Uses --> LanceDB;
    LanceVecMem -- Uses --> EmbeddingMod;
    EmbeddingMod -- InteractsWith --> OpenAI_Embed;

    GitHubMod -- ClonesFrom --> GitHub;
    YouTubeMod -- FetchesFrom --> YouTube;
    Agent -- OptionallyUses --> MCPClient[src/mcpClient.js];
    MCPClient -- ConnectsTo --> MCP;

    ExpressAPI -- (CurrentlyMocked)Manages --> SimpleMem;
    ExpressAPI -- (CurrentlyMocked)Manages --> DevProfile;

    NextJS_Chat_API -- Uses --> LLMMod; % For LLM calls
    NextJS_Chat_API -- Uses --> GitHubMod_LocalCopy[advanced-chat-ui/src/lib/github.js]; % Local copy
    GitHubMod_LocalCopy -- Uses --> GlobLib[glob in advanced-chat-ui];
    NextJS_Chat_API -- InteractsWith --> DeepSeek; % Directly or via LLMMod
```

## Key System Components and Patterns

1.  **Main Agent Logic (`src/agent.js`):**
    *   **Entry Point & Orchestrator:** Initializes the agent, loads configuration, and handles the main CLI interaction loop.
    *   **URL/Path Dispatching:** Determines input type (YouTube, GitHub, local path) and routes to appropriate processing modules.
    *   **Express Backend for UI:** Initializes an Express.js server to provide API endpoints (`/api/memory`, `/api/profiles`) for the React-based Memory Visualization UI. *Currently, these API endpoints in `agent.js` use a simple in-memory mock rather than the persistent memory systems.*
    *   **Configuration Management:** Loads settings from `config.json` and environment variables.
    *   **Module Integration:** Coordinates calls to `youtube.js`, `github.js`, `llm.js`, `promptGenerator.js`, various memory modules, `developerProfile.js`, and `contextWindowManager.js`.

2.  **Content Processing Modules:**
    *   **YouTube (`src/youtube.js`):** Fetches video transcripts using `youtube-transcript-plus`. Includes commented-out code for potential MCP tool integration for transcript fetching.
    *   **GitHub (`src/github.js`):** Parses GitHub URLs, clones repositories (supports `GITHUB_PAT`), extracts content intelligently (READMEs, package files, source code, `memory-bank/*.md`, `.agentinclude` files), and manages temporary clone directories. Uses `glob` for file pattern matching.
    *   **Local Path Processing (in `src/agent.js`):** Handles local directory inputs, applying similar content extraction logic as `github.js`, including `.agentinclude` support.

3.  **LLM Interaction & Prompting:**
    *   **LLM Module (`src/llm.js`):** Manages interactions with LLM APIs (DeepSeek and OpenAI).
        -   Selects the provider (DeepSeek or OpenAI) based on the model name prefix (e.g., "gpt-") specified in the configuration for the current task (repo, YouTube, follow-up).
        -   Constructs detailed prompts to request "Improvement and Re-implementation Blueprints" in JSON format.
        -   Handles API responses and errors, including parsing JSON from potentially messy LLM output.
        -   Supports follow-up questions, dispatching to the configured LLM provider.
        -   Includes DNS lookup before fetch calls for debugging.
    *   **Prompt Generation (`src/promptGenerator.js`):** Takes the structured JSON blueprint from `llm.js` (regardless of which LLM produced it) and formats it into detailed Markdown files and concise console prompts.

4.  **Memory Systems:**
    *   **Simple Key-Value Memory (`src/memory.js`):** Basic file-based storage (`memory-store.json`) for associating summaries with URLs/paths.
    *   **Hierarchical Memory (`src/hierarchicalMemory.js`):** Manages session, project, and global memory layers stored in separate JSON files within `memory-hierarchy/`.
    *   **Semantic Vector Memory (LanceDB):**
        *   `vector-memory/embeddingProvider.js`: Generates text embeddings using the OpenAI API (`text-embedding-ada-002`).
        *   `src/lancedb.js`: Low-level interface for LanceDB operations (connect, ensure table, insert, query). Defines a schema with a 1536-dimension vector.
        *   `vector-memory/lanceVectorMemory.js`: Higher-level class abstracting LanceDB usage; handles embedding text via `EmbeddingProvider` and performing semantic searches.
    *   **Alternative Vector Memory (ChromaDB - `vector-memory/vectorMemory.js`):** An apparent older or alternative implementation for vector memory using ChromaDB, also leveraging the same `EmbeddingProvider`.

5.  **Personalization & Context Management:**
    *   **Developer Profiles (`src/developerProfile.js`):** Stores and retrieves developer-specific coding patterns and preferences from JSON files in `developer-profiles/`.
    *   **Context Window Manager (`src/contextWindowManager.js`):** Dynamically constructs the context for LLM prompts by prioritizing recent memory entries (from various systems) and developer profile information, compressing content as needed to fit token limits.

6.  **Memory Visualization UI:**
    *   **Backend API (in `src/agent.js`):** Express.js server providing `/api/memory` and `/api/profiles` endpoints. *Currently serves mocked in-memory data for the UI.*
    *   **Frontend (`src/memory-ui/src/App.js`):** React application that consumes the backend API to allow users to browse, search, filter, edit, and delete memory entries and developer profiles.

7.  **MCP Client (`src/mcpClient.js`):**
    *   Uses `@modelcontextprotocol/sdk` to connect to an MCP server (hardcoded to `http://localhost:5000/sse`) and invoke external tools.

7.  **Advanced Chat UI (`src/advanced-chat-ui/`):**
    *   **Frontend (Next.js/React):** Located in `src/advanced-chat-ui/src/app/`.
        *   Uses Next.js App Router.
        *   Chat interface (`chat/page.tsx`) built with React and the Vercel AI SDK (`@ai-sdk/react`, specifically the `useChat` hook).
        *   Styled with Tailwind CSS.
    *   **Backend (Next.js API Route):** Located at `src/advanced-chat-ui/src/app/api/chat/route.ts`.
        *   Handles POST requests from the `useChat` hook.
        *   Connects to LLMs (currently DeepSeek via `@ai-sdk/openai` provider) using API keys from its own `.env.local` (e.g., `DEEPSEEK_API_KEY`).
        *   Uses `streamText` from the `ai` package to stream responses.
        *   Includes basic URL detection (GitHub, YouTube).
        *   Uses a local copy of `github.js` (from `src/advanced-chat-ui/src/lib/github.js`) for functions like `parseGitHubUrl`. This copy requires `glob` to be a dependency of `advanced-chat-ui`.
    *   **Configuration:**
        *   `next.config.ts`: Configured with `experimental: { externalDir: true }` (though current solution uses local copy of `github.js`).
        *   `tsconfig.json`: Includes path alias `@/*` for its own `src` and `@agentLib/*` (currently unused due to local copy strategy for `github.js`).
    *   **Current Functionality:** Basic chat with LLM, acknowledgment of detected GitHub/YouTube URLs by modifying the system prompt to the LLM. Full analysis capabilities for URLs are not yet integrated.

## Design Patterns & Principles
-   **Modular Design:** Functionality is well-separated into distinct ES modules.
-   **Asynchronous Operations:** Extensive use of `async/await` for non-blocking I/O.
-   **Layered Abstraction for Memory:** Multiple memory systems with different characteristics (simple key-value, hierarchical, semantic vector) provide flexibility. The `LanceVectorMemory` class abstracts LanceDB details.
-   **Configuration Driven:** Key parameters (API keys, model names, limits) are managed via `config.json` and environment variables.
-   **Strategy Pattern (Implicit):** Different strategies for content sourcing (YouTube, GitHub, local) and memory management.
-   **Facade (Implicit for Memory UI):** The Express API in `agent.js` acts as a facade for the UI, though it currently uses mock data.
-   **Temporary Resource Management:** `github.js` manages temporary cloned repositories.

## Scalability and Performance Considerations
-   **`git clone --depth 1`:** Minimizes clone time for GitHub repos.
-   **Content Size Limits:** Configurable limits in `github.js` and `contextWindowManager.js` manage LLM token usage and API costs.
-   **Asynchronous Operations:** Keep the CLI responsive.
-   **Semantic Search:** LanceDB provides efficient vector similarity search.
-   **Bottlenecks:** Likely to be `git clone`, LLM API response times, and potentially embedding generation for large amounts of text. The Memory UI's performance will depend on the efficiency of its (currently mock) backend API and the amount of data.

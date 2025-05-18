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
        Logger[src/logger.js: Shared Logging Utility]
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
            LanceVecMem[vector-memory/lanceVectorMemory.js (Main Agent)]
            LanceDB[src/lancedb.js: LanceDB Interface (Main Agent)]
            EmbeddingMod[vector-memory/embeddingProvider.js (Main Agent)]
        end
        LanceVecMem_ChatUI[advanced-chat-ui/src/lib/lanceVectorMemory.js (Chat UI Copy)]
        LanceDB_ChatUI[advanced-chat-ui/src/lib/lancedb.js (Chat UI Copy)]
        EmbeddingMod_ChatUI[advanced-chat-ui/src/lib/embeddingProvider.js (Chat UI Copy)]
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
    Agent -- Uses --> Logger;
    
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
    Agent -- Uses --> MCPClient[src/mcpClient.js];
    MCPClient -- Reads --> Config;
    MCPClient -- ConnectsTo --> MCP;
    MCPClient -- Uses --> Logger;
    Agent -- ManagesLifecycleOf --> StdioMCP[Stdio MCP Servers (Managed)];
    StdioMCP -- CommunicatesVia --> MCPClient;


    ExpressAPI -- (CurrentlyMocked)Manages --> SimpleMem;
    ExpressAPI -- (CurrentlyMocked)Manages --> DevProfile;

    NextJS_Chat_API -- Uses --> LLMMod; % For LLM calls
    NextJS_Chat_API -- Uses --> GitHubMod_LocalCopy[advanced-chat-ui/src/lib/github.js]; % Local copy
    GitHubMod_LocalCopy -- Uses --> GlobLib[glob in advanced-chat-ui];
    NextJS_Chat_API -- InteractsWith --> DeepSeek; % Directly or via LLMMod
    NextJS_Chat_API -- Uses --> LanceVecMem_ChatUI;
    LanceVecMem_ChatUI -- Uses --> LanceDB_ChatUI;
    LanceVecMem_ChatUI -- Uses --> EmbeddingMod_ChatUI;
    EmbeddingMod_ChatUI -- InteractsWith --> OpenAI_Embed;

    NextJS_Chat_API -- Uses --> MCP_UI_Client[src/advanced-chat-ui/src/lib/mcp_ui_client.mjs];
    MCP_UI_Client -- Reads --> MCP_UI_Config[src/advanced-chat-ui/mcp-config.json];
    MCP_UI_Client -- ConnectsTo --> MCP;
```

## Key System Components and Patterns

1.  **Main Agent Logic (`src/agent.js`):**
    *   Orchestrates CLI interactions, content processing, LLM analysis, and memory operations.
    *   Manages lifecycle of designated Stdio MCP servers.
    *   Integrates with `src/mcpClient.js` by passing its `getManagedMcpClient` function for managed server interactions.
    *   Uses the shared structured logging utility (`src/logger.js`).
    *   Includes an Express.js backend (currently mocked) for the Memory Visualization UI.

2.  **Shared Logging Utility (`src/logger.js`):**
    *   Provides a centralized structured JSON logging facility.
    *   Used by `src/agent.js` and `src/mcpClient.js` to standardize log output.
    *   Supports different log levels (INFO, WARN, ERROR, DEBUG) and module-specific logger instances.
    *   Debug logging can be enabled via environment variables (e.g., `DEBUG=true` or `[MODULE_NAME]_DEBUG=true`).

3.  **Content Processing Modules (`src/youtube.js`, `src/github.js`):**
    *   Handle fetching and extracting content from YouTube, GitHub, and local paths.

4.  **LLM Interaction & Prompting (`src/llm.js`, `src/promptGenerator.js`):**
    *   Manage communication with LLM APIs (DeepSeek, OpenAI).
    *   Format LLM responses into blueprints and console prompts.

5.  **Memory Systems (`src/memory.js`, `src/hierarchicalMemory.js`, `vector-memory/`):**
    *   Provide various layers of memory: simple key-value, hierarchical file-based, and semantic vector search (LanceDB).

6.  **Personalization & Context Management (`src/developerProfile.js`, `src/contextWindowManager.js`):**
    *   Manage developer profiles and construct context windows for LLM prompts.

7.  **MCP Client (`src/mcpClient.js` - Enhanced):**
    *   Provides robust client functionality for MCP server interaction.
    *   Supports SSE and Stdio transports, dynamic server configuration from `config.json`.
    *   Handles managed Stdio servers (via `getManagedMcpClientFunc` from `agent.js`) and per-call connections for unmanaged/SSE servers.
    *   Includes error handling, timeouts, initial connection retry logic.
    *   Exports `invokeMcpTool`, `validateMcpConfigurations`, `testMcpServerConnection`.
    *   Uses the shared structured logging utility (`src/logger.js`).
    *   Documented in `src/mcpClient.README.md`.

8.  **Agent-Managed MCP Server Lifecycle (in `src/agent.js`):**
    *   `agent.js` handles startup, stderr monitoring, and shutdown of Stdio MCP servers configured with `manageProcess: true`.

9.  **Advanced Chat UI (`src/advanced-chat-ui/`):**
    *   Next.js application with a React frontend and API backend.
    *   Integrates with LLMs and its own local copy of memory systems (including LanceDB for RAG).
    *   Includes an MCP client (`mcp_ui_client.mjs`) for UI-initiated tool calls (currently blocked by SDK issues).

10. **Memory-Informed Planning (`query_memory` meta-tool in `src/agent.js`):**
    *   Allows the LLM to proactively query internal memory systems during its planning phase.

## Design Patterns & Principles
-   **Modular Design:** Core functionality separated into ES modules.
-   **Shared Utilities:** Centralized logging (`src/logger.js`).
-   **Dependency Injection (Implicit):** `getManagedMcpClientFunc` is passed to `invokeMcpTool` to break circular dependency and provide `agent.js`'s managed client access.
-   **Asynchronous Operations:** Extensive use of `async/await`.
-   **Configuration Driven:** Behavior customized via `config.json`.
-   (Other patterns as previously listed: Layered Abstraction for Memory, Strategy, Facade, Temporary Resource Management).

## Scalability and Performance Considerations
-   (As previously listed).
-   Structured logging can aid in performance monitoring if logs are ingested into an analysis platform.

# System Patterns: AI Agent

## 1. Overall Architecture (Conceptual)

```mermaid
graph TD
    User -->|Requests/Feedback| AgentCore
    AgentCore -->|Parses & Plans| TaskLogic
    TaskLogic -->|Executes| Tools
    Tools -->|Interacts| ExternalServices[External Services (Git, APIs, Web)]
    Tools -->|Interacts| FileSystem[File System]
    Tools -->|Interacts| CLI[Command Line Interface]
    Tools -->|Interacts| MCPs[MCP Servers]
    
    AgentCore -->|Reads/Writes| MemoryBank[Memory Bank]
    MemoryBank -.-> AgentCore
    
    AgentCore --> LLM[LLM for NLU/Planning/Generation]
    LLM --> AgentCore

    subgraph AgentCore
        direction LR
        Parser[Request Parser]
        Planner[Task Planner]
        Executor[Action Executor]
        RuleEngine[Rule Engine (.clinerules)]
    end

    subgraph Tools
        direction LR
        FileTool[File System Tool]
        CmdTool[CLI Tool]
        BrowserTool[Browser Tool]
        MCPTool[MCP Client Tool]
        CustomTools[e.g., YouTubeTranscriptTool]
    end

    subgraph MemoryBank
        direction TB
        MB_ProjectBrief[projectbrief.md]
        MB_ProductContext[productContext.md]
        MB_ActiveContext[activeContext.md]
        MB_SystemPatterns[systemPatterns.md]
        MB_TechContext[techContext.md]
        MB_Progress[progress.md]
        MB_Custom[custom_docs/]
    end
```

## 2. Key Technical Decisions (Initial)

*   **Primary Language (Agent Core):** Node.js (JavaScript) - Chosen due to `package.json` and existing `.js` files.
*   **Modularity:** Separate modules for different concerns (e.g., `agent.js`, `llm.js`, `mcpClient.js`, `youtube.js`).
*   **Dependency Management:** NPM for Node.js packages.
*   **Asynchronous Operations:** Node.js's event-driven, non-blocking I/O model will be leveraged for tool interactions.
*   **Configuration:** JSON files (e.g., `config/youtube.json`) for specific settings.
*   **Hybrid Approach for Specific Tasks:** Python script (`config/youtube_transcript_server.py`) for YouTube transcript processing, likely run as a separate process or server.

## 3. Design Patterns (Anticipated)

*   **Tool/Plugin Architecture:** For integrating various functionalities (file system, CLI, browser, MCPs). Each tool will have a defined interface.
*   **Chain of Responsibility / Pipeline:** For processing user requests (Parse -> Plan -> Execute -> Respond).
*   **State Management:** The Memory Bank serves as the primary state persistence mechanism, especially for `activeContext.md` and `progress.md`.
*   **Observer Pattern:** Potentially for notifying different parts of the system about changes or events (e.g., task completion, Memory Bank updates).
*   **Strategy Pattern:** Different strategies might be employed for task execution based on complexity or type.

## 4. Component Relationships (High-Level)

*   **`agent.js` (Likely Core):** Orchestrates the agent's lifecycle, manages interactions between components.
*   **`llm.js`:** Handles communication with the Large Language Model for understanding, planning, and content generation.
*   **`mcpClient.js`:** Manages connections and interactions with various MCP servers.
*   **`promptGenerator.js`:** Constructs prompts for the LLM based on current context and task.
*   **`youtube.js` / `config/youtube_transcript_server.py`:** Handles fetching and processing YouTube transcripts. The `.js` file might be a client to the Python server.
*   **Memory Bank Files:** Provide persistent context and knowledge, read at startup and updated during operation.
*   **`.clinerules`:** Influences agent behavior at various stages (planning, execution).

## 5. Critical Implementation Paths

*   **Request Handling Workflow:** From user input to task completion and Memory Bank update.
*   **Tool Integration Framework:** Ensuring tools can be added and used reliably.
*   **Memory Bank Read/Write Logic:** Ensuring data integrity and timely updates.
*   **Error Handling and Recovery:** Robust mechanisms for dealing with tool failures or unexpected issues.
*   **Interaction with Python Transcript Server:** Defining the communication protocol between the Node.js agent and the Python server.

This document will be updated as the system design solidifies and evolves.

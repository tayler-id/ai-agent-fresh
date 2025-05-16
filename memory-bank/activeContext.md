# Active Context

## Git Repository Recovery (May 15, 2025)
- **Objective:** Resolve critical git issues in the original `ai-agent` repository that included a failed rebase, secret management problems, and numerous merge conflicts.
- **Action Taken:** Due to the complexity and instability of the old repository, a decision was made to start fresh.
    1.  The problematic rebase in the old repository was aborted (`git rebase --abort`).
    2.  A new directory, `ai-agent-fresh`, was created at `/Users/tramsay/Desktop/ai-agent-fresh`.
    3.  A new Git repository was initialized within `ai-agent-fresh`.
    4.  A comprehensive `.gitignore` file was added.
    5.  All project files from the old `ai-agent` directory were copied to `ai-agent-fresh` (excluding the old `.git` directory and other specified temporary/build files).
    6.  An initial commit was made in the `ai-agent-fresh` repository, incorporating all project files.
- **Outcome:** The project now resides in a new, clean Git repository (`ai-agent-fresh`) located at `/Users/tramsay/Desktop/ai-agent-fresh`. This repository is stable and ready for continued development. The old `ai-agent` directory still exists but should be considered deprecated.
- **Next Steps:**
    - Continue development within the `ai-agent-fresh` repository.
    - Ensure all future git operations are performed in this new repository.
    - Update remote repository links if applicable (e.g., on GitHub).

---

## Active Context: Advanced Chat UI Development (Status as of May 14, 2025)
- **Objective:** Initiated development of a new, full-featured chat UI (`src/advanced-chat-ui/`) as per user request, building upon the existing agent's backend capabilities.
- **Progress:**
    1.  Successfully set up a Next.js application (`src/advanced-chat-ui/`) with TypeScript, Tailwind CSS, and the App Router.
    2.  Installed and integrated the Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`).
    3.  Created a basic chat page (`src/app/chat/page.tsx`) using the `useChat` hook.
    4.  Implemented a backend API route (`src/app/api/chat/route.ts`) that connects to the DeepSeek LLM (via OpenAI provider compatibility) and streams responses.
    5.  Added initial URL detection (GitHub/YouTube) to the API route, modifying the system prompt for LLM acknowledgment. This functionality has been manually verified by the user.
    6.  Troubleshot and resolved several issues:
        *   NPM cache misconfiguration in the main project.
        *   Module import errors for Vercel AI SDK components (`StreamingTextResponse`, `OpenAI` provider instantiation).
        *   Module resolution issues for importing `src/github.js` into the nested Next.js app, currently worked around by copying `github.js` to `src/advanced-chat-ui/src/lib/` and adding `glob` as a local dependency to `advanced-chat-ui`.
- **Outcome:** Foundational elements of `advanced-chat-ui` are in place.
- **LanceDB Integration Status (`task-95` - May 14, 2025):**
    -   **Webpack:** Resolved `Module parse failed` error using `serverExternalPackages: ['@lancedb/lancedb']` and `webpack.externals` in `next.config.ts`. LanceDB is functional.
    -   **Turbopack:** Successfully tested. The `serverExternalPackages: ['@lancedb/lancedb']` setting in `next.config.ts` appears sufficient. The previous resolution error did **not** reappear.
    -   **Note:** Turbopack still warns `⚠ Webpack is configured while Turbopack is not...`. Needs monitoring.
- **Task Status:** Implementation of `task-95` (Integrate LanceDB Semantic Search in Chat API) can proceed.

---

## Memory-Enhanced Tool Chaining Implementation (req-34) - Status as of May 16, 2025
- **Objective:** Implement the "Memory-Enhanced Tool Chaining" feature, allowing the LLM to query internal agent memory (semantic and hierarchical) during its planning phase to produce more context-aware blueprints. This was based on the design from `req-33`.
- **Key Implementation Steps Completed:**
    - Modified `src/agent.js` by adding `handleLlmResponseAndMemoryQueries` to orchestrate the detection and processing of `query_memory` tool calls from the LLM, including an iterative refinement loop.
    - Implemented the `processInternalMemoryQuery` function within `src/agent.js` to handle `query_type: "semantic_search"` (using `LanceVectorMemory`) and `query_type: "hierarchical_lookup"` (using `HierarchicalMemory`).
    - Verified that the existing interfaces of `LanceVectorMemory.search()` and `HierarchicalMemory.getMemoryEntries()` are suitable for the current implementation needs.
    - Updated prompts in `src/llm.js` (for `analyzeTranscript` and `analyzeRepoContent`) to instruct the LLM on the syntax, usage, and strategic benefits of the `query_memory` tool, including the expected JSON structure for `tool_calls`.
    - Confirmed that the mechanism for re-inserting memory query results (via `combinedContentForRefinement` in `agent.js`) into the LLM's context for the refinement step is in place.
- **Testing Outcome:**
    - The end-to-end mechanism for handling `query_memory` calls was successfully verified using a simulated LLM tool call. This test confirmed detection, memory module invocation, result formatting, and the LLM refinement loop.
    - In naturalistic test scenarios, the LLM did not spontaneously use the `query_memory` tool with the current prompts. This suggests the feature is available, but the LLM's decision to use it is conservative. Further prompt engineering might be explored if more proactive memory querying is desired.
    - Resolved an API key loading issue by ensuring the agent is run from the project's root directory.
- **Current Status:** Core implementation of the feature and verification of its mechanism are complete.
- **Next Steps for this feature (req-34):**
    - Commit and push all related code and documentation changes (`task-156`).

---

## Immediate Next Steps & Roadmap Focus (Updated - May 16, 2025)

1.  **Complete "Memory-Enhanced Tool Chaining" (req-34):**
    *   Commit and push all related code changes (`src/agent.js`, `src/llm.js`) and Memory Bank documentation updates (`task-156`).
2.  **Advanced Chat UI - LanceDB Integration & Enhancements (High Priority):**
    *   **Objective:** Fully integrate LanceDB semantic search into the `api/chat` route (`task-95`). Ensure search results are correctly processed and used to augment LLM context (RAG).
    *   Refine the logging for LanceDB search results in `route.ts` to be more concise if needed.
    *   Proceed with `task-95` and related UI feature development that depends on semantic search.
    *   Monitor for any side effects from the Turbopack warning regarding Webpack configuration.
3.  **Research AI Agent Architectures & Native Dependency Solutions (Moderate Priority):**
    *   This research (`task-98`, `task-99`, `task-100` of `req-23`) remains valuable for long-term best practices.
4.  **Advanced Chat UI - Other Foundational Enhancements:**
    *   Continue integration of GitHub/YouTube analysis and other core agent features into the chat UI.
5.  **Shared Code Management Strategy:**
    *   Evaluate and implement a robust strategy for sharing code between the main agent and the `advanced-chat-ui`.
6.  **Memory Visualization UI - Backend Integration (`src/memory-ui/`):**
    *   Connect the UI's backend API to persistent memory stores.
7.  **Refine Core Agent Workflows, Error Handling, Prompt Engineering (Ongoing):**
    *   Continuously improve prompts (including for `query_memory` if more proactive use is desired).
    *   Enhance error handling and overall agent robustness.

---

## Ongoing Documentation & Knowledge Management
-   The Memory Bank (including this `activeContext.md` and `progress.md`) will be kept up-to-date with all significant changes and decisions.
-   The Knowledge Graph will be updated to reflect architectural changes and new feature implementations.

---

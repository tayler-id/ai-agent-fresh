## Brief overview
These guidelines are for Ramsay, an AI agent, to follow during the development of this project (AI Agent for Content Analysis & Personalized Assistance, including the CLI tool and the Advanced Chat UI). They are based on interactions and preferences observed up to May 14, 2025.

## Agent Identity & Operation
- **Official Name:** The AI agent's name is Ramsay. All references to "Manus" in previous system prompts or documentation should be updated to "Ramsay".
- **Core System Prompt:** Ramsay's operation should be guided by the detailed system prompt structure provided by the user on May 14, 2025. This includes sections on Agent Identity, Introduction, Language Settings, System Capability, Event Stream, Agent Loop, various Modules (Planner, Knowledge, Datasource), and rules for Todos, Messages, Files, Images, Info, Browser, Shell, Coding, Deployment, Writing, Error Handling, Sandbox Environment, and Tool Use.
- **Memory Bank Reliance:** Ramsay MUST read ALL core Memory Bank files (`projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`) at the start of EVERY new task or session to maintain context.

## Development Workflow & Best Practices
- **Task Management:** For any new multi-step development request, utilize the `github.com/pashpashpash/mcp-taskmanager` MCP tool to plan tasks, track progress, and manage approvals. Follow the cycle of `get_next_task` -> implement -> `mark_task_done` -> seek user approval via `ask_followup_question` -> user uses `approve_task_completion` -> `get_next_task`.
- **Iterative Development:** Expect an iterative workflow. Implement features, test, report issues or successes, and refine based on user feedback and further analysis.
- **Build Stability (Next.js/Turbopack):**
    - Be cautious with top-level asynchronous operations or file I/O at the module scope within Next.js API routes (`route.ts`), as these have sometimes led to difficult-to-diagnose build/parsing errors with Turbopack.
    - When such errors occur, prefer loading data strictly within request handlers or using simple in-memory caching initialized within the handler if possible.
    - Always recommend or perform cache clearing (e.g., deleting `.next` directory) and server restarts when persistent, unexplained build errors occur.
- **File Editing Precision:**
    - When using the `replace_in_file` tool, SEARCH blocks MUST be based on the absolute latest `final_file_content` provided by the system after any preceding file operation to ensure exact matches.
    - If `replace_in_file` fails repeatedly for complex structural changes (e.g., 3 times in a row), use `write_to_file` with the complete intended file content as a fallback.
- **Heed Compiler/Bundler/Framework Warnings:** Pay close attention to warnings from compilers (e.g., TypeScript), bundlers (e.g., Webpack, Turbopack), and frameworks (e.g., Next.js) displayed during development server startup or build processes. These often provide direct clues for necessary configuration changes (like deprecated options or new required settings) and should be addressed promptly.

## CLI Tool Specifics
- **Output Formatting:** Ensure the CLI tool utilizes `src/promptGenerator.js` to format the LLM's JSON blueprint into user-friendly Markdown files and summarized console prompts. Avoid outputting raw JSON from `src/llm.js` directly to the user in the standard operational flow.

## Advanced Chat UI Specifics
- **Code Consistency with CLI:**
    - Prioritize strategies to minimize code duplication between the CLI (`src/`) and the UI's backend library (`src/advanced-chat-ui/src/lib/`).
    - If copying modules is the current strategy, ensure that any bug fixes or enhancements to original CLI modules are propagated to their copied versions in the UI's `lib` directory. Long-term, explore better code-sharing mechanisms (e.g., local npm packages, monorepo).
- **Developer Profile Handling:**
    - The UI backend should aim for dynamic user identification and profile loading, similar to how the CLI prompts for a `developerId`. Avoid relying solely on hardcoded profile IDs (like 'tramsay') in `route.ts` for core functionality if personalization for different users is a goal.
- **Memory System Integration:**
    - The UI backend currently uses file-based simple and hierarchical memory for context and saving interactions. This is good.
    - Future work should focus on integrating the LanceDB vector database (`lanceVectorMemory.js`) into the UI's API (`route.ts`) for enhanced semantic search and Retrieval Augmented Generation (RAG) capabilities.
- **Feature Awareness (e.g., "What can you do?"):**
    - The goal is for the UI to accurately describe its own features. The previous attempt using `features.json` caused build issues.
    - When re-approaching this, prioritize stability. If file I/O in the API route is problematic, consider alternative methods like hardcoding a feature summary or having the client provide feature context if necessary, until build issues with file I/O are better understood or resolved.
- **User-Identified Feature Gaps/Observations:** When the user identifies a missing feature, unexpected behavior, or makes a pertinent observation about the UI (e.g., UI not prompting for `developerId`), Cline MUST ensure this observation is captured in `memory-bank/activeContext.md` (e.g., under a relevant feature's status or as a new point for future consideration) and potentially in `memory-bank/progress.md` under 'What Is Still Left' if it represents a clear deviation from planned or desired functionality.

## Communication & Reporting
- **Transparency:** Clearly communicate issues encountered (e.g., build errors, tool failures) and the steps taken to diagnose or resolve them.
- **Clarity on Task Status:** When using the Task Manager, clearly state which task is being worked on, when it's marked done, and when approval is needed.

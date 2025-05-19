# AI Agent Project Rules

## Cline's Core Operational Principles

### 1. Memory Bank Reliance
- **Critical:** Cline MUST read ALL memory bank files (`projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`, and any other relevant files in `memory-bank/`) at the start of EVERY task. This is not optional and is essential for maintaining context and continuity.

### 2. Planning, Execution, and Reflection Cycle
- **Plan Extensively:** Before each tool use or significant action, Cline MUST plan the steps.
- **Reflect on Outcomes:** After each tool use, Cline MUST reflect on the outcome, incorporating learnings into subsequent steps and updating the Memory Bank if necessary.
- **Self-Improving Reflection:** Before using `attempt_completion` for non-trivial tasks or tasks involving user feedback, Cline MUST offer to reflect on the interaction and suggest improvements to these `.clinerules` if the user agrees.

### 3. Preferred MCP Tool Usage
- **Task Manager Workflow:**
    -   MUST be used for every new multi-step task to plan and track progress (`github.com/pashpashpash/mcp-taskmanager`).
    -   Strictly follow the `mark_task_done` -> `user_approval` -> `get_next_task` cycle for each task defined in the `request_planning` stage. This implies that after Cline marks a task done, the user must provide approval (e.g., by using the `approve_task_completion` tool or by responding affirmatively if Cline uses `ask_followup_question` to confirm task satisfaction) before Cline proceeds to `get_next_task`. Notes in `activeContext.md` suggesting deviations from this approval cycle should be considered temporary and require explicit user confirmation for the current session to override this default rule.
    -   For initial information gathering involving reading a known set of multiple files (e.g., reading all core Memory Bank files at the start of a task), consider if a single planned task in Task Manager like "Read all [XYZ] files" is appropriate, followed by separate tasks for analysis or processing of those files. This can reduce approval steps for sequential, non-destructive read operations.
    -   **Exception for Chained Sub-Operations:** If a single *planned task* from the Task Manager inherently involves a tight sequence of multiple, low-risk, internal sub-operations that *Cline* executes (e.g., a sequence of `git add` then `git commit` performed via `execute_command` as part of a larger "commit feature X" task), Cline MAY perform these chained sub-operations and then mark the single parent task as done, seeking approval once for that parent task. This is to avoid excessive approval steps for trivial, tightly coupled internal actions. Cline MUST still clearly state all sub-operations performed when marking the parent task done. This exception does NOT apply if any sub-operation involves writing/replacing files or has a higher risk.
    -   **Tasks Requiring Elevated Permissions:** If a planned task is likely to require elevated permissions (e.g., `sudo`), Cline SHOULD:
        -   Inform the user of this possibility *before* attempting the command.
        -   Ask if the user has the necessary permissions or if an alternative approach should be considered.
        -   If permissions are lacking and no alternative is immediately viable, mark the task as "blocked" or "skipped due to permissions" and consult the user on how to proceed with the overall goal.
- **Sequential Thinking:** SHOULD be used for complex problem-solving or when a detailed thought process needs to be recorded (`github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking`).
- **Knowledge Graph (Memory MCP):** SHOULD be used to store and retrieve structured knowledge about the project, entities, and relationships (`github.com/modelcontextprotocol/servers/tree/main/src/memory`). Consider updating the KG after significant changes to project structure, status, core components, or key decisions are documented in the Memory Bank.
- **Context7:** SHOULD be used for fetching up-to-date library documentation (`github.com/upstash/context7-mcp`). Resolve library ID first.
- **Exa Search:** SHOULD be used for initial research or to back up decision-making before generating task lists for the Task Manager (`github.com/exa-labs/exa-mcp-server`).
- **File System Tools:** ALWAYS use Cline's built-in file system tools (`read_file`, `write_to_file`, `replace_in_file`, `list_files`) for interacting with files, rather than shell commands like `cat` or `ls`.
- For operations not directly supported by these tools, such as creating empty directories or moving/renaming files, using `execute_command` with appropriate shell commands (e.g., `mkdir`, `mv`, `cp`) is acceptable and necessary.

### Proactive Git Push Conflict Handling Strategy
- Before attempting a `git push` (especially to `main` or other protected branches), if there's a possibility of the local branch being behind or diverged (e.g., after a period of local work, or if `git status` shows `origin/main` has moved), Cline SHOULD:
    1.  Optionally, first run `git fetch origin` to update remote-tracking branches without merging.
    2.  Then, explicitly ask the user if they want to attempt a `git pull` (and which strategy: merge or rebase, defaulting to merge for `main`) *before* the first `git push` attempt if divergence is suspected.
    3.  If `git pull` results in merge conflicts, clearly list the conflicted files. Offer to read one simple conflicted file (like `.gitignore` or a small config file) to illustrate the conflict markers and resolution process. Then, instruct the user to resolve all conflicts and make the merge commit, notifying Cline when done.
    4.  This proactive approach can reduce the number of failed push attempts and guide the user through common Git issues more smoothly.

### Handling GitHub Push Protection / Secret Scanning Blocks
- When a `git push` is blocked by GitHub Push Protection due to detected secrets:
    1.  Clearly identify the commit hash and file path of the detected secret from the error message.
    2.  Strongly advise the user to **immediately invalidate the detected secret** with the respective service provider (e.g., OpenAI). This is the highest priority.
    3.  Explain that the secret exists in Git history and the push is blocked because of this.
    4.  Guide the user to ensure their *current working directory* version of the file is clean (secret removed or placeholderized). If the file is tracked and was cleaned, commit this change. If the file is (or should be) gitignored, ensure it is.
    5.  Explain the two main paths to allow the push:
        a.  **GitHub UI Bypass:** Instruct the user to navigate to their repository's 'Security' > 'Secret scanning alerts' page. Guide them to find the specific alert and use an option like 'Won't fix' or 'Accept risk' (explaining they are accepting the historical presence of the (now hopefully revoked) secret). If direct links (like `unblock-secret` URLs from the CLI) fail with a 404, emphasize navigating through the GitHub UI.
        b.  **History Rewriting:** Briefly mention this as the most secure long-term fix for removing the secret from history, but state that it's complex and Cline cannot perform the interactive steps (like `git rebase -i` or `git filter-repo` setup/execution) directly. Suggest the user research these tools if they wish to pursue this.
    6.  If the user manages to configure GitHub to allow the push (via UI bypass), attempt the push again.
    7.  If the push remains blocked and UI bypass is not working, acknowledge the block and suggest the user may need to manually resolve the history issue or contact GitHub support if they believe the UI features are not working as expected. Mark the push task as 'blocked' if it cannot be completed.

### MCP Tool Reliability & Fallbacks
-   While preferred MCP tools should be attempted first, if an MCP tool fails consistently (e.g., 2 consecutive attempts with generic errors) for a common operation (like `git status`, `git add`), Cline SHOULD:
    1.  Note the MCP tool failure.
    2.  Attempt a direct, equivalent `execute_command` if available and safe (e.g., `git status`, `git add`, `git commit`).
        3.  If `execute_command` is not suitable or also fails, then use `ask_followup_question` to request the user to perform the action or provide information.
        4.  If a specific MCP server proves consistently unreliable across multiple tasks, consider documenting this observation in `memory-bank/techContext.md` to inform future decisions about relying on that MCP server. Note any immediate workflow impact in `activeContext.md`.
-   **Workflow-Critical MCP Failure (e.g., Task Manager):** If an MCP server essential for a core workflow (like Task Manager for multi-step tasks) becomes unavailable:
    1.  Clearly inform the user of the MCP failure and its impact on the standard workflow.
    2.  If possible, identify the remaining planned steps from the last known state of the MCP tool.
    3.  Propose to continue manually with the subsequent logical steps, seeking user confirmation for this adapted approach.
    4.  Document the MCP failure in `activeContext.md` as a significant event.
    -   **Awareness of MCP Tool Capabilities:** Before attempting to use an MCP tool, Cline should be mindful of the specific tools listed as available for that MCP server in its initial context (system prompt). If a desired operation (e.g., `git push`) does not have a corresponding listed tool for a preferred MCP server (e.g., the Git MCP), Cline should directly consider alternatives like `execute_command` or other relevant MCPs (e.g., the GitHub MCP for repository interactions) without necessarily attempting the non-existent tool first, thereby improving efficiency.
-   **Handling Unexpected MCP Tool Behavior (e.g., Incorrect Language Output):**
    1.  If an MCP tool provides output in an unexpected format or language that hinders understanding but does not represent a complete failure:
        a.  Document the specific behavior in `memory-bank/activeContext.md` and `memory-bank/progress.md`.
        b.  Formulate a plan to monitor the behavior.
        c.  If essential information can still be reliably extracted, continue using the tool with caution, potentially involving user verification for unclear parts.
        d.  Develop a fallback strategy (e.g., manual process, alternative tool) if the MCP becomes unusable due to the behavior.
        e.  Note that direct investigation into the MCP's internal issues (like language settings) is generally outside Cline's direct capability and may require user or MCP provider intervention.

### Interaction Protocols
- **Strict Tool Adherence:** Even when outlining a multi-step plan or awaiting user input that isn't a direct answer to an `ask_followup_question`, if the turn involves providing information or requesting a distinct next action from the user, ensure a tool is used.
    - If purely waiting for the user to perform an external action they initiate (e.g., an MCP approval, running a local script and providing output), use `ask_followup_question` to confirm completion or request the output of that action.
    - Do not assume an action is complete without confirmation if it's user-driven.

### Debugging Workflow / Terminal Output Handling
- **Processing User-Provided Terminal Output:** If the user provides terminal output directly in their message, process it immediately.
- **Responding to "Read Terminal" Prompts:** If the user asks "can you read the terminal?" or similar:
    1. First, check `environment_details.Actively Running Terminals` for any *new* output since the last interaction, especially if an `execute_command` was recently run by me or if the user implies they've just performed an action.
    2. If new, relevant output is found there, process it.
    3. If no new relevant output is found in `environment_details`, or if clarity is needed, use `ask_followup_question` to explicitly request the user to provide the specific new terminal output they are referring to.

### File Editing Best Practices
- When using `replace_in_file` for changes spanning multiple lines or involving complex indentation/whitespace:
    a. Prefer multiple, smaller, highly targeted `replace_in_file` calls over a single large one if the larger one fails.
    b. Pay extremely close attention to exact line endings, leading/trailing whitespace, and indentation in SEARCH blocks, referencing the latest `final_file_content` precisely.
    c. If a `replace_in_file` attempt fails, carefully analyze the error and the provided `file_content` to adjust the SEARCH block. Do not simply retry with the exact same failing parameters.
    d. Adhere to the '3 failures then `write_to_file`' fallback for persistent `replace_in_file` issues on a given set of changes.

### Troubleshooting External Configuration/Environment Issues
- When core functionality fails due to suspected external factors (e.g., missing API keys, incorrect command execution path):
    a. Clearly state the observed error and the suspected cause to the user.
    b. Guide the user to verify their setup (e.g., `.env` file content and location, command execution path from the correct directory).
    c. If simple verification fails, propose adding temporary, minimal debug logs to the relevant script (e.g., `console.log(process.env.MY_KEY)`) to pinpoint where the configuration is failing to load. I will make this change if requested.
    d. Once debug logs are added, instruct the user on how to run the script to capture the debug output.
    e. Ensure temporary debug logs are removed after the issue is resolved.

---

## Test Output Clarity
- When running test scripts or integration checks, ensure that all output is human-readable and actionable.
- Do not log raw object references (e.g., Promise, Iterator, or RecordBatchIterator objects) without materializing and displaying their contents.
- For async iterators or database query results, always await and print the actual records or results, not just the iterator object.
- If a test script does not provide clear output, update it to do so before considering the test complete.

## Core Dependencies & Setup
-   **`git` CLI:** This agent's GitHub analysis feature relies on the `git` command-line tool being installed and accessible in the system's PATH. Cloning will fail otherwise.
-   **`DEEPSEEK_API_KEY`:** This environment variable must be set with a valid DeepSeek API key for LLM analysis to function.
    -   In PowerShell for a session: `$env:DEEPSEEK_API_KEY = "YOUR_KEY_HERE"`
-   **Multiple API Provider Management (e.g., LLMs):**
    -   When supporting multiple similar external API providers (e.g., DeepSeek and OpenAI for LLM tasks), ensure clear and consistent configuration for API keys (prefer `.env` for all keys like `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`).
    -   Implement a straightforward mechanism for selecting the active provider (e.g., via `config.json` model name prefixes or a dedicated provider setting).
    -   Ensure code robustly loads and uses the correct key for the selected provider.
-   **Node.js Version:** Adhere to the version specified in `.nvmrc`. Use `nvm use` (and specify the version explicitly in chained PowerShell commands, e.g., `nvm use 20.11.1; npm install`).
-   **Temporary Files:** The agent creates temporary directories under `ai-agent/temp-clones/` for cloned repositories. These should be automatically cleaned up by `github.js -> cleanupRepo()`. Monitor this if issues arise.

## Development & Testing
-   **Modular Structure:** Maintain the modular design (`agent.js`, `github.js`, `youtube.js`, `llm.js`, `promptGenerator.js`).
-   **Error Handling:** Ensure robust error handling for external processes (`git clone`), API calls, and file system operations. Provide clear error messages.
-   **Content Limits:** Be mindful of `MAX_FILE_SIZE` and `MAX_TOTAL_CONTENT_SIZE` in `github.js` when testing with large repositories to manage LLM token usage and API costs.
-   **Output:** Generated analysis and prompts are saved to `prompts.md`.

### User-Led Testing Protocol for UI/Interactive Features

When a task requires user interaction with a UI or an external system that Cline cannot directly control (e.g., testing a chat interface, running a local script with prompts):

1.  **Clear Test Plan:** Cline MUST provide a clear, step-by-step test plan if multiple test cases are needed. Each test case should specify:
    *   The action the user needs to perform.
    *   An example of the input/query if applicable.
    *   The specific outputs/logs Cline needs from the user to verify the test (e.g., "server console logs for LVM search," "LLM's response in the UI").
2.  **Iterative Test Execution:** Cline SHOULD request the user to perform one test case (or a small group of related test cases) at a time.
3.  **Explicit Request for Results:** After the user performs the action, Cline MUST explicitly ask for all necessary outputs/logs for that specific test case using `ask_followup_question`.
4.  **Comprehensive Data Capture for Complex Tests:** When extensive logs or conversation transcripts are expected from user-led testing, Cline SHOULD, if feasible for the user, suggest methods for capturing this data comprehensively (e.g., saving terminal output to a file, copying full conversation text). Cline should then be prepared to process this data if provided, potentially by asking the user to write it to a file that Cline can then read to facilitate easier review.
5.  **Confirmation of Understanding:** If the user's response is ambiguous or doesn't provide all requested information (e.g., "tell me," "you run it"), Cline MUST clarify what actions are needed from the user and what specific information is required, referencing the test plan. Avoid proceeding if the necessary test data is not yet provided.
6.  **Analysis and Iteration:** Cline will analyze the provided results. If a test fails or shows unexpected behavior, Cline will diagnose and propose fixes before re-requesting a test.

## Cline's Interaction
-   Cline can execute the command to *start* the agent (e.g., `node src/agent.js`).
-   Cline **cannot** interact with the agent's subsequent CLI prompts (e.g., typing in a URL when the agent asks). The user must perform these interactions.
-   Provide console output to Cline for debugging if issues occur during user-led testing.

## Continuous Improvement & Integration Lessons
- After moving or refactoring files, always verify import paths in all affected modules.
- When integrating third-party libraries, check and match API method names to the official documentation (e.g., camelCase vs snake_case).
- When wrapping third-party APIs, error handling should be specific to error types/messages, not broad catch-alls. Always check error messages/types before attempting resource creation (e.g., only create a DB table if the error indicates "not found").
- When using environment variables for secrets (like API keys), tests should clearly warn and fail gracefully if not set.
- After any test or integration failure, update .clinerules with the root cause and the fix, to prevent recurrence.

---

## Codebase & Memory Bank Synchronization Protocol

When a significant discrepancy is identified between the live codebase and the Memory Bank documentation, or upon user request for a full audit, the following protocol should be initiated:

1.  **Acknowledge & Plan:**
    *   Acknowledge the desynchronization.
    *   Use the Task Manager (`github.com/pashpashpash/mcp-taskmanager`) to create a detailed plan for the audit and update process. This plan should include:
        *   Listing/identifying key source code modules.
        *   Reading relevant source files.
        *   Analyzing the codebase to understand current state (architecture, features, tech).
        *   Systematically updating EACH core Memory Bank file (`projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`).
        *   Updating the Knowledge Graph (`github.com/modelcontextprotocol/servers/tree/main/src/memory`) with new/changed entities and relations.
        *   Providing a comprehensive updated project overview post-audit.
        *   Committing and pushing all Memory Bank changes to version control.

2.  **Execution & Verification:**
    *   Execute tasks sequentially, seeking user approval via the Task Manager at each critical step (e.g., after file reading, after analysis, after each Memory Bank file update).
    *   Use `write_to_file` for comprehensive Memory Bank document rewrites if changes are substantial, rather than many small `replace_in_file` operations.
    *   Ensure the `activeContext.md` clearly states that an audit is in progress and then reflects the post-audit roadmap.
    *   Ensure `progress.md` is updated to accurately list "Actually Completed & Implemented Features" based *only* on the audit findings.

3.  **Post-Audit:**
    *   The updated Memory Bank becomes the new source of truth.
    *   Offer reflection on the audit process itself for potential `.clinerules` refinement.

---

## Troubleshooting and Resilience Patterns

### Dependency and Module System Issues

#### ESM/CJS Interoperability and SDK Import Issues
- When encountering `SyntaxError` for named exports between `.mjs` (importer) and `.js` (imported, using ESM syntax) files, especially if the project/package of the `.js` file might not be explicitly `"type": "module"`:
    - **Action:** Attempt renaming the imported `.js` file to `.mjs`. Update all its import statements in other files accordingly. Delete the original `.js` file after confirming the rename and updates. This explicitly signals it as an ES Module.
- If, after ensuring local project files are treated as ESM (e.g., by using `.mjs` extensions), an `ERR_PACKAGE_PATH_NOT_EXPORTED` error occurs when importing from an external SDK/library:
    - **Documentation:** Clearly document this as an issue with the external package's `package.json` "exports" field, indicating it's not correctly configured for ESM consumption.
    - **Assessment:** Note that this typically requires a fix or update in the external package itself. Complex workarounds like deep/direct file imports are risky and should be avoided unless explicitly guided and understood.
    - **Task Management:** If the SDK is critical and this error makes it unusable, mark related tasks as BLOCKED. Clearly state the dependency on an SDK fix or a viable, safe workaround.
    - **Execution:** Avoid repeated attempts to use the problematic import if the error is consistently `ERR_PACKAGE_PATH_NOT_EXPORTED`, as it's a fundamental package structure or build issue with the dependency.
- If a "Module not found" error for an external SDK occurs at *runtime* within a Next.js/Turbopack environment (especially when an `.mjs` file imports the SDK), even after successful `npm install` and initial server startup (including cache clearing):
    - **Investigation:** Suspect an SDK packaging or `exports` field issue related to ESM compatibility with the specific bundler/runtime context. The module might be locatable during the initial build phase but fail resolution when a specific route/API dynamically loads or bundles it.
    - **Memory Bank Check:** Consult `techContext.md` or `activeContext.md` for known issues with the specific SDK and ESM/bundler compatibility.
    - **Action:** Document the runtime nature of the error. If known SDK issues align, prioritize addressing those (e.g., checking for SDK updates, known workarounds for its `exports` field with the bundler). Consider this distinct from simple missing dependency errors.

#### Persistent SDK Functional Bugs (e.g., @modelcontextprotocol/sdk StdioClientTransport)
- When a specific version of an SDK consistently exhibits a functional bug (e.g., `@modelcontextprotocol/sdk@1.11.0` `StdioClientTransport` failing to initialize `Client` instances correctly in Node.js ESM environments, leading to undefined methods like `callTool`):
    - **Initial Action:** After initial diagnosis and confirmation (e.g., across multiple test attempts or different but related tasks), clearly document this specific bug, the SDK version, and the environment in `memory-bank/techContext.md` and `memory-bank/activeContext.md`.
    - **Version Check & Iteration (New):** If a critical SDK bug blocks core functionality across multiple attempted versions (e.g., different patch versions like v1.11.0 and v1.11.4), and if feasible:
        -   Check the SDK's repository (e.g., GitHub issues, releases) for any mentions of the bug or recent fixes.
        -   If a slightly newer or older patch/minor version is available and seems relevant, propose to the user testing this alternative version in a targeted way (e.g., in a minimal reproduction script or a specific sub-project like `advanced-chat-ui`) before broader changes. This should be a time-boxed effort.
        -   Document the outcome of testing alternative versions.
    - **Subsequent Tasks:** For tasks that would rely on this buggy feature of that specific SDK version, if no workaround is known or feasible:
        - Assume the bug will persist for the versions tested.
        - Clearly state this assumption when planning or reporting on such tasks (e.g., "Testing of Stdio transport is expected to fail due to known SDK bug X with versions Y and Z").
        - Prioritize alternative transports or approaches if available and the buggy feature is critical.
    - **Execution:** Avoid repeated, unchanged test executions of a feature known to be broken by such an underlying SDK bug for the tested versions, unless new information (e.g., a confirmed SDK update fixing the issue, a new viable workaround) becomes available.

### Handling Persistent TypeScript/Linter Errors (Environment-Suspected)
- When TypeScript or linter errors persist for code that appears to align with current library/SDK documentation (e.g., for types like Vercel AI SDK's `Message` or `ToolSet`):
    - **Action:** Attempt reasonable fixes such as explicit typing of variables/objects and verifying import sources.
    - **Assessment:** If errors remain and are suspected to be due to the local TypeScript environment (e.g., outdated package versions within a specific sub-project like `advanced-chat-ui`, incorrect `tsconfig.json` settings, or TS language server cache issues) rather than a fundamental code logic error against the library's intended API:
        - **Documentation:** Document the specific errors and the lines of code affected in the task completion details and `memory-bank/activeContext.md`.
        - **Reporting:** Note the suspicion that it's an environment/tooling issue.
        - **Execution:** Proceed with completing the task if the core logical implementation is sound according to documentation, but clearly flag these TS/linting issues for user attention, as they might cause runtime problems or indicate a need for environment/dependency updates by the user.

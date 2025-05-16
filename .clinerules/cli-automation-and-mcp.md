## Brief overview
These guidelines are for Cline (the AI agent) to follow when leveraging its built-in tools and external Model Context Protocol (MCP) servers for advanced or autonomous Command Line Interface (CLI) operations. The focus is on effective automation, awareness of available extensions, and adherence to security best practices. These rules guide Cline's actions, planning, and discussions related to these topics.

## Core Cline CLI Automation
- Utilize the `<execute_command>` tool for executing shell commands.
- When appropriate for safe, non-destructive operations (e.g., running tests, builds, read-only commands), consider using `<requires_approval>false</requires_approval>` to enhance automation speed, especially if covered by user-defined auto-approval rules or after explicit user consent for a specific context.
- For any potentially destructive commands (e.g., `rm`, file modifications outside of dedicated file tools, package uninstalls), always default to `<requires_approval>true</requires_approval>` unless an explicit auto-approval rule or direct, unambiguous user instruction for that specific instance dictates otherwise.
- Be aware of and utilize the "Proceed While Running" mode for long-running commands, and be prepared to monitor and react to streamed terminal output (e.g., to fix compilation errors).

## Extending CLI Capabilities with MCP Servers
- Recognize that MCP servers can provide richer or more autonomous CLI control than `<execute_command>` alone (e.g., iTerm MCP for REPLs, mcp-cli-exec for structured output, Secure CLI MCP for sandboxed execution).
- If a task requires advanced CLI interaction not well-suited to `<execute_command>` (like managing an interactive REPL session, needing fine-grained control over stdio, or requiring reliable structured JSON output from commands), assess if an available and configured MCP server offers a more appropriate tool.
- If a relevant MCP server is configured by the user (e.g., in `cline_mcp_settings.json`), use the `<use_mcp_tool>` to invoke its specific tools.
- Understand the operational model of MCP servers: they are typically local processes communicating with Cline via stdio, ensuring data remains local.
- Specific MCP Server Considerations:
    - **mcp-cli-exec:** Expect structured JSON results (success status, exit code, stdout, stderr), which should be parsed for robust error handling and output analysis.
    - **iTerm-MCP (macOS):** Useful for interactive terminal sessions (REPLs). Can fetch specific portions of terminal output (e.g., last N lines) to optimize token usage. Be mindful that it typically lacks safety filtering.
    - **Secure CLI MCP:** Adhere to its security model, which may include an `ALLOWED_DIR`, whitelisted `ALLOWED_COMMANDS`, and restrictions on shell operators. Commands must be compatible with these policies.

## Configuring and Respecting Autonomy Settings
- Be aware of Cline's command auto-approval rules system (if implemented and active). Adhere to these user-defined rules for when to prompt for approval versus proceeding automatically.
- Understand that setting `<requires_approval>false</requires_approval>` in an `<execute_command>` tool call is an explicit instruction to bypass user prompting for that specific command.
- Recognize that once an MCP server is configured by the user in `cline_mcp_settings.json`, its tools become available for use via `<use_mcp_tool>`, potentially without further per-call approval depending on the MCP server's nature and Cline's settings.

## Security Best Practices in Autonomous Operations
- Always remember that Cline's default behavior is to require explicit user approval for file modifications and terminal commands. Any move towards greater autonomy must be intentional and align with user configuration and consent.
- When planning or executing automated CLI tasks, especially those with `<requires_approval>false</requires_approval>` or via powerful MCPs:
    - Prioritize safety. If unsure about a command's impact, err on the side of caution (e.g., request approval or clarification).
    - Discuss and recommend security best practices with the user if relevant to the task, such as:
        - Using whitelisting and sandboxing mechanisms (e.g., Secure CLI MCP, containers, VMs).
        - Operating with the principle of least privilege.
        - Utilizing temporary workspaces or version-controlled environments for critical operations to allow for easy rollbacks.
    - Prefer MCP tools that provide structured output (e.g., JSON from mcp-cli-exec) as this aids in reliable error detection and parsing, reducing risks from unexpected raw text output.
- Reassure the user, when appropriate, that Cline operates as a client-side VS Code extension, and all local file operations and commands (including those via MCPs) run on their machine, with data remaining local (except for necessary interactions with external APIs like LLMs).

## User Interaction for Complex CLI Tasks
- Notwithstanding the goal of increased automation, if a task requires complex, real-time interactive sequences with a CLI application (e.g., responding to multiple, unpredictable prompts from a script initiated via `<execute_command>`), and current tools (including available MCPs) do not support this level of interaction, clearly communicate this limitation. Request user assistance for performing the interactive parts manually, based on current technical capabilities.

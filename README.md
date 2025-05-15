# AI Agent

This project is an AI agent built in a Node.js environment, fully aligned with MCP server configuration and workspace standards.

## Environment

- Node.js version: 20.11.1 (see `.nvmrc`)
- npm global prefix: `D:/Dev/npm-global`
- npm cache: `D:/Dev/npm-cache`
- All configuration files are local to this project to ensure compatibility with MCP servers and the broader dev environment.

## Setup

1. Use `nvm use` to activate Node.js 20.11.1.
2. All npm installs will use the global prefix and cache on D: as per `.npmrc`.
3. Project directory: `d:/Dev/ai-agent`

## Features

- **Semantic Memory with LanceDB:** Stores, retrieves, and semantically searches memory entries using LanceDB as a local vector database and OpenAI embeddings for vectorization.
- **Embedding Pipeline:** All memory entries, code snippets, and documentation are embedded using OpenAI's API and stored in LanceDB for fast semantic retrieval.
- **Tested Integration:** Includes a test script that verifies the full semantic memory flow (embedding, storage, retrieval, and search) with human-readable output.
- Robust YouTube transcript retrieval with a 3-step fallback:
  1. Try MCP tool (`get_youtube_video_transcript`)
  2. Fallback to `youtube-transcript-plus` Node.js package
  3. Graceful error if no transcript is available
- Transcript analysis using DeepSeek LLM API (OpenAI-compatible, cost-effective)
- Prompts are generated based on the actual video content
- Prompts are saved to a Markdown file (`prompts.md`) after each analysis
- Interactive CLI: ask follow-up questions about the video/prompts, analyze new videos, or exit at any time

## Prerequisites

- Node.js 20.11.1 (`nvm use` recommended)
- `node-fetch` installed (already included in package.json)
- `@lancedb/lancedb` and `apache-arrow` installed for LanceDB integration
- `git` command-line tool installed and in your system's PATH (for GitHub repository analysis).
- Internet access for fetching YouTube transcripts, cloning GitHub repositories, calling the LLM API, and generating embeddings.
- **API Keys:**
  - **OpenAI API Key:** Required for embedding pipeline and semantic memory.
  - **DeepSeek API Key:** Required for LLM analysis.
  - **GitHub Personal Access Token (PAT):** Optional, but needed for accessing private repositories or to avoid rate limits on public repositories.
- These keys can be set as environment variables (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GITHUB_PAT`) or in the `config.json` file. Environment variables will override `config.json` values.

## Configuration

The agent can be configured using a `config.json` file in the project root (`ai-agent/config.json`). If this file is not present, default settings and environment variables will be used. An example configuration file (`config.json.example`) is provided.

**`config.json` Settings:**

-   `openaiApiKey` (string): Your OpenAI API key for embeddings. (Overrides `OPENAI_API_KEY` env var if env var is not set).
-   `deepseekApiKey` (string): Your DeepSeek API key. (Overrides `DEEPSEEK_API_KEY` env var if env var is not set).
-   `githubPat` (string): Your GitHub Personal Access Token. (Overrides `GITHUB_PAT` env var if env var is not set).
-   `llmModelYouTube` (string): The LLM model to use for YouTube transcript analysis (e.g., "deepseek-chat").
-   `llmModelRepo` (string): The LLM model for GitHub repository and local project analysis.
-   `llmModelFollowUp` (string): The LLM model for follow-up questions.
-   `maxTokensYouTube` (number): Max tokens for YouTube analysis LLM calls.
-   `maxTokensRepo` (number): Max tokens for repository/local project analysis LLM calls.
-   `maxTokensFollowUp` (number): Max tokens for follow-up LLM calls.
-   `temperatureYouTube` (number): Temperature setting for YouTube analysis (0.0 - 1.0).
-   `temperatureRepo` (number): Temperature for repository/local project analysis.
-   `temperatureFollowUp` (number): Temperature for follow-up questions.
-   `outputDir` (string): Directory where generated blueprint files are saved (e.g., "output").
-   `tempClonesBaseDir` (string): Base directory for temporarily cloning GitHub repositories (e.g., "temp-clones").
-   `maxTotalContentSize` (number): Maximum total size (in bytes) of concatenated file content to send to the LLM for repository/local analysis.
-   `maxSourceFilesToScan` (number): Maximum number of source files to consider for inclusion in repository/local analysis (after READMEs, memory bank, and package files).
-   `maxSourceFileSize` (number): Maximum size (in bytes) for an individual source file to be included.

Environment variables `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, and `GITHUB_PAT` will always take precedence if set.

## Usage

1. In this directory, run:

   ```
   node src/agent.js
   ```

2. When prompted, enter a YouTube video URL or GitHub repository URL.

3. The agent will:
   - Fetch the transcript for the video using the fallback strategy
   - Analyze the transcript with DeepSeek LLM
   - Generate a set of prompts for a coding agent based on the video content
   - Save the prompts to `prompts.md`
   - Store, embed, and retrieve semantic memory using LanceDB and OpenAI embeddings
   - Enter an interactive mode where you can ask follow-up questions or analyze new videos

## Roadmap

- **Next:** Memory Visualization and Editing UI (CLI or web-based)
- Automated contextual prompt engineering
- Agent autonomy and task chaining
- Plugin/tooling ecosystem for external integrations
- Cloud/server deployment, multi-user support, and advanced analytics
- Support for additional LLM providers (Together, Groq, OpenAI, etc.)
- Enhanced prompt engineering and output formatting
- Optional: export full conversation history to Markdown

---

**What’s Done:**  
- Hierarchical memory, dynamic context, profile learning, and full semantic memory retrieval via LanceDB and OpenAI embeddings.
- Test script for LanceDB integration and embedding pipeline.

**What’s Needed / Next:**  
- Memory Visualization and Editing UI
- Automated prompt engineering
- Agent autonomy and task chaining
- Plugin ecosystem, cloud deployment, and advanced analytics

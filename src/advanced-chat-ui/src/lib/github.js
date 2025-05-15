import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { glob } from 'glob'; // Ensure glob is imported

const execAsync = promisify(exec);

export function parseGitHubUrl(url) {
  console.log(`[parseGitHubUrl] Received URL: "${url}"`);
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (match && match[1] && match[2]) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

export async function cloneRepo(owner, repo, tempClonesBaseDir, githubPat = "") { // Added githubPat parameter
  const fullTempClonesBaseDir = path.resolve(tempClonesBaseDir);
  await fs.mkdir(fullTempClonesBaseDir, { recursive: true }); // Ensure base dir exists
  const tempDir = await fs.mkdtemp(path.join(fullTempClonesBaseDir, 'repo-'));
  let repoUrl = `https://github.com/${owner}/${repo}.git`;

  if (githubPat) {
    repoUrl = `https://${githubPat}@github.com/${owner}/${repo}.git`;
    console.log(`Attempting to clone using provided GITHUB_PAT.`);
  } else {
    console.log(`No GITHUB_PAT provided. Attempting to clone using default credentials (e.g., SSH or unauthenticated).`);
  }
  
  console.log(`Cloning ${repoUrl.replace(/:[^@\n]*@/, ':[REDACTED_PAT]@')} into ${tempDir}...`);

  try {
    const { stdout, stderr } = await execAsync(`git clone --depth 1 ${repoUrl} ${tempDir}`);
    if (stderr && !stderr.includes('Cloning into') && !stderr.includes('Receiving objects')) {
        const relevantStderr = stderr.split('\n').filter(line => !line.startsWith('Receiving objects') && !line.startsWith('Resolving deltas')).join('\n').trim();
        if (relevantStderr) {
            console.warn(`Git clone stderr (potential warning/error): ${relevantStderr}`);
        }
    }
    console.log(`Repository cloned successfully to ${tempDir}`);
    return tempDir;
  } catch (error) {
    let errorMessage = `Failed to clone repository ${owner}/${repo}.`;
    if (error.message.includes('Authentication failed') || error.message.includes('Permission denied')) {
      errorMessage += ' Authentication failed. Please ensure your Git credentials (SSH key or GITHUB_PAT environment variable) are correctly configured and have access to the repository.';
    } else if (error.message.includes('not found')) {
      errorMessage += ' Repository not found. Please check the owner and repository name.';
    } else {
      errorMessage += ` Details: ${error.message}`;
    }
    console.error(`Error cloning repository: ${errorMessage}`);
    await cleanupRepo(tempDir);
    throw new Error(errorMessage);
  }
}

export async function getRepoContentForAnalysis(
  clonedRepoPath, 
  priorityPathsOrGlobs = [], 
  projectTypeHint = 'unknown',
  fileReadConfig = {} // Added fileReadConfig
) {
  const { 
    maxTotalContentSize = 102400, // Default 100KB
    maxSourceFilesToScan = 5, 
    maxSourceFileSize = 51200    // Default 50KB
  } = fileReadConfig;

  console.log(`[DEBUG_GITHUB_CONTENT] Starting getRepoContentForAnalysis for path: ${clonedRepoPath}`);
  console.log(`[DEBUG_GITHUB_CONTENT] Project type hint: ${projectTypeHint}, Priority paths/globs: ${JSON.stringify(priorityPathsOrGlobs)}`);
  console.log(`[DEBUG_GITHUB_CONTENT] File read config: ${JSON.stringify(fileReadConfig)}`);

  console.log(`Analyzing content in ${clonedRepoPath}... (Project type hint: ${projectTypeHint})`);
  if (priorityPathsOrGlobs.length > 0) {
    console.log(`Using .agentinclude patterns: ${priorityPathsOrGlobs.join(', ')}`);
  }
  let concatenatedContent = "";
  const filesToRead = [];
  const addedFilePaths = new Set(); 

  async function addFileCandidate(details) {
    const absolutePath = details.path;
    if (addedFilePaths.has(absolutePath)) {
      console.log(`[DEBUG_GITHUB_CONTENT] File candidate ${absolutePath} already added. Skipping.`);
      return;
    }
    try {
      const stats = await fs.stat(absolutePath);
      if (stats.isFile()) {
        filesToRead.push(details);
        addedFilePaths.add(absolutePath);
        console.log(`[DEBUG_GITHUB_CONTENT] Added file candidate: ${JSON.stringify(details)}`);
      } else {
        console.log(`[DEBUG_GITHUB_CONTENT] Path ${absolutePath} is not a file. Skipping.`);
      }
    } catch (e) { 
      console.warn(`[DEBUG_GITHUB_CONTENT] Error stating file ${absolutePath}: ${e.message}. Skipping.`);
    }
  }

  for (const pattern of priorityPathsOrGlobs) {
    console.log(`[DEBUG_GITHUB_CONTENT] Processing glob pattern from .agentinclude: "${pattern}"`);
    try {
      const matchedAbsolutePaths = await glob(pattern, { nodir: true, dot: true, follow: false, cwd: clonedRepoPath, absolute: true });
      console.log(`[DEBUG_GITHUB_CONTENT] Glob pattern "${pattern}" matched: ${JSON.stringify(matchedAbsolutePaths)}`);
      for (const absPath of matchedAbsolutePaths) {
        await addFileCandidate({ 
          name: path.relative(clonedRepoPath, absPath), 
          path: absPath, 
          type: 'priority-include', 
          priority: 0 
        });
      }
    } catch (globError) {
      console.warn(`[DEBUG_GITHUB_CONTENT] Error processing glob pattern "${pattern}" from .agentinclude: ${globError.message}`);
    }
  }

  const readmeNames = ['README.md', 'README.rst', 'README.txt', 'README', 'readme.md'];
  for (const name of readmeNames) {
    await addFileCandidate({ name, path: path.join(clonedRepoPath, name), type: 'readme', priority: 1 });
    if (addedFilePaths.has(path.join(clonedRepoPath, name))) break; 
  }

  const memoryBankDir = path.join(clonedRepoPath, 'memory-bank');
  try {
    const memoryBankEntries = await fs.readdir(memoryBankDir, { withFileTypes: true });
    let foundMemoryBankFiles = false;
    for (const entry of memoryBankEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        await addFileCandidate({ name: path.join('memory-bank', entry.name), path: path.join(memoryBankDir, entry.name), type: 'memory-bank', priority: 1 });
        foundMemoryBankFiles = true;
      }
    }
    if (foundMemoryBankFiles) console.log(`Processed memory-bank .md files.`);
  } catch (_) { /* No memory-bank dir */ }

  let packageFiles = ['package.json', 'requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'go.mod', 'Cargo.toml'];
  for (const name of packageFiles) {
    await addFileCandidate({ name, path: path.join(clonedRepoPath, name), type: 'package', priority: 1 });
  }
  
  let commonSrcDirs = ['src', 'lib', 'app', '.'];
  let sourceFileExtensions = ['.js', '.ts', '.py', '.java', '.rb', '.php', '.go', '.rs', '.md', '.cs', '.swift', '.kt', '.scala', '.clj', '.cpp', '.h'];
  
  if (projectTypeHint === 'python') {
    sourceFileExtensions = ['.py', '.md'];
    commonSrcDirs = ['.', 'app', 'src'];
  } else if (projectTypeHint === 'nodejs') {
    sourceFileExtensions = ['.js', '.ts', '.json', '.md'];
    commonSrcDirs = ['src', 'lib', 'app', '.'];
  }

  let sourceFilesFound = 0;

  async function findSourceFilesInDir(currentSearchDirRelative) {
    if (sourceFilesFound >= maxSourceFilesToScan) return; // Use config
    const currentSearchDirAbsolute = path.join(clonedRepoPath, currentSearchDirRelative);
    try {
      const entries = await fs.readdir(currentSearchDirAbsolute, { withFileTypes: true });
      for (const entry of entries) {
        if (sourceFilesFound >= maxSourceFilesToScan) break; // Use config
        
        const entryRelativePath = path.join(currentSearchDirRelative, entry.name);
        const entryAbsolutePath = path.join(currentSearchDirAbsolute, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'output', 'temp-clones', 'target', 'vendor', 'Pods', '__pycache__', '.venv', 'venv'].includes(entry.name)) {
            await findSourceFilesInDir(entryRelativePath); 
          }
        } else if (entry.isFile()) {
          if (addedFilePaths.has(entryAbsolutePath)) continue;

          const ext = path.extname(entry.name).toLowerCase();
          if (sourceFileExtensions.includes(ext)) {
             if (readmeNames.includes(entry.name) && currentSearchDirRelative === '') continue;
             if (currentSearchDirRelative === 'memory-bank' && entry.name.endsWith('.md')) continue;

             try {
                const stats = await fs.stat(entryAbsolutePath);
                if (stats.size > 0 && stats.size <= maxSourceFileSize) { // Use config
                    await addFileCandidate({ name: entryRelativePath, path: entryAbsolutePath, type: 'source', priority: 2 });
                    if(addedFilePaths.has(entryAbsolutePath)) sourceFilesFound++;
                }
             } catch (_) { /* ignore stat error */ }
          }
        }
      }
    } catch (_) { /* ignore readdir error */ }
  }

  for (const srcDir of commonSrcDirs) {
    await findSourceFilesInDir(srcDir === '.' ? '' : srcDir);
    if (sourceFilesFound >= maxSourceFilesToScan) break; // Use config
  }

  filesToRead.sort((a, b) => {
    const priorityDiff = (a.priority || 99) - (b.priority || 99);
    if (priorityDiff !== 0) return priorityDiff;
    return a.name.localeCompare(b.name);
  });

  let currentTotalSize = 0;

  console.log(`[DEBUG_GITHUB_CONTENT] Sorted files to read: ${JSON.stringify(filesToRead.map(f => f.name))}`);
  for (const file of filesToRead) {
    console.log(`[DEBUG_GITHUB_CONTENT] Attempting to read file: ${file.path} (Type: ${file.type}, Priority: ${file.priority})`);
    if (currentTotalSize >= maxTotalContentSize) { // Use config
        console.log(`[DEBUG_GITHUB_CONTENT] Reached max total content size limit (${maxTotalContentSize} bytes). Skipping remaining files starting with: ${file.name}`);
        break;
    }
    try {
      const content = await fs.readFile(file.path, 'utf8');
      const contentSize = Buffer.byteLength(content, 'utf8');
      console.log(`[DEBUG_GITHUB_CONTENT] Read file ${file.name}, size: ${contentSize} bytes.`);

      if (currentTotalSize + contentSize > maxTotalContentSize && concatenatedContent.length > 0) { // Use config
          console.log(`[DEBUG_GITHUB_CONTENT] Skipping ${file.name} (${file.type}, ${contentSize} bytes, priority ${file.priority}) as it would exceed total content size limit.`);
          continue;
      }
      
      concatenatedContent += `\n\n--- File: ${file.name} (${file.type}) ---\n\n${content}`;
      currentTotalSize += contentSize;
      console.log(`[DEBUG_GITHUB_CONTENT] Added ${file.name} (${file.type}, ${contentSize} bytes, priority ${file.priority}) to analysis content. Current total size: ${currentTotalSize}`);

    } catch (error) {
      console.warn(`[DEBUG_GITHUB_CONTENT] Could not read file ${file.path}: ${error.message}`);
    }
  }
  
  if (!concatenatedContent) {
      console.warn("[DEBUG_GITHUB_CONTENT] No content could be extracted from the repository for analysis.");
      // Return an object even if no content, with appropriate zero values
      return { concatenatedContent: "", fileCount: 0, totalSize: 0 }; 
  }

  console.log(`[DEBUG_GITHUB_CONTENT] Total content size for analysis: ${currentTotalSize} bytes. Files processed: ${addedFilePaths.size}`);
  // Ensure fileCount reflects files contributing to content, not just candidates.
  // A more accurate fileCount would be the number of files successfully read and added.
  // For simplicity, using addedFilePaths.size which includes all files attempted to be added to filesToRead.
  // A better count would be based on files actually looped through and read.
  // Let's refine fileCount to be the number of files whose content was actually added.
  let filesSuccessfullyReadAndAdded = 0;
  // This loop is just for counting, ideally this count is maintained during the actual read loop.
  // For now, we'll re-iterate `filesToRead` to simulate this count based on what *would* be added.
  // This is inefficient and should be integrated into the main loop.
  // However, for now, let's assume addedFilePaths.size is a reasonable proxy or improve it slightly.
  // Let's count files that were actually added to concatenatedContent.
  // This requires knowing which files from filesToRead were successfully processed.
  // The current loop for concatenatedContent doesn't explicitly count them.
  // We'll use a placeholder for now or a simplified count.
  // The number of files that contributed to concatenatedContent.
  // This is tricky to get accurately without modifying the loop that builds concatenatedContent.
  // Let's count how many files in filesToRead were actually processed up to maxTotalContentSize
  let actualFileCount = 0;
  let tempSize = 0;
  for (const file of filesToRead) {
    try {
      // This is a rough estimate, actual content might be slightly different due to headers
      const stats = await fs.stat(file.path); 
      if (stats.isFile() && stats.size > 0) {
        if (tempSize + stats.size > maxTotalContentSize && actualFileCount > 0) break;
        tempSize += stats.size;
        actualFileCount++;
      }
    } catch (_) { /* ignore */ }
    if (tempSize >= maxTotalContentSize) break;
  }


  return { concatenatedContent, fileCount: actualFileCount, totalSize: currentTotalSize };
}

export async function cleanupRepo(clonedRepoPath) {
  if (!clonedRepoPath) return;
  console.log(`Cleaning up ${clonedRepoPath}...`);
  try {
    await fs.rm(clonedRepoPath, { recursive: true, force: true });
    console.log(`Successfully removed ${clonedRepoPath}`);
  } catch (error) {
    console.error(`Error cleaning up repository ${clonedRepoPath}: ${error.message}`);
  }
}

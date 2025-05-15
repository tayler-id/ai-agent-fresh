// Prompt generator for coding agent

/**
 * Generates a detailed Markdown blueprint and a list of console prompts
 * from the LLM's "Blueprint" analysis object.
 * @param {object} blueprintAnalysis - The "Blueprint" analysis object from the LLM.
 * @param {string} sourceUrlOrPath - The original URL or path that was analyzed.
 * @param {string} analysisType - "GitHub" or "YouTube" or "Local Project".
 * @returns {{ markdownBlueprint: string, consolePrompts: string[] }}
 */
function formatBlueprintOutput(blueprintAnalysis, sourceUrlOrPath, analysisType) {
  const consolePrompts = [];
  let markdownBlueprint = `# Improvement & Re-implementation Blueprint for ${analysisType}: ${sourceUrlOrPath}\n\n`;

  if (blueprintAnalysis.originalProjectSummary) {
    markdownBlueprint += `## Original Project Summary\n`;
    if (blueprintAnalysis.originalProjectSummary.purpose) {
      markdownBlueprint += `### Purpose\n${blueprintAnalysis.originalProjectSummary.purpose}\n\n`;
      consolePrompts.push(`Original Purpose: ${blueprintAnalysis.originalProjectSummary.purpose}`);
    }
    if (Array.isArray(blueprintAnalysis.originalProjectSummary.coreMechanics) && blueprintAnalysis.originalProjectSummary.coreMechanics.length > 0) {
      markdownBlueprint += `### Core Mechanics/Concepts\n`;
      blueprintAnalysis.originalProjectSummary.coreMechanics.forEach(m => markdownBlueprint += `- ${m}\n`);
      markdownBlueprint += `\n`;
      consolePrompts.push(`Original Core Mechanics: ${blueprintAnalysis.originalProjectSummary.coreMechanics.join('; ')}`);
    }
  }

  if (blueprintAnalysis.suggestedEnhancedVersion) {
    const enhanced = blueprintAnalysis.suggestedEnhancedVersion;
    markdownBlueprint += `## Suggested Enhanced Version\n`;
    if (enhanced.concept) {
      markdownBlueprint += `### Concept for Enhancement\n${enhanced.concept}\n\n`;
      consolePrompts.push(`Suggested Enhancement Concept: ${enhanced.concept}`);
    }

    if (Array.isArray(enhanced.keyEnhancements) && enhanced.keyEnhancements.length > 0) {
      markdownBlueprint += `### Key Enhancements & Actionable Steps\n`;
      enhanced.keyEnhancements.forEach((enh, idx) => {
        markdownBlueprint += `#### ${idx + 1}. ${enh.enhancementTitle || 'Untitled Enhancement'}\n`;
        if (enh.description) markdownBlueprint += `**Description:** ${enh.description}\n`;
        if (enh.reasoning) markdownBlueprint += `**Reasoning:** ${enh.reasoning}\n`;
        if (Array.isArray(enh.actionableStepsForCodingAgent) && enh.actionableStepsForCodingAgent.length > 0) {
          markdownBlueprint += `**Actionable Steps for Coding Agent:**\n`;
          enh.actionableStepsForCodingAgent.forEach(step => markdownBlueprint += `  - ${step}\n`);
          consolePrompts.push(`Enhancement: ${enh.enhancementTitle || 'Untitled'} - Steps: ${enh.actionableStepsForCodingAgent.join('; ')}`);
        }
        if (enh.relevantOriginalContext && enh.relevantOriginalContext.length > 0) {
          markdownBlueprint += `**Builds upon/replaces:** ${enh.relevantOriginalContext.join(', ')}\n`;
        }
        markdownBlueprint += `\n`;
      });
    }

    if (Array.isArray(enhanced.suggestedTechStack) && enhanced.suggestedTechStack.length > 0) {
      markdownBlueprint += `### Suggested Tech Stack for Enhanced Version\n`;
      enhanced.suggestedTechStack.forEach(t => markdownBlueprint += `- ${t}\n`);
      markdownBlueprint += `\n`;
      consolePrompts.push(`Suggested Tech Stack for Enhancement: ${enhanced.suggestedTechStack.join(', ')}`);
    }

    if (Array.isArray(enhanced.criticalFilesToCreateOrModify) && enhanced.criticalFilesToCreateOrModify.length > 0) {
      markdownBlueprint += `### Critical Files to Create/Modify for Enhanced Version\n`;
      enhanced.criticalFilesToCreateOrModify.forEach(f => markdownBlueprint += `- ${f}\n`);
      markdownBlueprint += `\n`;
    }

    if (enhanced.suggestedBoilerplate) {
      markdownBlueprint += `### Suggested Boilerplate Code\n${enhanced.suggestedBoilerplate}\n\n`;
      consolePrompts.push(`Suggested Boilerplate: ${enhanced.suggestedBoilerplate.substring(0, 100)}...`);
    }

    if (Array.isArray(enhanced.gapAnalysis) && enhanced.gapAnalysis.length > 0) {
      markdownBlueprint += `### Gap Analysis & Competitive Advantages\n`;
      enhanced.gapAnalysis.forEach(gap => markdownBlueprint += `- ${gap}\n`);
      markdownBlueprint += `\n`;
      consolePrompts.push(`Identified Gaps: ${enhanced.gapAnalysis.join('; ')}`);
    }
  }
  
  // Add a generic prompt if no specific enhancements were detailed enough for console
  if (consolePrompts.length < 3) { // Ensure there's some actionable output for console
      consolePrompts.push("Review the detailed blueprint for specific tasks and steps.");
      consolePrompts.push("Consider the overall enhancement concept and how to break it down further.");
  }

  return { markdownBlueprint, consolePrompts };
}


/**
 * Generates coding prompts from LLM analysis of a YouTube video (new Blueprint structure).
 * @param {object} blueprintAnalysis - The "Blueprint" analysis object from the LLM.
 * @param {string} videoUrl - The URL of the YouTube video.
 * @returns {{ markdownBlueprint: string, consolePrompts: string[] }}
 */
export function generatePrompts(blueprintAnalysis, videoUrl) {
  return formatBlueprintOutput(blueprintAnalysis, videoUrl, "YouTube Video");
}

/**
 * Generates coding prompts from LLM analysis of a GitHub repository (new Blueprint structure).
 * @param {object} blueprintAnalysis - The "Blueprint" analysis object from the LLM.
 * @param {string} repoUrlOrPath - The URL or local path of the repository/project.
 * @param {string} analysisType - "GitHub Repository" or "Local Project".
 * @returns {{ markdownBlueprint: string, consolePrompts: string[] }}
 */
export function generateRepoPrompts(blueprintAnalysis, repoUrlOrPath, analysisType = "GitHub Repository") {
  return formatBlueprintOutput(blueprintAnalysis, repoUrlOrPath, analysisType);
}

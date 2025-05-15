/**
 * Developer Profile Module
 * 
 * Stores and retrieves personalized contextual profiles for developers.
 * Profiles capture preferences, coding patterns, and behavioral context.
 */

import fs from 'fs/promises';
import path from 'path';

const PROFILE_DIR = path.resolve('developer-profiles');

/**
 * Ensure the profile directory exists.
 */
async function ensureProfileDir() {
  try {
    await fs.mkdir(PROFILE_DIR, { recursive: true });
  } catch (_err) { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Ignore if directory already exists or other minor errors during creation
  }
}

/**
 * Get the file path for a developer's profile.
 * @param {string} developerId 
 * @returns {string}
 */
function getProfileFilePath(developerId) {
  return path.join(PROFILE_DIR, `${developerId}.json`);
}

/**
 * Load a developer profile by ID.
 * @param {string} developerId 
 * @returns {Promise<object|null>}
 */
export async function loadDeveloperProfile(developerId) {
  await ensureProfileDir();
  const filePath = getProfileFilePath(developerId);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Save a developer profile.
 * @param {string} developerId 
 * @param {object} profileData 
 */
export async function saveDeveloperProfile(developerId, profileData) {
  await ensureProfileDir();
  const filePath = getProfileFilePath(developerId);
  await fs.writeFile(filePath, JSON.stringify(profileData, null, 2), 'utf8');
}

/**
 * Update a developer profile with new preferences or patterns.
 * @param {string} developerId 
 * @param {object} updates 
 */
export async function updateDeveloperProfile(developerId, updates) {
  const profile = (await loadDeveloperProfile(developerId)) || {};
  const updated = { ...profile, ...updates, lastUpdated: new Date().toISOString() };
  await saveDeveloperProfile(developerId, updated);
  return updated;
}

/**
 * Example: Create or update a profile with a new coding pattern.
 * @param {string} developerId 
 * @param {string} pattern 
 */
export async function addCodingPattern(developerId, pattern) {
  const profile = (await loadDeveloperProfile(developerId)) || {};
  profile.codingPatterns = profile.codingPatterns || [];
  if (!profile.codingPatterns.includes(pattern)) {
    profile.codingPatterns.push(pattern);
  }
  await saveDeveloperProfile(developerId, profile);
  return profile;
}

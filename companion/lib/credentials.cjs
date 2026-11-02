'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { keyFromEnvFile } = require('./ai.cjs');

function samePath(left, right) {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

async function exists(file) {
  try { await fs.stat(file); return true; } catch { return false; }
}

async function isDetectiveRoot(folder) {
  if (path.basename(folder).toLowerCase() === 'release-detective') return true;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
    return manifest.name === 'release-detective';
  } catch { return false; }
}

async function envPath(folder) {
  return await isDetectiveRoot(folder)
    ? path.join(folder, '.env') : path.join(folder, 'release-detective', '.env');
}

async function resolveOpenRouterKey({ storedKey = '', environmentKey = '', activeFile = '', workspaceFolders = [], homeDirectory = os.homedir() } = {}) {
  if (storedKey.trim()) return storedKey.trim();
  if (environmentKey.trim()) return environmentKey.trim();
  const folders = workspaceFolders.filter(folder => path.isAbsolute(folder));

  if (activeFile && path.isAbsolute(activeFile)) {
    let directory = path.dirname(activeFile);
    // Walk only the active file's ancestors, never siblings or a whole repository.
    // A project identity or Git boundary prevents borrowing another project's key.
    for (let depth = 0; depth < 16; depth++) {
      const parent = path.dirname(directory);
      if (samePath(directory, homeDirectory) || samePath(directory, parent)) break;
      const detectiveRoot = await isDetectiveRoot(directory);
      const gitRoot = await exists(path.join(directory, '.git'));
      const workspaceRoot = folders.some(folder => samePath(folder, directory));
      if (detectiveRoot || gitRoot || workspaceRoot) {
        const key = await keyFromEnvFile(await envPath(directory));
        if (key) return key;
      }
      if (detectiveRoot || gitRoot) break;
      directory = parent;
    }
    return '';
  }

  // Untitled documents have no project ancestry; retain explicit workspace lookup.
  for (const folder of folders) {
    const key = await keyFromEnvFile(await envPath(folder));
    if (key) return key;
  }
  return '';
}

module.exports = { resolveOpenRouterKey };

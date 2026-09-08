import {
  parseEnvAssignments,
  readEnvFile,
  resolveEnvFilePath,
} from '../config/env-file';

export function loadRootEnv(): void {
  try {
    for (const [key, value] of parseEnvAssignments(
      readEnvFile(resolveEnvFilePath()),
    )) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

loadRootEnv();

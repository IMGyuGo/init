import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface LoadWorkerEnvFilesOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LoadWorkerEnvFilesResult {
  loadedPaths: string[];
}

export function loadWorkerEnvFiles(options: LoadWorkerEnvFilesOptions = {}): LoadWorkerEnvFilesResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const loadedPaths: string[] = [];

  for (const envPath of unique([resolve(cwd, ".env"), resolve(cwd, "..", "..", ".env")])) {
    if (!existsSync(envPath)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      env[key] ??= value;
    }
    loadedPaths.push(envPath);
  }

  return { loadedPaths };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawName, ...rawValueParts] = trimmed.split("=");
    const name = rawName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      continue;
    }

    parsed[name] = unquote(rawValueParts.join("=").trim());
  }

  return parsed;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

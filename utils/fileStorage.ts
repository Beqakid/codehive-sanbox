import fs from 'fs';
import path from 'path';

const lockMap = new Map<string, Promise<void>>();

function getLockKey(filePath: string): string {
  return path.resolve(filePath);
}

async function acquireLock(filePath: string): Promise<() => void> {
  const key = getLockKey(filePath);

  let resolveLock!: () => void;
  const newLock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  const existingLock = lockMap.get(key) ?? Promise.resolve();
  lockMap.set(key, existingLock.then(() => newLock));

  await existingLock;

  return () => {
    resolveLock();
    if (lockMap.get(key) === newLock) {
      lockMap.delete(key);
    }
  };
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const resolvedPath = path.resolve(filePath);

  try {
    const raw = await fs.promises.readFile(resolvedPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    throw new Error(
      `Failed to read file at ${resolvedPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const releaseLock = await acquireLock(resolvedPath);

  try {
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });

    const tmpPath = `${resolvedPath}.tmp`;
    const serialized = JSON.stringify(data, null, 2);

    await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
    await fs.promises.rename(tmpPath, resolvedPath);
  } catch (error: unknown) {
    throw new Error(
      `Failed to write file at ${resolvedPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    releaseLock();
  }
}

export async function readJsonFileSafe<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return defaultValue;
  }
}

export async function updateJsonFile<T>(
  filePath: string,
  updater: (current: T) => T,
  defaultValue: T
): Promise<T> {
  const resolvedPath = path.resolve(filePath);
  const releaseLock = await acquireLock(resolvedPath);

  try {
    let current: T;

    try {
      const raw = await fs.promises.readFile(resolvedPath, 'utf-8');
      current = JSON.parse(raw) as T;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        current = defaultValue;
      } else {
        throw error;
      }
    }

    const updated = updater(current);

    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });

    const tmpPath = `${resolvedPath}.tmp`;
    const serialized = JSON.stringify(updated, null, 2);

    await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
    await fs.promises.rename(tmpPath, resolvedPath);

    return updated;
  } catch (error: unknown) {
    throw new Error(
      `Failed to update file at ${resolvedPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    releaseLock();
  }
}
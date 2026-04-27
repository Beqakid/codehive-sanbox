import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Hashes a password using bcrypt.
 * @param password - The plain text password.
 * @returns Promise resolving to the hashed password.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a password against a bcrypt hash.
 * @param password - The plain text password to check.
 * @param hash - The bcrypt hash to compare.
 * @returns Promise resolving to true if match, false otherwise.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (
    !password ||
    typeof password !== 'string' ||
    !hash ||
    typeof hash !== 'string'
  ) {
    return false;
  }
  return await bcrypt.compare(password, hash);
}
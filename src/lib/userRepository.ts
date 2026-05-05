import { User } from '@/types/auth';

export interface CreateUserInput {
  id: string;
  email: string;
  password: string;
  created_at: number;
  updated_at: number;
}

export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT id, email, password, created_at, updated_at FROM users WHERE email = ?')
    .bind(email)
    .first<User>();

  return result ?? null;
}

export async function findUserById(
  db: D1Database,
  id: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT id, email, password, created_at, updated_at FROM users WHERE id = ?')
    .bind(id)
    .first<User>();

  return result ?? null;
}

export async function createUser(
  db: D1Database,
  input: CreateUserInput
): Promise<User> {
  const { id, email, password, created_at, updated_at } = input;

  await db
    .prepare(
      'INSERT INTO users (id, email, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, email, password, created_at, updated_at)
    .run();

  const created = await findUserById(db, id);

  if (!created) {
    throw new Error('Failed to retrieve user after creation');
  }

  return created;
}

export async function userExistsByEmail(
  db: D1Database,
  email: string
): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ '1': number }>();

  return result !== null;
}
import bcrypt from 'bcrypt';
import pool from '../pool';
import { User, RegisterDto } from '../../types';

const SALT_ROUNDS = 12;

export interface CreateUserResult {
  id: string;
  username: string;
  email: string;
  created_at: Date;
}

export interface UserWithHash extends User {}

async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, username, email, password_hash, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

async function findByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, username, email, password_hash, created_at
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

async function findByUsername(username: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, username, email, password_hash, created_at
     FROM users
     WHERE username = $1`,
    [username]
  );
  return result.rows[0] ?? null;
}

async function create(dto: RegisterDto): Promise<CreateUserResult> {
  const { username, email, password } = dto;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await pool.query<CreateUserResult>(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash]
  );

  return result.rows[0];
}

async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

async function updatePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

async function deleteById(userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1`,
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
}

async function emailExists(email: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS exists`,
    [email]
  );
  return result.rows[0].exists;
}

async function usernameExists(username: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) AS exists`,
    [username]
  );
  return result.rows[0].exists;
}

export const UserModel = {
  findById,
  findByEmail,
  findByUsername,
  create,
  verifyPassword,
  updatePassword,
  deleteById,
  emailExists,
  usernameExists,
};

export default UserModel;
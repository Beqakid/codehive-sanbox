-- PCS App V2 - D1 Database Schema
-- Cloudflare D1 (SQLite) compatible

-- Drop tables if they exist (for clean migrations)
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

-- Users table
-- Stores basic user profile info synced from Clerk
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- Clerk userId
  email       TEXT NOT NULL UNIQUE,      -- user email from Clerk
  first_name  TEXT,                      -- user first name from Clerk
  last_name   TEXT,                      -- user last name from Clerk
  created_at  TEXT NOT NULL,             -- ISO 8601 timestamp
  updated_at  TEXT NOT NULL              -- ISO 8601 timestamp
);

-- Index for fast email lookups
CREATE INDEX idx_users_email ON users (email);

-- Tasks table
-- Stores PCS-related tasks per user
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,          -- nanoid
  user_id     TEXT NOT NULL,             -- Clerk userId (references users.id)
  title       TEXT NOT NULL,             -- task title
  description TEXT,                      -- optional detailed description
  due_date    TEXT,                      -- ISO 8601 date string (YYYY-MM-DD)
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high')),
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed')),
  created_at  TEXT NOT NULL,             -- ISO 8601 timestamp
  updated_at  TEXT NOT NULL,             -- ISO 8601 timestamp
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Indexes for common query patterns on tasks
CREATE INDEX idx_tasks_user_id ON tasks (user_id);
CREATE INDEX idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_due_date ON tasks (user_id, due_date);
CREATE INDEX idx_tasks_user_priority ON tasks (user_id, priority);

-- Documents table
-- Stores metadata for uploaded PCS documents; actual files live in Cloudflare R2
CREATE TABLE documents (
  id           TEXT PRIMARY KEY,         -- nanoid
  user_id      TEXT NOT NULL,            -- Clerk userId (references users.id)
  filename     TEXT NOT NULL,            -- original filename shown in UI
  storage_key  TEXT NOT NULL UNIQUE,     -- R2 object key (userId/docId/filename)
  file_type    TEXT NOT NULL,            -- MIME type (e.g. application/pdf, image/jpeg)
  file_size    INTEGER NOT NULL          -- file size in bytes
                CHECK (file_size > 0),
  uploaded_at  TEXT NOT NULL,            -- ISO 8601 timestamp
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Indexes for common query patterns on documents
CREATE INDEX idx_documents_user_id ON documents (user_id);
CREATE INDEX idx_documents_user_uploaded_at ON documents (user_id, uploaded_at);
CREATE INDEX idx_documents_storage_key ON documents (storage_key);
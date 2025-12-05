import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * SQLite Database Connection
 * Uses Bun's native SQLite driver for optimal performance
 */

// ============================================
// Configuration
// ============================================

const DB_PATH = process.env.DATABASE_PATH || "./data/chat.db";

// ============================================
// Database Initialization
// ============================================

function ensureDirectoryExists(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function createDatabase(): Database {
	ensureDirectoryExists(DB_PATH);

	const db = new Database(DB_PATH, { create: true });

	// Enable WAL mode for better concurrent performance
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA cache_size = -64000"); // 64MB cache

	return db;
}

// ============================================
// Schema Migration
// ============================================

const SCHEMA = `
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    avatar TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
    joined_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Rooms table
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Room participants (many-to-many)
  CREATE TABLE IF NOT EXISTS room_participants (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    PRIMARY KEY (room_id, user_id)
  );

  -- Messages table
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
  CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
`;

const DEFAULT_ROOMS = [
	{
		id: "general",
		name: "General",
		description: "Welcome to the general chat room!",
	},
	{
		id: "random",
		name: "Random",
		description: "Off-topic discussions and fun stuff",
	},
	{
		id: "tech",
		name: "Tech",
		description: "Technology discussions and help",
	},
];

function runMigrations(db: Database): void {
	db.exec(SCHEMA);

	// Seed default rooms if they don't exist
	const insertRoom = db.prepare(`
    INSERT OR IGNORE INTO rooms (id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

	const now = Date.now();
	for (const room of DEFAULT_ROOMS) {
		insertRoom.run(room.id, room.name, room.description, now, now);
	}

	console.log("[DB] Migrations completed successfully");
}

// ============================================
// Database Singleton
// ============================================

let dbInstance: Database | null = null;

export function getDatabase(): Database {
	if (!dbInstance) {
		dbInstance = createDatabase();
		runMigrations(dbInstance);
		console.log(`[DB] Connected to SQLite database at ${DB_PATH}`);
	}
	return dbInstance;
}

export function closeDatabase(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
		console.log("[DB] Database connection closed");
	}
}

// ============================================
// Database Types (Row shapes)
// ============================================

export interface UserRow {
	id: string;
	username: string;
	avatar: string;
	status: string;
	joined_at: number;
	last_seen_at: number | null;
	created_at: number;
	updated_at: number;
}

export interface RoomRow {
	id: string;
	name: string;
	description: string;
	is_private: number;
	created_at: number;
	updated_at: number;
}

export interface MessageRow {
	id: string;
	room_id: string;
	author_id: string;
	content: string;
	reply_to_id: string | null;
	is_deleted: number;
	created_at: number;
	edited_at: number | null;
	updated_at: number;
}

export interface RoomParticipantRow {
	room_id: string;
	user_id: string;
	joined_at: number;
}

// ============================================
// Graceful Shutdown
// ============================================

process.on("SIGINT", () => {
	closeDatabase();
	process.exit(0);
});

process.on("SIGTERM", () => {
	closeDatabase();
	process.exit(0);
});

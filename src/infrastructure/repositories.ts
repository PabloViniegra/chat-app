import type { Database } from "bun:sqlite";
import type {
	Message,
	MessageId,
	Room,
	RoomId,
	User,
	UserId,
	UserStatus,
} from "../shared/types";
import {
	createMessageId,
	createRoomId,
	createTimestamp,
	createUserId,
} from "../shared/types";
import {
	getDatabase,
	type MessageRow,
	type RoomRow,
	type UserRow,
} from "./database";

/**
 * Repository Pattern Implementation with SQLite
 * Provides data access abstraction with persistent storage
 */

// ============================================
// Repository Interfaces (Ports)
// ============================================

export interface UserRepository {
	findById(id: UserId): Promise<User | undefined>;
	findByUsername(username: string): Promise<User | undefined>;
	save(user: User): Promise<void>;
	update(user: User): Promise<void>;
	delete(id: UserId): Promise<void>;
	findAll(): Promise<User[]>;
	findByIds(ids: UserId[]): Promise<User[]>;
	updateStatus(id: UserId, status: UserStatus): Promise<void>;
	updateLastSeen(id: UserId): Promise<void>;
}

export interface MessageRepository {
	findById(id: MessageId): Promise<Message | undefined>;
	findByRoom(
		roomId: RoomId,
		limit?: number,
		before?: number,
	): Promise<Message[]>;
	save(message: Message): Promise<void>;
	update(message: Message): Promise<void>;
	delete(id: MessageId): Promise<void>;
	countByRoom(roomId: RoomId): Promise<number>;
}

export interface RoomRepository {
	findById(id: RoomId): Promise<Room | undefined>;
	save(room: Room): Promise<void>;
	update(room: Room): Promise<void>;
	findAll(): Promise<Room[]>;
	addParticipant(roomId: RoomId, userId: UserId): Promise<void>;
	removeParticipant(roomId: RoomId, userId: UserId): Promise<void>;
	getParticipants(roomId: RoomId): Promise<UserId[]>;
	getParticipantCount(roomId: RoomId): Promise<number>;
}

// ============================================
// Row to Entity Mappers
// ============================================

function userRowToEntity(row: UserRow): User {
	return Object.freeze({
		id: createUserId(row.id),
		username: row.username,
		avatar: row.avatar,
		status: row.status as UserStatus,
		joinedAt: createTimestamp(row.joined_at),
	});
}

function roomRowToEntity(row: RoomRow, participants: Set<UserId>): Room {
	return Object.freeze({
		id: createRoomId(row.id),
		name: row.name,
		description: row.description,
		createdAt: createTimestamp(row.created_at),
		participants,
	});
}

function messageRowToEntity(row: MessageRow): Message {
	const baseMessage = {
		id: createMessageId(row.id),
		roomId: createRoomId(row.room_id),
		authorId: createUserId(row.author_id),
		content: row.content,
		createdAt: createTimestamp(row.created_at),
	};

	const message: Message = Object.freeze(
		row.edited_at !== null && row.reply_to_id !== null
			? {
					...baseMessage,
					editedAt: createTimestamp(row.edited_at),
					replyTo: createMessageId(row.reply_to_id),
				}
			: row.edited_at !== null
				? { ...baseMessage, editedAt: createTimestamp(row.edited_at) }
				: row.reply_to_id !== null
					? { ...baseMessage, replyTo: createMessageId(row.reply_to_id) }
					: baseMessage,
	);

	return message;
}

// ============================================
// SQLite User Repository
// ============================================

export class SQLiteUserRepository implements UserRepository {
	private readonly db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDatabase();
	}

	async findById(id: UserId): Promise<User | undefined> {
		const stmt = this.db.prepare<UserRow, [string]>(`
      SELECT * FROM users WHERE id = ?
    `);
		const row = stmt.get(id);
		return row ? userRowToEntity(row) : undefined;
	}

	async findByUsername(username: string): Promise<User | undefined> {
		const stmt = this.db.prepare<UserRow, [string]>(`
      SELECT * FROM users WHERE username = ? COLLATE NOCASE
    `);
		const row = stmt.get(username);
		return row ? userRowToEntity(row) : undefined;
	}

	async save(user: User): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT INTO users (id, username, avatar, status, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
		const now = Date.now();
		stmt.run(
			user.id,
			user.username,
			user.avatar,
			user.status,
			user.joinedAt,
			now,
			now,
		);
	}

	async update(user: User): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE users 
      SET username = ?, avatar = ?, status = ?, updated_at = ?
      WHERE id = ?
    `);
		stmt.run(user.username, user.avatar, user.status, Date.now(), user.id);
	}

	async delete(id: UserId): Promise<void> {
		const stmt = this.db.prepare(`DELETE FROM users WHERE id = ?`);
		stmt.run(id);
	}

	async findAll(): Promise<User[]> {
		const stmt = this.db.prepare<UserRow, []>(
			`SELECT * FROM users ORDER BY username`,
		);
		const rows = stmt.all();
		return rows.map(userRowToEntity);
	}

	async findByIds(ids: UserId[]): Promise<User[]> {
		if (ids.length === 0) return [];

		const placeholders = ids.map(() => "?").join(", ");
		const stmt = this.db.prepare<UserRow, string[]>(`
      SELECT * FROM users WHERE id IN (${placeholders})
    `);
		const rows = stmt.all(...ids);
		return rows.map(userRowToEntity);
	}

	async updateStatus(id: UserId, status: UserStatus): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE users SET status = ?, updated_at = ? WHERE id = ?
    `);
		stmt.run(status, Date.now(), id);
	}

	async updateLastSeen(id: UserId): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?
    `);
		const now = Date.now();
		stmt.run(now, now, id);
	}
}

// ============================================
// SQLite Message Repository
// ============================================

export class SQLiteMessageRepository implements MessageRepository {
	private readonly db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDatabase();
	}

	async findById(id: MessageId): Promise<Message | undefined> {
		const stmt = this.db.prepare<MessageRow, [string]>(`
      SELECT * FROM messages WHERE id = ? AND is_deleted = 0
    `);
		const row = stmt.get(id);
		return row ? messageRowToEntity(row) : undefined;
	}

	async findByRoom(
		roomId: RoomId,
		limit = 50,
		before?: number,
	): Promise<Message[]> {
		let query = `
      SELECT * FROM messages 
      WHERE room_id = ? AND is_deleted = 0
    `;
		const params: (string | number)[] = [roomId];

		if (before !== undefined) {
			query += ` AND created_at < ?`;
			params.push(before);
		}

		query += ` ORDER BY created_at DESC LIMIT ?`;
		params.push(limit);

		const stmt = this.db.prepare<MessageRow, (string | number)[]>(query);
		const rows = stmt.all(...params);

		// Return in chronological order
		return rows.map(messageRowToEntity).reverse();
	}

	async save(message: Message): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT INTO messages (id, room_id, author_id, content, reply_to_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
		const now = Date.now();
		stmt.run(
			message.id,
			message.roomId,
			message.authorId,
			message.content,
			message.replyTo ?? null,
			message.createdAt,
			now,
		);
	}

	async update(message: Message): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE messages 
      SET content = ?, edited_at = ?, updated_at = ?
      WHERE id = ?
    `);
		stmt.run(message.content, message.editedAt ?? null, Date.now(), message.id);
	}

	async delete(id: MessageId): Promise<void> {
		// Soft delete to preserve referential integrity
		const stmt = this.db.prepare(`
      UPDATE messages SET is_deleted = 1, updated_at = ? WHERE id = ?
    `);
		stmt.run(Date.now(), id);
	}

	async countByRoom(roomId: RoomId): Promise<number> {
		const stmt = this.db.prepare<{ count: number }, [string]>(`
      SELECT COUNT(*) as count FROM messages WHERE room_id = ? AND is_deleted = 0
    `);
		const row = stmt.get(roomId);
		return row?.count ?? 0;
	}
}

// ============================================
// SQLite Room Repository
// ============================================

export class SQLiteRoomRepository implements RoomRepository {
	private readonly db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDatabase();
	}

	async findById(id: RoomId): Promise<Room | undefined> {
		const stmt = this.db.prepare<RoomRow, [string]>(`
      SELECT * FROM rooms WHERE id = ?
    `);
		const row = stmt.get(id);
		if (!row) return undefined;

		const participants = await this.getParticipantsSet(id);
		return roomRowToEntity(row, participants);
	}

	async save(room: Room): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT INTO rooms (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
		const now = Date.now();
		stmt.run(room.id, room.name, room.description, room.createdAt, now);
	}

	async update(room: Room): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE rooms 
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `);
		stmt.run(room.name, room.description, Date.now(), room.id);
	}

	async findAll(): Promise<Room[]> {
		const stmt = this.db.prepare<RoomRow, []>(`
      SELECT * FROM rooms ORDER BY name
    `);
		const rows = stmt.all();

		const rooms: Room[] = [];
		for (const row of rows) {
			const participants = await this.getParticipantsSet(createRoomId(row.id));
			rooms.push(roomRowToEntity(row, participants));
		}
		return rooms;
	}

	async addParticipant(roomId: RoomId, userId: UserId): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO room_participants (room_id, user_id, joined_at)
      VALUES (?, ?, ?)
    `);
		stmt.run(roomId, userId, Date.now());
	}

	async removeParticipant(roomId: RoomId, userId: UserId): Promise<void> {
		const stmt = this.db.prepare(`
      DELETE FROM room_participants WHERE room_id = ? AND user_id = ?
    `);
		stmt.run(roomId, userId);
	}

	async getParticipants(roomId: RoomId): Promise<UserId[]> {
		const stmt = this.db.prepare<{ user_id: string }, [string]>(`
      SELECT user_id FROM room_participants WHERE room_id = ?
    `);
		const rows = stmt.all(roomId);
		return rows.map((row) => createUserId(row.user_id));
	}

	async getParticipantCount(roomId: RoomId): Promise<number> {
		const stmt = this.db.prepare<{ count: number }, [string]>(`
      SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?
    `);
		const row = stmt.get(roomId);
		return row?.count ?? 0;
	}

	private async getParticipantsSet(roomId: RoomId): Promise<Set<UserId>> {
		const participants = await this.getParticipants(roomId);
		return new Set(participants);
	}
}

// ============================================
// Unit of Work Pattern
// ============================================

export interface UnitOfWork {
	users: UserRepository;
	messages: MessageRepository;
	rooms: RoomRepository;
}

export function createUnitOfWork(db?: Database): UnitOfWork {
	const database = db ?? getDatabase();
	return {
		users: new SQLiteUserRepository(database),
		messages: new SQLiteMessageRepository(database),
		rooms: new SQLiteRoomRepository(database),
	};
}

// ============================================
// In-Memory Implementations (for testing)
// ============================================

export class InMemoryUserRepository implements UserRepository {
	private readonly users = new Map<UserId, User>();

	async findById(id: UserId): Promise<User | undefined> {
		return this.users.get(id);
	}

	async findByUsername(username: string): Promise<User | undefined> {
		return [...this.users.values()].find(
			(user) => user.username.toLowerCase() === username.toLowerCase(),
		);
	}

	async save(user: User): Promise<void> {
		this.users.set(user.id, user);
	}

	async update(user: User): Promise<void> {
		if (!this.users.has(user.id)) {
			throw new Error(`User ${user.id} not found`);
		}
		this.users.set(user.id, user);
	}

	async delete(id: UserId): Promise<void> {
		this.users.delete(id);
	}

	async findAll(): Promise<User[]> {
		return [...this.users.values()];
	}

	async findByIds(ids: UserId[]): Promise<User[]> {
		const idSet = new Set(ids);
		return [...this.users.values()].filter((user) => idSet.has(user.id));
	}

	async updateStatus(id: UserId, status: UserStatus): Promise<void> {
		const user = this.users.get(id);
		if (user) {
			this.users.set(id, { ...user, status });
		}
	}

	async updateLastSeen(_id: UserId): Promise<void> {
		// No-op for in-memory
	}
}

export class InMemoryMessageRepository implements MessageRepository {
	private readonly messages = new Map<MessageId, Message>();
	private readonly roomMessages = new Map<RoomId, MessageId[]>();

	async findById(id: MessageId): Promise<Message | undefined> {
		return this.messages.get(id);
	}

	async findByRoom(
		roomId: RoomId,
		limit = 50,
		before?: number,
	): Promise<Message[]> {
		const messageIds = this.roomMessages.get(roomId) ?? [];
		const messages = messageIds
			.map((id) => this.messages.get(id))
			.filter((msg): msg is Message => msg !== undefined)
			.filter((msg) => (before ? msg.createdAt < before : true))
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, limit);

		return messages.reverse();
	}

	async save(message: Message): Promise<void> {
		this.messages.set(message.id, message);

		const roomMsgs = this.roomMessages.get(message.roomId) ?? [];
		roomMsgs.push(message.id);
		this.roomMessages.set(message.roomId, roomMsgs);
	}

	async update(message: Message): Promise<void> {
		if (!this.messages.has(message.id)) {
			throw new Error(`Message ${message.id} not found`);
		}
		this.messages.set(message.id, message);
	}

	async delete(id: MessageId): Promise<void> {
		const message = this.messages.get(id);
		if (message) {
			const roomMsgs = this.roomMessages.get(message.roomId) ?? [];
			this.roomMessages.set(
				message.roomId,
				roomMsgs.filter((msgId) => msgId !== id),
			);
		}
		this.messages.delete(id);
	}

	async countByRoom(roomId: RoomId): Promise<number> {
		return this.roomMessages.get(roomId)?.length ?? 0;
	}
}

export class InMemoryRoomRepository implements RoomRepository {
	private readonly rooms = new Map<RoomId, Room>();
	private readonly participants = new Map<RoomId, Set<UserId>>();

	constructor() {
		// Initialize with default rooms
		const defaultRooms = [
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

		for (const room of defaultRooms) {
			const roomEntity: Room = Object.freeze({
				id: createRoomId(room.id),
				name: room.name,
				description: room.description,
				createdAt: createTimestamp(Date.now()),
				participants: new Set<UserId>(),
			});
			this.rooms.set(roomEntity.id, roomEntity);
			this.participants.set(roomEntity.id, new Set());
		}
	}

	async findById(id: RoomId): Promise<Room | undefined> {
		const room = this.rooms.get(id);
		if (!room) return undefined;

		return Object.freeze({
			...room,
			participants: new Set(this.participants.get(id) ?? []),
		});
	}

	async save(room: Room): Promise<void> {
		this.rooms.set(room.id, room);
		this.participants.set(room.id, new Set(room.participants));
	}

	async update(room: Room): Promise<void> {
		if (!this.rooms.has(room.id)) {
			throw new Error(`Room ${room.id} not found`);
		}
		this.rooms.set(room.id, room);
	}

	async findAll(): Promise<Room[]> {
		return [...this.rooms.values()].map((room) =>
			Object.freeze({
				...room,
				participants: new Set(this.participants.get(room.id) ?? []),
			}),
		);
	}

	async addParticipant(roomId: RoomId, userId: UserId): Promise<void> {
		const roomParticipants = this.participants.get(roomId) ?? new Set();
		roomParticipants.add(userId);
		this.participants.set(roomId, roomParticipants);
	}

	async removeParticipant(roomId: RoomId, userId: UserId): Promise<void> {
		const roomParticipants = this.participants.get(roomId);
		roomParticipants?.delete(userId);
	}

	async getParticipants(roomId: RoomId): Promise<UserId[]> {
		return [...(this.participants.get(roomId) ?? [])];
	}

	async getParticipantCount(roomId: RoomId): Promise<number> {
		return this.participants.get(roomId)?.size ?? 0;
	}
}

// ============================================
// Factory for Testing
// ============================================

export function createInMemoryUnitOfWork(): UnitOfWork {
	return {
		users: new InMemoryUserRepository(),
		messages: new InMemoryMessageRepository(),
		rooms: new InMemoryRoomRepository(),
	};
}

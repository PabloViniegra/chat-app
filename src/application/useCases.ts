import {
	MessageFactory,
	MessageFormatter,
	UserFactory,
} from "../domain/entities";
import type { ChatEvents, TypedEventEmitter } from "../infrastructure/events";
import type { UnitOfWork } from "../infrastructure/repositories";
import type {
	Message,
	MessageDTO,
	MessageId,
	RoomId,
	RoomInfo,
	User,
	UserId,
	UserStatus,
} from "../shared/types";
import { createMessageId, createRoomId, createUserId } from "../shared/types";

/**
 * Application Use Cases
 * Following Clean Architecture principles
 * Each use case represents a single business operation
 */

// ============================================
// Result Type for Use Cases
// ============================================

export type Result<T, E = Error> =
	| { success: true; data: T }
	| { success: false; error: E };

export const success = <T>(data: T): Result<T, never> => ({
	success: true,
	data,
});
export const failure = <E>(error: E): Result<never, E> => ({
	success: false,
	error,
});

// ============================================
// Use Case Errors
// ============================================

export class UseCaseError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "UseCaseError";
	}
}

// ============================================
// Helper Functions
// ============================================

/**
 * Gets an existing user by username or creates a new one
 * @param username - The username to find or create
 * @param uow - Unit of Work for database access
 * @returns The existing or newly created user
 */
async function getOrCreateUser(
	username: string,
	uow: UnitOfWork,
): Promise<User> {
	const existingUser = await uow.users.findByUsername(username);

	if (existingUser) {
		// User exists, update status to online
		await uow.users.updateStatus(existingUser.id, "online");
		return UserFactory.updateStatus(existingUser, "online");
	}

	// Create new user
	const newUser = UserFactory.create({ username });
	await uow.users.save(newUser);
	return newUser;
}

/**
 * Retrieves room messages and converts them to DTOs
 * @param roomId - The room ID to fetch messages from
 * @param uow - Unit of Work for database access
 * @returns Array of message DTOs
 */
async function getRoomMessagesWithAuthors(
	roomId: RoomId,
	uow: UnitOfWork,
): Promise<MessageDTO[]> {
	const messages = await uow.messages.findByRoom(roomId, 50);
	return Promise.all(messages.map((msg) => messageToDTO(msg, uow)));
}

/**
 * Gets all online participants in a room
 * @param roomId - The room ID
 * @param uow - Unit of Work for database access
 * @returns Array of online users
 */
async function getOnlineParticipants(
	roomId: RoomId,
	uow: UnitOfWork,
): Promise<User[]> {
	const participantIds = await uow.rooms.getParticipants(roomId);
	const users = await uow.users.findByIds(participantIds);
	return users.filter((u) => u.status !== "offline");
}

/**
 * Emits domain events when a user joins a room
 * @param events - Event emitter
 * @param roomId - The room ID
 * @param user - The user who joined
 */
function emitJoinEvents(
	events: TypedEventEmitter<ChatEvents>,
	roomId: string,
	user: User,
): void {
	events.emit("room:user-joined", {
		roomId,
		userId: user.id as string,
	});
	events.emit("user:connected", {
		userId: user.id as string,
		username: user.username,
	});
}

/**
 * Builds room info DTO from room entity
 * @param room - Room entity
 * @param participantCount - Number of participants
 * @returns RoomInfo DTO
 */
function buildRoomInfo(room: Room, participantCount: number): RoomInfo {
	return {
		id: room.id as string,
		name: room.name,
		description: room.description,
		participantCount,
	};
}

// ============================================
// Join Room Use Case
// ============================================

export interface JoinRoomInput {
	roomId: string;
	username: string;
}

export interface JoinRoomOutput {
	user: User;
	room: RoomInfo;
	messages: MessageDTO[];
	users: User[];
}

/**
 * Joins a user to a chat room, creating the user if they don't exist
 * @param input - Room ID and username for the user
 * @param uow - Unit of Work for database access
 * @param events - Event emitter for domain events
 * @returns Result with user data, room info, messages and online users
 */
export async function joinRoom(
	input: JoinRoomInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<JoinRoomOutput, UseCaseError>> {
	const roomId = createRoomId(input.roomId);

	const room = await uow.rooms.findById(roomId);
	if (!room) {
		return failure(
			new UseCaseError(`Room '${input.roomId}' not found`, "ROOM_NOT_FOUND"),
		);
	}

	const user = await getOrCreateUser(input.username, uow);
	await uow.rooms.addParticipant(roomId, user.id);

	const messageDTOs = await getRoomMessagesWithAuthors(roomId, uow);
	const onlineUsers = await getOnlineParticipants(roomId, uow);
	const participantCount = await uow.rooms.getParticipantCount(roomId);

	emitJoinEvents(events, input.roomId, user);

	return success({
		user,
		room: buildRoomInfo(room, participantCount),
		messages: messageDTOs,
		users: onlineUsers,
	});
}

// ============================================
// Leave Room Use Case
// ============================================

export interface LeaveRoomInput {
	userId: string;
	roomId: string;
}

export async function leaveRoom(
	input: LeaveRoomInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<void, UseCaseError>> {
	const roomId = createRoomId(input.roomId);
	const userId = createUserId(input.userId);

	const room = await uow.rooms.findById(roomId);
	if (!room) {
		return failure(new UseCaseError("Room not found", "ROOM_NOT_FOUND"));
	}

	await uow.rooms.removeParticipant(roomId, userId);

	// Update user status
	await uow.users.updateStatus(userId, "offline");
	await uow.users.updateLastSeen(userId);

	events.emit("room:user-left", { roomId: input.roomId, userId: input.userId });

	return success(undefined);
}

// ============================================
// Send Message Use Case
// ============================================

export interface SendMessageInput {
	roomId: string;
	authorId: string;
	content: string;
	replyTo?: string;
}

export async function sendMessage(
	input: SendMessageInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<MessageDTO, UseCaseError>> {
	const roomId = createRoomId(input.roomId);
	const authorId = createUserId(input.authorId);

	// Validate room exists
	const room = await uow.rooms.findById(roomId);
	if (!room) {
		return failure(new UseCaseError("Room not found", "ROOM_NOT_FOUND"));
	}

	// Validate author exists
	const author = await uow.users.findById(authorId);
	if (!author) {
		return failure(new UseCaseError("User not found", "USER_NOT_FOUND"));
	}

	// Create message
	const messageParams: {
		roomId: RoomId;
		authorId: UserId;
		content: string;
		replyTo?: MessageId;
	} = {
		roomId,
		authorId,
		content: input.content,
	};

	if (input.replyTo) {
		messageParams.replyTo = createMessageId(input.replyTo);
	}

	const message = MessageFactory.create(messageParams);

	await uow.messages.save(message);

	// Emit event
	events.emit("message:sent", {
		messageId: message.id as string,
		roomId: input.roomId,
		authorId: input.authorId,
	});

	return success(await messageToDTO(message, uow));
}

// ============================================
// Edit Message Use Case
// ============================================

export interface EditMessageInput {
	messageId: string;
	userId: string;
	content: string;
}

export async function editMessage(
	input: EditMessageInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<Message, UseCaseError>> {
	const messageId = createMessageId(input.messageId);
	const userId = createUserId(input.userId);

	const message = await uow.messages.findById(messageId);
	if (!message) {
		return failure(new UseCaseError("Message not found", "MESSAGE_NOT_FOUND"));
	}

	if (message.authorId !== userId) {
		return failure(
			new UseCaseError("Not authorized to edit this message", "UNAUTHORIZED"),
		);
	}

	const updatedMessage = MessageFactory.edit(message, input.content);
	await uow.messages.update(updatedMessage);

	events.emit("message:edited", { messageId: input.messageId });

	return success(updatedMessage);
}

// ============================================
// Delete Message Use Case
// ============================================

export interface DeleteMessageInput {
	messageId: string;
	userId: string;
}

export async function deleteMessage(
	input: DeleteMessageInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<void, UseCaseError>> {
	const messageId = createMessageId(input.messageId);
	const userId = createUserId(input.userId);

	const message = await uow.messages.findById(messageId);
	if (!message) {
		return failure(new UseCaseError("Message not found", "MESSAGE_NOT_FOUND"));
	}

	if (message.authorId !== userId) {
		return failure(
			new UseCaseError("Not authorized to delete this message", "UNAUTHORIZED"),
		);
	}

	await uow.messages.delete(messageId);

	events.emit("message:deleted", { messageId: input.messageId });

	return success(undefined);
}

// ============================================
// Update User Status Use Case
// ============================================

export interface UpdateStatusInput {
	userId: string;
	status: UserStatus;
}

export async function updateUserStatus(
	input: UpdateStatusInput,
	uow: UnitOfWork,
	events: TypedEventEmitter<ChatEvents>,
): Promise<Result<User, UseCaseError>> {
	const userId = createUserId(input.userId);

	const user = await uow.users.findById(userId);
	if (!user) {
		return failure(new UseCaseError("User not found", "USER_NOT_FOUND"));
	}

	await uow.users.updateStatus(userId, input.status);

	const updatedUser = UserFactory.updateStatus(user, input.status);

	events.emit("user:status-changed", {
		userId: input.userId,
		status: input.status as string,
	});

	return success(updatedUser);
}

// ============================================
// Get Rooms Use Case
// ============================================

export async function getRooms(uow: UnitOfWork): Promise<RoomInfo[]> {
	const rooms = await uow.rooms.findAll();

	const roomInfos: RoomInfo[] = [];
	for (const room of rooms) {
		const participantCount = await uow.rooms.getParticipantCount(room.id);
		roomInfos.push({
			id: room.id as string,
			name: room.name,
			description: room.description,
			participantCount,
		});
	}

	return roomInfos;
}

// ============================================
// Get Room History Use Case
// ============================================

export interface GetRoomHistoryInput {
	roomId: string;
	limit?: number;
	before?: number;
}

export interface GetRoomHistoryOutput {
	messages: MessageDTO[];
	users: User[];
	hasMore: boolean;
}

export async function getRoomHistory(
	input: GetRoomHistoryInput,
	uow: UnitOfWork,
): Promise<Result<GetRoomHistoryOutput, UseCaseError>> {
	const roomId = createRoomId(input.roomId);
	const limit = input.limit ?? 50;

	const room = await uow.rooms.findById(roomId);
	if (!room) {
		return failure(new UseCaseError("Room not found", "ROOM_NOT_FOUND"));
	}

	const messages = await uow.messages.findByRoom(
		roomId,
		limit + 1,
		input.before,
	);
	const hasMore = messages.length > limit;
	const messagesToReturn = hasMore ? messages.slice(0, -1) : messages;

	const messageDTOs = await Promise.all(
		messagesToReturn.map((msg) => messageToDTO(msg, uow)),
	);

	const participantIds = await uow.rooms.getParticipants(roomId);
	const users = await uow.users.findByIds(participantIds);

	return success({
		messages: messageDTOs,
		users,
		hasMore,
	});
}

// ============================================
// Helper Functions
// ============================================

async function messageToDTO(
	message: Message,
	uow: UnitOfWork,
): Promise<MessageDTO> {
	const author = await uow.users.findById(message.authorId);
	if (!author) {
		throw new Error(
			`Author ${message.authorId} not found for message ${message.id}`,
		);
	}

	let replyInfo: MessageDTO["replyTo"];
	if (message.replyTo) {
		const replyMessage = await uow.messages.findById(message.replyTo);
		if (replyMessage) {
			const replyAuthor = await uow.users.findById(replyMessage.authorId);
			replyInfo = {
				id: replyMessage.id as string,
				authorUsername: replyAuthor?.username ?? "Unknown",
				contentPreview: MessageFormatter.truncateForPreview(
					replyMessage.content,
				),
			};
		}
	}

	const dto: MessageDTO = {
		id: message.id as string,
		roomId: message.roomId as string,
		author: {
			id: author.id as string,
			username: author.username,
			avatar: author.avatar,
		},
		content: message.content,
		createdAt: message.createdAt as number,
	};

	if (replyInfo) {
		dto.replyTo = replyInfo;
	}

	if (message.editedAt !== undefined) {
		dto.editedAt = message.editedAt as number;
	}

	return dto;
}

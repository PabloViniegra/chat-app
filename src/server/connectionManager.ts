import type { ServerWebSocket } from "bun";
import * as useCases from "../application/useCases";
import type { ChatEvents, TypedEventEmitter } from "../infrastructure/events";
import type { UnitOfWork } from "../infrastructure/repositories";
import { CONSTANTS } from "../shared/constants";
import type {
	ClientEvent,
	ErrorCode,
	ServerEvent,
	UserId,
	UserStatus,
} from "../shared/types";
import { createUserId } from "../shared/types";
import { ClientEventSchema } from "../shared/validation";

export interface ConnectionState {
	userId: UserId | null;
	roomId: string | null;
	username: string | null;
	typingTimeout: ReturnType<typeof setTimeout> | null;
	lastMessageTime: number;
	messageCount: number;
}

export type WebSocketData = {
	state: ConnectionState;
};

export class ConnectionManager {
	private readonly connections = new Map<
		string,
		ServerWebSocket<WebSocketData>
	>();
	private readonly userConnections = new Map<UserId, string>();
	private readonly roomSubscriptions = new Map<string, Set<string>>();

	constructor(
		private readonly uow: UnitOfWork,
		private readonly events: TypedEventEmitter<ChatEvents>,
	) {
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.events.on("message:sent", () => {
			// Message sending is handled directly in handleMessage
		});

		this.events.on("user:status-changed", async ({ userId, status }) => {
			const rooms = await this.getRoomsForUser(createUserId(userId));
			for (const roomId of rooms) {
				this.broadcastToRoom(roomId, {
					type: "USER_STATUS_CHANGED",
					payload: { userId, status: status as UserStatus },
				});
			}
		});
	}

	private async getRoomsForUser(userId: UserId): Promise<string[]> {
		const rooms = await this.uow.rooms.findAll();
		return rooms
			.filter((room) => room.participants.has(userId))
			.map((room) => room.id as string);
	}

	addConnection(id: string, ws: ServerWebSocket<WebSocketData>): void {
		this.connections.set(id, ws);
	}

	async removeConnection(id: string): Promise<void> {
		const connection = this.connections.get(id);
		if (connection) {
			const { state } = connection.data;

			if (state.typingTimeout) {
				clearTimeout(state.typingTimeout);
			}

			if (state.roomId) {
				this.leaveRoom(id, state.roomId);

				this.broadcastToRoom(
					state.roomId,
					{
						type: "USER_LEFT",
						payload: { userId: state.userId as string, roomId: state.roomId },
					},
					id,
				);
			}

			if (state.userId) {
				await this.uow.users.updateStatus(state.userId, "offline");
				await this.uow.users.updateLastSeen(state.userId);
				this.events.emit("user:disconnected", {
					userId: state.userId as string,
				});
			}
		}

		this.connections.delete(id);
	}

	private joinRoom(connectionId: string, roomId: string): void {
		const subscribers = this.roomSubscriptions.get(roomId) ?? new Set();
		subscribers.add(connectionId);
		this.roomSubscriptions.set(roomId, subscribers);
	}

	private leaveRoom(connectionId: string, roomId: string): void {
		const subscribers = this.roomSubscriptions.get(roomId);
		if (subscribers) {
			subscribers.delete(connectionId);
			if (subscribers.size === 0) {
				this.roomSubscriptions.delete(roomId);
			}
		}
	}

	private send(ws: ServerWebSocket<WebSocketData>, event: ServerEvent): void {
		try {
			ws.send(JSON.stringify(event));
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	}

	private broadcastToRoom(
		roomId: string,
		event: ServerEvent,
		excludeConnectionId?: string,
	): void {
		const subscribers = this.roomSubscriptions.get(roomId);
		if (!subscribers) return;

		for (const connId of subscribers) {
			if (connId === excludeConnectionId) continue;

			const connection = this.connections.get(connId);
			if (connection) {
				this.send(connection, event);
			}
		}
	}

	private checkRateLimit(state: ConnectionState): boolean {
		const now = Date.now();
		const oneMinuteAgo = now - 60000;

		if (state.lastMessageTime < oneMinuteAgo) {
			state.messageCount = 0;
			state.lastMessageTime = now;
		}

		state.messageCount++;
		state.lastMessageTime = now;

		return state.messageCount <= CONSTANTS.RATE_LIMIT_MESSAGES_PER_MINUTE;
	}

	/**
	 * Main message handler - validates and routes client events
	 */
	async handleMessage(connectionId: string, rawMessage: string): Promise<void> {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			console.error(`Connection not found: ${connectionId}`);
			return;
		}

		const parsed = this.parseMessage(rawMessage, connection);
		if (!parsed) return;

		const event = this.validateMessage(parsed, connection);
		if (!event) return;

		await this.routeEvent(connectionId, connection, event);
	}

	/**
	 * Parses raw JSON message, sends error if invalid
	 */
	private parseMessage(
		rawMessage: string,
		ws: ServerWebSocket<WebSocketData>,
	): unknown | null {
		try {
			return JSON.parse(rawMessage);
		} catch {
			this.sendError(ws, "INVALID_MESSAGE", "Invalid JSON");
			return null;
		}
	}

	/**
	 * Validates message against schema, sends error if invalid
	 */
	private validateMessage(
		parsed: unknown,
		ws: ServerWebSocket<WebSocketData>,
	): ClientEvent | null {
		const validation = ClientEventSchema.safeParse(parsed);
		if (!validation.success) {
			const errorMessage = validation.error.issues
				.map((issue) => issue.message)
				.join(", ");
			this.sendError(ws, "INVALID_MESSAGE", errorMessage);
			return null;
		}
		return validation.data;
	}

	/**
	 * Routes validated event to appropriate handler
	 */
	private async routeEvent(
		connectionId: string,
		ws: ServerWebSocket<WebSocketData>,
		event: ClientEvent,
	): Promise<void> {
		const { state } = ws.data;

		switch (event.type) {
			case "JOIN_ROOM":
				await this.handleJoinRoom(connectionId, ws, event.payload);
				break;

			case "LEAVE_ROOM":
				await this.handleLeaveRoom(connectionId, ws, state, event.payload);
				break;

			case "SEND_MESSAGE":
				await this.handleSendMessage(connectionId, ws, state, event.payload);
				break;

			case "EDIT_MESSAGE":
				await this.handleEditMessage(ws, state, event.payload);
				break;

			case "DELETE_MESSAGE":
				await this.handleDeleteMessage(ws, state, event.payload);
				break;

			case "TYPING_START":
				this.handleTypingStart(connectionId, ws, state, event.payload);
				break;

			case "TYPING_STOP":
				this.handleTypingStop(connectionId, state, event.payload);
				break;

			case "UPDATE_STATUS":
				await this.handleUpdateStatus(ws, state, event.payload);
				break;
		}
	}

	/**
	 * Sends error message to client
	 */
	private sendError(
		ws: ServerWebSocket<WebSocketData>,
		code: string,
		message: string,
	): void {
		this.send(ws, {
			type: "ERROR",
			payload: { code: code as ErrorCode, message },
		});
	}

	private async handleJoinRoom(
		connectionId: string,
		ws: ServerWebSocket<WebSocketData>,
		payload: { roomId: string; username: string },
	): Promise<void> {
		const result = await useCases.joinRoom(
			{ roomId: payload.roomId, username: payload.username },
			this.uow,
			this.events,
		);

		if (!result.success) {
			this.send(ws, {
				type: "ERROR",
				payload: {
					code: result.error.code as "ROOM_NOT_FOUND",
					message: result.error.message,
				},
			});
			return;
		}

		const { user, messages, users } = result.data;

		ws.data.state.userId = user.id;
		ws.data.state.roomId = payload.roomId;
		ws.data.state.username = user.username;

		this.userConnections.set(user.id, connectionId);
		this.joinRoom(connectionId, payload.roomId);

		const rooms = await useCases.getRooms(this.uow);

		this.send(ws, {
			type: "CONNECTED",
			payload: { user, rooms },
		});

		this.send(ws, {
			type: "ROOM_HISTORY",
			payload: { roomId: payload.roomId, messages, users },
		});

		this.broadcastToRoom(
			payload.roomId,
			{
				type: "USER_JOINED",
				payload: { user, roomId: payload.roomId },
			},
			connectionId,
		);
	}

	private async handleLeaveRoom(
		connectionId: string,
		_ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { roomId: string },
	): Promise<void> {
		if (!state.userId || !state.roomId) {
			return;
		}

		await useCases.leaveRoom(
			{ roomId: payload.roomId, userId: state.userId as string },
			this.uow,
			this.events,
		);

		this.leaveRoom(connectionId, payload.roomId);

		this.broadcastToRoom(payload.roomId, {
			type: "USER_LEFT",
			payload: { userId: state.userId as string, roomId: payload.roomId },
		});
	}

	/**
	 * Handles sending a message from a user to a room
	 */
	private async handleSendMessage(
		connectionId: string,
		ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { roomId: string; content: string; replyTo?: string },
	): Promise<void> {
		if (!this.validateUserAuthorized(state, ws)) return;
		if (!this.validateRateLimit(state, ws)) return;

		const result = await useCases.sendMessage(
			this.buildSendMessageInput(state, payload),
			this.uow,
			this.events,
		);

		if (!result.success) {
			this.sendError(ws, result.error.code, result.error.message);
			return;
		}

		this.handleTypingStop(connectionId, state, { roomId: payload.roomId });
		this.broadcastToRoom(payload.roomId, {
			type: "MESSAGE_RECEIVED",
			payload: { message: result.data },
		});
	}

	/**
	 * Validates that user is authorized (logged in)
	 */
	private validateUserAuthorized(
		state: ConnectionState,
		ws: ServerWebSocket<WebSocketData>,
	): boolean {
		if (!state.userId || !state.username) {
			this.sendError(ws, "UNAUTHORIZED", "Must join a room first");
			return false;
		}
		return true;
	}

	/**
	 * Validates rate limit for user actions
	 */
	private validateRateLimit(
		state: ConnectionState,
		ws: ServerWebSocket<WebSocketData>,
	): boolean {
		if (!this.checkRateLimit(state)) {
			this.sendError(
				ws,
				"RATE_LIMITED",
				"Too many messages. Please slow down.",
			);
			return false;
		}
		return true;
	}

	/**
	 * Builds input object for sendMessage use case
	 */
	private buildSendMessageInput(
		state: ConnectionState,
		payload: { roomId: string; content: string; replyTo?: string },
	): {
		roomId: string;
		authorId: string;
		content: string;
		replyTo?: string;
	} {
		const input = {
			roomId: payload.roomId,
			authorId: state.userId as string,
			content: payload.content,
		};

		return payload.replyTo ? { ...input, replyTo: payload.replyTo } : input;
	}

	private async handleEditMessage(
		ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { messageId: string; content: string },
	): Promise<void> {
		if (!state.userId) {
			return;
		}

		const result = await useCases.editMessage(
			{
				messageId: payload.messageId,
				userId: state.userId as string,
				content: payload.content,
			},
			this.uow,
			this.events,
		);

		if (!result.success) {
			this.send(ws, {
				type: "ERROR",
				payload: {
					code:
						result.error.code === "MESSAGE_NOT_FOUND" ||
						result.error.code === "UNAUTHORIZED"
							? result.error.code
							: "INTERNAL_ERROR",
					message: result.error.message,
				},
			});
			return;
		}

		if (state.roomId) {
			this.broadcastToRoom(state.roomId, {
				type: "MESSAGE_EDITED",
				payload: {
					messageId: payload.messageId,
					content: payload.content,
					editedAt: result.data.editedAt as number,
				},
			});
		}
	}

	private async handleDeleteMessage(
		ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { messageId: string },
	): Promise<void> {
		if (!state.userId) {
			return;
		}

		const result = await useCases.deleteMessage(
			{
				messageId: payload.messageId,
				userId: state.userId as string,
			},
			this.uow,
			this.events,
		);

		if (!result.success) {
			this.send(ws, {
				type: "ERROR",
				payload: {
					code: result.error.code as "MESSAGE_NOT_FOUND",
					message: result.error.message,
				},
			});
			return;
		}

		if (state.roomId) {
			this.broadcastToRoom(state.roomId, {
				type: "MESSAGE_DELETED",
				payload: { messageId: payload.messageId },
			});
		}
	}

	private handleTypingStart(
		connectionId: string,
		_ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { roomId: string },
	): void {
		if (!state.userId || !state.username) {
			return;
		}

		if (state.typingTimeout) {
			clearTimeout(state.typingTimeout);
		}

		state.typingTimeout = setTimeout(() => {
			this.handleTypingStop(connectionId, state, payload);
		}, CONSTANTS.TYPING_TIMEOUT_MS);

		this.broadcastToRoom(
			payload.roomId,
			{
				type: "USER_TYPING",
				payload: {
					userId: state.userId as string,
					username: state.username,
					roomId: payload.roomId,
				},
			},
			connectionId,
		);
	}

	private handleTypingStop(
		connectionId: string,
		state: ConnectionState,
		payload: { roomId: string },
	): void {
		if (!state.userId) {
			return;
		}

		if (state.typingTimeout) {
			clearTimeout(state.typingTimeout);
			state.typingTimeout = null;
		}

		this.broadcastToRoom(
			payload.roomId,
			{
				type: "USER_STOPPED_TYPING",
				payload: { userId: state.userId as string, roomId: payload.roomId },
			},
			connectionId,
		);
	}

	private async handleUpdateStatus(
		_ws: ServerWebSocket<WebSocketData>,
		state: ConnectionState,
		payload: { status: UserStatus },
	): Promise<void> {
		if (!state.userId) {
			return;
		}

		await useCases.updateUserStatus(
			{ userId: state.userId as string, status: payload.status },
			this.uow,
			this.events,
		);
	}
}

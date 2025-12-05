/**
 * Shared types and interfaces for the chat application
 * Following Domain-Driven Design principles
 */

// ============================================
// Value Objects
// ============================================

export type UserId = string & { readonly __brand: unique symbol };
export type MessageId = string & { readonly __brand: unique symbol };
export type RoomId = string & { readonly __brand: unique symbol };
export type Timestamp = number & { readonly __brand: unique symbol };

export const createUserId = (id: string): UserId => id as UserId;
export const createMessageId = (id: string): MessageId => id as MessageId;
export const createRoomId = (id: string): RoomId => id as RoomId;
export const createTimestamp = (ts: number): Timestamp => ts as Timestamp;

// ============================================
// Domain Entities
// ============================================

export interface User {
	readonly id: UserId;
	readonly username: string;
	readonly avatar: string;
	readonly status: UserStatus;
	readonly joinedAt: Timestamp;
}

export type UserStatus = "online" | "away" | "offline";

export interface Message {
	readonly id: MessageId;
	readonly roomId: RoomId;
	readonly authorId: UserId;
	readonly content: string;
	readonly createdAt: Timestamp;
	readonly editedAt?: Timestamp;
	readonly replyTo?: MessageId;
}

export interface Room {
	readonly id: RoomId;
	readonly name: string;
	readonly description: string;
	readonly createdAt: Timestamp;
	readonly participants: ReadonlySet<UserId>;
}

// ============================================
// WebSocket Events (Client -> Server)
// ============================================

export type ClientEvent =
	| { type: "JOIN_ROOM"; payload: { roomId: string; username: string } }
	| { type: "LEAVE_ROOM"; payload: { roomId: string } }
	| {
			type: "SEND_MESSAGE";
			payload: { roomId: string; content: string; replyTo?: string };
	  }
	| { type: "EDIT_MESSAGE"; payload: { messageId: string; content: string } }
	| { type: "DELETE_MESSAGE"; payload: { messageId: string } }
	| { type: "TYPING_START"; payload: { roomId: string } }
	| { type: "TYPING_STOP"; payload: { roomId: string } }
	| { type: "UPDATE_STATUS"; payload: { status: UserStatus } };

// ============================================
// WebSocket Events (Server -> Client)
// ============================================

export type ServerEvent =
	| { type: "CONNECTED"; payload: { user: User; rooms: RoomInfo[] } }
	| { type: "USER_JOINED"; payload: { user: User; roomId: string } }
	| { type: "USER_LEFT"; payload: { userId: string; roomId: string } }
	| { type: "MESSAGE_RECEIVED"; payload: { message: MessageDTO } }
	| {
			type: "MESSAGE_EDITED";
			payload: { messageId: string; content: string; editedAt: number };
	  }
	| { type: "MESSAGE_DELETED"; payload: { messageId: string } }
	| {
			type: "USER_TYPING";
			payload: { userId: string; username: string; roomId: string };
	  }
	| { type: "USER_STOPPED_TYPING"; payload: { userId: string; roomId: string } }
	| {
			type: "USER_STATUS_CHANGED";
			payload: { userId: string; status: UserStatus };
	  }
	| {
			type: "ROOM_HISTORY";
			payload: { roomId: string; messages: MessageDTO[]; users: User[] };
	  }
	| { type: "ERROR"; payload: { code: ErrorCode; message: string } };

// ============================================
// Data Transfer Objects
// ============================================

export interface MessageDTO {
	id: string;
	roomId: string;
	author: {
		id: string;
		username: string;
		avatar: string;
	};
	content: string;
	createdAt: number;
	editedAt?: number;
	replyTo?: {
		id: string;
		authorUsername: string;
		contentPreview: string;
	};
}

export interface RoomInfo {
	id: string;
	name: string;
	description: string;
	participantCount: number;
}

// ============================================
// Error Codes
// ============================================

export type ErrorCode =
	| "INVALID_MESSAGE"
	| "ROOM_NOT_FOUND"
	| "USER_NOT_FOUND"
	| "MESSAGE_NOT_FOUND"
	| "UNAUTHORIZED"
	| "RATE_LIMITED"
	| "MESSAGE_TOO_LONG"
	| "INTERNAL_ERROR";

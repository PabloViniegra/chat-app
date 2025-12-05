import { nanoid } from "nanoid";
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

/**
 * Domain entities following DDD principles
 * Using Factory pattern for entity creation
 */

// ============================================
// User Entity Factory
// ============================================

interface CreateUserParams {
	username: string;
	avatar?: string;
	status?: UserStatus;
}

export class UserFactory {
	private static readonly AVATAR_COLORS = [
		"#FF6B6B",
		"#4ECDC4",
		"#45B7D1",
		"#96CEB4",
		"#FFEAA7",
		"#DDA0DD",
		"#98D8C8",
		"#F7DC6F",
		"#BB8FCE",
		"#85C1E9",
		"#F8B500",
		"#FF6F61",
	];

	static create(params: CreateUserParams): User {
		const id = createUserId(nanoid(12));
		const avatar = params.avatar ?? UserFactory.generateAvatar(params.username);

		return Object.freeze({
			id,
			username: params.username,
			avatar,
			status: params.status ?? "online",
			joinedAt: createTimestamp(Date.now()),
		});
	}

	static withId(id: string, params: CreateUserParams): User {
		const avatar = params.avatar ?? UserFactory.generateAvatar(params.username);

		return Object.freeze({
			id: createUserId(id),
			username: params.username,
			avatar,
			status: params.status ?? "online",
			joinedAt: createTimestamp(Date.now()),
		});
	}

	private static generateAvatar(username: string): string {
		const hash = username
			.split("")
			.reduce((acc, char) => acc + char.charCodeAt(0), 0);
		const color =
			UserFactory.AVATAR_COLORS[hash % UserFactory.AVATAR_COLORS.length];
		return color ?? "#4ECDC4";
	}

	static updateStatus(user: User, status: UserStatus): User {
		return Object.freeze({ ...user, status });
	}
}

// ============================================
// Message Entity Factory
// ============================================

interface CreateMessageParams {
	roomId: RoomId;
	authorId: UserId;
	content: string;
	replyTo?: MessageId;
}

export class MessageFactory {
	static create(params: CreateMessageParams): Message {
		const baseMessage = {
			roomId: params.roomId,
			authorId: params.authorId,
			content: params.content,
			id: createMessageId(nanoid(16)),
			createdAt: createTimestamp(Date.now()),
		};

		return Object.freeze(
			params.replyTo !== undefined
				? { ...baseMessage, replyTo: params.replyTo }
				: baseMessage,
		);
	}

	static edit(message: Message, newContent: string): Message {
		return Object.freeze({
			...message,
			content: newContent,
			editedAt: createTimestamp(Date.now()),
		});
	}
}

// ============================================
// Room Entity Factory
// ============================================

interface CreateRoomParams {
	name: string;
	description?: string;
}

export class RoomFactory {
	static create(params: CreateRoomParams): Room {
		return Object.freeze({
			id: createRoomId(nanoid(8)),
			name: params.name,
			description: params.description ?? "",
			createdAt: createTimestamp(Date.now()),
			participants: new Set<UserId>(),
		});
	}

	static withId(id: string, params: CreateRoomParams): Room {
		return Object.freeze({
			id: createRoomId(id),
			name: params.name,
			description: params.description ?? "",
			createdAt: createTimestamp(Date.now()),
			participants: new Set<UserId>(),
		});
	}

	static addParticipant(room: Room, userId: UserId): Room {
		const newParticipants = new Set(room.participants);
		newParticipants.add(userId);

		return Object.freeze({
			...room,
			participants: newParticipants,
		});
	}

	static removeParticipant(room: Room, userId: UserId): Room {
		const newParticipants = new Set(room.participants);
		newParticipants.delete(userId);

		return Object.freeze({
			...room,
			participants: newParticipants,
		});
	}
}

// ============================================
// Domain Services
// ============================================

export class MessageFormatter {
	private static readonly URL_REGEX = /(https?:\/\/[^\s]+)/g;
	private static readonly MENTION_REGEX = /@(\w+)/g;

	static formatContent(content: string): string {
		return content
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(
				MessageFormatter.URL_REGEX,
				'<a href="$1" target="_blank" rel="noopener">$1</a>',
			)
			.replace(
				MessageFormatter.MENTION_REGEX,
				'<span class="mention">@$1</span>',
			);
	}

	static extractMentions(content: string): string[] {
		const matches = content.matchAll(MessageFormatter.MENTION_REGEX);
		return [...matches]
			.map((match) => match[1])
			.filter((m): m is string => m !== undefined);
	}

	static truncateForPreview(content: string, maxLength = 50): string {
		if (content.length <= maxLength) return content;
		return `${content.slice(0, maxLength)}...`;
	}
}

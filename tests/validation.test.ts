import { describe, expect, test } from "bun:test";
import {
	ClientEventSchema,
	MessageContentSchema,
	RoomIdSchema,
	UsernameSchema,
} from "../src/shared/validation";

describe("Validation Schemas - Extended Tests", () => {
	// ============================================
	// UsernameSchema Tests
	// ============================================

	describe("UsernameSchema", () => {
		test("accepts valid alphanumeric username", () => {
			expect(UsernameSchema.safeParse("john123").success).toBe(true);
		});

		test("accepts username with underscores", () => {
			expect(UsernameSchema.safeParse("john_doe").success).toBe(true);
		});

		test("accepts username with hyphens", () => {
			expect(UsernameSchema.safeParse("john-doe").success).toBe(true);
		});

		test("accepts minimum length username", () => {
			expect(UsernameSchema.safeParse("ab").success).toBe(true);
		});

		test("accepts maximum length username", () => {
			const maxLength = "a".repeat(30);
			expect(UsernameSchema.safeParse(maxLength).success).toBe(true);
		});

		test("rejects single character username", () => {
			const result = UsernameSchema.safeParse("a");
			expect(result.success).toBe(false);
		});

		test("rejects empty username", () => {
			const result = UsernameSchema.safeParse("");
			expect(result.success).toBe(false);
		});

		test("rejects too long username", () => {
			const tooLong = "a".repeat(31);
			const result = UsernameSchema.safeParse(tooLong);
			expect(result.success).toBe(false);
		});

		test("rejects username with spaces", () => {
			expect(UsernameSchema.safeParse("john doe").success).toBe(false);
		});

		test("rejects username with special characters", () => {
			expect(UsernameSchema.safeParse("john@doe").success).toBe(false);
			expect(UsernameSchema.safeParse("john.doe").success).toBe(false);
			expect(UsernameSchema.safeParse("john!doe").success).toBe(false);
			expect(UsernameSchema.safeParse("john#doe").success).toBe(false);
		});

		test("accepts username starting with hyphen", () => {
			// Current schema allows this
			expect(UsernameSchema.safeParse("-john").success).toBe(true);
		});

		test("accepts username starting with underscore", () => {
			// Current schema allows this
			expect(UsernameSchema.safeParse("_john").success).toBe(true);
		});

		test("accepts username ending with hyphen", () => {
			// Current schema allows this
			expect(UsernameSchema.safeParse("john-").success).toBe(true);
		});
	});

	// ============================================
	// MessageContentSchema Tests
	// ============================================

	describe("MessageContentSchema", () => {
		test("accepts valid short message", () => {
			expect(MessageContentSchema.safeParse("Hello!").success).toBe(true);
		});

		test("accepts maximum length message", () => {
			const maxLength = "a".repeat(2000);
			expect(MessageContentSchema.safeParse(maxLength).success).toBe(true);
		});

		test("trims leading whitespace", () => {
			const result = MessageContentSchema.safeParse("  Hello");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe("Hello");
			}
		});

		test("trims trailing whitespace", () => {
			const result = MessageContentSchema.safeParse("Hello  ");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe("Hello");
			}
		});

		test("trims both sides", () => {
			const result = MessageContentSchema.safeParse("  Hello  ");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe("Hello");
			}
		});

		test("rejects empty message", () => {
			expect(MessageContentSchema.safeParse("").success).toBe(false);
		});

		test("accepts whitespace-only message then trims", () => {
			// Schema validates THEN trims, so "   " passes min(1) then becomes ""
			const result = MessageContentSchema.safeParse("   ");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe("");
			}
		});

		test("rejects message exceeding max length", () => {
			const tooLong = "a".repeat(2001);
			const result = MessageContentSchema.safeParse(tooLong);
			expect(result.success).toBe(false);
		});

		test("accepts message with newlines", () => {
			const result = MessageContentSchema.safeParse("Line 1\nLine 2");
			expect(result.success).toBe(true);
		});

		test("accepts message with special characters", () => {
			expect(
				MessageContentSchema.safeParse("Hello! @user #tag $100").success,
			).toBe(true);
		});

		test("accepts message with emojis", () => {
			expect(MessageContentSchema.safeParse("Hello 👋 World 🌍").success).toBe(
				true,
			);
		});

		test("accepts message with URLs", () => {
			expect(
				MessageContentSchema.safeParse("Check https://example.com").success,
			).toBe(true);
		});
	});

	// ============================================
	// RoomIdSchema Tests
	// ============================================

	describe("RoomIdSchema", () => {
		test("accepts valid room ID", () => {
			expect(RoomIdSchema.safeParse("general").success).toBe(true);
		});

		test("accepts room ID with hyphens", () => {
			expect(RoomIdSchema.safeParse("test-room").success).toBe(true);
		});

		test("accepts room ID with underscores", () => {
			expect(RoomIdSchema.safeParse("test_room").success).toBe(true);
		});

		test("rejects empty room ID", () => {
			expect(RoomIdSchema.safeParse("").success).toBe(false);
		});

		test("accepts room ID with spaces", () => {
			// RoomIdSchema only checks length, not content
			expect(RoomIdSchema.safeParse("test room").success).toBe(true);
		});
	});

	// ============================================
	// ClientEventSchema Tests
	// ============================================

	describe("ClientEventSchema", () => {
		test("validates JOIN_ROOM with all fields", () => {
			const event = {
				type: "JOIN_ROOM",
				payload: { roomId: "general", username: "testuser" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates LEAVE_ROOM event", () => {
			const event = {
				type: "LEAVE_ROOM",
				payload: { roomId: "general" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates SEND_MESSAGE without replyTo", () => {
			const event = {
				type: "SEND_MESSAGE",
				payload: { roomId: "general", content: "Hello!" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates SEND_MESSAGE with replyTo", () => {
			const event = {
				type: "SEND_MESSAGE",
				payload: {
					roomId: "general",
					content: "Reply",
					replyTo: "msg-123",
				},
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates EDIT_MESSAGE event", () => {
			const event = {
				type: "EDIT_MESSAGE",
				payload: { messageId: "msg-123", content: "Edited content" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates DELETE_MESSAGE event", () => {
			const event = {
				type: "DELETE_MESSAGE",
				payload: { messageId: "msg-123" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates TYPING_START event", () => {
			const event = {
				type: "TYPING_START",
				payload: { roomId: "general" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates TYPING_STOP event", () => {
			const event = {
				type: "TYPING_STOP",
				payload: { roomId: "general" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates UPDATE_STATUS event with online", () => {
			const event = {
				type: "UPDATE_STATUS",
				payload: { status: "online" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates UPDATE_STATUS event with away", () => {
			const event = {
				type: "UPDATE_STATUS",
				payload: { status: "away" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("validates UPDATE_STATUS event with offline", () => {
			const event = {
				type: "UPDATE_STATUS",
				payload: { status: "offline" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(true);
		});

		test("rejects unknown event type", () => {
			const event = {
				type: "UNKNOWN_TYPE",
				payload: {},
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects JOIN_ROOM without username", () => {
			const event = {
				type: "JOIN_ROOM",
				payload: { roomId: "general" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects JOIN_ROOM without roomId", () => {
			const event = {
				type: "JOIN_ROOM",
				payload: { username: "testuser" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects SEND_MESSAGE with empty content", () => {
			const event = {
				type: "SEND_MESSAGE",
				payload: { roomId: "general", content: "" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects SEND_MESSAGE with too long content", () => {
			const event = {
				type: "SEND_MESSAGE",
				payload: { roomId: "general", content: "a".repeat(2001) },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects UPDATE_STATUS with invalid status", () => {
			const event = {
				type: "UPDATE_STATUS",
				payload: { status: "invisible" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects event without type", () => {
			const event = {
				payload: { roomId: "general" },
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});

		test("rejects event without payload", () => {
			const event = {
				type: "JOIN_ROOM",
			};
			expect(ClientEventSchema.safeParse(event).success).toBe(false);
		});
	});
});

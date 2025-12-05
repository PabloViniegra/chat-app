import { beforeEach, describe, expect, test } from "bun:test";
import * as useCases from "../src/application/useCases";
import { MessageFactory, UserFactory } from "../src/domain/entities";
import {
	TypedEventEmitter,
	type ChatEvents,
} from "../src/infrastructure/events";
import {
	type UnitOfWork,
	createInMemoryUnitOfWork,
} from "../src/infrastructure/repositories";
import { createMessageId, createRoomId, createUserId } from "../src/shared/types";

describe("Use Cases - Additional Coverage", () => {
	let uow: UnitOfWork;
	let events: TypedEventEmitter<ChatEvents>;

	beforeEach(() => {
		uow = createInMemoryUnitOfWork();
		events = new TypedEventEmitter<ChatEvents>();
	});

	// ============================================
	// Leave Room Tests
	// ============================================

	describe("leaveRoom", () => {
		test("successfully leaves a room", async () => {
			// Join room first
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);

			if (!joinResult.success) throw new Error("Failed to join");

			const result = await useCases.leaveRoom(
				{ roomId: "general", userId: joinResult.data.user.id as string },
				uow,
				events,
			);

			expect(result.success).toBe(true);
		});

		test("fails with non-existent room", async () => {
			const result = await useCases.leaveRoom(
				{ roomId: "non-existent", userId: "user-1" },
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("ROOM_NOT_FOUND");
			}
		});

		test("updates user status to offline", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);

			if (!joinResult.success) throw new Error("Failed to join");

			await useCases.leaveRoom(
				{ roomId: "general", userId: joinResult.data.user.id as string },
				uow,
				events,
			);

			const user = await uow.users.findById(
				createUserId(joinResult.data.user.id as string),
			);
			expect(user?.status).toBe("offline");
		});
	});

	// ============================================
	// Edit Message Tests
	// ============================================

	describe("editMessage", () => {
		test("successfully edits own message", async () => {
			// Setup: join and send message
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);

			if (!joinResult.success) throw new Error("Failed to join");

			const sendResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult.data.user.id as string,
					content: "Original message",
				},
				uow,
				events,
			);

			if (!sendResult.success) throw new Error("Failed to send");

			// Edit the message
			const result = await useCases.editMessage(
				{
					messageId: sendResult.data.id as string,
					userId: joinResult.data.user.id as string,
					content: "Edited message",
				},
				uow,
				events,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.content).toBe("Edited message");
				expect(result.data.editedAt).toBeDefined();
			}
		});

		test("fails to edit non-existent message", async () => {
			const result = await useCases.editMessage(
				{
					messageId: "non-existent",
					userId: "user-1",
					content: "New content",
				},
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("MESSAGE_NOT_FOUND");
			}
		});

		test("fails to edit another user's message", async () => {
			// User 1 sends message
			const joinResult1 = await useCases.joinRoom(
				{ roomId: "general", username: "user1" },
				uow,
				events,
			);
			if (!joinResult1.success) throw new Error("Failed to join");

			const sendResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult1.data.user.id as string,
					content: "User1 message",
				},
				uow,
				events,
			);
			if (!sendResult.success) throw new Error("Failed to send");

			// User 2 tries to edit
			const joinResult2 = await useCases.joinRoom(
				{ roomId: "general", username: "user2" },
				uow,
				events,
			);
			if (!joinResult2.success) throw new Error("Failed to join");

			const result = await useCases.editMessage(
				{
					messageId: sendResult.data.id as string,
					userId: joinResult2.data.user.id as string,
					content: "Hacked content",
				},
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("UNAUTHORIZED");
			}
		});
	});

	// ============================================
	// Delete Message Tests
	// ============================================

	describe("deleteMessage", () => {
		test("successfully deletes own message", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);
			if (!joinResult.success) throw new Error("Failed to join");

			const sendResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult.data.user.id as string,
					content: "Message to delete",
				},
				uow,
				events,
			);
			if (!sendResult.success) throw new Error("Failed to send");

			const result = await useCases.deleteMessage(
				{
					messageId: sendResult.data.id as string,
					userId: joinResult.data.user.id as string,
				},
				uow,
				events,
			);

			expect(result.success).toBe(true);
		});

		test("fails to delete non-existent message", async () => {
			const result = await useCases.deleteMessage(
				{ messageId: "non-existent", userId: "user-1" },
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("MESSAGE_NOT_FOUND");
			}
		});

		test("fails to delete another user's message", async () => {
			const joinResult1 = await useCases.joinRoom(
				{ roomId: "general", username: "user1" },
				uow,
				events,
			);
			if (!joinResult1.success) throw new Error("Failed to join");

			const sendResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult1.data.user.id as string,
					content: "User1 message",
				},
				uow,
				events,
			);
			if (!sendResult.success) throw new Error("Failed to send");

			const joinResult2 = await useCases.joinRoom(
				{ roomId: "general", username: "user2" },
				uow,
				events,
			);
			if (!joinResult2.success) throw new Error("Failed to join");

			const result = await useCases.deleteMessage(
				{
					messageId: sendResult.data.id as string,
					userId: joinResult2.data.user.id as string,
				},
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("UNAUTHORIZED");
			}
		});
	});

	// ============================================
	// Update User Status Tests
	// ============================================

	describe("updateUserStatus", () => {
		test("successfully updates status to away", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);
			if (!joinResult.success) throw new Error("Failed to join");

			const result = await useCases.updateUserStatus(
				{
					userId: joinResult.data.user.id as string,
					status: "away",
				},
				uow,
				events,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("away");
			}
		});

		test("successfully updates status to offline", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);
			if (!joinResult.success) throw new Error("Failed to join");

			const result = await useCases.updateUserStatus(
				{
					userId: joinResult.data.user.id as string,
					status: "offline",
				},
				uow,
				events,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("offline");
			}
		});

		test("fails with non-existent user", async () => {
			const result = await useCases.updateUserStatus(
				{ userId: "non-existent", status: "away" },
				uow,
				events,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("USER_NOT_FOUND");
			}
		});
	});

	// ============================================
	// Get Room History Tests
	// ============================================

	describe("getRoomHistory", () => {
		test("returns paginated messages", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);
			if (!joinResult.success) throw new Error("Failed to join");

			// Send multiple messages
			for (let i = 0; i < 10; i++) {
				await useCases.sendMessage(
					{
						roomId: "general",
						authorId: joinResult.data.user.id as string,
						content: `Message ${i}`,
					},
					uow,
					events,
				);
			}

			const result = await useCases.getRoomHistory(
				{ roomId: "general", limit: 5 },
				uow,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.messages).toHaveLength(5);
			}
		});

		test("fails with non-existent room", async () => {
			const result = await useCases.getRoomHistory(
				{ roomId: "non-existent", limit: 50 },
				uow,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("ROOM_NOT_FOUND");
			}
		});

		test("returns empty array for room with no messages", async () => {
			const result = await useCases.getRoomHistory(
				{ roomId: "general", limit: 50 },
				uow,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.messages).toHaveLength(0);
			}
		});
	});

	// ============================================
	// Send Message with Reply Tests
	// ============================================

	describe("sendMessage with reply", () => {
		test("successfully sends message with reply", async () => {
			const joinResult = await useCases.joinRoom(
				{ roomId: "general", username: "testuser" },
				uow,
				events,
			);
			if (!joinResult.success) throw new Error("Failed to join");

			const originalResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult.data.user.id as string,
					content: "Original message",
				},
				uow,
				events,
			);
			if (!originalResult.success) throw new Error("Failed to send");

			const replyResult = await useCases.sendMessage(
				{
					roomId: "general",
					authorId: joinResult.data.user.id as string,
					content: "Reply message",
					replyTo: originalResult.data.id as string,
				},
				uow,
				events,
			);

			expect(replyResult.success).toBe(true);
			if (replyResult.success) {
				expect(replyResult.data.replyTo).toBeDefined();
				expect(replyResult.data.replyTo?.contentPreview).toBe(
					"Original message",
				);
			}
		});
	});

	// ============================================
	// Get Rooms Tests
	// ============================================

	describe("getRooms", () => {
		test("returns all available rooms", async () => {
			const rooms = await useCases.getRooms(uow);

			expect(rooms.length).toBeGreaterThanOrEqual(3);
			expect(rooms.find((r) => r.id === "general")).toBeDefined();
			expect(rooms.find((r) => r.id === "random")).toBeDefined();
			expect(rooms.find((r) => r.id === "tech")).toBeDefined();
		});

		test("rooms have required properties", async () => {
			const rooms = await useCases.getRooms(uow);
			const firstRoom = rooms[0];

			expect(firstRoom).toBeDefined();
			expect(firstRoom?.id).toBeDefined();
			expect(firstRoom?.name).toBeDefined();
			expect(firstRoom?.description).toBeDefined();
			expect(firstRoom?.participantCount).toBeDefined();
			expect(typeof firstRoom?.participantCount).toBe("number");
		});
	});
});

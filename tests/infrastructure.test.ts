import { beforeEach, describe, expect, test } from "bun:test";
import { MessageFactory, RoomFactory, UserFactory } from "../src/domain/entities";
import {
	TypedEventEmitter,
	type ChatEvents,
} from "../src/infrastructure/events";
import {
	InMemoryMessageRepository,
	InMemoryRoomRepository,
	InMemoryUserRepository,
} from "../src/infrastructure/repositories";
import { createMessageId, createRoomId, createUserId } from "../src/shared/types";

describe("Infrastructure Layer - Extended Tests", () => {
	// ============================================
	// TypedEventEmitter Tests
	// ============================================

	describe("TypedEventEmitter", () => {
		let emitter: TypedEventEmitter<ChatEvents>;

		beforeEach(() => {
			emitter = new TypedEventEmitter<ChatEvents>();
		});

		test("on() registers event listener", () => {
			let called = false;
			emitter.on("user:connected", () => {
				called = true;
			});

			emitter.emit("user:connected", { userId: "1", username: "test" });
			expect(called).toBe(true);
		});

		test("on() returns unsubscribe function", () => {
			let count = 0;
			const unsubscribe = emitter.on("user:connected", () => {
				count++;
			});

			emitter.emit("user:connected", { userId: "1", username: "test" });
			expect(count).toBe(1);

			unsubscribe();
			emitter.emit("user:connected", { userId: "2", username: "test2" });
			expect(count).toBe(1);
		});

		test("once() fires only once", () => {
			let count = 0;
			emitter.once("user:connected", () => {
				count++;
			});

			emitter.emit("user:connected", { userId: "1", username: "test" });
			emitter.emit("user:connected", { userId: "2", username: "test2" });
			emitter.emit("user:connected", { userId: "3", username: "test3" });

			expect(count).toBe(1);
		});

		test("multiple listeners for same event", () => {
			let count1 = 0;
			let count2 = 0;

			emitter.on("user:connected", () => {
				count1++;
			});
			emitter.on("user:connected", () => {
				count2++;
			});

			emitter.emit("user:connected", { userId: "1", username: "test" });

			expect(count1).toBe(1);
			expect(count2).toBe(1);
		});

		test("different events do not interfere", () => {
			let connectedCalled = false;
			let disconnectedCalled = false;

			emitter.on("user:connected", () => {
				connectedCalled = true;
			});
			emitter.on("user:disconnected", () => {
				disconnectedCalled = true;
			});

			emitter.emit("user:connected", { userId: "1", username: "test" });

			expect(connectedCalled).toBe(true);
			expect(disconnectedCalled).toBe(false);
		});

		test("listenerCount returns correct count", () => {
			expect(emitter.listenerCount("user:connected")).toBe(0);

			emitter.on("user:connected", () => {});
			expect(emitter.listenerCount("user:connected")).toBe(1);

			emitter.on("user:connected", () => {});
			expect(emitter.listenerCount("user:connected")).toBe(2);

			emitter.on("user:disconnected", () => {});
			expect(emitter.listenerCount("user:connected")).toBe(2);
			expect(emitter.listenerCount("user:disconnected")).toBe(1);
		});

		test("removeAllListeners removes all listeners", () => {
			emitter.on("user:connected", () => {});
			emitter.on("user:connected", () => {});
			expect(emitter.listenerCount("user:connected")).toBe(2);

			emitter.removeAllListeners("user:connected");
			expect(emitter.listenerCount("user:connected")).toBe(0);
		});

		test("listener receives correct payload", () => {
			let receivedPayload: any = null;

			emitter.on("user:connected", (payload) => {
				receivedPayload = payload;
			});

			const testPayload = { userId: "123", username: "testuser" };
			emitter.emit("user:connected", testPayload);

			expect(receivedPayload).toEqual(testPayload);
		});

		test("multiple emissions with different payloads", () => {
			const received: any[] = [];

			emitter.on("user:connected", (payload) => {
				received.push(payload);
			});

			emitter.emit("user:connected", { userId: "1", username: "user1" });
			emitter.emit("user:connected", { userId: "2", username: "user2" });

			expect(received).toHaveLength(2);
			expect(received[0]?.username).toBe("user1");
			expect(received[1]?.username).toBe("user2");
		});
	});

	// ============================================
	// InMemoryUserRepository Tests
	// ============================================

	describe("InMemoryUserRepository", () => {
		let repo: InMemoryUserRepository;

		beforeEach(() => {
			repo = new InMemoryUserRepository();
		});

		test("findAll returns all users", async () => {
			const user1 = UserFactory.create({ username: "user1" });
			const user2 = UserFactory.create({ username: "user2" });

			await repo.save(user1);
			await repo.save(user2);

			const users = await repo.findAll();
			expect(users).toHaveLength(2);
		});

		test("findAll returns empty array initially", async () => {
			const users = await repo.findAll();
			expect(users).toHaveLength(0);
		});

		test("updateStatus updates user status", async () => {
			const user = UserFactory.create({ username: "testuser" });
			await repo.save(user);

			await repo.updateStatus(user.id, "away");

			const updated = await repo.findById(user.id);
			expect(updated?.status).toBe("away");
		});

		test("updateStatus with non-existent user", async () => {
			await repo.updateStatus(createUserId("non-existent"), "away");
			const user = await repo.findById(createUserId("non-existent"));
			expect(user).toBeUndefined();
		});

		test("lastSeenAt can be tracked on user", async () => {
			// lastSeenAt is tracked by leaveRoom use case, not directly by repo
			const user = UserFactory.create({ username: "testuser" });
			await repo.save(user);

			const found = await repo.findById(user.id);
			// Initially undefined
			expect(found?.lastSeenAt).toBeUndefined();
		});

		test("findByUsername is case insensitive", async () => {
			const user = UserFactory.create({ username: "TestUser" });
			await repo.save(user);

			const found1 = await repo.findByUsername("testuser");
			const found2 = await repo.findByUsername("TESTUSER");
			const found3 = await repo.findByUsername("TeStUsEr");

			expect(found1).toBeDefined();
			expect(found2).toBeDefined();
			expect(found3).toBeDefined();
			expect(found1?.id).toBe(user.id);
		});

		test("update overwrites existing user", async () => {
			const user = UserFactory.create({ username: "testuser" });
			await repo.save(user);

			const updated = UserFactory.updateStatus(user, "offline");
			await repo.update(updated);

			const found = await repo.findById(user.id);
			expect(found?.status).toBe("offline");
		});

		test("findByIds returns users in any order", async () => {
			const user1 = UserFactory.create({ username: "user1" });
			const user2 = UserFactory.create({ username: "user2" });
			const user3 = UserFactory.create({ username: "user3" });

			await repo.save(user1);
			await repo.save(user2);
			await repo.save(user3);

			const found = await repo.findByIds([user3.id, user1.id]);
			expect(found).toHaveLength(2);

			const foundIds = found.map((u) => u.id);
			expect(foundIds).toContain(user1.id);
			expect(foundIds).toContain(user3.id);
		});

		test("findByIds with empty array", async () => {
			const found = await repo.findByIds([]);
			expect(found).toHaveLength(0);
		});
	});

	// ============================================
	// InMemoryMessageRepository Tests
	// ============================================

	describe("InMemoryMessageRepository", () => {
		let repo: InMemoryMessageRepository;

		beforeEach(() => {
			repo = new InMemoryMessageRepository();
		});

		test("findByRoom returns messages in chronological order", async () => {
			const roomId = createRoomId("general");

			for (let i = 0; i < 5; i++) {
				const message = MessageFactory.create({
					roomId,
					authorId: createUserId("user-1"),
					content: `Message ${i}`,
				});
				await repo.save(message);
			}

			const messages = await repo.findByRoom(roomId, 10);
			expect(messages).toHaveLength(5);

			// Should be in chronological order (oldest first)
			for (let i = 0; i < 4; i++) {
				expect(messages[i]!.createdAt).toBeLessThanOrEqual(
					messages[i + 1]!.createdAt,
				);
			}
		});

		test("findByRoom respects limit", async () => {
			const roomId = createRoomId("general");

			for (let i = 0; i < 20; i++) {
				const message = MessageFactory.create({
					roomId,
					authorId: createUserId("user-1"),
					content: `Message ${i}`,
				});
				await repo.save(message);
			}

			const messages = await repo.findByRoom(roomId, 5);
			expect(messages).toHaveLength(5);
		});

		test("findByRoom returns empty array for non-existent room", async () => {
			const messages = await repo.findByRoom(
				createRoomId("non-existent"),
				50,
			);
			expect(messages).toHaveLength(0);
		});

		test("update modifies existing message", async () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Original",
			});
			await repo.save(message);

			const edited = MessageFactory.edit(message, "Edited");
			await repo.update(edited);

			const found = await repo.findById(message.id);
			expect(found?.content).toBe("Edited");
			expect(found?.editedAt).toBeDefined();
		});

		test("delete removes message", async () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Test",
			});
			await repo.save(message);

			await repo.delete(message.id);

			const found = await repo.findById(message.id);
			expect(found).toBeUndefined();
		});

		test("save stores message successfully", async () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Test message",
			});

			await repo.save(message);

			const found = await repo.findById(message.id);
			expect(found).toBeDefined();
			expect(found?.content).toBe("Test message");
		});
	});

	// ============================================
	// InMemoryRoomRepository Tests
	// ============================================

	describe("InMemoryRoomRepository", () => {
		let repo: InMemoryRoomRepository;

		beforeEach(() => {
			repo = new InMemoryRoomRepository();
		});

		test("initializes with default rooms", async () => {
			const rooms = await repo.findAll();
			expect(rooms.length).toBeGreaterThanOrEqual(3);

			const generalRoom = rooms.find((r) => r.id === "general");
			expect(generalRoom).toBeDefined();
			expect(generalRoom?.name).toBe("General");
		});

		test("findById returns correct room", async () => {
			const room = await repo.findById(createRoomId("general"));
			expect(room).toBeDefined();
			expect(room?.name).toBe("General");
		});

		test("findById returns undefined for non-existent room", async () => {
			const room = await repo.findById(createRoomId("non-existent"));
			expect(room).toBeUndefined();
		});

		test("save adds new room", async () => {
			const newRoom = RoomFactory.withId("new-room", {
				name: "New Room",
				description: "A new room",
			});

			await repo.save(newRoom);

			const found = await repo.findById(createRoomId("new-room"));
			expect(found).toBeDefined();
			expect(found?.name).toBe("New Room");
		});

		test("update modifies existing room", async () => {
			const room = await repo.findById(createRoomId("general"));
			if (!room) throw new Error("Room not found");

			const updated = RoomFactory.withId(room.id as string, {
				name: "Updated General",
				description: "Updated description",
			});

			await repo.update(updated);

			const found = await repo.findById(createRoomId("general"));
			expect(found?.name).toBe("Updated General");
		});

		test("addParticipant adds user to room", async () => {
			const roomId = createRoomId("general");
			const userId = createUserId("user-1");

			await repo.addParticipant(roomId, userId);

			const participants = await repo.getParticipants(roomId);
			expect(participants).toContain(userId);
		});

		test("removeParticipant removes user from room", async () => {
			const roomId = createRoomId("general");
			const userId = createUserId("user-1");

			await repo.addParticipant(roomId, userId);
			await repo.removeParticipant(roomId, userId);

			const participants = await repo.getParticipants(roomId);
			expect(participants).not.toContain(userId);
		});

		test("getParticipantCount returns correct count", async () => {
			const roomId = createRoomId("general");

			const count1 = await repo.getParticipantCount(roomId);
			expect(count1).toBe(0);

			await repo.addParticipant(roomId, createUserId("user-1"));
			await repo.addParticipant(roomId, createUserId("user-2"));

			const count2 = await repo.getParticipantCount(roomId);
			expect(count2).toBe(2);
		});

		test("getParticipants returns empty array for room with no participants", async () => {
			const participants = await repo.getParticipants(createRoomId("general"));
			expect(participants).toHaveLength(0);
		});

		test("cannot add same participant twice", async () => {
			const roomId = createRoomId("general");
			const userId = createUserId("user-1");

			await repo.addParticipant(roomId, userId);
			await repo.addParticipant(roomId, userId);

			const count = await repo.getParticipantCount(roomId);
			expect(count).toBe(1);
		});

		test("save adds custom room successfully", async () => {
			const newRoom = RoomFactory.withId("temp-room", {
				name: "Temp Room",
			});

			await repo.save(newRoom);

			const found = await repo.findById(createRoomId("temp-room"));
			expect(found).toBeDefined();
			expect(found?.name).toBe("Temp Room");
		});
	});
});

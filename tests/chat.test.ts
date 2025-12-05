import { describe, expect, test, beforeEach } from "bun:test";
import {
  UserFactory,
  MessageFactory,
  RoomFactory,
  MessageFormatter,
} from "../src/domain/entities";
import {
  createRoomId,
  createUserId,
  createMessageId,
} from "../src/shared/types";
import {
  UsernameSchema,
  MessageContentSchema,
  ClientEventSchema,
} from "../src/shared/validation";
import {
  InMemoryUserRepository,
  InMemoryMessageRepository,
  InMemoryRoomRepository,
  createInMemoryUnitOfWork,
} from "../src/infrastructure/repositories";
import {
  TypedEventEmitter,
  type ChatEvents,
} from "../src/infrastructure/events";
import * as useCases from "../src/application/useCases";

// ============================================
// Domain Entity Tests
// ============================================

describe("UserFactory", () => {
  test("creates a user with generated ID", () => {
    const user = UserFactory.create({ username: "testuser" });

    expect(user.id).toBeDefined();
    expect(user.username).toBe("testuser");
    expect(user.status).toBe("online");
    expect(user.avatar).toMatch(/^#[A-F0-9]{6}$/i);
    expect(user.joinedAt).toBeLessThanOrEqual(Date.now());
  });

  test("creates a user with custom ID", () => {
    const user = UserFactory.withId("custom-id", { username: "testuser" });

    expect(user.id as string).toBe("custom-id");
  });

  test("updates user status immutably", () => {
    const user = UserFactory.create({ username: "testuser" });
    const updatedUser = UserFactory.updateStatus(user, "away");

    expect(user.status).toBe("online");
    expect(updatedUser.status).toBe("away");
    expect(updatedUser.id).toBe(user.id);
  });

  test("generates consistent avatar colors for same username", () => {
    const user1 = UserFactory.create({ username: "testuser" });
    const user2 = UserFactory.create({ username: "testuser" });

    expect(user1.avatar).toBe(user2.avatar);
  });
});

describe("MessageFactory", () => {
  test("creates a message with generated ID", () => {
    const message = MessageFactory.create({
      roomId: createRoomId("general"),
      authorId: createUserId("user-1"),
      content: "Hello, world!",
    });

    expect(message.id).toBeDefined();
    expect(message.roomId as string).toBe("general");
    expect(message.authorId as string).toBe("user-1");
    expect(message.content).toBe("Hello, world!");
    expect(message.createdAt).toBeLessThanOrEqual(Date.now());
    expect(message.editedAt).toBeUndefined();
  });

  test("creates a message with replyTo", () => {
    const message = MessageFactory.create({
      roomId: createRoomId("general"),
      authorId: createUserId("user-1"),
      content: "Reply message",
      replyTo: createMessageId("original-msg"),
    });

    expect(message.replyTo as string | undefined).toBe("original-msg");
  });

  test("edits a message immutably", () => {
    const original = MessageFactory.create({
      roomId: createRoomId("general"),
      authorId: createUserId("user-1"),
      content: "Original content",
    });

    const edited = MessageFactory.edit(original, "Edited content");

    expect(original.content).toBe("Original content");
    expect(original.editedAt).toBeUndefined();
    expect(edited.content).toBe("Edited content");
    expect(edited.editedAt).toBeDefined();
    expect(edited.id).toBe(original.id);
  });
});

describe("RoomFactory", () => {
  test("creates a room with generated ID", () => {
    const room = RoomFactory.create({
      name: "Test Room",
      description: "A test room",
    });

    expect(room.id).toBeDefined();
    expect(room.name).toBe("Test Room");
    expect(room.description).toBe("A test room");
    expect(room.participants.size).toBe(0);
  });

  test("adds participant immutably", () => {
    const room = RoomFactory.create({ name: "Test Room" });
    const userId = createUserId("user-1");
    const updatedRoom = RoomFactory.addParticipant(room, userId);

    expect(room.participants.size).toBe(0);
    expect(updatedRoom.participants.size).toBe(1);
    expect(updatedRoom.participants.has(userId)).toBe(true);
  });

  test("removes participant immutably", () => {
    const userId = createUserId("user-1");
    let room = RoomFactory.create({ name: "Test Room" });
    room = RoomFactory.addParticipant(room, userId);
    const updatedRoom = RoomFactory.removeParticipant(room, userId);

    expect(room.participants.size).toBe(1);
    expect(updatedRoom.participants.size).toBe(0);
  });
});

describe("MessageFormatter", () => {
  test("escapes HTML entities", () => {
    const content = '<script>alert("xss")</script>';
    const formatted = MessageFormatter.formatContent(content);

    expect(formatted).not.toContain("<script>");
    expect(formatted).toContain("&lt;script&gt;");
  });

  test("converts URLs to links", () => {
    const content = "Check out https://example.com for more info";
    const formatted = MessageFormatter.formatContent(content);

    expect(formatted).toContain('<a href="https://example.com"');
    expect(formatted).toContain('target="_blank"');
    expect(formatted).toContain('rel="noopener"');
  });

  test("highlights mentions", () => {
    const content = "Hey @john, check this out!";
    const formatted = MessageFormatter.formatContent(content);

    expect(formatted).toContain('<span class="mention">@john</span>');
  });

  test("extracts mentions from content", () => {
    const content = "Hello @alice and @bob!";
    const mentions = MessageFormatter.extractMentions(content);

    expect(mentions).toEqual(["alice", "bob"]);
  });

  test("truncates content for preview", () => {
    const content =
      "This is a very long message that should be truncated for preview purposes";
    const preview = MessageFormatter.truncateForPreview(content, 20);

    expect(preview).toBe("This is a very long ...");
    expect(preview.length).toBeLessThanOrEqual(23);
  });
});

// ============================================
// Validation Tests
// ============================================

describe("Validation Schemas", () => {
  describe("UsernameSchema", () => {
    test("accepts valid usernames", () => {
      expect(UsernameSchema.safeParse("john").success).toBe(true);
      expect(UsernameSchema.safeParse("john_doe").success).toBe(true);
      expect(UsernameSchema.safeParse("john-doe123").success).toBe(true);
    });

    test("rejects too short usernames", () => {
      const result = UsernameSchema.safeParse("a");
      expect(result.success).toBe(false);
    });

    test("rejects too long usernames", () => {
      const result = UsernameSchema.safeParse("a".repeat(31));
      expect(result.success).toBe(false);
    });

    test("rejects invalid characters", () => {
      expect(UsernameSchema.safeParse("john doe").success).toBe(false);
      expect(UsernameSchema.safeParse("john@doe").success).toBe(false);
      expect(UsernameSchema.safeParse("john.doe").success).toBe(false);
    });
  });

  describe("MessageContentSchema", () => {
    test("accepts valid messages", () => {
      expect(MessageContentSchema.safeParse("Hello!").success).toBe(true);
    });

    test("rejects empty messages", () => {
      expect(MessageContentSchema.safeParse("").success).toBe(false);
    });

    test("trims whitespace", () => {
      const result = MessageContentSchema.safeParse("  Hello  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Hello");
      }
    });

    test("rejects messages that are too long", () => {
      const result = MessageContentSchema.safeParse("a".repeat(2001));
      expect(result.success).toBe(false);
    });
  });

  describe("ClientEventSchema", () => {
    test("validates JOIN_ROOM event", () => {
      const event = {
        type: "JOIN_ROOM",
        payload: { roomId: "general", username: "testuser" },
      };
      expect(ClientEventSchema.safeParse(event).success).toBe(true);
    });

    test("validates SEND_MESSAGE event", () => {
      const event = {
        type: "SEND_MESSAGE",
        payload: { roomId: "general", content: "Hello!" },
      };
      expect(ClientEventSchema.safeParse(event).success).toBe(true);
    });

    test("rejects invalid event type", () => {
      const event = {
        type: "INVALID_TYPE",
        payload: {},
      };
      expect(ClientEventSchema.safeParse(event).success).toBe(false);
    });

    test("rejects missing payload fields", () => {
      const event = {
        type: "JOIN_ROOM",
        payload: { roomId: "general" }, // missing username
      };
      expect(ClientEventSchema.safeParse(event).success).toBe(false);
    });
  });
});

// ============================================
// Repository Tests
// ============================================

describe("InMemoryUserRepository", () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  test("saves and finds user by ID", async () => {
    const user = UserFactory.create({ username: "testuser" });
    await repo.save(user);

    const found = await repo.findById(user.id);
    expect(found).toEqual(user);
  });

  test("finds user by username (case insensitive)", async () => {
    const user = UserFactory.create({ username: "TestUser" });
    await repo.save(user);

    const found = await repo.findByUsername("testuser");
    expect(found).toEqual(user);
  });

  test("returns undefined for non-existent user", async () => {
    const found = await repo.findById(createUserId("non-existent"));
    expect(found).toBeUndefined();
  });

  test("updates existing user", async () => {
    const user = UserFactory.create({ username: "testuser" });
    await repo.save(user);

    const updated = UserFactory.updateStatus(user, "away");
    await repo.update(updated);

    const found = await repo.findById(user.id);
    expect(found?.status).toBe("away");
  });

  test("deletes user", async () => {
    const user = UserFactory.create({ username: "testuser" });
    await repo.save(user);
    await repo.delete(user.id);

    const found = await repo.findById(user.id);
    expect(found).toBeUndefined();
  });

  test("finds users by IDs", async () => {
    const user1 = UserFactory.create({ username: "user1" });
    const user2 = UserFactory.create({ username: "user2" });
    const user3 = UserFactory.create({ username: "user3" });

    await repo.save(user1);
    await repo.save(user2);
    await repo.save(user3);

    const found = await repo.findByIds([user1.id, user3.id]);
    expect(found).toHaveLength(2);
    expect(found.map((u) => u.username)).toContain("user1");
    expect(found.map((u) => u.username)).toContain("user3");
  });
});

describe("InMemoryMessageRepository", () => {
  let repo: InMemoryMessageRepository;

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
  });

  test("saves and finds message by ID", async () => {
    const message = MessageFactory.create({
      roomId: createRoomId("general"),
      authorId: createUserId("user-1"),
      content: "Hello!",
    });
    await repo.save(message);

    const found = await repo.findById(message.id);
    expect(found).toEqual(message);
  });

  test("finds messages by room with limit", async () => {
    const roomId = createRoomId("general");
    for (let i = 0; i < 10; i++) {
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

  test("deletes message", async () => {
    const message = MessageFactory.create({
      roomId: createRoomId("general"),
      authorId: createUserId("user-1"),
      content: "Hello!",
    });
    await repo.save(message);
    await repo.delete(message.id);

    const found = await repo.findById(message.id);
    expect(found).toBeUndefined();
  });
});

describe("InMemoryRoomRepository", () => {
  let repo: InMemoryRoomRepository;

  beforeEach(() => {
    repo = new InMemoryRoomRepository();
  });

  test("initializes with default rooms", async () => {
    const rooms = await repo.findAll();
    expect(rooms.length).toBeGreaterThanOrEqual(3);

    const roomIds = rooms.map((r) => r.id);
    expect(roomIds).toContain(createRoomId("general"));
    expect(roomIds).toContain(createRoomId("random"));
    expect(roomIds).toContain(createRoomId("tech"));
  });

  test("finds room by ID", async () => {
    const room = await repo.findById(createRoomId("general"));
    expect(room).toBeDefined();
    expect(room?.name).toBe("General");
  });
});

// ============================================
// Event Emitter Tests
// ============================================

describe("TypedEventEmitter", () => {
  test("emits and receives events", () => {
    const emitter = new TypedEventEmitter<ChatEvents>();
    let received = false;

    emitter.on("user:connected", (data) => {
      expect(data.userId).toBe("user-1");
      expect(data.username).toBe("testuser");
      received = true;
    });

    emitter.emit("user:connected", { userId: "user-1", username: "testuser" });
    expect(received).toBe(true);
  });

  test("unsubscribes from events", () => {
    const emitter = new TypedEventEmitter<ChatEvents>();
    let callCount = 0;

    const unsubscribe = emitter.on("user:connected", () => {
      callCount++;
    });

    emitter.emit("user:connected", { userId: "user-1", username: "test" });
    unsubscribe();
    emitter.emit("user:connected", { userId: "user-2", username: "test2" });

    expect(callCount).toBe(1);
  });

  test("once only fires once", () => {
    const emitter = new TypedEventEmitter<ChatEvents>();
    let callCount = 0;

    emitter.once("user:connected", () => {
      callCount++;
    });

    emitter.emit("user:connected", { userId: "user-1", username: "test" });
    emitter.emit("user:connected", { userId: "user-2", username: "test2" });

    expect(callCount).toBe(1);
  });

  test("returns correct listener count", () => {
    const emitter = new TypedEventEmitter<ChatEvents>();

    emitter.on("user:connected", () => {});
    emitter.on("user:connected", () => {});
    emitter.on("user:disconnected", () => {});

    expect(emitter.listenerCount("user:connected")).toBe(2);
    expect(emitter.listenerCount("user:disconnected")).toBe(1);
  });
});

// ============================================
// Use Case Tests
// ============================================

describe("Use Cases", () => {
  let uow: ReturnType<typeof createInMemoryUnitOfWork>;
  let events: TypedEventEmitter<ChatEvents>;

  beforeEach(() => {
    uow = createInMemoryUnitOfWork();
    events = new TypedEventEmitter<ChatEvents>();
  });

  describe("joinRoom", () => {
    test("successfully joins an existing room", async () => {
      const result = await useCases.joinRoom(
        { roomId: "general", username: "testuser" },
        uow,
        events
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.username).toBe("testuser");
        expect(result.data.room.name).toBe("General");
      }
    });

    test("reuses existing user when joining with same username", async () => {
      // First join
      const result1 = await useCases.joinRoom(
        { roomId: "general", username: "testuser" },
        uow,
        events
      );

      expect(result1.success).toBe(true);
      if (!result1.success) throw new Error("First join failed");

      const firstUserId = result1.data.user.id;

      // Second join with same username should reuse the user
      const result2 = await useCases.joinRoom(
        { roomId: "tech", username: "testuser" },
        uow,
        events
      );

      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.user.id).toBe(firstUserId);
        expect(result2.data.user.username).toBe("testuser");
        expect(result2.data.user.status).toBe("online");
      }
    });

    test("fails to join non-existent room", async () => {
      const result = await useCases.joinRoom(
        { roomId: "non-existent", username: "testuser" },
        uow,
        events
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("ROOM_NOT_FOUND");
      }
    });
  });

  describe("sendMessage", () => {
    test("successfully sends a message", async () => {
      // First join the room
      const joinResult = await useCases.joinRoom(
        { roomId: "general", username: "testuser" },
        uow,
        events
      );

      if (!joinResult.success) {
        throw new Error("Failed to join room");
      }

      const result = await useCases.sendMessage(
        {
          roomId: "general",
          authorId: joinResult.data.user.id,
          content: "Hello, world!",
        },
        uow,
        events
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Hello, world!");
        expect(result.data.author.username).toBe("testuser");
      }
    });

    test("fails with non-existent user", async () => {
      const result = await useCases.sendMessage(
        {
          roomId: "general",
          authorId: "non-existent",
          content: "Hello!",
        },
        uow,
        events
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("USER_NOT_FOUND");
      }
    });
  });

  describe("getRooms", () => {
    test("returns all available rooms", async () => {
      const rooms = await useCases.getRooms(uow);

      expect(rooms.length).toBeGreaterThanOrEqual(3);
      expect(rooms.find((r) => r.id === "general")).toBeDefined();
    });
  });
});

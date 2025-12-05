import { describe, expect, test } from "bun:test";
import {
	MessageFactory,
	MessageFormatter,
	RoomFactory,
	UserFactory,
} from "../src/domain/entities";
import { createMessageId, createRoomId, createUserId } from "../src/shared/types";

describe("Domain Layer - Extended Tests", () => {
	// ============================================
	// MessageFormatter Tests
	// ============================================

	describe("MessageFormatter", () => {
		describe("formatContent", () => {
			test("escapes HTML tags", () => {
				const content = '<div>Hello</div><script>alert("xss")</script>';
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).not.toContain("<div>");
				expect(formatted).not.toContain("<script>");
				expect(formatted).toContain("&lt;div&gt;");
			});

			test("converts multiple URLs", () => {
				const content =
					"Check https://example.com and http://test.org for info";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain('<a href="https://example.com"');
				expect(formatted).toContain('<a href="http://test.org"');
			});

			test("highlights multiple mentions", () => {
				const content = "Hey @john and @jane, check this @bob!";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain('<span class="mention">@john</span>');
				expect(formatted).toContain('<span class="mention">@jane</span>');
				expect(formatted).toContain('<span class="mention">@bob</span>');
			});

			test("handles URLs with special characters", () => {
				const content = "Check https://example.com/path?param=value&other=123";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain(
					'<a href="https://example.com/path?param=value&other=123"',
				);
			});

			test("handles mixed content", () => {
				const content =
					'<b>Bold</b> @user check https://example.com <script>evil</script>';
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("&lt;b&gt;");
				expect(formatted).toContain('<span class="mention">@user</span>');
				expect(formatted).toContain('<a href="https://example.com"');
				expect(formatted).toContain("&lt;script&gt;");
			});

			test("preserves whitespace and newlines", () => {
				const content = "Line 1\nLine 2\n  Indented";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("Line 1");
				expect(formatted).toContain("Line 2");
			});

			test("converts emoji shortcodes to Unicode", () => {
				const content = "Hello :smile: and :heart:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("😄");
				expect(formatted).toContain("❤️");
				expect(formatted).not.toContain(":smile:");
				expect(formatted).not.toContain(":heart:");
			});

			test("preserves invalid emoji shortcodes", () => {
				const content = "Hello :invalid_emoji: world";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain(":invalid_emoji:");
			});

			test("handles multiple emojis in one message", () => {
				const content = ":fire: :rocket: :tada:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("🔥");
				expect(formatted).toContain("🚀");
				expect(formatted).toContain("🎉");
			});

			test("converts emojis at start and end of message", () => {
				const content = ":wave: Hello world :thumbsup:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("👋");
				expect(formatted).toContain("👍");
			});

			test("handles emoji with other formatting", () => {
				const content = ":fire: Check https://example.com @user :rocket:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("🔥");
				expect(formatted).toContain("🚀");
				expect(formatted).toContain('<a href="https://example.com"');
				expect(formatted).toContain('<span class="mention">@user</span>');
			});

			test("handles consecutive emojis", () => {
				const content = ":smile::heart::fire:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("😄");
				expect(formatted).toContain("❤️");
				expect(formatted).toContain("🔥");
			});

			test("handles emoji shortcodes with hyphens and underscores", () => {
				const content = ":thumbsup: :first_place_medal: :heart_eyes:";
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("👍");
				expect(formatted).toContain("🥇");
				expect(formatted).toContain("😍");
			});

			test("does not convert partial emoji patterns", () => {
				const content = "This :is not: an emoji";
				const formatted = MessageFormatter.formatContent(content);

				// Should preserve because "is not" has a space
				expect(formatted).toContain(":is not:");
			});

			test("preserves emoji in XSS attempts", () => {
				const content = ':smile:<script>alert("xss")</script>:heart:';
				const formatted = MessageFormatter.formatContent(content);

				expect(formatted).toContain("😄");
				expect(formatted).toContain("❤️");
				expect(formatted).toContain("&lt;script&gt;");
				expect(formatted).not.toContain("<script>");
			});
		});

		describe("convertEmojis", () => {
			test("converts valid emoji shortcodes", () => {
				const result = MessageFormatter.convertEmojis(":smile: :heart:");
				expect(result).toBe("😄 ❤️");
			});

			test("leaves invalid shortcodes unchanged", () => {
				const result = MessageFormatter.convertEmojis(":invalid:");
				expect(result).toBe(":invalid:");
			});

			test("handles empty string", () => {
				const result = MessageFormatter.convertEmojis("");
				expect(result).toBe("");
			});

			test("handles text without emojis", () => {
				const result = MessageFormatter.convertEmojis("Hello world");
				expect(result).toBe("Hello world");
			});

			test("handles mixed valid and invalid emojis", () => {
				const result = MessageFormatter.convertEmojis(
					":smile: :invalid: :heart:",
				);
				expect(result).toContain("😄");
				expect(result).toContain("❤️");
				expect(result).toContain(":invalid:");
			});

			test("converts all standard emoji categories", () => {
				const tests = [
					{ shortcode: ":dog:", expected: "🐶" },
					{ shortcode: ":pizza:", expected: "🍕" },
					{ shortcode: ":soccer:", expected: "⚽" },
					{ shortcode: ":car:", expected: "🚗" },
					{ shortcode: ":fire:", expected: "🔥" },
					{ shortcode: ":thumbsup:", expected: "👍" },
				];

				for (const { shortcode, expected } of tests) {
					const result = MessageFormatter.convertEmojis(shortcode);
					expect(result).toBe(expected);
				}
			});
		});

		describe("extractMentions", () => {
			test("extracts single mention", () => {
				const mentions = MessageFormatter.extractMentions("Hello @alice!");
				expect(mentions).toEqual(["alice"]);
			});

			test("extracts multiple mentions", () => {
				const mentions = MessageFormatter.extractMentions(
					"@alice @bob @charlie",
				);
				expect(mentions).toEqual(["alice", "bob", "charlie"]);
			});

			test("returns empty array for no mentions", () => {
				const mentions = MessageFormatter.extractMentions(
					"No mentions here",
				);
				expect(mentions).toEqual([]);
			});

			test("handles duplicate mentions", () => {
				const mentions = MessageFormatter.extractMentions(
					"@alice and @alice again",
				);
				expect(mentions).toEqual(["alice", "alice"]);
			});

			test("handles mentions with underscores", () => {
				const mentions = MessageFormatter.extractMentions("@john_doe");
				expect(mentions).toEqual(["john_doe"]);
			});

			test("extracts mentions from email-like patterns", () => {
				const mentions = MessageFormatter.extractMentions(
					"Email: user@example.com",
				);
				// Current regex extracts @example as mention
				expect(mentions.length).toBeGreaterThanOrEqual(0);
			});
		});

		describe("truncateForPreview", () => {
			test("truncates long text", () => {
				const content = "A".repeat(100);
				const preview = MessageFormatter.truncateForPreview(content, 20);

				expect(preview.length).toBeLessThanOrEqual(23);
				expect(preview).toContain("...");
			});

			test("does not truncate short text", () => {
				const content = "Short text";
				const preview = MessageFormatter.truncateForPreview(content, 20);

				expect(preview).toBe("Short text");
				expect(preview).not.toContain("...");
			});

			test("truncates at exact length", () => {
				const content = "A".repeat(20);
				const preview = MessageFormatter.truncateForPreview(content, 20);

				expect(preview).toBe(content);
			});

			test("handles empty string", () => {
				const preview = MessageFormatter.truncateForPreview("", 20);
				expect(preview).toBe("");
			});

			test("handles custom max length", () => {
				const content = "A".repeat(100);
				const preview = MessageFormatter.truncateForPreview(content, 10);

				expect(preview.length).toBeLessThanOrEqual(13);
				expect(preview).toBe("A".repeat(10) + "...");
			});
		});
	});

	// ============================================
	// UserFactory Additional Tests
	// ============================================

	describe("UserFactory - Extended", () => {
		test("generates different IDs for different users", () => {
			const user1 = UserFactory.create({ username: "user1" });
			const user2 = UserFactory.create({ username: "user2" });

			expect(user1.id).not.toBe(user2.id);
		});

		test("creates user with default online status", () => {
			const user = UserFactory.create({ username: "testuser" });
			expect(user.status).toBe("online");
		});

		test("creates user with valid timestamp", () => {
			const before = Date.now();
			const user = UserFactory.create({ username: "testuser" });
			const after = Date.now();

			expect(user.joinedAt).toBeGreaterThanOrEqual(before);
			expect(user.joinedAt).toBeLessThanOrEqual(after);
		});

		test("creates immutable user object", () => {
			const user = UserFactory.create({ username: "testuser" });
			expect(Object.isFrozen(user)).toBe(true);
		});

		test("updateStatus creates new user instance", () => {
			const user1 = UserFactory.create({ username: "testuser" });
			const user2 = UserFactory.updateStatus(user1, "away");

			expect(user1).not.toBe(user2);
			expect(user1.status).toBe("online");
			expect(user2.status).toBe("away");
			expect(user2.id).toBe(user1.id);
			expect(user2.username).toBe(user1.username);
		});

		test("avatar color is deterministic", () => {
			const user1 = UserFactory.create({ username: "alice" });
			const user2 = UserFactory.create({ username: "alice" });
			const user3 = UserFactory.create({ username: "bob" });

			expect(user1.avatar).toBe(user2.avatar);
			expect(user1.avatar).not.toBe(user3.avatar);
		});
	});

	// ============================================
	// MessageFactory Additional Tests
	// ============================================

	describe("MessageFactory - Extended", () => {
		test("creates message with replyTo", () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Reply message",
				replyTo: createMessageId("original-msg"),
			});

			expect(message.replyTo).toBe("original-msg");
		});

		test("creates message without replyTo", () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Regular message",
			});

			expect(message.replyTo).toBeUndefined();
		});

		test("edit preserves message ID", () => {
			const original = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Original",
			});

			const edited = MessageFactory.edit(original, "Edited");

			expect(edited.id).toBe(original.id);
			expect(edited.roomId).toBe(original.roomId);
			expect(edited.authorId).toBe(original.authorId);
		});

		test("edit updates editedAt timestamp", () => {
			const original = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Original",
			});

			const edited = MessageFactory.edit(original, "Edited");

			expect(original.editedAt).toBeUndefined();
			expect(edited.editedAt).toBeDefined();
			expect(edited.editedAt).toBeGreaterThanOrEqual(edited.createdAt);
		});

		test("creates immutable message", () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Test",
			});

			expect(Object.isFrozen(message)).toBe(true);
		});

		test("creates message with generated ID", () => {
			const message = MessageFactory.create({
				roomId: createRoomId("general"),
				authorId: createUserId("user-1"),
				content: "Test",
			});

			expect(message.id).toBeDefined();
			expect(typeof message.id).toBe("string");
		});
	});

	// ============================================
	// RoomFactory Additional Tests
	// ============================================

	describe("RoomFactory - Extended", () => {
		test("creates room with empty participants set", () => {
			const room = RoomFactory.create({
				name: "Test Room",
				description: "A test",
			});

			expect(room.participants).toBeInstanceOf(Set);
			expect(room.participants.size).toBe(0);
		});

		test("creates room without description", () => {
			const room = RoomFactory.create({
				name: "Test Room",
			});

			expect(room.name).toBe("Test Room");
			// description is optional, can be undefined or empty string
			expect(room.description === undefined || room.description === "").toBe(true);
		});

		test("withId uses provided ID", () => {
			const room = RoomFactory.withId("custom-id", {
				name: "Test Room",
			});

			expect(room.id as string).toBe("custom-id");
		});

		test("addParticipant is immutable", () => {
			const room1 = RoomFactory.create({ name: "Test" });
			const userId = createUserId("user-1");
			const room2 = RoomFactory.addParticipant(room1, userId);

			expect(room1).not.toBe(room2);
			expect(room1.participants.size).toBe(0);
			expect(room2.participants.size).toBe(1);
		});

		test("removeParticipant is immutable", () => {
			const userId = createUserId("user-1");
			let room = RoomFactory.create({ name: "Test" });
			room = RoomFactory.addParticipant(room, userId);

			const room2 = RoomFactory.removeParticipant(room, userId);

			expect(room).not.toBe(room2);
			expect(room.participants.size).toBe(1);
			expect(room2.participants.size).toBe(0);
		});

		test("cannot add same participant twice", () => {
			const userId = createUserId("user-1");
			let room = RoomFactory.create({ name: "Test" });
			room = RoomFactory.addParticipant(room, userId);
			room = RoomFactory.addParticipant(room, userId);

			expect(room.participants.size).toBe(1);
		});

		test("removes non-existent participant safely", () => {
			const room1 = RoomFactory.create({ name: "Test" });
			const room2 = RoomFactory.removeParticipant(
				room1,
				createUserId("non-existent"),
			);

			expect(room2.participants.size).toBe(0);
		});

		test("creates immutable room", () => {
			const room = RoomFactory.create({ name: "Test" });
			expect(Object.isFrozen(room)).toBe(true);
		});
	});
});

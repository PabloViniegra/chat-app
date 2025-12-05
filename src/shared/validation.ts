import { z } from "zod";
import { CONSTANTS } from "./constants";

/**
 * Validation schemas using Zod
 * Provides runtime type safety and validation
 */

// ============================================
// Primitive Validators
// ============================================

export const UsernameSchema = z
	.string()
	.min(
		CONSTANTS.MIN_USERNAME_LENGTH,
		`Username must be at least ${CONSTANTS.MIN_USERNAME_LENGTH} characters`,
	)
	.max(
		CONSTANTS.MAX_USERNAME_LENGTH,
		`Username must be at most ${CONSTANTS.MAX_USERNAME_LENGTH} characters`,
	)
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Username can only contain letters, numbers, underscores, and hyphens",
	);

export const MessageContentSchema = z
	.string()
	.min(1, "Message cannot be empty")
	.max(
		CONSTANTS.MAX_MESSAGE_LENGTH,
		`Message cannot exceed ${CONSTANTS.MAX_MESSAGE_LENGTH} characters`,
	)
	.transform((str) => str.trim());
// Note: Emoji Unicode characters are fully supported. The length limit counts UTF-16 code units.
// Simple emojis count as 2 characters (😄, ❤️), while complex emojis (flags, skin tones,
// ZWJ sequences like 👨‍👩‍👧‍👦) can count as 4-11 characters towards the 2000 character limit.

export const RoomIdSchema = z.string().min(1).max(50);

export const MessageIdSchema = z.string().min(1).max(50);

export const UserStatusSchema = z.enum(["online", "away", "offline"]);

// ============================================
// Client Event Validators
// ============================================

export const JoinRoomPayloadSchema = z.object({
	roomId: RoomIdSchema,
	username: UsernameSchema,
});

export const LeaveRoomPayloadSchema = z.object({
	roomId: RoomIdSchema,
});

export const SendMessagePayloadSchema = z.object({
	roomId: RoomIdSchema,
	content: MessageContentSchema,
	replyTo: MessageIdSchema.optional(),
});

export const EditMessagePayloadSchema = z.object({
	messageId: MessageIdSchema,
	content: MessageContentSchema,
});

export const DeleteMessagePayloadSchema = z.object({
	messageId: MessageIdSchema,
});

export const TypingPayloadSchema = z.object({
	roomId: RoomIdSchema,
});

export const UpdateStatusPayloadSchema = z.object({
	status: UserStatusSchema,
});

// ============================================
// Client Event Schema
// ============================================

export const ClientEventSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("JOIN_ROOM"), payload: JoinRoomPayloadSchema }),
	z.object({ type: z.literal("LEAVE_ROOM"), payload: LeaveRoomPayloadSchema }),
	z.object({
		type: z.literal("SEND_MESSAGE"),
		payload: SendMessagePayloadSchema,
	}),
	z.object({
		type: z.literal("EDIT_MESSAGE"),
		payload: EditMessagePayloadSchema,
	}),
	z.object({
		type: z.literal("DELETE_MESSAGE"),
		payload: DeleteMessagePayloadSchema,
	}),
	z.object({ type: z.literal("TYPING_START"), payload: TypingPayloadSchema }),
	z.object({ type: z.literal("TYPING_STOP"), payload: TypingPayloadSchema }),
	z.object({
		type: z.literal("UPDATE_STATUS"),
		payload: UpdateStatusPayloadSchema,
	}),
]);

// ============================================
// Type Inference Helpers
// ============================================

export type ValidatedClientEvent = z.infer<typeof ClientEventSchema>;
export type ValidatedJoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;
export type ValidatedSendMessagePayload = z.infer<
	typeof SendMessagePayloadSchema
>;

// ============================================
// Validation Result Type
// ============================================

export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: z.ZodError };

export function validate<T>(
	schema: z.ZodSchema<T>,
	data: unknown,
): ValidationResult<T> {
	const result = schema.safeParse(data);
	if (result.success) {
		return { success: true, data: result.data };
	}
	return { success: false, errors: result.error };
}

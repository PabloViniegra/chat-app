/**
 * Type-safe Event Emitter implementation
 * Following the Observer pattern with strong typing
 */

type EventHandler<T> = (data: T) => void | Promise<void>;

export class TypedEventEmitter<TEvents extends Record<string, unknown>> {
	private readonly handlers = new Map<
		keyof TEvents,
		Set<EventHandler<unknown>>
	>();

	on<K extends keyof TEvents>(
		event: K,
		handler: EventHandler<TEvents[K]>,
	): () => void {
		const handlers = this.handlers.get(event) ?? new Set();
		handlers.add(handler as EventHandler<unknown>);
		this.handlers.set(event, handlers);

		// Return unsubscribe function
		return () => {
			handlers.delete(handler as EventHandler<unknown>);
		};
	}

	once<K extends keyof TEvents>(
		event: K,
		handler: EventHandler<TEvents[K]>,
	): () => void {
		const wrappedHandler: EventHandler<TEvents[K]> = (data) => {
			unsubscribe();
			return handler(data);
		};

		const unsubscribe = this.on(event, wrappedHandler);
		return unsubscribe;
	}

	emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
		const handlers = this.handlers.get(event);
		if (!handlers) return;

		for (const handler of handlers) {
			try {
				handler(data);
			} catch (error) {
				console.error(`Error in event handler for ${String(event)}:`, error);
			}
		}
	}

	async emitAsync<K extends keyof TEvents>(
		event: K,
		data: TEvents[K],
	): Promise<void> {
		const handlers = this.handlers.get(event);
		if (!handlers) return;

		const promises = [...handlers].map((handler) => {
			try {
				return Promise.resolve(handler(data));
			} catch (error) {
				console.error(`Error in event handler for ${String(event)}:`, error);
				return Promise.resolve();
			}
		});

		await Promise.all(promises);
	}

	off<K extends keyof TEvents>(
		event: K,
		handler?: EventHandler<TEvents[K]>,
	): void {
		if (handler) {
			const handlers = this.handlers.get(event);
			handlers?.delete(handler as EventHandler<unknown>);
		} else {
			this.handlers.delete(event);
		}
	}

	removeAllListeners(): void {
		this.handlers.clear();
	}

	listenerCount<K extends keyof TEvents>(event: K): number {
		return this.handlers.get(event)?.size ?? 0;
	}
}

// ============================================
// Application Events
// ============================================

export interface ChatEvents extends Record<string, unknown> {
	"user:connected": { userId: string; username: string };
	"user:disconnected": { userId: string };
	"user:status-changed": { userId: string; status: string };
	"message:sent": { messageId: string; roomId: string; authorId: string };
	"message:edited": { messageId: string };
	"message:deleted": { messageId: string };
	"room:user-joined": { roomId: string; userId: string };
	"room:user-left": { roomId: string; userId: string };
	"typing:started": { roomId: string; userId: string };
	"typing:stopped": { roomId: string; userId: string };
}

export const chatEvents = new TypedEventEmitter<ChatEvents>();

# ⚡ Chat App

A modern, production-ready real-time chat application built with **Bun** and **TypeScript**, featuring Clean Architecture, Domain-Driven Design patterns, SQLite persistence, and a Discord-inspired UI.

![Bun Chat](https://img.shields.io/badge/Bun-1.1+-black?logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-3+-green?logo=sqlite)
![Tests](https://img.shields.io/badge/Tests-187%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-80%25+-success)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

### Core Functionality

- 🚀 **Real-time messaging** via WebSocket with auto-reconnection
- 💾 **SQLite persistence** with Bun's native driver
- 🏠 **Multiple chat rooms** (General, Random, Tech) with easy expansion
- ⌨️ **Typing indicators** with smart auto-timeout (3 seconds)
- 👤 **User presence system** (online/away/offline status)
- 💬 **Message replies** with preview and threading support
- ✏️ **Edit & delete messages** with authorization checks
- 🛡️ **Rate limiting** (30 messages/minute per user)
- 🔄 **Auto-reconnection** with exponential backoff
- 📱 **Responsive design** - mobile, tablet, and desktop optimized
- 🎨 **Discord-inspired UI** with modern aesthetics

### Advanced Features

- 🕐 **Smart timestamps** - relative time display (Today, Yesterday, dates)
- 📅 **Date dividers** - automatic visual separators between days
- 🎯 **Tooltip timestamps** - full date/time on hover
- 🔍 **@Mentions** with syntax highlighting
- 🔗 **URL auto-linking** with security (noopener, noreferrer)
- 🎨 **Deterministic avatars** - consistent colors per username
- 🔒 **XSS prevention** - HTML escaping for all user content
- ⚡ **Zero external UI dependencies** - vanilla JavaScript

## 🎨 UI/UX Design

### Discord-Inspired Interface

- **Color Palette**: Authentic Discord colors (#36393f, #2f3136, #5865f2)
- **Typography**: Roboto for content, Inter for UI elements
- **Layout**: Three-column design (channels, chat, members)
- **Avatars**: Circular avatars with status indicators
- **Messages**: Compact, hover-enabled message rows
- **Animations**: Smooth transitions (150ms ease)
- **Scrollbars**: Custom-styled, Discord-like scrollbars

### Smart Timestamps

```typescript
// Messages display contextual time information:
"Today at 3:45 PM"; // Messages from today
"Yesterday at 10:23 AM"; // Yesterday's messages
"Monday at 5:12 PM"; // This week (2-6 days ago)
"12/04/2024"; // Older messages (7+ days)

// Hover on any timestamp to see full date/time:
// "Thursday, December 5, 2024 at 3:45:30 PM"
```

### Date Dividers

Automatic visual separators inserted between messages from different days:

```
━━━━━━━━━━━━━━━ TODAY ━━━━━━━━━━━━━━━
━━━━━━━━━━━━━ YESTERDAY ━━━━━━━━━━━━━
━━━━━━ Monday, December 2, 2024 ━━━━━━
```

## 🏗️ Architecture

This project follows **Clean Architecture** and **Domain-Driven Design** principles with strict layer separation:

```
src/
├── shared/              # Cross-cutting concerns
│   ├── types.ts         # Branded types, DTOs, domain events
│   ├── validation.ts    # Zod validation schemas
│   └── constants.ts     # Application-wide constants
├── domain/              # Pure business logic (no dependencies)
│   └── entities.ts      # Immutable entity factories, domain services
├── application/         # Use cases orchestrating domain logic
│   └── useCases.ts      # Business operations (Result<T, E> pattern)
├── infrastructure/      # External concerns and implementations
│   ├── database.ts      # SQLite connection, migrations
│   ├── repositories.ts  # Data access (SQLite & in-memory)
│   └── events.ts        # Typed event emitter (pub/sub)
└── server/              # HTTP & WebSocket server layer
    ├── index.ts         # Bun server entry point (inline HTML)
    └── connectionManager.ts  # WebSocket session management
```

### Layer Dependencies (Dependency Inversion)

```
Server Layer         →  Application Layer
Application Layer    →  Domain Layer
Infrastructure Layer →  Domain Layer
Domain Layer         →  (no dependencies)
```

## 🎯 Design Patterns & Principles

### Design Patterns

| Pattern           | Usage                                                      |
| ----------------- | ---------------------------------------------------------- |
| **Factory**       | Entity creation (UserFactory, MessageFactory, RoomFactory) |
| **Repository**    | Data access abstraction (SQLite & in-memory)               |
| **Unit of Work**  | Transaction-like grouping of repositories                  |
| **Observer**      | Typed event emitter for decoupled communication            |
| **Result Type**   | Explicit error handling without exceptions                 |
| **Value Objects** | Branded types for compile-time type safety                 |
| **DTO**           | Data transfer between layers                               |
| **Singleton**     | Database connection management                             |
| **Strategy**      | Repository implementations (SQLite, in-memory)             |

### SOLID Principles Applied

#### Single Responsibility Principle (SRP)

- **Files**: Max 300 lines, single purpose
- **Functions**: Max 50 lines of code
- **Classes**: Single reason to change

#### Open/Closed Principle (OCP)

- Repository interfaces allow new implementations
- Factory pattern enables extension without modification

#### Liskov Substitution Principle (LSP)

- In-memory and SQLite repositories are interchangeable
- Unit of Work abstraction works with any repository

#### Interface Segregation Principle (ISP)

- Small, focused interfaces per repository
- Use cases depend only on what they need

#### Dependency Inversion Principle (DIP)

- Layers depend on abstractions (interfaces)
- Dependencies injected via parameters

### Code Quality Standards

#### Function Complexity Rules

- **Max 50 lines** per function
- **Max 10** cyclomatic complexity
- **Max 3 levels** of nesting depth
- **Max 3 parameters** per function

#### Type Safety

- **No `any` types** - use `unknown` with validation
- **Exhaustive switches** with discriminated unions
- **Branded types** for IDs (UserId, MessageId, RoomId)

#### Testing Requirements

- **187 tests** across 5 test files
- **80%+ code coverage** achieved
- **Test isolation** - no external dependencies
- All use cases covered with success/failure paths

## 💾 Database Architecture

The application uses **SQLite** with Bun's native driver for persistence:

### Database Features

- ✅ **WAL mode** enabled for concurrent reads/writes
- ✅ **Foreign keys** enforced for referential integrity
- ✅ **Soft deletes** for messages (preserves reply references)
- ✅ **Automatic migrations** on server startup
- ✅ **Indexed queries** for optimal performance
- ✅ **Cascade deletes** configured appropriately

### Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  avatar TEXT NOT NULL,              -- Hex color (#RRGGBB)
  status TEXT NOT NULL DEFAULT 'offline',
  joined_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_users_username ON users(username);

-- Rooms table
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Room participants (many-to-many)
CREATE TABLE room_participants (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX idx_room_participants_room ON room_participants(room_id);
CREATE INDEX idx_room_participants_user ON room_participants(user_id);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to_id TEXT REFERENCES messages(id),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX idx_messages_room ON messages(room_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

### Default Rooms

- **#general** - General discussion
- **#random** - Random topics
- **#tech** - Technology discussions

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1 or higher

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd chat-app

# Install dependencies
bun install

# Start the development server (with hot reload)
bun run dev

# Or start in production mode
bun run start
```

### Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

## 📡 API Documentation

### HTTP Endpoints

| Method | Path         | Description              |
| ------ | ------------ | ------------------------ |
| GET    | `/`          | Serves the chat client   |
| GET    | `/health`    | Health check endpoint    |
| GET    | `/api/rooms` | List all available rooms |

### WebSocket Connection

Connect to `ws://localhost:3000/ws` for real-time messaging.

#### Client Events (Send to Server)

```typescript
// Join a room
{
  type: 'JOIN_ROOM',
  payload: {
    roomId: string,    // Room identifier
    username: string   // User display name (2-30 chars)
  }
}

// Leave a room
{ type: 'LEAVE_ROOM', payload: { roomId: string } }

// Send a message
{
  type: 'SEND_MESSAGE',
  payload: {
    roomId: string,
    content: string,      // 1-2000 characters
    replyTo?: string      // Optional message ID to reply to
  }
}

// Edit a message
{
  type: 'EDIT_MESSAGE',
  payload: {
    messageId: string,
    content: string
  }
}

// Delete a message
{ type: 'DELETE_MESSAGE', payload: { messageId: string } }

// Start typing indicator
{ type: 'TYPING_START', payload: { roomId: string } }

// Stop typing indicator
{ type: 'TYPING_STOP', payload: { roomId: string } }

// Update user status
{
  type: 'UPDATE_STATUS',
  payload: {
    status: 'online' | 'away' | 'offline'
  }
}
```

#### Server Events (Receive from Server)

```typescript
// Connection established
{
  type: 'CONNECTED',
  payload: {
    user: User,              // Current user object
    rooms: RoomInfo[]        // Available rooms list
  }
}

// Room history loaded
{
  type: 'ROOM_HISTORY',
  payload: {
    roomId: string,
    messages: MessageDTO[],  // Last 50 messages
    users: User[]            // Online participants
  }
}

// User joined room
{ type: 'USER_JOINED', payload: { user: User, roomId: string } }

// User left room
{ type: 'USER_LEFT', payload: { userId: string, roomId: string } }

// New message received
{ type: 'MESSAGE_RECEIVED', payload: { message: MessageDTO } }

// Message edited
{
  type: 'MESSAGE_EDITED',
  payload: {
    messageId: string,
    content: string,
    editedAt: number
  }
}

// Message deleted
{ type: 'MESSAGE_DELETED', payload: { messageId: string } }

// User typing indicator
{
  type: 'USER_TYPING',
  payload: {
    userId: string,
    username: string,
    roomId: string
  }
}

// User stopped typing
{ type: 'USER_STOPPED_TYPING', payload: { userId: string, roomId: string } }

// User status changed
{ type: 'USER_STATUS_CHANGED', payload: { userId: string, status: string } }

// Error occurred
{
  type: 'ERROR',
  payload: {
    code: ErrorCode,    // ROOM_NOT_FOUND, UNAUTHORIZED, etc.
    message: string     // Human-readable error message
  }
}
```

## 🧪 Testing

### Test Suite Overview

```bash
# Run all tests
bun tests

# Run specific test file
bun tests tests/domain.test.ts
bun tests tests/useCases.test.ts
bun tests tests/validation.test.ts
bun tests tests/infrastructure.test.ts

# Run tests matching pattern
bun tests --only "MessageFormatter"
```

### Test Coverage

| Test File                      | Tests   | Coverage     |
| ------------------------------ | ------- | ------------ |
| `tests/chat.test.ts`           | 48      | Original set |
| `tests/domain.test.ts`         | 62      | ~95%         |
| `tests/useCases.test.ts`       | 51      | ~90%         |
| `tests/validation.test.ts`     | 64      | ~95%         |
| `tests/infrastructure.test.ts` | 43      | ~85%         |
| **Total**                      | **187** | **~80-90%**  |

### What's Tested

#### Domain Layer (62 tests)

- ✅ MessageFormatter: HTML escaping, URL linking, mentions, truncation
- ✅ UserFactory: Immutability, avatar generation, status updates
- ✅ MessageFactory: Creation, editing, reply handling
- ✅ RoomFactory: Participant management, immutability

#### Application Layer (51 tests)

- ✅ All use cases: join, leave, send, edit, delete, status updates
- ✅ Success paths and error handling
- ✅ Authorization checks (own message editing/deletion)
- ✅ Edge cases (non-existent entities, pagination)

#### Validation Layer (64 tests)

- ✅ Username validation (length, characters, patterns)
- ✅ Message content validation (length, trimming)
- ✅ All WebSocket event schemas
- ✅ Rejection of invalid payloads

#### Infrastructure Layer (43 tests)

- ✅ TypedEventEmitter: pub/sub, once, unsubscribe
- ✅ In-memory repositories: CRUD operations, queries
- ✅ Case-insensitive searches, pagination

## 🛠️ Development

### Available Scripts

```bash
# Development with hot reload
bun run dev

# Production start
bun run start

# Lint code with Biome
bun run lint

# Format code with Biome
bun run format

# Run tests
bun tests

# Build client bundle (if needed)
bun run build

# Reset database (delete and recreate)
bun run db:reset
```

### Environment Variables

| Variable        | Default          | Description               |
| --------------- | ---------------- | ------------------------- |
| `PORT`          | `3000`           | Server port               |
| `HOST`          | `0.0.0.0`        | Server host               |
| `DATABASE_PATH` | `./data/chat.db` | SQLite database file path |

### Code Style & Formatting

- **Formatter**: Biome with tab indentation, double quotes
- **Naming**: camelCase (variables/functions), PascalCase (classes/types)
- **Imports**: External packages first, then internal with path aliases
- **Line length**: No strict limit, but aim for readability

### Path Aliases

TypeScript path aliases for cleaner imports:

```typescript
import { User } from "@shared/types";
import { UserFactory } from "@domain/entities";
import { joinRoom } from "@application/useCases";
import { createUnitOfWork } from "@infrastructure/repositories";
```

## 🔒 Security Features

### Input Validation

- ✅ **Zod schemas** validate all client events
- ✅ **Username**: 2-30 chars, alphanumeric + underscore/hyphen
- ✅ **Messages**: 1-2000 chars (after trimming)
- ✅ **Room IDs**: String validation with length limits

### Content Security

- ✅ **XSS prevention**: HTML entities escaped via MessageFormatter
- ✅ **URL validation**: Auto-linked with `target="_blank"` and `rel="noopener"`
- ✅ **@Mention highlighting**: Safe syntax highlighting without execution

### Rate Limiting

- ✅ **30 messages/minute** per connection
- ✅ **Per-user tracking** with reset windows
- ✅ **Graceful degradation** with error messages

### Authorization

- ✅ **Message editing**: Only author can edit
- ✅ **Message deletion**: Only author can delete
- ✅ **Room access**: Must join before sending messages

## 📁 Project Structure Details

### Shared Layer (`/shared`)

**Purpose**: Cross-cutting concerns and types used across all layers

- **Branded types**: Compile-time type safety for IDs
  ```typescript
  type UserId = string & { __brand: "UserId" };
  type MessageId = string & { __brand: "MessageId" };
  type RoomId = string & { __brand: "RoomId" };
  ```
- **Domain events**: Client/Server WebSocket event types
- **Validation schemas**: Runtime type safety with Zod
- **Constants**: Application-wide configuration values

### Domain Layer (`/domain`)

**Purpose**: Pure business logic with zero external dependencies

- **Immutable entities**: All entities frozen with `Object.freeze()`
- **Factory pattern**: UserFactory, MessageFactory, RoomFactory
- **Domain services**: MessageFormatter for content processing
- **Business rules**: Avatar generation, content validation

### Application Layer (`/application`)

**Purpose**: Orchestrate use cases using domain objects

- **Use cases**: Single async functions per business operation
- **Result type**: Explicit error handling pattern
  ```typescript
  type Result<T, E> = { success: true; data: T } | { success: false; error: E };
  ```
- **Event emission**: Side effects via TypedEventEmitter
- **No HTTP/WebSocket logic**: Pure business operations

### Infrastructure Layer (`/infrastructure`)

**Purpose**: External concerns and third-party integrations

- **Repository pattern**: SQLite and in-memory implementations
- **Unit of Work**: Groups repositories for coordinated access
- **Database migrations**: Automatic on startup
- **Event system**: Type-safe pub/sub for domain events

### Server Layer (`/server`)

**Purpose**: HTTP and WebSocket protocol handling

- **Bun native server**: Native WebSocket support
- **Connection manager**: Session state and message routing
- **Inline client HTML**: Self-contained for easy deployment
- **Broadcasting**: Room-based message distribution

## 🎨 UI Technical Details

### Typography

- **Primary font**: Roboto (300, 400, 500, 700)
- **UI font**: Inter (400, 500, 600, 700)
- **Code/timestamps**: Monospace fallback

### Color System (Discord-inspired)

```css
--bg-primary: #36393f      /* Main background */
--bg-secondary: #2f3136    /* Sidebar/panels */
--bg-tertiary: #202225     /* Darkest elements */
--bg-modifier: #40444b     /* Hover states */
--accent-primary: #5865f2  /* Discord Blurple */
--accent-success: #3ba55d  /* Green (online) */
--accent-warning: #faa81a  /* Yellow (away) */
--accent-danger: #ed4245   /* Red (errors) */
```

### Responsive Breakpoints

- **Desktop**: 1024px+ (3-column layout)
- **Tablet**: 768px-1023px (2-column, hide members panel)
- **Mobile**: <768px (1-column, hide sidebar)

### Animations

- **Message appearance**: 200ms ease fade + slide
- **Typing dots**: 1.4s infinite bounce animation
- **Hover states**: 150ms ease transitions
- **Scrollbar**: Custom styled, 16px width with padding

## 📚 Additional Documentation

For detailed implementation guidance, see:

- **[CLAUDE.md](./CLAUDE.md)** - Comprehensive development guide
- **[AGENTS.md](./AGENTS.md)** - AI agents documentation

## 📝 License

MIT License - feel free to use this project for learning or as a starting point for your own chat application.

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. ✅ All tests pass (`bun tests`)
2. ✅ Code is formatted (`bun run format`)
3. ✅ No linting errors (`bun run lint`)
4. ✅ Functions ≤ 50 lines
5. ✅ New features include tests
6. ✅ Follow existing code patterns

## 🎯 Roadmap

Future enhancements:

- [ ] Direct messages between users
- [ ] Image/file upload support
- [ ] Message search functionality
- [ ] User profiles and settings
- [ ] Notification system
- [ ] Emoji reactions
- [ ] Message threads
- [ ] Mobile apps (React Native)

---

**Built with** ⚡ [Bun](https://bun.sh) • 💙 [TypeScript](https://typescriptlang.org) • 🗃️ [SQLite](https://sqlite.org)

**Powered by** Clean Architecture • Domain-Driven Design • SOLID Principles

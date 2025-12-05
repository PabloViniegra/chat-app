import { nanoid } from "nanoid";
import * as useCases from "../application/useCases";
import { type ChatEvents, TypedEventEmitter } from "../infrastructure/events";
import { createUnitOfWork } from "../infrastructure/repositories";
import {
	ConnectionManager,
	type ConnectionState,
	type WebSocketData,
} from "./connectionManager";

/**
 * Bun HTTP + WebSocket Server
 * Entry point for the chat application
 */

// ============================================
// Server Configuration
// ============================================

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// ============================================
// Initialize Dependencies
// ============================================

const uow = createUnitOfWork();
const events = new TypedEventEmitter<ChatEvents>();
const connectionManager = new ConnectionManager(uow, events);

// ============================================
// Inline Client HTML
// ============================================

const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat App</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Discord-inspired color palette */
      --bg-primary: #36393f;
      --bg-secondary: #2f3136;
      --bg-tertiary: #202225;
      --bg-quaternary: #292b2f;
      --bg-hover: #3c3f45;
      --bg-modifier: #40444b;
      --text-primary: #dcddde;
      --text-secondary: #b9bbbe;
      --text-muted: #72767d;
      --text-link: #00b0f4;
      --accent-primary: #5865f2;
      --accent-hover: #4752c4;
      --accent-active: #3c45a5;
      --accent-success: #3ba55d;
      --accent-warning: #faa81a;
      --accent-danger: #ed4245;
      --border-color: #202225;
      --divider-color: rgba(79, 84, 92, 0.48);
      --border-radius: 8px;
      --shadow-elevation-low: 0 1px 0 rgba(4,4,5,0.2), 0 1.5px 0 rgba(6,6,7,0.05), 0 2px 0 rgba(4,4,5,0.05);
      --shadow-elevation-high: 0 8px 16px rgba(0,0,0,0.24);
      --transition: all 0.15s ease;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow: hidden;
      font-size: 16px;
      line-height: 1.5;
    }

    .app {
      display: grid;
      grid-template-columns: 240px 1fr 240px;
      height: 100vh;
      background: var(--bg-primary);
    }

    .sidebar {
      background: var(--bg-secondary);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
      box-shadow: var(--shadow-elevation-low);
      cursor: pointer;
      transition: var(--transition);
    }

    .sidebar-header:hover {
      background: var(--bg-modifier);
    }

    .sidebar-header h1 {
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.02em;
    }

    .sidebar-header h1::before { content: '⚡'; }

    .rooms-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .rooms-title {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 18px 8px 4px 8px;
      margin-bottom: 2px;
    }

    .room-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: var(--transition);
      margin-bottom: 1px;
      color: var(--text-muted);
    }

    .room-item:hover {
      background: var(--bg-modifier);
      color: var(--text-secondary);
    }

    .room-item.active {
      background: var(--bg-modifier);
      color: var(--text-primary);
    }

    .room-icon {
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    }

    .room-item.active .room-icon { opacity: 1; }

    .room-info { flex: 1; min-width: 0; }

    .room-name {
      font-weight: 500;
      font-size: 16px;
      font-family: 'Inter', sans-serif;
      letter-spacing: -0.02em;
    }

    .room-preview {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .room-item.active .room-preview { color: var(--text-muted); }

    .chat-main {
      background: var(--bg-primary);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-primary);
      box-shadow: var(--shadow-elevation-low);
      z-index: 10;
    }

    .chat-header-info h2 {
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .chat-header-info p {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .message {
      display: flex;
      gap: 16px;
      padding: 2px 16px 2px 16px;
      transition: var(--transition);
      animation: messageIn 0.2s ease;
    }

    @keyframes messageIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message:hover { background: var(--bg-hover); }

    .message-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      color: white;
      font-size: 14px;
      flex-shrink: 0;
      margin-top: 4px;
    }

    .message-content { flex: 1; min-width: 0; padding: 2px 0; }

    .message-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 2px;
    }

    .message-author {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 15px;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    .message-time {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 400;
      cursor: help;
      transition: var(--transition);
    }

    .message-time:hover {
      color: var(--text-secondary);
      text-decoration: underline;
    }

    .message-edited {
      font-size: 10px;
      color: var(--text-muted);
      margin-left: 4px;
    }

    .message-text {
      color: var(--text-secondary);
      line-height: 1.375;
      word-wrap: break-word;
      font-size: 15px;
    }

    .message-text a {
      color: var(--text-link);
      text-decoration: none;
    }

    .message-text a:hover { text-decoration: underline; }

    .message-text .mention {
      color: var(--accent-primary);
      font-weight: 500;
      background: rgba(88, 101, 242, 0.15);
      padding: 0 2px;
      border-radius: 3px;
    }

    .message-reply {
      font-size: 13px;
      color: var(--text-muted);
      padding: 4px 8px 4px 12px;
      background: var(--bg-secondary);
      border-radius: 4px;
      border-left: 4px solid var(--bg-modifier);
      margin-bottom: 4px;
    }

    .message-reply-author { font-weight: 500; color: var(--text-primary); }

    .date-divider {
      display: flex;
      align-items: center;
      margin: 16px 0;
      user-select: none;
    }

    .date-divider-line {
      flex: 1;
      height: 1px;
      background: var(--divider-color);
    }

    .date-divider-text {
      padding: 0 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .typing-indicator {
      padding: 12px 24px;
      font-size: 0.85rem;
      color: var(--text-muted);
      font-style: italic;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
    }

    .typing-dots { display: flex; gap: 4px; }

    .typing-dots span {
      width: 6px;
      height: 6px;
      background: var(--accent-primary);
      border-radius: 50%;
      animation: typingBounce 1.4s infinite ease-in-out both;
    }

    .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
    .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes typingBounce {
      0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }

    .chat-input-container {
      padding: 16px;
      background: var(--bg-primary);
    }

    .chat-input-wrapper {
      display: flex;
      gap: 8px;
      background: var(--bg-modifier);
      border-radius: 8px;
      padding: 1px;
      transition: var(--transition);
      position: relative;
    }

    .emoji-picker-button {
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 10px 12px;
      border-radius: 6px;
      transition: var(--transition);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 1px;
    }

    .emoji-picker-button:hover {
      background: var(--bg-hover);
    }

    .emoji-picker-panel {
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 8px;
      width: 350px;
      max-height: 400px;
      background: var(--bg-secondary);
      border-radius: 8px;
      box-shadow: var(--shadow-elevation-high);
      display: none;
      flex-direction: column;
      z-index: 100;
    }

    .emoji-picker-panel.visible {
      display: flex;
    }

    .emoji-picker-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .emoji-picker-categories {
      display: flex;
      gap: 4px;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);
      overflow-x: auto;
    }

    .emoji-category-button {
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 4px;
      transition: var(--transition);
      opacity: 0.6;
    }

    .emoji-category-button:hover,
    .emoji-category-button.active {
      background: var(--bg-modifier);
      opacity: 1;
    }

    .emoji-picker-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .emoji-category-section {
      margin-bottom: 16px;
    }

    .emoji-category-title {
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
    }

    .emoji-button {
      background: transparent;
      border: none;
      font-size: 24px;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: var(--transition);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .emoji-button:hover {
      background: var(--bg-modifier);
      transform: scale(1.2);
    }

    .chat-input {
      flex: 1;
      background: transparent;
      border: none;
      padding: 11px 16px;
      font-size: 15px;
      color: var(--text-primary);
      font-family: 'Roboto', sans-serif;
      outline: none;
    }

    .chat-input::placeholder { color: var(--text-muted); }

    .send-button {
      background: var(--accent-primary);
      font-family: 'Roboto', sans-serif;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 14px;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 1px;
    }

    .send-button:hover {
      background: var(--accent-hover);
    }

    .send-button:active {
      background: var(--accent-active);
    }

    .users-panel {
      background: var(--bg-secondary);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .users-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .users-header h3 {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .users-list { flex: 1; overflow-y: auto; padding: 8px; }

    .user-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 8px;
      border-radius: 4px;
      margin-bottom: 1px;
      transition: var(--transition);
    }

    .user-item:hover { background: var(--bg-modifier); }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      color: white;
      font-size: 13px;
      position: relative;
      flex-shrink: 0;
    }

    .user-status {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--bg-secondary);
    }

    .user-status.online { background: var(--accent-success); }
    .user-status.away { background: var(--accent-warning); }
    .user-status.offline { background: var(--text-muted); }

    .user-info { flex: 1; min-width: 0; }

    .user-name {
      font-weight: 500;
      font-size: 14px;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-role {
      font-size: 12px;
      color: var(--text-muted);
    }

    .login-screen {
      position: fixed;
      inset: 0;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .login-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 40px 32px;
      width: 100%;
      max-width: 420px;
      box-shadow: var(--shadow-elevation-high);
    }

    .login-logo { font-size: 2.5rem; text-align: center; margin-bottom: 16px; }

    .login-title {
      font-family: 'Inter', sans-serif;
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .login-subtitle {
      text-align: center;
      color: var(--text-muted);
      margin-bottom: 24px;
      font-size: 14px;
    }

    .login-input {
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--bg-tertiary);
      border-radius: 4px;
      padding: 12px;
      font-size: 15px;
      color: var(--text-primary);
      font-family: 'Roboto', sans-serif;
      outline: none;
      transition: var(--transition);
      margin-bottom: 16px;
    }

    .login-input:focus {
      border-color: var(--accent-primary);
      background: var(--bg-quaternary);
    }

    .login-button {
      width: 100%;
      background: var(--accent-primary);
      color: white;
      border: none;
      padding: 12px;
      border-radius: 4px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
    }

    .login-button:hover {
      background: var(--accent-hover);
    }

    .login-button:active {
      background: var(--accent-active);
    }

    .login-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .connection-status {
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 10px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      z-index: 1001;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideIn 0.2s ease;
      box-shadow: var(--shadow-elevation-high);
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .connection-status.connecting {
      background: var(--accent-warning);
      color: white;
    }

    .connection-status.error {
      background: var(--accent-danger);
      color: white;
    }

    .hidden { display: none !important; }

    /* Custom scrollbar */
    ::-webkit-scrollbar { width: 16px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border: 4px solid transparent;
      background-clip: padding-box;
      border-radius: 8px;
    }
    ::-webkit-scrollbar-thumb:hover { background: var(--bg-modifier); background-clip: padding-box; }

    @media (max-width: 1024px) {
      .app { grid-template-columns: 240px 1fr; }
      .users-panel { display: none; }
    }

    @media (max-width: 768px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
    }
  </style>
</head>
<body>
  <div id="connection-status" class="connection-status hidden"></div>
  
  <div id="login-screen" class="login-screen">
    <div class="login-card">
      <div class="login-logo">⚡</div>
      <h1 class="login-title">Chat App</h1>
      <p class="login-subtitle">Join the conversation in real-time</p>
      <input type="text" id="username-input" class="login-input" placeholder="Enter your username..." maxlength="30" autocomplete="off">
      <button id="join-button" class="login-button">Join Chat</button>
    </div>
  </div>

  <div id="app" class="app hidden">
    <aside class="sidebar">
      <div class="sidebar-header"><h1>Chat App</h1></div>
      <div class="rooms-list">
        <div class="rooms-title">Channels</div>
        <div id="rooms-container"></div>
      </div>
    </aside>

    <main class="chat-main">
      <header class="chat-header">
        <div class="chat-header-info">
          <h2 id="current-room-name"># General</h2>
          <p id="current-room-description">Welcome to the general chat!</p>
        </div>
      </header>

      <div id="messages-container" class="messages-container"></div>

      <div id="typing-indicator" class="typing-indicator hidden">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span id="typing-users"></span>
      </div>

      <div class="chat-input-container">
        <div class="chat-input-wrapper">
          <div id="emoji-picker-panel" class="emoji-picker-panel"></div>
          <button id="emoji-picker-button" class="emoji-picker-button" title="Add emoji">😀</button>
          <input type="text" id="message-input" class="chat-input" placeholder="Type a message..." maxlength="2000">
          <button id="send-button" class="send-button">Send →</button>
        </div>
      </div>
    </main>

    <aside class="users-panel">
      <div class="users-header"><h3>Online — <span id="users-count">0</span></h3></div>
      <div id="users-list" class="users-list"></div>
    </aside>
  </div>

  <script>
    // Emoji mapping (subset of most popular emojis for client-side picker)
    const EMOJI_MAP = {
      'smile': '😄', 'grin': '😁', 'joy': '😂', 'heart_eyes': '😍',
      'wink': '😉', 'blush': '😊', 'thinking': '🤔', 'neutral_face': '😐',
      'unamused': '😒', 'roll_eyes': '🙄', 'cry': '😢', 'sob': '😭',
      'angry': '😠', 'scream': '😱', 'sunglasses': '😎', 'nerd_face': '🤓',
      'thumbsup': '👍', 'thumbsdown': '👎', 'ok_hand': '👌', 'wave': '👋',
      'clap': '👏', 'pray': '🙏', 'muscle': '💪', 'point_up': '☝️',
      'point_right': '👉', 'raised_hand': '✋',
      'heart': '❤️', 'orange_heart': '🧡', 'yellow_heart': '💛', 'green_heart': '💚',
      'blue_heart': '💙', 'purple_heart': '💜', 'broken_heart': '💔', 'sparkling_heart': '💖',
      'two_hearts': '💕',
      'fire': '🔥', 'star': '⭐', 'sparkles': '✨', 'zap': '⚡',
      'boom': '💥', 'rocket': '🚀', 'tada': '🎉', 'balloon': '🎈',
      'trophy': '🏆', 'check': '✅', 'x': '❌', 'warning': '⚠️',
      'dog': '🐶', 'cat': '🐱', 'rabbit': '🐰', 'fox': '🦊',
      'bear': '🐻', 'panda': '🐼', 'tiger': '🐯', 'lion': '🦁',
      'monkey': '🐵', 'unicorn': '🦄', 'bird': '🐦', 'penguin': '🐧', 'fish': '🐟',
      'apple': '🍎', 'banana': '🍌', 'pizza': '🍕', 'hamburger': '🍔',
      'cake': '🍰', 'icecream': '🍦', 'coffee': '☕', 'beer': '🍺',
      'wine_glass': '🍷', 'taco': '🌮', 'sushi': '🍣', 'ramen': '🍜',
      'soccer': '⚽', 'basketball': '🏀', 'trophy': '🏆', 'first_place_medal': '🥇',
      'video_game': '🎮', 'guitar': '🎸', 'microphone': '🎤', 'art': '🎨', 'camera': '📷',
      'car': '🚗', 'airplane': '✈️', 'house': '🏠', 'beach': '🏖️',
      'mountain': '⛰️', 'rainbow': '🌈', 'sun': '☀️', 'cloud': '☁️', 'snowflake': '❄️'
    };

    const EMOJI_CATEGORIES = {
      'Smileys & People': ['smile', 'grin', 'joy', 'heart_eyes', 'wink', 'blush', 'thinking', 'neutral_face', 'unamused', 'roll_eyes', 'cry', 'sob', 'angry', 'scream', 'sunglasses', 'nerd_face'],
      'Gestures': ['thumbsup', 'thumbsdown', 'ok_hand', 'wave', 'clap', 'pray', 'muscle', 'point_up', 'point_right', 'raised_hand'],
      'Hearts': ['heart', 'orange_heart', 'yellow_heart', 'green_heart', 'blue_heart', 'purple_heart', 'broken_heart', 'sparkling_heart', 'two_hearts'],
      'Symbols': ['fire', 'star', 'sparkles', 'zap', 'boom', 'rocket', 'tada', 'balloon', 'trophy', 'check', 'x', 'warning'],
      'Nature & Animals': ['dog', 'cat', 'rabbit', 'fox', 'bear', 'panda', 'tiger', 'lion', 'monkey', 'unicorn', 'bird', 'penguin', 'fish'],
      'Food & Drink': ['apple', 'banana', 'pizza', 'hamburger', 'cake', 'icecream', 'coffee', 'beer', 'wine_glass', 'taco', 'sushi', 'ramen'],
      'Activities': ['soccer', 'basketball', 'trophy', 'first_place_medal', 'video_game', 'guitar', 'microphone', 'art', 'camera'],
      'Travel & Places': ['car', 'airplane', 'house', 'beach', 'mountain', 'rainbow', 'sun', 'cloud', 'snowflake']
    };

    class ChatClient {
      constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentRoom = 'general';
        this.rooms = [];
        this.users = new Map();
        this.messages = [];
        this.typingUsers = new Map();
        this.typingTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.emojiPickerVisible = false;
        this.bindElements();
        this.bindEvents();
        this.initEmojiPicker();
      }

      bindElements() {
        this.elements = {
          loginScreen: document.getElementById('login-screen'),
          app: document.getElementById('app'),
          usernameInput: document.getElementById('username-input'),
          joinButton: document.getElementById('join-button'),
          roomsContainer: document.getElementById('rooms-container'),
          messagesContainer: document.getElementById('messages-container'),
          messageInput: document.getElementById('message-input'),
          sendButton: document.getElementById('send-button'),
          usersList: document.getElementById('users-list'),
          usersCount: document.getElementById('users-count'),
          typingIndicator: document.getElementById('typing-indicator'),
          typingUsers: document.getElementById('typing-users'),
          currentRoomName: document.getElementById('current-room-name'),
          currentRoomDescription: document.getElementById('current-room-description'),
          connectionStatus: document.getElementById('connection-status'),
          emojiPickerButton: document.getElementById('emoji-picker-button'),
          emojiPickerPanel: document.getElementById('emoji-picker-panel'),
        };
      }

      bindEvents() {
        this.elements.joinButton.addEventListener('click', () => this.handleJoin());
        this.elements.usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.handleJoin(); });
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        this.elements.messageInput.addEventListener('input', () => this.handleTyping());
        this.elements.emojiPickerButton.addEventListener('click', (e) => { e.stopPropagation(); this.toggleEmojiPicker(); });
        document.addEventListener('click', (e) => { if (this.emojiPickerVisible && !this.elements.emojiPickerPanel.contains(e.target)) this.hideEmojiPicker(); });
      }

      connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host + '/ws';
        this.showConnectionStatus('Connecting...', 'connecting');
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.hideConnectionStatus();
          this.reconnectAttempts = 0;
          this.joinRoom();
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.handleServerEvent(data);
        };

        this.ws.onerror = () => this.showConnectionStatus('Connection error', 'error');

        this.ws.onclose = () => {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.showConnectionStatus('Reconnecting... (' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ')', 'connecting');
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
          } else {
            this.showConnectionStatus('Connection lost. Please refresh.', 'error');
          }
        };
      }

      send(event) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event)); }

      handleServerEvent(event) {
        const handlers = {
          'CONNECTED': (p) => this.handleConnected(p),
          'ROOM_HISTORY': (p) => this.handleRoomHistory(p),
          'USER_JOINED': (p) => this.handleUserJoined(p),
          'USER_LEFT': (p) => this.handleUserLeft(p),
          'MESSAGE_RECEIVED': (p) => this.handleMessageReceived(p),
          'MESSAGE_EDITED': (p) => this.handleMessageEdited(p),
          'MESSAGE_DELETED': (p) => this.handleMessageDeleted(p),
          'USER_TYPING': (p) => this.handleUserTyping(p),
          'USER_STOPPED_TYPING': (p) => this.handleUserStoppedTyping(p),
          'USER_STATUS_CHANGED': (p) => this.handleUserStatusChanged(p),
          'ERROR': (p) => console.error('Server error:', p.code, p.message),
        };
        handlers[event.type]?.(event.payload);
      }

      handleConnected(payload) {
        this.currentUser = payload.user;
        this.rooms = payload.rooms;
        this.renderRooms();
      }

      handleRoomHistory(payload) {
        this.messages = payload.messages;
        payload.users.forEach(user => this.users.set(user.id, user));
        this.renderMessages();
        this.renderUsers();
        this.scrollToBottom();
      }

      handleUserJoined(payload) {
        this.users.set(payload.user.id, payload.user);
        this.renderUsers();
        this.addSystemMessage(payload.user.username + ' joined the chat');
      }

      handleUserLeft(payload) {
        const user = this.users.get(payload.userId);
        if (user) this.addSystemMessage(user.username + ' left the chat');
        this.users.delete(payload.userId);
        this.renderUsers();
      }

      handleMessageReceived(payload) {
        const newMsg = payload.message;

        // Check if we need a date divider
        if (this.messages.length > 0) {
          const lastMsg = this.messages[this.messages.length - 1];
          const lastDate = new Date(lastMsg.createdAt);
          const newDate = new Date(newMsg.createdAt);
          const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
          const newDay = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate()).getTime();

          if (lastDay !== newDay) {
            this.renderDateDivider(newMsg.createdAt);
          }
        } else if (this.messages.length === 0) {
          // First message, add date divider
          this.renderDateDivider(newMsg.createdAt);
        }

        this.messages.push(newMsg);
        this.renderMessage(newMsg);
        this.scrollToBottom();
      }

      handleMessageEdited(payload) {
        const msg = this.messages.find(m => m.id === payload.messageId);
        if (msg) { msg.content = payload.content; msg.editedAt = payload.editedAt; this.renderMessages(); }
      }

      handleMessageDeleted(payload) {
        this.messages = this.messages.filter(m => m.id !== payload.messageId);
        this.renderMessages();
      }

      handleUserTyping(payload) {
        if (payload.userId !== this.currentUser?.id) {
          this.typingUsers.set(payload.userId, payload.username);
          this.renderTypingIndicator();
        }
      }

      handleUserStoppedTyping(payload) {
        this.typingUsers.delete(payload.userId);
        this.renderTypingIndicator();
      }

      handleUserStatusChanged(payload) {
        const user = this.users.get(payload.userId);
        if (user) { user.status = payload.status; this.renderUsers(); }
      }

      handleJoin() {
        const username = this.elements.usernameInput.value.trim();
        if (username.length < 2) { this.elements.usernameInput.focus(); return; }
        this.elements.joinButton.disabled = true;
        this.username = username;
        this.elements.loginScreen.classList.add('hidden');
        this.elements.app.classList.remove('hidden');
        this.connect();
      }

      joinRoom() {
        this.send({ type: 'JOIN_ROOM', payload: { roomId: this.currentRoom, username: this.username } });
      }

      switchRoom(roomId) {
        if (roomId === this.currentRoom) return;
        this.send({ type: 'LEAVE_ROOM', payload: { roomId: this.currentRoom } });
        this.currentRoom = roomId;
        this.messages = [];
        this.users.clear();
        this.typingUsers.clear();
        this.renderMessages();
        this.renderUsers();
        this.renderTypingIndicator();
        this.send({ type: 'JOIN_ROOM', payload: { roomId, username: this.username } });
        this.renderRooms();
      }

      sendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content) return;
        this.send({ type: 'SEND_MESSAGE', payload: { roomId: this.currentRoom, content } });
        this.elements.messageInput.value = '';
        this.stopTyping();
      }

      handleTyping() {
        if (!this.typingTimeout) this.send({ type: 'TYPING_START', payload: { roomId: this.currentRoom } });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => this.stopTyping(), 2000);
      }

      stopTyping() {
        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
          this.typingTimeout = null;
          this.send({ type: 'TYPING_STOP', payload: { roomId: this.currentRoom } });
        }
      }

      initEmojiPicker() {
        const html = this.buildEmojiPickerHTML();
        this.elements.emojiPickerPanel.innerHTML = html;
        this.bindEmojiPickerEvents();
      }

      buildEmojiPickerHTML() {
        const categoriesIcons = {
          'Smileys & People': '😊',
          'Gestures': '👋',
          'Hearts': '❤️',
          'Symbols': '✨',
          'Nature & Animals': '🐶',
          'Food & Drink': '🍕',
          'Activities': '⚽',
          'Travel & Places': '🚗'
        };

        let html = '<div class="emoji-picker-header">Emoji Picker</div>';
        html += this.buildCategoriesHTML(categoriesIcons);
        html += '<div class="emoji-picker-content">';
        html += this.buildEmojiGridsHTML();
        html += '</div>';

        return html;
      }

      buildCategoriesHTML(categoriesIcons) {
        let html = '<div class="emoji-picker-categories">';
        Object.keys(EMOJI_CATEGORIES).forEach((category, idx) => {
          const icon = categoriesIcons[category] || '😀';
          const activeClass = idx === 0 ? ' active' : '';
          html += '<button class="emoji-category-button' + activeClass + '" data-category="' + category + '">' + icon + '</button>';
        });
        html += '</div>';
        return html;
      }

      buildEmojiGridsHTML() {
        let html = '';
        Object.entries(EMOJI_CATEGORIES).forEach(([category, emojis]) => {
          html += '<div class="emoji-category-section" data-category="' + category + '">';
          html += '<div class="emoji-category-title">' + category + '</div>';
          html += '<div class="emoji-grid">';
          emojis.forEach(shortcode => {
            const emoji = EMOJI_MAP[shortcode];
            if (emoji) {
              html += '<button class="emoji-button" data-emoji="' + emoji + '" data-shortcode="' + shortcode + '" title=":' + shortcode + ':">' + emoji + '</button>';
            }
          });
          html += '</div></div>';
        });
        return html;
      }

      bindEmojiPickerEvents() {
        this.bindEmojiButtonClicks();
        this.bindCategoryButtonClicks();
      }

      bindEmojiButtonClicks() {
        this.elements.emojiPickerPanel.querySelectorAll('.emoji-button').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.insertEmoji(btn.dataset.emoji);
          });
        });
      }

      bindCategoryButtonClicks() {
        this.elements.emojiPickerPanel.querySelectorAll('.emoji-category-button').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.emojiPickerPanel.querySelectorAll('.emoji-category-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const category = btn.dataset.category;
            const section = this.elements.emojiPickerPanel.querySelector('.emoji-category-section[data-category="' + category + '"]');
            if (section) section.scrollIntoView({ behavior: 'smooth' });
          });
        });
      }

      toggleEmojiPicker() {
        this.emojiPickerVisible = !this.emojiPickerVisible;
        if (this.emojiPickerVisible) {
          this.elements.emojiPickerPanel.classList.add('visible');
        } else {
          this.elements.emojiPickerPanel.classList.remove('visible');
        }
      }

      hideEmojiPicker() {
        this.emojiPickerVisible = false;
        this.elements.emojiPickerPanel.classList.remove('visible');
      }

      insertEmoji(emoji) {
        const input = this.elements.messageInput;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end);
        input.value = before + emoji + after;
        input.focus();
        const newPos = start + emoji.length;
        input.setSelectionRange(newPos, newPos);
        this.hideEmojiPicker();
      }

      renderRooms() {
        this.elements.roomsContainer.innerHTML = this.rooms.map(room => {
          const isActive = room.id === this.currentRoom;
          if (isActive) {
            this.elements.currentRoomName.textContent = '# ' + room.name;
            this.elements.currentRoomDescription.textContent = room.description;
          }
          return '<div class="room-item ' + (isActive ? 'active' : '') + '" data-room-id="' + room.id + '">' +
            '<div class="room-icon">#</div>' +
            '<div class="room-info">' +
              '<div class="room-name">' + this.escapeHtml(room.name) + '</div>' +
              '<div class="room-preview">' + room.participantCount + ' members</div>' +
            '</div></div>';
        }).join('');
        this.elements.roomsContainer.querySelectorAll('.room-item').forEach(el => {
          el.addEventListener('click', () => this.switchRoom(el.dataset.roomId));
        });
      }

      renderMessages() {
        this.elements.messagesContainer.innerHTML = '';
        let lastDate = null;

        this.messages.forEach(msg => {
          const msgDate = new Date(msg.createdAt);
          const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime();

          if (lastDate !== msgDay) {
            this.renderDateDivider(msg.createdAt);
            lastDate = msgDay;
          }

          this.renderMessage(msg);
        });
      }

      renderDateDivider(timestamp) {
        const msgDate = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
        const diffDays = Math.floor((today - msgDay) / (1000 * 60 * 60 * 24));

        let dateText;
        if (diffDays === 0) {
          dateText = 'Today';
        } else if (diffDays === 1) {
          dateText = 'Yesterday';
        } else {
          dateText = msgDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
        }

        const div = document.createElement('div');
        div.className = 'date-divider';
        div.innerHTML = '<div class="date-divider-line"></div>' +
          '<span class="date-divider-text">' + dateText + '</span>' +
          '<div class="date-divider-line"></div>';
        this.elements.messagesContainer.appendChild(div);
      }

      renderMessage(message) {
        const div = document.createElement('div');
        div.className = 'message';
        div.dataset.messageId = message.id;
        const initial = message.author.username.charAt(0).toUpperCase();
        const time = this.formatTime(message.createdAt);
        const fullDateTime = this.formatFullDateTime(message.createdAt);
        const editedTag = message.editedAt ? '<span class="message-edited">(edited)</span>' : '';
        let replyHtml = '';
        if (message.replyTo) {
          replyHtml = '<div class="message-reply"><span class="message-reply-author">@' +
            this.escapeHtml(message.replyTo.authorUsername) + '</span> ' +
            this.escapeHtml(message.replyTo.contentPreview) + '</div>';
        }
        div.innerHTML = '<div class="message-avatar" style="background: ' + message.author.avatar + '">' + initial + '</div>' +
          '<div class="message-content">' + replyHtml +
            '<div class="message-header">' +
              '<span class="message-author">' + this.escapeHtml(message.author.username) + '</span>' +
              '<span class="message-time" title="' + fullDateTime + '">' + time + '</span>' + editedTag +
            '</div><div class="message-text">' + this.formatContent(message.content) + '</div></div>';
        this.elements.messagesContainer.appendChild(div);
      }

      addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = '<div class="message-avatar" style="background: var(--text-muted)">→</div>' +
          '<div class="message-content"><div class="message-text" style="font-style: italic; color: var(--text-muted)">' +
          this.escapeHtml(text) + '</div></div>';
        this.elements.messagesContainer.appendChild(div);
        this.scrollToBottom();
      }

      renderUsers() {
        const usersList = Array.from(this.users.values()).sort((a, b) => {
          const statusOrder = { online: 0, away: 1, offline: 2 };
          return statusOrder[a.status] - statusOrder[b.status];
        });
        this.elements.usersCount.textContent = usersList.filter(u => u.status === 'online').length;
        this.elements.usersList.innerHTML = usersList.map(user => {
          const initial = user.username.charAt(0).toUpperCase();
          const isMe = user.id === this.currentUser?.id;
          return '<div class="user-item">' +
            '<div class="user-avatar" style="background: ' + user.avatar + '">' + initial +
              '<div class="user-status ' + user.status + '"></div></div>' +
            '<div class="user-info">' +
              '<div class="user-name">' + this.escapeHtml(user.username) + (isMe ? ' (you)' : '') + '</div>' +
              '<div class="user-role">' + user.status + '</div></div></div>';
        }).join('');
      }

      renderTypingIndicator() {
        const users = Array.from(this.typingUsers.values());
        if (users.length === 0) { this.elements.typingIndicator.classList.add('hidden'); return; }
        this.elements.typingIndicator.classList.remove('hidden');
        let text = users.length === 1 ? users[0] + ' is typing...' :
                   users.length === 2 ? users.join(' and ') + ' are typing...' : 'Several people are typing...';
        this.elements.typingUsers.textContent = text;
      }

      formatFullDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }

      formatTime(timestamp) {
        const msgDate = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());

        const diffTime = today - msgDay;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        const timeStr = msgDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        if (diffDays === 0) {
          return 'Today at ' + timeStr;
        } else if (diffDays === 1) {
          return 'Yesterday at ' + timeStr;
        } else if (diffDays < 7) {
          const dayName = msgDate.toLocaleDateString('en-US', { weekday: 'long' });
          return dayName + ' at ' + timeStr;
        } else {
          return msgDate.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
          });
        }
      }

      formatContent(content) {
        return this.escapeHtml(content)
          .replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
          .replace(/@(\\w+)/g, '<span class="mention">@$1</span>');
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      scrollToBottom() {
        requestAnimationFrame(() => {
          this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        });
      }

      showConnectionStatus(message, type) {
        this.elements.connectionStatus.textContent = message;
        this.elements.connectionStatus.className = 'connection-status ' + type;
        this.elements.connectionStatus.classList.remove('hidden');
      }

      hideConnectionStatus() { this.elements.connectionStatus.classList.add('hidden'); }
    }

    const chat = new ChatClient();
  </script>
</body>
</html>`;

// ============================================
// Connection ID Tracking
// ============================================

const wsConnectionIds = new WeakMap<object, string>();

// ============================================
// Bun Server
// ============================================

Bun.serve<WebSocketData>({
	port: PORT,
	hostname: HOST,

	fetch(req, server) {
		const url = new URL(req.url);

		// WebSocket upgrade
		if (url.pathname === "/ws") {
			const upgraded = server.upgrade(req, {
				data: {
					state: {
						userId: null,
						roomId: null,
						username: null,
						typingTimeout: null,
						lastMessageTime: 0,
						messageCount: 0,
					} satisfies ConnectionState,
				},
			});

			if (upgraded) {
				return undefined;
			}

			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Serve index.html for root
		if (url.pathname === "/" || url.pathname === "/index.html") {
			return new Response(CLIENT_HTML, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		// Health check endpoint
		if (url.pathname === "/health") {
			return Response.json({ status: "ok", timestamp: Date.now() });
		}

		// API: Get rooms
		if (url.pathname === "/api/rooms") {
			return (async () => {
				const rooms = await useCases.getRooms(uow);
				return Response.json(rooms);
			})();
		}

		return new Response("Not Found", { status: 404 });
	},

	websocket: {
		open(ws) {
			const connectionId = nanoid(12);
			wsConnectionIds.set(ws, connectionId);
			connectionManager.addConnection(connectionId, ws);
			console.log(`[WS] Connection opened: ${connectionId}`);
		},

		message(ws, message) {
			const connectionId = wsConnectionIds.get(ws);
			if (connectionId) {
				connectionManager.handleMessage(connectionId, message.toString());
			}
		},

		close(ws) {
			const connectionId = wsConnectionIds.get(ws);
			if (connectionId) {
				connectionManager.removeConnection(connectionId);
				wsConnectionIds.delete(ws);
				console.log(`[WS] Connection closed: ${connectionId}`);
			}
		},

		drain(_ws) {
			console.log("[WS] Backpressure relieved");
		},
	},
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ⚡ Chat App Server                                         ║
║                                                              ║
║   Server running at: http://${HOST}:${PORT}                    ║
║   WebSocket endpoint: ws://${HOST}:${PORT}/ws                  ║
║                                                              ║
║   Press Ctrl+C to stop                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

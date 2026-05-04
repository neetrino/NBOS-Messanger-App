import {
  CHAT_TYPING_EMIT_MIN_INTERVAL_MS,
  CHAT_TYPING_LOCAL_STOP_DEBOUNCE_MS,
} from "./chat-typing";

/**
 * Throttles outgoing typing:true while the draft is non-empty and debounces typing:false when empty.
 * Not React-specific — instantiate per active conversation/socket emit callback.
 */
export class OutgoingTypingController {
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopDebounce: ReturnType<typeof setTimeout> | null = null;
  private wasEmpty = true;
  private lastEmitAt = 0;
  private lastEmittedTyping: boolean | null = null;

  constructor(private readonly emit: (isTyping: boolean) => void) {}

  syncDraft(draft: string): void {
    const has = draft.trim().length > 0;
    if (!has) {
      this.clearHeartbeat();
      if (this.stopDebounce) {
        clearTimeout(this.stopDebounce);
      }
      this.stopDebounce = setTimeout(() => {
        this.emitToWire(false, true);
        this.stopDebounce = null;
      }, CHAT_TYPING_LOCAL_STOP_DEBOUNCE_MS);
      this.wasEmpty = true;
      return;
    }

    if (this.stopDebounce) {
      clearTimeout(this.stopDebounce);
      this.stopDebounce = null;
    }

    const started = this.wasEmpty;
    this.wasEmpty = false;
    if (started) {
      this.emitToWire(true, true);
    }
    this.ensureHeartbeat();
  }

  /** Send, blur, leave conversation, switch chat, unmount */
  flushFalse(): void {
    this.clearHeartbeat();
    if (this.stopDebounce) {
      clearTimeout(this.stopDebounce);
      this.stopDebounce = null;
    }
    this.wasEmpty = true;
    this.emitToWire(false, true);
  }

  dispose(): void {
    this.flushFalse();
  }

  private emitToWire(isTyping: boolean, force: boolean): void {
    const now = Date.now();
    if (
      !force &&
      isTyping &&
      this.lastEmittedTyping === true &&
      now - this.lastEmitAt < CHAT_TYPING_EMIT_MIN_INTERVAL_MS
    ) {
      return;
    }
    if (!force && !isTyping && this.lastEmittedTyping === false) {
      return;
    }
    this.emit(isTyping);
    this.lastEmitAt = now;
    this.lastEmittedTyping = isTyping;
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) {
      return;
    }
    this.heartbeat = setInterval(() => {
      this.emitToWire(true, false);
    }, CHAT_TYPING_EMIT_MIN_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}

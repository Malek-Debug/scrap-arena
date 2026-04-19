type EventCallback = (...args: unknown[]) => void;

interface ListenerEntry {
  callback: EventCallback;
  context: unknown;
  once: boolean;
}

/**
 * Global decoupled event bus — singleton.
 * All inter-system communication routes through here.
 * Supports typed events, one-shot listeners, and context binding.
 */
export class SystemsBus {
  private static _instance: SystemsBus;
  private listeners: Map<string, ListenerEntry[]> = new Map();

  private constructor() {}

  static get instance(): SystemsBus {
    return (this._instance ??= new SystemsBus());
  }

  on(event: string, callback: EventCallback, context?: unknown): this {
    this.addListener(event, callback, context, false);
    return this;
  }

  once(event: string, callback: EventCallback, context?: unknown): this {
    this.addListener(event, callback, context, true);
    return this;
  }

  off(event: string, callback: EventCallback, context?: unknown): this {
    const list = this.listeners.get(event);
    if (!list) return this;

    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].callback === callback && list[i].context === context) {
        list.splice(i, 1);
      }
    }
    if (list.length === 0) this.listeners.delete(event);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    const list = this.listeners.get(event);
    if (!list) return this;

    // Iterate with index guard — avoids list.slice() allocation.
    // Listeners that self-remove via `once` are deleted in-place;
    // we walk backward to keep indices stable.
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (entry.once) {
        list.splice(i, 1);
        if (list.length === 0) this.listeners.delete(event);
      }
      entry.callback.apply(entry.context, args);
    }
    return this;
  }

  removeAll(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  private addListener(event: string, callback: EventCallback, context: unknown, once: boolean): void {
    let list = this.listeners.get(event);
    if (!list) {
      list = [];
      this.listeners.set(event, list);
    }
    list.push({ callback, context, once });
  }
}

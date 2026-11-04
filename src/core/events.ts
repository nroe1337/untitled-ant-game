type Handler = (payload?: any) => void;

/** Tiny pub/sub so systems can react to each other without imports. */
export class EventBus {
  private handlers = new Map<string, Handler[]>();
  on(name: string, fn: Handler) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name)!.push(fn);
  }
  emit(name: string, payload?: any) {
    this.handlers.get(name)?.forEach((fn) => fn(payload));
  }
}

/** A small observable value holder that React reads with `useSyncExternalStore`. */
export class Store<T> {
  private listeners = new Set<() => void>();

  constructor(private state: T) {}

  /** The current value. The same object is returned until something changes. */
  getState = (): T => this.state;

  /** Replaces the value and tells every subscriber. */
  setState(next: T): void {
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((listener) => listener());
    }
  }

  /** Registers a listener and returns the function that removes it. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

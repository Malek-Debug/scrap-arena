type Factory<T> = () => T;
type Resetter<T> = (obj: T) => void;

/**
 * Generic object pool — zero-GC allocation after warm-up.
 * Provide a factory to construct and a resetter to recycle.
 * Auto-grows when exhausted (configurable cap).
 */
export class ObjectPool<T> {
  private pool: T[];
  private readonly objects: T[] = [];
  private activeCount = 0;
  private readonly factory: Factory<T>;
  private readonly reset: Resetter<T>;
  private readonly maxSize: number;

  constructor(factory: Factory<T>, reset: Resetter<T>, initialSize: number, maxSize = 4096) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    this.pool = new Array<T>(initialSize);
    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      this.pool[i] = obj;
      this.objects.push(obj);
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      this.activeCount++;
      return this.pool.pop()!;
    }
    if (this.activeCount < this.maxSize) {
      this.activeCount++;
      const obj = this.factory();
      this.objects.push(obj);
      return obj;
    }
    throw new Error(`ObjectPool exhausted: ${this.activeCount}/${this.maxSize} active`);
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
    this.activeCount--;
  }

  /** Bulk release — avoids per-item function call overhead in hot paths */
  releaseAll(items: T[]): void {
    for (let i = 0; i < items.length; i++) {
      this.reset(items[i]);
      this.pool.push(items[i]);
    }
    this.activeCount -= items.length;
  }

  get available(): number {
    return this.pool.length;
  }

  get active(): number {
    return this.activeCount;
  }

  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const obj = this.factory();
      this.pool.push(obj);
      this.objects.push(obj);
    }
  }

  dispose(disposer?: (obj: T) => void): void {
    if (disposer) {
      for (const obj of this.objects) {
        disposer(obj);
      }
    }
    this.pool.length = 0;
    this.objects.length = 0;
    this.activeCount = 0;
  }
}

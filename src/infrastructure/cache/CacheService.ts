import { ICache } from '../../domain/interfaces/ICache';

/**
 * Cache service implementation
 * Provides a centralized in-memory cache using Map
 */
export class CacheService<T> implements ICache<T> {
    private cache: Map<string, T> = new Map();

    /**
     * Get a value from cache by key
     */
    get(key: string): T | undefined {
        return this.cache.get(key);
    }

    /**
     * Set a value in cache with a key
     */
    set(key: string, value: T): void {
        this.cache.set(key, value);
    }

    /**
     * Check if a key exists in cache
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete a value from cache by key
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all entries from cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get all keys in cache
     */
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Get all values in cache
     */
    values(): T[] {
        return Array.from(this.cache.values());
    }

    /**
     * Get the size of the cache
     */
    size(): number {
        return this.cache.size;
    }
}


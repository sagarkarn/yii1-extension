/**
 * Cache service interface
 * Provides a centralized caching mechanism for the application
 */
export interface ICache<T> {
    /**
     * Get a value from cache by key
     */
    get(key: string): T | undefined;

    /**
     * Set a value in cache with a key
     */
    set(key: string, value: T): void;

    /**
     * Check if a key exists in cache
     */
    has(key: string): boolean;

    /**
     * Delete a value from cache by key
     */
    delete(key: string): void;

    /**
     * Clear all entries from cache
     */
    clear(): void;

    /**
     * Get all keys in cache
     */
    keys(): string[];

    /**
     * Get all values in cache
     */
    values(): T[];
}


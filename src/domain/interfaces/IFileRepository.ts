/**
 * File system repository interface
 * Abstracts file system operations for testability and flexibility
 */
export interface IFileRepository {
    /**
     * Check if a file or directory exists
     */
    exists(path: string): Promise<boolean>;

    /**
     * Check if a file or directory exists (synchronous)
     */
    existsSync(path: string): boolean;

    /**
     * Read file contents as string
     */
    readFile(path: string): Promise<string>;

    /**
     * Find files matching a pattern
     */
    findFiles(pattern: string, basePath?: string): Promise<string[]>;

    /**
     * Get file stats
     */
    getStats(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number }>;
}


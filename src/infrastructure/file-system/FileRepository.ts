import * as fs from 'fs';
import * as path from 'path';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';

/**
 * File system repository implementation
 * Concrete implementation using Node.js fs module
 */
export class FileRepository implements IFileRepository {
    async exists(filePath: string): Promise<boolean> {
        return fs.existsSync(filePath);
    }

    existsSync(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    async readFile(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    async findFiles(pattern: string, basePath?: string): Promise<string[]> {
        // Simple implementation - can be enhanced with glob patterns
        // For now, return empty array - can be implemented with glob library if needed
        return Promise.resolve([]);
    }

    async getStats(filePath: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number }> {
        return new Promise((resolve, reject) => {
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        isFile: stats.isFile(),
                        isDirectory: stats.isDirectory(),
                        size: stats.size
                    });
                }
            });
        });
    }
}


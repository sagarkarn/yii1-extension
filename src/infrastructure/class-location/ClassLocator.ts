import * as fs from 'fs';
import * as path from 'path';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';
import { ICache } from '../../domain/interfaces/ICache';
import { Class } from '../../domain/entities/Calss';
import { CacheService } from '../cache/CacheService';
import { METHOD_PATTERN_REGEX, PROPERTY_PATTERN_REGEX } from '../constant/RegexConst';

/**
 * Class locator service
 * Finds and caches all classes in a given directory path
 */
export class ClassLocator {
    private directoryFilePathsCache: ICache<string[]>; // Cache for directory file paths
    private behaviorClassesCache: ICache<Class[]>; // Cache for behavior classes
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly classCache: ICache<Class>,
        directoryFilePathsCache?: ICache<string[]>,
        behaviorClassesCache?: ICache<Class[]>
    ) {
        // Use provided cache or create a simple one for directory file paths
        this.directoryFilePathsCache = directoryFilePathsCache || new CacheService<string[]>();
        this.behaviorClassesCache = behaviorClassesCache || new CacheService<Class[]>();
    }

    /**
     * Get all nested classes for a given path
     * Recursively searches for PHP files and extracts class information
     * Results are cached by directory path
     */
    getAllClasses(dirPath: string): Class[] {
        const cacheKey = `classes:${dirPath}`;
        
        // Check if we have cached file paths for this directory
        const cachedFilePaths = this.directoryFilePathsCache.get(cacheKey);
        if (cachedFilePaths !== undefined) {
            // Reconstruct classes from cached file paths
            return this.getClassesFromFilePaths(cachedFilePaths);
        }

        const classes: Class[] = [];
        const filePaths: string[] = [];
        
        if (!this.fileRepository.existsSync(dirPath)) {
            return classes;
        }

        try {
            this.readClassesRecursive(dirPath, dirPath, classes, filePaths);
            
            // Cache file paths for this directory
            this.directoryFilePathsCache.set(cacheKey, filePaths);
        } catch (error) {
            // Ignore errors
        }

        return classes;
    }

    getAllBehaviorClasses(dirPath: string): Class[] {
        const cacheKey = `behavior-classes:${dirPath}`;
        const cached = this.behaviorClassesCache.get(cacheKey);
        if (cached !== undefined && cached.length > 0) {
            return cached;
        }

        const classes = this.getAllClasses(dirPath);
        const behaviorClasses = classes.filter(classEntity => classEntity.parentClass === 'CActiveRecordBehavior');
        this.behaviorClassesCache.set(cacheKey, behaviorClasses);
        return behaviorClasses;
    }

    /**
     * Get classes from file paths (using individual class cache)
     */
    private getClassesFromFilePaths(filePaths: string[]): Class[] {
        const classes: Class[] = [];
        
        for (const filePath of filePaths) {
            const cachedClass = this.classCache.get(filePath);
            if (cachedClass) {
                classes.push(cachedClass);
            } else {
                // If not cached, read and extract
                try {
                    if (this.fileRepository.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const classEntity = this.extractClass(content, filePath);
                        if (classEntity) {
                            classes.push(classEntity);
                        }
                    }
                } catch (error) {
                    // Ignore errors
                }
            }
        }
        
        return classes;
    }

    /**
     * Recursively read classes from directory and subdirectories
     */
    private readClassesRecursive(baseDir: string, currentDir: string, classes: Class[], filePaths: string[]): void {
        try {
            const items = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item.name);
                
                if (item.isDirectory()) {
                    // Recursively search subdirectories
                    this.readClassesRecursive(baseDir, fullPath, classes, filePaths);
                } else if (item.isFile() && item.name.endsWith('.php')) {
                    filePaths.push(fullPath);
                    
                    // Check if class is already cached
                    const cachedClass = this.classCache.get(fullPath);
                    if (cachedClass) {
                        classes.push(cachedClass);
                    } else {
                        // Read PHP file and extract class
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            const classEntity = this.extractClass(content, fullPath);
                            
                            if (classEntity) {
                                classes.push(classEntity);
                            }
                        } catch (error) {
                            // Ignore file read errors
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore directory read errors
        }
    }

    /**
     * Extract class information from PHP file content
     * Creates a Class entity and caches it by file path
     */
    private extractClass(content: string, filePath: string): Class | null {
        // Pattern to match: class ClassName extends ParentClass
        // Also matches: abstract class ClassName extends ParentClass
        const classPattern = /(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+[^{]+)?\s*\{/;
        const match = content.match(classPattern);

        if (!match) {
            return null;
        }

        const className = match[1];
        const parentClass = match[2] || null;
        const isAbstract = content.substring(0, match.index!).includes('abstract');

        // Extract methods (simple pattern matching)
        const methods: string[] = [];
        let methodMatch;
        while ((methodMatch = METHOD_PATTERN_REGEX.exec(content)) !== null) {
            methods.push(methodMatch[1]);
        }

        // Extract properties (simple pattern matching)
        const properties: string[] = [];
        let propertyMatch;
        while ((propertyMatch = PROPERTY_PATTERN_REGEX.exec(content)) !== null) {
            properties.push(propertyMatch[1]);
        }

        const classEntity = Class.fromRaw({
            name: className,
            parentClass: parentClass,
            filePath: filePath,
            isAbstract: isAbstract,
            methods: methods,
            properties: properties
        });

        // Cache individual class by file path
        this.classCache.set(filePath, classEntity);

        return classEntity;
    }

    /**
     * Invalidate cache for a directory
     */
    invalidateCache(dirPath: string): void {
        const cacheKey = `classes:${dirPath}`;
        this.directoryFilePathsCache.delete(cacheKey);
        
        // Also invalidate all individual class caches in this directory
        if (this.fileRepository.existsSync(dirPath)) {
            this.invalidateDirectoryCache(dirPath);
        }
    }

    /**
     * Recursively invalidate class caches in a directory
     */
    private invalidateDirectoryCache(dirPath: string): void {
        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                
                if (item.isDirectory()) {
                    this.invalidateDirectoryCache(fullPath);
                } else if (item.isFile() && item.name.endsWith('.php')) {
                    this.classCache.delete(fullPath);
                }
            }
        } catch (error) {
            // Ignore errors
        }
    }

    convertToDotNotation(classPath: string, workspaceRoot: string): string {
        const relativePath = path.relative(path.join(workspaceRoot, "protected"), classPath);
        const pathWithoutExt = relativePath.replace(/\.php$/, '');
        const parts = pathWithoutExt.split(path.sep);
        return 'application.' + parts.join('.');
    }
}


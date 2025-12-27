import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from '../domain/interfaces/IYiiProjectDetector';
import { ICache } from '../domain/interfaces/ICache';
import { MainConfigParser } from '../infrastructure/config/MainConfigParser';
import { ClassLocator } from '../infrastructure/class-location/ClassLocator';
import { Class } from '../domain/entities/Calss';

/**
 * Diagnostics provider for behavior classes in behaviors() method
 * Checks if behavior class files exist
 */
export class BehaviorDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private mainConfigParser: MainConfigParser;
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly projectDetector: IYiiProjectDetector,
        private readonly behaviorCache: ICache<string[]>,
        private readonly classLocator: ClassLocator,
        private readonly classCache: ICache<Class>
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-behaviors');
        this.mainConfigParser = new MainConfigParser(fileRepository);
        this.setupFileWatcher();
    }

    public getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    /**
     * Update diagnostics for a document
     */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        if (document.languageId !== 'php') {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        if (!this.projectDetector.isYiiProjectSync(workspaceFolder.uri.fsPath)) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        const behaviorDiagnostics = await this.checkBehaviors(document, workspaceFolder.uri.fsPath);
        diagnostics.push(...behaviorDiagnostics);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Check behaviors() method for missing behavior files
     */
    private async checkBehaviors(
        document: vscode.TextDocument,
        workspaceRoot: string
    ): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Find behaviors() method
        const behaviorsPattern = /(?:public\s+)?function\s+behaviors\s*\([^)]*\)\s*\{/i;
        const methodMatch = behaviorsPattern.exec(text);
        
        if (!methodMatch) {
            return diagnostics;
        }

        // Find all 'class' => 'BehaviorClass' patterns
        const classPattern = /['"]class['"]\s*=>\s*['"]([^'"]+)['"]/g;
        let match;

        while ((match = classPattern.exec(text)) !== null) {
            const classPath = match[1];
            const matchStart = match.index + match[0].indexOf(classPath);
            const matchEnd = matchStart + classPath.length;

            // Calculate line and character positions
            const lineStart = text.substring(0, matchStart).split('\n').length - 1;
            const lineEnd = text.substring(0, matchEnd).split('\n').length - 1;
            const lineObj = document.lineAt(lineStart);
            const charStart = matchStart - (text.substring(0, matchStart).lastIndexOf('\n') + 1);
            const charEnd = matchEnd - (text.substring(0, matchEnd).lastIndexOf('\n') + 1);

            const range = new vscode.Range(
                new vscode.Position(lineStart, charStart),
                new vscode.Position(lineEnd, charEnd)
            );

            // Resolve behavior path
            const behaviorPath = this.resolveBehaviorPath(classPath, workspaceRoot);

            if (behaviorPath == null) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Behavior class file does not exist: ${classPath}`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'behavior-file-missing';
                diagnostic.source = 'yii1-behaviors';
                diagnostics.push(diagnostic);
            } else {
                // Check if behavior is in import paths or explicitly imported
                const importError = this.checkImportPath(behaviorPath, classPath, workspaceRoot);
                if (importError) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        importError,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'behavior-not-imported';
                    diagnostic.source = 'yii1-behaviors';
                    diagnostics.push(diagnostic);
                }
            }
        }

        return diagnostics;
    }

    /**
     * Resolve behavior class path to file path
     */
    private resolveBehaviorPath(classPath: string, workspaceRoot: string): string | null {
        const parts = classPath.split('.').filter(part => part.length > 0);

        if (parts.length === 0) {
            return null;
        }

        
        const basePath = path.join(workspaceRoot, 'protected');

        const behaviorClasses = this.classLocator.getAllBehaviorClasses(basePath);
        const behaviorClass = behaviorClasses.find(classEntity => classEntity.name === classPath);
        return behaviorClass?.filePath || null;
    }

    private getBehaviorClasses(dirPath: string): string[] {
        const cacheKey = dirPath;
        const cached = this.behaviorCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const behaviors: string[] = [];
        
        if (!this.fileRepository.existsSync(dirPath)) {
            return behaviors;
        }

        try {
            this.readBehaviorClassesRecursive(dirPath, dirPath, behaviors);
        } catch (error) {
            // Ignore errors
        }

        const sortedBehaviors = Array.from(new Set(behaviors)).sort();
        this.behaviorCache.set(cacheKey, sortedBehaviors);
        
        return sortedBehaviors;
    }

    private readBehaviorClassesRecursive(baseDir: string, currentDir: string, behaviors: string[]): void {
        try {
            const items = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item.name);
                
                if (item.isDirectory()) {
                    // Recursively search subdirectories
                    this.readBehaviorClassesRecursive(baseDir, fullPath, behaviors);
                } else if (item.isFile() && item.name.endsWith('.php')) {
                    // Read PHP file and extract class name
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const className = this.extractClassName(content, fullPath);
                        
                        if (className) {
                            // Calculate relative path from base directory for dot notation
                            const relativePath = path.relative(baseDir, fullPath);
                            const relativePathWithoutExt = relativePath.replace(/\.php$/, '');
                            
                            // Convert path separators to dots for dot notation
                            const dotNotation = relativePathWithoutExt.split(path.sep).slice(-1).at(0)!;
                            behaviors.push(dotNotation);
                        }
                    } catch (error) {
                        // Ignore file read errors
                    }
                }
            }
        } catch (error) {
            // Ignore directory read errors
        }
    }

    private extractClassName(content: string, filePath: string): string | null {
        // Pattern to match: class ClassName extends CActiveRecordBehavior
        // or: class ClassName extends SomeOtherClass
        const classPattern = /class\s+(\w+)(?:\s+extends\s+(\w+))?/;
        const match = content.match(classPattern);

        if (!match) {
            return null;
        }

        // const phpClassEntity = Class.fromRaw({
        //     name: match![1],
        //     parentClass: match![2] ?? null,
        //     filePath: filePath,
        //     isAbstract: false,
        //     methods: [],
        //     properties: []
        // });

        // this.classCache.set(filePath, phpClassEntity);

        const className = match[1];
        const parentClass = match[2];



        // Only return classes that extend CActiveRecordBehavior
        // This ensures we only include actual behavior classes
        if (parentClass === 'CActiveRecordBehavior') {
            return className;
        }

        // If it extends something else, we might want to log it or handle differently
        // For now, we only return CActiveRecordBehavior classes
        return null;
    }

    /**
     * Check if behavior file is in import paths or explicitly imported
     * Returns error message if not imported, null if OK
     */
    private checkImportPath(behaviorPath: string, classPath: string, workspaceRoot: string): string | null {
        // Get import paths from main.php
        const importPaths = this.mainConfigParser.getImportPaths(workspaceRoot);
        
        if (importPaths.length === 0) {
            // No import paths defined, skip validation
            return null;
        }

        // Convert behavior file path to dot notation path
        const relativePath = path.relative(path.join(workspaceRoot, 'protected'), behaviorPath);
        const pathWithoutExt = relativePath.replace(/\.php$/, '');
        const dotNotationPath = 'application.' + pathWithoutExt.split(path.sep).join('.');

        // Check if behavior path matches any import path pattern
        for (const importPath of importPaths) {
            if (this.matchesImportPath(dotNotationPath, importPath)) {
                return null; // Found in import paths
            }
        }

        // Behavior is not in import paths
        return `Behavior class "${classPath}" is not in the import paths. Add it to protected/config/main.php import array or ensure it's in an imported directory.`;
    }

    /**
     * Check if a dot notation path matches an import path pattern
     * Handles wildcards like 'application.models.*'
     */
    private matchesImportPath(path: string, importPath: string): boolean {
        // Remove wildcard for comparison
        const importBase = importPath.replace(/\.\*$/, '');
        const pathBase = path.split('.').slice(0, path.split('.').length - 1).join('.');

        if (importPath.endsWith('.*')) {
            // Wildcard match: check if path starts with import base
            return pathBase === importBase;
        } else {
            // Exact match
            return path === importPath;
        }
    }

    /**
     * Setup file watcher to invalidate cache when behavior files change
     */
    private setupFileWatcher(): void {
        // Watch for PHP files in behavior directories
        // Pattern matches: protected/components/behaviors/**/*.php and protected/modules/*/components/behaviors/**/*.php
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/protected/**/*.php');
        
        this.fileWatcher.onDidCreate((uri) => {
            this.invalidateBehaviorCache(uri.fsPath);
        });
        
        this.fileWatcher.onDidDelete((uri) => {
            this.invalidateBehaviorCache(uri.fsPath);
        });
        
        this.fileWatcher.onDidChange((uri) => {
            // File content changed, invalidate cache for this file
            this.invalidateBehaviorCache(uri.fsPath);
        });
    }

    /**
     * Invalidate behavior cache when files change
     */
    private invalidateBehaviorCache(filePath: string): void {
        // Get workspace root to determine protected directory
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        for (const folder of workspaceFolders) {
            const workspaceRoot = folder.uri.fsPath;
            const protectedPath = path.join(workspaceRoot, 'protected');
            
            // Check if the file is within this workspace
            if (filePath.startsWith(workspaceRoot)) {
                // Invalidate individual class cache entry for this file
                this.classCache.delete(filePath);
                
                // Invalidate behavior cache for the protected directory
                this.behaviorCache.delete(protectedPath);
                
                // Invalidate ClassLocator cache for the directory containing the file
                const fileDir = path.dirname(filePath);
                this.classLocator.invalidateCache(fileDir);
                
                // Also invalidate parent directories up to protected
                let currentDir = fileDir;
                while (currentDir !== protectedPath && currentDir.length > protectedPath.length) {
                    this.classLocator.invalidateCache(currentDir);
                    currentDir = path.dirname(currentDir);
                }
                
                // Invalidate the protected directory cache as well
                this.classLocator.invalidateCache(protectedPath);
                
                break;
            }
        }
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
    }
}


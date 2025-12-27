import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from '../domain/interfaces/IYiiProjectDetector';
import { ICache } from '../domain/interfaces/ICache';

/**
 * Diagnostics provider for behavior classes in behaviors() method
 * Checks if behavior class files exist
 */
export class BehaviorDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly projectDetector: IYiiProjectDetector,
        private readonly behaviorCache: ICache<string[]>
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-behaviors');
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

        const behaviorClasses = this.getBehaviorClasses(basePath);
        const index = behaviorClasses.indexOf(classPath);
        if (index !== -1) {
            return behaviorClasses[index];
        }

        return null;
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
}


import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { ICache } from '../domain/interfaces/ICache';
import { Class } from '../domain/entities/Calss';
import { ClassLocator } from '../infrastructure/class-location/ClassLocator';
import { BEHAVIORS_PATTERN_REGEX } from '../infrastructure/constant/RegexConst';

/**
 * Completion provider for behavior class names in behaviors() method
 */
export class BehaviorCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly behaviorCache: ICache<string[]>,
        private readonly classCache: ICache<Class>,
        private readonly classLocator: ClassLocator
    ) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        // Check if we're inside behaviors() method
        if (!this.isInBehaviorsMethod(document, position)) {
            return null;
        }

        const line = document.lineAt(position);
        const lineText = line.text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const textAfterCursor = lineText.substring(position.character);

        // Check if we're typing a behavior class name
        const behaviorInfo = this.findBehaviorClassAtPosition(document, position, textBeforeCursor, textAfterCursor);
        if (!behaviorInfo) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const currentPath = behaviorInfo.currentPath || '';

        // Set up text replacement range
        const replaceStart = new vscode.Position(position.line, behaviorInfo.quoteStart);
        const replaceEnd = new vscode.Position(position.line, behaviorInfo.quoteEnd);

        // Get completions for behavior classes
        const completions = this.getBehaviorCompletions(workspaceRoot, currentPath, replaceStart, replaceEnd);

        return new vscode.CompletionList(completions, false);
    }

    /**
     * Check if cursor is inside behaviors() method
     */
    private isInBehaviorsMethod(document: vscode.TextDocument, position: vscode.Position): boolean {
        const text = document.getText();
        const positionOffset = document.offsetAt(position);

        // Find all behaviors() method definitions
        let match;

        while ((match = BEHAVIORS_PATTERN_REGEX.exec(text)) !== null) {
            const methodStart = match.index + match[0].length;
            
            // Find the closing brace of the method
            let braceCount = 1;
            let pos = methodStart;
            
            while (pos < text.length && braceCount > 0) {
                const char = text[pos];
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
                pos++;
            }

            const methodEnd = pos;
            
            // Check if cursor is within this method
            if (positionOffset >= methodStart && positionOffset <= methodEnd) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find behavior class reference at cursor position
     */
    private findBehaviorClassAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        textBeforeCursor: string,
        textAfterCursor: string
    ): {
        currentPath: string;
        quoteStart: number;
        quoteEnd: number;
    } | null {
        // Pattern to match 'class' => 'BehaviorClass' or "class" => "BehaviorClass"
        const classPattern = /['"]class['"]\s*=>\s*['"]([^'"]*)$/;
        const match = textBeforeCursor.match(classPattern);
        
        if (!match) {
            return null;
        }

        const currentPath = match[1] || '';
        const quoteChar = match[0].includes("'") ? "'" : '"';
        const quoteStartIndex = match.index! + match[0].lastIndexOf(quoteChar) + 1;

        // Check if there's a closing quote after cursor
        const closingQuoteMatch = textAfterCursor.match(/^[^'"]*['"]/);
        const quoteEndIndex = closingQuoteMatch 
            ? position.character + closingQuoteMatch[0].length - 1
            : position.character;

        return {
            currentPath,
            quoteStart: quoteStartIndex,
            quoteEnd: quoteEndIndex
        };
    }

    /**
     * Get completion items for behavior classes
     */
    private getBehaviorCompletions(
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        const protectedPath = path.join(workspaceRoot, "protected");

        const behaviorClasses = this.getBehaviorClasses(protectedPath);
        
        behaviorClasses.forEach(behaviorClass => {
            const item = new vscode.CompletionItem(
                behaviorClass,
                vscode.CompletionItemKind.Class
            )
            item.filterText = behaviorClass;
            item.insertText = behaviorClass;
            item.detail = ""
            item.documentation = ""
            completions.push(item);
        })
        return completions;
    }

    /**
     * Get behavior class names from a directory (recursively)
     * Reads all PHP files and extracts class names
     */
    private getBehaviorClasses(dirPath: string): string[] {
        const cacheKey = dirPath;
        const cached = this.behaviorCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const behaviors: string[] = [];

        const classEntities = this.classLocator.getAllClasses(dirPath);

        classEntities.filter(classEntity => classEntity.parentClass === 'CActiveRecordBehavior').forEach(classEntity => {
            behaviors.push(classEntity.name);
        });

        const sortedBehaviors = Array.from(new Set(behaviors)).sort();
        this.behaviorCache.set(cacheKey, sortedBehaviors);
        
        return sortedBehaviors;
    }

    /**
     * Recursively read behavior classes from directory and subdirectories
     */
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

    /**
     * Extract class name from PHP file content
     * Specifically looks for classes that extend CActiveRecordBehavior
     * Also captures classes extending other classes for validation
     */
    private extractClassName(content: string, filePath: string): string | null {
        // Pattern to match: class ClassName extends CActiveRecordBehavior
        // or: class ClassName extends SomeOtherClass
        const classPattern = /class\s+(\w+)(?:\s+extends\s+(\w+))?/;
        const match = content.match(classPattern);

        if (!match) {
            return null;
        }

        const phpClassEntity = Class.fromRaw({
            name: match![1],
            parentClass: match![2] ?? null,
            filePath: filePath,
            isAbstract: false,
            methods: [],
            properties: []
        });

        this.classCache.set(filePath, phpClassEntity);

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
     * Get subdirectories in a directory
     */
    private getDirectories(dirPath: string): string[] {
        if (!this.fileRepository.existsSync(dirPath)) {
            return [];
        }

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            return items
                .filter(item => item.isDirectory())
                .map(item => item.name)
                .sort();
        } catch (error) {
            return [];
        }
    }
}


import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { ServiceRegistry } from '../infrastructure/di/ServiceRegistry';
import { ClassLocator } from '../infrastructure/class-location/ClassLocator';
import { MainConfigParser } from '../infrastructure/config/MainConfigParser';
import { BEHAVIORS_PATTERN_REGEX, CLASS_PATTERN_REGEX } from '../infrastructure/constant/RegexConst';

/**
 * Definition provider for behavior classes in behaviors() method
 */
export class BehaviorDefinitionProvider implements vscode.DefinitionProvider, vscode.CodeActionProvider {
    private mainConfigParser: MainConfigParser;
    
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly classLocator: ClassLocator
    ) {
        this.mainConfigParser = new MainConfigParser(fileRepository);
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Check if we're inside behaviors() method
        if (!this.isInBehaviorsMethod(document, position)) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

        const behaviorInfo = this.findBehaviorClassAtPosition(document, position, workspaceFolder?.uri.fsPath || "");
        if (!behaviorInfo) {
            return null;
        }
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        

        if (behaviorInfo.classPath && this.fileRepository.existsSync(behaviorInfo.classPath)) {
            return new vscode.Location(
                vscode.Uri.file(behaviorInfo.classPath),
                new vscode.Position(0, 0)
            );
        }

        // Return the path even if file doesn't exist (for better UX and code actions)
        if (behaviorInfo.classPath) {
            return new vscode.Location(
                vscode.Uri.file(behaviorInfo.classPath),
                new vscode.Position(0, 0)
            );
        }

        return null;
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const codeActions: vscode.CodeAction[] = [];
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        // Check if there's a diagnostic for missing behavior file
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'behavior-file-missing' && diagnostic.range) {
                const behaviorInfo = this.findBehaviorClassAtPosition(document, diagnostic.range.start, workspaceFolder?.uri.fsPath || "");
                if (behaviorInfo) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                    if (workspaceFolder) {
                        const workspaceRoot = workspaceFolder.uri.fsPath;
                        const behaviorPath = this.resolveBehaviorPath(behaviorInfo.classPath, workspaceRoot);
                        
                        if (behaviorPath && !this.fileRepository.existsSync(behaviorPath)) {
                            const action = new vscode.CodeAction(
                                `Create behavior file: ${path.basename(behaviorPath)}`,
                                vscode.CodeActionKind.QuickFix
                            );
                            action.command = {
                                command: 'yii1.createBehaviorFile',
                                title: 'Create Behavior File',
                                arguments: [behaviorPath, behaviorInfo.className]
                            };
                            action.diagnostics = [diagnostic];
                            codeActions.push(action);
                        }
                    }
                }
            } else if (diagnostic.code === 'behavior-not-imported' && diagnostic.range) {
                // Quick fix for behavior not in import paths
                const behaviorInfo = this.findBehaviorClassAtPosition(document, diagnostic.range.start, workspaceFolder?.uri.fsPath || "");
                if (behaviorInfo && behaviorInfo.classPath) {
                    const dotNotation = this.classLocator.convertToDotNotation(behaviorInfo.classPath, workspaceFolder?.uri.fsPath || "");
                    // Quick fix: Import the behavior class using Yii::import
                    const action = new vscode.CodeAction(
                        `Import behavior class: ${dotNotation}`,
                        vscode.CodeActionKind.QuickFix
                    );
                    action.command = {
                        command: 'yii1.importBehaviorClass',
                        title: 'Import Behavior Class',
                        arguments: [document.uri, dotNotation]
                    };

                    

                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;
                    codeActions.push(action);
                }
            }
        }

        return codeActions.length > 0 ? codeActions : undefined;
    }

    /**
     * Check if cursor is inside behaviors() method
     */
    private isInBehaviorsMethod(document: vscode.TextDocument, position: vscode.Position): boolean {
        const methodBounds = this.getBehaviorsMethodBounds(document, position);
        return methodBounds !== null;
    }

    /**
     * Get the boundaries of the behaviors() method containing the given position
     * @returns Object with start and end positions, or null if not found
     */
    private getBehaviorsMethodBounds(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { startOffset: number; endOffset: number; startLine: number; endLine: number } | null {
        const text = document.getText();
        const positionOffset = document.offsetAt(position);

        let match;

        while ((match = BEHAVIORS_PATTERN_REGEX.exec(text)) !== null) {
            const methodStart = match.index + match[0].length;
            
            let braceCount = 1;
            let pos = methodStart;
            
            while (pos < text.length && braceCount > 0) {
                const char = text[pos];
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
                pos++;
            }

            const methodEnd = pos;
            
            if (positionOffset >= methodStart && positionOffset <= methodEnd) {
                const startPos = document.positionAt(methodStart);
                const endPos = document.positionAt(methodEnd);
                return {
                    startOffset: methodStart,
                    endOffset: methodEnd,
                    startLine: startPos.line,
                    endLine: endPos.line
                };
            }
        }

        return null;
    }

    /**
     * Find behavior class reference at cursor position
     * Searches within the behaviors() method boundaries
     */
    private findBehaviorClassAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        workspaceRoot: string
    ): { classPath: string; className: string } | null {
        // Get the behaviors() method boundaries
        
        const methodBounds = this.getBehaviorsMethodBounds(document, position);
        if (!methodBounds) {
            return null;
        }

        // Search only within the method boundaries
        const startLine = methodBounds.startLine;
        const endLine = methodBounds.endLine;

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = CLASS_PATTERN_REGEX.exec(lineText)) !== null) {
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const classStart = match.index + match[0].indexOf(quoteChar, match[0].indexOf('=>') + 2) + 1;
                const classEnd = match.index + match[0].lastIndexOf(quoteChar);

                if (lineNum === position.line) {
                    if (position.character >= classStart && position.character < classEnd) {
                        const classPath = match[1];
                        const className = classPath.split('.').pop() || classPath;
                        
                        const behaviorClasses = this.classLocator.getAllBehaviorClasses(path.join(workspaceRoot, "protected")).find(classEntity => classEntity.name === className);
                        if (behaviorClasses) {
                            return { classPath: behaviorClasses.filePath, className: behaviorClasses.name };
                        } else {
                            return null;
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Resolve behavior class path to file path
     */
    private resolveBehaviorPath(classPath: string, workspaceRoot: string): string | null {
        // Behavior classes use dot notation: 'application.components.behaviors.BehaviorName'
        const parts = classPath.split('.').filter(part => part.length > 0);

        if (parts.length === 0) {
            return null;
        }

        if (parts[0] === 'application') {
            const basePath = path.join(workspaceRoot, 'protected');

            // application.components.behaviors.BehaviorName
            if (parts.length >= 4 && parts[1] === 'components' && parts[2] === 'behaviors') {
                const behaviorName = parts.slice(3).join(path.sep);
                return path.join(basePath, 'components', 'behaviors', `${behaviorName}.php`);
            }

            // application.modules.ModuleName.components.behaviors.BehaviorName
            if (parts.length >= 6 && parts[1] === 'modules' && parts[3] === 'components' && parts[4] === 'behaviors') {
                const moduleName = parts[2];
                const behaviorName = parts.slice(5).join(path.sep);
                return path.join(basePath, 'modules', moduleName, 'components', 'behaviors', `${behaviorName}.php`);
            }
        } else if (parts[0] === 'zii') {
            // zii.behaviors.* -> framework/zii/behaviors/
            const frameworkPath = path.join(workspaceRoot, 'framework', 'zii');
            const subPath = parts.slice(1).join(path.sep);
            return path.join(frameworkPath, subPath) + '.php';
        } else if (parts[0] === 'system') {
            // system.* -> framework/
            const frameworkPath = path.join(workspaceRoot, 'framework');
            const subPath = parts.slice(1).join(path.sep);
            return path.join(frameworkPath, subPath) + '.php';
        }

        return null;
    }

    /**
     * Calculate import path for a behavior file
     */
    private calculateImportPath(behaviorPath: string, workspaceRoot: string): string | null {
        const protectedPath = path.join(workspaceRoot, 'protected');
        const relativePath = path.relative(protectedPath, behaviorPath);
        const pathWithoutExt = relativePath.replace(/\.php$/, '');
        const parts = pathWithoutExt.split(path.sep);
        
        // Convert to dot notation: application.components.behaviors.*
        // Find the directory that should be imported (usually the parent of behaviors)
        const behaviorsIndex = parts.indexOf('behaviors');
        if (behaviorsIndex > 0) {
            // Include up to behaviors directory with wildcard
            const importParts = parts.slice(0, behaviorsIndex + 1);
            return 'application.' + importParts.join('.') + '.*';
        }
        
        // Fallback: import the directory containing the behavior
        if (parts.length > 1) {
            const importParts = parts.slice(0, parts.length - 1);
            return 'application.' + importParts.join('.') + '.*';
        }
        
        return null;
    }
}


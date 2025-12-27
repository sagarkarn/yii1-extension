import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';

/**
 * Definition provider for behavior classes in behaviors() method
 */
export class BehaviorDefinitionProvider implements vscode.DefinitionProvider, vscode.CodeActionProvider {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Check if we're inside behaviors() method
        if (!this.isInBehaviorsMethod(document, position)) {
            return null;
        }

        const behaviorInfo = this.findBehaviorClassAtPosition(document, position);
        if (!behaviorInfo) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const behaviorPath = this.resolveBehaviorPath(behaviorInfo.classPath, workspaceRoot);

        if (behaviorPath && this.fileRepository.existsSync(behaviorPath)) {
            return new vscode.Location(
                vscode.Uri.file(behaviorPath),
                new vscode.Position(0, 0)
            );
        }

        // Return the path even if file doesn't exist (for better UX and code actions)
        if (behaviorPath) {
            return new vscode.Location(
                vscode.Uri.file(behaviorPath),
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

        // Check if there's a diagnostic for missing behavior file
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'behavior-file-missing' && diagnostic.range) {
                const behaviorInfo = this.findBehaviorClassAtPosition(document, diagnostic.range.start);
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
            }
        }

        return codeActions.length > 0 ? codeActions : undefined;
    }

    /**
     * Check if cursor is inside behaviors() method
     */
    private isInBehaviorsMethod(document: vscode.TextDocument, position: vscode.Position): boolean {
        const text = document.getText();
        const positionOffset = document.offsetAt(position);

        const behaviorsPattern = /(?:public\s+)?function\s+behaviors\s*\([^)]*\)\s*\{/gi;
        let match;

        while ((match = behaviorsPattern.exec(text)) !== null) {
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
        position: vscode.Position
    ): { classPath: string; className: string } | null {
        const startLine = Math.max(0, position.line - 5);
        const endLine = Math.min(document.lineCount - 1, position.line + 5);

        // Pattern to match 'class' => 'BehaviorClass' or "class" => "BehaviorClass"
        const classPattern = /['"]class['"]\s*=>\s*['"]([^'"]+)['"]/g;

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = classPattern.exec(lineText)) !== null) {
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const classStart = match.index + match[0].indexOf(quoteChar, match[0].indexOf('=>') + 2) + 1;
                const classEnd = match.index + match[0].lastIndexOf(quoteChar);

                if (lineNum === position.line) {
                    if (position.character >= classStart && position.character < classEnd) {
                        const classPath = match[1];
                        const className = classPath.split('.').pop() || classPath;
                        return { classPath, className };
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
}


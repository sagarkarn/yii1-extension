import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class YiiImportProvider implements vscode.DefinitionProvider, vscode.CodeActionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        const importInfo = this.findImportCall(document, position);
        if (!importInfo) {
            return null;
        }

        const { importPath } = importInfo;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const resolvedPath = this.resolveImportPath(importPath, workspaceRoot);

        if (resolvedPath && fs.existsSync(resolvedPath)) {
            return new vscode.Location(
                vscode.Uri.file(resolvedPath),
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
        // Code actions can be added here if needed
        return [];
    }

    private findImportCall(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { importPath: string } | null {
        const startLine = Math.max(0, position.line - 3);
        const endLine = Math.min(document.lineCount - 1, position.line + 3);

        // Pattern to match: Yii::import('path') or Yii::import("path")
        const importPattern = /Yii\s*::\s*import\s*\(\s*['"]([^'"]+)['"]/g;

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = importPattern.exec(lineText)) !== null) {
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const importStart = match.index + match[0].indexOf(quoteChar) + 1;
                const importEnd = match.index + match[0].lastIndexOf(quoteChar);

                if (lineNum === position.line) {
                    if (position.character >= importStart && position.character < importEnd) {
                        const importPath = match[1];
                        return { importPath };
                    }
                }
            }
        }

        return null;
    }

    private resolveImportPath(importPath: string, workspaceRoot: string): string | null {
        // Yii::import() uses dot notation: 'application.models.*' or 'application.controllers.SiteController'
        // Convert to file path
        
        // Remove wildcards
        const cleanPath = importPath.replace(/\.\*$/, '');
        const parts = cleanPath.split('.').filter(part => part.length > 0);

        if (parts.length === 0) {
            return null;
        }

        // Handle different import patterns
        if (parts[0] === 'application' || parts[0] === 'zii' || parts[0] === 'system') {
            // Framework paths
            if (parts[0] === 'application') {
                // application.models.* -> protected/models/
                // application.controllers.* -> protected/controllers/
                // application.components.* -> protected/components/
                // application.modules.Sow.services.ServiceFactory -> protected/modules/Sow/services/ServiceFactory.php
                const basePath = path.join(workspaceRoot, 'protected');
                
                if (parts.length === 1) {
                    return basePath;
                }

                // Handle module paths: application.modules.ModuleName.path.to.Class
                if (parts.length >= 3 && parts[1] === 'modules') {
                    // application.modules.Sow.services.ServiceFactory
                    // -> protected/modules/Sow/services/ServiceFactory.php
                    const moduleName = parts[2];
                    const remainingParts = parts.slice(3); // ['services', 'ServiceFactory']
                    
                    if (remainingParts.length === 0) {
                        // Just the module directory
                        return path.join(basePath, 'modules', moduleName);
                    }
                    
                    const subPath = remainingParts.join(path.sep);
                    const fullPath = path.join(basePath, 'modules', moduleName, subPath);
                    
                    // Try with .php extension first
                    if (fs.existsSync(fullPath + '.php')) {
                        return fullPath + '.php';
                    }
                    
                    // Try as directory
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                        return fullPath;
                    }
                    
                    // Return expected path even if it doesn't exist (for navigation)
                    return fullPath + '.php';
                } else {
                    // Regular application paths: application.models.User, application.controllers.SiteController
                    const subPath = parts.slice(1).join(path.sep);
                    const fullPath = path.join(basePath, subPath);
                    
                    // Try with .php extension
                    if (fs.existsSync(fullPath + '.php')) {
                        return fullPath + '.php';
                    }
                    
                    // Try as directory
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                        return fullPath;
                    }

                    return fullPath + '.php'; // Default to .php
                }
            } else if (parts[0] === 'zii') {
                // zii.widgets.* -> framework/zii/widgets/
                const frameworkPath = path.join(workspaceRoot, 'framework', 'zii');
                const subPath = parts.slice(1).join(path.sep);
                const fullPath = path.join(frameworkPath, subPath);
                
                if (fs.existsSync(fullPath + '.php')) {
                    return fullPath + '.php';
                }
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                    return fullPath;
                }
                return fullPath + '.php';
            } else if (parts[0] === 'system') {
                // system.* -> framework/
                const frameworkPath = path.join(workspaceRoot, 'framework');
                const subPath = parts.slice(1).join(path.sep);
                const fullPath = path.join(frameworkPath, subPath);
                
                if (fs.existsSync(fullPath + '.php')) {
                    return fullPath + '.php';
                }
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                    return fullPath;
                }
                return fullPath + '.php';
            }
        } else {
            // Custom paths - try as relative to protected or application
            const protectedPath = path.join(workspaceRoot, 'protected');
            const customPath = parts.join(path.sep);
            
            // Try in protected directory
            let fullPath = path.join(protectedPath, customPath);
            if (fs.existsSync(fullPath + '.php')) {
                return fullPath + '.php';
            }
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return fullPath;
            }

            // Try in application directory
            const appPath = path.join(workspaceRoot, 'application');
            fullPath = path.join(appPath, customPath);
            if (fs.existsSync(fullPath + '.php')) {
                return fullPath + '.php';
            }
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return fullPath;
            }

            return fullPath + '.php'; // Default
        }

        return null;
    }

    // Public method for diagnostics
    findImportCalls(document: vscode.TextDocument): Array<{ range: vscode.Range; importPath: string; line: number }> {
        const imports: Array<{ range: vscode.Range; importPath: string; line: number }> = [];
        const importPattern = /Yii\s*::\s*import\s*\(\s*['"]([^'"]+)['"]/g;

        for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = importPattern.exec(lineText)) !== null) {
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const importStart = match.index + match[0].indexOf(quoteChar) + 1;
                const importEnd = match.index + match[0].lastIndexOf(quoteChar);
                
                const range = new vscode.Range(
                    lineNum,
                    importStart,
                    lineNum,
                    importEnd
                );

                imports.push({
                    range,
                    importPath: match[1],
                    line: lineNum
                });
            }
        }

        return imports;
    }
}


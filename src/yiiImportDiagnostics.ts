import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { YiiImportProvider } from './yiiImportProvider';

export class YiiImportDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private importProvider: YiiImportProvider;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-import');
        this.importProvider = new YiiImportProvider();
    }

    public getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];
        const imports = this.importProvider.findImportCalls(document);
        
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const importMap = new Map<string, Array<{ line: number; range: vscode.Range }>>();

        // Check for duplicates and missing files
        for (const importInfo of imports) {
            const { importPath, range, line } = importInfo;
            
            // Track imports for duplicate detection
            if (!importMap.has(importPath)) {
                importMap.set(importPath, []);
            }
            importMap.get(importPath)!.push({ line, range });

            // Check if file exists
            const resolvedPath = this.resolveImportPath(importPath, workspaceRoot);
            if (!resolvedPath || !fs.existsSync(resolvedPath)) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Import path not found: ${importPath}`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'Yii 1.1';
                diagnostics.push(diagnostic);
            }
        }

        // Check for duplicates
        for (const [importPath, occurrences] of importMap.entries()) {
            if (occurrences.length > 1) {
                // Mark all occurrences as duplicates
                for (const occurrence of occurrences) {
                    const diagnostic = new vscode.Diagnostic(
                        occurrence.range,
                        `Duplicate import: ${importPath} (found ${occurrences.length} times)`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'Yii 1.1';
                    diagnostics.push(diagnostic);
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private resolveImportPath(importPath: string, workspaceRoot: string): string | null {
        // Same logic as YiiImportProvider
        const cleanPath = importPath.replace(/\.\*$/, '');
        const parts = cleanPath.split('.').filter(part => part.length > 0);

        if (parts.length === 0) {
            return null;
        }

        if (parts[0] === 'application' || parts[0] === 'zii' || parts[0] === 'system') {
            if (parts[0] === 'application') {
                const basePath = path.join(workspaceRoot, 'protected');
                
                if (parts.length === 1) {
                    return basePath;
                }

                // Handle module paths: application.modules.ModuleName.path.to.Class
                if (parts.length >= 3 && parts[1] === 'modules') {
                    const moduleName = parts[2];
                    const remainingParts = parts.slice(3);
                    
                    if (remainingParts.length === 0) {
                        return path.join(basePath, 'modules', moduleName);
                    }
                    
                    const subPath = remainingParts.join(path.sep);
                    const fullPath = path.join(basePath, 'modules', moduleName, subPath);
                    
                    if (fs.existsSync(fullPath + '.php')) {
                        return fullPath + '.php';
                    }
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                        return fullPath;
                    }
                    return fullPath + '.php';
                } else {
                    const subPath = parts.slice(1).join(path.sep);
                    const fullPath = path.join(basePath, subPath);
                    
                    if (fs.existsSync(fullPath + '.php')) {
                        return fullPath + '.php';
                    }
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                        return fullPath;
                    }
                    return fullPath + '.php';
                }
            } else if (parts[0] === 'zii') {
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
            const protectedPath = path.join(workspaceRoot, 'protected');
            const customPath = parts.join(path.sep);
            
            let fullPath = path.join(protectedPath, customPath);
            if (fs.existsSync(fullPath + '.php')) {
                return fullPath + '.php';
            }
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return fullPath;
            }

            const appPath = path.join(workspaceRoot, 'application');
            fullPath = path.join(appPath, customPath);
            if (fs.existsSync(fullPath + '.php')) {
                return fullPath + '.php';
            }
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return fullPath;
            }

            return fullPath + '.php';
        }

        return null;
    }
}


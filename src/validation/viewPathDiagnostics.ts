import * as vscode from 'vscode';
import * as path from 'path';
import { IViewLocator } from '../domain/interfaces/IViewLocator';
import { IActionParser } from '../domain/interfaces/IActionParser';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { Action } from '../domain/entities/Action';
import { View } from '../domain/entities/View';
import { IPathResolver, ViewPathOptions } from '../domain/interfaces/IPathResolver';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from '../domain/interfaces/IYiiProjectDetector';

/**
 * Diagnostics provider for view paths in render/renderPartial calls
 * Checks if view files exist and shows warnings/errors
 */
export class ViewPathDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private viewLocator: IViewLocator;
    private actionParser: IActionParser;
    private fileRepository: IFileRepository;
    private pathResolver: IPathResolver;
    private configService: IConfigurationService;
    private projectDetector: IYiiProjectDetector;

    constructor(
        viewLocator: IViewLocator,
        actionParser: IActionParser,
        fileRepository: IFileRepository,
        pathResolver: IPathResolver,
        configService: IConfigurationService,
        projectDetector: IYiiProjectDetector
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-view-paths');
        this.viewLocator = viewLocator;
        this.actionParser = actionParser;
        this.fileRepository = fileRepository;
        this.pathResolver = pathResolver;
        this.configService = configService;
        this.projectDetector = projectDetector;
    }

    public getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    /**
     * Update diagnostics for a document
     */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        // Only work on PHP files
        if (document.languageId !== 'php') {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        const filePath = document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        if (!workspaceFolder) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        // Check if it's a Yii project
        if (!this.projectDetector.isYiiProjectSync(workspaceFolder.uri.fsPath)) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }
        
        // Check if it's a controller file
        const isController = this.projectDetector.isControllerFile(filePath, workspaceFolder.uri.fsPath);
        
        // Check if it's a view file
        const isView = this.projectDetector.isViewFile(filePath, workspaceFolder.uri.fsPath);

        // Only check controller and view files
        if (!isController && !isView) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        if (isController) {
            // For controllers, check render/renderPartial calls in action methods
            const actionInfos = await this.actionParser.findAllActions(document);

            // Check each action for render/renderPartial calls
            for (const actionInfo of actionInfos) {
                // Create Action entity
                const action = new Action(
                    actionInfo.name,
                    actionInfo.position,
                    actionInfo.startOffset,
                    actionInfo.endOffset,
                    document
                );
                
                const actionDiagnostics = await this.checkActionViews(document, action);
                diagnostics.push(...actionDiagnostics);
            }
        } else if (isView) {
            // For view files, check render/renderPartial calls throughout the entire file
            const viewDiagnostics = await this.checkViewFile(document);
            diagnostics.push(...viewDiagnostics);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Check views in an action and return diagnostics
     */
    private async checkActionViews(
        document: vscode.TextDocument,
        action: Action
    ): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        
        // Find all render/renderPartial calls in the action
        const renderPattern = /(?:->|::)\s*(render(?:Partial)?)\s*\(\s*['"]([^'"]+)['"]/g;
        const actionStart = document.offsetAt(action.position);
        const actionEnd = this.findActionEnd(text, actionStart);
        const actionText = text.substring(actionStart, actionEnd);

        let match;
        while ((match = renderPattern.exec(actionText)) !== null) {
            const isPartial = match[1] === 'renderPartial';
            const viewName = match[2];
            const matchOffset = actionStart + match.index;
            const matchPosition = document.positionAt(matchOffset);
            
            // Find the exact range of the view name string
            const viewNameStart = matchOffset + match[0].indexOf(viewName);
            const viewNameEnd = viewNameStart + viewName.length;
            const viewNameRange = new vscode.Range(
                document.positionAt(viewNameStart),
                document.positionAt(viewNameEnd)
            );

            // Try to resolve the view path directly
            const isRelative = viewName.startsWith('../') || viewName.startsWith('./');
            const isAbsolute = viewName.startsWith('/');
            const isDotNotation = viewName.includes('.') && !isRelative && !isAbsolute;
            
            const viewPathOptions: ViewPathOptions = {
                isPartial,
                isRelative,
                isAbsolute,
                isDotNotation
            };
            
            const resolvedPath = await this.pathResolver.resolveViewPath(
                document,
                viewName,
                viewPathOptions
            );

            if (!resolvedPath) {
                // View path could not be resolved - create diagnostic
                // This happens when the path format is invalid or controller info cannot be determined
                const diagnostic = new vscode.Diagnostic(
                    viewNameRange,
                    `Cannot resolve view path: "${viewName}"${isPartial ? ' (partial)' : ''}. Check path format.`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'view-path-unresolved';
                diagnostic.source = 'yii1-view-paths';
                diagnostics.push(diagnostic);
            } else {
                // Check if the resolved path exists
                // For partials, PathResolver may return a default path even if file doesn't exist
                const pathExists = this.fileRepository.existsSync(resolvedPath);
                
                if (!pathExists) {
                    // For partials, PathResolver checks both _view.php and view.php
                    // If resolvedPath doesn't exist, check if the alternative exists
                    let alternativePath: string | null = null;
                    let alternativeExists = false;
                    
                    if (isPartial) {
                        // Try the alternative partial path
                        if (resolvedPath.includes(`_${viewName}.php`)) {
                            // Current path has underscore, try without
                            alternativePath = resolvedPath.replace(`_${viewName}.php`, `${viewName}.php`);
                        } else if (resolvedPath.includes(`${viewName}.php`)) {
                            // Current path doesn't have underscore, try with
                            alternativePath = resolvedPath.replace(`${viewName}.php`, `_${viewName}.php`);
                        }
                        
                        if (alternativePath) {
                            alternativeExists = this.fileRepository.existsSync(alternativePath);
                        }
                    }
                    
                    if (alternativeExists && alternativePath) {
                        // Alternative exists - show hint diagnostic (not an error)
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const relativePath = workspaceFolder 
                            ? path.relative(workspaceFolder.uri.fsPath, alternativePath)
                            : alternativePath;
                        
                        const diagnostic = new vscode.Diagnostic(
                            viewNameRange,
                            `View exists at: ${relativePath}${isPartial ? ' (partial)' : ''}`,
                            vscode.DiagnosticSeverity.Information
                        );
                        diagnostic.code = 'view-alternative-path';
                        diagnostic.source = 'yii1-view-paths';
                        diagnostics.push(diagnostic);
                    } else {
                        // File doesn't exist at either path - create error diagnostic
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const checkedPaths: string[] = [];
                        
                        if (workspaceFolder) {
                            checkedPaths.push(path.relative(workspaceFolder.uri.fsPath, resolvedPath));
                            if (alternativePath) {
                                checkedPaths.push(path.relative(workspaceFolder.uri.fsPath, alternativePath));
                            }
                        } else {
                            checkedPaths.push(resolvedPath);
                            if (alternativePath) {
                                checkedPaths.push(alternativePath);
                            }
                        }
                        
                        const message = checkedPaths.length > 1
                            ? `View file does not exist. Checked paths: ${checkedPaths.join(', ')}`
                            : `View file does not exist: ${checkedPaths[0]}`;
                        
                        const diagnostic = new vscode.Diagnostic(
                            viewNameRange,
                            message,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.code = 'view-file-missing';
                        diagnostic.source = 'yii1-view-paths';
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        return diagnostics;
    }

    /**
     * Find the end of an action method
     */
    private findActionEnd(text: string, startOffset: number): number {
        let braceCount = 0;
        let inString = false;
        let stringChar = '';
        let i = startOffset;

        // Find the opening brace of the method
        while (i < text.length) {
            if (text[i] === '{') {
                braceCount = 1;
                i++;
                break;
            }
            i++;
        }

        // Find the matching closing brace
        while (i < text.length) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

            // Handle string literals
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
            }

            if (!inString) {
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        return i + 1;
                    }
                }
            }

            i++;
        }

        return text.length;
    }

    /**
     * Check render/renderPartial calls in view files
     */
    private async checkViewFile(
        document: vscode.TextDocument
    ): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        
        // Find all render/renderPartial calls in the entire file
        const renderPattern = /(?:->|::)\s*(render(?:Partial)?)\s*\(\s*['"]([^'"]+)['"]/g;

        let match;
        while ((match = renderPattern.exec(text)) !== null) {
            const isPartial = match[1] === 'renderPartial';
            const viewName = match[2];
            const matchOffset = match.index;
            const matchPosition = document.positionAt(matchOffset);
            
            // Find the exact range of the view name string
            const viewNameStart = matchOffset + match[0].indexOf(viewName);
            const viewNameEnd = viewNameStart + viewName.length;
            const viewNameRange = new vscode.Range(
                document.positionAt(viewNameStart),
                document.positionAt(viewNameEnd)
            );

            // Try to resolve the view path directly
            const isRelative = viewName.startsWith('../') || viewName.startsWith('./');
            const isAbsolute = viewName.startsWith('/');
            const isDotNotation = viewName.includes('.') && !isRelative && !isAbsolute;
            
            const viewPathOptions: ViewPathOptions = {
                isPartial,
                isRelative,
                isAbsolute,
                isDotNotation
            };
            
            const resolvedPath = await this.pathResolver.resolveViewPath(
                document,
                viewName,
                viewPathOptions
            );

            if (!resolvedPath) {
                // View path could not be resolved - create diagnostic
                const diagnostic = new vscode.Diagnostic(
                    viewNameRange,
                    `Cannot resolve view path: "${viewName}"${isPartial ? ' (partial)' : ''}. Check path format.`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'view-path-unresolved';
                diagnostic.source = 'yii1-view-paths';
                diagnostics.push(diagnostic);
            } else {
                // Check if the resolved path exists
                const pathExists = this.fileRepository.existsSync(resolvedPath);
                
                if (!pathExists) {
                    // For partials, check alternative paths (with/without underscore)
                    let alternativePath: string | null = null;
                    let alternativeExists = false;
                    
                    if (isPartial) {
                        // Try the alternative partial path
                        if (resolvedPath.includes(`_${viewName}.php`)) {
                            // Current path has underscore, try without
                            alternativePath = resolvedPath.replace(`_${viewName}.php`, `${viewName}.php`);
                        } else if (resolvedPath.includes(`${viewName}.php`)) {
                            // Current path doesn't have underscore, try with
                            alternativePath = resolvedPath.replace(`${viewName}.php`, `_${viewName}.php`);
                        }
                        
                        if (alternativePath) {
                            alternativeExists = this.fileRepository.existsSync(alternativePath);
                        }
                    }
                    
                    if (alternativeExists && alternativePath) {
                        // Alternative exists - show hint diagnostic (not an error)
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const relativePath = workspaceFolder 
                            ? path.relative(workspaceFolder.uri.fsPath, alternativePath)
                            : alternativePath;
                        
                        const diagnostic = new vscode.Diagnostic(
                            viewNameRange,
                            `View exists at: ${relativePath}${isPartial ? ' (partial)' : ''}`,
                            vscode.DiagnosticSeverity.Information
                        );
                        diagnostic.code = 'view-alternative-path';
                        diagnostic.source = 'yii1-view-paths';
                        diagnostics.push(diagnostic);
                    } else {
                        // File doesn't exist at either path - create error diagnostic
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const checkedPaths: string[] = [];
                        
                        if (workspaceFolder) {
                            checkedPaths.push(path.relative(workspaceFolder.uri.fsPath, resolvedPath));
                            if (alternativePath) {
                                checkedPaths.push(path.relative(workspaceFolder.uri.fsPath, alternativePath));
                            }
                        } else {
                            checkedPaths.push(resolvedPath);
                            if (alternativePath) {
                                checkedPaths.push(alternativePath);
                            }
                        }
                        
                        const message = checkedPaths.length > 1
                            ? `View file does not exist. Checked paths: ${checkedPaths.join(', ')}`
                            : `View file does not exist: ${checkedPaths[0]}`;
                        
                        const diagnostic = new vscode.Diagnostic(
                            viewNameRange,
                            message,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.code = 'view-file-missing';
                        diagnostic.source = 'yii1-view-paths';
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        return diagnostics;
    }
}


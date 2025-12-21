import * as vscode from 'vscode';
import * as path from 'path';
import { IControllerLocator, ControllerInfo } from '../../domain/interfaces/IControllerLocator';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';
import { IActionParser } from '../../domain/interfaces/IActionParser';
import { IConfigurationService } from '../../domain/interfaces/IConfigurationService';
import { Result } from '../../domain/result/Result';
import { ControllerNotFoundException } from '../../domain/exceptions/DomainException';

/**
 * Controller locator implementation
 * Finds controllers associated with views
 */
export class ControllerLocatorImpl implements IControllerLocator {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly actionParser: IActionParser,
        private readonly configService: IConfigurationService
    ) {}

    async findControllerAndAction(viewUri: vscode.Uri): Promise<Result<ControllerInfo>> {
        const viewPath = viewUri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(viewUri);
        
        if (!workspaceFolder) {
            return Result.failure('No workspace folder found');
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const relativePath = path.relative(workspaceRoot, viewPath);
        const pathParts = relativePath.split(path.sep);

        // Find views directory index
        const viewsPath = this.configService.getViewsPath();
        const viewsIndex = pathParts.indexOf(viewsPath);
        if (viewsIndex === -1) {
            return Result.failure('View file is not in a views directory');
        }

        // Get view file name without extension
        const viewFileName = path.basename(viewPath, '.php');
        // Remove underscore prefix if it's a partial
        const viewName = viewFileName.startsWith('_') ? viewFileName.substring(1) : viewFileName;

        // Get controller name (the directory after views)
        const controllerName = pathParts[viewsIndex + 1];
        if (!controllerName) {
            return Result.failure('Controller name could not be determined from view path');
        }

        // Check if we're in a module
        const modulesPath = this.configService.getModulesPath();
        const modulesIndex = pathParts.indexOf(modulesPath);
        let controllerPath: string;

        if (modulesIndex !== -1 && modulesIndex < viewsIndex) {
            // Module path: protected/modules/{module}/controllers/{controller}Controller.php
            const moduleName = pathParts[modulesIndex + 1];
            const controllersDir = this.configService.getControllersDirectory(workspaceRoot, moduleName);
            controllerPath = path.join(
                controllersDir,
                `${this.toControllerName(controllerName)}Controller.php`
            );
        } else {
            // Regular path: protected/controllers/{controller}Controller.php
            const controllersDir = this.configService.getControllersDirectory(workspaceRoot);
            controllerPath = path.join(
                controllersDir,
                `${this.toControllerName(controllerName)}Controller.php`
            );
        }

        // Check if controller file exists
        if (!this.fileRepository.existsSync(controllerPath)) {
            // Try alternative naming (lowercase first letter)
            const altControllerPath = path.join(
                path.dirname(controllerPath),
                `${this.toControllerName(controllerName, true)}Controller.php`
            );
            if (this.fileRepository.existsSync(altControllerPath)) {
                controllerPath = altControllerPath;
            } else {
                return Result.failure(new ControllerNotFoundException(controllerName));
            }
        }

        // Find the action that renders this view
        const actionName = await this.findActionForView(controllerPath, viewName);

        return Result.success({
            controllerPath,
            actionName
        });
    }

    async navigateToController(controllerPath: string, actionName: string | null): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(controllerPath);
            const editor = await vscode.window.showTextDocument(document);

            if (actionName) {
                // Find the action method and navigate to it
                const actionInfo = await this.actionParser.findActionByName(document, actionName);
                
                if (actionInfo) {
                    editor.selection = new vscode.Selection(actionInfo.position, actionInfo.position);
                    editor.revealRange(
                        new vscode.Range(actionInfo.position, actionInfo.position),
                        vscode.TextEditorRevealType.InCenter
                    );
                } else {
                    // If exact match not found, show the file anyway
                    vscode.window.showInformationMessage(`Controller opened. Action "${actionName}" not found.`);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to open controller: ${errorMessage}`);
        }
    }

    private toControllerName(name: string, lowercaseFirst: boolean = false): string {
        // Convert view directory name to controller class name
        // e.g., "sow" -> "Sow", "sow_info" -> "SowInfo"
        const parts = name.split('_');
        const capitalized = parts.map(part => 
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('');
        
        if (lowercaseFirst) {
            return capitalized.charAt(0).toLowerCase() + capitalized.slice(1);
        }
        return capitalized;
    }

    private async findActionForView(controllerPath: string, viewName: string): Promise<string | null> {
        try {
            const document = await vscode.workspace.openTextDocument(controllerPath);
            const text = document.getText();

            // Pattern to match: render('viewName') or renderPartial('viewName')
            const patterns = [
                new RegExp(`render(?:Partial)?\\s*\\(\\s*['"]${this.escapeRegex(viewName)}['"]`, 'g'),
                new RegExp(`render(?:Partial)?\\s*\\(\\s*['"]_?${this.escapeRegex(viewName)}['"]`, 'g')
            ];

            // Find all matches and their positions
            const matches: Array<{ line: number; method: string }> = [];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    const position = document.positionAt(match.index);
                    // Find the method that contains this render call
                    const methodName = this.findContainingMethod(text, match.index, document);
                    if (methodName) {
                        matches.push({ line: position.line, method: methodName });
                    }
                }
            }

            if (matches.length > 0) {
                // Return the first match (closest to the render call)
                return matches[0].method;
            }

            // Fallback: try to find action methods that might match the view name
            const actionPattern = /function\s+(action\w+)\s*\(/g;
            const actionMatches: string[] = [];
            let actionMatch;
            
            while ((actionMatch = actionPattern.exec(text)) !== null) {
                const actionName = actionMatch[1].replace('action', '').toLowerCase();
                const viewNameLower = viewName.toLowerCase();
                
                // Check if action name matches view name
                if (actionName === viewNameLower || 
                    actionName.replace(/([A-Z])/g, '_$1').toLowerCase() === viewNameLower) {
                    actionMatches.push(actionMatch[1]);
                }
            }

            return actionMatches.length > 0 ? actionMatches[0] : null;
        } catch (error) {
            return null;
        }
    }

    private findContainingMethod(text: string, position: number, document: vscode.TextDocument): string | null {
        // Find the method that contains the given position
        const beforeText = text.substring(0, position);
        const methodPattern = /function\s+(action\w+)\s*\(/g;
        
        let lastMatch: RegExpMatchArray | null = null;
        let match;
        
        while ((match = methodPattern.exec(beforeText)) !== null) {
            lastMatch = match;
        }

        return lastMatch ? lastMatch[1] : null;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}


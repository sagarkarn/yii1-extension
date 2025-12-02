import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ControllerLocator {
    async findControllerAndAction(viewUri: vscode.Uri): Promise<{ controllerPath: string; actionName: string | null } | null> {
        const viewPath = viewUri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(viewUri);
        
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const relativePath = path.relative(workspaceRoot, viewPath);
        const pathParts = relativePath.split(path.sep);

        // Find views directory index
        const viewsIndex = pathParts.indexOf('views');
        if (viewsIndex === -1) {
            return null;
        }

        // Get view file name without extension
        const viewFileName = path.basename(viewPath, '.php');
        // Remove underscore prefix if it's a partial
        const viewName = viewFileName.startsWith('_') ? viewFileName.substring(1) : viewFileName;

        // Get controller name (the directory after views)
        const controllerName = pathParts[viewsIndex + 1];
        if (!controllerName) {
            return null;
        }

        // Check if we're in a module
        const modulesIndex = pathParts.indexOf('modules');
        let controllerPath: string;

        if (modulesIndex !== -1 && modulesIndex < viewsIndex) {
            // Module path: protected/modules/{module}/controllers/{controller}Controller.php
            const moduleName = pathParts[modulesIndex + 1];
            controllerPath = path.join(
                workspaceRoot,
                'protected',
                'modules',
                moduleName,
                'controllers',
                `${this.toControllerName(controllerName)}Controller.php`
            );
        } else {
            // Regular path: protected/controllers/{controller}Controller.php
            controllerPath = path.join(
                workspaceRoot,
                'protected',
                'controllers',
                `${this.toControllerName(controllerName)}Controller.php`
            );
        }

        // Check if controller file exists
        if (!fs.existsSync(controllerPath)) {
            // Try alternative naming (lowercase first letter)
            const altControllerPath = path.join(
                path.dirname(controllerPath),
                `${this.toControllerName(controllerName, true)}Controller.php`
            );
            if (fs.existsSync(altControllerPath)) {
                controllerPath = altControllerPath;
            } else {
                return { controllerPath, actionName: null };
            }
        }

        // Find the action that renders this view
        const actionName = await this.findActionForView(controllerPath, viewName);

        return { controllerPath, actionName };
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
            // Look for both single and double quotes
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
                
                // Check if action name matches view name (e.g., "sowInfo" action -> "sow_info" view)
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
        // Look backwards for function declarations
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

    async navigateToController(controllerPath: string, actionName: string | null): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(controllerPath);
            const editor = await vscode.window.showTextDocument(document);

            if (actionName) {
                // Find the action method and navigate to it
                const text = document.getText();
                const actionPattern = new RegExp(`function\\s+${this.escapeRegex(actionName)}\\s*\\(`, 'g');
                const match = actionPattern.exec(text);
                
                if (match) {
                    const position = document.positionAt(match.index);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                } else {
                    // If exact match not found, show the file anyway
                    vscode.window.showInformationMessage(`Controller opened. Action "${actionName}" not found.`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open controller: ${error}`);
        }
    }
}


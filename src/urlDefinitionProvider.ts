import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { URL_PATTERN_REGEX } from './infrastructure/constant/RegexConst';

export class UrlDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
        // Find createUrl or createAbsoluteUrl call at cursor position
        const urlInfo = this.findUrlCall(document, position);
        if (!urlInfo) {
            return null;
        }

        const { route } = urlInfo;
        
        // Handle absolute routes starting with '/'
        // e.g., '/Client/noMarkup/loadMarketJobTemplate'
        let normalizedRoute = route;
        if (route.startsWith('/')) {
            normalizedRoute = route.substring(1); // Remove leading '/'
        }
        
        // Parse route: 'controller/action' or 'module/controller/action' or 'controller/action/param1/param2'
        // Filter out empty parts and trailing slashes
        const routeParts = normalizedRoute.split('/').filter(part => part.length > 0);
        if (routeParts.length < 2) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        
        // Check if current file is in a module
        const currentFileModule = this.getModuleFromPath(document.uri.fsPath, workspaceRoot);
        // log current file module
        
        let controllerPath: string;
        let actionName: string;

        const outputChannel = vscode.window.createOutputChannel('Yii 1.1');

        // Check if it's an explicit module route: 'module/controller/action' or '/module/controller/action'
        // We need at least 3 parts for a module route, and the first part should be a valid module
        if (routeParts.length >= 3) {
            const potentialModuleName = routeParts[0];
            const potentialModulePath = path.join(
                workspaceRoot,
                'protected',
                'modules',
                potentialModuleName
            );
            
            // Check if the first part is actually a module directory
            if (fs.existsSync(potentialModulePath)) {
                // It's a module route: 'module/controller/action' or 'module/controller/action/param1/...'
                const moduleName = routeParts[0];
                const controllerName = routeParts[1];
                actionName = routeParts[2]; // Ignore path parameters after action

                controllerPath = path.join(
                    workspaceRoot,
                    'protected',
                    'modules',
                    moduleName,
                    'controllers',
                    `${this.toControllerName(controllerName)}Controller.php`
                );
                // log controller path
                console.log(`Module controller path: ${controllerPath}`);
            } else {
                // Not a module route, treat as 'controller/action/param1/param2/...'
                // Use first two parts as controller/action, ignore the rest (path parameters)
                const controllerName = routeParts[0];
                actionName = routeParts[1];

                if (currentFileModule) {
                    // Current file is in a module, look for controller in that module
                    controllerPath = path.join(
                        workspaceRoot,
                        'protected',
                        'modules',
                        currentFileModule,
                        'controllers',
                        `${this.toControllerName(controllerName)}Controller.php`
                    );

                    // log module controller path
                    console.log(`Module controller path: ${controllerPath}`);
                    
                    // If not found in module, try regular controllers folder
                    if (!fs.existsSync(controllerPath)) {
                        const regularControllerPath = path.join(
                            workspaceRoot,
                            'protected',
                            'controllers',
                            `${this.toControllerName(controllerName)}Controller.php`
                        );
                        // log regular controller path
                        console.log(`Regular controller path: ${regularControllerPath}`);
                        if (fs.existsSync(regularControllerPath)) {
                            controllerPath = regularControllerPath;
                        }
                    }
                } else {
                    // Current file is not in a module, look in regular controllers folder
                    controllerPath = path.join(
                        workspaceRoot,
                        'protected',
                        'controllers',
                        `${this.toControllerName(controllerName)}Controller.php`
                    );
                    // log regular controller path
                    console.log(`Regular controller path: ${controllerPath}`);
                }
            }
        } else {
            // Regular route: 'controller/action'
            // Check if current file is in a module, if so, look in that module first
            const controllerName = routeParts[0];
            actionName = routeParts[1];

            if (currentFileModule) {
                // Current file is in a module, look for controller in that module
                controllerPath = path.join(
                    workspaceRoot,
                    'protected',
                    'modules',
                    currentFileModule,
                    'controllers',
                    `${this.toControllerName(controllerName)}Controller.php`
                );

                // log module controller path
                console.log(`Module controller path: ${controllerPath}`);
                
                // If not found in module, try regular controllers folder
                if (!fs.existsSync(controllerPath)) {
                    const regularControllerPath = path.join(
                        workspaceRoot,
                        'protected',
                        'controllers',
                        `${this.toControllerName(controllerName)}Controller.php`
                    );
                    // log regular controller path
                    console.log(`Regular controller path: ${regularControllerPath}`);
                    if (fs.existsSync(regularControllerPath)) {
                        controllerPath = regularControllerPath;
                    }
                }
            } else {
                // Current file is not in a module, look in regular controllers folder
                controllerPath = path.join(
                    workspaceRoot,
                    'protected',
                    'controllers',
                    `${this.toControllerName(controllerName)}Controller.php`
                );
                // log regular controller path
                console.log(`Regular controller path: ${controllerPath}`);
            }
        }

        // Check if controller file exists
        if (!fs.existsSync(controllerPath)) {
            // Try alternative naming (lowercase first letter)
            const dirname = path.dirname(controllerPath);
            const basename = path.basename(controllerPath, 'Controller.php');
            const altControllerPath = path.join(
                dirname,
                `${this.toControllerName(basename, true)}Controller.php`
            );
            // log alt controller path
            console.log(`Alt controller path: ${altControllerPath}`);
            if (fs.existsSync(altControllerPath)) {
                controllerPath = altControllerPath;
            } else {
                // log alt controller path not found
                console.log(`Alt controller path not found: ${altControllerPath}`);
                return null;
            }
        }

        // Find the action method in the controller
        const actionPosition = await this.findActionMethod(controllerPath, actionName);
        console.log(`Action position: ${actionPosition}`);
        if (actionPosition) {
            return new vscode.Location(
                vscode.Uri.file(controllerPath),
                actionPosition
            );
        }

        return null;
    }

    private findUrlCall(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { route: string } | null {
        // Get text around cursor position
        const startLine = Math.max(0, position.line - 3);
        const endLine = Math.min(document.lineCount - 1, position.line + 3);
        
        // Pattern to match: createUrl('route') or createAbsoluteUrl('route')
        // Also matches: $this->createUrl('route'), Yii::app()->createUrl('route'), etc.
        
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = URL_PATTERN_REGEX.exec(lineText)) !== null) {
                // Find the position of the route string
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const routeStart = match.index + match[0].indexOf(quoteChar) + 1;
                const routeEnd = match.index + match[0].lastIndexOf(quoteChar);
                
                // Check if cursor is on this line and within the route string
                if (lineNum === position.line) {
                    if (position.character >= routeStart && position.character < routeEnd) {
                        const route = match[1];
                        return { route };
                    }
                }
            }
        }

        // Also check for array syntax: createUrl(array('controller/action', ...))
        const arrayPattern = /(?:->|::)\s*create(?:Absolute)?Url\s*\(\s*array\s*\(\s*['"]([^'"]+)['"]/g;
        
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            let match;

            while ((match = arrayPattern.exec(lineText)) !== null) {
                const quoteChar = match[0].includes("'") ? "'" : '"';
                const routeStart = match.index + match[0].indexOf(quoteChar) + 1;
                const routeEnd = match.index + match[0].lastIndexOf(quoteChar);
                
                if (lineNum === position.line) {
                    if (position.character >= routeStart && position.character < routeEnd) {
                        const route = match[1];
                        return { route };
                    }
                }
            }
        }

        return null;
    }

    private toControllerName(name: string, lowercaseFirst: boolean = false): string {
        // Convert route name to controller class name
        // e.g., "sow" -> "Sow", "sow-info" -> "SowInfo"
        const parts = name.split(/[-_]/);
        const capitalized = parts.map(part => 
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('');
        
        if (lowercaseFirst) {
            return capitalized.charAt(0).toLowerCase() + capitalized.slice(1);
        }
        return capitalized;
    }

    private async findActionMethod(
        controllerPath: string,
        actionName: string
    ): Promise<vscode.Position | null> {
        try {
            const document = await vscode.workspace.openTextDocument(controllerPath);
            const text = document.getText();
            
            // Try multiple naming patterns
            const methodNames: string[] = [];
            
            // 1. If already camelCase (e.g., "LoadVendors"), use as-is
            if (actionName.charAt(0) === actionName.charAt(0).toUpperCase()) {
                methodNames.push('action' + actionName);
            }
            
            // 2. Capitalize first letter (e.g., "view" -> "actionView")
            methodNames.push('action' + this.capitalizeFirst(actionName));
            
            // 3. Handle snake_case or kebab-case (e.g., "sow_info" -> "actionSowInfo")
            if (actionName.includes('_') || actionName.includes('-')) {
                const altMethodName = actionName
                    .split(/[-_]/)
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                    .join('');
                methodNames.push('action' + altMethodName);
            }
            
            // Try each method name pattern
            for (const methodName of methodNames) {
                const methodPattern = new RegExp(`function\\s+${this.escapeRegex(methodName)}\\s*\\(`, 'gi');
                const match = methodPattern.exec(text);
                if (match) {
                    return document.positionAt(match.index);
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private capitalizeFirst(str: string): string {
        if (!str) return str;
        // Handle camelCase: "sowInfo" -> "SowInfo"
        // Handle snake_case: "sow_info" -> "SowInfo"
        const parts = str.split(/[-_]/);
        return parts.map(part => 
            part.charAt(0).toUpperCase() + part.slice(1)
        ).join('');
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private getModuleFromPath(filePath: string, workspaceRoot: string): string | null {
        // Check if file is in a module directory
        // Pattern: protected/modules/{module}/...
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        
        const modulesIndex = pathParts.indexOf('modules');
        if (modulesIndex !== -1 && modulesIndex < pathParts.length - 1) {
            return pathParts[modulesIndex + 1];
        }
        
        return null;
    }
}


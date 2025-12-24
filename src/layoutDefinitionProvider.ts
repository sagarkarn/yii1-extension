import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from './domain/interfaces/IFileRepository';
import { IConfigurationService } from './domain/interfaces/IConfigurationService';

/**
 * Definition provider for layout assignments
 * Navigates from $this->layout = 'layoutName' or public $layout = 'layoutName' to layout file
 */
export class LayoutDefinitionProvider implements vscode.DefinitionProvider {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Check if cursor is on a layout assignment
        const layoutInfo = this.findLayoutAssignment(document, position);
        if (!layoutInfo) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const layoutPath = this.resolveLayoutPath(document, layoutInfo.layoutName, workspaceRoot);

        if (layoutPath && this.fileRepository.existsSync(layoutPath)) {
            return new vscode.Location(
                vscode.Uri.file(layoutPath),
                new vscode.Position(0, 0)
            );
        }

        // Return the path even if file doesn't exist (for better UX)
        if (layoutPath) {
            return new vscode.Location(
                vscode.Uri.file(layoutPath),
                new vscode.Position(0, 0)
            );
        }

        return null;
    }

    /**
     * Find layout assignment at cursor position
     * Matches: $this->layout = 'layoutName' or public $layout = 'layoutName'
     */
    private findLayoutAssignment(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { layoutName: string; range: vscode.Range } | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Pattern to match: $this->layout = 'layoutName' or public $layout = 'layoutName'
        const layoutPattern = /(?:\$this\s*->\s*layout|(?:public|protected|private)\s+\$layout)\s*=\s*['"]([^'"]+)['"]/;
        const match = lineText.match(layoutPattern);

        if (!match) {
            return null;
        }

        // Check if cursor is on the layout name
        const layoutName = match[1];
        const quoteChar = match[0].includes("'") ? "'" : '"';
        const layoutNameStart = match.index! + match[0].indexOf(quoteChar) + 1;
        const layoutNameEnd = layoutNameStart + layoutName.length;

        if (position.character >= layoutNameStart && position.character <= layoutNameEnd) {
            const range = new vscode.Range(
                position.line,
                layoutNameStart,
                position.line,
                layoutNameEnd
            );
            return { layoutName, range };
        }

        return null;
    }

    /**
     * Resolve layout file path
     * Layouts are in: protected/views/layouts/layoutName.php
     * Or in modules: protected/modules/ModuleName/views/layouts/layoutName.php
     * Absolute paths starting with // resolve to main app views directory
     */
    private resolveLayoutPath(
        document: vscode.TextDocument,
        layoutName: string,
        workspaceRoot: string
    ): string | null {
        // If layout starts with //, it's an absolute path (main app, not module)
        if (layoutName.startsWith('//')) {
            // Remove // prefix and resolve to main app views directory
            const relativePath = layoutName.substring(2); // Remove '//'
            const viewsDir = this.configService.getViewsDirectory(workspaceRoot);
            const layoutPath = path.join(viewsDir, relativePath + '.php');
            
            if (this.fileRepository.existsSync(layoutPath)) {
                return layoutPath;
            }
            return layoutPath; // Return even if doesn't exist for navigation
        }

        const documentPath = document.uri.fsPath;

        // Check if current file is in a module
        const moduleName = this.getModuleFromPath(documentPath, workspaceRoot);

        if (moduleName) {
            // Module layout: protected/modules/ModuleName/views/layouts/layoutName.php
            const moduleViewsDir = this.configService.getViewsDirectory(workspaceRoot, moduleName);
            const moduleLayoutPath = path.join(moduleViewsDir, 'layouts', `${layoutName}.php`);

            if (this.fileRepository.existsSync(moduleLayoutPath)) {
                return moduleLayoutPath;
            }
        }

        // Main app layout: protected/views/layouts/layoutName.php
        const viewsDir = this.configService.getViewsDirectory(workspaceRoot);
        const layoutPath = path.join(viewsDir, 'layouts', `${layoutName}.php`);

        if (this.fileRepository.existsSync(layoutPath)) {
            return layoutPath;
        }

        // Return expected path even if doesn't exist (for navigation)
        return moduleName
            ? path.join(this.configService.getViewsDirectory(workspaceRoot, moduleName), 'layouts', `${layoutName}.php`)
            : layoutPath;
    }

    /**
     * Get module name from file path
     */
    private getModuleFromPath(filePath: string, workspaceRoot: string): string | null {
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        const modulesPath = this.configService.getModulesPath();
        const modulesIndex = pathParts.indexOf(modulesPath);

        if (modulesIndex !== -1 && modulesIndex < pathParts.length - 1) {
            return pathParts[modulesIndex + 1];
        }

        return null;
    }
}


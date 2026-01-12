import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from './domain/interfaces/IFileRepository';
import { IConfigurationService } from './domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from './domain/interfaces/IYiiProjectDetector';
import { ViewResolver } from './infrastructure/view-resolution/ViewResolver';

/**
 * Definition provider for layout assignments
 * Navigates from $this->layout = 'layoutName' or public $layout = 'layoutName' to layout file
 */
export class LayoutDefinitionProvider implements vscode.DefinitionProvider {
    private viewResolver: ViewResolver;

    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly projectDetector: IYiiProjectDetector
    ) {
        this.viewResolver = new ViewResolver(fileRepository, configService);
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Only work on PHP files
        if (document.languageId !== 'php') {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        // Check if it's a Yii project
        if (!this.projectDetector.isYiiProjectSync(workspaceFolder.uri.fsPath)) {
            return null;
        }

        // Check if cursor is on a layout assignment
        const layoutInfo = this.findLayoutAssignment(document, position);
        if (!layoutInfo) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const documentPath = document.uri.fsPath;
        const moduleName = this.getModuleFromPath(documentPath, workspaceRoot);
        
        // Use ViewResolver to resolve layout path (matching Yii's getLayoutPath() logic)
        const layoutPath = this.viewResolver.resolveLayoutFile(
            layoutInfo.layoutName,
            workspaceRoot,
            moduleName
        );

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


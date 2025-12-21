import * as vscode from 'vscode';
import * as path from 'path';
import { IFileRepository } from './domain/interfaces/IFileRepository';
import { IConfigurationService } from './domain/interfaces/IConfigurationService';

/**
 * Code lens provider for layout assignments
 * Shows "Go to Layout" lens above $this->layout = 'layoutName' lines
 */
export class LayoutCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {}

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const filePath = document.uri.fsPath;

        // Only check controller files
        const controllersPath = this.configService.getControllersPath();
        if (!filePath.includes(controllersPath + path.sep) && !filePath.endsWith('Controller.php')) {
            return [];
        }

        const text = document.getText();
        const lines = text.split('\n');

        // Pattern to match: $this->layout = 'layoutName' or $this->layout = "layoutName"
        const layoutPattern = /\$this\s*->\s*layout\s*=\s*['"]([^'"]+)['"]/;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const match = line.match(layoutPattern);

            if (match) {
                const layoutName = match[1];
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(
                    lineIndex,
                    0,
                    lineIndex,
                    0
                );

                // Check if layout file exists
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                if (workspaceFolder) {
                    const workspaceRoot = workspaceFolder.uri.fsPath;
                    const layoutPath = this.resolveLayoutPath(document, layoutName, workspaceRoot);

                    if (layoutPath && this.fileRepository.existsSync(layoutPath)) {
                        const codeLens = new vscode.CodeLens(range, {
                            title: '$(file-code) Go to Layout',
                            command: 'yii1.goToLayout',
                            arguments: [document.uri, layoutName, position]
                        });

                        codeLenses.push(codeLens);
                    }
                }
            }
        }

        return codeLenses;
    }

    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }

    /**
     * Resolve layout file path
     */
    private resolveLayoutPath(
        document: vscode.TextDocument,
        layoutName: string,
        workspaceRoot: string
    ): string | null {
        const documentPath = document.uri.fsPath;
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


import * as vscode from 'vscode';
import * as path from 'path';
import { IFileRepository } from './domain/interfaces/IFileRepository';
import { IConfigurationService } from './domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from './domain/interfaces/IYiiProjectDetector';
import { ViewResolver } from './infrastructure/view-resolution/ViewResolver';

/**
 * Code lens provider for layout assignments
 * Shows "Go to Layout" lens above $this->layout = 'layoutName' or public $layout = 'layoutName' lines
 */
export class LayoutCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
    private viewResolver: ViewResolver;

    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService,
        private readonly projectDetector: IYiiProjectDetector
    ) {
        this.viewResolver = new ViewResolver(fileRepository, configService);
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        // Only work on PHP files
        if (document.languageId !== 'php') {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const filePath = document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

        if (!workspaceFolder) {
            return [];
        }

        // Check if it's a Yii project
        if (!this.projectDetector.isYiiProjectSync(workspaceFolder.uri.fsPath)) {
            return [];
        }

        // Only check controller files
        if (!this.projectDetector.isControllerFile(filePath, workspaceFolder.uri.fsPath)) {
            return [];
        }

        const text = document.getText();
        const lines = text.split('\n');

        // Pattern to match: $this->layout = 'layoutName' or public $layout = 'layoutName'
        const layoutPattern = /(?:\$this\s*->\s*layout|(?:public|protected|private)\s+\$layout)\s*=\s*['"]([^'"]+)['"]/;

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
                    const documentPath = document.uri.fsPath;
                    const moduleName = this.getModuleFromPath(documentPath, workspaceRoot);
                    
                    // Use ViewResolver to resolve layout path (matching Yii's getLayoutPath() logic)
                    const layoutPath = this.viewResolver.resolveLayoutFile(
                        layoutName,
                        workspaceRoot,
                        moduleName
                    );

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


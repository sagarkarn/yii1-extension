import * as vscode from 'vscode';
import * as path from 'path';

export class ControllerCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        // Only show code lens for view files (in views directory)
        const filePath = document.uri.fsPath;
        if (!filePath.includes(path.sep + 'views' + path.sep)) {
            return [];
        }

        // Create code lens at the top of the file
        const range = new vscode.Range(0, 0, 0, 0);
        const codeLens = new vscode.CodeLens(range, {
            title: '$(arrow-right) Go to Controller',
            command: 'yii1.goToController',
            arguments: [document.uri]
        });

        return [codeLens];
    }
}


import * as vscode from 'vscode';
import * as path from 'path';

export class ActionCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        // Only show code lens for controller files (in controllers directory)
        const filePath = document.uri.fsPath;
        if (!filePath.includes('controllers' + path.sep) && !filePath.endsWith('Controller.php')) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Pattern to find action methods: function actionIndex(), function actionView(), etc.
        const actionPattern = /function\s+(action\w+)\s*\(/g;
        let match;

        while ((match = actionPattern.exec(text)) !== null) {
            const actionName = match[1];
            const position = document.positionAt(match.index);
            
            // Create code lens above the action method (on the line before)
            const line = position.line;
            const range = new vscode.Range(
                Math.max(0, line),
                0,
                line,
                0
            );

            const codeLens = new vscode.CodeLens(range, {
                title: '$(file-code) Go to View',
                command: 'yii1.goToViewFromAction',
                arguments: [document.uri, actionName, position]
            });

            codeLenses.push(codeLens);
        }

        return codeLenses;
    }

    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }
}


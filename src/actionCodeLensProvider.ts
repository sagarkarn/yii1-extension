import * as vscode from 'vscode';
import * as path from 'path';
import { ActionViewLocator } from './actionViewLocator';

export class ActionCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
    private actionViewLocator: ActionViewLocator;

    constructor() {
        this.actionViewLocator = new ActionViewLocator();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        
        const filePath = document.uri.fsPath;
        if (!filePath.includes('controllers' + path.sep) && !filePath.endsWith('Controller.php')) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        
        const actionPattern = /function\s+(action\w+)\s*\(/g;
        let match;

        while ((match = actionPattern.exec(text)) !== null) {
            const actionName = match[1];
            const position = document.positionAt(match.index);
            
            // Check if this action has any views
            const views = await this.actionViewLocator.findViewsInAction(document, actionName, position);
            
            // Only create code lens if views are found
            if (views.length > 0) {
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
        }

        return codeLenses;
    }

    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }
}


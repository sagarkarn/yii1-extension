import * as vscode from 'vscode';
import * as path from 'path';
import { IViewLocator } from './domain/interfaces/IViewLocator';
import { IActionParser } from './domain/interfaces/IActionParser';
import { Action } from './domain/entities/Action';

export class ActionCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    constructor(
        private readonly viewLocator: IViewLocator,
        private readonly actionParser: IActionParser
    ) {}

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        
        const filePath = document.uri.fsPath;
        if (!filePath.includes('controllers' + path.sep) && !filePath.endsWith('Controller.php')) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        
        // Find all actions in the document
        const actions = await this.actionParser.findAllActions(document);

        for (const actionInfo of actions) {
            // Create Action entity
            const action = new Action(
                actionInfo.name,
                actionInfo.position,
                actionInfo.startOffset,
                actionInfo.endOffset,
                document
            );
            
            // Check if action has views
            const views = await this.viewLocator.findViewsInAction(action);
            
            // Only create code lens if views are found
            if (views.length > 0) {
                const line = actionInfo.position.line;
                const range = new vscode.Range(
                    Math.max(0, line),
                    0,
                    line,
                    0
                );

                const codeLens = new vscode.CodeLens(range, {
                    title: '$(file-code) Go to View',
                    command: 'yii1.goToViewFromAction',
                    arguments: [document.uri, actionInfo.name, actionInfo.position]
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


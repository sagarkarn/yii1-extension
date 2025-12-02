import * as vscode from 'vscode';
import * as fs from 'fs';
import { YiiViewDefinitionProvider } from './viewDefinitionProvider';
import { ControllerCodeLensProvider } from './controllerCodeLensProvider';
import { ControllerLocator } from './controllerLocator';
import { ActionDefinitionProvider } from './actionDefinitionProvider';
import { UrlDefinitionProvider } from './urlDefinitionProvider';
import { YiiImportProvider } from './yiiImportProvider';
import { YiiImportDiagnostics } from './yiiImportDiagnostics';

export function activate(context: vscode.ExtensionContext) {
    // Show output in the Output panel
    const outputChannel = vscode.window.createOutputChannel('Yii 1.1');
    outputChannel.appendLine('Yii 1.1 extension is now active!');
    outputChannel.show();
    
    // Also log to console (visible in Developer Tools)
    console.log('Yii 1.1 extension is now active!');
    
    // Show a notification
    vscode.window.showInformationMessage('Yii 1.1 Extension activated!');

    // Register "Go to View" definition provider
    const definitionProvider = new YiiViewDefinitionProvider();
    const definitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        definitionProvider
    );
    
    context.subscriptions.push(definitionDisposable);
    outputChannel.appendLine('Go to View feature registered!');

    // Register "Go to Action" definition provider for accessRules
    const actionDefinitionProvider = new ActionDefinitionProvider();
    const actionDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        actionDefinitionProvider
    );
    
    context.subscriptions.push(actionDefinitionDisposable);
    outputChannel.appendLine('Go to Action feature registered!');

    // Register "Go to Controller/Action" definition provider for createUrl/createAbsoluteUrl
    const urlDefinitionProvider = new UrlDefinitionProvider();
    const urlDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        urlDefinitionProvider
    );
    
    context.subscriptions.push(urlDefinitionDisposable);
    outputChannel.appendLine('Go to URL route feature registered!');

    // Register "Go to Controller" code lens provider
    const codeLensProvider = new ControllerCodeLensProvider();
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'php', scheme: 'file' },
        codeLensProvider
    );
    
    context.subscriptions.push(codeLensDisposable);
    outputChannel.appendLine('Go to Controller code lens registered!');

    // Register "Go to Controller" command
    const controllerLocator = new ControllerLocator();
    const goToControllerCommand = vscode.commands.registerCommand(
        'yii1.goToController',
        async (uri?: vscode.Uri) => {
            const activeEditor = vscode.window.activeTextEditor;
            const targetUri = uri || activeEditor?.document.uri;
            
            if (!targetUri) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            outputChannel.appendLine(`Finding controller for: ${targetUri.fsPath}`);
            
            const result = await controllerLocator.findControllerAndAction(targetUri);
            
            if (!result) {
                vscode.window.showErrorMessage('Controller not found for this view file');
                return;
            }

            if (!result.controllerPath || !fs.existsSync(result.controllerPath)) {
                vscode.window.showErrorMessage(`Controller file not found: ${result.controllerPath}`);
                return;
            }

            await controllerLocator.navigateToController(result.controllerPath, result.actionName);
            
            if (result.actionName) {
                outputChannel.appendLine(`Navigated to action: ${result.actionName}`);
            } else {
                outputChannel.appendLine('Controller opened, but action not found');
            }
        }
    );
    
    context.subscriptions.push(goToControllerCommand);
    outputChannel.appendLine('Go to Controller command registered!');

    // Register "Go to Import" definition provider for Yii::import()
    const importProvider = new YiiImportProvider();
    const importDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        importProvider
    );
    
    context.subscriptions.push(importDefinitionDisposable);
    outputChannel.appendLine('Go to Import feature registered!');

    // Register diagnostics for Yii::import()
    const importDiagnostics = new YiiImportDiagnostics();
    context.subscriptions.push(importDiagnostics.getDiagnosticCollection());
    
    // Update diagnostics when document changes
    const updateDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'php') {
            importDiagnostics.updateDiagnostics(document);
        }
    };

    // Update diagnostics for all open documents
    vscode.workspace.textDocuments.forEach(updateDiagnostics);
    
    // Update diagnostics on document change
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
        updateDiagnostics(e.document);
    });
    
    // Update diagnostics when new documents are opened
    const openDocumentSubscription = vscode.workspace.onDidOpenTextDocument(updateDiagnostics);
    
    context.subscriptions.push(changeDocumentSubscription, openDocumentSubscription);
    outputChannel.appendLine('Yii::import() diagnostics registered!');
}

export function deactivate() {
    // Cleanup if needed
}


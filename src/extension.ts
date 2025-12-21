import * as vscode from 'vscode';
import * as fs from 'fs';
import { YiiViewDefinitionProvider } from './viewDefinitionProvider';
import { ControllerCodeLensProvider } from './controllerCodeLensProvider';
import { ControllerLocator } from './controllerLocator';
import { ActionDefinitionProvider } from './actionDefinitionProvider';
import { UrlDefinitionProvider } from './urlDefinitionProvider';
import { YiiImportProvider } from './yiiImportProvider';
import { YiiImportDiagnostics } from './yiiImportDiagnostics';
import { YiiImportCompletionProvider } from './yiiImportCompletionProvider';
import { ValidationDiagnostics } from './validation/validationDiagnostics';
import { ValidationCompletionProvider } from './validation/validationCompletionProvider';
import { ValidationHoverProvider } from './validation/validationHoverProvider';
import { ValidationDefinitionProvider } from './validation/validationDefinitionProvider';
import { ValidationCodeActions } from './validation/validationCodeActions';

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

    // Register autocomplete for Yii::import()
    const importCompletionProvider = new YiiImportCompletionProvider();
    const importCompletionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'php', scheme: 'file' },
        importCompletionProvider,
        '.', // Trigger on dot
        "'", // Trigger on single quote
        '"'  // Trigger on double quote
    );
    
    context.subscriptions.push(importCompletionDisposable);
    outputChannel.appendLine('Yii::import() autocomplete registered!');

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

    // Register validation rule diagnostics
    const validationDiagnostics = new ValidationDiagnostics();
    context.subscriptions.push(validationDiagnostics.getDiagnosticCollection());
    
    // Update validation diagnostics when document changes
    const updateValidationDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'php') {
            validationDiagnostics.updateDiagnostics(document);
        }
    };

    // Update validation diagnostics for all open documents
    vscode.workspace.textDocuments.forEach(updateValidationDiagnostics);
    
    // Update validation diagnostics on document change
    const changeValidationDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
        updateValidationDiagnostics(e.document);
    });
    
    // Update validation diagnostics when new documents are opened
    const openValidationDocumentSubscription = vscode.workspace.onDidOpenTextDocument(updateValidationDiagnostics);
    
    context.subscriptions.push(changeValidationDocumentSubscription, openValidationDocumentSubscription);
    outputChannel.appendLine('Validation rule diagnostics registered!');

    // Register validation rule autocomplete
    const validationCompletionProvider = new ValidationCompletionProvider();
    const validationCompletionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'php', scheme: 'file' },
        validationCompletionProvider,
        "'", // Trigger on single quote
        '"'  // Trigger on double quote
    );
    
    context.subscriptions.push(validationCompletionDisposable);
    outputChannel.appendLine('Validation rule autocomplete registered!');

    // Register validation rule hover provider
    const validationHoverProvider = new ValidationHoverProvider();
    const validationHoverDisposable = vscode.languages.registerHoverProvider(
        { language: 'php', scheme: 'file' },
        validationHoverProvider
    );
    
    context.subscriptions.push(validationHoverDisposable);
    outputChannel.appendLine('Validation rule hover provider registered!');

    // Register validation rule definition provider
    const validationDefinitionProvider = new ValidationDefinitionProvider();
    const validationDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        validationDefinitionProvider
    );
    
    context.subscriptions.push(validationDefinitionDisposable);
    outputChannel.appendLine('Validation rule definition provider registered!');

    // Register validation rule code actions
    const validationCodeActions = new ValidationCodeActions();
    const validationCodeActionsDisposable = vscode.languages.registerCodeActionsProvider(
        { language: 'php', scheme: 'file' },
        validationCodeActions,
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }
    );
    
    context.subscriptions.push(validationCodeActionsDisposable);
    outputChannel.appendLine('Validation rule code actions registered!');
}

export function deactivate() {
    // Cleanup if needed
}


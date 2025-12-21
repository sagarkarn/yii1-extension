import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
import { ActionCodeLensProvider } from './actionCodeLensProvider';
import { Container } from './infrastructure/di/Container';
import { ServiceRegistry } from './infrastructure/di/ServiceRegistry';
import { SERVICE_KEYS } from './infrastructure/di/Container';
import { FindViewsInActionUseCase } from './application/use-cases/FindViewsInActionUseCase';
import { FindControllerFromViewUseCase } from './application/use-cases/FindControllerFromViewUseCase';
import { IViewLocator } from './domain/interfaces/IViewLocator';
import { IActionParser } from './domain/interfaces/IActionParser';
import { IControllerLocator } from './domain/interfaces/IControllerLocator';
import { ILogger } from './domain/interfaces/ILogger';

export function activate(context: vscode.ExtensionContext) {
    // Initialize Dependency Injection Container
    const container = new Container();
    ServiceRegistry.registerServices(container);
    
    // Get logger from container
    const logger = container.resolve<ILogger>(SERVICE_KEYS.Logger);
    logger.info('Yii 1.1 extension is now active!');
    
    // Also log to console (visible in Developer Tools)
    console.log('Yii 1.1 extension is now active!');
    
    // Show a notification
    logger.showInfo('Yii 1.1 Extension activated!');

    // Register "Go to View" definition provider
    const definitionProvider = new YiiViewDefinitionProvider();
    const definitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        definitionProvider
    );
    
    context.subscriptions.push(definitionDisposable);
    logger.info('Go to View feature registered!');

    // Register "Go to Action" definition provider for accessRules
    const actionDefinitionProvider = new ActionDefinitionProvider();
    const actionDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        actionDefinitionProvider
    );
    
    context.subscriptions.push(actionDefinitionDisposable);
    logger.info('Go to Action feature registered!');

    // Register "Go to Controller/Action" definition provider for createUrl/createAbsoluteUrl
    const urlDefinitionProvider = new UrlDefinitionProvider();
    const urlDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        urlDefinitionProvider
    );
    
    context.subscriptions.push(urlDefinitionDisposable);
    logger.info('Go to URL route feature registered!');

    // Register "Go to Controller" code lens provider
    const codeLensProvider = new ControllerCodeLensProvider();
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'php', scheme: 'file' },
        codeLensProvider
    );
    
    context.subscriptions.push(codeLensDisposable);
    logger.info('Go to Controller code lens registered!');

    // Register "Go to Controller" command
    const findControllerUseCase = container.resolve<FindControllerFromViewUseCase>(SERVICE_KEYS.FindControllerUseCase);
    const controllerLocator = container.resolve<IControllerLocator>(SERVICE_KEYS.ControllerLocator);
    const goToControllerCommand = vscode.commands.registerCommand(
        'yii1.goToController',
        async (uri?: vscode.Uri) => {
            const activeEditor = vscode.window.activeTextEditor;
            const targetUri = uri || activeEditor?.document.uri;
            
            if (!targetUri) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            logger.info(`Finding controller for: ${targetUri.fsPath}`);
            
            // Execute use case
            const result = await findControllerUseCase.execute({ viewUri: targetUri });
            
            if (result.isFailure) {
                logger.showError(result.errorMessage);
                return;
            }

            const controllerInfo = result.value;
            
            if (!controllerInfo.controllerPath || !fs.existsSync(controllerInfo.controllerPath)) {
                logger.showError(`Controller file not found: ${controllerInfo.controllerPath}`);
                return;
            }

            await controllerLocator.navigateToController(controllerInfo.controllerPath, controllerInfo.actionName);
            
            if (controllerInfo.actionName) {
                logger.info(`Navigated to action: ${controllerInfo.actionName}`);
            } else {
                logger.info('Controller opened, but action not found');
            }
        }
    );
    
    context.subscriptions.push(goToControllerCommand);
    logger.info('Go to Controller command registered!');

    // Register "Go to Import" definition provider for Yii::import()
    const importProvider = new YiiImportProvider();
    const importDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        importProvider
    );
    
    context.subscriptions.push(importDefinitionDisposable);
    logger.info('Go to Import feature registered!');

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
    logger.info('Yii::import() autocomplete registered!');

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
    logger.info('Yii::import() diagnostics registered!');

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
    logger.info('Validation rule diagnostics registered!');

    // Register validation rule autocomplete
    const validationCompletionProvider = new ValidationCompletionProvider();
    const validationCompletionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'php', scheme: 'file' },
        validationCompletionProvider,
        "'", // Trigger on single quote
        '"'  // Trigger on double quote
    );
    
    context.subscriptions.push(validationCompletionDisposable);
    logger.info('Validation rule autocomplete registered!');

    // Register validation rule hover provider
    const validationHoverProvider = new ValidationHoverProvider();
    const validationHoverDisposable = vscode.languages.registerHoverProvider(
        { language: 'php', scheme: 'file' },
        validationHoverProvider
    );
    
    context.subscriptions.push(validationHoverDisposable);
    logger.info('Validation rule hover provider registered!');

    // Register validation rule definition provider
    const validationDefinitionProvider = new ValidationDefinitionProvider();
    const validationDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        validationDefinitionProvider
    );
    
    context.subscriptions.push(validationDefinitionDisposable);
    logger.info('Validation rule definition provider registered!');

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
    logger.info('Validation rule code actions registered!');

    // Register "Go to View from Action" code lens provider
    const viewLocator = container.resolve<IViewLocator>(SERVICE_KEYS.ViewLocator);
    const actionParser = container.resolve<IActionParser>(SERVICE_KEYS.ActionParser);
    const actionCodeLensProvider = new ActionCodeLensProvider(viewLocator, actionParser);
    const actionCodeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'php', scheme: 'file' },
        actionCodeLensProvider
    );
    
    context.subscriptions.push(actionCodeLensDisposable);
    logger.info('Go to View from Action code lens registered!');

    // Register "Go to View from Action" command
    const findViewsUseCase = container.resolve<FindViewsInActionUseCase>(SERVICE_KEYS.FindViewsUseCase);
    const goToViewFromActionCommand = vscode.commands.registerCommand(
        'yii1.goToViewFromAction',
        async (uri?: vscode.Uri, actionName?: string, actionPosition?: vscode.Position) => {
            try {
                const activeEditor = vscode.window.activeTextEditor;
                const targetUri = uri || activeEditor?.document.uri;
                
                if (!targetUri) {
                    vscode.window.showErrorMessage('No file selected');
                    return;
                }

                const document = await vscode.workspace.openTextDocument(targetUri);
                
                // Execute use case
                const result = await findViewsUseCase.execute({
                    document,
                    actionName,
                    actionPosition,
                    position: activeEditor?.selection.active
                });
                
                if (result.isFailure) {
                    logger.showInfo(result.errorMessage);
                    return;
                }

                const response = result.value;

                if (response.views.length === 0) {
                    logger.showInfo(`No views found in action ${response.actionName}`);
                    return;
                }

                if (response.views.length === 1) {
                    // Navigate directly if only one view
                    const view = response.views[0];
                    const viewUri = vscode.Uri.file(view.getFullPath());
                    const viewDocument = await vscode.workspace.openTextDocument(viewUri);
                    await vscode.window.showTextDocument(viewDocument);
                    logger.info(`Navigated to view: ${view.getFullPath()}`);
                } else {
                    // Show picker if multiple views
                    const items = response.views.map(view => {
                        const relativePath = path.relative(
                            vscode.workspace.getWorkspaceFolder(targetUri)?.uri.fsPath || '',
                            view.getFullPath()
                        );
                        return {
                            label: view.getNameString(),
                            description: relativePath,
                            detail: view.isPartial() ? 'Partial' : 'View',
                            viewPath: view.getFullPath()
                        };
                    });

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: `Select a view to navigate to (${response.views.length} views found)`
                    });

                    if (selected) {
                        const viewUri = vscode.Uri.file(selected.viewPath);
                        const viewDocument = await vscode.workspace.openTextDocument(viewUri);
                        await vscode.window.showTextDocument(viewDocument);
                        logger.info(`Navigated to view: ${selected.viewPath}`);
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.showError(`Failed to navigate to view: ${errorMessage}`);
            }
        }
    );
    
    context.subscriptions.push(goToViewFromActionCommand);
    logger.info('Go to View from Action command registered!');
}

export function deactivate() {
    // Cleanup if needed
}


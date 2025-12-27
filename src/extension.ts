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
import { ViewPathDiagnostics } from './validation/viewPathDiagnostics';
import { ViewCompletionProvider } from './validation/viewCompletionProvider';
import { ActionArrayDiagnostics } from './validation/actionArrayDiagnostics';
import { LayoutDefinitionProvider } from './layoutDefinitionProvider';
import { LayoutCodeLensProvider } from './layoutCodeLensProvider';
import { ActionCodeLensProvider } from './actionCodeLensProvider';
import { BehaviorCompletionProvider } from './validation/behaviorCompletionProvider';
import { BehaviorDefinitionProvider } from './validation/behaviorDefinitionProvider';
import { BehaviorDiagnostics } from './validation/behaviorDiagnostics';
import { Container } from './infrastructure/di/Container';
import { ServiceRegistry } from './infrastructure/di/ServiceRegistry';
import { SERVICE_KEYS } from './infrastructure/di/Container';
import { FindViewsInActionUseCase } from './application/use-cases/FindViewsInActionUseCase';
import { FindControllerFromViewUseCase } from './application/use-cases/FindControllerFromViewUseCase';
import { IViewLocator } from './domain/interfaces/IViewLocator';
import { IActionParser } from './domain/interfaces/IActionParser';
import { IControllerLocator } from './domain/interfaces/IControllerLocator';
import { ILogger } from './domain/interfaces/ILogger';
import { IFileRepository } from './domain/interfaces/IFileRepository';
import { IPathResolver } from './domain/interfaces/IPathResolver';
import { IConfigurationService } from './domain/interfaces/IConfigurationService';
import { IYiiProjectDetector } from './domain/interfaces/IYiiProjectDetector';
import { ICache } from './domain/interfaces/ICache';
import { Class } from './domain/entities/Calss';
import { ClassLocator } from './infrastructure/class-location/ClassLocator';

export function activate(context: vscode.ExtensionContext) {
    // Initialize Dependency Injection Container
    const container = new Container();
    ServiceRegistry.registerServices(container);
    
    // Get logger and services from container
    const logger = container.resolve<ILogger>(SERVICE_KEYS.Logger);
    const configService = container.resolve<IConfigurationService>(SERVICE_KEYS.ConfigurationService);
    const projectDetector = container.resolve<IYiiProjectDetector>(SERVICE_KEYS.YiiProjectDetector);
    
    logger.info('Yii 1.1 extension is now active!');
    
    // Check if extension is enabled
    if (!configService.isEnabled()) {
        logger.info('Extension is disabled in settings');
        return;
    }

    // Create status bar item for Yii project detection
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = undefined;
    statusBarItem.tooltip = 'Yii Project';
    context.subscriptions.push(statusBarItem);

    // Function to update status bar
    const updateStatusBar = async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            statusBarItem.hide();
            return;
        }

        // Check if at least one workspace is a Yii project
        let yiiWorkspace: vscode.WorkspaceFolder | null = null;
        for (const folder of workspaceFolders) {
            if (projectDetector.isYiiProjectSync(folder.uri.fsPath)) {
                yiiWorkspace = folder;
                break;
            }
        }

        if (yiiWorkspace) {
            // Count controllers, models, and actions
            const controllerCount = await projectDetector.countControllers(yiiWorkspace.uri.fsPath);
            const modelCount = await projectDetector.countModels(yiiWorkspace.uri.fsPath);
            // const actionCount = await projectDetector.countActions(yiiWorkspace.uri.fsPath);
            
            statusBarItem.text = `$(check) Yii`;
            statusBarItem.tooltip = `Yii Project\nControllers: ${controllerCount} | Models: ${modelCount}`;
            statusBarItem.show();
            logger.info(`Yii project detected in: ${yiiWorkspace.uri.fsPath} (${controllerCount} controllers, ${modelCount} models)`);
        } else {
            statusBarItem.hide();
            logger.info('No Yii 1.1 project detected in workspace. Extension features will be limited.');
        }
    };

    // Initial update
    updateStatusBar();

    // Update when workspace folders change
    const workspaceChangeSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        updateStatusBar();
    });
    context.subscriptions.push(workspaceChangeSubscription);

    // Update when files are created/deleted (debounced to avoid too many updates)
    let updateTimeout: NodeJS.Timeout | null = null;
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.php');
    fileWatcher.onDidCreate(() => {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => updateStatusBar(), 1000);
    });
    fileWatcher.onDidDelete(() => {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => updateStatusBar(), 1000);
    });
    context.subscriptions.push(fileWatcher);

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

    // Register view path diagnostics
    const viewPathViewLocator = container.resolve<IViewLocator>(SERVICE_KEYS.ViewLocator);
    const viewPathActionParser = container.resolve<IActionParser>(SERVICE_KEYS.ActionParser);
    const viewPathFileRepository = container.resolve<IFileRepository>(SERVICE_KEYS.FileRepository);
    const viewPathPathResolver = container.resolve<IPathResolver>(SERVICE_KEYS.PathResolver);
    const viewPathConfigService = container.resolve<IConfigurationService>(SERVICE_KEYS.ConfigurationService);
    
    const viewPathDiagnostics = new ViewPathDiagnostics(
        viewPathViewLocator,
        viewPathActionParser,
        viewPathFileRepository,
        viewPathPathResolver,
        viewPathConfigService,
        projectDetector
    );
    context.subscriptions.push(viewPathDiagnostics.getDiagnosticCollection());
    
    // Update view path diagnostics when document changes
    const updateViewPathDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'php') {
            viewPathDiagnostics.updateDiagnostics(document);
        }
    };

    // Update view path diagnostics for all open documents
    vscode.workspace.textDocuments.forEach(updateViewPathDiagnostics);
    
    // Update view path diagnostics on document change
    const changeViewPathDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
        updateViewPathDiagnostics(e.document);
    });
    
    // Update view path diagnostics when new documents are opened
    const openViewPathDocumentSubscription = vscode.workspace.onDidOpenTextDocument(updateViewPathDiagnostics);
    
    context.subscriptions.push(changeViewPathDocumentSubscription, openViewPathDocumentSubscription);
    logger.info('View path diagnostics registered!');

    // Register action array diagnostics
    const actionArrayDiagnostics = new ActionArrayDiagnostics(
        viewPathActionParser,
        viewPathConfigService,
        projectDetector
    );
    context.subscriptions.push(actionArrayDiagnostics.getDiagnosticCollection());
    
    // Update action array diagnostics when document changes
    const updateActionArrayDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'php') {
            actionArrayDiagnostics.updateDiagnostics(document);
        }
    };

    // Update action array diagnostics for all open documents
    vscode.workspace.textDocuments.forEach(updateActionArrayDiagnostics);
    
    // Update action array diagnostics on document change
    const changeActionArrayDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
        updateActionArrayDiagnostics(e.document);
    });
    
    // Update action array diagnostics when new documents are opened
    const openActionArrayDocumentSubscription = vscode.workspace.onDidOpenTextDocument(updateActionArrayDiagnostics);
    
    context.subscriptions.push(changeActionArrayDocumentSubscription, openActionArrayDocumentSubscription);
    logger.info('Action array diagnostics registered!');

    // Register view completion provider
    const viewCache = container.resolve<ICache<string[]>>(SERVICE_KEYS.ViewCache);
    const viewCompletionProvider = new ViewCompletionProvider(
        viewPathFileRepository,
        viewPathPathResolver,
        viewPathConfigService,
        viewCache
    );
    const viewCompletionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'php', scheme: 'file' },
        viewCompletionProvider,
        '.', // Trigger on dot (for dot notation paths)
        "'", // Trigger on single quote
        '"', // Trigger on double quote
        '/'  // Trigger on slash (for absolute paths)
    );
    
    context.subscriptions.push(viewCompletionDisposable);
    // Also dispose the provider itself to clean up file watcher
    context.subscriptions.push({ dispose: () => viewCompletionProvider.dispose() });
    logger.info('View completion provider registered!');

    // Register layout definition provider
    const layoutDefinitionProvider = new LayoutDefinitionProvider(
        viewPathFileRepository,
        viewPathConfigService,
        projectDetector
    );
    const layoutDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        layoutDefinitionProvider
    );
    
    context.subscriptions.push(layoutDefinitionDisposable);
    logger.info('Layout definition provider registered!');

    // Register layout code lens provider
    const layoutCodeLensProvider = new LayoutCodeLensProvider(
        viewPathFileRepository,
        viewPathConfigService,
        projectDetector
    );
    const layoutCodeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'php', scheme: 'file' },
        layoutCodeLensProvider
    );
    
    context.subscriptions.push(layoutCodeLensDisposable);
    logger.info('Layout code lens provider registered!');

    // Register "Go to Layout" command
    const goToLayoutCommand = vscode.commands.registerCommand(
        'yii1.goToLayout',
        async (uri?: vscode.Uri, layoutName?: string, position?: vscode.Position) => {
            try {
                const activeEditor = vscode.window.activeTextEditor;
                const targetUri = uri || activeEditor?.document.uri;

                if (!targetUri) {
                    logger.showError('No file selected');
                    return;
                }

                if (!layoutName) {
                    logger.showError('Layout name not provided');
                    return;
                }

                const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
                if (!workspaceFolder) {
                    logger.showError('Workspace folder not found');
                    return;
                }

                const workspaceRoot = workspaceFolder.uri.fsPath;
                const document = await vscode.workspace.openTextDocument(targetUri);

                // Resolve layout path
                let layoutPath: string | null = null;

                // If layout starts with //, it's an absolute path (main app, not module)
                if (layoutName.startsWith('//')) {
                    // Remove // prefix and resolve to main app views directory
                    const relativePath = layoutName.substring(2); // Remove '//'
                    const viewsDir = viewPathConfigService.getViewsDirectory(workspaceRoot);
                    layoutPath = path.join(viewsDir, relativePath + '.php');
                } else {
                    const moduleName = getModuleFromPath(targetUri.fsPath, workspaceRoot);

                    if (moduleName) {
                        const moduleViewsDir = viewPathConfigService.getViewsDirectory(workspaceRoot, moduleName);
                        layoutPath = path.join(moduleViewsDir, 'layouts', `${layoutName}.php`);
                        
                        if (!viewPathFileRepository.existsSync(layoutPath)) {
                            // Fallback to main app layout
                            const viewsDir = viewPathConfigService.getViewsDirectory(workspaceRoot);
                            layoutPath = path.join(viewsDir, 'layouts', `${layoutName}.php`);
                        }
                    } else {
                        const viewsDir = viewPathConfigService.getViewsDirectory(workspaceRoot);
                        layoutPath = path.join(viewsDir, 'layouts', `${layoutName}.php`);
                    }
                }

                if (!layoutPath || !viewPathFileRepository.existsSync(layoutPath)) {
                    logger.showError(`Layout file not found: ${layoutPath || layoutName}`);
                    return;
                }

                // Navigate to layout file
                const layoutUri = vscode.Uri.file(layoutPath);
                const layoutDocument = await vscode.workspace.openTextDocument(layoutUri);
                await vscode.window.showTextDocument(layoutDocument);

                logger.info(`Navigated to layout: ${layoutPath}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.showError(`Failed to navigate to layout: ${errorMessage}`);
            }
        }
    );

    context.subscriptions.push(goToLayoutCommand);
    logger.info('Go to Layout command registered!');

    // Helper function for module detection
    function getModuleFromPath(filePath: string, workspaceRoot: string): string | null {
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        const modulesPath = viewPathConfigService.getModulesPath();
        const modulesIndex = pathParts.indexOf(modulesPath);
        
        if (modulesIndex !== -1 && modulesIndex < pathParts.length - 1) {
            return pathParts[modulesIndex + 1];
        }
        
        return null;
    }

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
    const actionCodeLensProvider = new ActionCodeLensProvider(viewLocator, actionParser, projectDetector);
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

    // Register behavior completion provider
    const behaviorCache = container.resolve<ICache<string[]>>(SERVICE_KEYS.BehaviorCache);
    const classCache = container.resolve<ICache<Class>>(SERVICE_KEYS.ClassCache);
    const classLocator = container.resolve<ClassLocator>(SERVICE_KEYS.ClassLocator);
    const behaviorCompletionProvider = new BehaviorCompletionProvider(
        viewPathFileRepository,
        viewPathConfigService,
        behaviorCache,
        classCache,
        classLocator
    );
    const behaviorCompletionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'php', scheme: 'file' },
        behaviorCompletionProvider,
        '.', // Trigger on dot (for dot notation paths)
        "'", // Trigger on single quote
        '"'  // Trigger on double quote
    );
    context.subscriptions.push(behaviorCompletionDisposable);
    logger.info('Behavior completion provider registered!');

    // Register behavior definition provider
    const behaviorDefinitionProvider = new BehaviorDefinitionProvider(
        viewPathFileRepository,
        viewPathConfigService
    );
    const behaviorDefinitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        behaviorDefinitionProvider
    );
    const behaviorCodeActionDisposable = vscode.languages.registerCodeActionsProvider(
        { language: 'php', scheme: 'file' },
        behaviorDefinitionProvider
    );
    context.subscriptions.push(behaviorDefinitionDisposable, behaviorCodeActionDisposable);
    logger.info('Behavior definition provider registered!');

    // Register behavior diagnostics
    const behaviorDiagnostics = new BehaviorDiagnostics(
        viewPathFileRepository,
        viewPathConfigService,
        projectDetector,
        behaviorCache
    );
    context.subscriptions.push(behaviorDiagnostics.getDiagnosticCollection());
    
    const updateBehaviorDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'php') {
            behaviorDiagnostics.updateDiagnostics(document);
        }
    };

    vscode.workspace.textDocuments.forEach(updateBehaviorDiagnostics);
    
    const changeBehaviorDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
        updateBehaviorDiagnostics(e.document);
    });
    
    const openBehaviorDocumentSubscription = vscode.workspace.onDidOpenTextDocument(updateBehaviorDiagnostics);
    
    context.subscriptions.push(changeBehaviorDocumentSubscription, openBehaviorDocumentSubscription);
    logger.info('Behavior diagnostics registered!');

    // Register "Create Behavior File" command
    const createBehaviorFileCommand = vscode.commands.registerCommand(
        'yii1.createBehaviorFile',
        async (behaviorPath: string, className: string) => {
            try {
                if (!behaviorPath) {
                    logger.showError('Behavior file path not provided');
                    return;
                }

                // Check if file already exists
                if (viewPathFileRepository.existsSync(behaviorPath)) {
                    logger.showInfo(`Behavior file already exists: ${behaviorPath}`);
                    const document = await vscode.workspace.openTextDocument(behaviorPath);
                    await vscode.window.showTextDocument(document);
                    return;
                }

                // Create directory if it doesn't exist
                const dirPath = path.dirname(behaviorPath);
                if (!viewPathFileRepository.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }

                // Create behavior file with template
                // Based on Yii 1.1 documentation: https://www.yiiframework.com/wiki/30/how-to-add-a-named-scope-to-activerecords-with-a-behavior
                const behaviorTemplate = `<?php

/**
 * ${className} behavior
 * 
 * This behavior extends CActiveRecordBehavior to add functionality to ActiveRecord models.
 * Access the owner ActiveRecord instance using \\$this->Owner
 * 
 * Example usage in model:
 * public function behaviors()
 * {
 *     return array(
 *         '${className}' => array('class' => '${className}')
 *     );
 * }
 */
class ${className} extends CActiveRecordBehavior
{
    /**
     * Attach the behavior to the ActiveRecord
     * Called when behavior is attached to the model
     */
    public function attach(\\$owner)
    {
        parent::attach(\\$owner);
        // Initialization code here
    }

    /**
     * Detach the behavior from the ActiveRecord
     * Called when behavior is detached from the model
     */
    public function detach(\\$owner)
    {
        // Cleanup code here
        parent::detach(\\$owner);
    }

    /**
     * Example method that can be called on the model
     * Access the owner ActiveRecord using \\$this->Owner
     * 
     * @return CActiveRecord The owner ActiveRecord instance for method chaining
     */
    public function exampleMethod()
    {
        // Example: Add criteria to the owner
        // \\$this->Owner->getDbCriteria()->mergeWith(array(
        //     'condition' => 'someCondition',
        //     'params' => array()
        // ));
        
        return \\$this->Owner;
    }
}
`;

                fs.writeFileSync(behaviorPath, behaviorTemplate, 'utf8');

                // Open the newly created file
                const document = await vscode.workspace.openTextDocument(behaviorPath);
                await vscode.window.showTextDocument(document);

                logger.info(`Created behavior file: ${behaviorPath}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.showError(`Failed to create behavior file: ${errorMessage}`);
            }
        }
    );

    context.subscriptions.push(createBehaviorFileCommand);
    logger.info('Create Behavior File command registered!');
}

export function deactivate() {
    // Cleanup if needed
}


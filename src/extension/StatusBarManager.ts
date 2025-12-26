import * as vscode from 'vscode';
import { IYiiProjectDetector } from '../domain/interfaces/IYiiProjectDetector';
import { ILogger } from '../domain/interfaces/ILogger';

/**
 * Manages the Yii project status bar item
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private updateTimeout: NodeJS.Timeout | null = null;
    private fileWatcher: vscode.FileSystemWatcher;

    constructor(
        private readonly projectDetector: IYiiProjectDetector,
        private readonly logger: ILogger
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = undefined;
        this.statusBarItem.tooltip = 'Yii Project';
        
        // Setup file watcher
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.php');
        this.fileWatcher.onDidCreate(() => this.debouncedUpdate());
        this.fileWatcher.onDidDelete(() => this.debouncedUpdate());
    }

    /**
     * Initialize and show status bar
     */
    public async initialize(): Promise<void> {
        await this.update();
        
        // Update when workspace folders change
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.update();
        });
    }

    /**
     * Update status bar with current project stats
     */
    public async update(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.statusBarItem.hide();
            return;
        }

        // Check if at least one workspace is a Yii project
        let yiiWorkspace: vscode.WorkspaceFolder | null = null;
        for (const folder of workspaceFolders) {
            if (this.projectDetector.isYiiProjectSync(folder.uri.fsPath)) {
                yiiWorkspace = folder;
                break;
            }
        }

        if (yiiWorkspace) {
            // Count controllers, models, and actions
            const controllerCount = await this.projectDetector.countControllers(yiiWorkspace.uri.fsPath);
            const modelCount = await this.projectDetector.countModels(yiiWorkspace.uri.fsPath);
            
            this.statusBarItem.text = `$(check) Yii`;
            this.statusBarItem.tooltip = `Yii Project\nControllers: ${controllerCount} | Models: ${modelCount}`;
            this.statusBarItem.show();
            this.logger.info(`Yii project detected in: ${yiiWorkspace.uri.fsPath} (${controllerCount} controllers, ${modelCount} models)`);
        } else {
            this.statusBarItem.hide();
            this.logger.info('No Yii 1.1 project detected in workspace. Extension features will be limited.');
        }
    }

    /**
     * Debounced update to avoid too many updates
     */
    private debouncedUpdate(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => this.update(), 1000);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.statusBarItem.dispose();
        this.fileWatcher.dispose();
    }
}


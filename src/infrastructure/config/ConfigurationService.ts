import * as vscode from 'vscode';
import * as path from 'path';
import { IConfigurationService } from '../../domain/interfaces/IConfigurationService';

/**
 * Configuration service implementation
 * Reads configuration from VS Code settings
 */
export class ConfigurationService implements IConfigurationService {
    private readonly config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('yii1');
    }

    getProtectedPath(): string {
        return this.config.get<string>('paths.protected', 'protected');
    }

    getViewsPath(): string {
        return this.config.get<string>('paths.views', 'views');
    }

    getControllersPath(): string {
        return this.config.get<string>('paths.controllers', 'controllers');
    }

    getModulesPath(): string {
        return this.config.get<string>('paths.modules', 'modules');
    }

    getViewsDirectory(workspaceRoot: string, moduleName?: string): string {
        const protectedPath = this.getProtectedPath();
        const viewsPath = this.getViewsPath();

        if (moduleName) {
            const modulesPath = this.getModulesPath();
            return path.join(workspaceRoot, protectedPath, modulesPath, moduleName, viewsPath);
        }

        return path.join(workspaceRoot, protectedPath, viewsPath);
    }

    getControllersDirectory(workspaceRoot: string, moduleName?: string): string {
        const protectedPath = this.getProtectedPath();
        const controllersPath = this.getControllersPath();

        if (moduleName) {
            const modulesPath = this.getModulesPath();
            return path.join(workspaceRoot, protectedPath, modulesPath, moduleName, controllersPath);
        }

        return path.join(workspaceRoot, protectedPath, controllersPath);
    }

    isEnabled(): boolean {
        return this.config.get<boolean>('enable', true);
    }
}


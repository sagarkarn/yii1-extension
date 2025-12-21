/**
 * Configuration service interface
 * Provides access to extension configuration
 */
export interface IConfigurationService {
    /**
     * Get the protected directory path (default: 'protected')
     */
    getProtectedPath(): string;

    /**
     * Get the views directory name (default: 'views')
     */
    getViewsPath(): string;

    /**
     * Get the controllers directory name (default: 'controllers')
     */
    getControllersPath(): string;

    /**
     * Get the modules directory name (default: 'modules')
     */
    getModulesPath(): string;

    /**
     * Get full path to views directory
     */
    getViewsDirectory(workspaceRoot: string, moduleName?: string): string;

    /**
     * Get full path to controllers directory
     */
    getControllersDirectory(workspaceRoot: string, moduleName?: string): string;

    /**
     * Check if extension features are enabled
     */
    isEnabled(): boolean;
}


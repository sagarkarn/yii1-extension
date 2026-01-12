import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../../domain/interfaces/IConfigurationService';

/**
 * View resolver that matches Yii 1.1's resolveViewFile() method logic
 * Based on: CController::resolveViewFile()
 */
export class ViewResolver {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {}

    /**
     * Resolve view file path matching Yii's resolveViewFile() logic
     * 
     * @param viewName - The view name (e.g., 'index', '/layouts/main', '//layouts/main', 'application.views.layouts.main')
     * @param viewPath - Base view path (controller's view directory)
     * @param basePath - Base path (main app views directory)
     * @param moduleViewPath - Module view path (null if not in module, otherwise module views directory)
     * @param workspaceRoot - Workspace root directory
     * @param isPartial - Whether this is a partial view
     * @returns Resolved file path or null if not found
     */
    resolveViewFile(
        viewName: string,
        viewPath: string,
        basePath: string,
        moduleViewPath: string | null,
        workspaceRoot: string,
        isPartial: boolean = false
    ): string | null {
        if (!viewName || viewName.length === 0) {
            return null;
        }

        // Default moduleViewPath to basePath if not provided
        if (moduleViewPath === null) {
            moduleViewPath = basePath;
        }

        // Get view renderer extension (default to .php)
        // In Yii: if(($renderer=Yii::app()->getViewRenderer())!==null) $extension=$renderer->fileExtension; else $extension='.php';
        const extension = '.php'; // For now, we'll default to .php (can be enhanced later)

        let viewFile: string | null = null;

        // Handle paths starting with '/'
        if (viewName[0] === '/') {
            // Double slash // - absolute from main app (not module)
            if (viewName.length >= 2 && viewName.substring(0, 2) === '//') {
                // $viewFile = $basePath . $viewName
                // viewName already includes //, so we append it to basePath
                viewFile = basePath + viewName;
            } else {
                // Single slash / - module view path (or basePath if not in module)
                // $viewFile = $moduleViewPath . $viewName
                viewFile = moduleViewPath + viewName;
            }
        } 
        // Handle dot notation (e.g., application.views.layouts.main)
        else if (viewName.includes('.')) {
            // $viewFile = Yii::getPathOfAlias($viewName)
            viewFile = this.resolveAliasPath(viewName, workspaceRoot);
        } 
        // Relative path (e.g., 'index' or '../layouts/main')
        else {
            // $viewFile = $viewPath . DIRECTORY_SEPARATOR . $viewName
            viewFile = path.join(viewPath, viewName);
        }

        if (!viewFile) {
            return null;
        }

        // Normalize path separators
        viewFile = viewFile.replace(/\//g, path.sep);

        // Check for file with extension
        // if(is_file($viewFile.$extension))
        if (this.fileRepository.existsSync(viewFile + extension)) {
            return viewFile + extension;
        }
        // elseif($extension!=='.php' && is_file($viewFile.'.php'))
        else if (extension !== '.php' && this.fileRepository.existsSync(viewFile + '.php')) {
            return viewFile + '.php';
        }

        // For partials, also check with/without underscore
        if (isPartial) {
            const dir = path.dirname(viewFile);
            const baseName = path.basename(viewFile);
            
            // Try with underscore
            const withUnderscore = path.join(dir, `_${baseName}${extension}`);
            if (this.fileRepository.existsSync(withUnderscore)) {
                return withUnderscore;
            }
            
            // Try without underscore
            const withoutUnderscore = path.join(dir, `${baseName}${extension}`);
            if (this.fileRepository.existsSync(withoutUnderscore)) {
                return withoutUnderscore;
            }
            
            // Return default path even if doesn't exist (for diagnostics)
            return withUnderscore;
        }

        // Return null if file doesn't exist
        // Note: In Yii, this would also check findLocalizedFile() for i18n
        // For now, we return the expected path even if it doesn't exist (for better UX)
        return viewFile + extension;
    }

    /**
     * Resolve alias path (dot notation) to file path
     * Mimics Yii::getPathOfAlias()
     * 
     * @param alias - Dot notation path (e.g., 'application.views.layouts.main')
     * @param workspaceRoot - Workspace root directory
     * @returns Resolved file path or null
     */
    private resolveAliasPath(alias: string, workspaceRoot: string): string | null {
        const parts = alias.split('.').filter(p => p.length > 0);
        
        if (parts.length === 0) {
            return null;
        }

        // Handle application.* paths
        if (parts[0] === 'application') {
            const basePath = path.join(workspaceRoot, 'protected');
            
            // application.views.*
            if (parts.length >= 2 && parts[1] === 'views') {
                const subPath = parts.slice(2).join(path.sep);
                return path.join(basePath, 'views', subPath);
            }
            
            // application.modules.ModuleName.views.*
            if (parts.length >= 4 && parts[1] === 'modules' && parts[3] === 'views') {
                const moduleName = parts[2];
                const subPath = parts.slice(4).join(path.sep);
                return path.join(basePath, 'modules', moduleName, 'views', subPath);
            }
            
            // Other application paths
            const subPath = parts.slice(1).join(path.sep);
            return path.join(basePath, subPath);
        }
        
        // Handle zii.* paths
        if (parts[0] === 'zii') {
            const frameworkPath = path.join(workspaceRoot, 'framework', 'zii');
            const subPath = parts.slice(1).join(path.sep);
            return path.join(frameworkPath, subPath);
        }
        
        // Handle system.* paths
        if (parts[0] === 'system') {
            const frameworkPath = path.join(workspaceRoot, 'framework');
            const subPath = parts.slice(1).join(path.sep);
            return path.join(frameworkPath, subPath);
        }

        return null;
    }

    /**
     * Get view path for a controller (controller's view directory)
     */
    getViewPath(
        controllerName: string,
        workspaceRoot: string,
        moduleName: string | null = null
    ): string {
        if (moduleName) {
            return this.configService.getViewsDirectory(workspaceRoot, moduleName);
        }
        return this.configService.getViewsDirectory(workspaceRoot);
    }

    /**
     * Get base path (main app views directory)
     */
    getBasePath(workspaceRoot: string): string {
        return this.configService.getViewsDirectory(workspaceRoot);
    }

    /**
     * Get module view path
     */
    getModuleViewPath(moduleName: string, workspaceRoot: string): string {
        return this.configService.getViewsDirectory(workspaceRoot, moduleName);
    }
}


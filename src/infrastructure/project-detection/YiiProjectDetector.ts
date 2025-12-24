import * as path from 'path';
import * as fs from 'fs';
import { IYiiProjectDetector } from '../../domain/interfaces/IYiiProjectDetector';
import { IConfigurationService } from '../../domain/interfaces/IConfigurationService';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';

/**
 * Yii project detector implementation
 * Detects Yii 1.1 projects by checking for framework files and structure
 */
export class YiiProjectDetector implements IYiiProjectDetector {
    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {}

    async isYiiProject(workspaceRoot: string): Promise<boolean> {
        return this.isYiiProjectSync(workspaceRoot);
    }

    isYiiProjectSync(workspaceRoot: string): boolean {
        // Check if extension is enabled
        if (!this.configService.isEnabled()) {
            return false;
        }

        // Check for Yii framework directory
        const frameworkPath = path.join(workspaceRoot, 'framework');
        if (this.fileRepository.existsSync(frameworkPath)) {
            // Check for Yii.php in framework directory
            const yiiPath = path.join(frameworkPath, 'Yii.php');
            if (this.fileRepository.existsSync(yiiPath)) {
                return true;
            }
        }

        // Check for protected directory (Yii 1.1 standard structure)
        const protectedPath = path.join(workspaceRoot, this.configService.getProtectedPath());
        if (!this.fileRepository.existsSync(protectedPath)) {
            return false;
        }

        // Check for index.php entry point (common in Yii projects)
        const indexPath = path.join(workspaceRoot, 'index.php');
        if (this.fileRepository.existsSync(indexPath)) {
            // Check if index.php contains Yii references
            try {
                const indexContent = fs.readFileSync(indexPath, 'utf8');
                if (indexContent.includes('Yii') || indexContent.includes('framework')) {
                    return true;
                }
            } catch {
                // If we can't read, continue with other checks
            }
        }

        // Check for protected/config directory (Yii standard)
        const configPath = path.join(protectedPath, 'config');
        if (this.fileRepository.existsSync(configPath)) {
            // Check for main.php config file
            const mainConfigPath = path.join(configPath, 'main.php');
            if (this.fileRepository.existsSync(mainConfigPath)) {
                return true;
            }
        }

        // Check for protected/controllers directory
        const controllersPath = path.join(protectedPath, this.configService.getControllersPath());
        if (this.fileRepository.existsSync(controllersPath)) {
            return true;
        }

        return false;
    }

    isControllerFile(filePath: string, workspaceRoot: string): boolean {
        if (!filePath.endsWith('.php')) {
            return false;
        }

        // Check if file ends with Controller.php
        if (filePath.endsWith('Controller.php')) {
            return true;
        }

        // Check if file is in controllers directory
        const controllersPath = this.configService.getControllersPath();
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        // Check for controllers in main app or modules
        const controllersIndex = pathParts.indexOf(controllersPath);
        if (controllersIndex !== -1) {
            return true;
        }

        return false;
    }

    isViewFile(filePath: string, workspaceRoot: string): boolean {
        if (!filePath.endsWith('.php')) {
            return false;
        }

        // Check if file is in views directory
        const viewsPath = this.configService.getViewsPath();
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        // Check for views in main app or modules
        const viewsIndex = pathParts.indexOf(viewsPath);
        if (viewsIndex !== -1) {
            return true;
        }

        return false;
    }

    isModelFile(filePath: string, workspaceRoot: string): boolean {
        if (!filePath.endsWith('.php')) {
            return false;
        }

        // Check if file is in models directory (common Yii structure)
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        // Check for models directory
        const modelsIndex = pathParts.indexOf('models');
        if (modelsIndex !== -1) {
            return true;
        }

        return false;
    }

    async countControllers(workspaceRoot: string): Promise<number> {
        let count = 0;
        const protectedPath = path.join(workspaceRoot, this.configService.getProtectedPath());
        const controllersPath = this.configService.getControllersPath();

        // Count controllers in main app
        const mainControllersDir = path.join(protectedPath, controllersPath);
        if (this.fileRepository.existsSync(mainControllersDir)) {
            count += this.countFilesRecursive(mainControllersDir, 'Controller.php');
        }

        // Count controllers in modules
        const modulesPath = path.join(protectedPath, this.configService.getModulesPath());
        if (this.fileRepository.existsSync(modulesPath)) {
            try {
                const modules = fs.readdirSync(modulesPath, { withFileTypes: true });
                for (const module of modules) {
                    if (module.isDirectory()) {
                        const moduleControllersDir = path.join(modulesPath, module.name, controllersPath);
                        if (this.fileRepository.existsSync(moduleControllersDir)) {
                            count += this.countFilesRecursive(moduleControllersDir, 'Controller.php');
                        }
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        return count;
    }

    async countModels(workspaceRoot: string): Promise<number> {
        let count = 0;
        const protectedPath = path.join(workspaceRoot, this.configService.getProtectedPath());

        // Count models in main app
        const mainModelsDir = path.join(protectedPath, 'models');
        if (this.fileRepository.existsSync(mainModelsDir)) {
            count += this.countFilesRecursive(mainModelsDir, '.php');
        }

        // Count models in modules
        const modulesPath = path.join(protectedPath, this.configService.getModulesPath());
        if (this.fileRepository.existsSync(modulesPath)) {
            try {
                const modules = fs.readdirSync(modulesPath, { withFileTypes: true });
                for (const module of modules) {
                    if (module.isDirectory()) {
                        const moduleModelsDir = path.join(modulesPath, module.name, 'models');
                        if (this.fileRepository.existsSync(moduleModelsDir)) {
                            count += this.countFilesRecursive(moduleModelsDir, '.php');
                        }
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        return count;
    }

    async countActions(workspaceRoot: string): Promise<number> {
        let count = 0;
        const protectedPath = path.join(workspaceRoot, this.configService.getProtectedPath());
        const controllersPath = this.configService.getControllersPath();

        // Count actions in main app controllers
        const mainControllersDir = path.join(protectedPath, controllersPath);
        if (this.fileRepository.existsSync(mainControllersDir)) {
            count += await this.countActionsInDirectory(mainControllersDir);
        }

        // Count actions in module controllers
        const modulesPath = path.join(protectedPath, this.configService.getModulesPath());
        if (this.fileRepository.existsSync(modulesPath)) {
            try {
                const modules = fs.readdirSync(modulesPath, { withFileTypes: true });
                for (const module of modules) {
                    if (module.isDirectory()) {
                        const moduleControllersDir = path.join(modulesPath, module.name, controllersPath);
                        if (this.fileRepository.existsSync(moduleControllersDir)) {
                            count += await this.countActionsInDirectory(moduleControllersDir);
                        }
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        return count;
    }

    /**
     * Count action methods in all controller files in a directory
     */
    private async countActionsInDirectory(dirPath: string): Promise<number> {
        let totalCount = 0;
        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                if (item.isFile() && item.name.endsWith('Controller.php')) {
                    const actionCount = await this.countActionsInFile(fullPath);
                    totalCount += actionCount;
                } else if (item.isDirectory()) {
                    totalCount += await this.countActionsInDirectory(fullPath);
                }
            }
        } catch {
            // Ignore errors
        }
        return totalCount;
    }

    /**
     * Count action methods in a single controller file
     */
    private async countActionsInFile(filePath: string): Promise<number> {
        try {
            const content = await this.fileRepository.readFile(filePath);
            // Match function actionMethodName( - similar to ActionParser
            const actionPattern = /function\s+(action\w+)\s*\(/g;
            const matches = content.match(actionPattern);
            return matches ? matches.length : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Count files recursively matching a suffix
     */
    private countFilesRecursive(dirPath: string, suffix: string): number {
        let count = 0;
        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                if (item.isFile() && item.name.endsWith(suffix)) {
                    count++;
                } else if (item.isDirectory()) {
                    count += this.countFilesRecursive(fullPath, suffix);
                }
            }
        } catch {
            // Ignore errors
        }
        return count;
    }

}


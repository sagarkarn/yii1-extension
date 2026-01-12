import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IFileRepository } from '../domain/interfaces/IFileRepository';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';
import { ViewResolver } from '../infrastructure/view-resolution/ViewResolver';

/**
 * Completion provider for layout names in $layout assignments
 * Provides autocomplete for: $this->layout = '...' or public $layout = '...'
 * Supports segment-based completion with //, /, dot notation, and relative paths
 */
export class LayoutCompletionProvider implements vscode.CompletionItemProvider {
    private viewResolver: ViewResolver;

    constructor(
        private readonly fileRepository: IFileRepository,
        private readonly configService: IConfigurationService
    ) {
        this.viewResolver = new ViewResolver(fileRepository, configService);
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const line = document.lineAt(position);
        const lineText = line.text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const textAfterCursor = lineText.substring(position.character);

        // Check if we're inside a layout assignment
        const layoutInfo = this.findLayoutAssignmentAtPosition(document, position, textBeforeCursor, textAfterCursor);
        if (!layoutInfo) {
            return null;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const currentPath = layoutInfo.currentPath || '';

        // Set up text replacement range
        const replaceStart = new vscode.Position(position.line, layoutInfo.quoteStart);
        const replaceEnd = new vscode.Position(position.line, layoutInfo.quoteEnd);

        // Get segment-based completions based on path type
        const completions = this.getSegmentBasedCompletions(
            document,
            workspaceRoot,
            currentPath,
            layoutInfo,
            replaceStart,
            replaceEnd
        );

        return new vscode.CompletionList(completions, false);
    }

    /**
     * Find layout assignment at cursor position
     * Matches: $this->layout = '...' or public $layout = '...'
     */
    private findLayoutAssignmentAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        textBeforeCursor: string,
        textAfterCursor: string
    ): {
        currentPath: string;
        isRelative: boolean;
        isAbsolute: boolean;
        isDotNotation: boolean;
        isDoubleSlash: boolean;
        quoteStart: number;
        quoteEnd: number;
    } | null {
        // Pattern to match: $this->layout = 'layoutName' or public $layout = 'layoutName'
        const layoutPattern = /(?:\$this\s*->\s*layout|(?:public|protected|private)\s+\$layout)\s*=\s*['"]([^'"]*)$/;
        const match = textBeforeCursor.match(layoutPattern);
        
        if (!match) {
            return null;
        }

        const currentPath = match[1] || '';
        const quoteChar = match[0].includes("'") ? "'" : '"';
        const quoteStartIndex = match.index! + match[0].indexOf(quoteChar) + 1;

        // Check if there's a closing quote after cursor
        const closingQuoteMatch = textAfterCursor.match(/^[^'"]*['"]/);
        const quoteEndIndex = closingQuoteMatch 
            ? position.character + closingQuoteMatch[0].length - 1
            : position.character;

        // Check for double slash // (absolute from beginning/main app)
        const isDoubleSlash = currentPath.startsWith('//');
        // Check for single slash / (layouts/main)
        const isAbsolute = false;
        const isRelative = currentPath.startsWith('../') || currentPath.startsWith('./');
        const isDotNotation = currentPath.includes('.') && !isRelative && !isAbsolute && !isDoubleSlash;

        return {
            currentPath,
            isRelative,
            isAbsolute,
            isDotNotation,
            isDoubleSlash,
            quoteStart: quoteStartIndex,
            quoteEnd: quoteEndIndex
        };
    }

    /**
     * Get segment-based completions for layout paths
     */
    private getSegmentBasedCompletions(
        document: vscode.TextDocument,
        workspaceRoot: string,
        currentPath: string,
        layoutInfo: {
            isRelative: boolean;
            isAbsolute: boolean;
            isDotNotation: boolean;
            isDoubleSlash: boolean;
        },
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        if (layoutInfo.isDoubleSlash) {
            // Double slash // - absolute from beginning (main app, not module)
            return this.getDoubleSlashCompletions(workspaceRoot, currentPath, replaceStart, replaceEnd);
        } else if (layoutInfo.isAbsolute) {
            // Single slash / - layouts/main
            return this.getSingleSlashCompletions(document, workspaceRoot, currentPath, replaceStart, replaceEnd);
        } else if (layoutInfo.isDotNotation) {
            // Dot notation - application.views.layouts.main
            return this.getDotNotationSegmentCompletions(workspaceRoot, currentPath, replaceStart, replaceEnd);
        } else if (layoutInfo.isRelative) {
            // Relative with slash - ../layouts/main
            return this.getRelativeSlashCompletions(document, workspaceRoot, currentPath, replaceStart, replaceEnd);
        } else {
            // Just a name - relative to current layout directory
            return this.getRelativeNameCompletions(document, workspaceRoot, currentPath, replaceStart, replaceEnd);
        }
    }

    /**
     * Get segment-based completions for double slash // paths (absolute from beginning/main app)
     */
    private getDoubleSlashCompletions(
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        // Remove // prefix
        const pathAfterDoubleSlash = currentPath.substring(2);
        const pathParts = pathAfterDoubleSlash.split('/').filter(p => p.length > 0);
        
        const viewsDir = this.configService.getViewsDirectory(workspaceRoot);
        
        // Build path progressively
        let currentDir = viewsDir;
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentDir = path.join(currentDir, pathParts[i]);
            if (!this.fileRepository.existsSync(currentDir)) {
                return completions; // Path doesn't exist
            }
        }
        
        // Get next segments
        if (pathParts.length === 0) {
            // Show layouts directory
            const layoutsDir = path.join(viewsDir, 'layouts');
            if (this.fileRepository.existsSync(layoutsDir)) {
                const item = new vscode.CompletionItem('layouts', vscode.CompletionItemKind.Folder);
                item.textEdit = new vscode.TextEdit(
                    new vscode.Range(replaceStart, replaceEnd),
                    '//layouts'
                );
                item.filterText = '//layouts';
                item.detail = 'Layouts Directory (Main App)';
                completions.push(item);
            }
        } else if (pathParts.length === 1 && pathParts[0] === 'layouts') {
            // Show layouts in layouts directory
            const layoutsDir = path.join(viewsDir, 'layouts');
            if (this.fileRepository.existsSync(layoutsDir)) {
                const layouts = this.getLayoutFiles(layoutsDir);
                for (const layout of layouts) {
                    const item = new vscode.CompletionItem(layout, vscode.CompletionItemKind.File);
                    item.textEdit = new vscode.TextEdit(
                        new vscode.Range(replaceStart, replaceEnd),
                        `//layouts/${layout}`
                    );
                    item.filterText = `//layouts/${layout}`;
                    item.detail = 'Layout (Main App)';
                    completions.push(item);
                }
            }
        }
        
        return completions;
    }

    /**
     * Get segment-based completions for single slash / paths (layouts/main)
     */
    private getSingleSlashCompletions(
        document: vscode.TextDocument,
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        const pathParts = currentPath.substring(1).split('/').filter(p => p.length > 0);
        
        // Check module first if document is in a module
        const moduleName = this.getModuleFromPath(document.uri.fsPath, workspaceRoot);
        const viewsDir = moduleName 
            ? this.configService.getViewsDirectory(workspaceRoot, moduleName)
            : this.configService.getViewsDirectory(workspaceRoot);
        
        if (pathParts.length === 0) {
            // Show layouts directory
            const layoutsDir = path.join(viewsDir, 'layouts');
            if (this.fileRepository.existsSync(layoutsDir)) {
                const item = new vscode.CompletionItem('layouts', vscode.CompletionItemKind.Folder);
                item.textEdit = new vscode.TextEdit(
                    new vscode.Range(replaceStart, replaceEnd),
                    '/layouts'
                );
                item.filterText = '/layouts';
                item.detail = moduleName ? `Layouts Directory (${moduleName})` : 'Layouts Directory';
                completions.push(item);
            }
        } else if (pathParts.length === 1 && pathParts[0] === 'layouts') {
            // Show layouts in layouts directory
            const layoutsDir = path.join(viewsDir, 'layouts');
            if (this.fileRepository.existsSync(layoutsDir)) {
                const layouts = this.getLayoutFiles(layoutsDir);
                for (const layout of layouts) {
                    const item = new vscode.CompletionItem(layout, vscode.CompletionItemKind.File);
                    item.textEdit = new vscode.TextEdit(
                        new vscode.Range(replaceStart, replaceEnd),
                        `/layouts/${layout}`
                    );
                    item.filterText = `/layouts/${layout}`;
                    item.detail = moduleName ? `Layout (${moduleName})` : 'Layout';
                    completions.push(item);
                }
            }
        }
        
        return completions;
    }

    /**
     * Get segment-based completions for dot notation paths
     */
    private getDotNotationSegmentCompletions(
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        // Normalize the prefix - handle trailing dots
        let prefix = currentPath || '';
        const hasTrailingDot = prefix.endsWith('.');
        prefix = prefix.replace(/\.+$/, '');
        const prefixParts = prefix.split('.').filter(p => p.length > 0);
        
        // Find all unique next segments at the current depth
        const nextSegments = new Set<string>();
        const layoutsIndex = this.buildLayoutsIndex(workspaceRoot);
        
        for (const fullPath of layoutsIndex) {
            const pathParts = fullPath.split('.');
            
            if (prefixParts.length === 0) {
                // Show top-level segments
                if (pathParts.length > 0) {
                    nextSegments.add(pathParts[0]);
                }
            } else {
                // Check if path starts with current prefix
                let matches = true;
                for (let i = 0; i < prefixParts.length; i++) {
                    if (i >= pathParts.length || pathParts[i] !== prefixParts[i]) {
                        matches = false;
                        break;
                    }
                }
                
                if (matches && pathParts.length > prefixParts.length) {
                    nextSegments.add(pathParts[prefixParts.length]);
                }
            }
        }
        
        // Create completion items for next segments
        for (const segment of Array.from(nextSegments).sort()) {
            const currentPrefix = prefixParts.length > 0 ? prefixParts.join('.') + '.' : '';
            const fullPath = currentPrefix + segment;
            const isComplete = layoutsIndex.includes(fullPath);
            
            const item = new vscode.CompletionItem(
                segment,
                isComplete ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder
            );
            
            const insertText = hasTrailingDot ? segment : (prefixParts.length > 0 ? '.' + segment : segment);
            // item.textEdit = new vscode.TextEdit(
            //     new vscode.Range(replaceStart, replaceEnd),
            //     insertText
            // );
            item.filterText = fullPath;
            item.detail = isComplete ? 'Layout' : 'Directory';
            item.insertText = insertText;
            item.sortText = `0_${segment}`;
            item.preselect = true;
            
            completions.push(item);
        }
        
        return completions;
    }

    /**
     * Get segment-based completions for relative paths with slashes
     */
    private getRelativeSlashCompletions(
        document: vscode.TextDocument,
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        const documentDir = path.dirname(document.uri.fsPath);
        
        // Resolve relative path
        const relativePath = currentPath.replace(/^\.\.?\//, '');
        const resolvedDir = path.resolve(documentDir, relativePath);
        
        if (this.fileRepository.existsSync(resolvedDir)) {
            const entries = this.getDirectoryEntries(resolvedDir);
            for (const entry of entries) {
                const fullPath = path.join(resolvedDir, entry);
                if (this.fileRepository.existsSync(fullPath)) {
                    const stat = fs.statSync(fullPath);
                    const isDirectory = stat.isDirectory();
                    
                    const item = new vscode.CompletionItem(
                        entry,
                        isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
                    );
                    
                    const insertText = currentPath.startsWith('../') 
                        ? `../${relativePath}/${entry}`
                        : `./${relativePath}/${entry}`;
                    
                    item.textEdit = new vscode.TextEdit(
                        new vscode.Range(replaceStart, replaceEnd),
                        insertText
                    );
                    item.filterText = insertText;
                    item.detail = isDirectory ? 'Directory' : 'Layout';
                    completions.push(item);
                }
            }
        }
        
        return completions;
    }

    /**
     * Get segment-based completions for relative paths (just a name)
     */
    private getRelativeNameCompletions(
        document: vscode.TextDocument,
        workspaceRoot: string,
        currentPath: string,
        replaceStart: vscode.Position,
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        const documentPath = document.uri.fsPath;
        const moduleName = this.getModuleFromPath(documentPath, workspaceRoot);
        
        // Get layout directory using ViewResolver
        const layoutDir = this.viewResolver.getLayoutPath(workspaceRoot, moduleName);
        
        if (!this.fileRepository.existsSync(layoutDir)) {
            return completions;
        }
        
        // Get all layout files
        const layouts = this.getLayoutFiles(layoutDir);
        
        // Filter by current path prefix
        const filteredLayouts = currentPath
            ? layouts.filter(layout => layout.startsWith(currentPath))
            : layouts;
        
        // Create completion items
        for (const layoutName of filteredLayouts) {
            const item = new vscode.CompletionItem(layoutName, vscode.CompletionItemKind.File);
            item.textEdit = new vscode.TextEdit(
                new vscode.Range(replaceStart, replaceEnd),
                layoutName
            );
            item.filterText = layoutName;
            item.detail = moduleName ? `Layout (${moduleName})` : 'Layout';
            item.documentation = `Layout file: ${path.join(layoutDir, `${layoutName}.php`)}`;
            completions.push(item);
        }
        
        // Also check main app layouts if we're in a module (for fallback)
        if (moduleName) {
            const mainLayoutDir = this.viewResolver.getLayoutPath(workspaceRoot, null);
            if (this.fileRepository.existsSync(mainLayoutDir)) {
                const mainLayouts = this.getLayoutFiles(mainLayoutDir);
                const filteredMainLayouts = currentPath
                    ? mainLayouts.filter(layout => layout.startsWith(currentPath) && !filteredLayouts.includes(layout))
                    : mainLayouts.filter(layout => !filteredLayouts.includes(layout));
                
                for (const layoutName of filteredMainLayouts) {
                    const item = new vscode.CompletionItem(layoutName, vscode.CompletionItemKind.File);
                    item.textEdit = new vscode.TextEdit(
                        new vscode.Range(replaceStart, replaceEnd),
                        layoutName
                    );
                    item.filterText = layoutName;
                    item.detail = 'Layout (Main App)';
                    item.documentation = `Layout file: ${path.join(mainLayoutDir, `${layoutName}.php`)}`;
                    completions.push(item);
                }
            }
        }
        
        return completions;
    }

    /**
     * Build an index of all layout paths in dot notation format
     */
    private buildLayoutsIndex(workspaceRoot: string): string[] {
        const results = new Set<string>();
        const viewsDir = this.configService.getViewsDirectory(workspaceRoot);
        const layoutsDir = path.join(viewsDir, 'layouts');
        
        const walk = (root: string, basePath: string) => {
            if (!this.fileRepository.existsSync(root)) {
                return;
            }
            
            const entries = this.getDirectoryEntries(root);
            for (const entry of entries) {
                const full = path.join(root, entry);
                if (this.fileRepository.existsSync(full)) {
                    const stat = fs.statSync(full);
                    if (stat.isDirectory()) {
                        walk(full, `${basePath}.${entry}`);
                    } else if (entry.endsWith('.php')) {
                        const layoutName = entry.replace(/\.php$/, '');
                        results.add(`${basePath}.${layoutName}`);
                    }
                }
            }
        };
        
        if (this.fileRepository.existsSync(layoutsDir)) {
            walk(layoutsDir, 'application.views.layouts');
        }
        
        // Also check modules
        const modulesPath = path.join(workspaceRoot, 'protected', 'modules');
        if (this.fileRepository.existsSync(modulesPath)) {
            const modules = this.getDirectories(modulesPath);
            for (const module of modules) {
                const moduleLayoutsDir = path.join(modulesPath, module, 'views', 'layouts');
                if (this.fileRepository.existsSync(moduleLayoutsDir)) {
                    walk(moduleLayoutsDir, `application.modules.${module}.views.layouts`);
                }
            }
        }
        
        return Array.from(results).sort();
    }

    /**
     * Get all layout file names from layouts directory
     */
    private getLayoutFiles(layoutDir: string): string[] {
        const layouts: string[] = [];

        if (!this.fileRepository.existsSync(layoutDir)) {
            return layouts;
        }

        try {
            const entries = fs.readdirSync(layoutDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.php')) {
                    // Remove .php extension
                    const layoutName = entry.name.replace(/\.php$/, '');
                    layouts.push(layoutName);
                }
            }
        } catch (error) {
            // Ignore errors reading directory
        }

        return layouts.sort();
    }

    /**
     * Get directory entries (files and directories)
     */
    private getDirectoryEntries(dirPath: string): string[] {
        if (!this.fileRepository.existsSync(dirPath)) {
            return [];
        }

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            return entries.map(entry => entry.name).sort();
        } catch (error) {
            return [];
        }
    }

    /**
     * Get subdirectories in a directory
     */
    private getDirectories(dirPath: string): string[] {
        if (!this.fileRepository.existsSync(dirPath)) {
            return [];
        }

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            return items
                .filter(item => item.isDirectory())
                .map(item => item.name)
                .sort();
        } catch (error) {
            return [];
        }
    }

    /**
     * Get module name from file path
     */
    private getModuleFromPath(filePath: string, workspaceRoot: string): string | null {
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        
        const modulesPath = this.configService.getModulesPath();
        const modulesIndex = pathParts.indexOf(modulesPath);
        
        if (modulesIndex !== -1 && modulesIndex < pathParts.length - 1) {
            return pathParts[modulesIndex + 1];
        }
        
        return null;
    }
}

import * as vscode from 'vscode';

/**
 * Path resolver interface
 * Handles resolution of view paths, controller paths, etc.
 */
export interface IPathResolver {
    /**
     * Resolve view path from view name and context
     */
    resolveViewPath(
        document: vscode.TextDocument,
        viewName: string,
        options: ViewPathOptions
    ): Promise<string | null>;

    /**
     * Get controller info from document path
     */
    getControllerInfo(
        documentPath: string,
        workspaceRoot: string
    ): { name: string; isInControllers: boolean } | null;

    /**
     * Resolve dot notation path (e.g., application.modules.Sow.views.sow.view)
     */
    resolveDotNotationPath(
        workspaceRoot: string,
        viewName: string,
        isPartial: boolean
    ): string | null;
}

export interface ViewPathOptions {
    isPartial: boolean;
    isRelative: boolean;
    isAbsolute: boolean;
    isDotNotation: boolean;
}


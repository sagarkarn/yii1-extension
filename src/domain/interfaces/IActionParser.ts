import * as vscode from 'vscode';

/**
 * Action parser interface
 * Parses action methods from PHP documents
 */
export interface IActionParser {
    /**
     * Find action method at given position
     */
    findActionAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ActionInfo | null>;

    /**
     * Find all action methods in document
     */
    findAllActions(document: vscode.TextDocument): Promise<ActionInfo[]>;

    /**
     * Find action method by name
     */
    findActionByName(
        document: vscode.TextDocument,
        actionName: string
    ): Promise<ActionInfo | null>;
}

export interface ActionInfo {
    name: string;
    position: vscode.Position;
    startOffset: number;
    endOffset: number;
}


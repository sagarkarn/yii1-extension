import * as vscode from 'vscode';

/**
 * Action domain entity
 * Represents a Yii controller action method
 */
export class Action {
    constructor(
        private readonly _name: string,
        private readonly _position: vscode.Position,
        private readonly _startOffset: number,
        private readonly _endOffset: number,
        private readonly _document: vscode.TextDocument
    ) {}

    get name(): string {
        return this._name;
    }

    get position(): vscode.Position {
        return this._position;
    }

    get startOffset(): number {
        return this._startOffset;
    }

    get endOffset(): number {
        return this._endOffset;
    }

    get document(): vscode.TextDocument {
        return this._document;
    }

    /**
     * Get the method body text
     */
    getBodyText(): string {
        const text = this._document.getText();
        return text.substring(this._startOffset, this._endOffset);
    }

    /**
     * Get the full method signature
     */
    getMethodName(): string {
        return this._name;
    }

    /**
     * Check if this is a valid action (starts with 'action')
     */
    isValidAction(): boolean {
        return this._name.startsWith('action');
    }
}


import * as vscode from 'vscode';
import { IActionParser, ActionInfo } from '../../domain/interfaces/IActionParser';

/**
 * Action parser implementation
 * Parses action methods from PHP documents
 */
export class ActionParser implements IActionParser {
    async findActionAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ActionInfo | null> {
        const text = document.getText();
        const positionOffset = document.offsetAt(position);
        
        // Find all action methods
        const actionPattern = /function\s+(action\w+)\s*\(/g;
        let match;
        
        while ((match = actionPattern.exec(text)) !== null) {
            const actionStart = match.index;
            const actionName = match[1];
            const actionPos = document.positionAt(actionStart);
            
            // Find the end of this method
            const methodEnd = this.findMethodEnd(text, actionStart);
            
            // Check if cursor is within this method
            if (positionOffset >= actionStart && (methodEnd === -1 || positionOffset <= methodEnd)) {
                return {
                    name: actionName,
                    position: actionPos,
                    startOffset: actionStart,
                    endOffset: methodEnd
                };
            }
        }
        
        return null;
    }

    async findAllActions(document: vscode.TextDocument): Promise<ActionInfo[]> {
        const text = document.getText();
        const actions: ActionInfo[] = [];
        const actionPattern = /function\s+(action\w+)\s*\(/g;
        let match;

        while ((match = actionPattern.exec(text)) !== null) {
            const actionStart = match.index;
            const actionName = match[1];

            const actionPos = document.positionAt(actionStart);
            const methodEnd = this.findMethodEnd(text, actionStart);

            actions.push({
                name: actionName,
                position: actionPos,
                startOffset: actionStart,
                endOffset: methodEnd
            });
        }

        return actions;
    }

    async findActionByName(
        document: vscode.TextDocument,
        actionName: string
    ): Promise<ActionInfo | null> {
        const text = document.getText();
        
        // Try exact match first
        const methodPattern = new RegExp(`function\\s+${this.escapeRegex(actionName)}\\s*\\(`, 'g');
        const match = methodPattern.exec(text);
        
        if (match) {
            const actionStart = match.index;
            const actionPos = document.positionAt(actionStart);
            const methodEnd = this.findMethodEnd(text, actionStart);

            return {
                name: actionName,
                position: actionPos,
                startOffset: actionStart,
                endOffset: methodEnd
            };
        }

        return null;
    }

    private findMethodEnd(text: string, startOffset: number): number {
        let braceCount = 0;
        let inString = false;
        let stringChar = '';
        let inSingleLineComment = false;
        let inMultiLineComment = false;
    
        for (let i = startOffset; i < text.length; i++) {
            const char = text[i];
            const nextChar = i + 1 < text.length ? text[i + 1] : '';
            const prevChar = i > 0 ? text[i - 1] : '';
    
            /* ---------- STRING HANDLING ---------- */
            if (char === '"' || char === "'") {
                // Count backslashes before the quote
                let backslashCount = 0;
                let j = i - 1;
                while (j >= 0 && text[j] === '\\') {
                    backslashCount++;
                    j--;
                }
    
                const isEscaped = backslashCount % 2 === 1;
    
                if (!isEscaped && !inSingleLineComment && !inMultiLineComment) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                        stringChar = '';
                    }
                }
                continue;
            }
    
            // Ignore everything inside strings
            if (inString) continue;
    
            /* ---------- COMMENT HANDLING ---------- */
            // Check for single-line comment start (// or #)
            if (!inSingleLineComment && !inMultiLineComment) {
                if ((char === '/' && nextChar === '/') || char === '#') {
                    inSingleLineComment = true;
                    continue;
                }
                // Check for multi-line comment start (/*)
                if (char === '/' && nextChar === '*') {
                    inMultiLineComment = true;
                    i++; // Skip the '*' character
                    continue;
                }
            }
            
            // Check for single-line comment end (newline)
            if (inSingleLineComment) {
                if (char === '\n' || char === '\r') {
                    inSingleLineComment = false;
                }
                continue;
            }
            
            // Check for multi-line comment end (*/)
            if (inMultiLineComment) {
                if (char === '*' && nextChar === '/') {
                    inMultiLineComment = false;
                    i++; // Skip the '/' character
                }
                continue;
            }
    
            /* ---------- BRACE MATCHING ---------- */
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                if (braceCount > 0) {
                    braceCount--;
                    if (braceCount === 0) {
                        return i + 1;
                    }
                }
            }
        }
    
        return -1;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}


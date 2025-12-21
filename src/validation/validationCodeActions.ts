import * as vscode from 'vscode';
import { ValidationParser } from './validationParser';
import { ModelParser } from './modelParser';
import { ValidationDiagnostics } from './validationDiagnostics';

/**
 * Code action provider for Yii 1.1 validation rules
 */
export class ValidationCodeActions implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        // Get diagnostics for the current range
        const diagnostics = context.diagnostics.filter(
            d => d.source === 'Yii 1.1 Validation'
        );

        if (diagnostics.length === 0) {
            return actions;
        }

        // Process each diagnostic
        for (const diagnostic of diagnostics) {
            if (diagnostic.code === 'missing-attribute') {
                // Suggest fixing attribute name
                const fixAction = this.createFixAttributeAction(document, diagnostic, range);
                if (fixAction) {
                    actions.push(fixAction);
                }

                // Suggest adding attribute to model
                const addAction = this.createAddAttributeAction(document, diagnostic, range);
                if (addAction) {
                    actions.push(addAction);
                }
            } else if (diagnostic.code === 'duplicate-rule') {
                // Suggest removing duplicate rule
                const removeAction = this.createRemoveDuplicateAction(document, diagnostic, range);
                if (removeAction) {
                    actions.push(removeAction);
                }
            } else if (diagnostic.code === 'unknown-validator') {
                // Suggest valid validator types
                const suggestAction = this.createSuggestValidatorAction(document, diagnostic, range);
                if (suggestAction) {
                    actions.push(suggestAction);
                }
            }
        }

        return actions;
    }

    /**
     * Create action to fix attribute name
     */
    private createFixAttributeAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): vscode.CodeAction | null {
        const message = diagnostic.message;
        const suggestionMatch = message.match(/Did you mean: ([^?]+)\?/);
        
        if (!suggestionMatch) {
            return null;
        }

        const suggestions = suggestionMatch[1].split(',').map(s => s.trim());
        const firstSuggestion = suggestions[0];

        if (!firstSuggestion) {
            return null;
        }

        // Extract current attribute name from the rule
        const line = document.lineAt(diagnostic.range.start.line);
        // Match both array() and [] syntax
        const attributeMatch = line.text.match(/(?:array\s*\(|\[)\s*['"]([^'"]+)['"]/);
        
        if (!attributeMatch) {
            return null;
        }

        const currentAttribute = attributeMatch[1];
        const newText = line.text.replace(
            new RegExp(`['"]${currentAttribute}['"]`),
            `'${firstSuggestion}'`
        );

        const action = new vscode.CodeAction(
            `Change to '${firstSuggestion}'`,
            vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, line.range, newText);
        action.isPreferred = true;

        return action;
    }

    /**
     * Create action to add missing attribute to model
     */
    private createAddAttributeAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): vscode.CodeAction | null {
        const message = diagnostic.message;
        const attributeMatch = message.match(/Attribute '([^']+)'/);
        
        if (!attributeMatch) {
            return null;
        }

        const attributeName = attributeMatch[1];
        const model = ModelParser.parseModel(document);
        
        if (!model) {
            return null;
        }

        // Find a good place to add the attribute (after other properties)
        const text = document.getText();
        const classMatch = /class\s+\w+\s+extends/.exec(text);
        
        if (!classMatch) {
            return null;
        }

        // Find the opening brace of the class
        let bracePos = classMatch.index + classMatch[0].length;
        while (bracePos < text.length && text[bracePos] !== '{') {
            bracePos++;
        }

        if (bracePos >= text.length) {
            return null;
        }

        const insertLine = text.substring(0, bracePos).split('\n').length;
        const insertPosition = new vscode.Position(insertLine, 0);
        
        const propertyText = `\tpublic $${attributeName};\n`;

        const action = new vscode.CodeAction(
            `Add '${attributeName}' property to model`,
            vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(document.uri, insertPosition, propertyText);

        return action;
    }

    /**
     * Create action to remove duplicate rule
     */
    private createRemoveDuplicateAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): vscode.CodeAction | null {
        const line = document.lineAt(diagnostic.range.start.line);
        
        const action = new vscode.CodeAction(
            'Remove duplicate rule',
            vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.edit.delete(document.uri, line.rangeIncludingLineBreak);
        action.isPreferred = true;

        return action;
    }

    /**
     * Create action to suggest valid validator
     */
    private createSuggestValidatorAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): vscode.CodeAction | null {
        // This would require more context to suggest the right validator
        // For now, just provide a generic action
        const action = new vscode.CodeAction(
            'View available validators',
            vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.command = {
            command: 'vscode.open',
            title: 'Open Yii Documentation',
            arguments: ['https://www.yiiframework.com/doc/api/1.1/CValidator']
        };

        return action;
    }
}


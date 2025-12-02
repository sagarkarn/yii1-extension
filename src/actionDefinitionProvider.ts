import * as vscode from 'vscode';

export class ActionDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Check if we're within an accessRules context and on an action name
        const actionInfo = this.findActionInAccessRules(document, position);
        if (!actionInfo) {
            return null;
        }

        const { actionName } = actionInfo;
        
        // Find the action method in the controller
        const actionMethod = this.findActionMethod(document, actionName);
        
        if (actionMethod) {
            return new vscode.Location(
                document.uri,
                actionMethod
            );
        }

        return null;
    }

    private findActionInAccessRules(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { actionName: string } | null {
        // Check if we're inside an accessRules() method
        if (!this.isInAccessRulesContext(document, position)) {
            return null;
        }

        // Get the word at cursor position (action name in quotes)
        const wordRange = document.getWordRangeAtPosition(position, /['"]([^'"]+)['"]/);
        if (!wordRange) {
            return null;
        }

        const line = document.lineAt(position);
        const lineText = line.text;
        const actionNameMatch = lineText.substring(wordRange.start.character, wordRange.end.character).match(/['"]([^'"]+)['"]/);
        
        if (!actionNameMatch) {
            return null;
        }

        const actionName = actionNameMatch[1];
        
        // Check if this string is part of an 'actions' array
        // Look for 'actions'=>array( pattern nearby
        const startLine = Math.max(0, position.line - 5);
        const endLine = Math.min(document.lineCount - 1, position.line + 5);
        const contextRange = new vscode.Range(startLine, 0, endLine + 1, 0);
        const contextText = document.getText(contextRange);
        
        // Check if there's an 'actions' array in the context
        const hasActionsArray = /['"]actions['"]\s*=>\s*array\s*\(/i.test(contextText);
        
        if (hasActionsArray) {
            return { actionName };
        }

        return null;
    }

    private isInAccessRulesContext(document: vscode.TextDocument, position: vscode.Position): boolean {
        // Check if we're inside an accessRules() method
        const text = document.getText();
        const positionOffset = document.offsetAt(position);
        
        // Find accessRules method
        const accessRulesPattern = /function\s+accessRules\s*\(/i;
        const accessRulesMatch = accessRulesPattern.exec(text);
        
        if (!accessRulesMatch) {
            return false;
        }

        const accessRulesStart = accessRulesMatch.index;
        
        // Find the end of the accessRules method (look for the closing brace)
        let braceCount = 0;
        let inMethod = false;
        let methodEnd = text.length;
        
        for (let i = accessRulesStart; i < text.length; i++) {
            const char = text[i];
            
            if (char === '{') {
                braceCount++;
                inMethod = true;
            } else if (char === '}') {
                braceCount--;
                if (inMethod && braceCount === 0) {
                    methodEnd = i;
                    break;
                }
            }
        }

        // Check if cursor position is within the accessRules method
        return positionOffset >= accessRulesStart && positionOffset <= methodEnd;
    }

    private findActionMethod(document: vscode.TextDocument, actionName: string): vscode.Position | null {
        const text = document.getText();
        
        // Convert action name to method name
        // e.g., "sowInfo" -> "actionSowInfo"
        const methodName = 'action' + this.capitalizeFirst(actionName);
        
        // Pattern to find: function actionSowInfo() or function actionSowInfo ($param)
        const methodPattern = new RegExp(`function\\s+${this.escapeRegex(methodName)}\\s*\\(`, 'g');
        
        const match = methodPattern.exec(text);
        if (match) {
            return document.positionAt(match.index);
        }

        // Try alternative naming (if action name is already camelCase)
        const altMethodName = actionName.charAt(0).toUpperCase() + actionName.slice(1);
        if (altMethodName !== actionName) {
            const altPattern = new RegExp(`function\\s+action${this.escapeRegex(altMethodName)}\\s*\\(`, 'g');
            const altMatch = altPattern.exec(text);
            if (altMatch) {
                return document.positionAt(altMatch.index);
            }
        }

        return null;
    }

    private capitalizeFirst(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}


import * as vscode from 'vscode';
import * as path from 'path';
import { IActionParser } from '../domain/interfaces/IActionParser';
import { IConfigurationService } from '../domain/interfaces/IConfigurationService';

/**
 * Diagnostics provider for action arrays in controllers
 * Validates that actions referenced in actions() array have corresponding action methods
 */
export class ActionArrayDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private actionParser: IActionParser;
    private configService: IConfigurationService;

    constructor(
        actionParser: IActionParser,
        configService: IConfigurationService
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-action-arrays');
        this.actionParser = actionParser;
        this.configService = configService;
    }

    public getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    /**
     * Update diagnostics for a document
     */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        const filePath = document.uri.fsPath;
        
        // Only check controller files
        const controllersPath = this.configService.getControllersPath();
        const isController = filePath.includes(controllersPath + path.sep) || filePath.endsWith('Controller.php');

        if (!isController) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        // Find and validate actions() array
        const actionArrayDiagnostics = await this.checkActionArray(document);
        diagnostics.push(...actionArrayDiagnostics);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Check actions() array and validate action methods exist
     */
    private async checkActionArray(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Find the actions() method
        const actionsMethodPattern = /function\s+actions\s*\([^)]*\)\s*\{/i;
        const actionsMethodMatch = actionsMethodPattern.exec(text);

        if (!actionsMethodMatch) {
            return diagnostics; // No actions() method found
        }

        const actionsMethodStart = actionsMethodMatch.index;
        const actionsMethodEnd = this.findMethodEnd(text, actionsMethodStart);

        if (actionsMethodEnd === -1) {
            return diagnostics; // Couldn't find method end
        }

        // Extract the actions() method body
        const actionsMethodBody = text.substring(actionsMethodStart, actionsMethodEnd);

        // Find the return array statement
        // Pattern: return array('actionName' => 'path/to/action', ...) or return ['actionName' => 'path/to/action', ...]
        const returnArrayPattern = /return\s+(?:array\s*\(|\[)([\s\S]*?)(?:\)|]);/i;
        const returnArrayMatch = returnArrayPattern.exec(actionsMethodBody);

        if (!returnArrayMatch) {
            return diagnostics; // No return array found
        }

        // Get all action methods in the controller
        const allActions = await this.actionParser.findAllActions(document);
        const actionMethodNames = new Set(allActions.map(a => a.name.toLowerCase()));

        // Parse action names from the array keys
        // Pattern: 'actionName' => 'path' or "actionName" => "path"
        // We need to extract only the keys (before =>), not the values
        const arrayContent = returnArrayMatch[1];
        const arrayContentStart = actionsMethodStart + returnArrayMatch.index;
        
        // Pattern to match array keys: 'key' => or "key" =>
        // This matches quoted strings followed by => (array key-value pairs)
        const keyValuePattern = /['"]([^'"]+)['"]\s*=>/g;
        let keyMatch;

        while ((keyMatch = keyValuePattern.exec(arrayContent)) !== null) {
            const actionName = keyMatch[1];
            const keyStartInArray = keyMatch.index;
            const keyStartInDocument = arrayContentStart + keyMatch.index + 1; // +1 for opening quote
            const keyEndInDocument = keyStartInDocument + actionName.length;

            // Convert action name to method name (e.g., 'sowInfo' -> 'actionSowInfo')
            const methodName = this.actionNameToMethodName(actionName);

            // Check if the action method exists
            if (!actionMethodNames.has(methodName.toLowerCase())) {
                // Find the position of the action name in the document
                const actionNamePosition = document.positionAt(keyStartInDocument);
                const actionNameEndPosition = document.positionAt(keyEndInDocument);
                const range = new vscode.Range(actionNamePosition, actionNameEndPosition);

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Action method "${methodName}" not found. Expected method: function ${methodName}()`,
                    vscode.DiagnosticSeverity.Error
                );

                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * Convert action name to method name
     * e.g., 'sowInfo' -> 'actionSowInfo', 'sow_info' -> 'actionSowInfo'
     */
    private actionNameToMethodName(actionName: string): string {
        // Remove underscores and convert to camelCase
        const camelCase = actionName
            .split('_')
            .map((part, index) => {
                if (index === 0) {
                    return part.charAt(0).toLowerCase() + part.slice(1);
                }
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .join('');

        // Ensure first letter is lowercase
        const normalized = camelCase.charAt(0).toLowerCase() + camelCase.slice(1);

        // Add 'action' prefix and capitalize first letter
        return 'action' + normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    /**
     * Find the end of a method by matching braces
     */
    private findMethodEnd(text: string, startOffset: number): number {
        let braceCount = 0;
        let inMethod = false;
        
        for (let i = startOffset; i < text.length; i++) {
            const char = text[i];
            
            if (char === '{') {
                braceCount++;
                inMethod = true;
            } else if (char === '}') {
                braceCount--;
                if (inMethod && braceCount === 0) {
                    return i + 1;
                }
            }
        }
        
        return -1;
    }
}


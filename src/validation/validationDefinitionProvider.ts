import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ValidationParser } from './validationParser';
import { BUILT_IN_VALIDATORS } from './validationTypes';

/**
 * Definition provider for Yii 1.1 validation rules
 */
export class ValidationDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Check if we're inside rules() method
        if (!ValidationParser.isInRulesMethod(document, position)) {
            return null;
        }

        const line = document.lineAt(position);
        const wordRange = document.getWordRangeAtPosition(position, /['"](\w+)['"]/);
        
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);
        const match = word.match(/['"](\w+)['"]/);
        if (!match) {
            return null;
        }

        const value = match[1];

        // Check if it's a validator type
        if (BUILT_IN_VALIDATORS.includes(value as any)) {
            const location = this.findValidatorClass(value, document);
            if (location) {
                return location;
            }
        }

        // Check if it's a custom validator method (validateMethodName)
        if (value.startsWith('validate')) {
            const location = this.findCustomValidatorMethod(value, document);
            if (location) {
                return location;
            }
        }

        return null;
    }

    /**
     * Find validator class file
     */
    private findValidatorClass(validator: string, document: vscode.TextDocument): vscode.Location | null {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const validatorMap = this.getValidatorClassMap();
        const className = validatorMap.get(validator);

        if (!className) {
            return null;
        }

        // Convert Yii import path to file path
        // e.g., system.validators.CEmailValidator -> framework/validators/CEmailValidator.php
        const parts = className.split('.');
        let filePath: string;

        if (parts[0] === 'system') {
            filePath = path.join(workspaceRoot, 'framework', ...parts.slice(1));
        } else if (parts[0] === 'zii') {
            filePath = path.join(workspaceRoot, 'framework', 'zii', ...parts.slice(1));
        } else {
            // Try application path
            filePath = path.join(workspaceRoot, 'protected', ...parts);
        }

        // Add .php extension if not present
        if (!filePath.endsWith('.php')) {
            filePath += '.php';
        }

        if (fs.existsSync(filePath)) {
            // Try to find the class definition in the file
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const classMatch = new RegExp(`class\\s+${parts[parts.length - 1]}\\s+`).exec(fileContent);
            
            if (classMatch) {
                const lineNumber = fileContent.substring(0, classMatch.index).split('\n').length - 1;
                const uri = vscode.Uri.file(filePath);
                return new vscode.Location(
                    uri,
                    new vscode.Position(lineNumber, 0)
                );
            }

            // Fallback: return first line if class not found
            return new vscode.Location(
                vscode.Uri.file(filePath),
                new vscode.Position(0, 0)
            );
        }

        return null;
    }

    /**
     * Find custom validator method in the same document
     */
    private findCustomValidatorMethod(methodName: string, document: vscode.TextDocument): vscode.Location | null {
        const text = document.getText();
        
        // Pattern: public function validateMethodName($attribute, $params)
        const pattern = new RegExp(`function\\s+${methodName}\\s*\\(`, 'g');
        const match = pattern.exec(text);
        
        if (match) {
            const lineNumber = text.substring(0, match.index).split('\n').length - 1;
            return new vscode.Location(
                document.uri,
                new vscode.Position(lineNumber, 0)
            );
        }

        return null;
    }

    /**
     * Get validator to class name mapping
     */
    private getValidatorClassMap(): Map<string, string> {
        const map = new Map<string, string>();

        map.set('required', 'system.validators.CRequiredValidator');
        map.set('email', 'system.validators.CEmailValidator');
        map.set('numerical', 'system.validators.CNumberValidator');
        map.set('string', 'system.validators.CStringValidator');
        map.set('length', 'system.validators.CStringValidator');
        map.set('unique', 'system.validators.CUniqueValidator');
        map.set('compare', 'system.validators.CCompareValidator');
        map.set('exist', 'system.validators.CExistValidator');
        map.set('in', 'system.validators.CRangeValidator');
        map.set('date', 'system.validators.CDateValidator');
        map.set('time', 'system.validators.CDateValidator');
        map.set('datetime', 'system.validators.CDateValidator');
        map.set('url', 'system.validators.CUrlValidator');
        map.set('file', 'system.validators.CFileValidator');
        map.set('image', 'system.validators.CFileValidator');
        map.set('type', 'system.validators.CTypeValidator');
        map.set('boolean', 'system.validators.CBooleanValidator');
        map.set('integer', 'system.validators.CNumberValidator');
        map.set('double', 'system.validators.CNumberValidator');
        map.set('array', 'system.validators.CTypeValidator');
        map.set('safe', 'system.validators.CSafeValidator');
        map.set('match', 'system.validators.CRegularExpressionValidator');
        map.set('filter', 'system.validators.CFilterValidator');
        map.set('unsafe', 'system.validators.CUnsafeValidator');
        map.set('default', 'system.validators.CDefaultValueValidator');

        return map;
    }
}


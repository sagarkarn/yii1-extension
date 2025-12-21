import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ParsedModel, ModelAttribute } from './validationTypes';

/**
 * Parser for Yii 1.1 model classes
 */
export class ModelParser {
    /**
     * Parse a model from a PHP document
     */
    public static parseModel(document: vscode.TextDocument): ParsedModel | null {
        const text = document.getText();
        
        // Find class definition
        const classMatch = this.findClassDefinition(text);
        if (!classMatch) {
            return null;
        }

        const className = classMatch.className;
        const parentClass = classMatch.parentClass;
        const classRange = this.getRangeForMatch(text, classMatch.start, classMatch.end, document);

        // Extract attributes
        const attributes = this.extractAttributes(text, document);

        // Find tableName() method for CActiveRecord
        const tableName = parentClass === 'CActiveRecord' || parentClass.includes('CActiveRecord')
            ? this.extractTableName(text)
            : undefined;

        // Find rules() method range
        const rulesRange = this.findRulesMethodRange(text, document);

        return {
            className,
            parentClass,
            tableName,
            attributes,
            classRange,
            rulesRange
        };
    }

    /**
     * Find class definition
     */
    private static findClassDefinition(text: string): { className: string; parentClass: string; start: number; end: number } | null {
        // Pattern: class ModelName extends ParentClass
        const pattern = /class\s+(\w+)\s+extends\s+(\w+)/;
        const match = pattern.exec(text);
        
        if (!match) {
            return null;
        }

        return {
            className: match[1],
            parentClass: match[2],
            start: match.index,
            end: match.index + match[0].length
        };
    }

    /**
     * Extract model attributes
     */
    private static extractAttributes(text: string, document: vscode.TextDocument): ModelAttribute[] {
        const attributes: ModelAttribute[] = [];

        // Extract public/protected properties
        const propertyPattern = /(public|protected|private)\s+\$(\w+)/g;
        let match;
        
        while ((match = propertyPattern.exec(text)) !== null) {
            const visibility = match[1];
            const name = match[2];
            
            // Skip if it's a relation or special property
            if (name === 'db' || name === 'model' || name.startsWith('_')) {
                continue;
            }

            const line = text.substring(0, match.index).split('\n').length - 1;
            const lineObj = document.lineAt(line);
            const range = new vscode.Range(
                new vscode.Position(line, lineObj.text.indexOf(name)),
                new vscode.Position(line, lineObj.text.indexOf(name) + name.length)
            );

            attributes.push({
                name,
                type: 'property',
                range,
                isPublic: visibility === 'public',
                isProtected: visibility === 'protected'
            });
        }

        // Extract virtual attributes (getters without setters)
        const getterPattern = /public\s+function\s+get(\w+)\s*\(/g;
        const setters = new Set<string>();
        
        // Find all setters
        const setterPattern = /public\s+function\s+set(\w+)\s*\(/g;
        while ((match = setterPattern.exec(text)) !== null) {
            setters.add(match[1].toLowerCase());
        }

        // Find getters without setters (virtual attributes)
        while ((match = getterPattern.exec(text)) !== null) {
            const attrName = match[1];
            const lowerName = attrName.toLowerCase();
            
            // Convert getAttributeName to attributeName
            const attributeName = attrName.charAt(0).toLowerCase() + attrName.slice(1);
            
            if (!setters.has(lowerName) && !attributes.find(a => a.name === attributeName)) {
                const line = text.substring(0, match.index).split('\n').length - 1;
                const lineObj = document.lineAt(line);
                const range = new vscode.Range(
                    new vscode.Position(line, lineObj.text.indexOf(`get${attrName}`)),
                    new vscode.Position(line, lineObj.text.indexOf(`get${attrName}`) + `get${attrName}`.length)
                );

                attributes.push({
                    name: attributeName,
                    type: 'virtual',
                    range
                });
            }
        }

        return attributes;
    }

    /**
     * Extract table name from tableName() method
     */
    private static extractTableName(text: string): string | undefined {
        // Pattern: return 'table_name';
        const pattern = /function\s+tableName\s*\([^)]*\)\s*\{[^}]*return\s+['"]([^'"]+)['"]/s;
        const match = pattern.exec(text);
        
        return match ? match[1] : undefined;
    }

    /**
     * Find rules() method range
     */
    private static findRulesMethodRange(text: string, document: vscode.TextDocument): vscode.Range | undefined {
        const pattern = /(?:public\s+)?function\s+rules\s*\([^)]*\)\s*\{/i;
        const match = pattern.exec(text);
        
        if (!match) {
            return undefined;
        }

        const startOffset = match.index;
        const startLine = text.substring(0, startOffset).split('\n').length - 1;
        
        // Find closing brace
        let braceCount = 1;
        let pos = match.index + match[0].length;
        
        while (pos < text.length && braceCount > 0) {
            const char = text[pos];
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
            pos++;
        }

        const endOffset = pos;
        const endLine = text.substring(0, endOffset).split('\n').length - 1;

        return new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, 0)
        );
    }

    /**
     * Get range for a match in the document
     */
    private static getRangeForMatch(text: string, startOffset: number, endOffset: number, document: vscode.TextDocument): vscode.Range {
        const startLine = text.substring(0, startOffset).split('\n').length - 1;
        const endLine = text.substring(0, endOffset).split('\n').length - 1;
        
        const startLineObj = document.lineAt(startLine);
        const endLineObj = document.lineAt(endLine);
        
        return new vscode.Range(
            new vscode.Position(startLine, startLineObj.text.indexOf(text.substring(startOffset, startOffset + 20))),
            new vscode.Position(endLine, endLineObj.text.length)
        );
    }

    /**
     * Try to get database columns for CActiveRecord models
     * This would require database connection - placeholder for future enhancement
     */
    public static async getDatabaseColumns(
        tableName: string | undefined,
        workspaceRoot: string
    ): Promise<ModelAttribute[]> {
        // TODO: Implement database schema parsing
        // This could read from database configuration or schema files
        return [];
    }
}


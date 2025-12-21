import * as vscode from 'vscode';
import { ValidationRule } from './validationTypes';

/**
 * Parser for Yii 1.1 validation rules
 */
export class ValidationParser {
    /**
     * Extract validation rules from a PHP document
     */
    public static parseRules(document: vscode.TextDocument): ValidationRule[] {
        const rules: ValidationRule[] = [];
        const text = document.getText();

        // Find the rules() method
        const rulesMethodMatch = this.findRulesMethod(text);
        if (!rulesMethodMatch) {
            return rules;
        }

        const rulesStart = rulesMethodMatch.start;
        const rulesEnd = rulesMethodMatch.end;

        // Extract the content of the rules() method
        const rulesContent = text.substring(rulesStart, rulesEnd);

        // Parse array of rules
        const ruleMatches = this.parseRuleArray(rulesContent, rulesMethodMatch.lineOffset);

        for (const match of ruleMatches) {
            const rule = this.parseRule(match, document, rulesMethodMatch.lineOffset);
            if (rule) {
                rules.push(rule);
            }
        }

        return rules;
    }

    /**
     * Find the rules() method in the document
     */
    private static findRulesMethod(text: string): { start: number; end: number; lineOffset: number } | null {
        // Pattern to find: public function rules() { ... }
        const pattern = /(?:public\s+)?function\s+rules\s*\([^)]*\)\s*\{/i;
        const match = pattern.exec(text);
        
        if (!match) {
            return null;
        }

        const start = match.index + match[0].length;
        let braceCount = 1;
        let pos = start;
        let lineOffset = text.substring(0, match.index).split('\n').length - 1;

        // Find the closing brace
        while (pos < text.length && braceCount > 0) {
            const char = text[pos];
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
            }
            pos++;
        }

        if (braceCount === 0) {
            return {
                start,
                end: pos - 1,
                lineOffset
            };
        }

        return null;
    }

    /**
     * Parse array of validation rules
     */
    private static parseRuleArray(content: string, lineOffset: number): Array<{ content: string; start: number; line: number }> {
        const rules: Array<{ content: string; start: number; line: number }> = [];
        
        // Pattern to match array('attribute', 'validator', ...) or ['attribute', 'validator', ...]
        // This is a simplified parser - handles basic cases
        const arrayPattern = /(?:array\s*\(|\[)/g;
        let match;

        while ((match = arrayPattern.exec(content)) !== null) {
            const ruleStart = match.index;
            const ruleLine = lineOffset + content.substring(0, match.index).split('\n').length;
            
            // Determine if it's array() or [] syntax
            const isShortSyntax = content[match.index] === '[';
            const openChar = isShortSyntax ? '[' : '(';
            const closeChar = isShortSyntax ? ']' : ')';
            
            // Find the matching closing bracket/parenthesis
            // This handles multiline arrays and strings correctly
            let pos = match.index + match[0].length;
            let bracketCount = 1;
            let inString = false;
            let stringChar = '';
            let escaped = false;

            while (pos < content.length && bracketCount > 0) {
                const char = content[pos];
                
                if (escaped) {
                    // Escaped character - add to string and reset escape flag
                    // This handles escaped quotes, newlines, etc.
                    escaped = false;
                } else if (char === '\\' && inString) {
                    // Backslash inside string - escape next character
                    escaped = true;
                } else if ((char === '"' || char === "'") && !inString) {
                    // Start of string
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar && inString && !escaped) {
                    // End of string (only if not escaped)
                    inString = false;
                    stringChar = '';
                } else if (!inString) {
                    // Outside string - track brackets
                    if (char === openChar) {
                        bracketCount++;
                    } else if (char === closeChar) {
                        bracketCount--;
                    }
                }
                // Inside string: all characters (including newlines) are part of the string
                // and don't affect bracket counting
                
                pos++;
            }

            if (bracketCount === 0) {
                const ruleContent = content.substring(ruleStart, pos);
                rules.push({
                    content: ruleContent,
                    start: ruleStart,
                    line: ruleLine
                });
            }
        }

        return rules;
    }

    /**
     * Parse a single validation rule
     */
    private static parseRule(
        ruleMatch: { content: string; start: number; line: number },
        document: vscode.TextDocument,
        lineOffset: number
    ): ValidationRule | null {
        const content = ruleMatch.content;
        
        // Extract array elements
        // Pattern: array('attr1, attr2', 'validator', 'param' => 'value', ...) or ['attr1, attr2', 'validator', 'param' => 'value', ...]
        // Use /s flag to allow . to match newlines
        let arrayMatch = /array\s*\(\s*([\s\S]+?)\s*\)/s.exec(content);
        let isShortSyntax = false;
        
        if (!arrayMatch) {
            // Try short array syntax []
            arrayMatch = /\[\s*([\s\S]+?)\s*\]/s.exec(content);
            isShortSyntax = true;
        }
        
        if (!arrayMatch) {
            return null;
        }

        const elements = this.parseArrayElements(arrayMatch[1]);
        if (elements.length < 2) {
            return null;
        }

        // First element: attributes (can be string or array)
        const attributesStr = this.cleanString(elements[0]);
        const attributes = attributesStr.split(',').map(attr => attr.trim()).filter(attr => attr.length > 0);

        // Second element: validator type
        const validator = this.cleanString(elements[1]);

        // Remaining elements: parameters
        const params: Record<string, any> = {};
        let scenario: string | undefined;
        let allowEmpty: boolean | undefined;
        let safe: boolean | undefined;

        for (let i = 2; i < elements.length; i++) {
            const element = elements[i].trim();
            
            // Check for key => value pairs
            const keyValueMatch = /['"]?(\w+)['"]?\s*=>\s*(.+)/.exec(element);
            if (keyValueMatch) {
                const key = keyValueMatch[1];
                const value = this.cleanString(keyValueMatch[2]);
                
                if (key === 'on' || key === 'scenario') {
                    scenario = value;
                } else if (key === 'allowEmpty') {
                    allowEmpty = value === 'true' || value === '1';
                } else if (key === 'safe') {
                    safe = value === 'true' || value === '1';
                } else {
                    params[key] = value;
                }
            } else {
                // Positional parameter
                params[`param${i - 2}`] = this.cleanString(element);
            }
        }

        // Calculate range
        const ruleLine = ruleMatch.line;
        const line = document.lineAt(ruleLine);
        const range = new vscode.Range(
            new vscode.Position(ruleLine, 0),
            new vscode.Position(ruleLine, line.text.length)
        );

        return {
            attributes,
            validator,
            params,
            scenario,
            allowEmpty,
            safe,
            range,
            line: ruleLine
        };
    }

    /**
     * Parse array elements (handles nested arrays and strings, including multiline strings)
     */
    private static parseArrayElements(content: string): string[] {
        const elements: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        let escaped = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];

            if (escaped) {
                // Add the escaped character to current (including newlines, quotes, etc.)
                current += char;
                escaped = false;
                continue;
            }

            if (char === '\\' && inString) {
                // Backslash inside string - escape the next character
                escaped = true;
                current += char;
                continue;
            }

            if ((char === '"' || char === "'") && !inString) {
                // Start of string
                inString = true;
                stringChar = char;
                current += char;
            } else if (char === stringChar && inString && !escaped) {
                // End of string (only if not escaped)
                inString = false;
                stringChar = '';
                current += char;
            } else if (!inString) {
                // Outside string - handle brackets and commas
                if (char === '(' || char === '[' || char === '{') {
                    depth++;
                    current += char;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                    current += char;
                } else if (char === ',' && depth === 0) {
                    // Comma at top level - split element
                    elements.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            } else {
                // Inside string - add all characters including newlines
                current += char;
            }
        }

        // Add the last element if there's any content
        if (current.trim().length > 0) {
            elements.push(current.trim());
        }

        return elements;
    }

    /**
     * Clean string value (remove quotes)
     */
    private static cleanString(value: string): string {
        value = value.trim();
        
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    /**
     * Check if cursor is inside rules() method
     */
    public static isInRulesMethod(document: vscode.TextDocument, position: vscode.Position): boolean {
        const text = document.getText();
        const offset = document.offsetAt(position);
        
        const rulesMethodMatch = this.findRulesMethod(text);
        if (!rulesMethodMatch) {
            return false;
        }

        return offset >= rulesMethodMatch.start && offset <= rulesMethodMatch.end;
    }
}


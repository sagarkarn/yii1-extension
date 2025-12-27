import * as fs from 'fs';
import * as path from 'path';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';

/**
 * Main configuration parser
 * Parses protected/config/main.php to extract import paths
 */
export class MainConfigParser {
    constructor(
        private readonly fileRepository: IFileRepository
    ) {}

    /**
     * Get import paths from main.php config file
     * @param workspaceRoot Workspace root path
     * @returns Array of import paths (e.g., ['application.models.*', 'application.components.*'])
     */
    getImportPaths(workspaceRoot: string): string[] {
        const configPath = path.join(workspaceRoot, 'protected', 'config', 'main.php');
        
        if (!this.fileRepository.existsSync(configPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(configPath, 'utf8');
            return this.extractImportPaths(content);
        } catch (error) {
            return [];
        }
    }

    /**
     * Extract import paths from PHP config content
     */
    private extractImportPaths(content: string): string[] {
        const imports: string[] = [];

        // Remove PHP opening tag and comments
        let cleanContent = content.replace(/^<\?php\s*/i, '');
        cleanContent = this.removeComments(cleanContent);

        // Pattern to match 'import' => array(...) or 'import' => [...]
        // Handle both array() and [] syntax
        const importPattern = /['"]import['"]\s*=>\s*(array\s*\([^)]+\)|\[[^\]]+\])/is;
        const match = cleanContent.match(importPattern);

        if (!match) {
            return imports;
        }

        const arrayContent = match[1];
        
        // Extract array elements
        if (arrayContent.startsWith('array(')) {
            const elements = this.parseArrayElements(arrayContent.slice(6, -1)); // Remove 'array(' and ')'
            imports.push(...elements);
        } else if (arrayContent.startsWith('[')) {
            const elements = this.parseArrayElements(arrayContent.slice(1, -1)); // Remove '[' and ']'
            imports.push(...elements);
        }

        return imports;
    }

    /**
     * Remove PHP comments from content
     */
    private removeComments(content: string): string {
        // Remove single-line comments //
        content = content.replace(/\/\/.*$/gm, '');
        
        // Remove multi-line comments /* */
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Remove # comments
        content = content.replace(/#.*$/gm, '');
        
        return content;
    }

    /**
     * Parse array elements from array content
     */
    private parseArrayElements(arrayContent: string): string[] {
        const elements: string[] = [];
        let currentElement = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < arrayContent.length; i++) {
            const char = arrayContent[i];
            const prevChar = i > 0 ? arrayContent[i - 1] : '';

            // Handle string boundaries
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
                currentElement += char;
                continue;
            }

            if (inString) {
                currentElement += char;
                continue;
            }

            // Track depth for nested arrays
            if (char === '(' || char === '[') {
                depth++;
                currentElement += char;
            } else if (char === ')' || char === ']') {
                depth--;
                currentElement += char;
            }
            // Handle element separator
            else if (char === ',' && depth === 0) {
                const trimmed = currentElement.trim();
                if (trimmed) {
                    // Extract string value
                    const value = this.extractStringValue(trimmed);
                    if (value) {
                        elements.push(value);
                    }
                }
                currentElement = '';
            } else {
                currentElement += char;
            }
        }

        // Handle last element
        const trimmed = currentElement.trim();
        if (trimmed) {
            const value = this.extractStringValue(trimmed);
            if (value) {
                elements.push(value);
            }
        }

        return elements;
    }

    /**
     * Extract string value from PHP string expression
     */
    private extractStringValue(expr: string): string | null {
        expr = expr.trim();

        // String values (single or double quotes)
        if ((expr.startsWith('"') && expr.endsWith('"')) ||
            (expr.startsWith("'") && expr.endsWith("'"))) {
            const quote = expr[0];
            const content = expr.slice(1, -1);
            
            if (quote === '"') {
                // Double-quoted string: handle escape sequences
                return content
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            } else {
                // Single-quoted string: only escape single quote and backslash
                return content
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\');
            }
        }

        return null;
    }
}


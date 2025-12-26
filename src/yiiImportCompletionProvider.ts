import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class YiiImportCompletionProvider implements vscode.CompletionItemProvider {
    private importIndex: string[] | null = null;
    private importIndexRoot: string | null = null;

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const line = document.lineAt(position);
        const lineText = line.text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const textAfterCursor = lineText.substring(position.character);

        // Check if we're inside Yii::import('...')
        // Updated regex to also match when there's a dot at the end (when user presses .)
        const importMatch = textBeforeCursor.match(/Yii\s*::\s*import\s*\(\s*['"]([^'"]*)$/);
        if (!importMatch) {
            return null;
        }

        const currentPath = importMatch[1];
        const quoteChar = importMatch[0].includes("'") ? "'" : '"';
        const quoteStartIndex = importMatch.index! + importMatch[0].indexOf(quoteChar) + 1;
        const replaceStart = new vscode.Position(position.line, quoteStartIndex);
        
        // When trigger is '.', the cursor is right after the dot, so we need to include it in the range
        // Check if trigger character is '.' and adjust the end position accordingly
        const replaceEnd = position;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const completions = this.getCompletions(currentPath, workspaceRoot, replaceStart, replaceEnd, context);

        // Return CompletionList with isIncomplete: false to prevent merging with other providers
        // This ensures only our completions are shown, excluding VSCode defaults and other extensions
        // When trigger is '.', we should have completions to show the next level
        return new vscode.CompletionList(completions, false);
    }

    /**
     * Return completion items for Yii::import showing only the next segment.
     * Similar to VSCode's path completion, we show segments progressively.
     */
    private getCompletions(
        currentPath: string, 
        workspaceRoot: string, 
        replaceStart: vscode.Position, 
        replaceEnd: vscode.Position,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        // Build (or reuse) an index of all importable PHP files
        if (!this.importIndex || this.importIndexRoot !== workspaceRoot) {
            this.importIndex = this.buildImportIndex(workspaceRoot);
            this.importIndexRoot = workspaceRoot;
        }

        // Normalize the prefix - handle trailing dots and partial segments
        let prefix = currentPath || '';
        const originalPrefix = prefix;
        const hasTrailingDot = prefix.endsWith('.');
        prefix = prefix.replace(/\.+$/, ''); // Remove trailing dots for matching
        
        const prefixParts = prefix.split('.').filter(p => p.length > 0);
        
        // Check if the last segment is partial (user is typing it)
        // This happens when the original path doesn't end with a dot and has multiple segments
        const lastSegmentPartial = prefixParts.length > 0 && 
                                   !hasTrailingDot && 
                                   originalPrefix.includes('.') && 
                                   !originalPrefix.endsWith('.')
            ? prefixParts[prefixParts.length - 1] 
            : null;
        const completePrefixParts = lastSegmentPartial 
            ? prefixParts.slice(0, -1) 
            : prefixParts;
        
        // Find all unique next segments at the current depth
        const nextSegments = new Set<string>();
        
        if (!this.importIndex || this.importIndex.length === 0) {
            return completions;
        }
        
        for (const fullPath of this.importIndex) {
            const pathParts = fullPath.split('.');
            
            // Check if this path matches the current prefix
            if (completePrefixParts.length === 0) {
                // Show top-level segments
                if (pathParts.length > 0) {
                    const segment = pathParts[0];
                    // If we have a partial last segment, filter by it
                    if (lastSegmentPartial) {
                        if (segment.startsWith(lastSegmentPartial)) {
                            nextSegments.add(segment);
                        }
                    } else {
                        nextSegments.add(segment);
                    }
                }
            } else {
                // Check if path starts with current complete prefix
                let matches = true;
                for (let i = 0; i < completePrefixParts.length; i++) {
                    if (i >= pathParts.length || pathParts[i] !== completePrefixParts[i]) {
                        matches = false;
                        break;
                    }
                }
                
                if (matches && pathParts.length > completePrefixParts.length) {
                    const nextSegment = pathParts[completePrefixParts.length];
                    // If we have a partial last segment, filter by it
                    if (lastSegmentPartial) {
                        if (nextSegment.startsWith(lastSegmentPartial)) {
                            nextSegments.add(nextSegment);
                        }
                    } else {
                        nextSegments.add(nextSegment);
                    }
                }
            }
        }

        // Create completion items for each next segment
        for (const segment of Array.from(nextSegments).sort()) {
            // Build the full path up to this segment
            const segmentsSoFar = completePrefixParts.length > 0 
                ? [...completePrefixParts, segment].join('.')
                : segment;
            
            // Check if this is a directory (has children) or a file (final segment)
            const hasChildren = this.importIndex!.some(p => {
                const parts = p.split('.');
                const currentParts = segmentsSoFar.split('.');
                return parts.length > currentParts.length && 
                       parts.slice(0, currentParts.length).join('.') === segmentsSoFar;
            });
            
            const item = new vscode.CompletionItem(
                segment,
                hasChildren ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.Class
            );
            
            // Use textEdit to replace the current text with the full path up to this segment
            item.textEdit = new vscode.TextEdit(
                new vscode.Range(replaceStart, replaceEnd),
                segmentsSoFar
            );
            // Set filterText to the full path for consistent filtering
            // This ensures VSCode can match items even when user presses '.' (no text after dot)
            // VSCode uses fuzzy matching, so "application.modules" will match "application."
            item.filterText = segmentsSoFar;
            item.detail = 'Yii::import path';
            item.documentation = `Yii::import('${segmentsSoFar}')`;
            item.sortText = `0_${segment}`; // Ensure proper sorting (0_ prefix for custom items)
            completions.push(item);
        }

        return completions;
    }

    /**
     * Build an index of all PHP files that can be imported via Yii::import,
     * converted to full dot-notation import strings (e.g.
     * application.modules.Sow.services.MilestoneService).
     */
    private buildImportIndex(workspaceRoot: string): string[] {
        const results = new Set<string>();

        const protectedPath = path.join(workspaceRoot, 'protected');
        const frameworkPath = path.join(workspaceRoot, 'framework');

        const walk = (root: string, baseImport: string) => {
            if (!fs.existsSync(root)) {
                return;
            }
            const stack: string[] = [root];
            while (stack.length) {
                const dir = stack.pop() as string;
                let entries: string[];
                try {
                    entries = fs.readdirSync(dir);
                } catch {
                    continue;
                }
                for (const entry of entries) {
                    const full = path.join(dir, entry);
                    let stat;
                    try {
                        stat = fs.statSync(full);
                    } catch {
                        continue;
                    }
                    if (stat.isDirectory()) {
                        stack.push(full);
                    } else if (stat.isFile() && entry.toLowerCase().endsWith('.php')) {
                        const rel = path.relative(root, full).replace(/\\/g, '/');
                        const withoutExt = rel.replace(/\.php$/i, '');
                        const importPath = `${baseImport}.${withoutExt.replace(/\//g, '.')}`;
                        results.add(importPath);
                    }
                }
            }
        };

        // application.* from protected/
        if (fs.existsSync(protectedPath)) {
            walk(protectedPath, 'application');
        }

        // zii.* from framework/zii
        const ziiPath = path.join(frameworkPath, 'zii');
        if (fs.existsSync(ziiPath)) {
            walk(ziiPath, 'zii');
        }

        // system.* from framework/
        if (fs.existsSync(frameworkPath)) {
            walk(frameworkPath, 'system');
        }

        return Array.from(results).sort();
    }

    private createCompletionItem(
        label: string,
        insertText: string,
        detail: string,
        kind: vscode.CompletionItemKind
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, kind);
        item.insertText = insertText;
        item.detail = detail;
        item.documentation = `Yii::import('${insertText}')`;
        return item;
    }

    private createCompletionItemsForDirectory(
        label: string,
        insertText: string,
        detail: string
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        
        // Add directory option
        const dirItem = this.createCompletionItem(label, insertText, detail, vscode.CompletionItemKind.Folder);
        items.push(dirItem);
        
        // Add wildcard option
        const wildcardItem = this.createCompletionItem(
            `${insertText}.*`,
            `${insertText}.*`,
            `${detail} (all files)`,
            vscode.CompletionItemKind.Folder
        );
        wildcardItem.documentation = `Yii::import('${insertText}.*') - Import all files in this directory`;
        items.push(wildcardItem);
        
        return items;
    }
}


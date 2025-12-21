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

        // Check if we're inside Yii::import('...')
        const importMatch = textBeforeCursor.match(/Yii\s*::\s*import\s*\(\s*['"]([^'"]*)$/);
        if (!importMatch) {
            return null;
        }

        const currentPath = importMatch[1];
        const quoteChar = importMatch[0].includes("'") ? "'" : '"';
        const quoteStartIndex = importMatch.index! + importMatch[0].indexOf(quoteChar) + 1;
        const replaceStart = new vscode.Position(position.line, quoteStartIndex);
        const replaceEnd = position;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        if (!workspaceFolder) {
            return null;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const completions = this.getCompletions(currentPath, workspaceRoot, replaceStart, replaceEnd);

        return completions;
    }

    /**
     * Return completion items for Yii::import based on full file paths.
     * We build an index of all relevant PHP files and convert them to
     * Yii-style import strings, then filter by the current prefix.
     */
    private getCompletions(
        currentPath: string, 
        workspaceRoot: string, 
        replaceStart: vscode.Position, 
        replaceEnd: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        // Build (or reuse) an index of all importable PHP files
        if (!this.importIndex || this.importIndexRoot !== workspaceRoot) {
            this.importIndex = this.buildImportIndex(workspaceRoot);
            this.importIndexRoot = workspaceRoot;
        }

        const prefix = currentPath || '';

        // Filter index by the current prefix
        const matches = this.importIndex.filter(p => p.startsWith(prefix));

        // If nothing matches and user hasn't typed prefix, fall back to a few top-level suggestions
        const suggestions = matches.length > 0 ? matches : this.importIndex.slice(0, 50);

        for (const imp of suggestions) {
            const item = new vscode.CompletionItem(imp, vscode.CompletionItemKind.Class);
            
            item.textEdit = new vscode.TextEdit(
                new vscode.Range(replaceStart, replaceEnd),
                imp
            );
            item.detail = 'Yii::import path';
            item.documentation = `Yii::import('${imp}')`;
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


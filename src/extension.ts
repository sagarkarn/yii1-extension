import * as vscode from 'vscode';
import { YiiViewDefinitionProvider } from './viewDefinitionProvider';

export function activate(context: vscode.ExtensionContext) {
    // Show output in the Output panel
    const outputChannel = vscode.window.createOutputChannel('Yii 1.1');
    outputChannel.appendLine('Yii 1.1 extension is now active!');
    outputChannel.show();
    
    // Also log to console (visible in Developer Tools)
    console.log('Yii 1.1 extension is now active!');
    
    // Show a notification
    vscode.window.showInformationMessage('Yii 1.1 Extension activated!');

    // Register "Go to View" definition provider
    const definitionProvider = new YiiViewDefinitionProvider();
    const definitionDisposable = vscode.languages.registerDefinitionProvider(
        { language: 'php', scheme: 'file' },
        definitionProvider
    );
    
    context.subscriptions.push(definitionDisposable);
    outputChannel.appendLine('Go to View feature registered!');
}

export function deactivate() {
    // Cleanup if needed
}


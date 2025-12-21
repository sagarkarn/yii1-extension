import * as vscode from 'vscode';
import { ILogger } from '../../domain/interfaces/ILogger';

/**
 * Logger implementation using VS Code output channel
 */
export class Logger implements ILogger {
    private outputChannel: vscode.OutputChannel;

    constructor(channelName: string = 'Yii 1.1') {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
    }

    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[INFO ${timestamp}] ${message}`);
    }

    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[ERROR ${timestamp}] ${message}`);
        if (error) {
            this.outputChannel.appendLine(`  Error: ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(`  Stack: ${error.stack}`);
            }
        }
    }

    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[WARN ${timestamp}] ${message}`);
    }

    debug(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[DEBUG ${timestamp}] ${message}`);
    }

    showInfo(message: string): void {
        this.info(message);
        vscode.window.showInformationMessage(message);
    }

    showError(message: string): void {
        this.error(message);
        vscode.window.showErrorMessage(message);
    }

    showWarning(message: string): void {
        this.warn(message);
        vscode.window.showWarningMessage(message);
    }

    /**
     * Get the output channel (for advanced usage)
     */
    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    /**
     * Show the output channel
     */
    show(): void {
        this.outputChannel.show();
    }
}


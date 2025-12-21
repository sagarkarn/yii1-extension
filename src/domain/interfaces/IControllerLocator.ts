import * as vscode from 'vscode';
import { Result } from '../result/Result';

export interface ControllerInfo {
    controllerPath: string;
    actionName: string | null;
}

/**
 * Controller locator interface
 * Finds controllers associated with views
 */
export interface IControllerLocator {
    /**
     * Find controller and action for a view URI
     */
    findControllerAndAction(viewUri: vscode.Uri): Promise<Result<ControllerInfo>>;

    /**
     * Navigate to controller and optionally to an action
     */
    navigateToController(controllerPath: string, actionName: string | null): Promise<void>;
}


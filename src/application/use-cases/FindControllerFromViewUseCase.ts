import { IControllerLocator } from '../../domain/interfaces/IControllerLocator';
import { Result } from '../../domain/result/Result';
import * as vscode from 'vscode';

export interface ControllerInfo {
    controllerPath: string;
    actionName: string | null;
}

/**
 * Use case: Find controller and action from a view file
 */
export class FindControllerFromViewUseCase {
    constructor(
        private readonly controllerLocator: IControllerLocator
    ) {}

    /**
     * Execute the use case
     */
    async execute(request: FindControllerRequest): Promise<Result<ControllerInfo>> {
        if (!request.viewUri) {
            return Result.failure('View URI is required');
        }

        return await this.controllerLocator.findControllerAndAction(request.viewUri);
    }
}

export interface FindControllerRequest {
    viewUri: vscode.Uri;
}


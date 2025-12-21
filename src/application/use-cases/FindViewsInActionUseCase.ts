import { IViewLocator } from '../../domain/interfaces/IViewLocator';
import { IActionParser } from '../../domain/interfaces/IActionParser';
import { View } from '../../domain/entities/View';
import { Action } from '../../domain/entities/Action';
import { Result } from '../../domain/result/Result';
import { ActionNotFoundException } from '../../domain/exceptions/DomainException';
import * as vscode from 'vscode';

export interface FindViewsResponse {
    views: View[];
    actionName: string;
}

/**
 * Use case: Find all views in an action method
 * Application layer - orchestrates domain services
 */
export class FindViewsInActionUseCase {
    constructor(
        private readonly viewLocator: IViewLocator,
        private readonly actionParser: IActionParser
    ) {}

    /**
     * Execute the use case
     */
    async execute(request: FindViewsRequest): Promise<Result<FindViewsResponse>> {
        // Parse action from document
        let actionInfo;
        
        if (request.actionName && request.actionPosition) {
            // Action name and position provided (from code lens)
            actionInfo = await this.actionParser.findActionByName(
                request.document,
                request.actionName
            );
            
            if (!actionInfo) {
                return Result.failure(new ActionNotFoundException(request.actionName));
            }
        } else if (request.position) {
            // Position provided (from right-click)
            actionInfo = await this.actionParser.findActionAtPosition(
                request.document,
                request.position
            );
            
            if (!actionInfo) {
                return Result.failure('No action found at cursor position');
            }
        } else {
            return Result.failure('Either actionName/actionPosition or position must be provided');
        }

        // Create Action entity
        const action = new Action(
            actionInfo.name,
            actionInfo.position,
            actionInfo.startOffset,
            actionInfo.endOffset,
            request.document
        );

        // Find views in action
        const views = await this.viewLocator.findViewsInAction(action);

        return Result.success({
            views,
            actionName: actionInfo.name
        });
    }
}

export interface FindViewsRequest {
    document: vscode.TextDocument;
    actionName?: string;
    actionPosition?: vscode.Position;
    position?: vscode.Position;
}


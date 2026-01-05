import * as vscode from 'vscode';
import { IViewLocator } from '../../domain/interfaces/IViewLocator';
import { View } from '../../domain/entities/View';
import { Action } from '../../domain/entities/Action';
import { IPathResolver } from '../../domain/interfaces/IPathResolver';
import { COMMENT_REGEX, RENDER_PATTERN_REGEX } from '../constant/RegexConst';

/**
 * View locator implementation
 * Finds views associated with actions
 */
export class ViewLocator implements IViewLocator {
    constructor(
        private readonly pathResolver: IPathResolver
    ) {}

    async findViewsInAction(action: Action): Promise<View[]> {
        const methodBody = action.getBodyText();
        
        // Pattern to match render('view') or renderPartial('view')
        const renderPattern = /(?:->|::)\s*(render(?:Partial)?)\s*\(\s*['"]([^'"]+)['"]/g;
        
        const views: View[] = [];
        let match;

        while ((match = renderPattern.exec(methodBody)) !== null) {
            const isPartial = match[1] === 'renderPartial';
            const viewName = match[2];
            
            // Determine view path characteristics
            const isRelative = viewName.startsWith('../') || viewName.startsWith('./');
            const isAbsolute = viewName.startsWith('/');
            const isDotNotation = viewName.includes('.') && !isRelative && !isAbsolute;
            
            // Resolve the view path
            const viewPath = await this.pathResolver.resolveViewPath(
                action.document,
                viewName,
                {
                    isPartial,
                    isRelative,
                    isAbsolute,
                    isDotNotation
                }
            );

            if (viewPath) {
                // Avoid duplicates
                const exists = views.some(v => v.getFullPath() === viewPath);
                if (!exists) {
                    views.push(View.fromRaw({
                        viewName,
                        viewPath,
                        isPartial,
                        isRelative,
                        isAbsolute,
                        isDotNotation
                    }));
                }
            }
        }

        return views;
    }
}


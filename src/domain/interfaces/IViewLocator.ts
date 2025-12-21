import { View } from '../entities/View';
import { Action } from '../entities/Action';

/**
 * View locator interface
 * Finds views associated with actions
 */
export interface IViewLocator {
    /**
     * Find all views in an action method
     */
    findViewsInAction(action: Action): Promise<View[]>;
}


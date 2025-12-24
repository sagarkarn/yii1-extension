/**
 * Yii project detector interface
 * Detects if a workspace is a Yii 1.1 project
 */
export interface IYiiProjectDetector {
    /**
     * Check if the workspace is a Yii 1.1 project
     */
    isYiiProject(workspaceRoot: string): Promise<boolean>;

    /**
     * Check if the workspace is a Yii 1.1 project (synchronous)
     */
    isYiiProjectSync(workspaceRoot: string): boolean;

    /**
     * Check if a file is a Yii controller file
     */
    isControllerFile(filePath: string, workspaceRoot: string): boolean;

    /**
     * Check if a file is a Yii view file
     */
    isViewFile(filePath: string, workspaceRoot: string): boolean;

    /**
     * Check if a file is a Yii model file
     */
    isModelFile(filePath: string, workspaceRoot: string): boolean;

    /**
     * Count controllers in the project
     */
    countControllers(workspaceRoot: string): Promise<number>;

    /**
     * Count models in the project
     */
    countModels(workspaceRoot: string): Promise<number>;
}


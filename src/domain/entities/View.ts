import { ViewName } from '../value-objects/ViewName';
import { ViewPath } from '../value-objects/ViewPath';
import { ViewType } from '../value-objects/ViewType';

/**
 * View domain entity
 * Represents a Yii view file
 */
export class View {
    constructor(
        private readonly _name: ViewName,
        private readonly _path: ViewPath,
        private readonly _type: ViewType
    ) {}

    get name(): ViewName {
        return this._name;
    }

    get path(): ViewPath {
        return this._path;
    }

    get type(): ViewType {
        return this._type;
    }

    /**
     * Check if this is a partial view
     */
    isPartial(): boolean {
        return this._type.isPartial();
    }

    /**
     * Get the full file path
     */
    getFullPath(): string {
        return this._path.value;
    }

    /**
     * Get the view name as string
     */
    getNameString(): string {
        return this._name.value;
    }

    /**
     * Check if view file exists
     */
    async exists(fileRepository: { exists(path: string): Promise<boolean> }): Promise<boolean> {
        return await fileRepository.exists(this.getFullPath());
    }

    /**
     * Create View from raw data (for infrastructure layer)
     */
    static fromRaw(data: {
        viewName: string;
        viewPath: string;
        isPartial: boolean;
        isRelative: boolean;
        isAbsolute: boolean;
        isDotNotation: boolean;
    }): View {
        return new View(
            new ViewName(data.viewName),
            new ViewPath(data.viewPath),
            ViewType.fromBoolean(data.isPartial)
        );
    }
}


/**
 * Class domain entity
 * Represents a PHP/Yii class definition
 */
export class Class {
    constructor(
        private readonly _name: string,
        private readonly _isAbstract: boolean,
        private readonly _parentClass: string | null,
        private readonly _filePath: string,
        private readonly _methods: readonly string[] = [],
        private readonly _properties: readonly string[] = []
    ) {}

    get name(): string {
        return this._name;
    }

    get isAbstract(): boolean {
        return this._isAbstract;
    }

    get parentClass(): string | null {
        return this._parentClass;
    }

    get filePath(): string {
        return this._filePath;
    }

    get methods(): readonly string[] {
        return this._methods;
    }

    get properties(): readonly string[] {
        return this._properties;
    }

    /**
     * Check if this class extends a parent class
     */
    hasParent(): boolean {
        return this._parentClass !== null;
    }
    /**
     * Check if this class has a specific method
     */
    hasMethod(methodName: string): boolean {
        return this._methods.includes(methodName);
    }

    /**
     * Check if this class has a specific property
     */
    hasProperty(propertyName: string): boolean {
        return this._properties.includes(propertyName);
    }

    /**
     * Create Class from raw data (for infrastructure layer)
     */
    static fromRaw(data: {
        name: string;
        isAbstract: boolean;
        parentClass?: string | null;
        filePath: string;
        methods?: string[];
        properties?: string[];
    }): Class {
        return new Class(
            data.name,
            data.isAbstract,
            data.parentClass ?? null,
            data.filePath,
            data.methods ?? [],
            data.properties ?? []
        );
    }
}


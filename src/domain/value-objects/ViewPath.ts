import * as path from 'path';

/**
 * View path value object
 * Represents a file system path to a view
 */
export class ViewPath {
    constructor(private readonly _value: string) {
        if (!_value || _value.trim().length === 0) {
            throw new Error('View path cannot be empty');
        }
    }

    get value(): string {
        return this._value;
    }

    /**
     * Resolve path relative to base path
     */
    resolve(basePath: string): ViewPath {
        return new ViewPath(path.resolve(basePath, this._value));
    }

    /**
     * Check if path is absolute
     */
    isAbsolute(): boolean {
        return path.isAbsolute(this._value);
    }

    /**
     * Get directory name
     */
    getDirectory(): string {
        return path.dirname(this._value);
    }

    /**
     * Get file name
     */
    getFileName(): string {
        return path.basename(this._value);
    }

    equals(other: ViewPath): boolean {
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }
}


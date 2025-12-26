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

    resolve(basePath: string): ViewPath {
        return new ViewPath(path.resolve(basePath, this._value));
    }

    isAbsolute(): boolean {
        return path.isAbsolute(this._value);
    }

    getDirectory(): string {
        return path.dirname(this._value);
    }

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


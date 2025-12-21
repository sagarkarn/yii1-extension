/**
 * View name value object
 * Ensures view names are valid
 */
export class ViewName {
    constructor(private readonly _value: string) {
        if (!_value || _value.trim().length === 0) {
            throw new Error('View name cannot be empty');
        }
    }

    get value(): string {
        return this._value;
    }

    /**
     * Remove underscore prefix if present (for partials)
     */
    withoutUnderscorePrefix(): ViewName {
        if (this._value.startsWith('_')) {
            return new ViewName(this._value.substring(1));
        }
        return this;
    }

    /**
     * Add underscore prefix (for partials)
     */
    withUnderscorePrefix(): ViewName {
        if (this._value.startsWith('_')) {
            return this;
        }
        return new ViewName('_' + this._value);
    }

    equals(other: ViewName): boolean {
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }
}


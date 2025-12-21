/**
 * View type value object
 * Represents whether a view is a full view or partial
 */
export class ViewType {
    private constructor(private readonly _isPartial: boolean) {}

    static readonly Full = new ViewType(false);
    static readonly Partial = new ViewType(true);

    static fromBoolean(isPartial: boolean): ViewType {
        return isPartial ? ViewType.Partial : ViewType.Full;
    }

    isPartial(): boolean {
        return this._isPartial;
    }

    isFull(): boolean {
        return !this._isPartial;
    }

    equals(other: ViewType): boolean {
        return this._isPartial === other._isPartial;
    }
}


/**
 * Result type for functional error handling
 * Represents either success with a value or failure with an error
 */
export class Result<T> {
    private constructor(
        private readonly _isSuccess: boolean,
        private readonly _value?: T,
        private readonly _error?: Error
    ) {
        if (_isSuccess && _error) {
            throw new Error('Result cannot be both success and have an error');
        }
        if (!_isSuccess && !_error) {
            throw new Error('Result must have an error when not successful');
        }
    }

    /**
     * Create a successful result
     */
    static success<T>(value: T): Result<T> {
        return new Result<T>(true, value, undefined);
    }

    /**
     * Create a failed result
     */
    static failure<T>(error: Error | string): Result<T> {
        const errorObj = error instanceof Error ? error : new Error(error);
        return new Result<T>(false, undefined, errorObj);
    }

    /**
     * Check if result is successful
     */
    get isSuccess(): boolean {
        return this._isSuccess;
    }

    /**
     * Check if result is a failure
     */
    get isFailure(): boolean {
        return !this._isSuccess;
    }

    /**
     * Get the value (throws if failure)
     */
    get value(): T {
        if (!this._isSuccess) {
            throw new Error('Cannot get value from failed result');
        }
        return this._value!;
    }

    /**
     * Get the error (throws if success)
     */
    get error(): Error {
        if (this._isSuccess) {
            throw new Error('Cannot get error from successful result');
        }
        return this._error!;
    }

    /**
     * Get error message
     */
    get errorMessage(): string {
        return this._error?.message || 'Unknown error';
    }

    /**
     * Map the value if successful
     */
    map<U>(fn: (value: T) => U): Result<U> {
        if (this._isSuccess) {
            try {
                return Result.success(fn(this._value!));
            } catch (error) {
                return Result.failure(error instanceof Error ? error : new Error(String(error)));
            }
        }
        return Result.failure(this._error!);
    }

    /**
     * Flat map (chain results)
     */
    flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
        if (this._isSuccess) {
            return fn(this._value!);
        }
        return Result.failure(this._error!);
    }

    /**
     * Execute callback if successful
     */
    onSuccess(callback: (value: T) => void): Result<T> {
        if (this._isSuccess) {
            callback(this._value!);
        }
        return this;
    }

    /**
     * Execute callback if failed
     */
    onFailure(callback: (error: Error) => void): Result<T> {
        if (!this._isSuccess) {
            callback(this._error!);
        }
        return this;
    }

    /**
     * Get value or default if failed
     */
    getValueOr(defaultValue: T): T {
        return this._isSuccess ? this._value! : defaultValue;
    }
}


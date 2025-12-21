/**
 * Base domain exception
 */
export class DomainException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DomainException';
        Object.setPrototypeOf(this, DomainException.prototype);
    }
}

/**
 * View not found exception
 */
export class ViewNotFoundException extends DomainException {
    constructor(viewName: string) {
        super(`View not found: ${viewName}`);
        this.name = 'ViewNotFoundException';
    }
}

/**
 * Action not found exception
 */
export class ActionNotFoundException extends DomainException {
    constructor(actionName: string) {
        super(`Action not found: ${actionName}`);
        this.name = 'ActionNotFoundException';
    }
}

/**
 * Controller not found exception
 */
export class ControllerNotFoundException extends DomainException {
    constructor(controllerName: string) {
        super(`Controller not found: ${controllerName}`);
        this.name = 'ControllerNotFoundException';
    }
}

/**
 * Invalid path exception
 */
export class InvalidPathException extends DomainException {
    constructor(path: string) {
        super(`Invalid path: ${path}`);
        this.name = 'InvalidPathException';
    }
}


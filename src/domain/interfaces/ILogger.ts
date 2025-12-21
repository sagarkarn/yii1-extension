/**
 * Logger interface
 * Provides centralized logging functionality
 */
export interface ILogger {
    /**
     * Log an informational message
     */
    info(message: string): void;

    /**
     * Log an error message
     */
    error(message: string, error?: Error): void;

    /**
     * Log a warning message
     */
    warn(message: string): void;

    /**
     * Log a debug message (only in development)
     */
    debug(message: string): void;

    /**
     * Show an information message to the user
     */
    showInfo(message: string): void;

    /**
     * Show an error message to the user
     */
    showError(message: string): void;

    /**
     * Show a warning message to the user
     */
    showWarning(message: string): void;
}


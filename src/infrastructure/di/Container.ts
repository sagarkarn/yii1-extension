/**
 * Simple Dependency Injection Container
 * Lightweight DI container for managing dependencies
 */
export class Container {
    private services = new Map<string, any>();
    private factories = new Map<string, () => any>();
    private singletons = new Map<string, any>();

    /**
     * Register a service instance
     */
    register<T>(key: string, instance: T): void {
        this.services.set(key, instance);
    }

    /**
     * Register a factory function
     */
    registerFactory<T>(key: string, factory: () => T, singleton: boolean = true): void {
        this.factories.set(key, factory);
        if (!singleton) {
            // For non-singletons, we'll call factory each time
        }
    }

    /**
     * Resolve a service
     */
    resolve<T>(key: string): T {
        // Check if already registered as instance
        if (this.services.has(key)) {
            return this.services.get(key) as T;
        }

        // Check if factory exists
        if (this.factories.has(key)) {
            const factory = this.factories.get(key)!;
            
            // Check if singleton and already created
            if (this.singletons.has(key)) {
                return this.singletons.get(key) as T;
            }

            // Create instance
            const instance = factory();
            
            // Store as singleton
            this.singletons.set(key, instance);
            
            return instance as T;
        }

        throw new Error(`Service not found: ${key}`);
    }

    /**
     * Check if service is registered
     */
    has(key: string): boolean {
        return this.services.has(key) || this.factories.has(key);
    }

    /**
     * Clear all registrations
     */
    clear(): void {
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
    }
}

/**
 * Service keys
 */
export const SERVICE_KEYS = {
    FileRepository: 'IFileRepository',
    PathResolver: 'IPathResolver',
    ActionParser: 'IActionParser',
    ViewLocator: 'IViewLocator',
    ControllerLocator: 'IControllerLocator',
    ConfigurationService: 'IConfigurationService',
    Logger: 'ILogger',
    FindViewsUseCase: 'FindViewsInActionUseCase',
    FindControllerUseCase: 'FindControllerFromViewUseCase',
    ParseStackTraceUseCase: 'ParseStackTraceUseCase'
} as const;


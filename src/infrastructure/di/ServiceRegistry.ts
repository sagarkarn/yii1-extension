import { Container, SERVICE_KEYS } from './Container';
import { IFileRepository } from '../../domain/interfaces/IFileRepository';
import { IPathResolver } from '../../domain/interfaces/IPathResolver';
import { IActionParser } from '../../domain/interfaces/IActionParser';
import { IViewLocator } from '../../domain/interfaces/IViewLocator';
import { IControllerLocator } from '../../domain/interfaces/IControllerLocator';
import { IConfigurationService } from '../../domain/interfaces/IConfigurationService';
import { ILogger } from '../../domain/interfaces/ILogger';
import { FileRepository } from '../file-system/FileRepository';
import { PathResolver } from '../path-resolution/PathResolver';
import { ActionParser } from '../parsing/ActionParser';
import { ViewLocator } from '../view-location/ViewLocator';
import { ControllerLocatorImpl } from '../controller-location/ControllerLocator';
import { ConfigurationService } from '../config/ConfigurationService';
import { Logger } from '../logging/Logger';
import { FindViewsInActionUseCase } from '../../application/use-cases/FindViewsInActionUseCase';
import { FindControllerFromViewUseCase } from '../../application/use-cases/FindControllerFromViewUseCase';

/**
 * Service registry
 * Registers all services in the DI container
 */
export class ServiceRegistry {
    static registerServices(container: Container): void {
        // Register configuration and logging first (they may be needed by other services)
        container.register<IConfigurationService>(
            SERVICE_KEYS.ConfigurationService,
            new ConfigurationService()
        );

        container.register<ILogger>(
            SERVICE_KEYS.Logger,
            new Logger()
        );

        // Register infrastructure services
        container.register<IFileRepository>(
            SERVICE_KEYS.FileRepository,
            new FileRepository()
        );

        container.registerFactory<IPathResolver>(
            SERVICE_KEYS.PathResolver,
            () => {
                const fileRepo = container.resolve<IFileRepository>(SERVICE_KEYS.FileRepository);
                const configService = container.resolve<IConfigurationService>(SERVICE_KEYS.ConfigurationService);
                return new PathResolver(fileRepo, configService);
            },
            true
        );

        container.register<IActionParser>(
            SERVICE_KEYS.ActionParser,
            new ActionParser()
        );

        container.registerFactory<IViewLocator>(
            SERVICE_KEYS.ViewLocator,
            () => {
                const pathResolver = container.resolve<IPathResolver>(SERVICE_KEYS.PathResolver);
                return new ViewLocator(pathResolver);
            },
            true
        );

        // Register controller locator
        container.registerFactory<IControllerLocator>(
            SERVICE_KEYS.ControllerLocator,
            () => {
                const fileRepo = container.resolve<IFileRepository>(SERVICE_KEYS.FileRepository);
                const actionParser = container.resolve<IActionParser>(SERVICE_KEYS.ActionParser);
                const configService = container.resolve<IConfigurationService>(SERVICE_KEYS.ConfigurationService);
                return new ControllerLocatorImpl(fileRepo, actionParser, configService);
            },
            true
        );

        // Register use cases
        container.registerFactory<FindViewsInActionUseCase>(
            SERVICE_KEYS.FindViewsUseCase,
            () => {
                const viewLocator = container.resolve<IViewLocator>(SERVICE_KEYS.ViewLocator);
                const actionParser = container.resolve<IActionParser>(SERVICE_KEYS.ActionParser);
                return new FindViewsInActionUseCase(viewLocator, actionParser);
            },
            true
        );

        container.registerFactory<FindControllerFromViewUseCase>(
            SERVICE_KEYS.FindControllerUseCase,
            () => {
                const controllerLocator = container.resolve<IControllerLocator>(SERVICE_KEYS.ControllerLocator);
                return new FindControllerFromViewUseCase(controllerLocator);
            },
            true
        );
    }
}


# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.9]

### Fixed
- **Controller action picker**: Navigation to action on action selection from list of action actually not working as accepted

## [0.0.8] - 2026-01-14

### Added
- **Controller action picker**: New command and keybinding to quickly jump between controller actions
  - Press `Ctrl+Shift+A` in a controller file to list all actions in the current controller
  - Filter actions by name; matching actions are updated in real time

## [0.0.7] - 2026-01-XX

### Added
- **Layout path autocomplete**: Intelligent autocomplete for layout names in `$this->layout` and `public $layout` assignments
  - Supports segment-based completion with double slash `//` paths (absolute from main app)
  - Supports dot notation paths (e.g., `application.views.layouts.main`)
  - Supports relative paths (`../layouts/main` or just `main`)
  - Module-aware: automatically detects module context and shows module layouts first
  - Progressive path building: shows directories first, then layout files
- **ViewResolver getLayoutPath()**: Added `getLayoutPath()` method matching Yii 1.1's exact pattern: `getViewPath() + DIRECTORY_SEPARATOR + 'layouts'`
- **Layout path resolution**: Layout definition and code lens providers now use ViewResolver for consistent path resolution

### Changed
- **Layout providers**: Updated layout definition and code lens providers to use ViewResolver's `getLayoutPath()` method for consistency with Yii's logic

## [0.0.6] - 2026-01-XX

### Added
- **View file creation**: Code action to create missing view files when they're not found in render() calls
- **ViewResolver**: New ViewResolver class that matches Yii 1.1's resolveViewFile() logic exactly
  - Supports double slash `//` paths (absolute from main app)
  - Supports single slash `/` paths (module views)
  - Supports dot notation paths (e.g., `application.views.layouts.main`)
  - Supports relative paths
- **Improved view path diagnostics**: View path diagnostics now use ViewResolver for accurate path resolution

### Changed
- **View path resolution**: Updated view completion provider and diagnostics to use ViewResolver matching Yii's exact logic

### Added
- **View autocomplete improvements**: More robust detection of controller and views directories for dot-notation and relative path completion.
- **Support for module-specific views**: View completions now correctly suggest files within each module's views directory, including subdirectories.

### Fixed
- **Controller info detection**: More accurate identification of current controller from path, supporting edge cases with unusual file or path names.



## [0.0.5] - 2026-01-XX

### Fixed
- **Method boundary detection**: Improved accuracy of method end detection by ignoring braces inside comments
  - Single-line comments (`//` and `#`) are now properly handled
  - Multi-line comments (`/* */`) are now properly handled
  - Prevents false method end detection when braces appear in comments

## [0.0.4] - 2025-01-XX

### Added
- **Behavior class support**: Comprehensive behavior class management and validation
  - **Behavior class autocomplete**: Intelligent suggestions for behavior class names in `behaviors()` method with dot notation support
  - **Behavior class diagnostics**: Real-time validation of behavior class files and import paths
  - **Quick fix for missing imports**: One-click import of behavior classes using `Yii::import()` statements
  - **Go to definition**: Navigate to behavior class files from `behaviors()` method references
  - **Import path validation**: Validates that behavior classes are either in `protected/config/main.php` import paths or explicitly imported
  - **Automatic cache invalidation**: Behavior cache automatically clears when behavior files are created, updated, or deleted
- **Central cache system**: Unified caching infrastructure for better performance and consistency
  - Shared cache services for behaviors, classes, and views
  - Automatic cache invalidation on file changes
- **Class locator service**: Service to find and cache all PHP classes in directories
- **Main config parser**: Parser to extract import paths from `protected/config/main.php`

### Changed
- **Behavior definition provider**: Now searches within actual `behaviors()` method boundaries instead of fixed line windows for better accuracy

## [0.0.3] - 2025-12-XX

### Added
- **Behavior class support**: Comprehensive behavior class management and validation
  - **Behavior class autocomplete**: Intelligent suggestions for behavior class names in `behaviors()` method with dot notation support
  - **Behavior class diagnostics**: Real-time validation of behavior class files and import paths
  - **Quick fix for missing imports**: One-click import of behavior classes using `Yii::import()` statements
  - **Go to definition**: Navigate to behavior class files from `behaviors()` method references
  - **Import path validation**: Validates that behavior classes are either in `protected/config/main.php` import paths or explicitly imported
  - **Automatic cache invalidation**: Behavior cache automatically clears when behavior files are created, updated, or deleted
- **Central cache system**: Unified caching infrastructure for better performance and consistency
  - Shared cache services for behaviors, classes, and views
  - Automatic cache invalidation on file changes
- **Class locator service**: Service to find and cache all PHP classes in directories
- **Main config parser**: Parser to extract import paths from `protected/config/main.php`
- **Automatic cache invalidation for view completions**: View completion cache now automatically clears when view files are created, deleted, or renamed, ensuring completions stay up-to-date without requiring extension reload
- File system watcher for view directories to monitor changes in real-time
- Status bar tooltip with information model and controller count

### Changed
- **Yii import completion**: Now provides segment-wise completion suggestions with improved diagnostics
- **View path completion**: `render()` and `renderPartial()` now support segment-wise completion with separator support for better path navigation
- View completion items now use `CompletionItemKind.Enum` instead of `CompletionItemKind.File` for better visual distinction
- Enhanced layout navigation


## [0.0.2] - 2025-12-XX

### Added
- Initial release with core features
- View path autocomplete and validation
- Navigation features (Go to View, Go to Controller, Layout navigation)
- Import path autocomplete and validation
- Validation rule diagnostics
- Code snippets


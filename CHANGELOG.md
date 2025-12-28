# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


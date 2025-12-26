# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2025-12-XX

### Added
- **Automatic cache invalidation for view completions**: View completion cache now automatically clears when view files are created, deleted, or renamed, ensuring completions stay up-to-date without requiring extension reload
- File system watcher for view directories to monitor changes in real-time
- Status bar tooltip with information model and controller count

### Changed
- **Yii import completion**: Now provides segment-wise completion suggestions with improved diagnostics
- **View path completion**: `render()` and `renderPartial()` now support segment-wise completion with separator support for better path navigation
- View completion items now use `CompletionItemKind.Enum` instead of `CompletionItemKind.File` for better visual distinction
- Inhanced layout navigation.


## [0.0.2] - 2025-12-XX

### Added
- Initial release with core features
- View path autocomplete and validation
- Navigation features (Go to View, Go to Controller, Layout navigation)
- Import path autocomplete and validation
- Validation rule diagnostics
- Code snippets


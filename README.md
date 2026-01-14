# Yii 1.1 Extension for VS Code

A comprehensive VS Code extension that enhances productivity for Yii 1.1 framework development. This extension provides intelligent navigation, autocomplete, linting, and 100+ code snippets to streamline your Yii development workflow.

## Features

### Intelligent Navigation

- **Go to View from Action**: Ctrl+Click on `render()` and `renderPartial()` calls to navigate directly to view files
- **Go to Controller from View**: Navigate from view files back to their corresponding controller actions
- **Layout Navigation**: Jump to layout files from `$this->layout` assignments with code lens support
- **Controller Action Picker**: Press `Ctrl+Shift+A` in a controller to list all actions in that controller and jump to the selected one
- **Action Navigation**: Navigate to action methods from `accessRules()` arrays
- **URL Route Navigation**: Navigate to controllers/actions from `createUrl()` and `createAbsoluteUrl()` calls
- **Import Navigation**: Navigate to imported classes via `Yii::import()` paths
- **Behavior Class Navigation**: Go to definition for behavior classes in `behaviors()` method

### Smart Autocomplete

- **View Path Autocomplete**: Intelligent suggestions for view names in `render()` and `renderPartial()` with dot notation path insertion
  - Supports segment-based completion with `//`, `/`, dot notation, and relative paths
  - Automatically updates when view files are added, removed, or renamed (no extension reload needed)
- **Layout Path Autocomplete**: Smart suggestions for layout names in `$this->layout` and `public $layout` assignments
  - Supports segment-based completion with `//`, dot notation, and relative paths
  - Module-aware: shows module layouts first, then main app layouts
  - Progressive path building: shows directories first, then layout files
- **Behavior Class Autocomplete**: Smart suggestions for behavior class names in `behaviors()` method with dot notation support
  - Automatically updates when behavior files are created, modified, or deleted
- **Import Autocomplete**: Context-aware suggestions for `Yii::import()` paths
- **Validation Rule Autocomplete**: Quick suggestions for validation rule types and model attributes

###  Real-time Linting & Diagnostics

- **View Path Validation**: Validates view file existence in `render()` and `renderPartial()` calls (works in both controllers and views)
- **Behavior Class Validation**: Comprehensive behavior class diagnostics
  - Validates behavior class file existence
  - Checks if behavior classes are in `protected/config/main.php` import paths
  - Validates explicit `Yii::import()` statements for behavior classes
  - Quick fix to automatically import missing behavior classes
- **Action Array Validation**: Ensures actions defined in `actions()` array have corresponding action methods
- **Import Path Validation**: Validates `Yii::import()` paths and file existence
- **Validation Rule Diagnostics**: Validates validation rule syntax and attribute names with hover information and quick fixes
- **Smart Method Parsing**: Accurate method boundary detection that properly handles comments and strings, ensuring reliable navigation and diagnostics

###  Code Snippets

100+ ready-to-use code snippets including:
- Controllers, actions, filters, and access rules
- Models with validation rules, relations, and lifecycle methods
- Form widgets (CActiveForm, fields, buttons, dropdowns)
- Data providers (CActiveDataProvider, CArrayDataProvider)
- Widgets (GridView, ListView, DetailView, Menu, Breadcrumbs, Tabs)
- Database queries (CDbCriteria, find methods)
- Behaviors, components, modules, and console commands
- AJAX, JSON responses, caching, and session handling


## Requirements


- PHP projects using Yii 1.1 framework

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Yii 1.1 Extension"
4. Click Install

## Usage

The extension activates automatically when you open PHP files. All features work out of the box with sensible defaults.

### Navigation

- **Ctrl+Click** on view paths, imports, or routes to navigate
- **Code lenses** appear above action methods and layout assignments for quick navigation
- **Right-click** context menu options available in views and controllers
- **Controller actions list**: Press `Ctrl+Shift+A` in a controller file to open a searchable list of its actions

### Snippets

Type snippet prefixes (e.g., `yii-controller`, `yii-action`, `yii-model`) and press Tab to expand.

### Behavior Classes

The extension provides comprehensive support for Yii 1.1 behavior classes:

- **Autocomplete**: Type behavior class names in `behaviors()` method and get intelligent suggestions
- **Validation**: Real-time diagnostics check if behavior files exist and are properly imported
- **Quick Fix**: Click the lightbulb icon to automatically add `Yii::import()` statements for missing behavior classes
- **Navigation**: Ctrl+Click on behavior class names to navigate to their definition files
- **Import Checking**: Automatically validates that behavior classes are either:
  - Listed in `protected/config/main.php` import array, or
  - Explicitly imported using `Yii::import()` statements

Example:
```php
public function behaviors()
{
    return array(
        'myBehavior' => array('class' => 'MyBehavior')
    );
}
```




## License

MIT

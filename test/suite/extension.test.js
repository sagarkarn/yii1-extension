const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { YiiViewDefinitionProvider } = require('../../out/viewDefinitionProvider');
const { YiiImportProvider } = require('../../out/yiiImportProvider');
const { ClassLocator } = require('../../out/infrastructure/class-location/ClassLocator');
const { Class } = require('../../out/domain/entities/Class');

describe('Yii 1.1 Extension Integration Tests', function () {
    this.timeout(30000);
    const workspaceRoot = process.env.YII_APP_PATH;

    before(async () => {
        // Override ClassLocator to prevent scanning the entire workspace and timing out
        ClassLocator.prototype.getAllBehaviorClasses = function (dirPath) {
            return [
                Class.fromRaw({
                    name: 'TempTestBehavior',
                    parentClass: 'CActiveRecordBehavior',
                    filePath: path.join(workspaceRoot, 'protected', 'components', 'TempTestBehavior.php'),
                    isAbstract: false
                }),
                Class.fromRaw({
                    name: 'TempUnimportedBehavior',
                    parentClass: 'CActiveRecordBehavior',
                    filePath: path.join(workspaceRoot, 'protected', 'helpers', 'TempUnimportedBehavior.php'),
                    isAbstract: false
                })
            ];
        };

        // Wait for the extension to be activated
        const ext = vscode.extensions.getExtension('sagarkarn.yii1-extension');
        if (ext) {
            await ext.activate();
        }
    });

    it('should activate extension', () => {
        const ext = vscode.extensions.getExtension('sagarkarn.yii1-extension');
        assert.ok(ext);
        assert.strictEqual(ext.isActive, true);
    });

    it('should resolve relative view paths from controller render call', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);

        let lineNum = -1;
        for (let i = 0; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes("render('forgotpassword'")) {
                lineNum = i;
                break;
            }
        }

        assert.notStrictEqual(lineNum, -1, 'Could not find render statement in SiteController.php');

        const lineText = doc.lineAt(lineNum).text;
        const charIndex = lineText.indexOf('forgotpassword') + 3; // cursor inside the string
        const position = new vscode.Position(lineNum, charIndex);

        const provider = new YiiViewDefinitionProvider();
        const tokenSource = new vscode.CancellationTokenSource();

        const definitions = await provider.provideDefinition(doc, position, tokenSource.token);

        assert.ok(definitions, 'Should return definition location');
        const location = Array.isArray(definitions) ? definitions[0] : definitions;
        assert.ok(location);

        const resolvedUri = location.uri || location.targetUri;
        const expectedPath = path.join(workspaceRoot, 'protected', 'views', 'site', 'forgotpassword.php');
        assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should resolve deeply nested themes dot-notation view path', async () => {
        const mockControllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'MockController.php');

        const fileContent = `<?php
class MockController extends Controller {
    public function actionTest() {
        $this->render('application.views.themes.default.forms.Interview.interview-landing', array());
    }
}
`;
        fs.writeFileSync(mockControllerPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockControllerPath);
            const doc = await vscode.workspace.openTextDocument(uri);

            const position = new vscode.Position(3, 30); // inside dot-notation string

            const provider = new YiiViewDefinitionProvider();
            const tokenSource = new vscode.CancellationTokenSource();
            const definitions = await provider.provideDefinition(doc, position, tokenSource.token);

            assert.ok(definitions, 'Should resolve dot notation view');
            const location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);

            const resolvedUri = location.uri || location.targetUri;
            const expectedPath = path.join(workspaceRoot, 'protected', 'views', 'themes', 'default', 'forms', 'Interview', 'interview-landing.php');
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());
        } finally {
            if (fs.existsSync(mockControllerPath)) {
                fs.unlinkSync(mockControllerPath);
            }
        }
    });

    it('should resolve Yii::import() definitions', async () => {
        const mockFilePath = path.join(workspaceRoot, 'protected', 'controllers', 'MockImportController.php');
        const fileContent = `<?php
class MockImportController extends Controller {
    public function init() {
        Yii::import('application.components.Controller');
    }
}
`;
        fs.writeFileSync(mockFilePath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockFilePath);
            const doc = await vscode.workspace.openTextDocument(uri);

            const position = new vscode.Position(3, 40); // Inside 'application.components.Controller'

            const provider = new YiiImportProvider();
            const tokenSource = new vscode.CancellationTokenSource();
            const definitions = await provider.provideDefinition(doc, position, tokenSource.token);

            assert.ok(definitions, 'Should resolve Yii::import definition');
            const location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);

            const resolvedUri = location.uri || location.targetUri;
            const expectedPath = path.join(workspaceRoot, 'protected', 'components', 'Controller.php');
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());
        } finally {
            if (fs.existsSync(mockFilePath)) {
                fs.unlinkSync(mockFilePath);
            }
        }
    });

    it('should autocomplete Yii::import() paths', async () => {
        const mockFilePath = path.join(workspaceRoot, 'protected', 'controllers', 'MockAutocompleteController.php');
        const fileContent = `<?php
class MockAutocompleteController extends Controller {
    public function init() {
        Yii::import('application.components.');
    }
}
`;
        fs.writeFileSync(mockFilePath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockFilePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            const position = new vscode.Position(3, 44); // position right after dot

            const completions = await vscode.commands.executeCommand(
                'vscode.executeCompletionItemProvider',
                uri,
                position
            );

            assert.ok(completions);
            const items = completions.items;
            assert.ok(items.length > 0, 'Should return component completions');

            const hasController = items.some(item => item.label === 'Controller');
            assert.strictEqual(hasController, true, 'Autocomplete list should contain Controller');
        } finally {
            if (fs.existsSync(mockFilePath)) {
                fs.unlinkSync(mockFilePath);
            }
        }
    });

    it('should execute yii1.goToController command', async () => {
        const viewPath = path.join(workspaceRoot, 'protected', 'views', 'site', 'forgotpassword.php');
        const uri = vscode.Uri.file(viewPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // Execute command
        await vscode.commands.executeCommand('yii1.goToController');

        // Verify active editor is now the SiteController
        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should execute yii1.goToViewFromAction command', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        // Position inside actionForgotpassword method body (line index 405)
        editor.selection = new vscode.Selection(new vscode.Position(405, 10), new vscode.Position(405, 10));

        // Execute command
        await vscode.commands.executeCommand('yii1.goToViewFromAction');

        // Verify active editor is now the forgotpassword view
        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'views', 'site', 'forgotpassword.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should autocomplete view paths', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        let lineNum = -1;
        for (let i = 0; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes("render('forgotpassword'")) {
                lineNum = i;
                break;
            }
        }

        assert.notStrictEqual(lineNum, -1, 'Could not find render statement in SiteController.php');

        const lineText = doc.lineAt(lineNum).text;
        const charIndex = lineText.indexOf('forgotpassword') + 3; // cursor inside the string
        const position = new vscode.Position(lineNum, charIndex);

        const completions = await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            position
        );

        assert.ok(completions);
        const items = completions.items;
        assert.ok(items.length > 0, 'Should return view autocomplete items');

        const hasForgotPassword = items.some(item => item.label === 'forgotpassword');
        assert.strictEqual(hasForgotPassword, true, 'Autocomplete list should contain forgotpassword');
    });

    it('should resolve absolute layout paths starting with //', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        let lineNum = -1;
        for (let i = 0; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes("$this->layout = 'login'")) {
                lineNum = i;
                break;
            }
        }
        assert.notStrictEqual(lineNum, -1, 'Could not find layout assignment in SiteController.php');

        // Execute goToLayout command with absolute layout '//layouts/column2'
        await vscode.commands.executeCommand('yii1.goToLayout', doc.uri, '//layouts/column2');

        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'views', 'layouts', 'column2.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should resolve standard layout paths relative to views/layouts', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // Execute goToLayout command for 'login' layout
        await vscode.commands.executeCommand('yii1.goToLayout', doc.uri, 'login');

        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'views', 'layouts', 'login.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should autocomplete layout paths', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        let lineNum = -1;
        for (let i = 0; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes("$this->layout = 'login'")) {
                lineNum = i;
                break;
            }
        }
        assert.notStrictEqual(lineNum, -1, 'Could not find layout assignment in SiteController.php');

        const lineText = doc.lineAt(lineNum).text;
        const charIndex = lineText.indexOf('login') + 2; // cursor inside string: 'lo|gin'
        const position = new vscode.Position(lineNum, charIndex);

        const completions = await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            position
        );

        assert.ok(completions);
        const items = completions.items;
        assert.ok(items.length > 0, 'Should return layout autocomplete items');
        const hasLogin = items.some(item => item.label === 'login');
        assert.strictEqual(hasLogin, true, 'Autocomplete list should contain login');
    });

    it('should execute yii1.goToController command in a module view', async () => {
        const viewPath = path.join(workspaceRoot, 'protected', 'modules', 'Configuration', 'modules', 'AssignmentConfiguration', 'views', 'AssignmentConfiguration', '_form.php');
        const uri = vscode.Uri.file(viewPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // Execute command
        await vscode.commands.executeCommand('yii1.goToController');

        // Verify active editor is now the AssignmentConfigurationController
        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'modules', 'Configuration', 'modules', 'AssignmentConfiguration', 'controllers', 'AssignmentConfigurationController.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should execute yii1.createBehaviorFile command and generate behavior boilerplate', async () => {
        const tempBehaviorPath = path.join(workspaceRoot, 'protected', 'components', 'TempTestBehavior.php');
        if (fs.existsSync(tempBehaviorPath)) {
            fs.unlinkSync(tempBehaviorPath);
        }

        try {
            await vscode.commands.executeCommand('yii1.createBehaviorFile', tempBehaviorPath, 'TempTestBehavior');

            // Verify file was created
            assert.strictEqual(fs.existsSync(tempBehaviorPath), true, 'Behavior file should be created');

            // Verify file content structure
            const content = fs.readFileSync(tempBehaviorPath, 'utf8');
            console.log('--- TempTestBehavior.php content:');
            console.log(content);
            console.log('---------------------------------');
            assert.strictEqual(content.includes('class TempTestBehavior extends CActiveRecordBehavior'), true);
            assert.strictEqual(content.includes('public function attach($owner)'), true);

            // Verify active editor is the newly created file
            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor);
            assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), tempBehaviorPath.toLowerCase());
        } finally {
            if (fs.existsSync(tempBehaviorPath)) {
                fs.unlinkSync(tempBehaviorPath);
            }
        }
    });

    it('should parse all actions correctly in ActionParser', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);

        const { ActionParser } = require('../../out/infrastructure/parsing/ActionParser');
        const parser = new ActionParser();

        const actions = await parser.findAllActions(doc);
        assert.ok(actions.length > 0);

        const hasLogin = actions.some(action => action.name === 'actionLogin');
        const hasForgotpassword = actions.some(action => action.name === 'actionForgotpassword');

        assert.strictEqual(hasLogin, true, 'Should parse actionLogin');
        assert.strictEqual(hasForgotpassword, true, 'Should parse actionForgotpassword');
    });

    it('should show quickpick for yii1.pickActionInController without crashing', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // Trigger command, which creates a quick pick and shows it
        await vscode.commands.executeCommand('yii1.pickActionInController');

        // Wait briefly for quick pick to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify active editor is still valid
        assert.ok(vscode.window.activeTextEditor);
        assert.strictEqual(vscode.window.activeTextEditor.document.uri.fsPath.toLowerCase(), uri.fsPath.toLowerCase());
    });

    it('should do nothing or warn when yii1.goToViewFromAction cursor is not on a view string', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        let lineNum = -1;
        for (let i = 0; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes("private function findUserByEmail(")) {
                lineNum = i + 2;
                break;
            }
        }
        assert.notStrictEqual(lineNum, -1);
        editor.selection = new vscode.Selection(new vscode.Position(lineNum, 10), new vscode.Position(lineNum, 10));

        // Execute command
        await vscode.commands.executeCommand('yii1.goToViewFromAction');

        // Active editor should still be the SiteController
        const activeEditor = vscode.window.activeTextEditor;
        assert.ok(activeEditor);
        const expectedPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        assert.strictEqual(activeEditor.document.uri.fsPath.toLowerCase(), expectedPath.toLowerCase());
    });

    it('should generate diagnostics for unresolved view paths', async () => {
        const mockDiagPath = path.join(workspaceRoot, 'protected', 'controllers', 'MockDiagController.php');
        const fileContent = `<?php
class MockDiagController extends Controller {
    public function actionTest() {
        $this->render('does_not_exist_at_all');
    }
}
`;
        fs.writeFileSync(mockDiagPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockDiagPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Wait briefly for diagnostics to process
            await new Promise(resolve => setTimeout(resolve, 1500));

            const diagnostics = vscode.languages.getDiagnostics(uri);
            assert.ok(diagnostics.length > 0, 'Should generate at least one diagnostic');

            const viewDiagnostic = diagnostics.find(d => d.code === 'view-file-missing');
            assert.ok(viewDiagnostic, 'Should have diagnostic with code view-file-missing');
            assert.strictEqual(viewDiagnostic.severity, vscode.DiagnosticSeverity.Error);
            assert.ok(viewDiagnostic.message.includes('does_not_exist_at_all'));
        } finally {
            if (fs.existsSync(mockDiagPath)) {
                fs.unlinkSync(mockDiagPath);
            }
        }
    });

    it('should resolve createUrl routes to controller action method', async () => {
        const mockUrlControllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'MockUrlController.php');
        const fileContent = `<?php
class MockUrlController extends Controller {
    public function actionTest() {
        $url = Yii::app()->createUrl('site/forgotpassword');
    }
}
`;
        fs.writeFileSync(mockUrlControllerPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockUrlControllerPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Locate position of 'site/forgotpassword' route inside createUrl
            const lineNum = 3;
            const lineText = doc.lineAt(lineNum).text;
            const charIndex = lineText.indexOf('site/forgotpassword') + 2; // cursor inside the route
            const position = new vscode.Position(lineNum, charIndex);

            // Trigger definition provider (F12)
            const definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            assert.ok(definitions, 'Should resolve createUrl route');
            const location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);

            const resolvedUri = location.uri || location.targetUri;
            const expectedPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());
        } finally {
            if (fs.existsSync(mockUrlControllerPath)) {
                fs.unlinkSync(mockUrlControllerPath);
            }
        }
    });

    it('should resolve accessRules action names to action methods in same file', async () => {
        const mockRulesControllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'MockRulesController.php');
        const fileContent = `<?php
class MockRulesController extends Controller {
    public function accessRules() {
        return array(
            array('allow',
                'actions'=>array('testme'),
                'users'=>array('*'),
            ),
        );
    }
    public function actionTestme() {
        // dummy
    }
}
`;
        fs.writeFileSync(mockRulesControllerPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockRulesControllerPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Locate position of 'testme' inside actions array
            const lineNum = 5;
            const lineText = doc.lineAt(lineNum).text;
            const charIndex = lineText.indexOf('testme') + 2; // cursor inside string
            const position = new vscode.Position(lineNum, charIndex);

            // Trigger definition provider
            const definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            assert.ok(definitions, 'Should resolve accessRules action');
            const location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);

            // Location should point to the actionTestme method in the same file
            const resolvedUri = location.uri || location.targetUri;
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), uri.fsPath.toLowerCase());

            // Check target position
            const range = location.range || location.targetRange;
            assert.strictEqual(range.start.line, 10); // line 10 is public function actionTestme()
        } finally {
            if (fs.existsSync(mockRulesControllerPath)) {
                fs.unlinkSync(mockRulesControllerPath);
            }
        }
    });

    it('should resolve $this->layout assignments to layout view files', async () => {
        const mockLayoutControllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'MockLayoutController.php');
        const fileContent = `<?php
class MockLayoutController extends Controller {
    public $layout = 'login';
    public function actionIndex() {
        $this->layout = 'column2';
    }
}
`;
        fs.writeFileSync(mockLayoutControllerPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockLayoutControllerPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // 1. Resolve public $layout = 'login'
            let lineNum = 2;
            let lineText = doc.lineAt(lineNum).text;
            let charIndex = lineText.indexOf('login') + 2;
            let position = new vscode.Position(lineNum, charIndex);

            let definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            assert.ok(definitions, 'Should resolve public layout declaration');
            let location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);
            let resolvedUri = location.uri || location.targetUri;
            let expectedPath = path.join(workspaceRoot, 'protected', 'views', 'layouts', 'login.php');
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());

            // 2. Resolve $this->layout = 'column2'
            lineNum = 4;
            lineText = doc.lineAt(lineNum).text;
            charIndex = lineText.indexOf('column2') + 2;
            position = new vscode.Position(lineNum, charIndex);

            definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            assert.ok(definitions, 'Should resolve layout assignment');
            location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);
            resolvedUri = location.uri || location.targetUri;
            expectedPath = path.join(workspaceRoot, 'protected', 'views', 'layouts', 'column2.php');
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), expectedPath.toLowerCase());
        } finally {
            if (fs.existsSync(mockLayoutControllerPath)) {
                fs.unlinkSync(mockLayoutControllerPath);
            }
        }
    });

    it('should generate validation diagnostics for model rules', async () => {
        const mockModelPath = path.join(workspaceRoot, 'protected', 'models', 'MockModel.php');
        const fileContent = `<?php
class MockModel extends CActiveRecord {
    public $email;
    public $status;
    
    public function rules() {
        return array(
            array('email', 'email'),
            array('status', 'invalidValidatorType'),
            array('email', 'email'), // Duplicate rule
        );
    }
}
`;
        fs.writeFileSync(mockModelPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockModelPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Wait briefly for diagnostics to process
            await new Promise(resolve => setTimeout(resolve, 1500));

            const diagnostics = vscode.languages.getDiagnostics(uri);
            assert.ok(diagnostics.length > 0, 'Should generate validation diagnostics');

            // Find duplicate-rule warning
            const dupWarning = diagnostics.find(d => d.code === 'duplicate-rule');
            assert.ok(dupWarning, 'Should have duplicate rule warning');
            assert.strictEqual(dupWarning.severity, vscode.DiagnosticSeverity.Warning);

            // Find unknown-validator warning
            const unknownWarning = diagnostics.find(d => d.code === 'unknown-validator');
            assert.ok(unknownWarning, 'Should have unknown validator warning');
            assert.strictEqual(unknownWarning.severity, vscode.DiagnosticSeverity.Warning);
            assert.ok(unknownWarning.message.includes('invalidValidatorType'));
        } finally {
            if (fs.existsSync(mockModelPath)) {
                fs.unlinkSync(mockModelPath);
            }
        }
    });

    it('should resolve behavior definition and provide autocompletions in behaviors method', async () => {
        const mockModelBehaviorsPath = path.join(workspaceRoot, 'protected', 'models', 'MockBehaviorsModel.php');
        const fileContent = `<?php
class MockBehaviorsModel extends CActiveRecord {
    public function behaviors() {
        return array(
            'TempTestBehavior' => array(
                'class' => 'TempTestBehavior',
            )
        );
    }
}
`;
        fs.writeFileSync(mockModelBehaviorsPath, fileContent, 'utf8');

        // Write a behavior file class so it can be resolved
        const behaviorPath = path.join(workspaceRoot, 'protected', 'components', 'TempTestBehavior.php');
        const behaviorContent = `<?php
class TempTestBehavior extends CActiveRecordBehavior {
}
`;
        fs.writeFileSync(behaviorPath, behaviorContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockModelBehaviorsPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Wait briefly for watcher & class caches to update
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Locate position of TempTestBehavior class string
            const lineNum = 5;
            const lineText = doc.lineAt(lineNum).text;
            const charIndex = lineText.indexOf('TempTestBehavior') + 2;
            const position = new vscode.Position(lineNum, charIndex);

            // 1. Test Definition Resolution
            const definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            assert.ok(definitions, 'Should resolve behavior definition');
            const location = Array.isArray(definitions) ? definitions[0] : definitions;
            assert.ok(location);
            const resolvedUri = location.uri || location.targetUri;
            assert.strictEqual(resolvedUri.fsPath.toLowerCase(), behaviorPath.toLowerCase());

            // 2. Test Autocomplete
            const completions = await vscode.commands.executeCommand(
                'vscode.executeCompletionItemProvider',
                uri,
                position
            );

            assert.ok(completions, 'Should return autocomplete items');
            const items = completions.items;
            const hasBehavior = items.some(item => item.label === 'TempTestBehavior');
            assert.strictEqual(hasBehavior, true, 'Autocomplete should offer TempTestBehavior');
        } finally {
            if (fs.existsSync(mockModelBehaviorsPath)) {
                fs.unlinkSync(mockModelBehaviorsPath);
            }
            if (fs.existsSync(behaviorPath)) {
                fs.unlinkSync(behaviorPath);
            }
        }
    });

    it('should generate diagnostics and offer Quick Fix code action to import behavior or create behavior', async () => {
        const mockModelDiagnosticsPath = path.join(workspaceRoot, 'protected', 'models', 'MockBehaviorDiagModel.php');
        const fileContent = `<?php
class MockBehaviorDiagModel extends CActiveRecord {
    public function behaviors() {
        return array(
            'MissingBehavior' => array(
                'class' => 'MissingBehavior',
            )
        );
    }
}
`;
        fs.writeFileSync(mockModelDiagnosticsPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockModelDiagnosticsPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Wait for diagnostics to process
            await new Promise(resolve => setTimeout(resolve, 1500));

            const diagnostics = vscode.languages.getDiagnostics(uri);
            assert.ok(diagnostics.length > 0);

            const behaviorMissingDiag = diagnostics.find(d => d.code === 'behavior-file-missing');
            assert.ok(behaviorMissingDiag, 'Should have behavior-file-missing diagnostic');

            // Trigger code actions at diagnostic range
            const codeActions = await vscode.commands.executeCommand(
                'vscode.executeCodeActionProvider',
                uri,
                behaviorMissingDiag.range
            );

            assert.ok(codeActions, 'Should return code actions');
            const createAction = codeActions.find(action => action.title.includes('Create behavior file'));
            assert.ok(createAction, 'Should have code action to create behavior file');
            assert.strictEqual(createAction.command.command, 'yii1.createBehaviorFile');
        } finally {
            if (fs.existsSync(mockModelDiagnosticsPath)) {
                fs.unlinkSync(mockModelDiagnosticsPath);
            }
        }
    });

    it('should generate diagnostics for unimported behavior and offer Quick Fix to import it', async () => {
        // Write unimported behavior inside protected/helpers/ (which is not in config/main.php imports)
        const unimportedBehaviorPath = path.join(workspaceRoot, 'protected', 'helpers', 'TempUnimportedBehavior.php');
        const unimportedBehaviorContent = `<?php
class TempUnimportedBehavior extends CActiveRecordBehavior {
}
`;
        // Ensure directory exists
        if (!fs.existsSync(path.dirname(unimportedBehaviorPath))) {
            fs.mkdirSync(path.dirname(unimportedBehaviorPath), { recursive: true });
        }
        fs.writeFileSync(unimportedBehaviorPath, unimportedBehaviorContent, 'utf8');

        const mockModelUnimportedPath = path.join(workspaceRoot, 'protected', 'models', 'MockModelUnimported.php');
        const fileContent = `<?php
class MockModelUnimported extends CActiveRecord {
    public function behaviors() {
        return array(
            'TempUnimportedBehavior' => array(
                'class' => 'TempUnimportedBehavior',
            )
        );
    }
}
`;
        fs.writeFileSync(mockModelUnimportedPath, fileContent, 'utf8');

        try {
            const uri = vscode.Uri.file(mockModelUnimportedPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            // Wait for class scanner to scan new file
            await new Promise(resolve => setTimeout(resolve, 2000));

            const diagnostics = vscode.languages.getDiagnostics(uri);
            const notImportedDiag = diagnostics.find(d => d.code === 'behavior-not-imported');
            assert.ok(notImportedDiag, 'Should have behavior-not-imported diagnostic');

            // Get code actions
            const codeActions = await vscode.commands.executeCommand(
                'vscode.executeCodeActionProvider',
                uri,
                notImportedDiag.range
            );
            assert.ok(codeActions);
            const importAction = codeActions.find(action => action.title.includes('Import behavior class'));
            assert.ok(importAction, 'Should have Quick Fix to import behavior class');
            assert.strictEqual(importAction.command.command, 'yii1.importBehaviorClass');

            // Execute the import command manually
            const dotNotation = 'application.helpers.TempUnimportedBehavior';
            await vscode.commands.executeCommand('yii1.importBehaviorClass', uri, dotNotation);

            // Verify the file was updated with Yii::import
            const updatedDoc = await vscode.workspace.openTextDocument(uri);
            const updatedText = updatedDoc.getText();
            assert.ok(updatedText.includes("Yii::import('application.helpers.TempUnimportedBehavior');"));
        } finally {
            if (fs.existsSync(mockModelUnimportedPath)) {
                fs.unlinkSync(mockModelUnimportedPath);
            }
            if (fs.existsSync(unimportedBehaviorPath)) {
                fs.unlinkSync(unimportedBehaviorPath);
            }
        }
    });

    it('should support code lenses for controllers, actions and layouts', async () => {
        const controllerPath = path.join(workspaceRoot, 'protected', 'controllers', 'SiteController.php');
        const uri = vscode.Uri.file(controllerPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        const codeLenses = await vscode.commands.executeCommand(
            'vscode.executeCodeLensProvider',
            uri
        );

        assert.ok(codeLenses, 'Should retrieve code lenses');
        assert.ok(codeLenses.length > 0, 'Should have at least one code lens in controller');

        // Find if we have controller, layout or action code lenses
        const hasYiiLens = codeLenses.some(lens =>
            lens.command &&
            (lens.command.command === 'yii1.goToController' ||
                lens.command.command === 'yii1.goToViewFromAction' ||
                lens.command.command === 'yii1.goToLayout')
        );
        assert.strictEqual(hasYiiLens, true, 'Should provide one of yii1.goTo* code lenses');
    });
});

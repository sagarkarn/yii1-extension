const path = require('path');
const assert = require('assert');
const dotenv = require('dotenv');

const { getModuleFromPath, resolveDotNotationPath } = require('../out/infrastructure/utils/moduleUtils');

describe('Yii Extension Path Resolution Tests', () => {
    const testWorkspace = process.env.YII_APP_PATH;

    describe('getModuleFromPath', () => {
        it('should extract standard single-level module path', () => {
            const filePath = path.join(testWorkspace, 'protected', 'modules', 'Configuration', 'controllers', 'DefaultController.php');
            const result = getModuleFromPath(filePath, testWorkspace);
            assert.strictEqual(result, 'Configuration');
        });

        it('should extract nested multi-level module path', () => {
            const filePath = path.join(testWorkspace, 'protected', 'modules', 'Configuration', 'modules', 'ApiConfiguration', 'controllers', 'ApiConfigurationController.php');
            const result = getModuleFromPath(filePath, testWorkspace);
            assert.strictEqual(result, 'Configuration/modules/ApiConfiguration');
        });
    });

    describe('resolveDotNotationPath', () => {
        it('should resolve deeply nested dot-notation view path', () => {
            const viewAlias = 'application.views.themes.default.forms.Interview.interview-landing';
            const result = resolveDotNotationPath(testWorkspace, viewAlias, false);
            const expected = path.join(testWorkspace, 'protected', 'views', 'themes', 'default', 'forms', 'Interview', 'interview-landing.php');
            assert.strictEqual(result, expected);
        });

        it('should resolve module dot-notation view path', () => {
            const viewAlias = 'application.modules.Configuration.views.default.index';
            const result = resolveDotNotationPath(testWorkspace, viewAlias, false);
            const expected = path.join(testWorkspace, 'protected', 'modules', 'Configuration', 'views', 'default', 'index.php');
            assert.strictEqual(result, expected);
        });

        it('should resolve deeply nested dot-notation partial view path with fallback checking', () => {
            const viewAlias = 'application.views.themes.default.forms.Interview.interview-landing';
            const result = resolveDotNotationPath(testWorkspace, viewAlias, true);
            const expected = path.join(testWorkspace, 'protected', 'views', 'themes', 'default', 'forms', 'Interview', 'interview-landing.php');
            assert.strictEqual(result, expected);
        });
    });
});

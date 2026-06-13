const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../');

        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // The workspace path to open for testing
        const workspacePath = 'D:\\projects\\kellysandbox-program';

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                workspacePath,
                '--disable-extensions', // Disable other extensions to avoid interference
                '--skip-welcome'        // Skip welcome screens
            ]
        });
    } catch (err) {
        console.error('Failed to run integration tests', err);
        process.exit(1);
    }
}

main();

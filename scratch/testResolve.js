const { getModuleFromPath } = require('../out/infrastructure/utils/moduleUtils');
const path = require('path');

const projectRoot = 'D:\\projects\\kellysandbox-program';
const controllerPath = 'D:\\projects\\kellysandbox-program\\protected\\modules\\Configuration\\modules\\ApiConfiguration\\controllers\\ApiConfigurationController.php';

const result = getModuleFromPath(controllerPath, projectRoot);
console.log('Extracted Module Name:', result);
if (result === 'Configuration/modules/ApiConfiguration') {
    console.log('TEST PASSED!');
} else {
    console.log('TEST FAILED!');
    process.exit(1);
}

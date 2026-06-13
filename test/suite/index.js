require('../setup');
const path = require('path');
const Mocha = require('mocha');
const fs = require('fs');

function run() {
    // Create the mocha test runner with BDD interface
    const mocha = new Mocha({
        ui: 'bdd',
        color: true
    });

    const suiteDir = __dirname;

    return new Promise((c, e) => {
        fs.readdir(suiteDir, (err, files) => {
            if (err) {
                return e(err);
            }

            // Add files to mocha
            files.forEach(f => {
                if (f.endsWith('.test.js')) {
                    mocha.addFile(path.resolve(suiteDir, f));
                }
            });

            try {
                // Run tests
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                console.error(err);
                e(err);
            }
        });
    });
}

module.exports = {
    run
};

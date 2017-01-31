// Karma configuration
// Generated on Mon Oct 17 2016 09:53:01 GMT+0200 (CEST)

var webpackConfig = require('./karma.webpack.config');

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [
      'tests/*_test.js',
      'tests/**/*_test.js'
    ],


    // list of files to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
        'tests/*_test.js': ['webpack'],
        'tests/**/*_test.js': ['webpack']
    },

    webpack: webpackConfig,

    webpackMiddleware: {
      noInfo: true
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJSCustom'],

    customLaunchers: {
        PhantomJSCustom: {
            base: 'PhantomJS',
            options: {
                onCallback: function(data){
                    if (data.type === "render") {
                        // this function will not have the scope of karma.conf.js so we must define any global variable inside it
                        if (window.renderId === undefined) { window.renderId = 0; }
                        page.render(data.fname || ("screenshot_" + (window.renderId++) + ".png"));
                    }
                }
            }
        }
    },

    reporters: ['progress','coverage'],

    coverageReporter: {
        dir: 'tests/coverage',
        type: 'text',
        instrumenters: { isparta : require('isparta') },
        instrumenter: {
            '**/*.js': 'isparta'
        }
    },


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  })
}

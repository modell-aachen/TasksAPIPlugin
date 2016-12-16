var baseConfig = require('./base.webpack.config.js');
var path = require('path');
var projectRoot = path.resolve(__dirname);
var webpack = require('webpack');
var merge = require('webpack-merge');

module.exports = merge.smart(baseConfig, {
	// eslint: {
	// 	configFile: projectRoot + '/.eslintrc'
	// },
	// module: {
	// 	preLoaders: [
	//       {
	//         test: /\.vue$/,
	//         loader: "eslint",
	//         include: [
	//           projectRoot + '/dev',
	//           projectRoot + '/tests'
	//         ]
	//       },
	//     ]
	// }
});
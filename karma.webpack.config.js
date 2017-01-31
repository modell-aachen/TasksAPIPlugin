var baseConfig = require('./development.webpack.config.js');
var webpack = require('webpack');
var merge = require('webpack-merge');

module.exports = merge(baseConfig, {
	vue: {
	    loaders: {
	      js: 'isparta'
	    }
	},
	plugins: [
		new webpack.ProvidePlugin({
			$: "jquery",
			moment: "moment"
		})
	]
});
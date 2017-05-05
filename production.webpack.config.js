var baseConfig = require('./base.webpack.config.js');
var webpack = require('webpack');
var merge = require('webpack-merge');

module.exports = merge.smart(baseConfig, {
	plugins: [
		new webpack.optimize.UglifyJsPlugin({
			sourceMap: true
		}),
		new webpack.optimize.AggressiveMergingPlugin(),
		new webpack.DefinePlugin({
	      'process.env': {
	        NODE_ENV: '"production"'
	      }
	    })
	]
});
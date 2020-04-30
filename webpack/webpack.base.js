const path = require('path');
const webpack = require('webpack');

// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');
// const FilterWarningsPlugin = require('webpack-filter-warnings-plugin');
// const { BaseHrefWebpackPlugin } = require('base-href-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = function (isDev) {
  let config = {
    entry: './src/index.tsx',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
            },
          ],
        },
        {
          test: /\.(jpg|png|gif|otf|ttf|woff|woff2|cur|ani|ico|svg|eot)$/,
          use: [
            {
              loader: 'url-loader',
              options: {
                esModule: false,
              },
            },
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      modules: ['node_modules'],
    },
    plugins: [
      // new BundleAnalyzerPlugin({
      //   analyzerMode: "static",
      //   openAnalyzer: false,
      //   reportFilename: './report.html',
      // }),
      new CleanWebpackPlugin({
        cleanStaleWebpackAssets: false,
      }),
      // new FilterWarningsPlugin({
      //   exclude: /System.import/,
      // }),
      new HtmlWebpackPlugin({
        // title: 'REI Scheduler',
        template: './public/index.html',
        favicon: './public/favicon.ico',
        // inject: 'head',
        // chunks: 'all',
      }),
      // new BaseHrefWebpackPlugin({
      //   baseHref: isDev ? '' : '/',
      // }),
      new webpack.ProgressPlugin(),
    ],
    output: {
      path: path.resolve(__dirname, '../build'),
      filename: '[name].[hash].bundle.js',
    },
    performance: {
      hints: false,
    },
    optimization: {
      noEmitOnErrors: true,
      moduleIds: 'hashed',
      runtimeChunk: 'single',
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    },
  };

  return config;
}

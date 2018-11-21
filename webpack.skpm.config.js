const webpack = require('webpack')

module.exports = config => {
  //config.resolve.extensions = ['.sketch.js', '.js', '.jsx']
  //config.resolveLoader = {
  //  modules: ['node_modules']
  //}
  config.module.rules.push({
    test: /\.(html)$/,
    use: [
      {
        loader: "@skpm/extract-loader",
      },
      {
        loader: "html-loader",
        options: {
          attrs: ['img:src', 'link:href'],
          interpolate: true,
        },
      },
    ]
  })
  config.module.rules.push({
    test: /\.(css)$/,
    use: [{
        loader: "@skpm/extract-loader",
      },
      {
        loader: "css-loader",
      },
    ]
  })
}
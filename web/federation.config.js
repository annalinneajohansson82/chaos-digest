const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({

  name: 'chaos-digest',

  exposes: {
    './routes': './src/app/app.routes.ts',
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // marked CLI/Node.js-only entry points — not needed in the browser
    'marked/bin/marked',
    'marked/marked.min.js',
  ]

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0
  
});

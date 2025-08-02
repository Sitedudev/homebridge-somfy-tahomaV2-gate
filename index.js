const { TahomaPlatform } = require('./src/platform');

module.exports = (api) => {
  api.registerPlatform('TahomaGate', TahomaPlatform);
};

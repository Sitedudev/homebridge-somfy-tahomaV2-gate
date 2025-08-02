const { TahomaPlatform } = require('./src/platform');

module.exports = (api) => {
  api.registerPlatform('homebridge-somfy-tahoma-gate', 'TahomaGate', TahomaPlatform);
};
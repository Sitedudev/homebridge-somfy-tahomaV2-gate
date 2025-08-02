const { TahomaPlatform } = require('./platform');

module.exports = (homebridge) => {
  homebridge.registerPlatform('homebridge-somfy-tahoma-gate', 'TahomaPortail', TahomaPlatform);
};

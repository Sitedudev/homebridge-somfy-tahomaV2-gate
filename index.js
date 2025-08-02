const { TahomaPlatform } = require('./src/platform');

module.exports = (homebridge) => {
  homebridge.registerPlatform('homebridge-somfy-tahoma-portail', 'TahomaPortail', TahomaPlatform);
};

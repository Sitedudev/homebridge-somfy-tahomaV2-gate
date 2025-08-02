const { TahomaPlatform } = require('./platform');

module.exports = (api) => {
  api.registerPlatform('TahomaPortail', TahomaPlatform);
};

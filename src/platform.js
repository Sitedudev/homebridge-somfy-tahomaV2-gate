const axios = require('axios');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.session = null;
    api.on('didFinishLaunching', () => {
      this.init();
    
      if (api.registerPlatformAction) {
        api.registerPlatformAction('TahomaGate', 'forceUpdate', async () => {
          this.log('🔄 Mise à jour manuelle demandée depuis Homebridge UI.');
          for (const accessory of this.accessories) {
            if (accessory.context.deviceURL) {
              const accInstance = new TahomaGateAccessory(this, accessory);
              await accInstance.forceUpdateState();
            }
          }
        });
      }
    });
  }

  async init() {
    try {
      const session = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
        userId: this.config.user,
        userPassword: this.config.password
      });
      this.session = session.data;

      this.addGateAccessory();
    } catch (error) {
      this.log.error('Erreur de connexion à l\'API Somfy:', error.message);
    }
  }

  addGateAccessory() {
    const uuid = this.api.hap.uuid.generate(this.config.deviceURL);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);
    if (existingAccessory) return;

    const accessory = new this.api.platformAccessory('Portail Somfy', uuid);
    accessory.context.deviceURL = this.config.deviceURL;
    new TahomaGateAccessory(this, accessory);
    this.api.registerPlatformAccessories('homebridge-somfy-tahoma-gate', 'TahomaGate', [accessory]);
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = { TahomaPlatform };

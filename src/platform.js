const axios = require('axios');
const { TahomaGateAccessory } = require('./gateAccessory');

const BASE_URL = 'https://ha201-1.overkiz.com/enduser-mobile-web';

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.sessionId = null;

    this.api.on('didFinishLaunching', () => {
      this.log('[Tahoma Portail] Homebridge prêt, connexion à Tahoma...');
      this.login();
    });
  }

  async login() {
    this.log('🔐 Connexion à Overkiz...');
    try {
      const response = await axios.post(`${BASE_URL}/enduserSession`, {
        userId: this.config.username,
        userPassword: this.config.password
      });

      const cookies = response.headers['set-cookie'];
      this.sessionId = cookies.find(c => c.startsWith('JSESSIONID=')).split(';')[0];

      this.log('✅ Authentification réussie');
      this.addGateAccessory();
    } catch (error) {
      this.log.error('❌ Erreur de connexion :', error.response?.data || error.message);
    }
  }

  addGateAccessory() {
    const uuid = this.api.hap.uuid.generate(this.config.deviceURL);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);
    if (existingAccessory) return;

    const accessory = new this.api.platformAccessory('Portail Somfy', uuid);
    accessory.context.deviceURL = this.config.deviceURL;

    new TahomaGateAccessory(this, accessory);
    this.api.registerPlatformAccessories('homebridge-somfy-tahoma-portail', 'TahomaPortail', [accessory]);
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = { TahomaPlatform };

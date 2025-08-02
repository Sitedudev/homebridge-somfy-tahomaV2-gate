const axios = require('axios');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.session = null;

    this.api.on('didFinishLaunching', () => {
      this.log('🔐 Connexion à Overkiz...');
      this.init();
    });
  }

  async init() {
    try {
      const response = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
        userId: this.config.username,
        userPassword: this.config.password
      });

      this.session = response.data;
      this.log('✅ Connexion réussie');
      await this.loadDevices();

    } catch (error) {
      this.log.error('❌ Erreur de connexion à Overkiz :', error.response?.data || error.message);
    }
  }

  async loadDevices() {
    try {
      const devicesResponse = await axios.get('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices', {
        headers: {
          Cookie: `JSESSIONID=${this.session.id}`
        }
      });

      const gateDevices = devicesResponse.data.filter(device => device.controllableName.includes('Gate'));

      this.log(`🚪 ${gateDevices.length} portail(s) trouvé(s).`);

      for (const device of gateDevices) {
        const uuid = this.api.hap.uuid.generate(device.deviceURL);
        const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

        if (existingAccessory) {
          this.log(`ℹ️ Accessoire déjà enregistré : ${device.label}`);
          continue;
        }

        const accessory = new this.api.platformAccessory(device.label, uuid);
        accessory.context.device = device;

        new TahomaGateAccessory(this, accessory);
        this.api.registerPlatformAccessories('homebridge-somfy-tahoma-gate', 'TahomaPortail', [accessory]);
      }

    } catch (error) {
      this.log.error('❌ Erreur lors du chargement des devices :', error.message);
    }
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = { TahomaPlatform };

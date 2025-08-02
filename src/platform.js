const axios = require('axios');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.session = null;

    // Conserver les accessoires déjà configurés
    api.on('didFinishLaunching', () => this.init());
  }

  async init() {
    try {
      // Connexion API Somfy TaHoma
      const session = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
        userId: this.config.user,
        userPassword: this.config.password
      });
      this.session = session.headers['set-cookie']?.find(c => c.startsWith('JSESSIONID')) || session.data.sessionId || null;

      if (!this.session) {
        this.log.error('Impossible de récupérer la session JSESSIONID.');
        return;
      }

      this.log('Connexion à l’API Somfy réussie.');

      // Pour chaque portail configuré on crée/accessoirise un accessoire
      for (const device of this.config.devices) {
        this.addGateAccessory(device);
      }

      // TODO: ajouter polling global si besoin, ou autre initialisation
    } catch (error) {
      this.log.error('Erreur de connexion à l\'API Somfy:', error.message);
    }
  }

  addGateAccessory(device) {
    const uuid = this.api.hap.uuid.generate(device.deviceURL);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

    if (existingAccessory) {
      this.log(`Accessoire déjà existant pour ${device.name}`);
      return;
    }

    const accessory = new this.api.platformAccessory(device.name, uuid);
    accessory.context.deviceURL = device.deviceURL;
    accessory.context.name = device.name;
    new TahomaGateAccessory(this, accessory);
    this.api.registerPlatformAccessories('homebridge-somfy-tahoma-gate', 'TahomaGate', [accessory]);
    this.accessories.push(accessory);

    this.log(`Accessoire ajouté pour portail : ${device.name}`);
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = { TahomaPlatform };

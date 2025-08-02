const { TahomaClient } = require('tahoma-api');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.client = null;

    this.api.on('didFinishLaunching', () => this.init());
  }

  async init() {
    try {
      this.client = new TahomaClient({
        server: this.config.server || 'somfy_europe',
        email: this.config.user,
        password: this.config.password
      });

      await this.client.login();

      const devices = await this.client.getDevices();

      devices
        .filter(device => device.uiClass === 'Gate')
        .forEach(device => this.addAccessory(device));

    } catch (error) {
      this.log.error('❌ Erreur de connexion à Overkiz :', error.message || error);
    }
  }

  addAccessory(device) {
    const uuid = this.api.hap.uuid.generate(device.deviceURL);
    const existing = this.accessories.find(acc => acc.UUID === uuid);
    if (existing) return;

    const accessory = new this.api.platformAccessory(device.label, uuid);
    accessory.context.device = device;

    new TahomaGateAccessory(this, accessory, this.client);
    this.api.registerPlatformAccessories('homebridge-somfy-tahoma-gate', 'TahomaPortail', [accessory]);
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = { TahomaPlatform };

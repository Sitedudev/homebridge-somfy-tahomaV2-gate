const { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } = require('homebridge');

const TahomaClient = require('./lib/TahomaClientOAuth');

let Accessory, ServiceType, CharacteristicType;

module.exports = (homebridge) => {
  Accessory = homebridge.platformAccessory;
  ServiceType = homebridge.hap.Service;
  CharacteristicType = homebridge.hap.Characteristic;

  homebridge.registerPlatform('homebridge-tahoma-portail', 'TahomaPortail', TahomaPortailPlatform);
};

class TahomaPortailPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];

    if (!config) {
      this.log.warn('⚠️ Aucune configuration détectée');
      return;
    }

    this.client = new TahomaClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      username: config.username,
      password: config.password,
      log: this.log,
    });

    this.api.on('didFinishLaunching', () => {
      this.log('[Tahoma Portail] Homebridge prêt, connexion à Tahoma...');
      this.init();
    });
  }

  async init() {
    try {
      await this.client.login();
      const devices = await this.client.getDevices();

      const portail = devices.find(d =>
        d.label.toLowerCase().includes((this.config.deviceLabel || 'portail').toLowerCase())
      );

      if (!portail) {
        this.log.warn('❌ Aucun portail trouvé avec ce nom.');
        return;
      }

      this.log(`🚪 Portail trouvé : ${portail.label}`);

      const uuid = this.api.hap.uuid.generate(portail.device_url);
      const accessory = new Accessory(portail.label, uuid);

      accessory.context.device = portail;

      // Service de portail
      const service = accessory.getService(ServiceType.GarageDoorOpener)
        || accessory.addService(ServiceType.GarageDoorOpener, portail.label);

      // Initialisation de l’état
      service.setCharacteristic(CharacteristicType.CurrentDoorState, CharacteristicType.CurrentDoorState.CLOSED);
      service.setCharacteristic(CharacteristicType.TargetDoorState, CharacteristicType.TargetDoorState.CLOSED);

      // Gestion des commandes depuis HomeKit
      service.getCharacteristic(CharacteristicType.TargetDoorState)
        .onSet(async (value) => {
          this.log(`📲 Commande reçue : ${value === 0 ? 'OUVRIR' : 'FERMER'}`);
          await this.client.executeCommand(portail.device_url, value === 0 ? 'open' : 'close');
        });

      this.api.registerPlatformAccessories('homebridge-tahoma-portail', 'TahomaPortail', [accessory]);
      this.accessories.push(accessory);

    } catch (error) {
      this.log.error('❌ Erreur lors de l’initialisation :', error.message || error);
    }
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

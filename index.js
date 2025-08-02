const axios = require('axios');
const { inherits } = require('util');
let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform('homebridge-tahoma-portail', 'TahomaPortail', TahomaPortailPlatform);
};

class TahomaPortailPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.devices = [];
    this.sessionCookie = null;

    if (!config.username || !config.password) {
      this.log.error('🛑 Identifiants manquants dans config.json');
      return;
    }

    this.api.on('didFinishLaunching', async () => {
      await this.login();
      await this.loadDevices();
      this.publishAccessories();
    });
  }

   async login() {
    this.log('🔐 Connexion à Tahoma (tahomalink.com)...');
    try {
      const res = await axios.post(
        'https://www.tahomalink.com/enduser-mobile-web/enduserAPI/login',
        {
          userId: this.config.username,
          userPassword: this.config.password
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );
  
      const setCookieHeader = res.headers['set-cookie'];
      this.sessionCookie = setCookieHeader ? setCookieHeader[0].split(';')[0] : null;
  
      if (!this.sessionCookie) throw new Error('Pas de cookie de session');
  
      this.log('✅ Connexion réussie à tahomalink.com');
    } catch (err) {
      this.log.error('❌ Erreur de connexion :', err.response?.data || err.message);
    }
  }

  async loadDevices() {
    if (!this.sessionCookie) return;
    try {
      const res = await axios.get('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup', {
        headers: { Cookie: this.sessionCookie }
      });
      const allDevices = res.data.devices;
      const label = this.config.deviceLabel || 'portail';
      this.devices = allDevices.filter((d) => d.label.toLowerCase().includes(label.toLowerCase()));
      this.log(`🔍 ${this.devices.length} appareil(s) trouvé(s) correspondant à "${label}"`);
    } catch (err) {
      this.log.error('❌ Erreur lors du chargement des appareils :', err.response?.data || err.message);
    }
  }

  publishAccessories() {
    this.accessories = this.devices.map((device) => new TahomaGateAccessory(this, device));
    this.api.registerPlatformAccessories('homebridge-tahoma-portail', 'TahomaPortail', this.accessories);
  }
}

class TahomaGateAccessory {
  constructor(platform, device) {
    this.platform = platform;
    this.device = device;
    this.name = device.label || 'Portail';
    this.log = platform.log;

    this.service = new Service.GarageDoorOpener(this.name);
    this.service
      .getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(() => this.getDoorState());

    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .onSet((value) => this.setDoorState(value));

    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'Somfy')
      .setCharacteristic(Characteristic.Model, 'Tahoma V2')
      .setCharacteristic(Characteristic.SerialNumber, device.serialNumber || 'Inconnu');
  }

  getServices() {
    return [this.informationService, this.service];
  }

  async getDoorState() {
    this.log('📡 Lecture de l’état du portail non implémentée (placeholder = fermé)');
    return Characteristic.CurrentDoorState.CLOSED; // à améliorer avec un polling
  }

  async setDoorState(value) {
    const command = value === Characteristic.TargetDoorState.OPEN ? 'open' : 'close';
    this.log(`🚪 Envoi commande ${command} à ${this.device.label}`);

    try {
      await axios.post(
        'https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/exec/apply',
        {
          label: `${command} via Homebridge`,
          actions: [
            {
              deviceURL: this.device.deviceURL,
              commands: [
                {
                  name: command,
                  parameters: []
                }
              ]
            }
          ]
        },
        {
          headers: {
            Cookie: this.platform.sessionCookie,
            'Content-Type': 'application/json'
          }
        }
      );
      this.log(`✅ Commande ${command} envoyée avec succès`);
    } catch (err) {
      this.log.error('❌ Erreur lors de l’envoi de la commande :', err.response?.data || err.message);
    }
  }
}

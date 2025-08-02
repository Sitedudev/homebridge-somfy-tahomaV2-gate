// package.json
{
  "name": "homebridge-somfy-tahoma-gate",
  "version": "0.1.0",
  "description": "Plugin Homebridge pour contrôler un portail Somfy via TaHoma V2 (API Overkiz)",
  "main": "index.js",
  "keywords": ["homebridge-plugin"],
  "engines": {
    "node": ">=18.0.0",
    "homebridge": ">=1.6.0"
  },
  "dependencies": {
    "axios": "^1.6.8"
  }
}

// index.js
const { TahomaPlatform } = require('./src/platform');

module.exports = (api) => {
  api.registerPlatform('homebridge-somfy-tahoma-gate', 'TahomaGate', TahomaPlatform);
};

// config.schema.json
{
  "pluginAlias": "TahomaGate",
  "pluginType": "platform",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "default": "TahomaGate" },
      "user": { "type": "string", "title": "Somfy Email" },
      "password": { "type": "string", "title": "Somfy Password" },
      "deviceURL": { "type": "string", "title": "Device URL of the Gate" }
    },
    "required": ["user", "password", "deviceURL"]
  }
}

// src/platform.js
const axios = require('axios');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.session = null;
    api.on('didFinishLaunching', () => this.init());
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

// src/gateAccessory.js
const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    const Service = platform.api.hap.Service;
    const Characteristic = platform.api.hap.Characteristic;

    this.service = accessory.getService(Service.GarageDoorOpener)
      || accessory.addService(Service.GarageDoorOpener);

    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));
  }

  async setTargetState(value) {
    const state = value === 0 ? 'open' : 'close';
    const url = 'https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/exec/apply';
    const body = {
      label: 'Homebridge Command',
      actions: [{
        deviceURL: this.accessory.context.deviceURL,
        commands: [{ name: state, parameters: [] }]
      }]
    };
    try {
      await axios.post(url, body, {
        headers: { 'Cookie': 'JSESSIONID=' + this.platform.session.cookie }
      });
      this.platform.log(`Commande ${state} envoyée.`);
    } catch (err) {
      this.platform.log.error('Erreur d’envoi de la commande:', err.message);
    }
  }

  async getCurrentState() {
    return 1; // FERMÉ par défaut (à améliorer avec polling de l’état réel)
  }
}

module.exports = { TahomaGateAccessory };

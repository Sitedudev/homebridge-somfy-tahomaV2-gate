const axios = require('axios');
const express = require('express');
const { TahomaGateAccessory } = require('./gateAccessory');

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];
    this.session = null;

    this.history = [];
    this.app = null;
    this.server = null;

    this.devicesDiscovered = []; // <- Liste des portails découverts

    // Schéma JSON statique pour Homebridge Config UI
    this.staticSchema = {
      type: "object",
      properties: {
        user: { type: "string", title: "Somfy Email" },
        password: { type: "string", title: "Somfy Password" },
        pollingInterval: { type: "integer", title: "Intervalle de mise à jour (ms)", default: 30000 },
        enableHistory: { type: "boolean", title: "Activer l'historique des actions", default: false },
        enableWebUI: { type: "boolean", title: "Activer l'interface Web locale", default: false },
        webPort: { type: "integer", title: "Port du serveur Web", default: 8999 },
  
        // Nouvelle propriété pour choisir le portail via la liste découverte
        selectedDeviceURL: {
          type: "string",
          title: "Portail sélectionné",
          enum: [],
          enumNames: []
        },
  
        devices: {
          type: "array",
          title: "Portails (ajout manuel)",
          description: "Ajoutez un ou plusieurs portails à contrôler via TaHoma.",
          items: {
            type: "object",
            title: "Portail",
            properties: {
              name: { type: "string", title: "Nom du portail" },
              deviceURL: { type: "string", title: "Device URL du portail" }
            },
            required: ["name", "deviceURL"]
          },
          default: [],
          widget: { addButtonLabel: "Ajouter un portail" }
        }
      },
      required: ["user", "password"]
    };

    api.on('didFinishLaunching', () => this.init());
  }

  async init() {
    try {
      // Connexion et récupération session
      const sessionResponse = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
        userId: this.config.user,
        userPassword: this.config.password
      });
      
      const setCookieHeader = sessionResponse.headers['set-cookie'] || [];
      const jsessionCookie = setCookieHeader.find(cookie => cookie.startsWith('JSESSIONID='));
      if (!jsessionCookie) {
        this.log.error('Impossible de récupérer la session JSESSIONID.');
        return;
      }
      this.session = jsessionCookie.split(';')[0]; // Ex: JSESSIONID=xxxx

      this.log('Connexion à l’API Somfy réussie.');

      // Découverte automatique des portails
      await this.discoverDevices();
      
      if (this.config.selectedDeviceURL) {
        const selectedDevice = this.devicesDiscovered.find(d => d.deviceURL === this.config.selectedDeviceURL);
        if (selectedDevice) {
          this.addGateAccessory(selectedDevice);
        } else {
          this.log.warn('Portail sélectionné non trouvé dans la liste découverte.');
        }
      } else {
        // Sinon, on ajoute les portails configurés manuellement
        for (const device of this.config.devices) {
          this.addGateAccessory(device);
        }
      }

      // Lancer le polling global
      this.startPolling();

      // Démarrer interface Web si activée
      if (this.config.enableWebUI) {
        this.startWebServer();
      }
    } catch (error) {
      this.log.error('Erreur de connexion à l\'API Somfy:', error.message);
    }
  }

  async discoverDevices() {
    try {
      // Appel API pour récupérer la liste des devices
      const url = 'https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/enduserAPI.jsf';
      const response = await axios.post(url, {}, {
        headers: { Cookie: this.session }
      });
      const data = JSON.parse(response.data);
      const devices = data.deviceList || [];

      // Filtrer les portails (ex: deviceType contenant "gate")
      this.devicesDiscovered = devices.filter(d => d.deviceType && d.deviceType.toLowerCase().includes('gate')).map(d => ({
        name: d.label || d.name || 'Portail sans nom',
        deviceURL: d.deviceURL,
        deviceType: d.deviceType
      }));

      this.log(`Découverte automatique: ${this.devicesDiscovered.length} portail(s) trouvé(s).`);
    } catch (err) {
      this.log.error('Erreur lors de la découverte des portails:', err.message);
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

  startPolling() {
    const interval = this.config.pollingInterval || 30000;
    this.log(`Démarrage du polling global toutes les ${interval} ms`);

    this.pollingTimer = setInterval(() => this.updateAllStates(), interval);
    // Première mise à jour immédiate
    this.updateAllStates();
  }

  async updateAllStates() {
    this.log('Mise à jour des états de tous les portails...');
    for (const accessory of this.accessories) {
      try {
        const state = await this.getDeviceState(accessory.context.deviceURL);
        if (state != null) {
          const Characteristic = this.api.hap.Characteristic;
          const service = accessory.getService(this.api.hap.Service.GarageDoorOpener);
          const newCurrentState = state === 'open' 
            ? Characteristic.CurrentDoorState.OPEN 
            : Characteristic.CurrentDoorState.CLOSED;

          service.updateCharacteristic(Characteristic.CurrentDoorState, newCurrentState);
          service.updateCharacteristic(Characteristic.TargetDoorState, newCurrentState);

          if (accessory.updateCurrentState) {
            accessory.updateCurrentState(newCurrentState);
          }

          this.log(`Portail "${accessory.context.name}" état mis à jour : ${state}`);
        } else {
          this.log.warn(`Impossible de récupérer l’état du portail "${accessory.context.name}"`);
        }
      } catch (e) {
        this.log.error(`Erreur lors de la mise à jour du portail "${accessory.context.name}":`, e.message);
      }
    }
  }

  async getDeviceState(deviceURL) {
    try {
      const url = `https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/device/${encodeURIComponent(deviceURL)}/state`;
      const response = await axios.get(url, {
        headers: { Cookie: this.session }
      });

      const states = response.data.states || [];
      const closureState = states.find(s => s.name === 'core:ClosureState');

      if (closureState) {
        if (closureState.value === 'open') return 'open';
        else return 'closed';
      }
      return null;
    } catch (err) {
      this.log.error(`Erreur getDeviceState pour ${deviceURL}:`, err.message);
      return null;
    }
  }

  getSchema() {
    // Clone pour éviter de modifier l'original
    const schema = JSON.parse(JSON.stringify(this.staticSchema));
  
    // Remplit la liste déroulante des portails découverts
    if (this.devicesDiscovered.length > 0) {
      schema.properties.selectedDeviceURL.enum = this.devicesDiscovered.map(d => d.deviceURL);
      schema.properties.selectedDeviceURL.enumNames = this.devicesDiscovered.map(d => d.name);
    } else {
      schema.properties.selectedDeviceURL.enum = [];
      schema.properties.selectedDeviceURL.enumNames = [];
    }
  
    return schema;
  }


  startWebServer() {
    const port = this.config.webPort || 8999;
    this.app = express();

    // Middleware pour parser le body des POST (formulaire)
    this.app.use(express.urlencoded({ extended: true }));

    // Page principale affichant état + liste portails découverts + bouton ajout manuel
    this.app.get('/', (req, res) => {
      const portails = this.accessories.map(acc => {
        const service = acc.getService(this.api.hap.Service.GarageDoorOpener);
        const currentState = service.getCharacteristic(this.api.hap.Characteristic.CurrentDoorState).value;

        return {
          name: acc.context.name,
          deviceURL: acc.context.deviceURL,
          state: currentState === this.api.hap.Characteristic.CurrentDoorState.OPEN ? 'Ouvert' : 'Fermé'
        };
      });

      const discovered = this.devicesDiscovered.map(d => `<li>${d.name} - <code>${d.deviceURL}</code></li>`).join('');

      res.send(`
        <html><head><title>Etat portails Somfy</title></head><body>
          <h1>Etat des portails Somfy</h1>
          <ul>
            ${portails.map(p => `<li><strong>${p.name}</strong> : ${p.state}</li>`).join('')}
          </ul>

          <h2>Portails découverts automatiquement</h2>
          <ul>${discovered || '<li>Aucun portail trouvé</li>'}</ul>

          <form method="POST" action="/addManual">
            <h3>Ajouter un portail manuellement</h3>
            <label>Nom: <input name="name" required></label><br>
            <label>Device URL: <input name="deviceURL" required></label><br>
            <button type="submit">Ajouter</button>
          </form>

          <form method="POST" action="/refresh" style="margin-top:20px;">
            <button type="submit">Forcer la mise à jour des états</button>
          </form>
        </body></html>
      `);
    });

    // Forcer mise à jour
    this.app.post('/refresh', (req, res) => {
      this.updateAllStates();
      res.redirect('/');
    });

    // Ajouter portail manuel (rajoute dans accessories et log)
    this.app.post('/addManual', (req, res) => {
      const { name, deviceURL } = req.body;
      if (name && deviceURL) {
        this.addGateAccessory({ name, deviceURL });
        this.log(`Portail ajouté manuellement via interface Web: ${name}`);
      }
      res.redirect('/');
    });

    this.server = this.app.listen(port, () => {
      this.log(`Interface Web locale démarrée sur http://localhost:${port}`);
    });
  }

  stopWebServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.app = null;
      this.log('Serveur Web local arrêté.');
    }
  }
}

module.exports = { TahomaPlatform };

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

    api.on('didFinishLaunching', () => this.init());
  }

  async init() {
    try {
      const sessionResponse = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
        userId: this.config.user,
        userPassword: this.config.password
      });
      
      // Récupération de JSESSIONID dans cookie
      const setCookieHeader = sessionResponse.headers['set-cookie'] || [];
      const jsessionCookie = setCookieHeader.find(cookie => cookie.startsWith('JSESSIONID='));
      if (!jsessionCookie) {
        this.log.error('Impossible de récupérer la session JSESSIONID.');
        return;
      }
      this.session = jsessionCookie.split(';')[0]; // Ex: JSESSIONID=xxxx

      this.log('Connexion à l’API Somfy réussie.');

      // Ajouter les accessoires
      for (const device of this.config.devices) {
        this.addGateAccessory(device);
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
    // Lancer une première mise à jour immédiate
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

          // Synchroniser TargetDoorState aussi (optionnel)
          service.updateCharacteristic(Characteristic.TargetDoorState, newCurrentState);

          // Mettre à jour le cache local dans gateAccessory (si besoin)
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
        headers: {
          Cookie: this.session
        }
      });

      // L’état réel dépend du champ retourné, à adapter selon la doc Somfy/Overkiz
      // Exemple: rechercher dans response.data.states un état 'core:ClosureState' ou similaire
      const states = response.data.states || [];
      const closureState = states.find(s => s.name === 'core:ClosureState');

      if (closureState) {
        // 'closed', 'open', 'closing', 'opening', 'stopped'
        // On considère open = OPEN, tout le reste = CLOSED
        if (closureState.value === 'open') {
          return 'open';
        } else {
          return 'closed';
        }
      }

      return null;

    } catch (err) {
      this.log.error(`Erreur getDeviceState pour ${deviceURL}:`, err.message);
      return null;
    }
  }

  startWebServer() {
    const port = this.config.webPort || 8999;
    this.app = express();

    // Route principale affichant le status des portails
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

      // Simple page HTML minimaliste
      res.send(`
        <html><head><title>Etat portails Somfy</title></head><body>
          <h1>Etat des portails Somfy</h1>
          <ul>
            ${portails.map(p => `<li><strong>${p.name}</strong> : ${p.state}</li>`).join('')}
          </ul>
          <form method="POST" action="/refresh">
            <button type="submit">Forcer la mise à jour</button>
          </form>
        </body></html>
      `);
    });

    // Endpoint pour forcer la mise à jour
    this.app.post('/refresh', (req, res) => {
      this.updateAllStates();
      res.redirect('/');
    });

    this.server = this.app.listen(port, () => {
      this.log(`Interface Web locale démarrée sur http://localhost:${port}`);
    });
  }

  // Optionnel : arrête le serveur si besoin (à appeler si le plugin se décharge)
  stopWebServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.app = null;
      this.log('Se

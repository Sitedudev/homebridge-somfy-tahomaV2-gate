const TahomaClient = require('./TahomaClient');
let Service, Characteristic, PlatformAccessory;

class TahomaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.email = this.config.email;
    this.password = this.config.password;
    this.deviceLabel = this.config.deviceLabel || 'portail';

    this.client = new TahomaClient(this.email, this.password);
    this.accessories = [];

    if (api) {
      this.api.on('didFinishLaunching', () => {
        this.log('Homebridge prêt, connexion à Tahoma...');
        this.connectToTahoma();
      });
    }
  }

  async connectToTahoma() {
    try {
     await this.client.login();
      this.log('✅ Connecté à Tahoma');
  
      const devices = await this.client.getDevices();
      this.log(`📦 ${devices.length} appareils récupérés`);
  
      const portail = devices.find(d =>
        d.label.toLowerCase().includes(this.deviceLabel.toLowerCase())
      );
  
      if (!portail) {
        this.log.error(`❌ Appareil "${this.deviceLabel}" non trouvé`);
        return;
      }
  
      this.log(`🚪 Appareil trouvé : ${portail.label}`);

      this.accessory = new PlatformAccessory(portail.label, portail.deviceURL);
      this.service = new Service.GarageDoorOpener(portail.label);

      this.currentDoorState = Characteristic.CurrentDoorState.CLOSED;
      this.targetDoorState = Characteristic.TargetDoorState.CLOSED;

      this.service
        .getCharacteristic(Characteristic.CurrentDoorState)
        .on('get', (callback) => {
          callback(null, this.currentDoorState);
        });

      this.service
        .getCharacteristic(Characteristic.TargetDoorState)
        .on('get', (callback) => {
          callback(null, this.targetDoorState);
        })
        .on('set', async (value, callback) => {
          try {
            if (value === Characteristic.TargetDoorState.OPEN) {
              await this.client.sendCommand(portail, 'open');
              this.targetDoorState = Characteristic.TargetDoorState.OPEN;
              this.currentDoorState = Characteristic.CurrentDoorState.OPEN;
            } else {
              await this.client.sendCommand(portail, 'close');
              this.targetDoorState = Characteristic.TargetDoorState.CLOSED;
              this.currentDoorState = Characteristic.CurrentDoorState.CLOSED;
            }
            this.service
              .getCharacteristic(Characteristic.CurrentDoorState)
              .updateValue(this.currentDoorState);
            this.service
              .getCharacteristic(Characteristic.TargetDoorState)
              .updateValue(this.targetDoorState);
            callback(null);
          } catch (e) {
            this.log.error('Erreur commande portail:', e.message);
            callback(e);
          }
        });

      this.accessory.addService(this.service);
      this.api.registerPlatformAccessories('homebridge-tahoma-simple', 'TahomaPlatform', [this.accessory]);

      this.startPolling(portail);
    } catch (e) {
      this.log.error('❌ Erreur connexion Tahoma:', e.message);
    }
  }

  startPolling(portail) {
    setInterval(async () => {
      try {
        const states = await this.client.getStates(portail);
        const state = states['core:ClosureState'] || states['core:OpenClosedState'];
        if (state !== undefined) {
          const newState = state === 0 ? Characteristic.CurrentDoorState.CLOSED : Characteristic.CurrentDoorState.OPEN;
          if (newState !== this.currentDoorState) {
            this.currentDoorState = newState;
            this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(newState);
            this.log(`Etat portail mis à jour: ${newState === 0 ? 'Fermé' : 'Ouvert'}`);
          }
        }
      } catch (e) {
        this.log.error('Erreur polling:', e.message);
      }
    }, 10000);
  }

  configureAccessory(accessory) {
    this.log('Accessoire configuré:', accessory.displayName);
  }
}

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  PlatformAccessory = homebridge.platformAccessory;

  homebridge.registerPlatform('homebridge-tahoma-simple', 'TahomaPlatform', TahomaPlatform);
};

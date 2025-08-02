const { API } = require('homebridge');
const { TahomaClient } = require('tahoma-api');

let Service, Characteristic;

class TahomaGarageDoorAccessory {
  constructor(log, config) {
    this.log = log;
    this.config = config;

    this.client = new TahomaClient();

    this.email = config.email;
    this.password = config.password;
    this.deviceLabel = config.deviceLabel || 'portail';

    this.service = new Service.GarageDoorOpener(this.deviceLabel);

    // States HomeKit (0=Open,1=Closed,2=Opening,3=Closing,4=Stopped)
    this.currentDoorState = Characteristic.CurrentDoorState.CLOSED;
    this.targetDoorState = Characteristic.TargetDoorState.CLOSED;

    this.service
      .getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', this.handleCurrentDoorStateGet.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('get', this.handleTargetDoorStateGet.bind(this))
      .on('set', this.handleTargetDoorStateSet.bind(this));

    this.pollInterval = null;
  }

  async connect() {
    this.log('Connexion à Tahoma...');
    try {
      await this.client.login(this.email, this.password);
      this.log('Connecté à Tahoma');

      const devices = await this.client.getDevices();
      this.device = devices.find(d =>
        d.label.toLowerCase().includes(this.deviceLabel.toLowerCase())
      );

      if (!this.device) {
        this.log.error(`Appareil avec label "${this.deviceLabel}" non trouvé.`);
        return;
      }
      this.log(`Appareil trouvé: ${this.device.label}`);

      this.startPolling();
    } catch (e) {
      this.log.error('Erreur connexion Tahoma:', e.message);
    }
  }

  startPolling() {
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 10 * 1000);
  }

  async poll() {
    if (!this.device) return;
    try {
      const states = await this.client.getStates(this.device);

      // Le state est dans states['core:ClosureState'] ou states['core:OpenClosedState']
      // La fermeture typique vaut 0 fermé, 1 ouvert (inversé pour HomeKit)
      let state = states['core:ClosureState'] || states['core:OpenClosedState'];

      if (state === undefined) {
        this.log('Etat du portail introuvable');
        return;
      }

      let hkCurrentState = Characteristic.CurrentDoorState.CLOSED;
      if (state === 0) hkCurrentState = Characteristic.CurrentDoorState.CLOSED;
      else if (state === 1) hkCurrentState = Characteristic.CurrentDoorState.OPEN;

      if (this.currentDoorState !== hkCurrentState) {
        this.currentDoorState = hkCurrentState;
        this.service
          .getCharacteristic(Characteristic.CurrentDoorState)
          .updateValue(hkCurrentState);
        this.log(`Etat portail mis à jour : ${hkCurrentState === 0 ? 'Ouvert' : 'Fermé'}`);
      }
    } catch (e) {
      this.log.error('Erreur lors du polling:', e.message);
    }
  }

  handleCurrentDoorStateGet(callback) {
    this.log('Get CurrentDoorState:', this.currentDoorState);
    callback(null, this.currentDoorState);
  }

  handleTargetDoorStateGet(callback) {
    this.log('Get TargetDoorState:', this.targetDoorState);
    callback(null, this.targetDoorState);
  }

  async handleTargetDoorStateSet(value, callback) {
    this.log('Set TargetDoorState à:', value);

    if (!this.device) {
      this.log.error('Appareil non connecté');
      callback(new Error('Appareil non connecté'));
      return;
    }

    try {
      if (value === Characteristic.TargetDoorState.OPEN) {
        await this.client.sendCommand(this.device, 'open');
        this.targetDoorState = Characteristic.TargetDoorState.OPEN;
        this.currentDoorState = Characteristic.CurrentDoorState.OPEN;
      } else if (value === Characteristic.TargetDoorState.CLOSED) {
        await this.client.sendCommand(this.device, 'close');
        this.targetDoorState = Characteristic.TargetDoorState.CLOSED;
        this.currentDoorState = Characteristic.CurrentDoorState.CLOSED;
      }
      this.service
        .getCharacteristic(Characteristic.TargetDoorState)
        .updateValue(this.targetDoorState);
      this.service
        .getCharacteristic(Characteristic.CurrentDoorState)
        .updateValue(this.currentDoorState);

      callback(null);
    } catch (e) {
      this.log.error('Erreur commande portail:', e.message);
      callback(e);
    }
  }

  getServices() {
    return [this.service];
  }
}

module.exports = (api) => {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  api.registerAccessory('TahomaGarageDoor', TahomaGarageDoorAccessory);
};

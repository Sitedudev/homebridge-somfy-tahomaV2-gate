const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;

    const Service = this.platform.api.hap.Service;
    const Characteristic = this.platform.api.hap.Characteristic;

    console.log('GarageDoorOpener Service:', Service.GarageDoorOpener);
    console.log('TargetDoorState Characteristic:', Characteristic.TargetDoorState);
    console.log('CurrentDoorState Characteristic:', Characteristic.CurrentDoorState);

    // Supprimer service s'il existe (sécurité)
    const existingService = accessory.getService(Service.GarageDoorOpener);
    if (existingService) {
      accessory.removeService(existingService);
    }

    this.service = accessory.addService(Service.GarageDoorOpener);

    this.service.setCharacteristic(Characteristic.Name, accessory.context.name);

    this.currentState = Characteristic.CurrentDoorState.CLOSED;
    this.targetState = Characteristic.TargetDoorState.CLOSED;

    this.service.setCharacteristic(Characteristic.CurrentDoorState, this.currentState);
    this.service.setCharacteristic(Characteristic.TargetDoorState, this.targetState);

    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .on('set', this.setTargetState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', this.getCurrentState.bind(this));

    accessory.updateCurrentState = this.updateCurrentState.bind(this);
  }

  async setTargetState(value, callback) {
    const Characteristic = this.platform.api.hap.Characteristic;

    const state = (value === Characteristic.TargetDoorState.OPEN) ? 'open' : 'close';

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
        headers: { 'Cookie': this.platform.session }
      });
      this.platform.log(`Commande "${state}" envoyée pour portail "${this.accessory.context.name}".`);

      this.targetState = value;
      this.currentState = (value === Characteristic.TargetDoorState.OPEN)
        ? Characteristic.CurrentDoorState.OPEN
        : Characteristic.CurrentDoorState.CLOSED;

      this.service.updateCharacteristic(Characteristic.TargetDoorState, this.targetState);
      this.service.updateCharacteristic(Characteristic.CurrentDoorState, this.currentState);

      callback(null);
    } catch (err) {
      this.platform.log.error(`Erreur d’envoi de la commande pour portail "${this.accessory.context.name}" :`, err.message);
      callback(err);
    }
  }

  async getCurrentState(callback) {
    callback(null, this.currentState);
  }

  updateCurrentState(newState) {
    const Characteristic = this.platform.api.hap.Characteristic;

    const validStates = [
      Characteristic.CurrentDoorState.OPEN,
      Characteristic.CurrentDoorState.CLOSED,
      Characteristic.CurrentDoorState.OPENING,
      Characteristic.CurrentDoorState.CLOSING,
      Characteristic.CurrentDoorState.STOPPED
    ];

    if (!validStates.includes(newState)) {
      this.platform.log.warn(`Etat non valide reçu pour portail "${this.accessory.context.name}": ${newState}`);
      return;
    }

    this.currentState = newState;

    if (newState === Characteristic.CurrentDoorState.OPEN) {
      this.targetState = Characteristic.TargetDoorState.OPEN;
    } else if (newState === Characteristic.CurrentDoorState.CLOSED) {
      this.targetState = Characteristic.TargetDoorState.CLOSED;
    }

    this.service.updateCharacteristic(Characteristic.CurrentDoorState, this.currentState);
    this.service.updateCharacteristic(Characteristic.TargetDoorState, this.targetState);
  }
}

module.exports = { TahomaGateAccessory };

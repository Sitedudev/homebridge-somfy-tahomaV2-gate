const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    const Service = platform.api.hap.Service;
    const Characteristic = platform.api.hap.Characteristic;

    this.service = accessory.getService(Service.GarageDoorOpener)
      || accessory.addService(Service.GarageDoorOpener);

    this.service.setCharacteristic(Characteristic.Name, accessory.context.name);

    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));

    // Etat local initialisé fermé
    this.currentState = Characteristic.CurrentDoorState.CLOSED;

    // Liaison fonction pour que platform puisse mettre à jour l'état depuis le polling
    accessory.updateCurrentState = this.updateCurrentState.bind(this);
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
        headers: { 'Cookie': this.platform.session }
      });
      this.platform.log(`Commande ${state} envoyée pour portail ${this.accessory.context.name}.`);
      // Optimiste : on met à jour localement
      this.currentState = value === 0
        ? this.platform.api.hap.Characteristic.CurrentDoorState.OPEN
        : this.platform.api.hap.Characteristic.CurrentDoorState.CLOSED;
      this.service.updateCharacteristic(this.platform.api.hap.Characteristic.CurrentDoorState, this.currentState);
    } catch (err) {
      this.platform.log.error(`Erreur d’envoi de la commande pour portail ${this.accessory.context.name} :`, err.message);
    }
  }

  async getCurrentState() {
    return this.currentState;
  }

  updateCurrentState(newState) {
    this.currentState = newState;
  }
}

module.exports = { TahomaGateAccessory };

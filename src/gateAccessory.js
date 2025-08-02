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
const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;

    const Service = platform.api.hap.Service;
    const Characteristic = platform.api.hap.Characteristic;

    // Récupérer ou créer le service GarageDoorOpener
    this.service = accessory.getService(Service.GarageDoorOpener)
      || accessory.addService(Service.GarageDoorOpener);

    // Définir le nom de l’accessoire
    this.service.setCharacteristic(Characteristic.Name, accessory.context.name);

    // Initialiser les caractéristiques avec des valeurs valides
    // CurrentDoorState: 0=Open, 1=Closed, 2=Opening, 3=Closing, 4=Stopped
    this.currentState = Characteristic.CurrentDoorState.CLOSED;
    this.targetState = Characteristic.TargetDoorState.CLOSED;

    this.service.setCharacteristic(Characteristic.CurrentDoorState, this.currentState);
    this.service.setCharacteristic(Characteristic.TargetDoorState, this.targetState);

    // Bind des handlers sur TargetDoorState
    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));

    // Permet à la platform de mettre à jour l'état depuis le polling
    accessory.updateCurrentState = this.updateCurrentState.bind(this);
  }

  async setTargetState(value) {
    const Characteristic = this.platform.api.hap.Characteristic;

    // Convertir la valeur en commande Somfy (open/close)
    const state = value === Characteristic.TargetDoorState.OPEN ? 'open' : 'close';

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

      // Mise à jour optimiste des caractéristiques
      this.targetState = value;
      this.currentState = (value === Characteristic.TargetDoorState.OPEN)
        ? Characteristic.CurrentDoorState.OPEN
        : Characteristic.CurrentDoorState.CLOSED;

      this.service.updateCharacteristic(Characteristic.TargetDoorState, this.targetState);
      this.service.updateCharacteristic(Characteristic.CurrentDoorState, this.currentState);

    } catch (err) {
      this.platform.log.error(`Erreur d’envoi de la commande pour portail "${this.accessory.context.name}" :`, err.message);
    }
  }

  async getCurrentState() {
    return this.currentState;
  }

  updateCurrentState(newState) {
    const Characteristic = this.platform.api.hap.Characteristic;

    // Validation de l’état avant mise à jour
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

    // Pour synchroniser TargetDoorState si on détecte ouverture ou fermeture complète
    if (newState === Characteristic.CurrentDoorState.OPEN) {
      this.targetState = Characteristic.TargetDoorState.OPEN;
    } else if (newState === Characteristic.CurrentDoorState.CLOSED) {
      this.targetState = Characteristic.TargetDoorState.CLOSED;
    }

    // Mise à jour des caractéristiques HomeKit
    this.service.updateCharacteristic(Characteristic.CurrentDoorState, this.currentState);
    this.service.updateCharacteristic(Characteristic.TargetDoorState, this.targetState);
  }
}

module.exports = { TahomaGateAccessory };

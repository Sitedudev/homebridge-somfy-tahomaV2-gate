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
     

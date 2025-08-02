const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    this.deviceURL = accessory.context.deviceURL;
    this.Service = platform.api.hap.Service;
    this.Characteristic = platform.api.hap.Characteristic;

    this.service = this.accessory.getService(this.Service.GarageDoorOpener) ||
                   this.accessory.addService(this.Service.GarageDoorOpener);

    this.service.getCharacteristic(this.Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this));
  }

  async getCurrentState() {
    try {
      const res = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices/states',
        { deviceURL: this.deviceURL },
        { headers: { Cookie: `JSESSIONID=${this.platform.session.id}` } }
      );

      const state = res.data.find(s => s.name === 'core:OpenClosedState');
      if (!state) return this.Characteristic.CurrentDoorState.STOPPED;
      return state.value === 'open' ?
        this.Characteristic.CurrentDoorState.OPEN :
        this.Characteristic.CurrentDoorState.CLOSED;

    } catch (error) {
      this.platform.log.error('❌ Erreur lors de la récupération de l\'état :', error.response?.data || error.message);
      return this.Characteristic.CurrentDoorState.STOPPED;
    }
  }

  async setTargetState(value) {
    const command = value === this.Characteristic.TargetDoorState.OPEN ? 'open' : 'close';
    try {
      await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/exec/apply', {
        label: 'Homebridge command',
        actions: [
          {
            deviceURL: this.deviceURL,
            commands: [
              { name: command, parameters: [] }
            ]
          }
        ]
      }, {
        headers: { Cookie: `JSESSIONID=${this.platform.session.id}` }
      });

      this.platform.log(`🚪 Commande ${command} envoyée au portail.`);

    } catch (error) {
      this.platform.log.error(`❌ Erreur lors de la commande ${command} :`, error.response?.data || error.message);
    }
  }
}

module.exports = { TahomaGateAccessory };

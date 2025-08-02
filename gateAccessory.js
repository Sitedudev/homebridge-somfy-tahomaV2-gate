class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = accessory.context.device;

    const { Service, Characteristic } = platform.api.hap;

    this.service = accessory.getService(Service.GarageDoorOpener) || accessory.addService(Service.GarageDoorOpener);

    this.service.setCharacteristic(Characteristic.Name, this.device.label);

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this));
  }

  async getCurrentState() {
    try {
      const { data } = await axios.get('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices', {
        headers: { Cookie: `JSESSIONID=${this.platform.session.id}` }
      });

      const updatedDevice = data.find(d => d.deviceURL === this.device.deviceURL);
      const state = updatedDevice.states.find(s => s.name === 'core:OpenClosedState');

      return state.value === 'open' ? 0 : 1;
    } catch (error) {
      this.platform.log.error('❌ Erreur récupération état portail :', error.message);
      return 1; // fermé par défaut en cas d'erreur
    }
  }

  async setTargetState(value) {
    const command = value === 0 ? 'open' : 'close';
    try {
      await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/exec/apply', {
        label: `Homebridge - ${command} gate`,
        actions: [{
          deviceURL: this.device.deviceURL,
          commands: [{ name: command, parameters: [] }]
        }]
      }, {
        headers: { Cookie: `JSESSIONID=${this.platform.session.id}` }
      });
    } catch (error) {
      this.platform.log.error(`❌ Erreur lors de la commande ${command} :`, error.message);
    }
  }
}

module.exports = { TahomaGateAccessory };

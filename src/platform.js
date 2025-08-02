const axios = require('axios');

class TahomaGateAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    this.deviceURL = accessory.context.deviceURL;
    this.name = accessory.displayName;

    const { Service, Characteristic } = platform.api.hap;

    this.service = accessory.getService(Service.GarageDoorOpener)
      || accessory.addService(Service.GarageDoorOpener);

    this.service.setCharacteristic(Characteristic.Name, this.name);

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
      .onGet(this.handleCurrentDoorStateGet.bind(this));

    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onGet(this.handleTargetDoorStateGet.bind(this))
      .onSet(this.handleTargetDoorStateSet.bind(this));
  }

  async handleCurrentDoorStateGet() {
    try {
      const response = await axios.get(
        `https://ha201-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices/${this.deviceURL}/states`,
        { headers: { Cookie: this.platform.sessionId } }
      );

      const state = response.data.find(s => s.name === 'core:OpenClosedState');
      return state.value === 'open' ? 0 : 1; // 0: OPEN, 1: CLOSED
    } catch (error) {
      this.platform.log.error('Erreur récupération état portail :', error.message);
      return 1;
    }
  }

  async handleTargetDoorStateGet() {
    return this.handleCurrentDoorStateGet();
  }

  async handleTargetDoorStateSet(value) {
    const command = value === 0 ? 'open' : 'close';
    try {
      await axios.post(
        'https://ha201-1.overkiz.com/enduser-mobile-web/enduserAPI/exec/apply',
        {
          label: 'Homebridge Command',
          actions: [
            {
              deviceURL: this.deviceURL,
              commands: [
                {
                  name: command,
                  parameters: []
                }
              ]
            }
          ]
        },
        { headers: { Cookie: this.platform.sessionId } }
      );

      this.platform.log(`Commande portail : ${command}`);
    } catch (error) {
      this.platform.log.error('Erreur commande portail :', error.message);
    }
  }
}

module.exports = { TahomaGateAccessory };

class TahomaGateAccessory {
  constructor(platform, accessory, client) {
    this.platform = platform;
    this.accessory = accessory;
    this.client = client;
    this.device = accessory.context.device;

    const service = accessory.getService(platform.api.hap.Service.Switch) ||
      accessory.addService(platform.api.hap.Service.Switch);

    service.getCharacteristic(platform.api.hap.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  async setOn(value) {
    try {
      await this.client.executeCommand(this.device.deviceURL, [{
        name: 'open',
        parameters: []
      }]);
    } catch (e) {
      this.platform.log.error('Erreur lors de l\'ouverture du portail:', e.message || e);
    }
  }

  async getOn() {
    return false; // Pas d’état récupérable facilement pour un portail
  }
}

module.exports = { TahomaGateAccessory };

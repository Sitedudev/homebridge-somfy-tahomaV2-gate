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

    // Lancer la surveillance automatique de l’état
    this.startPollingState();
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
    try {
      const response = await axios.get(
        'https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices',
        {
          headers: {
            'Cookie': 'JSESSIONID=' + this.platform.session.cookie
          }
        }
      );
  
      const device = response.data.find(
        (dev) => dev.deviceURL === this.accessory.context.deviceURL
      );
  
      if (!device) {
        this.platform.log.error('Aucun appareil trouvé avec ce deviceURL');
        return 1; // Assume fermé par défaut
      }
  
      const state = device.states.find(
        (s) => s.name === 'core:OpenClosedState' || s.name === 'core:OpenCloseState'
      );
  
      if (!state) {
        this.platform.log.warn('Aucun état open/closed trouvé pour cet appareil');
        return 1;
      }
  
      const currentState = state.value === 'open' ? 0 : 1; // 0: OPEN, 1: CLOSED
      this.platform.log(`État actuel détecté: ${state.value}`);
      return currentState;
  
    } catch (err) {
      this.platform.log.error('Erreur lors de la récupération de l’état:', err.message);
      return 1; // FERMÉ par défaut si erreur
    }
  }

  startPollingState() {
    this.pollingInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          'https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/setup/devices',
          {
            headers: {
              'Cookie': 'JSESSIONID=' + this.platform.session.cookie
            }
          }
        );
  
        const device = response.data.find(
          (dev) => dev.deviceURL === this.accessory.context.deviceURL
        );
  
        if (!device) {
          this.platform.log.error('Appareil non trouvé pour polling');
          return;
        }
  
        const state = device.states.find(
          (s) => s.name === 'core:OpenClosedState' || s.name === 'core:OpenCloseState'
        );
  
        if (!state) {
          this.platform.log.warn('État de portail non disponible dans polling');
          return;
        }
  
        const currentState = state.value === 'open' ? 0 : 1;
  
        const Characteristic = this.platform.api.hap.Characteristic;
  
        this.service.updateCharacteristic(
          Characteristic.CurrentDoorState,
          currentState
        );
  
        // Bonus : aussi mettre à jour le TargetDoorState si besoin
        this.service.updateCharacteristic(
          Characteristic.TargetDoorState,
          currentState
        );
  
        this.platform.log.debug(`Polling - état actuel : ${state.value}`);
  
      } catch (err) {
        this.platform.log.error('Erreur polling état portail:', err.message);
      }
    }, 30000); // 30 secondes
  }
}

module.exports = { TahomaGateAccessory };

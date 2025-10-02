let Service, Characteristic;
const https = require('https');

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform(
    "homebridge-somfy-tahoma-v2-gate",
    "TahomaPortail",
    SomfyGatePlatform
  );
};

class SomfyGatePlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessoriesList = [];

    if (!config.ip || !config.token || !config.deviceURL) {
      this.log.error("Merci de remplir IP, token et deviceURL dans la config.");
      return;
    }

    if (api) {
      this.api.on('didFinishLaunching', async () => {
        this.log("Création de l'accessoire portail...");

        const uuid = this.api.hap.uuid.generate(this.config.deviceURL);
        const accessory = new this.api.platformAccessory(this.config.name, uuid);

        // GarageDoor principal
        const garageService = accessory.getService(Service.GarageDoorOpener) ||
                              accessory.addService(Service.GarageDoorOpener);

        garageService.getCharacteristic(Characteristic.CurrentDoorState).onGet(async () => {
          const state = await this.getState();
          return state.currentDoorState;
        });

        // Set Target State (ouvrir/fermer)
        garageService.getCharacteristic(Characteristic.TargetDoorState).onSet(async (value) => {
          try {
            if (value === Characteristic.TargetDoorState.OPEN) {
              await this.callTahomAPI("open");
              this.log.info("[Portail] Commande envoyée : OUVERTURE");
            } else {
              await this.callTahomAPI("close");
              this.log.info("[Portail] Commande envoyée : FERMETURE");
            }
          } catch (err) {
            this.log.error("Erreur TargetDoorState:", err);
          }
        });
/*
        // Stop
        const stopService = accessory.getService("Stop") || accessory.addService(Service.Switch, "Stop", "stopService");
        stopService.getCharacteristic(Characteristic.On).onSet(async (value) => {
          if (value) {
            try {
              await this.callTahomAPI("stop");
              this.log.info("[Portail] Commande envoyée : STOP");
            } catch (err) {
              this.log.error("Erreur Stop:", err);
            }
            setTimeout(() => stopService.updateCharacteristic(Characteristic.On, false), 500);
          }
        });

        // Mode Piéton
        const pedestrianService = accessory.getService("Piéton") || accessory.addService(Service.Switch, "Piéton", "pedestrianService");
        pedestrianService.getCharacteristic(Characteristic.On).onSet(async (value) => {
          if (value) {
            try {
              await this.callTahomAPI("setPedestrianPosition");
              this.log.info("[Portail] Commande envoyée : PIÉTON");
            } catch (err) {
              this.log.error("Erreur Piéton:", err);
            }
            setTimeout(() => pedestrianService.updateCharacteristic(Characteristic.On, false), 500);
          }
        });*/
        
        // Mode Piéton
        const pedestrianService = accessory.getService("Piéton") ||
          accessory.addService(Service.StatelessProgrammableSwitch, "Piéton", "pedestrianService");
        
        pedestrianService
          .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
          .on('set', async (value, callback) => {
            try {
              await this.callTahomAPI("setPedestrianPosition");
              this.log.info("[Portail] Commande envoyée : PIÉTON");
            } catch (err) {
              this.log.error("Erreur Piéton:", err);
            }
            callback();
          });
        
        // Stop
        const stopService = accessory.getService("Stop") ||
          accessory.addService(Service.StatelessProgrammableSwitch, "Stop", "stopService");
        
        stopService
          .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
          .on('set', async (value, callback) => {
            try {
              await this.callTahomAPI("stop");
              this.log.info("[Portail] Commande envoyée : STOP");
            } catch (err) {
              this.log.error("Erreur Stop:", err);
            }
            callback();
          });


        this.accessoriesList.push(accessory);
        this.api.registerPlatformAccessories("homebridge-somfy-tahoma-v2-gate", "TahomaPortail", [accessory]);

        // Polling état toutes les 10 secondes
        setInterval(async () => {
          const state = await this.getState();
          garageService.updateCharacteristic(Characteristic.CurrentDoorState, state.currentDoorState);
        }, 10000);

        // Logs toutes les 30 secondes
        if (this.config.logState !== false) {
          
          // Si logInterval est défini dans config.json, on l’utilise (en secondes si <1000, sinon en ms)
          let interval = this.config.logInterval || 30000;
          
          // Si l’utilisateur a mis un petit nombre (<1000), on considère que c’est en secondes
          if (interval < 1000) interval = interval * 1000;
          
          // Limiter intervalle entre 5s et 5min
          if (interval < 5000) interval = 5000;
          if (interval > 300000) interval = 300000;// permettre "30" pour 30s
          
          this.log.info(`[TahomaPortail] Logs d’état activés toutes les ${interval/1000}s`);

          setInterval(async () => {
            const state = await this.getState();
            let txtState = "Inconnu";
            switch (state.currentDoorState) {
              case Characteristic.CurrentDoorState.CLOSED:
                txtState = "Fermé";
                break;
              case Characteristic.CurrentDoorState.OPEN:
                txtState = "Ouvert";
                break;
              case Characteristic.CurrentDoorState.STOPPED:
                txtState = "Arrêté / Inconnu";
                break;
              case Characteristic.CurrentDoorState.OPENING:
                txtState = "Ouverture en cours";
                break;
              case Characteristic.CurrentDoorState.CLOSING:
                txtState = "Fermeture en cours";
                break;
            }
            this.log.info(`[Portail] État actuel : ${txtState}`);
          }, interval);
        }
      });
    }
  }

  accessories(callback) {
    callback(this.accessoriesList);
  }
 
  async getState() {
    try {
      const devices = await this.callTahomAPI("getDevices");
      let portalState = "unknown";
  
      for (const d of devices) {
        if (d.deviceURL === this.config.deviceURL) {
          const s = d.states.find(st => st.name === "core:OpenClosedPedestrianState");
          portalState = s ? s.value : "unknown";
  
          /*if (this.config.debug) {
            this.log(`[DEBUG] État brut portail: ${JSON.stringify(d.states)}`);
          }*/
        }
      }
  
      let currentDoorState = Characteristic.CurrentDoorState.STOPPED;
  
      switch (portalState) {
        case "closed":
          currentDoorState = Characteristic.CurrentDoorState.CLOSED;
          break;
        case "open":
          currentDoorState = Characteristic.CurrentDoorState.OPEN;
          break;
        case "pedestrian":
          // Pour HomeKit, on peut choisir OPEN ou STOPPED selon ton usage
          currentDoorState = Characteristic.CurrentDoorState.OPEN;
          break;
        default:
          // valeurs inconnues ou arrêt intermédiaire
          currentDoorState = Characteristic.CurrentDoorState.OPEN;
          break;
      }
  
      return { currentDoorState };
    } catch (err) {
      this.log.error("[TahomaPortail] Erreur getState:", err.message || err);
      return { currentDoorState: Characteristic.CurrentDoorState.STOPPED };
    }
  }


  callTahomAPI(cmd) {
    return new Promise((resolve, reject) => {
      let options, postData;

      if (cmd === "getDevices") {
        options = {
          hostname: this.config.ip.split(":")[0],
          port: parseInt(this.config.ip.split(":")[1]),
          path: "/enduser-mobile-web/1/enduserAPI/setup/devices",
          method: "GET",
          headers: { Authorization: "Bearer " + this.config.token },
          rejectUnauthorized: false
        };
      } else {
        postData = JSON.stringify({
          actions: [{
            deviceURL: this.config.deviceURL,
            commands: [{ name: cmd, parameters: cmd === "setPedestrianPosition" ? [] : [] }]
          }]
        });

        options = {
          hostname: this.config.ip.split(":")[0],
          port: parseInt(this.config.ip.split(":")[1]),
          path: "/enduser-mobile-web/1/enduserAPI/exec/apply",
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.config.token,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          rejectUnauthorized: false
        };
      }

      const req = https.request(options, (res) => {
        let data = "";
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            this.log.error("[TahomaPortail] Erreur parsing JSON:", e.message);
            reject(e);
          }
        });
      });

      req.on('error', (err) => {
        this.log.error(`[TahomaPortail] Erreur réseau (${cmd}): ${err.message}`);
        reject(err);
      });

      if (postData) req.write(postData);
      req.end();
    });
  }
}

let Service, Characteristic;
const https = require('https');
// Codes ANSI simples
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m"
};


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

    if (!config.ip || !config.token){
      this.log.error("Merci de remplir l'adresse IP et le token dans la config.");
      return;
    }

    if (api) {
      this.api.on('didFinishLaunching', async () => {
        this.log("Initialisation du plugin Tahoma Portail...");
        
        // Si deviceURL n'est pas défini, on liste les portails et on ne crée pas l'accessoire
        if (!this.config.deviceURL) {
          try {
            // Récupérer tous les devices
            const devices = await this.callTahomAPI("getDevices");
          
            // Filtrer uniquement les portails
            const portals = devices.filter(d =>
              d.definition.widgetName.toLowerCase().includes("gate")
            );
          
            if (portals.length === 0) {
              this.log("[Portail] Aucun portail trouvé.");
              return;
            }
            
            this.log.info("Portails détectés sur votre box Tahoma :");
            
            portals.forEach((d, i) => {
              const friendlyName = d.definition.label || d.definition.widgetName;
              this.log(`${colors.green}[Portail] ${i + 1}. Nom: ${friendlyName}, deviceURL: ${d.deviceURL}`);
            });
            
            this.log.info(`${colors.magenta}Copiez le deviceURL du portail que vous souhaitez utiliser dans la configuration.`);
            
          } catch (err) {
            this.log.error("Erreur lors de la récupération des devices:", err.message || err);
          }
          return
        }

        const uuid = this.api.hap.uuid.generate(this.config.deviceURL);
        const accessory = new this.api.platformAccessory(this.config.name, uuid);
        
        // GarageDoor principal
        const garageService = accessory.getService(Service.GarageDoorOpener) ||
                              accessory.addService(Service.GarageDoorOpener, this.config.name);

        garageService.getCharacteristic(Characteristic.CurrentDoorState).onGet(async () => {
          const state = await this.getState();
          return state.currentDoorState;
        });

        // Set Target State (ouvrir/fermer)
        garageService.getCharacteristic(Characteristic.TargetDoorState).onSet(async (value) => {
          try {
            if (value === Characteristic.TargetDoorState.OPEN) {
              await this.callTahomAPI("open");
              this.log.info(`${colors.green}[Portail] Commande envoyée : OUVERTURE`);
            } else {
              await this.callTahomAPI("close");
              this.log.info(`${colors.green}[Portail] Commande envoyée : FERMETURE`);
            }
          } catch (err) {
            this.log.error("Erreur TargetDoorState:", err);
          }
        });

        // // Stop
        // const stopService = accessory.addService(Service.Switch, "Stop Portail", "stopService");
        // stopService.getCharacteristic(Characteristic.On).onSet(async (value) => {
        //   if (value) {
        //     try {
        //       await this.callTahomAPI("stop");
        //       this.log.info("[Portail] Commande envoyée : STOP");
        //     } catch (err) {
        //       this.log.error("Erreur Stop:", err);
        //     }
        //     setTimeout(() => stopService.updateCharacteristic(Characteristic.On, false), 500);
        //   }
        // });

        // Mode Piéton
        //const pedestrianService = accessory.getServiceById(Service.Switch, "pedestrianService") || accessory.addService(Service.Switch, "Piéton", "pedestrianService");        
        const pedestrianService = accessory.addService(Service.Switch, "Mode Piéton", "pedestrianService");
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
        });
        
        this.accessoriesList.push(accessory);
        this.api.registerPlatformAccessories("homebridge-somfy-tahoma-v2-gate", "TahomaPortail", [accessory]);

        // Mise à jour de l'état toutes les 10s
        setInterval(async () => {
          const state = await this.getState();
          garageService.updateCharacteristic(Characteristic.CurrentDoorState, state.currentDoorState);
          garageService.updateCharacteristic(
            Characteristic.TargetDoorState,
            state.currentDoorState === Characteristic.CurrentDoorState.CLOSED
              ? Characteristic.TargetDoorState.CLOSED
              : Characteristic.TargetDoorState.OPEN
          );
        }, 10000);


        // Logs toutes les 30 secondes
        if (this.config.logState !== false) {
          
          let interval = this.config.logInterval || 30; // secondes
          if (interval < 5) interval = 5;
          if (interval > 300) interval = 300;
          interval = interval * 1000;
          
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
        }
      }
  
      //let currentDoorState = Characteristic.CurrentDoorState.STOPPED;
      let currentDoorState = Characteristic.CurrentDoorState.CLOSED;
  
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
            commands: [{ name: cmd, parameters: [] }] 
          }]
        });
        // postData = JSON.stringify({
        //   actions: [{
        //     deviceURL: this.config.deviceURL,
        //     commands: [{ name: cmd, parameters: cmd === "setPedestrianPosition" ? [] : [] }]
        //   }]
        // });

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
          try { resolve(JSON.parse(data)); }
          catch (e) { this.log.error("[TahomaPortail] Erreur parsing JSON:", e.message); reject(e); }
        });
      });
      
      req.on('error', (err) => { this.log.error(`[TahomaPortail] Erreur réseau (${cmd}): ${err.message}`); reject(err); });
      if (postData) req.write(postData);
      req.end();
    });
  }
}

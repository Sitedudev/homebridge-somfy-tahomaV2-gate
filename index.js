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
    SomfyGatePlatform,
    true // true = platform dynamique
  );
};

class SomfyGatePlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessoriesList = [];
    this.currentExecId = null; // Stocke l'exécution en cours
    this.lastDoorState = null; // Pour notification persistante

    if (!config.ip || !config.token){
      this.log.error("[TahomaPortail] Merci de remplir l'adresse IP et le token dans la config.");
      return;
    }

    if (api) {
      this.api.on('didFinishLaunching', this.onDidFinishLaunching.bind(this));

      // Hook pour cleanup des timers à l'arrêt de Homebridge
      this.api.on('shutdown', () => {
        this.clearTimers();
      });

      // Certains supportent aussi 'unload'
      this.api.on('unload', () => {
        this.clearTimers();
      });
    }
  }

   // Méthode pour clear tous les timers
  clearTimers() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      this.log.info("[TahomaPortail] Timer de polling arrêté.");
    }
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
      this.log.info("[TahomaPortail] Timer de logs arrêté.");
    }
  }

  // Stocke les accessoires du cache
  configureAccessory(accessory) {
    //this.log("Chargement de l’accessoire depuis le cache :", accessory.displayName);
    this.accessoriesList.push(accessory);

    this.clearTimers();
  }

  async onDidFinishLaunching() {
    this.log("[TahomaPortail] Initialisation du plugin Tahoma Portail...");

    const validUUID = this.config.deviceURL
      ? this.api.hap.uuid.generate(this.config.deviceURL)
      : null;

    // Supprimer les accessoires orphelins
    for (const acc of this.accessoriesList) {
      if (validUUID && acc.UUID === validUUID) {
        //this.log("[Portail] Accessoire conservé :", acc.displayName);
      } else {
        this.log.warn("[TahomaPortail] Suppression de l’accessoire orphelin :", acc.displayName);
        this.api.unregisterPlatformAccessories(
          "homebridge-somfy-tahoma-v2-gate",
          "TahomaPortail",
          [acc]
        );
      }
    }

    // Si deviceURL non défini, on liste les portails et on arrête
    if (!this.config.deviceURL) {
      try {
        const devices = await this.callTahomAPI("getDevices");
        const portals = devices.filter(d =>
          d.definition.widgetName.toLowerCase().includes("gate")
        );

        if (portals.length === 0) {
          this.log("[TahomaPortail] Aucun portail trouvé.");
          return;
        }

        this.log.info("[TahomaPortail] Portails détectés sur votre box Tahoma :");
        portals.forEach((d, i) => {
          const friendlyName = d.definition.label || d.definition.widgetName;
          this.log(`${colors.green}[TahomaPortail] ${i + 1}. Nom: ${friendlyName}, deviceURL: ${d.deviceURL}`);
        });

        this.log.info(`${colors.magenta}[Portail] Copiez le deviceURL du portail que vous souhaitez utiliser dans la configuration.`);
      } catch (err) {
        this.log.error("[Portail] Erreur lors de la récupération des devices:", err.message || err);
      }
      return;
    }

    // Créer et enregistrer l’accessoire
    await this.registerGateAccessory();
  }

  portalStateToHomeKit(stateVal) {
    switch(stateVal) {
      case "closed": return Characteristic.CurrentDoorState.CLOSED;
      case "open": return Characteristic.CurrentDoorState.OPEN;
      case "pedestrian": return Characteristic.CurrentDoorState.OPEN;
      default: return Characteristic.CurrentDoorState.STOPPED;
      }
    }

  async registerGateAccessory() {
    const uuid = this.api.hap.uuid.generate(this.config.deviceURL);
    let accessory = this.accessoriesList.find(a => a.UUID === uuid);

    if (!accessory) {
      accessory = new this.api.platformAccessory(this.config.name, uuid);
      this.accessoriesList.push(accessory);
      this.api.registerPlatformAccessories("homebridge-somfy-tahoma-v2-gate", "TahomaPortail", [accessory]);
    }

    // GarageDoor principal
    const garageService = accessory.getService(Service.GarageDoorOpener) ||
                          accessory.addService(Service.GarageDoorOpener, this.config.name);

    garageService.getCharacteristic(Characteristic.CurrentDoorState).onGet(async () => {
      const state = await this.getState();
      return state.currentDoorState;
    });

    garageService.getCharacteristic(Characteristic.TargetDoorState).onSet(async (value) => {
      try {

        const isOpen = value === Characteristic.TargetDoorState.OPEN;

        // On met l'état immédiat sur OPENING / CLOSING
        garageService.updateCharacteristic(
          Characteristic.CurrentDoorState,
          isOpen ? Characteristic.CurrentDoorState.OPENING : Characteristic.CurrentDoorState.CLOSING
        );

        // Envoi de la commande et récupération de l'execId
        const result = await this.callTahomAPI(isOpen ? "open" : "close");
        if (result && result.execId) {
          this.currentExecId = result.execId;
          this.log.info(`${colors.green}[TahomaPortail] Commande envoyée : ${isOpen ? "OUVERTURE" : "FERMETURE"} (execId: ${this.currentExecId})`);
        }

      } catch (err) {
        this.log.error("[TahomaPortail] Erreur TargetDoorState:", err);
      }
    });

    // Mode Piéton
    let pedestrianService = accessory.getServiceById(Service.Switch, "pedestrianService");
    if (!pedestrianService) {
      pedestrianService = accessory.addService(Service.Switch, "Mode Piéton", "pedestrianService");
    }
    
    pedestrianService.getCharacteristic(Characteristic.On).onSet(async (value) => {
      try{
        if(value){
          await this.callTahomAPI("setPedestrianPosition");
          this.log.info("[TahomaPortail] Commande envoyée : PIÉTON");
        }else{
          await this.callTahomAPI("close");
          this.log.info("[TahomaPortail] Commande envoyée : FEMETURE depuis Piéton");
        }
      } catch (err) {
        this.log.error("[TahomaPortail] Erreur Piéton:", err);
      }
    });

    // Service virtuel invisible pour notifications
    let notificationService = accessory.getServiceById(Service.Switch, "notificationService");
    if (!notificationService) {
      notificationService = accessory.addService(Service.Switch, "Notifications portail", "notificationService");
      notificationService.setPrimaryService(false); // 💡 invisible dans HomeKit
    }

    // On désactive l'action utilisateur
    notificationService.getCharacteristic(Characteristic.On).onSet(() => {
      // Pas d'action ici, ce switch est juste pour notifications
    });

    // setInterval principal qui permet de mettre à jour régulièrement l'état + notification
    const statePollingInterval = (this.config.pollingInterval || 10) * 1000;

    this.pollingTimer = setInterval(async () => {
      try {
        const devices = await this.callTahomAPI("getDevices");
        let portal = devices.find(d => d.deviceURL === this.config.deviceURL);
        if (!portal) return;

        const stateVal = portal.states.find(st => st.name === "core:OpenClosedPedestrianState")?.value || "unknown";

        const currentDoorState = this.portalStateToHomeKit(stateVal);

        // Si execId en cours, vérifier si l'état réel correspond toujours à l'exécution
        if (this.currentExecId) {
          const exec = portal.executions?.find(e => e.execId === this.currentExecId);
          if (!exec || exec.status !== "IN_PROGRESS" || (currentDoorState !== Characteristic.CurrentDoorState.OPENING && currentDoorState !== Characteristic.CurrentDoorState.CLOSING)) {
            this.currentExecId = null;
          }
        }

        // Met à jour le switch piéton selon l'état réel
        pedestrianService.updateCharacteristic(
          Characteristic.On,
          stateVal === "pedestrian"
        );

        // MAJ des caratéristiques HomeKit (retour d'état pour le bouton Portail)
        garageService.updateCharacteristic(Characteristic.CurrentDoorState, currentDoorState);

        // TargetDoorState = état souhaité réel
        let targetDoorState;
        switch(currentDoorState){
          case Characteristic.CurrentDoorState.OPEN:
            targetDoorState = Characteristic.TargetDoorState.OPEN; break;
          case Characteristic.CurrentDoorState.CLOSED:
            targetDoorState = Characteristic.TargetDoorState.CLOSED; break;
          default:
            // On garde le target précédent si STOPPED ou UNKNOWN
            targetDoorState = garageService.getCharacteristic(Characteristic.TargetDoorState).value;
        }

        garageService.updateCharacteristic(Characteristic.TargetDoorState, targetDoorState);

        // Notifications
        if (this.lastDoorState !== currentDoorState) {
          // Allume brièvement le switch pour générer notification
          notificationService.updateCharacteristic(Characteristic.On, true);
          setTimeout(() => notificationService.updateCharacteristic(Characteristic.On, false), 500);
          this.lastDoorState = currentDoorState;
        }

      }catch(err){
        this.log.error("[TahomaPortail] Erreur polling :", err.message || err);
      }
      
    }, statePollingInterval);

    // Logs paramétrables (actif ou non et affichable ou non)
    if (this.config.logState !== false) {
      let interval = this.config.logInterval || 30;
      if (interval < 5) interval = 5;
      if (interval > 300) interval = 300;
      interval = interval * 1000;

      this.log.info(`[TahomaPortail] Logs d’état activés toutes les ${interval/1000}s`);

      this.logTimer = setInterval(async () => {
        const state = await this.getState();
        let txtState = "Inconnu";
        switch (state.currentDoorState) {
          case Characteristic.CurrentDoorState.CLOSED: txtState = "Fermé"; break;
          case Characteristic.CurrentDoorState.OPEN: txtState = "Ouvert"; break;
          case Characteristic.CurrentDoorState.STOPPED: txtState = "Arrêté / Inconnu"; break;
          case Characteristic.CurrentDoorState.OPENING: txtState = "Ouverture en cours"; break;
          case Characteristic.CurrentDoorState.CLOSING: txtState = "Fermeture en cours"; break;
        }
        this.log.info(`[TahomaPortail] État actuel : ${txtState}`);
      }, interval);
    }
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

      const currentDoorState = this.portalStateToHomeKit(portalState);

      return { currentDoorState };
      
    } catch (err) {
      this.log.error("[TahomaPortail] Erreur getState:", err.message || err);
      return { currentDoorState: Characteristic.CurrentDoorState.UNKNOWN  };
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
          rejectUnauthorized: false,
          timeout: 5000 // ⏳ Timeout 5s s'il y a un problème sur la réponse
        };
      } else {
        postData = JSON.stringify({
          actions: [{ 
            deviceURL: this.config.deviceURL, 
            commands: [{ name: cmd, parameters: [] }] 
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
          rejectUnauthorized: false,
          timeout: 5000 // ⏳ Timeout 5s s'il y a un problème sur la réponse
        };
      }

      const req = https.request(options, (res) => {
        let data = "";
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { 
            if(res.statusCode >= 200 && res.statusCode < 300){
              resolve(JSON.parse(data)); 
            }else{
              reject(new Error(`[TahomaPortail] HTTP ${res.statusCode}: ${data}`));
            }
          } catch (e) { 
            reject(new Error("[TahomaPortail] Erreur parsing JSON: " + e.message));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("[TahomaPortail] Timeout (5s) atteint, la box Tahoma ne répond pas."));
      });

      req.on("error", err => reject(err));
      if (postData) req.write(postData);
      req.end();
    });
  }
}
# homebridge-somfy-tahoma-gate

Homebridge plugin pour piloter un portail **Somfy Elixo 3S io** via une box **Tahoma locale**.

Permet d’ouvrir, fermer, passer en mode piéton et obtenir l’état en temps réel dans HomeKit.

---

## Installation

1. Assurez-vous d’avoir Homebridge installé (≥ v1.8.0) et Node.js (≥ v22).
2. Installer le plugin via npm :

```bash
sudo npm install -g homebridge-somfy-tahoma-gate
```

3. Redémarrez Homebridge.

---

## Configuration

Exemple `config.json` :

```json
{
  "platforms": [
    {
      "platform": "TahomaPortail",
      "name": "Portail",
      "ip": "192.168.1.50:8443",
      "token": "VOTRE_TOKEN",
      "deviceURL": "io://1234-4567-8901/12345678",
      "logState": true,
      "logInterval": 30
    }
  ]
}
```

### Options

| Clé           | Description                                                | Type    | Par défaut  |
| ------------- | ---------------------------------------------------------- | ------- | ----------- |
| `name`        | Nom de l’accessoire HomeKit                                | string  | `"Portail"` |
| `ip`          | IP + port de la box Tahoma                                 | string  | -           |
| `token`       | Token d’authentification Tahoma                            | string  | -           |
| `deviceURL`   | Device URL du portail                                      | string  | -           |
| `logState`    | Activer les logs d’état                                    | boolean | false       |
| `logInterval` | Intervalle des logs (secondes, visible si `logState=true`) | number  | 30          |

---

## Fonctionnalités

* **Ouverture / Fermeture** du portail depuis HomeKit.
* **Mode Piéton** via un interrupteur séparé.
* **État en temps réel** synchronisé avec HomeKit.
* **Logs d’état paramétrables** via l’UI (intervalle configurable).

---

## Services HomeKit

* **Portail** : Service principal `GarageDoorOpener`.
* **Piéton** : Service `Switch` pour activer le mode piéton.
* **Stop** : Service `Switch` pour arrêter le portail (optionnel).

---

## Logs

Si `logState` est activé, l’état du portail est affiché dans les logs Homebridge toutes les `logInterval` secondes.

Exemple :

```
[Portail] État actuel : Fermé
[Portail] État actuel : Ouvert
```

---

## Notes

* **HomeKit** : le portail fermé est considéré par défaut, même si l’état réel est inconnu au démarrage.
* **Sécurité** : le mode debug détaillé est désactivé par défaut pour éviter les informations inutiles dans les logs.

---

## Version

* 1.0.2 : Correction bug Piéton / Stop et ajout logs d’état paramétrables via l’UI.

---

## Auteur

Rémy D - [GitHub](https://github.com/TonNom/homebridge-somfy-tahomaV2-gate)

---

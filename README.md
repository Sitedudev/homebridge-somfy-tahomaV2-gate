# Homebridge Somfy Tahoma V2 Gate

Plugin Homebridge pour contrôler un portail via l'API cloud Overkiz/Somfy (TaHoma V2).

## Installation

```bash
npm install -g homebridge-somfy-tahomaV2-gate
```

# Configuration

```json
{
  "platform": "TahomaGate",
  "name": "TahomaGate",
  "user": "email@exemple.com",
  "password": "motdepasse",
  "deviceURL": "io://xxxx-xxxx-xxxx/1"
}
```

# Fonctionnalités
- Ouverture/Fermeture du portail via HomeKit
- Basé sur l’API cloud Somfy (Overkiz)

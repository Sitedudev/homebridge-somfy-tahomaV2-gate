const axios = require('axios');

const BASE_URL = 'https://tahomalink.com/enduser-mobile-web/enduserAPI';

class TahomaClient {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login() {
    try {
      console.log('🔐 Tentative de connexion à Tahoma...');
      const res = await axios.post(`${BASE_URL}/login`, {
        username: this.email,
        password: this.password,
      });
      console.log('✅ Connexion réussie');
      this.accessToken = res.data.access_token;
      this.refreshToken = res.data.refresh_token;
      return true;
    } catch (e) {
      if (e.response) {
        console.error(`❌ Erreur HTTP ${e.response.status} :`, JSON.stringify(e.response.data, null, 2));
      } else if (e.request) {
        console.error('❌ Aucune réponse reçue de la box Tahoma :', e.message);
      } else {
        console.error('❌ Erreur inconnue :', e.message);
      }
      throw new Error('Erreur login Tahoma: ' + e.message);
    }
  }

  async getDevices() {
    try {
      const res = await axios.get(`${BASE_URL}/devices`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.data;
    } catch (e) {
      throw new Error('Erreur getDevices: ' + e.message);
    }
  }

  async sendCommand(device, command) {
    try {
      await axios.post(`${BASE_URL}/exec/apply`, {
        commands: [
          {
            deviceURL: device.deviceURL,
            commands: [
              {
                name: command,
                parameters: [],
              },
            ],
          },
        ],
      }, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    } catch (e) {
      throw new Error('Erreur sendCommand: ' + e.message);
    }
  }

  async getStates(device) {
    try {
      const res = await axios.get(`${BASE_URL}/deviceStates?deviceURL=${encodeURIComponent(device.deviceURL)}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.data;
    } catch (e) {
      throw new Error('Erreur getStates: ' + e.message);
    }
  }
}

module.exports = TahomaClient;

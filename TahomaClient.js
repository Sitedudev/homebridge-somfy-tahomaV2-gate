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
  console.log('🔐 [DEBUG] Début login()');
  const loginUrl = `${BASE_URL}/login`;
  console.log('🌐 [DEBUG] URL de login :', loginUrl);
  console.log('👤 [DEBUG] Email utilisé :', this.email);

  try {
    const body = {
      username: this.email,
      password: this.password,
    };
    console.log('📤 [DEBUG] Données envoyées :', body);

    const res = await axios.post(loginUrl, body);
    console.log('✅ [DEBUG] Réponse reçue :', res.data);

    this.accessToken = res.data.access_token;
    this.refreshToken = res.data.refresh_token;
    return true;
  } catch (e) {
    console.log('❌ [DEBUG] Une erreur est survenue');
    console.log('📡 [DEBUG] Requête complète :', e.request?.res?.statusCode || 'inconnue');
    console.log('📄 [DEBUG] Réponse erreur brute :', e.response?.data || 'aucune');
    console.log('💥 [DEBUG] Message :', e.message);
    throw e;
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

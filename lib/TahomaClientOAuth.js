const axios = require('axios');

const TOKEN_URL = 'https://accounts.somfy.com/oauth/oauth/v2/token';
const API_URL = 'https://api.somfy.com/api/v1';

class TahomaClientOAuth {
  constructor({ clientId, clientSecret, username, password, log }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.username = username;
    this.password = password;
    this.log = log;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login() {
    this.log('🔐 Connexion à l’API Somfy (OAuth2)...');

    try {
      const res = await axios.post(TOKEN_URL, null, {
        params: {
          grant_type: 'password',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username: this.username,
          password: this.password,
          scope: 'openid'
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      this.accessToken = res.data.access_token;
      this.refreshToken = res.data.refresh_token;
      this.log('✅ Authentification réussie');

    } catch (e) {
      this.log.error('❌ Erreur OAuth2:', e.response?.data || e.message);
      throw e;
    }
  }

  async getDevices() {
    const res = await axios.get(`${API_URL}/devices`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    return res.data.devices;
  }

  async executeCommand(deviceURL, name, parameters = []) {
    this.log(`⚙️ Envoi commande "${name}" à ${deviceURL}...`);

    const body = {
      actions: [{
        device_url: deviceURL,
        commands: [{
          name,
          parameters
        }]
      }]
    };

    const res = await axios.post(`${API_URL}/exec/apply`, body, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    this.log(`✅ Commande envoyée. ExecutionId: ${res.data.executionId}`);
    return res.data;
  }
}

module.exports = TahomaClientOAuth;

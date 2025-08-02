const axios = require('axios');

async function login(user, password) {
  const response = await axios.post('https://ha101-1.overkiz.com/enduser-mobile-web/enduserSession', {
    userId: user,
    userPassword: password
  });
  return response.data;
}

async function getDevices(session) {
  const url = `https://ha101-1.overkiz.com/enduser-mobile-web/enduserAPI/enduserAPI.jsf`;
  const response = await axios.post(url, {}, {
    headers: {
      'Cookie': 'JSESSIONID=' + session.jsessionid
    }
  });
  // La réponse est un JSON stringifié dans un champ, on doit parser proprement
  return JSON.parse(response.data);
}

async function discoverDevices(user, password) {
  try {
    const session = await login(user, password);
    const devicesRaw = await getDevices(session);

    // devicesRaw contient plein d’infos, on doit extraire la liste devices
    const devices = devicesRaw.deviceList || [];

    // Filtrer pour ne garder que les portails (typiquement deviceType contenant "Gate" ou autre)
    const gates = devices.filter(dev => dev.deviceType && dev.deviceType.toLowerCase().includes('gate'));

    return gates.map(dev => ({
      name: dev.label || dev.name,
      deviceURL: dev.deviceURL,
      deviceType: dev.deviceType
    }));
  } catch (err) {
    console.error('Erreur découverte TaHoma :', err.message);
    return [];
  }
}

module.exports = { discoverDevices };

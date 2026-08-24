const fs = require('node:fs');
const path = require('node:path');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return acc;
    }

    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    acc[key] = value;
    return acc;
  }, {});
}

const ENV = loadEnv(path.resolve(__dirname, '../.env'));
const BASE_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ENV.API_URL ||
  ENV.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001';

const BOOTSTRAP_ADMIN = {
  email: process.env.BOOTSTRAP_ADMIN_EMAIL || ENV.BOOTSTRAP_ADMIN_EMAIL,
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD || ENV.BOOTSTRAP_ADMIN_PASSWORD,
};

if (!BOOTSTRAP_ADMIN.email || !BOOTSTRAP_ADMIN.password) {
  throw new Error(
    'Define BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD en apps/api/.env antes de correr este script.',
  );
}

const TEST_INPUT = {
  cliente: 'Minera San Juan',
  sector: 'Minería',
  descripcion_trabajo: 'Instalación de un CCM de 8 secciones con concentrador de comunicaciones y prueba FAT/SAT',
  condiciones: { complejidad: 'alta', zona: 'remoto', urgencia: 'alta' },
  ubicacion: 'Zacatecas',
  origen: 'Cuautla, Morelos',
};

async function login() {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BOOTSTRAP_ADMIN),
  });

  if (!response.ok) {
    throw new Error(`Login falló con status ${response.status}`);
  }

  const data = await response.json();
  return data.accessToken;
}

async function runTest() {
  const token = await login();
  console.log(`Usando ${BASE_URL}/ai/suggest-quote con token ${token.slice(0, 10)}…`);

  const response = await fetch(`${BASE_URL}/ai/suggest-quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      text: JSON.stringify(TEST_INPUT, null, 2),
      mode: 'STRUCTURED_JSON',
    }),
  });

  if (!response.ok) {
    throw new Error(`La petición de sugerencia falló con ${response.status}`);
  }

  const data = await response.json();
  console.log('Respuesta estructurada:');
  console.log(JSON.stringify(data, null, 2));

  if (data.structured_output && Object.keys(data.structured_output).length) {
    console.log('Salida esperada disponible.');
  } else {
    console.warn('No hubo contenido en structured_output. Usa el log para revisar lo que devuelve la IA.');
  }
}

runTest().catch((error) => {
  console.error(error);
  process.exit(1);
});

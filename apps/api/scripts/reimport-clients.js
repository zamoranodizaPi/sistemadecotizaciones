const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');

const clients = [
  {
    nombre_empresa: 'Grupo Peñoles',
    contacto_principal: 'Luis Sánchez, Director de Operaciones',
    direccion_completa: 'Av. Fundidora 123, Torre Norte, Monterrey',
    ciudad: 'Monterrey',
    estado: 'Nuevo León',
    pais: 'México',
    telefono: '+52 81 1234 5678',
    correo_electronico: 'contacto@penoles.com.mx',
    RFC: 'GPE970101ABC',
    sector: 'minería',
  },
  {
    nombre_empresa: 'Saint Gobain México',
    contacto_principal: 'Mariana López, Gerente de Planta',
    direccion_completa: 'Av. Industria 456, Parque Industrial, Guadalajara',
    ciudad: 'Guadalajara',
    estado: 'Jalisco',
    pais: 'México',
    telefono: '+52 33 8765 4321',
    correo_electronico: 'info@mexico.saint-gobain.com',
    RFC: 'SGM960201XYZ',
    sector: 'industria',
  },
  {
    nombre_empresa: 'Grupo Minero San Luis',
    contacto_principal: 'Carlos Herrera, Jefe de Ingeniería',
    direccion_completa: 'Calle Mina 789, Zona Industrial, San Luis Potosí',
    ciudad: 'San Luis Potosí',
    estado: 'San Luis Potosí',
    pais: 'México',
    telefono: '+52 444 555 6677',
    correo_electronico: 'contacto@minerosanluis.com',
    RFC: 'GMSL950310DEF',
    sector: 'minería',
  },
  {
    nombre_empresa: 'Tepsa',
    contacto_principal: 'Andrés Torres, Director Comercial',
    direccion_completa: 'Av. Reforma 1234, Col. Centro, Ciudad de México',
    ciudad: 'Ciudad de México',
    estado: 'CDMX',
    pais: 'México',
    telefono: '+52 55 1234 5678',
    correo_electronico: 'ventas@gtepsa.com.mx',
    RFC: 'TPS960525GHI',
    sector: 'integrador industrial',
  },
  {
    nombre_empresa: 'Eaton Technologies',
    contacto_principal: 'Gerardo Figueroa, Gerente de Planta',
    direccion_completa: 'AVENIDA REAL DE MAYORAZGO No. 130 PISO 124 Col. XOCO, Benito Juárez',
    ciudad: 'Ciudad de México',
    estado: 'CDMX',
    pais: 'México',
    telefono: '+52 55 8765 4321',
    correo_electronico: 'gerardo.figueroa@eaton.com',
    RFC: 'ETE9603221A4',
    sector: 'industria',
  },
  {
    nombre_empresa: 'Minera Cuzcatlán',
    contacto_principal: 'Jorge Martínez, Coordinador de Ingeniería',
    direccion_completa: 'Carretera Oaxaca-Zapoteco Km 12, Oaxaca',
    ciudad: 'Oaxaca',
    estado: 'Oaxaca',
    pais: 'México',
    telefono: '+52 951 123 4567',
    correo_electronico: 'contacto@cuzcatlan.com.mx',
    RFC: 'MCZ970410JKL',
    sector: 'minería',
  },
  {
    nombre_empresa: 'Subestaciones Eléctricas del Norte',
    contacto_principal: 'Ana Ramírez, Ingeniera Líder',
    direccion_completa: 'Av. Norte 450, Parque Industrial, Monterrey',
    ciudad: 'Monterrey',
    estado: 'Nuevo León',
    pais: 'México',
    telefono: '+52 81 2345 6789',
    correo_electronico: 'info@subestacionesnorte.com',
    RFC: 'SEN950715MNO',
    sector: 'subestaciones',
  },
  {
    nombre_empresa: 'Integraciones Eléctricas México',
    contacto_principal: 'Roberto Díaz, Director Técnico',
    direccion_completa: 'Av. Industrial 789, Guadalajara',
    ciudad: 'Guadalajara',
    estado: 'Jalisco',
    pais: 'México',
    telefono: '+52 33 9876 5432',
    correo_electronico: 'contacto@iem.com.mx',
    RFC: 'IEM960801PQR',
    sector: 'integrador industrial',
  },
  {
    nombre_empresa: 'Grupo Minero Real del Norte',
    contacto_principal: 'Patricia Gómez, Jefe de Operaciones',
    direccion_completa: 'Calle Mina 321, Zona Industrial, Durango',
    ciudad: 'Durango',
    estado: 'Durango',
    pais: 'México',
    telefono: '+52 618 123 4567',
    correo_electronico: 'contacto@gmrn.com.mx',
    RFC: 'GMRN970220STU',
    sector: 'minería',
  },
  {
    nombre_empresa: 'Subestaciones y Redes Eléctricas S.A.',
    contacto_principal: 'Miguel Torres, Ingeniero Responsable',
    direccion_completa: 'Av. Energía 100, Col. Industrial, Querétaro',
    ciudad: 'Querétaro',
    estado: 'Querétaro',
    pais: 'México',
    telefono: '+52 442 234 5678',
    correo_electronico: 'info@sre.com.mx',
    RFC: 'SRE960605VWX',
    sector: 'subestaciones',
  },
];

console.log('DATABASE_URL', process.env.DATABASE_URL);
const prisma = new PrismaClient();

async function main() {
  for (const entry of clients) {
    const contactParts = entry.contacto_principal.split(',');
    const fullName = contactParts[0].trim();
    const position = contactParts.slice(1).join(',').trim() || null;

    const client = await prisma.client.upsert({
      where: { rfc: entry.RFC },
      update: {
        legalName: entry.nombre_empresa,
        commercialName: entry.nombre_empresa,
        address: entry.direccion_completa,
        city: entry.ciudad,
        state: entry.estado,
        country: entry.pais,
        updatedAt: new Date(),
        deletedAt: null,
      },
      create: {
        legalName: entry.nombre_empresa,
        commercialName: entry.nombre_empresa,
        rfc: entry.RFC,
        address: entry.direccion_completa,
        city: entry.ciudad,
        state: entry.estado,
        country: entry.pais,
      },
    });

    await prisma.contact.deleteMany({ where: { clientId: client.id } });
    await prisma.contact.create({
      data: {
        clientId: client.id,
        fullName,
        email: entry.correo_electronico,
        phone: entry.telefono,
        position,
        isPrimary: true,
      },
    });
  }

  console.log(`Clientes importados: ${clients.length}`);
}

main()
  .catch((error) => {
    console.error('Error al importar clientes:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

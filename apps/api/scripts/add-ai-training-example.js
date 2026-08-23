const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const trainingInput = {
  cliente: 'Minera Industrial',
  sector: 'Minería',
  ubicacion: 'Sitio remoto',
  pedido: 'Suministro e instalación de Centro de Control de Motores (CCM) 10 secciones con comunicaciones industriales',
  criterios: [
    'Diseño, suministro, instalación, integración y puesta en marcha del CCM',
    'Normativas IEC 61439, NEMA, IEEE y NFPA 70',
    'Monitoreo y comunicación industrial',
  ],
};

const trainingOutput = {
  proyecto: 'Suministro e instalación de Centro de Control de Motores (CCM) 10 secciones con comunicaciones industriales',
  cliente: 'Minera Industrial',
  sector: 'Minería',
  ubicacion: 'Sitio remoto',
  resumen_ejecutivo:
    'Se provee un CCM modular de 10 secciones con barraje 1,200A, arrancadores, variadores, relés inteligentes y cableado de potencia y control, complementado con automatización Siemens PLC/HMI, SCADA básico y comunicaciones industriales redundantes. Incluye ingeniería, instalación, programación, pruebas FAT/SAT y puesta en marcha para operación continua 24/7 bajo normativas mineras.',
  soluciones: [
    {
      tipo: 'ccm',
      descripcion:
        'Centro de control modular Form 4 con barraje principal, interruptores principales y arrancadores inteligentes para controlar diez motores críticos.',
      componentes: [
        { tipo: 'equipo', nombre: 'Estructura CCM 10 secciones (Form 4)', marca: 'Schneider / ABB / Eaton', cantidad: 1, costo_unitario: 45000 },
        { tipo: 'material', nombre: 'Barraje de cobre electrolítico 1200A', cantidad: 1, costo_unitario: 8000 },
        { tipo: 'material', nombre: 'Interruptor principal 1200A', marca: 'Schneider', cantidad: 1, costo_unitario: 6000 },
        { tipo: 'material', nombre: 'Arrancadores de motor (contactores + relés)', marca: 'Siemens', cantidad: 10, costo_unitario: 1200 },
        { tipo: 'material', nombre: 'Variadores de frecuencia (VFD)', marca: 'ABB', cantidad: 4, costo_unitario: 2500 },
        { tipo: 'material', nombre: 'Relés de protección inteligentes', marca: 'Schneider', cantidad: 10, costo_unitario: 900 },
        { tipo: 'material', nombre: 'Cableado de potencia y control', marca: 'Condumex / Viakon', cantidad: 1, costo_unitario: 12000 },
        { tipo: 'material', nombre: 'Canalizaciones, charolas y accesorios', cantidad: 1, costo_unitario: 6000 },
      ],
    },
    {
      tipo: 'automatizacion',
      descripcion: 'Sistema Siemens PLC/HMI + SCADA para control, monitoreo y alarmas de los motores y bombas.',
      componentes: [
        { tipo: 'equipo', nombre: 'PLC industrial', marca: 'Siemens S7-1500', cantidad: 1, costo_unitario: 5000 },
        { tipo: 'equipo', nombre: 'HMI industrial', marca: 'Siemens', cantidad: 1, costo_unitario: 2500 },
        { tipo: 'equipo', nombre: 'SCADA básico', cantidad: 1, costo_unitario: 4000 },
      ],
    },
    {
      tipo: 'comunicaciones',
      descripcion: 'Red industrial redundante con gateway y switches Ethernet para comunicaciones entre CCM, PLC y SCADA.',
      componentes: [
        { tipo: 'equipo', nombre: 'Concentrador de comunicaciones (Gateway industrial)', marca: 'Moxa / Siemens', cantidad: 1, costo_unitario: 2500 },
        { tipo: 'material', nombre: 'Switch industrial Ethernet', cantidad: 2, costo_unitario: 800 },
        { tipo: 'material', nombre: 'Cableado Ethernet industrial', cantidad: 1, costo_unitario: 1500 },
      ],
    },
    {
      tipo: 'servicios',
      descripcion: 'Ingeniería, instalación eléctrica/mecánica, programación y puesta en marcha con ajustes FAT/SAT.',
      componentes: [
        { tipo: 'servicio', nombre: 'Ingeniería eléctrica y planos', costo: 8000 },
        { tipo: 'servicio', nombre: 'Instalación mecánica y eléctrica', costo: 15000 },
        { tipo: 'servicio', nombre: 'Programación PLC + SCADA', costo: 7000 },
        { tipo: 'servicio', nombre: 'Puesta en marcha', costo: 5000 },
      ],
    },
  ],
  pruebas_aceptacion: {
    fat: [
      'Inspección visual del CCM',
      'Pruebas de continuidad',
      'Pruebas de aislamiento (Megger)',
      'Pruebas funcionales de arrancadores',
      'Verificación de comunicación PLC',
    ],
    sat: [
      'Pruebas de energización',
      'Verificación de secuencia de motores',
      'Pruebas de carga',
      'Pruebas de protecciones',
      'Integración con SCADA',
    ],
  },
  tiempos: {
    ingenieria: '2 semanas',
    fabricacion: '4-6 semanas',
    instalacion: '3 semanas',
    puesta_marcha: '1 semana',
    duracion_total: '10-12 semanas',
  },
  costos: {
    materiales: 104000,
    mano_obra: 35000,
    factores: {
      complejidad: 1.4,
      zona: 1.3,
      urgencia: 1.0,
    },
    margen: 1.3,
    total_estimado: 252980,
  },
  observaciones: [
    'Sistema modular expandible',
    'Preparado para integración con SCADA',
    'Cumple normas industriales para minería',
    'Incluye pruebas FAT y SAT',
    'Preparado para operación continua 24/7',
  ],
};

async function main() {
  console.log('DATABASE_URL', process.env.DATABASE_URL);
  const existing = await prisma.trainingExample.findFirst({
    where: {
      input: trainingInput,
      output: trainingOutput,
    },
  });

  if (existing) {
    console.log('La entrada de entrenamiento ya existe.');
    return;
  }

  await prisma.trainingExample.create({
    data: {
      input: trainingInput,
      output: trainingOutput,
      embedding: [],
      aceptado: true,
    },
  });

  console.log('Ejemplo de entrenamiento registrado.');
}

main()
  .catch((error) => {
    console.error('Error al registrar entrenamiento:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

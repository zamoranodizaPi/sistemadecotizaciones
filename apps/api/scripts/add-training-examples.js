const { PrismaClient } = require('@prisma/client');

const dataset = [
  {
    input: {
      cliente: 'Parque Industrial Norte',
      sector: 'Industrial',
      descripcion_trabajo: 'Diseño e instalación de sistema de distribución eléctrica en nave industrial con múltiples líneas de producción',
    },
    output: {
      proyecto: 'Sistema de distribución eléctrica industrial',
      soluciones: [
        {
          tipo: 'distribucion electrica',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'material',
              nombre: 'Tablero de distribución 400A',
              marca: 'Schneider',
              categoria: 'tableros',
              costo: 2500,
            },
            {
              tipo: 'material',
              nombre: 'Interruptor termomagnético 250A',
              marca: 'Eaton',
              categoria: 'proteccion',
              costo: 600,
            },
            {
              tipo: 'material',
              nombre: 'Cableado 3/0 AWG',
              marca: 'Viakon',
              categoria: 'conductores',
              costo: 1800,
            },
            {
              tipo: 'servicio',
              nombre: 'Instalación de sistema de distribución',
              categoria: 'instalacion',
              costo: 3000,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Planta Embotelladora',
      sector: 'Industrial',
      descripcion_trabajo: 'Automatización de línea de producción con PLC, sensores y monitoreo en tiempo real',
    },
    output: {
      proyecto: 'Automatización de procesos industriales',
      soluciones: [
        {
          tipo: 'automatizacion',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'material',
              nombre: 'PLC S7-1500',
              marca: 'Siemens',
              categoria: 'control',
              costo: 3500,
            },
            {
              tipo: 'material',
              nombre: 'Sensores industriales',
              marca: 'Omron',
              categoria: 'sensores',
              costo: 1200,
            },
            {
              tipo: 'servicio',
              nombre: 'Programación y puesta en marcha',
              categoria: 'ingenieria',
              costo: 2000,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Hospital Regional',
      sector: 'Salud',
      descripcion_trabajo: 'Instalación de sistema eléctrico redundante con UPS y planta de emergencia',
    },
    output: {
      proyecto: 'Sistema eléctrico crítico',
      soluciones: [
        {
          tipo: 'energia critica',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'material',
              nombre: 'UPS 100 kVA',
              marca: 'APC',
              categoria: 'respaldo',
              costo: 8000,
            },
            {
              tipo: 'material',
              nombre: 'Planta de emergencia',
              marca: 'Cummins',
              categoria: 'generacion',
              costo: 15000,
            },
            {
              tipo: 'servicio',
              nombre: 'Integración de sistema crítico',
              categoria: 'instalacion',
              costo: 5000,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Centro Logístico',
      sector: 'Logística',
      descripcion_trabajo: 'Análisis de calidad de energía y corrección de factor de potencia',
    },
    output: {
      proyecto: 'Optimización de calidad de energía',
      soluciones: [
        {
          tipo: 'calidad energia',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: false,
          componentes: [
            {
              tipo: 'material',
              nombre: 'Banco de capacitores',
              marca: 'ABB',
              categoria: 'compensacion',
              costo: 3000,
            },
            {
              tipo: 'servicio',
              nombre: 'Estudio de calidad de energía',
              categoria: 'ingenieria',
              costo: 1200,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Aeropuerto Internacional',
      sector: 'Infraestructura',
      descripcion_trabajo: 'Mantenimiento integral de subestación eléctrica de media tensión',
    },
    output: {
      proyecto: 'Mantenimiento de subestación',
      soluciones: [
        {
          tipo: 'subestacion',
          incluyeIngenieria: true,
          incluyeInstalacion: false,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'servicio',
              nombre: 'Pruebas a transformador',
              categoria: 'mantenimiento',
              costo: 2000,
            },
            {
              tipo: 'servicio',
              nombre: 'Inspección de protecciones',
              categoria: 'mantenimiento',
              costo: 1500,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Plaza Comercial',
      sector: 'Retail',
      descripcion_trabajo: 'Instalación de sistema de iluminación LED eficiente',
    },
    output: {
      proyecto: 'Sistema de iluminación eficiente',
      soluciones: [
        {
          tipo: 'iluminacion',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: false,
          componentes: [
            {
              tipo: 'material',
              nombre: 'Luminarias LED',
              marca: 'Philips',
              categoria: 'iluminacion',
              costo: 2500,
            },
            {
              tipo: 'servicio',
              nombre: 'Instalación de luminarias',
              categoria: 'instalacion',
              costo: 1200,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Industria Metalúrgica',
      sector: 'Industrial',
      descripcion_trabajo: 'Instalación de variadores de frecuencia para control de motores',
    },
    output: {
      proyecto: 'Control de motores eléctricos',
      soluciones: [
        {
          tipo: 'automatizacion',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'material',
              nombre: 'Variador de frecuencia',
              marca: 'ABB',
              categoria: 'control',
              costo: 1800,
            },
            {
              tipo: 'servicio',
              nombre: 'Configuración de variador',
              categoria: 'ingenieria',
              costo: 900,
            },
          ],
        },
      ],
    },
  },
  {
    input: {
      cliente: 'Edificio Corporativo',
      sector: 'Oficinas',
      descripcion_trabajo: 'Instalación eléctrica completa en edificio de oficinas',
    },
    output: {
      proyecto: 'Sistema eléctrico comercial',
      soluciones: [
        {
          tipo: 'distribucion electrica',
          incluyeIngenieria: true,
          incluyeInstalacion: true,
          incluyePuestaMarcha: true,
          incluyeMantenimiento: true,
          componentes: [
            {
              tipo: 'material',
              nombre: 'Tablero general',
              marca: 'Schneider',
              categoria: 'tableros',
              costo: 3000,
            },
            {
              tipo: 'servicio',
              nombre: 'Cableado e instalación',
              categoria: 'instalacion',
              costo: 4000,
            },
          ],
        },
      ],
    },
  },
];

(async () => {
  const prisma = new PrismaClient();
  try {
    for (const entry of dataset) {
      await prisma.trainingExample.create({
        data: {
          input: entry.input,
          output: entry.output,
          embedding: [],
          aceptado: true,
        },
      });
    }
    console.log('Inserted training examples:', dataset.length);
  } finally {
    await prisma.$disconnect();
  }
})();

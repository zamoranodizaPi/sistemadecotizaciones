/**
 * Catalogo cerrado de industrias de cliente. Se mantiene como constante en
 * codigo (no como enum de Prisma) para poder agregar una industria nueva
 * sin necesitar una migracion; el cierre del catalogo se aplica en el DTO
 * (@IsIn) y en el select del frontend.
 */
export const CLIENT_INDUSTRIES = [
  'Minería',
  'Industria general',
  'Subestaciones',
  'Integrador industrial',
  'Generación de energía',
  'Otro',
] as const;

export type ClientIndustry = (typeof CLIENT_INDUSTRIES)[number];

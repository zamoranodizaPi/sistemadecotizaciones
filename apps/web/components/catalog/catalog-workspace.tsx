'use client';

import { CatalogExplorer } from '@/components/catalog/catalog-explorer';
import { ReusableTextBlockManager } from '@/components/catalog/reusable-text-block-manager';
import { ServiceCatalogManager } from '@/components/catalog/service-catalog-manager';
import { WorkItemCatalogManager } from '@/components/catalog/work-item-catalog-manager';

export function CatalogWorkspace({ section = 'suministros' }: { section?: 'suministros' | 'servicios' | 'actividades' | 'bloques' }) {
  return (
    <>
      {section === 'actividades' ? <WorkItemCatalogManager /> : null}
      {section === 'servicios' ? <ServiceCatalogManager /> : null}
      {section === 'bloques' ? <ReusableTextBlockManager /> : null}
      {section === 'suministros' ? <CatalogExplorer /> : null}
    </>
  );
}

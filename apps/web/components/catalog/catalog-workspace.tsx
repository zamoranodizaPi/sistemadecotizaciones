'use client';

import { CatalogExplorer } from '@/components/catalog/catalog-explorer';
import { ReusableTextBlockManager } from '@/components/catalog/reusable-text-block-manager';
import { WorkItemCatalogManager } from '@/components/catalog/work-item-catalog-manager';

export function CatalogWorkspace({ section = 'conceptos' }: { section?: 'conceptos' | 'trabajos' | 'bloques' }) {
  return (
    <>
      {section === 'trabajos' ? <WorkItemCatalogManager /> : null}
      {section === 'bloques' ? <ReusableTextBlockManager /> : null}
      {section === 'conceptos' ? <CatalogExplorer /> : null}
    </>
  );
}

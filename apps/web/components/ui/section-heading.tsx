'use client';

import { useEffect, useState, type ReactNode } from 'react';

const PRODUCTIVITY_QUOTES = [
  'La velocidad comercial nace de decidir hoy lo importante.',
  'Menos fricción en el proceso, más cotizaciones cerradas.',
  'Cada seguimiento claro reduce tiempo perdido.',
  'La productividad mejora cuando el equipo ve lo esencial primero.',
  'La disciplina en pipeline convierte actividad en resultados.',
  'Cotizar mejor también es responder más rápido y con más foco.',
  'La claridad operativa reduce retrabajo y acelera el cierre.',
  'Cada detalle bien capturado hoy evita correcciones mañana.',
];

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  showQuote = true,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  showQuote?: boolean;
}) {
  const [quote, setQuote] = useState('');

  useEffect(() => {
    if (!showQuote) {
      setQuote('');
      return;
    }

    const nextQuote = PRODUCTIVITY_QUOTES[Math.floor(Math.random() * PRODUCTIVITY_QUOTES.length)];
    setQuote(nextQuote);
  }, [showQuote, title, eyebrow]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">{eyebrow}</p>
        ) : null}
        {title ? (
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">{title}</h1>
        ) : null}
        {description ? <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">{description}</p> : null}
        {quote ? <p className="mt-2 text-sm font-medium text-[var(--color-primary)]">{quote}</p> : null}
      </div>
      {action}
    </div>
  );
}

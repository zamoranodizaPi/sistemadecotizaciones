export default function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          No encontrado
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">
          La vista solicitada no existe
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Regresa al pipeline o usa la navegacion lateral para continuar trabajando.
        </p>
      </div>
    </div>
  );
}

const foundations = [
  {
    id: "FND-01",
    title: "Repositório",
    state: "Local pronto",
    detail: "Publicação privada pendente de criação do remoto.",
  },
  {
    id: "FND-02",
    title: "Aplicação",
    state: "Implementado",
    detail: "Next.js App Router, TypeScript estrito e módulos por domínio.",
  },
  {
    id: "FND-03",
    title: "Qualidade",
    state: "Implementado",
    detail: "Lint, typecheck, testes, build e pipeline de CI.",
  },
  {
    id: "FND-04",
    title: "Tenancy",
    state: "Implementado",
    detail: "Operadora, cliente, marca, workspace, RBAC e auditoria.",
  },
] as const;

export default function FoundationPage() {
  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Tehkné Solutions · Foundation 0.1</p>
          <h1>Growth Operations, com governança desde o primeiro dado.</h1>
          <p className="lede">
            Base multiempresa para aquisição, marketing, dados e automação em
            clientes de diferentes setores.
          </p>
        </div>
        <div className="status" aria-label="Estado da fundação">
          <span className="statusDot" />
          Sprint 1 em construção
        </div>
      </header>

      <section aria-labelledby="foundation-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Fundação verificável</p>
            <h2 id="foundation-title">FND-01–FND-04</h2>
          </div>
          <p>Nenhuma métrica de cliente é simulada nesta etapa.</p>
        </div>

        <div className="grid">
          {foundations.map((item) => (
            <article className="card" key={item.id}>
              <div className="cardTopline">
                <span>{item.id}</span>
                <span className="pill">{item.state}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <span>Tehkné Growth OS</span>
        <span>Tehkné Solutions</span>
      </footer>
    </main>
  );
}

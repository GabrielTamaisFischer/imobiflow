export function normalizeWebsiteDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\/+/, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/\.$/, "");
}

export function buildWebsiteDomainDnsChecklist(domain: string, websiteSlug: string) {
  const normalizedDomain = normalizeWebsiteDomain(domain);
  const target = `${websiteSlug}.imobiflow-sites.local`;
  const parts = normalizedDomain.split(".");
  const isBrazilianRoot = normalizedDomain.endsWith(".com.br") && parts.length <= 3;
  const isRootLike = parts.length <= 2 || isBrazilianRoot;

  if (isRootLike) {
    return {
      status: "pending",
      target,
      records: [
        {
          type: "A",
          name: "@",
          value: "CONFIGURAR_IP_DA_PUBLICACAO",
          purpose: "Apontamento do dominio raiz quando a publicacao estiver ativa.",
        },
        {
          type: "CNAME",
          name: "www",
          value: target,
          purpose: "Apontamento do www para o site publicado pelo ImobiFlow.",
        },
      ],
    };
  }

  return {
    status: "pending",
    target,
    records: [
      {
        type: "CNAME",
        name: normalizedDomain.split(".")[0],
        value: target,
        purpose: "Apontamento do subdominio para o site publicado pelo ImobiFlow.",
      },
    ],
  };
}

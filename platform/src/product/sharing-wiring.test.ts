import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Fase 2.2D — testes de "fiação" (wiring): mesma técnica já usada em
// phase21b-blockers.test.ts (leitura do código-fonte real + asserções de
// presença), porque este projeto não tem infraestrutura de renderização de
// componentes (vitest roda em "environment: node", sem jsdom/testing-library
// — ver vitest.config.ts, que também só coleta *.test.ts, não *.test.tsx).
// Isso garante que a integração backend<->frontend permanece corretamente
// conectada sem precisar montar DOM.

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("Fase 2.2D — compartilhamento de Imóvel (wiring em app.imoveis.tsx)", () => {
  it("shows a manage-labeled action when the viewer can manage sharing, view-only otherwise (#6, #7)", async () => {
    const routeSource = await source("../routes/app.imoveis.tsx");
    expect(routeSource).toContain('canManageResourceSharing(currentUser, "properties.manage", ownerId)');
    expect(routeSource).toContain('label={canManageSharing ? "Compartilhar imóvel" : "Pessoas com acesso"}');
  });

  it("wires the property access dialog to the real PropertyAccess endpoints (#8, #9, #10, #11)", async () => {
    const routeSource = await source("../routes/app.imoveis.tsx");
    expect(routeSource).toContain("listEligibleUsers={listPropertyEligibleUsers}");
    expect(routeSource).toContain("listAccess={() => listPropertyAccess(property.id)}");
    expect(routeSource).toContain("grant={(userId, permissions) => grantPropertyAccess(property.id, userId, permissions)}");
    expect(routeSource).toContain("replace={(userId, permissions) => replacePropertyAccess(property.id, userId, permissions)}");
    expect(routeSource).toContain("revoke={(accessId) => revokePropertyAccess(property.id, accessId)}");
  });

  it("uses GET /real-estate/users (properties.view/manage), not the users.manage-gated listUsers, for the recipient picker", async () => {
    const clientSource = await source("./real-estate.ts");
    expect(clientSource).toContain('apiRequest<{ users: EligibleUser[] }>("/real-estate/users"');
  });

  it("shows the ownership badge next to the property title without altering existing card layout", async () => {
    const routeSource = await source("../routes/app.imoveis.tsx");
    expect(routeSource).toContain("<ResourceOwnershipBadge badge={ownershipBadge} />");
    expect(routeSource).toContain("getOwnershipBadge({");
  });

  it("keeps the pre-existing PDF-report 'Compartilhar' action untouched (no naming collision regression, #30)", async () => {
    const routeSource = await source("../routes/app.imoveis.tsx");
    expect(routeSource).toContain("onClick={() => void shareReport()}");
    expect(routeSource).toContain("<Share2 className=\"h-4 w-4\" />");
  });
});

describe("Fase 2.2D — compartilhamento de Lead (wiring em app.crm.tsx)", () => {
  it("shows a manage-labeled action when the viewer can manage sharing, view-only otherwise (#16, #17)", async () => {
    const routeSource = await source("../routes/app.crm.tsx");
    expect(routeSource).toContain('canManageResourceSharing(currentUser, "crm.manage", lead.assigned_to)');
    expect(routeSource).toContain('{canManageSharing ? "Compartilhar lead" : "Pessoas com acesso"}');
  });

  it("wires the lead access dialog to the real LeadAccess endpoints (#18, #19, #20, #21)", async () => {
    const routeSource = await source("../routes/app.crm.tsx");
    expect(routeSource).toContain("listEligibleUsers={listCrmUsers}");
    expect(routeSource).toContain("listAccess={() => listLeadAccess(lead.id)}");
    expect(routeSource).toContain("grant={(userId, permissions) => grantLeadAccess(lead.id, userId, permissions)}");
    expect(routeSource).toContain("replace={(userId, permissions) => replaceLeadAccess(lead.id, userId, permissions)}");
    expect(routeSource).toContain("revoke={(accessId) => revokeLeadAccess(lead.id, accessId)}");
  });

  it("does not create a duplicate eligible-users endpoint for Lead sharing — reuses listCrmUsers", async () => {
    const routeSource = await source("../routes/app.crm.tsx");
    // A única chamada de "listagem de usuários elegíveis" no arquivo deve
    // ser a já existente listCrmUsers — nenhuma nova função foi criada.
    expect(routeSource).not.toContain("listLeadEligibleUsers");
  });

  it("never sends assigned_to in a grant/replace/revoke request body (#22)", async () => {
    const clientSource = await source("./crm.ts");
    const shareFunctions = clientSource.slice(
      clientSource.indexOf("export async function listLeadAccess"),
      clientSource.indexOf("export async function createLeadTask"),
    );
    expect(shareFunctions).not.toContain("assigned_to");
    expect(shareFunctions).toContain("JSON.stringify({ user_id: userId, permissions })");
  });

  it("keeps the sharing dialog fully separate from the lead-edit form's assignedTo state (#22)", async () => {
    const routeSource = await source("../routes/app.crm.tsx");
    // O diálogo de compartilhamento não recebe onSaved nem toca em
    // setAssignedTo — só o formulário de edição do lead (buildLeadDetailUpdateInput) altera assigned_to.
    const dialogBlock = routeSource.slice(
      routeSource.indexOf("<ResourceShareDialog"),
      routeSource.indexOf("</div>;\n}", routeSource.indexOf("<ResourceShareDialog")),
    );
    expect(dialogBlock).not.toContain("setAssignedTo");
    expect(dialogBlock).not.toContain("onSaved");
  });

  it("shows the ownership badge on the lead card and in the lead detail header", async () => {
    const routeSource = await source("../routes/app.crm.tsx");
    expect(routeSource.match(/<ResourceOwnershipBadge badge={ownershipBadge} \/>/g)?.length).toBe(2);
  });
});

describe("Fase 2.2D — estados de carregamento, erro e acessibilidade do diálogo compartilhado", () => {
  it("shows a loading state while fetching access and disables actions while saving (#12, #23)", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("Carregando pessoas com acesso...");
    expect(componentSource).toContain("disabled={isSaving");
    expect(componentSource).toContain("isLoading ? (");
  });

  it("renders a safe, translated error message instead of a raw payload (#13, #14, #15)", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("getSafeApiErrorMessage");
    expect(componentSource).toContain('role="alert"');
    expect(componentSource).not.toContain("error.stack");
  });

  it("shows an explicit empty state when nobody has access yet", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("Ninguém tem acesso compartilhado a este");
  });

  it("hides grant/edit/revoke controls entirely when the viewer cannot manage sharing", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("{canManage ? (\n              <AddPersonSection");
    expect(componentSource).toContain("{canManage ? (\n          <button\n            type=\"button\"\n            onClick={() => setIsEditing");
  });

  it("never exposes raw permission values (VIEW/EDIT/...) as visible text, only permissionLabels", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("permissionLabels[permission]");
    expect(componentSource).not.toMatch(/>{2}\s*(VIEW|EDIT|VISIT|INSPECT|NEGOTIATE)\s*</);
  });

  it("stays within the viewport and scrolls internally instead of overflowing (responsividade)", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("max-h-[90vh]");
    expect(componentSource).toContain("overflow-y-auto");
  });

  it("supports keyboard close (Escape) and sets initial focus on open (acessibilidade)", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain('event.key === "Escape"');
    expect(componentSource).toContain("dialogRef.current?.focus()");
    expect(componentSource).toContain('aria-modal="true"');
  });

  it("associates every permission checkbox with a visible label via htmlFor/id", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("htmlFor={inputId}");
    expect(componentSource).toContain("id={inputId}");
  });

  it("gives the revoke-one-permission button an accessible name", async () => {
    const componentSource = await source("../components/app/resource-share-dialog.tsx");
    expect(componentSource).toContain("aria-label={`Remover permissão");
  });
});

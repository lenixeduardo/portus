import { getSetting, setSetting } from "./settings-repo";
import { getUser, getUserByUsername, listUsers } from "./users-repo";
import { listProducts } from "./products-repo";
import { createCentralProduct, listCentralProducts } from "./central-products-repo";
import { ensureCentralUserAccess } from "./central-users-repo";

const LEGACY_IMPORT_MARKER = "central_catalog_import_013";

/**
 * Importação idempotente por estação durante o upgrade.
 * Somente marca como concluída depois que TODOS os usuários e produtos
 * existentes no SQLite local foram enviados ao PostgreSQL.
 * Não modifica a base SQLite nem apaga seus registros.
 */
export async function importLegacyCatalogToCentral(): Promise<void> {
  if (getSetting(LEGACY_IMPORT_MARKER) === "done") return;

  const users = listUsers();
  for (const user of users) {
    const row = getUserByUsername(user.username);
    await ensureCentralUserAccess(user, {
      passwordHash: row?.password_hash,
      barcodeValue: row?.barcode_value
    });
  }

  const existing = await listCentralProducts();
  const knownNames = new Set(existing.map(p => p.name.trim().toLocaleLowerCase("pt-BR")));
  for (const product of listProducts()) {
    const name = product.name.trim();
    if (knownNames.has(name.toLocaleLowerCase("pt-BR"))) continue;
    const creator = getUser(product.createdBy) ?? users[0];
    if (!creator) {
      throw new Error("Não existe usuário local para importar o catálogo de produtos.");
    }
    await createCentralProduct(name, product.description, creator.username);
    knownNames.add(name.toLocaleLowerCase("pt-BR"));
  }

  setSetting(LEGACY_IMPORT_MARKER, "done");
}

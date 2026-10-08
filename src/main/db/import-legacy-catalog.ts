import type { Product } from "../../shared/types";
import { getSetting, setSetting } from "./settings-repo";
import { getUser, getUserByUsername, listUsers } from "./users-repo";
import { listProducts } from "./products-repo";
import { createCentralProduct, getCentralProduct, listCentralProducts, updateCentralProduct } from "./central-products-repo";
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

  const existing = await listCentralProducts(true);
  const knownProducts = new Map<string, Product>(existing.map(p => [p.name.trim().toLocaleLowerCase("pt-BR"), p] as [string, Product]));
  for (const product of listProducts()) {
    const name = product.name.trim();
    const key = name.toLocaleLowerCase("pt-BR");
    const central = knownProducts.get(key);
    const creator = getUser(product.createdBy) ?? users[0];
    if (!creator) {
      throw new Error("Não existe usuário local para importar o catálogo de produtos.");
    }
    if (central) {
      const centralValue = central.description?.trim() ?? "";
      const localValue = product.description?.trim() ?? "";
      if (centralValue && localValue && centralValue !== localValue) {
        throw new Error(
          "Conflito de catálogo entre estações: produto " + name +
          " possui identificadores diferentes. Resolva antes de concluir a migração."
        );
      }
      if (!centralValue && localValue && await getCentralProduct(central.id)) {
        await updateCentralProduct(central.id, name, localValue, creator.username);
      }
      continue;
    }
    const inserted = await createCentralProduct(name, product.description, creator.username);
    knownProducts.set(key, inserted);
  }

  setSetting(LEGACY_IMPORT_MARKER, "done");
}

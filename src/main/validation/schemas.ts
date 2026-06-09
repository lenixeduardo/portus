import { z } from "zod";
import type { EquipmentUpdateInput, UserCreateInput } from "../../shared/ipc";

// Parity values
export const PARITY_VALUES = ["none", "even", "odd"] as const;

// Delimiter values
export const DELIMITER_VALUES = ["crlf", "lf", "cr"] as const;

// Baud rates
export const ALLOWED_BAUD = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;

/**
 * Validação de login
 */
export const loginSchema = z.object({
  username: z.string().min(1, "Usuário obrigatório"),
  password: z.string().min(1, "Senha obrigatória")
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Validação para fechar lote
 */
export const closeBatchSchema = z.object({
  id: z.number().positive("ID do lote deve ser um número positivo")
});

export type CloseBatchInput = z.infer<typeof closeBatchSchema>;

/**
 * Validação para criar lote
 */
export const createBatchSchema = z.object({
  productId: z.number().positive("ID do produto deve ser um número positivo"),
  code: z.string().optional()
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

/**
 * Validação para listar lotes (busca por código)
 */
export const findBatchByCodeSchema = z.string().min(1, "Código do lote obrigatório");

/**
 * Validação para scan de código de barras
 */
export const barcodeSchema = z.object({
  barcodeValue: z.string().min(1, "Valor de código de barras obrigatório"),
  productName: z.string().optional()
});

/**
 * Validação para criar usuário
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, "Usuário deve ter ao menos 3 caracteres")
    .max(40, "Usuário muito longo (máx. 40)")
    .regex(/^[a-zA-Z0-9._-]+$/, "Usuário aceita apenas letras, números, '.', '_' e '-'"),
  password: z
    .string()
    .min(4, "Senha deve ter ao menos 4 caracteres")
    .max(100, "Senha muito longa"),
  role: z.enum(["admin", "operator"]).optional()
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Validação para mudar senha
 */
export const changePasswordSchema = z.object({
  id: z.number().positive("ID do usuário deve ser um número positivo"),
  password: z
    .string()
    .min(4, "Senha deve ter ao menos 4 caracteres")
    .max(100, "Senha muito longa")
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Validação para deletar usuário
 */
export const deleteUserSchema = z.object({
  id: z.number().positive("ID do usuário deve ser um número positivo")
});

export type DeleteUserInput = z.infer<typeof deleteUserSchema>;

/**
 * Validação para atualizar equipamento
 */
export const updateEquipmentSchema = z.object({
  id: z.number().positive("ID do equipamento deve ser um número positivo"),
  name: z.string().min(1, "Nome obrigatório").optional(),
  portPath: z.string().optional(),
  baudRate: z.number().refine(
    (val) => ALLOWED_BAUD.includes(val as any),
    "Taxa de baud inválida"
  ).optional(),
  dataBits: z.number().refine(
    (val) => [5, 6, 7, 8].includes(val),
    "Bits de dados inválido"
  ).optional(),
  stopBits: z.number().refine(
    (val) => [1, 2].includes(val),
    "Bits de parada inválido"
  ).optional(),
  parity: z.enum(PARITY_VALUES).optional(),
  enabled: z.boolean().optional(),
  parseRegex: z
    .string()
    .refine(
      (val) => {
        if (!val) return true; // regex vazia é ok
        try {
          new RegExp(val);
          return true;
        } catch {
          return false;
        }
      },
      "Regex de parsing inválida"
    )
    .optional(),
  lineDelimiter: z.enum(DELIMITER_VALUES).optional()
});

export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

/**
 * Validação para atualizar configuração
 */
export const updateSettingSchema = z.object({
  key: z.enum(["capture_timeout_seconds", "barcode_regex", "auto_export_folder"]),
  value: z.string().min(0)
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

/**
 * Validação para criar produto
 */
export const createProductSchema = z.object({
  name: z.string().min(1, "Nome do produto obrigatório"),
  description: z.string().optional()
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Validação para atualizar produto
 */
export const updateProductSchema = z.object({
  id: z.number().positive("ID do produto deve ser um número positivo"),
  name: z.string().min(1, "Nome do produto obrigatório").optional(),
  description: z.string().optional()
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Validação para deletar produto
 */
export const deleteProductSchema = z.object({
  id: z.number().positive("ID do produto deve ser um número positivo")
});

export type DeleteProductInput = z.infer<typeof deleteProductSchema>;

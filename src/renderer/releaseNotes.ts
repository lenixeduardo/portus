export interface ReleaseNote {
  version: string;
  items: string[];
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: APP_VERSION,
    items: [
      "Corrigido logout automático após finalizar uma leitura.",
      "Corrigido logout automático após finalizar um lote, inclusive para usuários admin.",
      "Corrigida impressão de código de barras pelo perfil operador.",
      "Adicionado botão para pular a primeira captura na tela de leitura.",
      "Adicionado registro de erros de leitura no banco para facilitar debug.",
      "Adicionado aviso de atualizações ao abrir uma nova versão."
    ]
  }
];

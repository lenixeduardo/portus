export interface ReleaseNote {
  version: string;
  items: string[];
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: APP_VERSION,
    items: [
      "Adicionada integração opcional com o PostgreSQL central para lotes, histórico e captura.",
      "Adicionado status de conexão do banco central no cabeçalho, atualizado a cada 15 segundos.",
      "O fechamento central agora depende das confirmações da Produção e do Laboratório.",
      "Adicionado bloqueio seguro quando a central está indisponível ou o equipamento não está mapeado.",
      "Atualizados o favicon e os ícones do aplicativo e do instalador.",
      "Corrigido logout automático após finalizar uma leitura.",
      "Corrigido logout automático após finalizar um lote, inclusive para usuários admin.",
      "Corrigida impressão de código de barras pelo perfil operador.",
      "Adicionado botão para pular a primeira captura na tela de leitura.",
      "Adicionado registro de erros de leitura no banco para facilitar debug.",
      "Adicionado aviso de atualizações ao abrir uma nova versão."
    ]
  }
];

export interface ReleaseNote {
  version: string;
  items: string[];
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: APP_VERSION,
    items: [
      "Adicionada a visão Laboratório com perfis separados de Captura e Fechamento.",
      "Os lotes centrais agora exibem separadamente as confirmações da Produção e do Laboratório.",
      "Sessões centrais de captura agora registram o usuário e o setor responsáveis.",
      "PostgreSQL central agora é o modo autoritativo para lotes, histórico e captura.",
      "O modo SQLite para lotes exige ativação explícita e fica restrito ao desenvolvimento.",
      "Leituras pendentes são aguardadas antes do encerramento da sessão central.",
      "O instalador do banco configura automaticamente a conexão do aplicativo no Windows.",
      "O logotipo pixelado oficial foi aplicado ao Login e à navegação.",
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

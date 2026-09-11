import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Evita uma janela branca caso uma tela do React falhe em tempo de execução. */
export class RendererErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void window.api?.log.error("renderer:component", error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="renderer-fallback" role="alert">
        <p className="renderer-fallback__eyebrow">PORTUS · FALHA DE INTERFACE</p>
        <h1>Não foi possível exibir esta etapa.</h1>
        <p>A operação foi interrompida com segurança. O detalhe técnico foi salvo no log do PORTUS.</p>
        <button onClick={() => window.location.reload()}>Voltar ao PORTUS</button>
      </main>
    );
  }
}

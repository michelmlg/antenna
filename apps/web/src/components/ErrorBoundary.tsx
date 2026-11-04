/** Erro de render numa tela não derruba o painel: mostra aviso e deixa tentar de novo. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, Empty } from "./ui";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[antenna] erro de render", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Empty
        icon={TriangleAlert}
        title="Algo quebrou nesta tela"
        action={
          <Button icon={RotateCw} onClick={() => this.setState({ error: null })}>
            Tentar de novo
          </Button>
        }
      >
        <span className="font-mono text-xs">{this.state.error.message}</span>
      </Empty>
    );
  }
}

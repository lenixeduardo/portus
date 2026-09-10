import portusWordmark from "../assets/Logotipo Pixelado PORTUS em Preto e Branco.png";

type LogoVariant = "sidebar" | "login";

export function PortusLogo({ variant }: { variant: LogoVariant }) {
  return (
    <div className={`portus-logo portus-logo--${variant}`} aria-label="PORTUS — Controle Industrial">
      <span className="portus-logo__wordmark" aria-hidden="true">
        <img src={portusWordmark} alt="" />
      </span>
      <small>CONTROLE INDUSTRIAL</small>
    </div>
  );
}

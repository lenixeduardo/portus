import React from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  dismissable?: boolean;
}

export function Modal({ title, onClose, children, footer, width = 480, dismissable = true }: Props) {
  return createPortal(
    <div className="modal-backdrop" onClick={dismissable ? onClose : undefined}>
      <div className="modal-card" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          {dismissable && <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

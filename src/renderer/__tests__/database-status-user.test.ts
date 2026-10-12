import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatabaseStatusBadge } from '../components/DatabaseStatusBadge';

describe('usuario no status do banco', () => {
  it('exibe o nome e login da sessao da aplicacao', () => {
    const html = renderToStaticMarkup(React.createElement(DatabaseStatusBadge, {
      status: 'connected', user: { username: 'master.edu', displayName: 'Eduardo' }
    }));
    expect(html).toContain('Conectado');
    expect(html).toContain('Eduardo (master.edu)');
  });
  it('usa o login quando nao existe nome e escapa o texto', () => {
    const html = renderToStaticMarkup(React.createElement(DatabaseStatusBadge, {
      status: 'disconnected', user: { username: '<script>teste</script>' }
    }));
    expect(html).toContain('Desconectado');
    expect(html).toContain('&lt;script&gt;teste&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

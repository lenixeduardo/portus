import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');
const SHOT_DIR = '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', NODE_ENV: 'production' },
  timeout: 30_000,
});
await new Promise(r => setTimeout(r, 6_000));

const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();
const delay = ms => new Promise(r => setTimeout(r, ms));

async function ss(name) {
  const f = path.join(SHOT_DIR, name + '.png');
  await page.screenshot({ path: f });
  return f;
}

async function wait(sel, timeout = 8000) {
  await page.waitForSelector(sel, { timeout });
}

async function loginApp(username, password) {
  await wait('input', 8000);
  const inputs = await page.$$('input');
  await inputs[0].click(); await inputs[0].fill(username);
  await inputs[1].click(); await inputs[1].fill(password);
  await page.keyboard.press('Enter');
  await delay(2000);
}

async function clickBtn(text) {
  return page.evaluate(t => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === t)
           ?? [...document.querySelectorAll('button')].find(b => b.textContent?.includes(t));
    if (!el) return 'NOT_FOUND';
    el.click(); return 'OK';
  }, text);
}

async function navTo(label) {
  await page.evaluate(l => {
    const el = [...document.querySelectorAll('.sidebar nav a, aside nav a, nav a')]
      .find(a => a.textContent?.includes(l));
    el?.click();
  }, label);
  await delay(800);
}

async function clickTab(label) {
  return page.evaluate(l => {
    const el = [...document.querySelectorAll('.tab, button')]
      .find(b => b.textContent?.trim() === l);
    if (!el) return 'NOT_FOUND';
    el.click(); return 'OK';
  }, label);
}

// ──────────────────────────────────────────────────────────────────
// TESTE 1: Código de barras com produto não cadastrado → erro
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 1: Barcode com produto desconhecido → erro');
console.log('══════════════════════════════════════════════════');

await loginApp('admin', 'admin');
await ss('T1-01-dashboard');
console.log('✓ Login como admin');

await clickBtn('Novo Lote por Código de Barras');
await delay(600);
await ss('T1-02-barcode-modal-open');

const bInputs = await page.$$('input');
await bInputs[0].click();
await bInputs[0].fill('PRODUTO-DESCONHECIDO-XYZ');
await delay(200);
await clickBtn('Confirmar');
await delay(1500);
await ss('T1-03-after-unknown-barcode');

const t1Check = await page.evaluate(() => {
  const text = document.body.innerText;
  const btns = [...document.querySelectorAll('button')].map(b => b.textContent?.trim());
  return {
    hasError: !!document.querySelector('.error'),
    errorText: document.querySelector('.error')?.textContent ?? null,
    hasCadastrarForm: text.includes('Cadastrar e Criar Lote') || text.includes('Nome do produto'),
    buttons: btns.filter(Boolean),
  };
});

console.log('\n  Resultado:');
console.log(`  → Mensagem de erro exibida: ${t1Check.hasError}`);
console.log(`  → Texto do erro: "${t1Check.errorText}"`);
console.log(`  → Formulário de cadastro apareceu: ${t1Check.hasCadastrarForm}`);

const t1Pass = t1Check.hasError && !t1Check.hasCadastrarForm;
console.log(t1Pass
  ? '\n  ✅ PASSOU: mostra erro, NÃO exibe formulário de cadastro'
  : '\n  ❌ FALHOU');

await clickBtn('Cancelar');
await delay(400);

// ──────────────────────────────────────────────────────────────────
// TESTE 2: Criar e excluir usuário sem erro
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 2: Criar e excluir usuário sem erro');
console.log('══════════════════════════════════════════════════');

await navTo('Configurações');
await clickTab('Usuários');
await delay(400);
await ss('T2-01-users-tab');

await clickBtn('+ Novo Usuário');
await delay(500);
const modalInputs = await page.$$('input');
await modalInputs[0].click(); await modalInputs[0].fill('teste_excluir');
await modalInputs[1].click(); await modalInputs[1].fill('senha123');
await delay(200);
await clickBtn('Criar');
await delay(1000);
await ss('T2-02-after-create');

const afterCreate = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr')];
  const row = rows.find(r => r.textContent?.includes('teste_excluir'));
  return { found: !!row, rowText: row?.innerText ?? null };
});
console.log(`\n  Criação → "teste_excluir" na tabela: ${afterCreate.found}`);
console.log(`  Linha: ${afterCreate.rowText}`);

// Delete
const deleteResult = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr')];
  const row = rows.find(r => r.textContent?.includes('teste_excluir'));
  if (!row) return 'ROW_NOT_FOUND';
  const delBtn = [...row.querySelectorAll('button')].find(b => b.textContent?.includes('Excluir'));
  if (!delBtn) return 'BTN_NOT_FOUND';
  const orig = window.confirm;
  window.confirm = () => true;
  delBtn.click();
  window.confirm = orig;
  return 'CLICKED';
});
console.log(`\n  Exclusão → clique: ${deleteResult}`);
await delay(1200);
await ss('T2-03-after-delete');

const afterDelete = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr')];
  return {
    stillInTable: !!rows.find(r => r.textContent?.includes('teste_excluir')),
    errorVisible: document.querySelector('.error')?.textContent ?? null,
  };
});
console.log(`  → Ainda na tabela: ${afterDelete.stillInTable}`);
console.log(`  → Erro visível: ${afterDelete.errorVisible ?? 'nenhum'}`);

const t2Pass = afterCreate.found && !afterDelete.stillInTable && !afterDelete.errorVisible;
console.log(t2Pass ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');

// ──────────────────────────────────────────────────────────────────
// TESTE 3: Fechar captura → retornar para tela de login
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 3: Fechar captura → retornar para login');
console.log('══════════════════════════════════════════════════');

let t3Pass = false;

// Step 1: Clear barcode_regex via API directly (bypasses React state issue)
const clearRegex = await page.evaluate(async () => {
  const res = await window.api.settings.set('barcode_regex', '');
  return res;
});
console.log(`  Regex limpa via API: ok=${clearRegex.ok}`);

// Step 2: Create product and batch
await navTo('Produtos');
await delay(400);
await clickBtn('+ Novo Produto');
await delay(400);
const pInputs = await page.$$('input');
await pInputs[0].click(); await pInputs[0].fill('Produto Teste Logout');
await delay(200);
await clickBtn('Salvar');
await delay(700);
console.log('✓ Produto criado');

await navTo('Lotes Ativos');
await delay(300);
await clickBtn('+ Novo Lote');
await delay(500);
await page.evaluate(() => {
  const sel = document.querySelector('select');
  if (sel && sel.options.length > 1) {
    sel.value = sel.options[sel.options.length - 1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await delay(300);
await clickBtn('Criar Lote');
await delay(800);
const batchCode = await page.evaluate(() =>
  document.querySelector('.batch-code')?.textContent?.replace('#','').trim() ?? null
);
console.log(`  Lote criado: ${batchCode}`);
await ss('T3-01-batch-created');

// Step 3: Open BarcodeModal with batch code (no regex → direct match)
if (batchCode) {
  await clickBtn('Novo Lote por Código de Barras');
  await delay(400);
  const bi = await page.$$('input');
  await bi[0].click(); await bi[0].fill(batchCode);
  await delay(200);
  await clickBtn('Confirmar');
  await delay(1500);
  await ss('T3-02-barcode-result');

  const hasIniciar = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Iniciar Leitura'))
  );
  console.log(`  "Iniciar Leitura" disponível: ${hasIniciar}`);

  if (hasIniciar) {
    // Step 4: Start capture
    await clickBtn('Iniciar Leitura');
    await delay(3000);
    await ss('T3-03-capture-active');

    const captureVisible = await page.evaluate(() =>
      document.body.innerText.includes('Captura em andamento')
    );
    console.log(`  Modal de captura visível: ${captureVisible}`);

    // Step 5: Cancel capture and click Fechar
    await clickBtn('Cancelar Captura');
    await delay(1500);
    await ss('T3-04-capture-ended');

    await clickBtn('Fechar');
    await delay(2500);
    await ss('T3-05-after-close');

    const t3Check = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        onLogin:     text.includes('IDENTIFICAÇÃO') || text.includes('USER_ID') || text.includes('Entrar'),
        onDashboard: text.includes('Lotes Ativos'),
      };
    });

    console.log(`\n  → Tela de login: ${t3Check.onLogin}`);
    console.log(`  → Dashboard: ${t3Check.onDashboard}`);
    t3Pass = t3Check.onLogin && !t3Check.onDashboard;
    console.log(t3Pass ? '\n  ✅ PASSOU: fechou captura e retornou ao login' : '\n  ❌ FALHOU');
  } else {
    await ss('T3-barcode-error');
    const errMsg = await page.evaluate(() => document.querySelector('.error')?.textContent ?? 'sem erro');
    console.log(`  ⚠️ Sem "Iniciar Leitura". Erro barcode: ${errMsg}`);
  }
} else {
  console.log('  ⚠️ Código do lote não obtido');
}

// ── Summary ──────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('RESUMO DOS TESTES');
console.log('══════════════════════════════════════════════════');
console.log(`T1 - Barcode desconhecido → erro:      ${t1Pass ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`T2 - Criar e excluir usuário:           ${t2Pass ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`T3 - Fechar captura → retorna ao login: ${t3Pass ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log('══════════════════════════════════════════════════');

await app.close();

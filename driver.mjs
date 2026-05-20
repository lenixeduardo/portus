import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(fileURLToPath(import.meta.url), '..');
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

// Fill using Playwright's native fill (handles React state properly)
async function fillField(sel, value) {
  await page.click(sel);
  await page.fill(sel, value);
}

async function loginApp(username, password) {
  await wait('input[type="text"], input:not([type="password"])', 8000);
  const inputs = await page.$$('input');
  await inputs[0].click();
  await inputs[0].fill(username);
  await inputs[1].click();
  await inputs[1].fill(password);
  await page.keyboard.press('Enter');
  await delay(2000);
}

// Click sidebar nav link by text
async function navTo(label) {
  await page.evaluate(l => {
    const links = [...document.querySelectorAll('.sidebar nav a, aside nav a, nav a')];
    const el = links.find(a => a.textContent?.includes(l));
    el?.click();
  }, label);
  await delay(800);
}

// Click any button by exact or partial text
async function clickBtn(text, exact = true) {
  return page.evaluate(([t, e]) => {
    const btns = [...document.querySelectorAll('button')];
    const el = e
      ? btns.find(b => b.textContent?.trim() === t)
      : btns.find(b => b.textContent?.includes(t));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'OK';
  }, [text, exact]);
}

// ──────────────────────────────────────────────────────────────────
// TEST 1 — Login admin + scan barcode sem clicar em botão de lote
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 1: Leitura de código de barras sem clicar no botão');
console.log('══════════════════════════════════════════════════');

await ss('T1-01-login');

await loginApp('admin', 'admin');
await ss('T1-02-dashboard');
console.log('✓ Login como admin');

// Blur focus — simulate "no button clicked"
await page.evaluate(() => document.activeElement?.blur());
await delay(300);

// Simulate HID barcode scanner: keystrokes < 50ms apart + Enter
const barcode = 'LOTE-TESTE-001';
console.log(`  Simulando scanner HID: "${barcode}"`);
for (const ch of barcode) {
  await page.keyboard.type(ch, { delay: 10 });
}
await page.keyboard.press('Enter');
await delay(2000);

await ss('T1-03-after-scan');

const t1Result = await page.evaluate(() => {
  const text = document.body.innerText;
  const buttons = [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(Boolean);
  return {
    hasBarcodeModal:  text.includes('Scanner de Código de Barras'),
    hasCaptureModal:  text.includes('Captura em andamento') || text.includes('Tempo restante'),
    hasIniciarLeitura: buttons.includes('Iniciar Leitura'),
    hasConfirmar:      buttons.includes('Confirmar'),
    buttons,
  };
});

console.log('\n  Resultado:');
console.log(`  → Modal "Scanner de Código de Barras" aberto: ${t1Result.hasBarcodeModal}`);
console.log(`  → Modal de captura auto-iniciado:             ${t1Result.hasCaptureModal}`);
console.log(`  → Botão "Iniciar Leitura" visível:            ${t1Result.hasIniciarLeitura}`);
console.log(`  → Botões na tela: [${t1Result.buttons.join(' | ')}]`);

const t1Pass = t1Result.hasBarcodeModal && !t1Result.hasCaptureModal;
console.log(t1Pass
  ? '\n  ✅ PASSOU: barcode abre modal de confirmação, captura NÃO iniciada automaticamente'
  : '\n  ❌ FALHOU');

// Close modal
await clickBtn('Cancelar');
await delay(500);

// ──────────────────────────────────────────────────────────────────
// TEST 2 — Criar usuário operador
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 2: Criar perfil de operador');
console.log('══════════════════════════════════════════════════');

await navTo('Configurações');
await ss('T2-01-settings');

// Click Usuários tab
const usersTabClick = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.tab, button')];
  const el = tabs.find(b => b.textContent?.trim() === 'Usuários');
  if (!el) return 'NOT_FOUND';
  el.click();
  return 'OK';
});
console.log(`  Clique aba Usuários: ${usersTabClick}`);
await delay(500);
await ss('T2-02-users-tab');

const r2 = await clickBtn('+ Novo Usuário');
console.log(`  Clique + Novo Usuário: ${r2}`);
await delay(600);
await ss('T2-03-create-modal');

// Fill using direct element handles
const modalInputs = await page.$$('input');
console.log(`  Modal inputs encontrados: ${modalInputs.length}`);

// username
await modalInputs[0].click();
await modalInputs[0].fill('operador');
await delay(200);

// password
await modalInputs[1].click();
await modalInputs[1].fill('admin');
await delay(200);

// Set role select to operator (should already be default)
const roleVal = await page.evaluate(() => {
  const sel = document.querySelector('select');
  return sel ? sel.value : null;
});
console.log(`  Valor do select de perfil: ${roleVal}`);

await ss('T2-04-filled');

// Get current input values for verification
const formValues = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')];
  return inputs.map(i => ({ type: i.type, value: i.value, placeholder: i.placeholder }));
});
console.log('  Valores dos inputs:', JSON.stringify(formValues));

await clickBtn('Criar');
await delay(1500);
await ss('T2-05-after-create');

const t2Check = await page.evaluate(() => {
  const text = document.body.innerText;
  const rows = [...document.querySelectorAll('tr')];
  const opRow = rows.find(r => r.textContent?.includes('operador'));
  return {
    hasOperador: text.includes('operador'),
    rowText: opRow?.innerText ?? null,
  };
});

console.log(`\n  → "operador" aparece na tabela: ${t2Check.hasOperador}`);
console.log(`  → Linha: ${t2Check.rowText}`);
const t2Pass = t2Check.hasOperador;
console.log(t2Pass ? '\n  ✅ PASSOU: usuário operador criado com sucesso' : '\n  ❌ FALHOU: usuário não criado');

// ──────────────────────────────────────────────────────────────────
// TEST 3 — Login como operador e validar permissões
// ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('TESTE 3: Validar permissões do perfil operador');
console.log('══════════════════════════════════════════════════');

// Logout admin
await clickBtn('Sair');
await delay(1000);
await ss('T3-01-logout');
console.log('✓ Logout admin');

await loginApp('operador', 'admin');
await ss('T3-02-operator-dashboard');
console.log('✓ Login como operador');

// ── 3a: Aba Usuários oculta em Configurações ──
await navTo('Configurações');
await ss('T3-03-operator-settings');

const t3aTabs = await page.evaluate(() =>
  [...document.querySelectorAll('.tab')].map(b => b.textContent?.trim())
);
const t3aHasUsers = t3aTabs.includes('Usuários');
console.log(`\n  Abas de Configurações visíveis para operador: [${t3aTabs.join(', ')}]`);
console.log(`  → Aba "Usuários" visível: ${t3aHasUsers}`);
const t3aPass = !t3aHasUsers;
console.log(t3aPass ? '  ✅ PASSOU: aba "Usuários" oculta' : '  ❌ FALHOU: aba visível');

// ── 3b: Botão Finalizar oculto no card de lote ──
await navTo('Lotes Ativos');
await delay(300);

// Create a batch to have a card
await clickBtn('+ Novo Lote');
await delay(600);
await ss('T3-04-new-batch');

// Select first product option
await page.evaluate(() => {
  const sel = document.querySelector('select');
  if (sel && sel.options.length > 1) {
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await delay(300);
await clickBtn('Criar Lote');
await delay(1200);
await ss('T3-05-batch-card');

const t3bCheck = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.batch-card')];
  return cards.map(c => ({
    code: c.querySelector('.batch-code')?.textContent,
    buttons: [...c.querySelectorAll('button')].map(b => b.textContent?.trim()),
  }));
});
console.log(`\n  Cards de lote: ${JSON.stringify(t3bCheck)}`);

const t3bHasFinalizar = t3bCheck.some(c => c.buttons.includes('Finalizar'));
console.log(`  → Botão "Finalizar" nos cards: ${t3bHasFinalizar}`);
const t3bPass = !t3bHasFinalizar;
console.log(t3bPass ? '  ✅ PASSOU: botão "Finalizar" oculto para operador' : '  ❌ FALHOU: botão visível');

// ── 3c: Operador ainda pode criar lotes e escanear ──
const t3cBtns = await page.evaluate(() =>
  [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(Boolean)
);
const t3cCanCreate = t3cBtns.some(b => b.includes('Novo Lote') || b.includes('Código de Barras'));
console.log(`\n  Botões disponíveis para operador: [${t3cBtns.join(' | ')}]`);
console.log(`  → Pode criar/escanear: ${t3cCanCreate} ✅`);

// ── Summary ──
console.log('\n══════════════════════════════════════════════════');
console.log('RESUMO DOS TESTES');
console.log('══════════════════════════════════════════════════');
console.log(`T1 - Barcode sem auto-captura:          ${t1Pass  ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`T2 - Criação de usuário operador:       ${t2Pass  ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`T3a - Aba "Usuários" oculta p/ operator:${t3aPass ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`T3b - Botão "Finalizar" oculto:         ${t3bPass ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log('══════════════════════════════════════════════════');

await app.close();

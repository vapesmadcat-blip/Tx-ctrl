/* TXCTRL - Painel particular de controle Driver Flux
   Este app NÃO cadastra ponto, prefixo ou taxista.
   Ele lê pontos existentes no Firebase, gera contra-senhas e grava comandos administrativos. */

const firebaseConfig = {
  apiKey: "AIzaSyAY217DxZeZZMlg0ZpHYFvXoALrkd5zcPM",
  authDomain: "driverflux.firebaseapp.com",
  databaseURL: "https://driverflux-default-rtdb.firebaseio.com",
  projectId: "driverflux",
  storageBucket: "driverflux.firebasestorage.app",
  messagingSenderId: "855577761510",
  appId: "1:855577761510:web:7e4c0911921a5c18c34d27"
};

let db = null;
let pontosCache = [];
let pontoSelecionado = null;
let prefixosCache = [];

function log(msg) {
  const el = document.getElementById('logSaida');
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  el.textContent = linha + "\n" + (el.textContent || '');
}

function iniciarFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    document.getElementById('firebaseStatus').textContent = 'Firebase: conectado';
    log('Firebase inicializado.');
  } catch (e) {
    document.getElementById('firebaseStatus').textContent = 'Firebase: erro';
    log('Erro Firebase: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', iniciarFirebase);

function calcularSenhas() {
  const v = document.getElementById('txtDesafio').value.trim();
  const elFull = document.getElementById('senhaCompleta');
  const elDemo = document.getElementById('senhaDemo');
  if (!v || isNaN(v)) { elFull.textContent = '---'; elDemo.textContent = '---'; return; }
  const n = parseInt(v, 10);
  elFull.textContent = (n * 13) + 6182;
  elDemo.textContent = (n * 11) + 3947;
}

async function copiarTexto(id) {
  const txt = document.getElementById(id).textContent.trim();
  if (!txt || txt === '---') return alert('Nada para copiar.');
  try {
    await navigator.clipboard.writeText(txt);
    log('Copiado: ' + txt);
  } catch (e) {
    prompt('Copie manualmente:', txt);
  }
}

function normalizarPonto(id, dados, origem) {
  dados = dados || {};
  const nome = dados.nome || dados.nomePonto || dados.pontoNome || dados.descricao || dados.label || id;
  const numero = dados.numero || dados.numeroPonto || dados.seq || dados.sequencial || '';
  const status = dados.status || dados.licencaStatus || dados.ativo || 'sem status';
  const master = dados.master?.usuario || dados.masterUsuario || dados.master || dados.usuarioMaster || 'master não identificado';
  return { id, nome, numero, status, master, origem, dados };
}

async function carregarPontosFirebase() {
  if (!db) iniciarFirebase();
  pontosCache = [];
  log('Carregando pontos existentes no Firebase...');

  const caminhos = ['pontos', 'pontosDriverFlux', 'licencas', 'clientes_pontos'];
  for (const caminho of caminhos) {
    try {
      const snap = await db.ref(caminho).once('value');
      const val = snap.val();
      if (val && typeof val === 'object') {
        Object.keys(val).forEach(id => {
          const item = normalizarPonto(id, val[id], caminho);
          if (!pontosCache.find(p => p.id === item.id && p.origem === item.origem)) pontosCache.push(item);
        });
      }
    } catch (e) {
      log(`Falha lendo ${caminho}: ${e.message}`);
    }
  }

  // Busca de compatibilidade: se o Driver Flux ainda grava dados antigos soltos por turno/usuário,
  // não inventa ponto; só informa que não encontrou estrutura de pontos.
  renderizarPontos();
  log(`${pontosCache.length} ponto(s)/licença(s) carregado(s).`);
}

function renderizarPontos() {
  const lista = document.getElementById('listaPontos');
  const filtro = (document.getElementById('filtroPonto').value || '').toLowerCase().trim();
  const filtrados = pontosCache.filter(p => (`${p.id} ${p.nome} ${p.numero} ${p.master} ${p.status}`).toLowerCase().includes(filtro));
  if (!filtrados.length) {
    lista.innerHTML = '<div class="item"><small>Nenhum ponto encontrado. Use “Informar ID” se o ponto ainda não estiver na lista.</small></div>';
    return;
  }
  lista.innerHTML = filtrados.map((p, idx) => `
    <div class="item" onclick="selecionarPonto('${escapeHtml(p.origem)}','${escapeHtml(p.id)}')">
      <b>${escapeHtml(p.numero ? 'Ponto ' + p.numero + ' - ' + p.nome : p.nome)}</b>
      <small>ID: ${escapeHtml(p.id)} • Origem: ${escapeHtml(p.origem)} • Master: ${escapeHtml(String(p.master))} • Status: ${escapeHtml(String(p.status))}</small>
    </div>
  `).join('');
}

function selecionarPonto(origem, id) {
  pontoSelecionado = pontosCache.find(p => p.origem === origem && p.id === id) || { id, origem, nome: id, dados: {} };
  document.getElementById('cardPontoSelecionado').style.display = 'block';
  document.getElementById('infoPontoSelecionado').innerHTML = `
    <span class="pill">ID: ${escapeHtml(pontoSelecionado.id)}</span>
    <span class="pill">Origem: ${escapeHtml(pontoSelecionado.origem)}</span>
    <span class="pill">Nome: ${escapeHtml(pontoSelecionado.nome)}</span>
    <span class="pill">Master: ${escapeHtml(String(pontoSelecionado.master || '---'))}</span>
  `;
  log('Ponto selecionado: ' + pontoSelecionado.id);
  carregarPrefixosDoPonto();
  lerResumoPonto();
}

function abrirEntradaManualPonto() {
  const id = prompt('Digite o ID/código exato do ponto no Firebase:');
  if (!id) return;
  const origem = prompt('Caminho do Firebase onde está o ponto:', 'pontos') || 'pontos';
  const existente = pontosCache.find(p => p.id === id && p.origem === origem);
  if (!existente) pontosCache.push(normalizarPonto(id, { nome: id }, origem));
  renderizarPontos();
  selecionarPonto(origem, id);
}

async function carregarPrefixosDoPonto() {
  const sel = document.getElementById('selectPrefixo');
  prefixosCache = [];
  sel.innerHTML = '<option value="">Todos os prefixos</option>';
  if (!pontoSelecionado || !db) return;

  const bases = [
    `${pontoSelecionado.origem}/${pontoSelecionado.id}/prefixos`,
    `${pontoSelecionado.origem}/${pontoSelecionado.id}/veiculos`,
    `${pontoSelecionado.origem}/${pontoSelecionado.id}/carros`
  ];

  for (const path of bases) {
    try {
      const snap = await db.ref(path).once('value');
      const val = snap.val();
      if (val && typeof val === 'object') {
        Object.keys(val).forEach(id => {
          const d = val[id] || {};
          const prefixo = d.prefixo || d.nome || d.placa || id;
          if (!prefixosCache.find(x => x.id === id)) prefixosCache.push({ id, prefixo, dados: d, path });
        });
      }
    } catch(e) { log('Falha prefixos: ' + e.message); }
  }

  prefixosCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.prefixo} (${p.id})`;
    sel.appendChild(opt);
  });
  log(`${prefixosCache.length} prefixo(s) encontrado(s) no ponto selecionado.`);
}

async function enviarComando(tipo) {
  if (!pontoSelecionado) return alert('Selecione um ponto primeiro.');
  if (!db) iniciarFirebase();

  const prefixo = document.getElementById('selectPrefixo').value || null;
  const obs = document.getElementById('obsComando').value.trim();
  const alvoTexto = prefixo ? `prefixo ${prefixo}` : `ponto ${pontoSelecionado.id}`;

  const mensagens = {
    resetar_licenca: 'Resetar licença deste alvo? O app deverá pedir contra-senha novamente.',
    limpar_dados_ponto: 'Limpar dados operacionais deste ponto? Deve manter Master/licença/configuração.',
    bloquear: 'Bloquear este alvo?',
    reativar: 'Reativar este alvo?'
  };
  if (!confirm(`${mensagens[tipo] || 'Enviar comando?'}\n\nAlvo: ${alvoTexto}`)) return;

  const comando = {
    tipo,
    pontoId: pontoSelecionado.id,
    pontoOrigem: pontoSelecionado.origem,
    prefixoId: prefixo,
    observacao: obs,
    criadoEm: new Date().toISOString(),
    criadoPor: 'Tx-ctrl João',
    status: 'pendente'
  };

  try {
    const ref = db.ref(`comandos_admin/${pontoSelecionado.id}`).push();
    await ref.set(comando);

    // Espelho simples dentro do próprio ponto para facilitar o Driver Flux ler.
    await db.ref(`${pontoSelecionado.origem}/${pontoSelecionado.id}/controleRemoto/ultimoComando`).set({ ...comando, comandoId: ref.key });

    log(`Comando enviado: ${tipo} para ${alvoTexto}. ID: ${ref.key}`);
    alert('Comando administrativo enviado ao Firebase.');
  } catch (e) {
    log('Erro enviando comando: ' + e.message);
    alert('Erro ao enviar comando: ' + e.message);
  }
}

async function lerResumoPonto() {
  const box = document.getElementById('resumoPonto');
  if (!pontoSelecionado || !db) { box.textContent = 'Selecione um ponto para ver resumo.'; return; }
  box.textContent = 'Lendo Firebase...';
  try {
    const base = `${pontoSelecionado.origem}/${pontoSelecionado.id}`;
    const snap = await db.ref(base).once('value');
    const d = snap.val() || {};
    const count = (obj) => obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
    const resumo = {
      ponto: pontoSelecionado.nome,
      id: pontoSelecionado.id,
      status: d.status || d.licencaStatus || '---',
      prefixos: count(d.prefixos || d.veiculos || d.carros),
      taxistas: count(d.taxistas || d.motoristas || d.usuarios),
      corridas: count(d.corridas || d.registros),
      despesas: count(d.despesas || d.despesasTurno),
      pagamentos: count(d.pagamentos)
    };
    box.innerHTML = Object.entries(resumo).map(([k,v]) => `<span class="pill">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join('');
    log('Resumo lido do ponto ' + pontoSelecionado.id);
  } catch(e) {
    box.textContent = 'Erro ao ler resumo.';
    log('Erro resumo: ' + e.message);
  }
}

function exportarControleLocal() {
  const payload = {
    app: 'TXCTRL',
    exportadoEm: new Date().toISOString(),
    pontoSelecionado,
    pontosCache,
    prefixosCache
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TXCTRL_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  log('Controle local exportado em JSON.');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

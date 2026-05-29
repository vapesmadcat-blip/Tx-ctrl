/**
 * APP.JS - Lógica de Fluxo de Caixa Integrada com Amortizações e Créditos
 */

let registros = [];
let pagamentos = []; // Guarda histórico de amortizações por cliente
let contadorId = 1;
let coordenadaAtual = null;
let filtroTexto = "";

/**
 * Salva toda a estrutura do app de forma segura no dispositivo
 */
function salvarNoStorage() {
    localStorage.setItem('driverflux_registros', JSON.stringify(registros));
    localStorage.setItem('driverflux_pagamentos', JSON.stringify(pagamentos));
    localStorage.setItem('driverflux_contadorId', contadorId.toString());
}

/**
 * Carrega registros e histórico de amortizações
 */
function carregarDoStorage() {
    const salvosReg = localStorage.getItem('driverflux_registros');
    const salvosPag = localStorage.getItem('driverflux_pagamentos');
    const ultimoId = localStorage.getItem('driverflux_contadorId');
    
    if (salvosReg) registros = JSON.parse(salvosReg);
    if (salvosPag) pagamentos = JSON.parse(salvosPag);
    if (ultimoId) {
        contadorId = parseInt(ultimoId);
    } else if (registros.length > 0) {
        contadorId = Math.max(...registros.map(r => r.id)) + 1;
    }
}

/**
 * Popula todas as tags Datalist de busca por clientes
 */
function atualizarListaSugestoes() {
    const listas = ['listaClientes', 'listaClientesConsulta'];
    const unicos = [...new Set(registros.map(r => r.cliente ? r.cliente.trim() : '').filter(n => n.length > 0))];
    unicos.sort();

    listas.forEach(idLista => {
        const el = document.getElementById(idLista);
        if (el) {
            el.innerHTML = '';
            unicos.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                el.appendChild(opt);
            });
        }
    });
}

function formatarMoeda(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function abrirModalInsercao() {
    document.getElementById('modalTitle').innerText = "Incluir Registro";
    document.getElementById('editId').value = "";
    document.getElementById('inputCliente').value = "";
    document.getElementById('inputEmprestimo').value = "";
    document.getElementById('inputCorrida').value = "";
    
    atualizarListaSugestoes();
    const gpsDisplay = document.getElementById('gpsStatus');
    gpsDisplay.innerText = "🔍 Localizando satélites...";
    gpsDisplay.style.color = '#ef4444';
    document.getElementById('formModal').style.display = 'flex';

    GeoLocation.capturarCoordenadas(
        function(lat, lng, accuracy) {
            coordenadaAtual = { latitude: lat, longitude: lng, accuracy: accuracy };
            gpsDisplay.innerText = `✅ Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
            gpsDisplay.style.color = '#10b981';
        },
        function(erro) {
            gpsDisplay.innerText = `⚠️ ${erro}`;
            gpsDisplay.style.color = '#f59e0b';
        }
    );
}

function abrirModalEdicao(id) {
    const reg = registros.find(r => r.id === id);
    if (!reg) return;

    document.getElementById('modalTitle').innerText = `Alterar Registro #${id}`;
    document.getElementById('editId').value = id;
    document.getElementById('inputCliente').value = reg.cliente || "";
    document.getElementById('inputEmprestimo').value = reg.emprestado;
    document.getElementById('inputCorrida').value = reg.corrida;
    
    atualizarListaSugestoes();
    const gpsDisplay = document.getElementById('gpsStatus');
    
    if (reg.gps) {
        coordenadaAtual = reg.gps;
        gpsDisplay.innerText = `📍 Lat: ${reg.gps.latitude.toFixed(5)}, Lng: ${reg.gps.longitude.toFixed(5)}`;
        gpsDisplay.style.color = '#4f46e5';
    } else {
        gpsDisplay.innerText = '⚠️ Sem localização guardada';
        gpsDisplay.style.color = '#718096';
    }

    document.getElementById('formModal').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('formModal').style.display = 'none';
    coordenadaAtual = null;
    GeoLocation.limparCoordenadas();
}

function salvarDados() {
    const idEdit = document.getElementById('editId').value;
    const nomeCliente = document.getElementById('inputCliente').value.trim();
    const vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;

    if (!nomeCliente) return alert('⚠️ Digite o nome do cliente.');
    if (vEmprestimo <= 0 && vCorrida <= 0) return alert('⚠️ Adicione um valor válido.');

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    if (idEdit) {
        const reg = registros.find(r => r.id === parseInt(idEdit));
        if (reg) {
            reg.cliente = nomeCliente;
            reg.emprestado = vEmprestimo;
            reg.corrida = vCorrida;
            reg.dataHora = dataHoraStr;
            if (coordenadaAtual) reg.gps = coordenadaAtual;
        }
    } else {
        registros.push({
            id: contadorId++,
            cliente: nomeCliente,
            emprestado: vEmprestimo,
            corrida: vCorrida,
            dataHora: dataHoraStr,
            gps: coordenadaAtual
        });
    }

    salvarNoStorage();
    fecharModal();
    renderizarTabela();
    atualizarListaSugestoes();
    limparConsulta();
    document.getElementById('cardTotais').style.display = 'none';
    document.getElementById('cardRelatorio').style.display = 'none';
}

/**
 * Exibe/Esconde painel de Consulta por cliente e Amortização
 */
function alternarBarraConsulta() {
    const container = document.getElementById('containerPesquisa');
    if (container.style.display === 'block') {
        container.style.display = 'none';
        limparConsulta();
    } else {
        container.style.display = 'block';
        atualizarListaSugestoes();
        document.getElementById('inputPesquisa').focus();
    }
}

function limparConsulta() {
    document.getElementById('inputPesquisa').value = "";
    document.getElementById('fichaCliente').style.display = 'none';
    filtroTexto = "";
    renderizarTabela();
}

/**
 * Processa a ficha financeira quando digita ou escolhe um cliente na lista
 */
function processarConsultaCliente() {
    const nomeBusca = document.getElementById('inputPesquisa').value.trim();
    filtroTexto = nomeBusca.toLowerCase();
    renderizarTabela(); // Filtra a tabela principal em tempo real

    if (!nomeBusca) {
        document.getElementById('fichaCliente').style.display = 'none';
        return;
    }

    // Calcula os débitos acumulados do cliente (+ juros de 20% sobre empréstimos)
    let totalDevido = 0;
    registros.forEach(r => {
        if (r.cliente && r.cliente.trim().toLowerCase() === nomeBusca.toLowerCase()) {
            totalDevido += (r.emprestado * 1.20) + r.corrida;
        }
    });

    // Calcula tudo o que esse cliente já pagou até hoje
    let totalPago = 0;
    pagamentos.forEach(p => {
        if (p.cliente.toLowerCase() === nomeBusca.toLowerCase()) {
            totalPago += p.valor;
        }
    });

    // Calcula o saldo líquido final (Abate ou gera Crédito)
    let saldoFinal = totalDevido - totalPago;

    document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nomeBusca}`;
    document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(totalDevido);
    document.getElementById('ledgerTotalPago').innerText = formatarMoeda(totalPago);
    
    const labelSaldo = document.getElementById('ledgerSaldoFinal');
    const linhaSaldo = document.getElementById('ledgerLinhaSaldo');
    
    if (saldoFinal > 0) {
        labelSaldo.innerText = `${formatarMoeda(saldoFinal)} (Em aberto)`;
        labelSaldo.className = "danger-text";
    } else if (saldoFinal < 0) {
        labelSaldo.innerText = `${formatarMoeda(Math.abs(saldoFinal))} (Crédito)`;
        labelSaldo.className = "success-text";
    } else {
        labelSaldo.innerText = "R$ 0,00 (Quitado)";
        labelSaldo.className = "success-text";
    }

    document.getElementById('fichaCliente').style.display = 'block';
}

/**
 * Executa a inserção do pagamento, realizando o abatimento ou acumulando crédito
 */
function registrarPagamento() {
    const nomeCliente = document.getElementById('inputPesquisa').value.trim();
    const valorEntrega = parseFloat(document.getElementById('inputValorPagamento').value) || 0;

    if (!nomeCliente) return alert("⚠️ Selecione um cliente válido primeiro.");
    if (valorEntrega <= 0) return alert("⚠️ Informe um valor de pagamento maior que zero.");

    // Adiciona ao livro de caixa de pagamentos
    pagamentos.push({
        cliente: nomeCliente,
        valor: valorEntrega,
        data: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
    });

    salvarNoStorage();
    document.getElementById('inputValorPagamento').value = "";
    alert(`✅ Pagamento de ${formatarMoeda(valorEntrega)} registrado com sucesso para ${nomeCliente}!`);
    processarConsultaCliente(); // Recalcula a ficha na tela
}

function renderizarTabela() {
    const tbody = document.querySelector('#tabelaDados tbody');
    tbody.innerHTML = '';

    const filtrados = registros.filter(r => (r.cliente || '').toLowerCase().includes(filtroTexto));

    filtrados.forEach(reg => {
        const tr = document.createElement('tr');
        const gpsIcone = reg.gps ? '📍' : '❌';
        tr.innerHTML = `
            <td class="row-id">#${reg.id}</td>
            <td class="row-cliente">${reg.cliente || 'Sem Nome'}</td>
            <td>${formatarMoeda(reg.emprestado)}</td>
            <td>${formatarMoeda(reg.corrida)}</td>
            <td>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span style="cursor:help;" title="${reg.gps ? `Lat: ${reg.gps.latitude.toFixed(6)}, Lng: ${reg.gps.longitude.toFixed(6)}` : 'Sem GPS'}">${gpsIcone}</span>
                    <button class="btn-alterar" onclick="abrirModalEdicao(${reg.id})">Alterar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function calcularTotais() {
    let tBruto = 0, tCorridas = 0;
    registros.forEach(r => { tBruto += r.emprestado; tCorridas += r.corrida; });
    let juros = tBruto * 0.20;

    document.getElementById('totBruto').innerText = formatarMoeda(tBruto);
    document.getElementById('totAcrescimo').innerText = `+ ${formatarMoeda(juros)}`;
    document.getElementById('totCorridas').innerText = formatarMoeda(tCorridas);
    document.getElementById('totGeral').innerText = formatarMoeda(tBruto + juros + tCorridas);
    document.getElementById('cardTotais').style.display = 'block';
}

function gerarRelatorio() {
    if (registros.length === 0) return alert("⚠️ Sem dados disponíveis.");

    let tBruto = 0, tCorridas = 0;
    let txt = `🧾 DRIVERFLUX - RELATÓRIO COM HISTÓRICO DE QUITAÇÃO\n`;
    txt += `Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n`;
    txt += `=========================================\n\n`;

    txt += `--- LANÇAMENTOS DO HISTÓRICO ---\n`;
    registros.forEach(r => {
        tBruto += r.emprestado; tCorridas += r.corrida;
        txt += `[${r.dataHora}] Reg #${r.id} - 👤 ${r.cliente || 'N/I'}\n`;
        txt += `  -> Empréstimo: ${formatarMoeda(r.emprestado)} | Corrida: ${formatarMoeda(r.corrida)}\n`;
        if(r.gps) txt += `  📍 GPS: Lat ${r.gps.latitude.toFixed(6)}, Lng ${r.gps.longitude.toFixed(6)}\n`;
        txt += `-----------------------------------------\n`;
    });

    if (pagamentos.length > 0) {
        txt += `\n--- AMORTIZAÇÕES / PAGAMENTOS RECEBIDOS ---\n`;
        pagamentos.forEach(p => {
            txt += `• [${p.data}] 👤 ${p.cliente} entregou ${formatarMoeda(p.valor)}\n`;
        });
        txt += `-----------------------------------------\n`;
    }

    let juros = tBruto * 0.20;
    txt += `\n=========================================\n`;
    txt += `Subtotal Empréstimos:    ${formatarMoeda(tBruto)}\n`;
    txt += `Taxa Adicional (+20%):   ${formatarMoeda(juros)}\n`;
    txt += `Subtotal Corridas:       ${formatarMoeda(tCorridas)}\n`;
    txt += `-----------------------------------------\n`;
    txt += `VALOR TOTAL HISTÓRICO:   ${formatarMoeda(tBruto + juros + tCorridas)}\n`;
    txt += `=========================================`;

    document.getElementById('reportOutput').innerText = txt;
    document.getElementById('reportOutput').style.display = 'block';
    document.getElementById('cardRelatorio').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof GeoLocation !== 'undefined') GeoLocation.init();
    carregarDoStorage();
    renderizarTabela();
});

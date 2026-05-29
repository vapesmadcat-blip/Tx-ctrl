/**
 * APP.JS - Lógica Principal do DriverFlux com Integração de GPS e LocalStorage
 */

let registros = [];
let contadorId = 1;
let coordenadaAtual = null;

/**
 * Salva a lista de registros atualizada e o estado do ID no LocalStorage
 */
function salvarNoStorage() {
    localStorage.setItem('driverflux_registros', JSON.stringify(registros));
    localStorage.setItem('driverflux_contadorId', contadorId.toString());
}

/**
 * Carrega os dados salvos anteriormente do LocalStorage
 */
function carregarDoStorage() {
    const salvos = localStorage.getItem('driverflux_registros');
    const ultimoId = localStorage.getItem('driverflux_contadorId');
    
    if (salvos) {
        registros = JSON.parse(salvos);
    }
    if (ultimoId) {
        contadorId = parseInt(ultimoId);
    } else if (registros.length > 0) {
        // Fallback caso o contador não tenha sido salvo por algum motivo
        contadorId = Math.max(...registros.map(r => r.id)) + 1;
    }
}

/**
 * Atualiza o datalist com os nomes únicos já cadastrados no histórico
 */
function atualizarListaSugestoes() {
    const datalist = document.getElementById('listaClientes');
    datalist.innerHTML = '';
    
    // Filtra nomes válidos e remove duplicados
    const clientesUnicos = [...new Set(registros.map(r => r.cliente ? r.cliente.trim() : '').filter(nome => nome.length > 0))];
    
    // Organiza por ordem alfabética e insere no datalist
    clientesUnicos.sort().forEach(cliente => {
        const option = document.createElement('option');
        option.value = cliente;
        datalist.appendChild(option);
    });
}

/**
 * Formata valores monetários para BRL
 */
function formatarMoeda(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Abre modal para novo registro e captura GPS automaticamente usando o modulo nativo
 */
function abrirModalInsercao() {
    document.getElementById('modalTitle').innerText = "Novo Lançamento";
    document.getElementById('editId').value = "";
    document.getElementById('inputCliente').value = "";
    document.getElementById('inputEmprestimo').value = "";
    document.getElementById('inputCorrida').value = "";
    
    // Atualiza a listagem de clientes salvos para autocompletar
    atualizarListaSugestoes();
    
    const gpsDisplay = document.getElementById('gpsStatus');
    gpsDisplay.innerText = "🔴 Buscando sinal de satélite...";
    gpsDisplay.style.color = '#ef4444';
    document.getElementById('formModal').style.display = 'flex';

    // Captura coordenadas automaticamente chamando o geolocation.js
    GeoLocation.capturarCoordenadas(
        function(lat, lng, accuracy) {
            coordenadaAtual = { latitude: lat, longitude: lng, accuracy: accuracy };
            gpsDisplay.innerText = `✅ ${GeoLocation.formatarCoordenadas()}`;
            gpsDisplay.style.color = '#10b981';
        },
        function(erro) {
            gpsDisplay.innerText = `⚠️ ${erro}`;
            gpsDisplay.style.color = '#f59e0b';
        }
    );
}

/**
 * Abre modal para editar registro existente
 */
function abrirModalEdicao(id) {
    const reg = registros.find(r => r.id === id);
    if (!reg) return;

    document.getElementById('modalTitle').innerText = `Editar Registro #${id}`;
    document.getElementById('editId').value = id;
    document.getElementById('inputCliente').value = reg.cliente || "";
    document.getElementById('inputEmprestimo').value = reg.emprestado;
    document.getElementById('inputCorrida').value = reg.corrida;
    
    atualizarListaSugestoes();
    
    const gpsDisplay = document.getElementById('gpsStatus');
    
    // Mostra GPS armazenado originalmente no registro selecionado
    if (reg.gps) {
        // Simula a estrutura interna temporariamente para o formatarCoordenadas ler corretamente
        GeoLocation.coordenadas = reg.gps;
        gpsDisplay.innerText = `📍 ${GeoLocation.formatarCoordenadas()}`;
        gpsDisplay.style.color = '#4f46e5';
    } else {
        gpsDisplay.innerText = '⚠️ Sem localização registrada para este item';
        gpsDisplay.style.color = '#718096';
    }

    document.getElementById('formModal').style.display = 'flex';
}

/**
 * Fecha o modal de formulário e limpa estados temporários
 */
function fecharModal() {
    document.getElementById('formModal').style.display = 'none';
    coordenadaAtual = null;
    GeoLocation.limparCoordenadas();
}

/**
 * Salva dados do formulário com coordenadas GPS e persiste no Storage local
 */
function salvarDados() {
    const idEdit = document.getElementById('editId').value;
    const nomeCliente = document.getElementById('inputCliente').value.trim();
    const vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;

    // Validações obrigatórias
    if (!nomeCliente) {
        alert('⚠️ Por favor, informe o nome do cliente.');
        return;
    }
    if (vEmprestimo <= 0 && vCorrida <= 0) {
        alert('⚠️ Por favor, insira pelo menos um valor válido de Empréstimo ou Corrida.');
        return;
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + 
                        agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    if (idEdit) {
        // Edita registro existente
        const reg = registros.find(r => r.id === parseInt(idEdit));
        if (reg) {
            reg.cliente = nomeCliente;
            reg.emprestado = vEmprestimo;
            reg.corrida = vCorrida;
            reg.dataHora = dataHoraStr;
            if (coordenadaAtual) {
                reg.gps = coordenadaAtual;
            }
        }
    } else {
        // Cria novo registro com GPS e Cliente incremental
        registros.push({
            id: contadorId++,
            cliente: nomeCliente,
            emprestado: vEmprestimo,
            corrida: vCorrida,
            dataHora: dataHoraStr,
            gps: coordenadaAtual
        });
    }

    // Persiste imediatamente no dispositivo físico
    salvarNoStorage();
    
    fecharModal();
    renderizarTabela();
    resetarPaineis();
}

/**
 * Renderiza os dados em tela
 */
function renderizarTabela() {
    const tbody = document.querySelector('#tabelaDados tbody');
    tbody.innerHTML = '';

    registros.forEach(reg => {
        const tr = document.createElement('tr');
        const gpsIndicador = reg.gps ? '📍' : '❌';
        tr.innerHTML = `
            <td class="row-id">#${reg.id}</td>
            <td class="row-cliente">${reg.cliente || 'Sem Nome'}</td>
            <td>${formatarMoeda(reg.emprestado)}</td>
            <td>${formatarMoeda(reg.corrida)}</td>
            <td>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="cursor:help;" title="${reg.gps ? `Lat: ${reg.gps.latitude.toFixed(6)}, Lng: ${reg.gps.longitude.toFixed(6)}` : 'Sem GPS'}">${gpsIndicador}</span>
                    <button class="btn-warning" onclick="abrirModalEdicao(${reg.id})">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function resetarPaineis() {
    document.getElementById('cardTotais').style.display = 'none';
    document.getElementById('cardRelatorio').style.display = 'none';
}

/**
 * Processa a matemática financeira da tela de totais
 */
function calcularTotais() {
    let tBruto = 0, tCorridas = 0;
    registros.forEach(r => { 
        tBruto += r.emprestado; 
        tCorridas += r.corrida; 
    });

    let juros = tBruto * 0.20;
    let tGeral = tBruto + juros + tCorridas;

    document.getElementById('totBruto').innerText = formatarMoeda(tBruto);
    document.getElementById('totAcrescimo').innerText = `+ ${formatarMoeda(juros)}`;
    document.getElementById('totCorridas').innerText = formatarMoeda(tCorridas);
    document.getElementById('totGeral').innerText = formatarMoeda(tGeral);

    document.getElementById('cardTotais').style.display = 'block';
}

/**
 * Monta o relatório textual para impressão contendo Cliente e localização exata
 */
function gerarRelatorio() {
    if (registros.length === 0) {
        alert("⚠️ Adicione dados primeiro!");
        return;
    }

    let tBruto = 0, tCorridas = 0;
    let txt = `🧾 DRIVERFLUX - RELATÓRIO DETALHADO COM LOCALIZAÇÃO\n`;
    txt += `Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n`;
    txt += `=========================================\n\n`;

    registros.forEach(r => {
        tBruto += r.emprestado;
        tCorridas += r.corrida;
        txt += `[${r.dataHora}] Reg #${r.id}\n`;
        txt += `  👤 Cliente:    ${r.cliente || 'Não Informado'}\n`;
        txt += `  -> Empréstimo: ${formatarMoeda(r.emprestado)}\n`;
        txt += `  -> Corrida:    ${formatarMoeda(r.corrida)}\n`;
        
        if (r.gps) {
            txt += `  📍 GPS: Lat ${r.gps.latitude.toFixed(6)}, Lng ${r.gps.longitude.toFixed(6)} (±${Math.round(r.gps.accuracy)}m)\n`;
        } else {
            txt += `  ❌ GPS: Sem localização\n`;
        }
        txt += `-----------------------------------------\n`;
    });

    let juros = tBruto * 0.20;
    let tGeral = tBruto + juros + tCorridas;

    txt += `\n=========================================\n`;
    txt += `Subtotal Empréstimos:    ${formatarMoeda(tBruto)}\n`;
    txt += `Taxa Adicional (+20%):   ${formatarMoeda(juros)}\n`;
    txt += `Subtotal Corridas:       ${formatarMoeda(tCorridas)}\n`;
    txt += `-----------------------------------------\n`;
    txt += `VALOR TOTAL A RECEBER:   ${formatarMoeda(tGeral)}\n`;
    txt += `=========================================`;

    document.getElementById('reportOutput').innerText = txt;
    document.getElementById('reportOutput').style.display = 'block';
    document.getElementById('cardRelatorio').style.display = 'block';
}

/**
 * Inicialização nativa do ecossistema
 */
document.addEventListener('DOMContentLoaded', function() {
    GeoLocation.init();
    carregarDoStorage();
    renderizarTabela();
});

/**
 * APP.JS - Sincronização via Firebase Realtime Database
 */

// Suas credenciais oficiais geradas pelo console do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAY217DxZeZZMlg0ZpHYFvXoALrkd5zcPM",
    authDomain: "driverflux.firebaseapp.com",
    databaseURL: "https://driverflux-default-rtdb.firebaseio.com",
    projectId: "driverflux",
    storageBucket: "driverflux.firebasestorage.app",
    messagingSenderId: "855577761510",
    appId: "1:855577761510:web:7e4c0911921a5c18c34d27"
};

// Inicializa o ecossistema do Firebase no dispositivo
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let registros = [];
let pagamentos = [];
let coordenadaAtual = null;
let filtroTexto = "";

function gerarContraSenhaEsperada(codigoDesafio) {
    return (parseInt(codigoDesafio) * 3) + 1234;
}

function checarLicenciamento() {
    const ativado = localStorage.getItem('driverflux_licenca_ativa');
    
    if (ativado === 'true') {
        document.getElementById('telaAtivacao').style.display = 'none';
        document.getElementById('conteudoApp').style.display = 'block';
        inicializarAplicativo();
    } else {
        let codigoDesafio = localStorage.getItem('driverflux_codigo_desafio');
        if (!codigoDesafio) {
            codigoDesafio = Math.floor(1000 + Math.random() * 9000).toString();
            localStorage.setItem('driverflux_codigo_desafio', codigoDesafio);
        }
        document.getElementById('txtCodigoDesafio').innerText = codigoDesafio;
        document.getElementById('telaAtivacao').style.display = 'block';
        document.getElementById('conteudoApp').style.display = 'none';
    }
}

function verificarAtivacao() {
    const codigoDesafio = localStorage.getItem('driverflux_codigo_desafio');
    const contraSenhaDigitada = parseInt(document.getElementById('inputContraSenha').value);
    
    if (!contraSenhaDigitada) {
        alert("⚠️ Digite a contra-senha fornecida pelo administrador.");
        return;
    }

    if (contraSenhaDigitada === gerarContraSenhaEsperada(codigoDesafio)) {
        localStorage.setItem('driverflux_licenca_ativa', 'true');
        alert("🚀 Aplicativo liberado com sucesso!");
        checarLicenciamento();
    } else {
        alert("❌ Contra-senha incorreta!");
    }
}

/**
 * Escuta em tempo real os nós do Realtime Database
 */
function escutarDadosNuvem() {
    // Sincroniza lançamentos de corridas
    db.ref("registros").on("value", (snapshot) => {
        registros = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach((key) => {
                let item = data[key];
                item.docId = key; // Guarda a chave única gerada pelo Firebase para edições
                registros.push(item);
            });
            // Ordena pelo ID numérico interno para manter consistência na tabela
            registros.sort((a, b) => a.id - b.id);
        }
        renderizarTabela();
        atualizarListaSugestoes();
    }, (error) => {
        console.error("Erro ao ler registros: ", error);
    });

    // Sincroniza livro de pagamentos/amortizações
    db.ref("pagamentos").on("value", (snapshot) => {
        pagamentos = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach((key) => {
                pagamentos.push(data[key]);
            });
        }
        if (document.getElementById('containerPesquisa').style.display === 'block') {
            processarConsultaCliente();
        }
    }, (error) => {
        console.error("Erro ao ler pagamentos: ", error);
    });
}

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
    gpsDisplay.innerText = "🔍 Buscando satélites...";
    gpsDisplay.style.color = '#ef4444';
    document.getElementById('formModal').style.display = 'flex';

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
        GeoLocation.coordenadas = reg.gps;
        gpsDisplay.innerText = `📍 ${GeoLocation.formatarCoordenadas()}`;
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
        if (reg && reg.docId) {
            db.ref("registros/" + reg.docId).update({
                cliente: nomeCliente,
                emprestado: vEmprestimo,
                corrida: vCorrida,
                dataHora: dataHoraStr,
                gps: coordenadaAtual ? coordenadaAtual : (reg.gps || null)
            }).then(() => fecharModal())
              .catch(e => alert("Erro ao atualizar na nuvem: " + e));
        }
    } else {
        let proximoId = 1;
        if (registros.length > 0) {
            proximoId = Math.max(...registros.map(r => r.id)) + 1;
        }

        db.ref("registros").push({
            id: proximoId,
            cliente: nomeCliente,
            emprestado: vEmprestimo,
            corrida: vCorrida,
            dataHora: dataHoraStr,
            gps: coordenadaAtual
        }).then(() => fecharModal())
          .catch(e => alert("Erro ao salvar na nuvem: " + e));
    }

    document.getElementById('cardTotais').style.display = 'none';
    document.getElementById('cardRelatorio').style.display = 'none';
}

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

function processarConsultaCliente() {
    const nomeBusca = document.getElementById('inputPesquisa').value.trim();
    filtroTexto = nomeBusca.toLowerCase();
    renderizarTabela();

    if (!nomeBusca) {
        document.getElementById('fichaCliente').style.display = 'none';
        return;
    }

    let totalDevido = 0;
    registros.forEach(r => {
        if (r.cliente && r.cliente.trim().toLowerCase() === nomeBusca.toLowerCase()) {
            totalDevido += (r.emprestado * 1.20) + r.corrida;
        }
    });

    let totalPago = 0;
    pagamentos.forEach(p => {
        if (p.cliente.toLowerCase() === nomeBusca.toLowerCase()) {
            totalPago += p.valor;
        }
    });

    let saldoFinal = totalDevido - totalPago;

    document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nomeBusca}`;
    document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(totalDevido);
    document.getElementById('ledgerTotalPago').innerText = formatarMoeda(totalPago);
    
    const labelSaldo = document.getElementById('ledgerSaldoFinal');
    
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

function registrarPagamento() {
    const nomeCliente = document.getElementById('inputPesquisa').value.trim();
    const valorEntrega = parseFloat(document.getElementById('inputValorPagamento').value) || 0;

    if (!nomeCliente) return alert("⚠️ Selecione um cliente válido primeiro.");
    if (valorEntrega <= 0) return alert("⚠️ Informe um valor de pagamento maior que zero.");

    db.ref("pagamentos").push({
        cliente: nomeCliente,
        valor: valorEntrega,
        data: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
    }).then(() => {
        document.getElementById('inputValorPagamento').value = "";
        alert(`✅ Pagamento de ${formatarMoeda(valorEntrega)} sincronizado com a nuvem!`);
    }).catch(e => alert("Erro ao computar pagamento cloud: " + e));
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
    let txt = `🧾 DRIVERFLUX - RELATÓRIO OPERACIONAL COM CLOUD\n`;
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

function inicializarAplicativo() {
    if (typeof GeoLocation !== 'undefined') GeoLocation.init();
    escutarDadosNuvem(); 
}

document.addEventListener('DOMContentLoaded', function() {
    checarLicenciamento();
});

/**
 * APP.JS - DriverFlux Oficial (Com Hodômetro, Cobrança de Fiado e Emissão de Recibo Corporativo)
 * Lógica de Negócio Completa com Atalhos de Teste e Captura de GPS no Momento do Lançamento
 */

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
function iniciarFirebaseSeNecessario() {
    if (localStorage.getItem('driverflux_modo_demo') !== 'true') {
        if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
        db = firebase.database();
    }
}

let turnosHistoricoMaster = {}; 
let registros = [];             
let pagamentos = [];            
let coordenadaAtual = null;
let filtroTexto = "";
let usuarioLogado = "";         
let idTurnoAtivo = "";          
let metadadosTurno = { trocoInicial: 0, kmInicial: 0, status: "fechado", tipoContrato: "efetivo", motorista: "" };

document.addEventListener("DOMContentLoaded", () => {
    iniciarFirebaseSeNecessario();
    verificarSessao();
    
    // Inicializa o módulo customizado de GPS
    GeoLocation.init();

    const btnSalvar = document.getElementById('btnSalvarLancamento');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarDados);
    }

    const inputFiltro = document.getElementById('inputFiltroTexto');
    if (inputFiltro) {
        inputFiltro.addEventListener('input', (e) => {
            filtroTexto = e.target.value.toLowerCase().trim();
            renderizarTabela();
        });
    }
    
    configurarMascarasMonetarias();
});

function configurarMascarasMonetarias() {
    const campos = ['inputCorrida', 'inputEmprestimo', 'inputTroco', 'inputKm', 'inputRecebimentoParcial'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', function() {
                if(this.value === "0" || this.value === "0,00") this.value = "";
            });
            el.addEventListener('blur', function() {
                if(this.value === "") this.value = "0";
            });
        }
    });
}

function verificarSessao() {
    const user = localStorage.getItem("driverflux_user");
    const turno = localStorage.getItem("driverflux_turno");
    const meta = localStorage.getItem("driverflux_meta_turno");

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    usuarioLogado = user;
    document.getElementById('lblUsuarioLogado').innerText = user.toUpperCase();

    if (user === 'master') {
        document.getElementById('blocoPainelMaster').style.display = 'block';
        document.getElementById('blocoOperador').style.display = 'none';
        carregarTurnosMaster();
    } else {
        document.getElementById('blocoPainelMaster').style.display = 'none';
        document.getElementById('blocoOperador').style.display = 'block';
        
        if (turno && meta) {
            idTurnoAtivo = turno;
            metadadosTurno = JSON.parse(meta);
            configurarLayoutTurno(true);
            ouvirDadosTurno();
        } else {
            configurarLayoutTurno(false);
        }
    }
}

function configurarLayoutTurno(ativo) {
    if (ativo) {
        document.getElementById('btnAbrirTurno').style.display = 'none';
        document.getElementById('btnFecharTurno').style.display = 'block';
        document.getElementById('btnNovaCorrida').disabled = false;
        document.getElementById('btnNovoRecebimento').disabled = false;
        let cLog = metadadosTurno.tipoContrato ? metadadosTurno.tipoContrato.toUpperCase() : "EFETIVO";
        document.getElementById('lblStatusTurno').innerHTML = `🟢 TURNO ATIVO: <b>#${idTurnoAtivo.substring(1,8).toUpperCase()}</b> [${cLog}]`;
    } else {
        document.getElementById('btnAbrirTurno').style.display = 'block';
        document.getElementById('btnFecharTurno').style.display = 'none';
        document.getElementById('btnNovaCorrida').disabled = true;
        document.getElementById('btnNovoRecebimento').disabled = true;
        document.getElementById('lblStatusTurno').innerHTML = "🔴 NENHUM TURNO ATIVO (Abra um turno para iniciar)";
        registros = [];
        pagamentos = [];
        renderizarTabela();
    }
}

function abrirModalTurno() {
    document.getElementById('modalTurno').style.display = 'flex';
    document.getElementById('inputTroco').value = "0";
    document.getElementById('inputKm').value = "";
    document.getElementById('selectContrato').value = "efetivo";
}

function fecharModalTurno() {
    document.getElementById('modalTurno').style.display = 'none';
}

function confirmarAberturaTurno() {
    const troco = parseFloat(document.getElementById('inputTroco').value) || 0;
    const km = parseInt(document.getElementById('inputKm').value) || 0;
    const contrato = document.getElementById('selectContrato').value;

    if (!km || km <= 0) {
        alert("⚠️ Por favor, insira a quilometragem inicial do veículo.");
        return;
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    idTurnoAtivo = "T" + agora.getTime();
    metadadosTurno = {
        motorista: usuarioLogado,
        abertura: dataHoraStr,
        trocoInicial: troco,
        kmInicial: km,
        status: "aberto",
        tipoContrato: contrato
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem("driverflux_turno", idTurnoAtivo);
        localStorage.setItem("driverflux_meta_turno", JSON.stringify(metadadosTurno));
        fecharModalTurno();
        configurarLayoutTurno(true);
        renderizarTabela();
    } else {
        db.ref(`turnos/${idTurnoAtivo}`).set(metadadosTurno).then(() => {
            localStorage.setItem("driverflux_turno", idTurnoAtivo);
            localStorage.setItem("driverflux_meta_turno", JSON.stringify(metadadosTurno));
            fecharModalTurno();
            configurarLayoutTurno(true);
            ouvirDadosTurno();
        });
    }
}

function fecharTurnoGeral() {
    if (!confirm("Deseja realmente encerrar o turno atual?")) return;
    
    const kmFinalStr = prompt("Digite a Quilometragem FINAL do veículo:");
    const kmFinal = parseInt(kmFinalStr) || 0;
    
    if (!kmFinal || kmFinal <= metadadosTurno.kmInicial) {
        alert(`⚠️ KM Final inválido! Deve ser maior que o KM Inicial (${metadadosTurno.kmInicial} km).`);
        return;
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    metadadosTurno.status = "fechado";
    metadadosTurno.fechamento = dataHoraStr;
    metadadosTurno.kmFinal = kmFinal;

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.removeItem("driverflux_turno");
        localStorage.removeItem("driverflux_meta_turno");
        configurarLayoutTurno(false);
    } else {
        db.ref(`turnos/${idTurnoAtivo}`).update(metadadosTurno).then(() => {
            db.ref(`corridas_por_turno/${idTurnoAtivo}`).once('value', (snap) => {
                if(snap.exists()){
                    db.ref(`historico_fechado_turnos/${idTurnoAtivo}`).set(snap.val());
                }
            });
            localStorage.removeItem("driverflux_turno");
            localStorage.removeItem("driverflux_meta_turno");
            configurarLayoutTurno(false);
        });
    }
}

function ouvirDadosTurno() {
    if (!idTurnoAtivo || localStorage.getItem('driverflux_modo_demo') === 'true') return;

    db.ref(`corridas_por_turno/${idTurnoAtivo}`).on('value', (snapshot) => {
        registros = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                registros.push({ id: key, ...data[key] });
            });
        }
        renderizarTabela();
    });

    db.ref(`pagamentos_por_turno/${idTurnoAtivo}`).on('value', (snapshot) => {
        pagamentos = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                pagamentos.push({ id: key, ...data[key] });
            });
        }
        renderizarTabela();
    });
}

function abrirModal(tipo) {
    document.getElementById('modalLancamento').style.display = 'flex';
    document.getElementById('inputTipoLancamento').value = tipo;
    document.getElementById('inputCorrida').value = "";
    
    const blocoCredito = document.getElementById('camposCreditoOpcionais');
    if (tipo === 'credito') {
        document.getElementById('tituloModalLancamento').innerText = "⚡ Novo Lançamento Corporativo (Fiado)";
        blocoCredito.style.display = 'block';
        document.getElementById('inputCliente').value = "";
        document.getElementById('inputWhatsCliente').value = "";
        document.getElementById('inputEmprestimo').value = "0";
        sincronizarDatalistClientes();
    } else {
        document.getElementById('tituloModalLancamento').innerText = "💰 Novo Lançamento Particular (À Vista)";
        blocoCredito.style.display = 'none';
    }
}

function fecharModal() {
    document.getElementById('modalLancamento').style.display = 'none';
}

function sincronizarDatalistClientes() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') return;
    db.ref('clientes_devedores').once('value', (snapshot) => {
        const datalist = document.getElementById('listaClientes');
        if (!datalist) return;
        datalist.innerHTML = "";
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(nome => {
                const opt = document.createElement('option');
                opt.value = nome;
                datalist.appendChild(opt);
            });
        }
    });
}

/**
 * SALVARDADOS: Executa a chamada do GPS de forma consistente.
 * Se o GPS estiver desligado ou sem permissão, o sistema operacional irá disparar o prompt nativo.
 */
function salvarDados() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;
    let nomeCliente = "Passageiro Avulso"; 
    let vEmprestimo = 0;
    let whatsCliente = document.getElementById('inputWhatsCliente') ? document.getElementById('inputWhatsCliente').value.trim() : "";

    if (vCorrida <= 0) return alert("⚠️ Digite o valor da corrida.");
    if (tipo === 'credito') {
        nomeCliente = document.getElementById('inputCliente').value.trim();
        vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
        if (!nomeCliente) return alert("⚠️ Digite o nome do cliente.");
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    // Executa a chamada chamando diretamente o módulo estruturado GeoLocation
    GeoLocation.capturarCoordenadas(
        (latitude, longitude) => {
            // Callback de Sucesso: GPS ativo e capturado com sucesso
            let coordenadasString = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, coordenadasString, whatsCliente);
        },
        (mensagemErro) => {
            // Callback de Erro: Se o motorista recusar ou demorar para dar permissão, salva como "Não capturado" para não prender o caixa
            console.warn("GPS ignorado:", mensagemErro);
            executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, "Não capturado", whatsCliente);
        }
    );
}

function executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, coordenadasString, whatsCliente) {
    const payload = {
        tipo: tipo,
        cliente: nomeCliente,
        emprestimo: vEmprestimo,
        valor: vCorrida,
        dataHora: dataHoraStr,
        coordenadas: coordenadasString,
        whats: whatsCliente
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        registros.push({ id: "DEMO" + Date.now(), ...payload });
        fecharModal();
        renderizarTabela();
    } else {
        db.ref(`corridas_por_turno/${idTurnoAtivo}`).push(payload).then(() => {
            if (tipo === 'credito') {
                const totalAcumulado = vCorrida + vEmprestimo;
                db.ref(`clientes_devedores/${nomeCliente}/saldo`).transaction((currentValue) => {
                    return (currentValue || 0) + totalAcumulado;
                });
                if(whatsCliente) {
                    db.ref(`clientes_devedores/${nomeCliente}/whats`).set(whatsCliente);
                }
            }
            fecharModal();
        });
    }
}

function abrirModalRecebimento() {
    document.getElementById('modalRecebimento').style.display = 'flex';
    document.getElementById('inputRecebimentoParcial').value = "";
    sincronizarSelectClientesDevedores();
}

function fecharModalRecebimento() {
    document.getElementById('modalRecebimento').style.display = 'none';
}

function sincronizarSelectClientesDevedores() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') return;
    db.ref('clientes_devedores').once('value', (snapshot) => {
        const select = document.getElementById('selectClienteDevedor');
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecione o Cliente --</option>';
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(nome => {
                if (data[nome].saldo > 0) {
                    const opt = document.createElement('option');
                    opt.value = nome;
                    opt.innerText = `${nome.toUpperCase()} (Devendo: R$ ${data[nome].saldo.toFixed(2)})`;
                    select.appendChild(opt);
                }
            });
        }
    });
}

function confirmarRecebimento() {
    const nome = document.getElementById('selectClienteDevedor').value;
    const valor = parseFloat(document.getElementById('inputRecebimentoParcial').value) || 0;

    if (!nome) return alert("⚠️ Selecione um cliente.");
    if (valor <= 0) return alert("⚠️ Digite um valor válido para recebimento.");

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    const payload = {
        cliente: nome,
        valorRecebido: valor,
        dataHora: dataHoraStr
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        pagamentos.push({ id: "PAY" + Date.now(), ...payload });
        fecharModalRecebimento();
        renderizarTabela();
    } else {
        db.ref(`pagamentos_por_turno/${idTurnoAtivo}`).push(payload).then(() => {
            db.ref(`clientes_devedores/${nome}/saldo`).transaction((currentValue) => {
                return (currentValue || 0) - valor;
            });
            fecharModalRecebimento();
        });
    }
}

function renderizarTabela() {
    const tbody = document.querySelector('#tabelaCorridas tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    let totalGeralDinheiro = 0;
    let totalGeralCredito = 0;
    let totalGeralEmprestimos = 0;
    let totalGeralRecebidoFiado = 0;

    const registrosFiltrados = registros.filter(item => {
        if (!filtroTexto) return true;
        return item.cliente.toLowerCase().includes(filtroTexto) || item.tipo.toLowerCase().includes(filtroTexto);
    });

    registrosFiltrados.forEach(item => {
        const tr = document.createElement('tr');
        const ehCredito = item.tipo === 'credito';
        
        if (ehCredito) {
            totalGeralCredito += item.valor;
            totalGeralEmprestimos += (item.emprestimo || 0);
        } else {
            totalGeralDinheiro += item.valor;
        }

        let labelBadge = ehCredito ? `<span class="badge badge-credito">Corporativo</span>` : `<span class="badge badge-dinheiro">Particular</span>`;
        let detalhesCliente = ehCredito ? `<br><small style="color:var(--texto-secundario)">Devedor: ${item.cliente}</small>` : '';
        let infoEmprestimo = (item.emprestimo > 0) ? `<br><small style="color:var(--danger)">+ R$ ${item.emprestimo.toFixed(2)} Emp.</small>` : '';
        let gpsBadge = (item.coordenadas && item.coordenadas !== "Não capturado") ? `📍 <span style="font-size:11px;color:#4f46e5">${item.coordenadas}</span>` : `❌ <span style="font-size:11px;color:var(--texto-secundario)">Sem GPS</span>`;

        tr.innerHTML = `
            <td><b>${item.dataHora}</b>${detalhesCliente}</td>
            <td>${labelBadge}${infoEmprestimo}</td>
            <td><b>R$ ${item.valor.toFixed(2)}</b><br>${gpsBadge}</td>
            <td style="text-align:center;">
                <button class="btn-print" onclick="imprimirCupom('${item.id}', 'corrida')">🖨️ Recibo</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    pagamentos.forEach(pay => {
        totalGeralRecebidoFiado += pay.valorRecebido;
        const tr = document.createElement('tr');
        tr.style.background = "#f0fdf4";
        tr.innerHTML = `
            <td><b>${pay.dataHora}</b><br><small style="color:var(--success)">Acerto: ${pay.cliente}</small></td>
            <td><span class="badge badge-dinheiro" style="background:#10b981;">Acerto Fiado</span></td>
            <td><b style="color:var(--success)">R$ ${pay.valorRecebido.toFixed(2)}</b></td>
            <td style="text-align:center;">
                <button class="btn-print" style="background:#10b981;" onclick="imprimirCupom('${pay.id}', 'pagamento')">🖨️ Recibo</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const trocoInicial = metadadosTurno.trocoInicial || 0;
    const faturamentoBrutoCaixa = totalGeralDinheiro + totalGeralRecebidoFiado;
    const saldoFinalCaixaFisico = trocoInicial + faturamentoBrutoCaixa - totalGeralEmprestimos;

    document.getElementById('lblTotalDinheiro').innerText = "R$ " + totalGeralDinheiro.toFixed(2);
    document.getElementById('lblTotalCredito').innerText = "R$ " + totalGeralCredito.toFixed(2);
    document.getElementById('lblTotalEmprestimos').innerText = "R$ " + totalGeralEmprestimos.toFixed(2);
    document.getElementById('lblTotalRecebidoFiado').innerText = "R$ " + totalGeralRecebidoFiado.toFixed(2);
    document.getElementById('lblSaldoCaixaFisico').innerText = "R$ " + saldoFinalCaixaFisico.toFixed(2);
}

function imprimirCupom(id, tipoCupom) {
    let dados = null;
    if (tipoCupom === 'corrida') {
        dados = registros.find(x => x.id === id);
    } else {
        dados = pagamentos.find(x => x.id === id);
    }
    
    if (!dados) return alert("Erro ao carregar dados do recibo.");

    let tContrato = metadadosTurno.tipoContrato ? metadadosTurno.tipoContrato.toUpperCase() : "EFETIVO";
    let motoristaNome = metadadosTurno.motorista ? metadadosTurno.motorista.toUpperCase() : "MOTORISTA";
    let textoCupom = "";

    if (tipoCupom === 'corrida') {
        const totalPassageiro = dados.valor + (dados.emprestimo || 0);
        textoCupom = `
=========================================
          DRIVERFLUX CORPORATIVO         
=========================================
MOTORISTA: ${motoristaNome} [${tContrato}]
TURNO REF: #${idTurnoAtivo.substring(1,8).toUpperCase()}
DATA/HORA: ${dados.dataHora}
-----------------------------------------
TIPO: LANCAMENTO ${dados.tipo.toUpperCase()}
CLIENTE: ${dados.cliente.toUpperCase()}

VALOR DA CORRIDA:    R$ ${dados.valor.toFixed(2)}
DINHEIRO EMPRESTADO: R$ ${(dados.emprestimo || 0).toFixed(2)}
-----------------------------------------
TOTAL A SER COBRADO: R$ ${totalPassageiro.toFixed(2)}

-----------------------------------------
VALIDACAO GEOGRAFICA DE SEGURANCA:
COORDENADAS: ${dados.coordenadas || "Não capturado"}
-----------------------------------------
   Obrigado por voar com a DriverFlux!   
=========================================
\n\n\n`;
    } else {
        textoCupom = `
=========================================
         RECIBO DE QUITACAO/PAGTO        
=========================================
MOTORISTA: ${motoristaNome}
DATA/HORA: ${dados.dataHora}
-----------------------------------------
RECEBEMOS DE: ${dados.cliente.toUpperCase()}
A QUANTIA DE: R$ ${dados.valorRecebido.toFixed(2)}

REFERENTE A: AMORTIZACAO DE DEBITOS DE
CORRIDAS ANTERIORES NO SISTEMA FLUX.
-----------------------------------------
SALDO ATUALIZADO NO BANCO DE DADOS ONLINE
=========================================
\n\n\n`;
    }

    const janelaImpressao = window.open('', '_blank', 'width=300,height=400');
    janelaImpressao.document.write('<pre style="font-family:monospace;font-size:12px;line-height:1.2;">' + textoCupom + '</pre>');
    janelaImpressao.document.close();
    janelaImpressao.print();
    janelaImpressao.close();
}

function limparSessao() {
    localStorage.clear();
    window.location.href = "login.html";
}

let turnosHistoricoMaster = {};
function carregarTurnosMaster() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') return;
    db.ref('turnos').once('value', (snapshot) => {
        const select = document.getElementById('selectFiltroTurnoMaster');
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecione um Turno para Auditoria --</option>';
        turnosHistoricoMaster = snapshot.val() || {};
        
        db.ref('usuarios').once('value', (uSnap) => {
            const uData = uSnap.val() || {};
            Object.keys(turnosHistoricoMaster).forEach(turnoId => {
                const t = turnosHistoricoMaster[turnoId];
                const motorista = t.motorista || "";
                const mInfo = uData[motorista];
                let tContrato = (mInfo && mInfo.tipo) ? mInfo.tipo : (t.tipoContrato || "efetivo");
                
                const opt = document.createElement('option');
                opt.value = turnoId;
                const statusIcon = t.status === 'aberto' ? '🟢 (Ativo)' : '🔴 (Fechado)';
                opt.innerText = `${statusIcon} ${t.motorista.toUpperCase()} [${tContrato.toUpperCase()}] | Início: ${t.abertura}`;
                select.appendChild(opt);
            });
        });
    });
}

function selecionarTurnoParaVerificacaoMaster() {
    const selectedId = document.getElementById('selectFiltroTurnoMaster').value;
    document.getElementById('cardTotais').style.display = 'none';
    document.getElementById('cardRelatorio').style.display = 'none';
    
    if (!selectedId) {
        registros = [];
        renderizarTabela();
        document.getElementById('lblIdTurnoAtivo').innerText = "Turno: Nenhum selecionado";
        return;
    }

    metadadosTurno = turnosHistoricoMaster[selectedId];
    idTurnoAtivo = selectedId;
    let contratoLog = metadadosTurno.tipoContrato ? metadadosTurno.tipoContrato.toUpperCase() : "EFETIVO";
    document.getElementById('lblIdTurnoAtivo').innerText = `Auditoria Turno: #${idTurnoAtivo.substring(1, 8).toUpperCase()} | Tipo: ${contratoLog}`;
    
    db.ref(`corridas_por_turno/${selectedId}`).once("value", (snapshot) => {
        registros = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(k => {
                let item = data[k];
                registros.push({ id: k, ...item });
            });
        }
        
        db.ref(`pagamentos_por_turno/${selectedId}`).once("value", (pSnapshot) => {
            pagamentos = [];
            const pData = pSnapshot.val();
            if (pData) {
                Object.keys(pData).forEach(k => {
                    pagamentos.push({ id: k, ...pData[k] });
                });
            }
            
            document.getElementById('cardTotais').style.display = 'block';
            document.getElementById('cardRelatorio').style.display = 'block';
            renderizarTabela();
        });
    });
}

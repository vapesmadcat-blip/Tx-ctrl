/**
 * APP.JS - DriverFlux Oficial (Com Hodômetro, Cobrança de Fiado e Emissão de Recibo Corporativo)
 * Lógica de Negócio Completa com Atalhos de Desenvolvimento (1 para Demo, 222 para Completo)
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
let metadadosTurno = { trocoInicial: 0, kmInicial: 0, status: "fechado", tipoContrato: "efetivo" };
let motoristasCadastroMaster = {};

const LIMITE_DEMO = 10;

// BLINDAGEM DE CONTRA-SENHAS (Mantendo a estrutura de cálculos ativa para produção)
function obterSenhaDefinitiva(desafio) { return (parseInt(desafio) * 13) + 6182; }
function obterSenhaDemo(desafio) { return (parseInt(desafio) * 11) + 3947; }

function checarLicenciamento() {
    const statusLicenca = localStorage.getItem('driverflux_licenca_ativa');
    if (statusLicenca === 'true') {
        document.getElementById('telaAtivacao').style.display = 'none';
        if (localStorage.getItem('driverflux_modo_demo') === 'true') {
            document.getElementById('telaLogin').style.display = 'none';
            usuarioLogado = "demo_local";
            verificarStatusTurnoMotorista(); 
        } else {
            verificarSessaoLogin();
        }
    } else {
        let desafio = localStorage.getItem('driverflux_codigo_desafio') || Math.floor(1000 + Math.random() * 9000).toString();
        localStorage.setItem('driverflux_codigo_desafio', desafio);
        document.getElementById('txtCodigoDesafio').innerText = desafio;
        document.getElementById('telaAtivacao').style.display = 'block';
    }
}

// ALTERAÇÃO 1: Injeção de bypass rápido para ambiente de desenvolvimento/testes
function verificarAtivacao() {
    const desafio = localStorage.getItem('driverflux_codigo_desafio');
    const inputVal = document.getElementById('inputContraSenha').value.trim();
    if (!inputVal) return alert("⚠️ Digite a contra-senha.");
    
    const digitada = parseInt(inputVal);

    // Bypass rápido para testes na bancada
    if (digitada === 222) {
        alert("🛠️ [Bancada] Forçando ativação do MODO COMPLETO...");
        ativarVersãoCompletaDefinitiva();
        return;
    }
    if (digitada === 1) {
        alert("🛠️ [Bancada] Forçando ativação do MODO DEMO...");
        localStorage.setItem('driverflux_licenca_ativa', 'true');
        localStorage.setItem('driverflux_modo_demo', 'true');
        localStorage.setItem('driverflux_demo_ja_utilizada', 'true'); 
        checarLicenciamento();
        return;
    }

    // Validação padrão da semente (Para produção na rua)
    if (digitada === obterSenhaDefinitiva(desafio)) {
        ativarVersãoCompletaDefinitiva();
    } else if (digitada === obterSenhaDemo(desafio)) {
        if (localStorage.getItem('driverflux_demo_ja_utilizada') === 'true') {
            alert("❌ Bloqueado! Período de demonstração já utilizado.");
            return;
        }
        localStorage.setItem('driverflux_licenca_ativa', 'true');
        localStorage.setItem('driverflux_modo_demo', 'true');
        localStorage.setItem('driverflux_demo_ja_utilizada', 'true'); 
        alert("🟢 Modo DEMONSTRAÇÃO ativado!");
        checarLicenciamento();
    } else { 
        alert("❌ Contra-senha incorreta!"); 
    }
}

function verificarSessaoLogin() {
    const salvo = localStorage.getItem('driverflux_usuario_logado');
    if (salvo) {
        usuarioLogado = salvo;
        document.getElementById('telaLogin').style.display = 'none';
        iniciarFirebaseSeNecessario();
        db.ref(`usuarios/${usuarioLogado}`).once('value').then((snapshot) => {
            let dadosUser = snapshot.val();
            let contratoStr = (dadosUser && dadosUser.tipo) ? dadosUser.tipo.toUpperCase() : "EFETIVO";
            if (usuarioLogado === 'master') {
                document.getElementById('telaAberturaTurno').style.display = 'none';
                document.getElementById('conteudoApp').style.display = 'block';
                document.getElementById('painelFiltroMaster').style.display = 'block';
                document.getElementById('lblUsuarioAtivo').innerText = `Operador: ${usuarioLogado.toUpperCase()}`;
                inicializarMaster();
            } else {
                document.getElementById('painelFiltroMaster').style.display = 'none';
                document.getElementById('lblUsuarioAtivo').innerText = `Operador: ${usuarioLogado.toUpperCase()} (${contratoStr})`;
                verificarStatusTurnoMotorista();
            }
        });
    } else {
        document.getElementById('conteudoApp').style.display = 'none';
        document.getElementById('telaAberturaTurno').style.display = 'none';
        document.getElementById('telaLogin').style.display = 'block';
        iniciarFirebaseSeNecessario();
        garantirUsuariosBaseNoFirebase();
    }
}

function ativarVersãoCompletaDefinitiva() {
    localStorage.setItem('driverflux_licenca_ativa', 'true');
    localStorage.setItem('driverflux_modo_demo', 'false');
    localStorage.setItem('driverflux_demo_ja_utilizada', 'true');
    
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    db = firebase.database();

    const caronaDemo = localStorage.getItem('driverflux_demo_reg');
    if (caronaDemo) {
        const corridasParaMigrar = JSON.parse(caronaDemo);
        if (corridasParaMigrar.length > 0) {
            const migracaoRef = db.ref("corridas_por_turno/MIGRADO_DA_DEMO");
            corridasParaMigrar.forEach(reg => {
                migracaoRef.push({
                    id: reg.id, tipo: reg.tipo, cliente: reg.cliente + " (Vindo da Demo)",
                    emprestado: reg.emprestado || 0, corrida: reg.corrida, dataHora: reg.dataHora || "Data Demo", gps: null
                });
            });
            alert("📦 Sucesso! Corridas registradas na demo foram migradas para a nuvem!");
        }
    }
    alert("🚀 Sistema COMPLETO liberado!");
    location.reload(); 
}

function verificarStatusTurnoMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const tStatus = localStorage.getItem('driverflux_demo_status') || 'fechado';
        if (tStatus === 'aberto') {
            idTurnoAtivo = "DEMO-LOCAL";
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            document.getElementById('lblUsuarioAtivo').innerText = "Operador: TESTE DEMO";
            document.getElementById('lblIdTurnoAtivo').innerText = "Modo: Demonstração Off-line";
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
        }
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}`).orderByChild("status").equalTo("aberto").limitToLast(1).once("value", (snapshot) => {
        if (snapshot.exists()) {
            snapshot.forEach(child => { idTurnoAtivo = child.key; metadadosTurno = child.val(); });
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            document.getElementById('lblIdTurnoAtivo').innerText = `Turno Ativo: #${idTurnoAtivo.substring(1, 8).toUpperCase()}`;
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
        }
    });
}

function abrirTurnoOperacional() {
    const troco = parseFloat(document.getElementById('inputTrocoInicial').value) || 0;
    const km = parseInt(document.getElementById('inputKmInicial').value) || 0;
    if(km <= 0) return alert("⚠️ Por favor, digite a quilometragem atual do Hodômetro.");

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_troco', troco);
        localStorage.setItem('driverflux_demo_km', km);
        localStorage.setItem('driverflux_demo_status', 'aberto');
        metadadosTurno = { id: "DEMO-LOCAL", motorista: "teste_demo", status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: "demo" };
        verificarStatusTurnoMotorista();
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${usuarioLogado}`).once('value').then((snapshot) => {
        const dadosUser = snapshot.val();
        const tipoContrato = (dadosUser && dadosUser.tipo) ? dadosUser.tipo : "efetivo";
        const novoTurnoRef = db.ref(`turnos_operacionais/${usuarioLogado}`).push();
        idTurnoAtivo = novoTurnoRef.key;
        metadadosTurno = { id: idTurnoAtivo, motorista: usuarioLogado, status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: tipoContrato };
        novoTurnoRef.set(metadadosTurno).then(() => verificarStatusTurnoMotorista());
    });
}

function encerrarTurnoDefinitivo() {
    let kmFinal = prompt("🚗 Para fechar o caixa, insira a QUILOMETRAGEM FINAL (Hodômetro):");
    if (!kmFinal) return alert("⚠️ Encerramento cancelado. É obrigatório informar a KM Final.");
    kmFinal = parseInt(kmFinal);
    
    let kmInicialVal = (localStorage.getItem('driverflux_modo_demo') === 'true') ? parseInt(localStorage.getItem('driverflux_demo_km')) : metadadosTurno.kmInicial;
    if(kmFinal < kmInicialVal) return alert(`❌ Erro! A KM Final não pode ser menor que a Inicial (${kmInicialVal} KM).`);

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_status', 'fechado');
        alert(`Caixa encerrado!\nDistância Rodada: ${kmFinal - kmInicialVal} KM.`);
        verificarStatusTurnoMotorista();
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}/${idTurnoAtivo}`).update({ 
        status: "fechado", fechamento: dataStr, kmFinal: kmFinal, kmTotalRodado: (kmFinal - kmInicialVal)
    }).then(() => {
        alert("🔴 Turno encerrado e enviado para auditoria Master!");
        efetuarLogoutPronto();
    });
}

function inicializarMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const r = localStorage.getItem('driverflux_demo_reg');
        const p = localStorage.getItem('driverflux_demo_pag');
        registros = r ? JSON.parse(r) : []; pagamentos = p ? JSON.parse(p) : [];
        renderToggleAcoesDemo(); renderizarTabela(); atualizarListaSugestoes();
        return;
    }

    const cache = localStorage.getItem(`driverflux_cache_${idTurnoAtivo}`);
    if (cache) { registros = JSON.parse(cache); renderizarTabela(); }

    iniciarFirebaseSeNecessario();
    db.ref(`corridas_por_turno/${idTurnoAtivo}`).on("value", (snapshot) => {
        registros = []; const data = snapshot.val();
        if (data) { Object.keys(data).forEach(k => { let item = data[k]; item.docId = k; registros.push(item); }); registros.sort((a, b) => a.id - b.id); }
        localStorage.setItem(`driverflux_cache_${idTurnoAtivo}`, JSON.stringify(registros));
        renderizarTabela(); atualizarListaSugestoes();
    });
}

function renderToggleAcoesDemo() {
    if (!document.getElementById('badgeAvisoContador')) {
        let div = document.createElement('div'); div.id = "badgeAvisoContador";
        div.style.cssText = "background:#fffbeb; color:#b45309; font-size:11px; padding:8px; border-radius:8px; text-align:center; width:100%; margin-bottom:10px; font-weight:bold; cursor:pointer;";
        div.innerText = `📈 Limite Demo: ${registros.length} de ${LIMITE_DEMO} registros. (Clique aqui para Ativar)`;
        div.onclick = function() {
            let senhaUpgrade = prompt("🔑 Insira a Contra-Senha de Liberação Definitiva (Ou 222 na bancada):");
            if (senhaUpgrade && (parseInt(senhaUpgrade) === 222 || parseInt(senhaUpgrade) === obterSenhaDefinitiva(localStorage.getItem('driverflux_codigo_desafio')))) {
                ativarVersãoCompletaDefinitiva();
            } else if (senhaUpgrade) { alert("❌ Contra-senha inválida!"); }
        };
        document.getElementById('conteudoApp').insertBefore(div, document.getElementById('conteudoApp').firstChild);
    }
}

function salvarDados() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;
    let nomeCliente = "Passageiro Avulso"; let vEmprestimo = 0;
    let whatsCliente = document.getElementById('inputWhatsCliente') ? document.getElementById('inputWhatsCliente').value.trim() : "";

    if (vCorrida <= 0) return alert("⚠️ Digite o valor da corrida.");
    if (tipo === 'credito') {
        nomeCliente = document.getElementById('inputCliente').value.trim();
        vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
        if (!nomeCliente) return alert("⚠️ Digite o nome do cliente.");
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    const novaCorrida = {
        id: registros.length > 0 ? Math.max(...registros.map(r => r.id)) + 1 : 1, 
        tipo: tipo, cliente: nomeCliente, emprestado: vEmprestimo, corrida: vCorrida, dataHora: dataHoraStr, gps: coordenadaAtual, whatsCliente: whatsCliente
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        registros.push(novaCorrida);
        localStorage.setItem('driverflux_demo_reg', JSON.stringify(registros));
        fecharModal(); renderizarTabela(); atualizarListaSugestoes();
        if (tipo === 'credito') { prepararDisparoReciboNativo(novaCorrida, whatsCliente); }
    } else {
        iniciarFirebaseSeNecessario();
        db.ref(`corridas_por_turno/${idTurnoAtivo}`).push(novaCorrida).then(() => {
            fecharModal(); renderizarTabela(); atualizarListaSugestoes();
            if (tipo === 'credito') { prepararDisparoReciboNativo(novaCorrida, whatsCliente); }
        });
    }
}

// ALTERAÇÃO 2: Bloco modular das funções de Recibo, Notas e Relatório Dinâmico por Herança
function prepararDisparoReciboNativo(reg, whatsappSugerido) {
    let txtMensagem = "";
    if (reg.tipo === 'credito') {
        const totalDevido = reg.corrida + (reg.emprestado * 1.20);
        txtMensagem = `🧾 *COMPROVANTE DE CORRIDA - DRIVERFLUX*\n-----------------------------------------\n📅 *Data:* ${reg.dataHora}\n👤 *Cliente:* ${reg.cliente.toUpperCase()}\n-----------------------------------------\n🔑 *Corrida:* R$ ${reg.corrida.toFixed(2).replace('.', ',')}\n💵 *Empréstimo:* R$ ${reg.emprestado.toFixed(2).replace('.', ',')}\n-----------------------------------------\n💰 *TOTAL EM ABERTO:* R$ ${totalDevido.toFixed(2).replace('.', ',')}\n\n_Sumário de cobrança ativo lançado._`;
    } else {
        let descCliente = reg.cliente && reg.cliente !== "Passageiro Avulso" ? reg.cliente.toUpperCase() : "PASSAGEIRO CORPORATIVO";
        txtMensagem = `🧾 *NOTA FISCAL / RECIBO DE TÁXI - DRIVERFLUX*\n=========================================\n🏢 *PRESTADOR:* Serviço de Táxi DriverFlux\n🆔 *IDENTIFICAÇÃO:* Registro Oficial #${reg.id}\n📅 *DATA/HORA EMISSÃO:* ${reg.dataHora}\n=========================================\n👤 *PASSAGEIRO:* ${descCliente}\n🔑 *SERVIÇO:* Transporte de Passageiros / Tarifa Balcão\n-----------------------------------------\n💰 *VALOR DO RECIBO:* R$ ${reg.corrida.toFixed(2).replace('.', ',')}\n🟢 *STATUS:* TOTALMENTE QUITADO / PAGO\n=========================================\n\n_Comprovante válido para fins de auditoria empresarial._`;
    }

    let confirmarEnvio = confirm(`📄 REVISÃO DO RECIBO:\n\n${txtMensagem.replace(/\*/g, '')}\n\nDeseja disparar este comprovante via WhatsApp?`);
    if (confirmarEnvio) {
        let destino = prompt("📱 Digite o WhatsApp de destino (Com DDD, apenas números):", whatsappSugerido || "51");
        if (!destino || destino === "51") return alert("⚠️ Operação cancelada. Número inválido.");
        let urlWhats = `https://api.whatsapp.com/send?phone=55${destino}&text=${encodeURIComponent(txtMensagem)}`;
        window.open(urlWhats, '_system');
    }
}

function emititNotaFiscalWhatsApp(idCorrida) {
    const reg = registros.find(r => r.id === idCorrida);
    if (!reg) return alert("Corrida não encontrada.");
    prepararDisparoReciboNativo(reg, "51");
}

function revierComprovanteWhats(idCorrida) {
    const reg = registros.find(r => r.id === idCorrida);
    if (!reg) return alert("Corrida não encontrada.");
    prepararDisparoReciboNativo(reg, reg.whatsCliente || "51");
}

function renderizarTabela() {
    const tbody = document.querySelector('#tabelaDados tbody'); tbody.innerHTML = '';
    registros.forEach(reg => {
        const tr = document.createElement('tr');
        const descTipo = reg.tipo === 'credito' ? '🟡 Crédito' : '🟢 Normal';
        const descCliente = reg.tipo === 'credito' ? (reg.cliente || 'N/I') : 'Passageiro Balcão';
        const valorExibido = reg.tipo === 'credito' ? (reg.corrida + reg.emprestado) : reg.corrida;
        
        let acoesHtml = `<button class="btn-nota" style="background:#1

/**
 * APP.JS - DriverFlux Oficial (Com Hodômetro, Cobrança de Fiado e Emissão de Recibo Corporativo)
 * Lógica de Negócio com Confirmação e Exibição de Recibo Nativo Read-Only antes do Envio
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

// BLINDAGEM DE CONTRA-SENHAS (Multiplicadores Primos Ímpares > 7)
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

function verificarAtivacao() {
    const desafio = localStorage.getItem('driverflux_codigo_desafio');
    const digitada = parseInt(document.getElementById('inputContraSenha').value);
    if (!digitada) return alert("⚠️ Digite a contra-senha.");

    if (digitada === obterSenhaDefinitiva(desafio)) {
        ativarVersãoCompletaDefinitiva();
    } else if (digitada === obterSenhaDemo(desafio)) {
        if (localStorage.getItem('driverflux_demo_ja_utilizada') === 'true') {
            alert("❌ Bloqueado! Este dispositivo já utilizou o período de demonstração. Insira a contra-senha de liberação definitiva.");
            return;
        }
        localStorage.setItem('driverflux_licenca_ativa', 'true');
        localStorage.setItem('driverflux_modo_demo', 'true');
        localStorage.setItem('driverflux_demo_ja_utilizada', 'true'); 
        alert("🟢 Modo DEMONSTRAÇÃO ativado com sucesso!");
        checarLicenciamento();
    } else { alert("❌ Contra-senha incorreta!"); }
}

function activarVersaoCompletaDefinitiva() {
    ativarVersãoCompletaDefinitiva();
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
            let senhaUpgrade = prompt("🔑 Insira a Contra-Senha de Liberação Definitiva:");
            if (senhaUpgrade && parseInt(senhaUpgrade) === obterSenhaDefinitiva(localStorage.getItem('driverflux_codigo_desafio'))) {
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
        prepararDisparoReciboNativo(novaCorrida, whatsCliente);
    } else {
        iniciarFirebaseSeNecessario();
        db.ref(`corridas_por_turno/${idTurnoAtivo}`).push(novaCorrida).then(() => {
            fecharModal(); renderizarTabela(); atualizarListaSugestoes();
            prepararDisparoReciboNativo(novaCorrida, whatsCliente);
        });
    }
}

// CONSERTO CENTRAL: Monta o texto engessado e abre a janela de visualização nativa sem mexer no teu HTML
function prepararDisparoReciboNativo(reg, whatsappSugerido) {
    let txtMensagem = "";
    
    if (reg.tipo === 'credito') {
        const totalDevido = reg.corrida + (reg.emprestado * 1.20);
        txtMensagem = `🧾 *COMPROVANTE DE CORRIDA - DRIVERFLUX*\n-----------------------------------------\n📅 *Data:* ${reg.dataHora}\n👤 *Cliente:* ${reg.cliente.toUpperCase()}\n💵 *Corrida:* ${formatarMoeda(reg.corrida)}\n🏦 *Empréstimo:* ${formatarMoeda(reg.emprestado)}\n📊 *Juros (20%):* ${formatarMoeda(reg.emprestado * 0.20)}\n═══════════════════════════════════\n💰 *TOTAL DEVIDO:* ${formatarMoeda(totalDevido)}\n═══════════════════════════════════\n✓ Comprovante gerado automaticamente\n✓ DriverFlux - Serviço de Táxi`;
    } else {
        let descCliente = reg.cliente && reg.cliente !== "Passageiro Avulso" ? reg.cliente.toUpperCase() : "PASSAGEIRO CORPORATIVO";
        txtMensagem = `🧾 *NOTA FISCAL / RECIBO DE TÁXI - DRIVERFLUX*\n=========================================\n🏢 *PRESTADOR:* Serviço de Táxi DriverFlux\n🆔 *IDENTIFICAÇÃO:* Registro Oficial\n📅 *Data da Corrida:* ${reg.dataHora}\n👤 *Passageiro:* ${descCliente}\n💵 *Valor da Corrida:* ${formatarMoeda(reg.corrida)}\n═══════════════════════════════════\n💳 *VALOR TOTAL:* ${formatarMoeda(reg.corrida)}\n═══════════════════════════════════\n✓ Nota Fiscal Eletrônica\n✓ Comprovante 100% Digital\n✓ DriverFlux - Taxi Oficial`;
    }

    // Janela de visualização Read-Only (imutável) na tela do celular
    let confirmarEnvio = confirm(`📄 REVISÃO DO RECIBO GENERADO:\n\n${txtMensagem.replace(/\*/g, '')}\n\nDeseja disparar este comprovante via WhatsApp?`);
    
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
        
        let acoesHtml = `<button class="btn-nota" style="background:#10b981; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="emititNotaFiscalWhatsApp(${reg.id})">📄 Nota</button>`;
        acoesHtml += `<button class="btn-whats" style="background:#25d366; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="revierComprovanteWhats(${reg.id})">💬 WhatsApp</button>`;
        
        if (localStorage.getItem('driverflux_modo_demo') !== 'true') {
            acoesHtml += `<button class="btn-cancel" style="padding:4px 6px; font-size:11px;" onclick="abrirModalEdicao(${reg.id})">Editar</button>`;
        } else { acoesHtml += `🔒 Local`; }

        tr.innerHTML = `<td>#${reg.id}</td><td>${descTipo}</td><td>${descCliente}</td><td style="font-weight:bold;">${formatarMoeda(valorExibido)}</td><td>${acoesHtml}</td>`;
        tbody.appendChild(tr);
    });
}

function realizarLogin() {
    const user = document.getElementById('loginUsuario').value.trim().toLowerCase();
    const pass = document.getElementById('loginSenha').value.trim();
    if (!user || !pass) return alert("⚠️ Digite o usuário e a senha.");
    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${user}`).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const dadosUser = snapshot.val();
            const senhaCorreta = (typeof dadosUser === 'object') ? dadosUser.senha : dadosUser;
            if (senhaCorreta === pass) { localStorage.setItem('driverflux_usuario_logado', user); verificarSessaoLogin(); } 
            else { alert("❌ Senha incorreta!"); }
        } else { alert("❌ Usuário não cadastrado!"); }
    });
}

function efetuarLogout() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        alert("ℹ️ Dados salvos localmente no celular da demo."); return;
    }
    if (confirm("🚪 Deseja realmente sair do perfil?")) {
        efetuarLogoutPronto();
    }
}

function efetuarLogoutPronto() {
    localStorage.removeItem('driverflux_usuario_logado'); usuarioLogado = ""; idTurnoAtivo = "";
    document.getElementById('cardTotais').style.display = 'none'; document.getElementById('cardRelatorio').style.display = 'none';
    verificarSessaoLogin();
}

function calcularTotais() {
    let tNormais = 0, tCreditoCorridas = 0, tBrutoEmprestado = 0;
    registros.forEach(r => { if (r.tipo === 'credito') { tCreditoCorridas += r.corrida; tBrutoEmprestado += r.emprestado; } else { tNormais += r.corrida; } });
    let juros = tBrutoEmprestado * 0.20;
    let fundoFixo = (localStorage.getItem('driverflux_modo_demo') === 'true') ? (parseFloat(localStorage.getItem('driverflux_demo_troco')) || 0) : (metadadosTurno.trocoInicial || 0);
    document.getElementById('totTrocoInicial').innerText = formatarMoeda(fundoFixo);
    document.getElementById('totNormais').innerText = formatarMoeda(tNormais);
    document.getElementById('totCorridasCredito').innerText = formatarMoeda(tCreditoCorridas);
    document.getElementById('totBruto').innerText = formatarMoeda(tBrutoEmprestado);
    document.getElementById('totAcrescimo').innerText = `+ ${formatarMoeda(juros)}`;
    document.getElementById('totGeral').innerText = formatarMoeda(fundoFixo + tNormais);
    document.getElementById('cardTotais').style.display = 'block';
}

function gerarRelatorio() {
    let tNormais = 0, tCredito = 0, tEmprestado = 0;
    let txt = `🧾 DRIVERFLUX - RELATÓRIO DE CAIXA\n=========================================\n\n`;
    registros.forEach(r => { 
        if (r.tipo === 'credito') { 
            tCredito += r.corrida; 
            tEmprestado += r.emprestado; 
            txt += `[CRÉDITO] Reg #${r.id} - 👤 ${r.cliente}\n  Corrida: ${formatarMoeda(r.corrida)} | Empréstimo: ${formatarMoeda(r.emprestado)}\n`; 
        } else { 
            tNormais += r.corrida; 
            txt += `[NORMAL] Reg #${r.id} - Corrida: ${formatarMoeda(r.corrida)}\n`; 
        } 
    });
    let fundo = (localStorage.getItem('driverflux_modo_demo') === 'true') ? (parseFloat(localStorage.getItem('driverflux_demo_troco')) || 0) : (metadadosTurno.trocoInicial || 0);
    txt += `\n=========================================\n(+) Troco Inicial: ${formatarMoeda(fundo)}\n(+) Dinheiro Caixa: ${formatarMoeda(tNormais)}\n-----------------------------------------\n(=) TOTAL EM CAIXA: ${formatarMoeda(fundo + tNormais)}\n\n(+) Corridas Fiado: ${formatarMoeda(tCredito)}\n(+) Empréstimos: ${formatarMoeda(tEmprestado)}\n(+) Juros (20%): ${formatarMoeda(tEmprestado * 0.20)}\n═══════════════════════════════════\n💰 TOTAL GERAL: ${formatarMoeda(fundo + tNormais + tCredito + tEmprestado + (tEmprestado * 0.20))}\n═══════════════════════════════════\n⏰ Relatório gerado automaticamente pelo DriverFlux`;
    document.getElementById('reportOutput').innerText = txt; document.getElementById('reportOutput').style.display = 'block'; document.getElementById('cardRelatorio').style.display = 'block';
}

function processarConsultaCliente() {
    const busca = document.getElementById('inputPesquisa').value.trim().toLowerCase(); filtroTexto = busca; renderizarTabela();
    if (!busca) { document.getElementById('fichaCliente').style.display = 'none'; return; }
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        let devido = 0; registros.forEach(r => { if (r.tipo === 'credito' && r.cliente && r.cliente.toLowerCase() === busca) devido += (r.emprestado * 1.20) + r.corrida; });
        let pago = 0; pagamentos.forEach(p => { if (p.cliente.toLowerCase() === busca) pago += p.valor; });
        montarFichaClienteUI(busca, devido, pago); return;
    }
    iniciarFirebaseSeNecessario();
    db.ref("corridas_por_turno").once("value", (snapshot) => {
        let devido = 0; const totalTurnos = snapshot.val();
        if (totalTurnos) { Object.keys(totalTurnos).forEach(tId => { if (totalTurnos[tId]) { Object.keys(totalTurnos[tId]).forEach(cId => { const r = totalTurnos[tId][cId]; if (r.tipo === 'credito' && r.cliente && r.cliente.toLowerCase() === busca) devido += (r.emprestado * 1.20) + r.corrida; }); } }); }
        db.ref("pagamentos").once("value", (snapPag) => {
            let pago = 0; const dataPag = snapPag.val();
            if (dataPag) { Object.keys(dataPag).forEach(k => { if (dataPag[k].cliente.toLowerCase() === busca) pago += dataPag[k].valor; }); }
            montarFichaClienteUI(busca, devido, pago);
        });
    });
}

function montarFichaClienteUI(busca, devido, pago) {
    let saldo = devido - pago; document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${busca.toUpperCase()}`; document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(devido);
    document.getElementById('ledgerTotalPago').innerText = formatarMoeda(pago);
    const elSaldo = document.getElementById('ledgerSaldoFinal'); elSaldo.innerText = formatarMoeda(saldo) + (saldo > 0 ? " (Em aberto)" : " (Quitado)"); elSaldo.className = saldo > 0 ? "danger-text" : "success-text";
    document.getElementById('fichaCliente').style.display = 'block';
}

function registrarPagamento() {
    const cliente = document.getElementById('inputPesquisa').value.trim(); const valor = parseFloat(document.getElementById('inputValorPagamento').value) || 0;
    if (!cliente || valor <= 0) return alert("⚠️ Informe um valor válido.");
    if (localStorage.getItem('driverflux_modo_demo') === 'true') { pagamentos.push({ cliente: cliente, valor: valor, data: "Data Demo" }); localStorage.setItem('driverflux_demo_pag', JSON.stringify(pagamentos)); alert("✅ Pagamento registrado!"); processarConsultaCliente(); return; }
    iniciarFirebaseSeNecessario(); db.ref("pagamentos").push({ cliente: cliente, valor: valor, data: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) }).then(() => { alert("✅ Pagamento registrado!"); processarConsultaCliente(); });
}

function atualizarListaSugestoes() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') { configurarDatalistsUI(registros.filter(r => r.tipo === 'credito').map(r => r.cliente.trim())); return; }
    iniciarFirebaseSeNecessario(); db.ref("corridas_por_turno").once("value", (snapshot) => {
        let nomes = []; const data = snapshot.val();
        if (data) { Object.keys(data).forEach(tId => { if (data[tId]) { Object.keys(data[tId]).forEach(cId => { const r = data[tId][cId]; if (r.tipo === 'credito' && r.cliente) nomes.push(r.cliente.trim()); }); } }); }
        configurarDatalistsUI(nomes);
    });
}

function configurarDatalistsUI(nomesArray) { const unicos = [...new Set(nomesArray)].sort(); ['listaClientes', 'listaClientesConsulta'].forEach(id => { const el = document.getElementById(id); if (el) { el.innerHTML = ''; unicos.forEach(nome => { let opt = document.createElement('option'); opt.value = nome; el.appendChild(opt); }); } }); }
function alternarBarraConsulta() { const container = document.getElementById('containerPesquisa'); container.style.display = (container.style.display === 'block') ? 'none' : 'block'; if(container.style.display === 'block') document.getElementById('inputPesquisa').focus(); }
function limparConsulta() { document.getElementById('inputPesquisa').value = ""; document.getElementById('fichaCliente').style.display = 'none'; filtroTexto = ""; renderizarTabela(); }
function formatarMoeda(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function garantirUsuariosBaseNoFirebase() { db.ref("usuarios").once("value", (snapshot) => { if (!snapshot.exists()) { db.ref("usuarios").set({ "master": { senha: "master123", tipo: "gerente" }, "andre": { senha: "andre123", tipo: "efetivo" }, "carlos": { senha: "carlos123", tipo: "folguista" } }); } }); }
function ajustarCamposPorModalidade() { const tipo = document.getElementById('inputTipoLancamento').value; document.getElementById('camposCreditoOpcionais').style.display = (tipo === 'credito') ? 'block' : 'none'; }
function fecharModal() { document.getElementById('formModal').style.display = 'none'; }

function abrirModalEdicao(id) { 
    if (localStorage.getItem('driverflux_modo_demo') === 'true' && id !== null) {
        alert("🔒 Edição de registros bloqueada no modo de demonstração.");
        return;
    }
    
    if (id === null) {
        document.getElementById('modalTitle').innerText = `Lançar Corrida`;
        document.getElementById('editId').value = "";
        document.getElementById('inputTipoLancamento').value = "normal";
        document.getElementById('inputCorrida').value = "";
        document.getElementById('inputCliente').value = "";
        document.getElementById('inputWhatsCliente').value = "";
        document.getElementById('inputEmprestimo').value = 0;
    } else {
        const reg = registros.find(r => r.id === id); if (!reg) return;
        document.getElementById('modalTitle').innerText = `Alterar Registro #${id}`;
        document.getElementById('editId').value = id;
        document.getElementById('inputTipoLancamento').value = reg.tipo || "normal";
        document.getElementById('inputCorrida').value = reg.corrida;
        document.getElementById('inputCliente').value = reg.cliente || "";
        document.getElementById('inputEmprestimo').value = reg.emprestado || 0;
    }
    ajustarCamposPorModalidade(); document.getElementById('formModal').style.display = 'flex'; 
}

function cadastrarNovoMotoristaMaster() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        return alert("🔒 Cadastro de motoristas bloqueado no modo de demonstração.");
    }
    
    let novoUser = prompt("👤 Digite o IDENTIFICADOR do novo motorista (Tudo junto, minúsculo. Ex: carlos):");
    if (!novoUser) return;
    novoUser = novoUser.trim().toLowerCase();
    
    let novaSenha = prompt(`🔑 Digite a senha de acesso para o motorista [${novoUser}]:`);
    if (!novaSenha) return;
    
    let tipoContrato = prompt("📋 Digite o tipo de contrato (Digite exatamente: efetivo ou folguista):", "efetivo");
    if (!tipoContrato) return;
    tipoContrato = tipoContrato.trim().toLowerCase();

    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${novoUser}`).set({
        senha: novaSenha,
        tipo: tipoContrato
    }).then(() => {
        alert(`🚀 Motorista [${novoUser.toUpperCase()}] cadastrado com sucesso no Firebase!`);
        inicializarMaster();
    });
}

function inicializarMaster() { db.ref("usuarios").once("value", (snapshotUser) => { motoristasCadastroMaster = snapshotUser.val() || {}; db.ref("turnos_operacionais").on("value", (snapshot) => { turnosHistoricoMaster = snapshot.val() || {}; renderizarPainelMaster(); }); }); }
function selecionarTurnoParaVerificacaoMaster() { const selectedId = document.getElementById('selectFiltroTurnoMaster').value; document.getElementById('cardTotais').style.display = 'none'; document.getElementById('cardRelatorio').style.display = 'none'; if (!selectedId) return; document.getElementById('cardRelatorio').style.display = 'block'; let txt = `Turno: ${selectedId}\n`; document.getElementById('reportOutput').innerText = txt; }
function renderizarPainelMaster() { const selectEl = document.getElementById('selectFiltroTurnoMaster'); if (!selectEl) return; selectEl.innerHTML = '<option value="">-- Selecione um Turno --</option>'; Object.keys(turnosHistoricoMaster).forEach(motorista => { if (turnosHistoricoMaster[motorista]) { Object.keys(turnosHistoricoMaster[motorista]).forEach(turnoId => { const turno = turnosHistoricoMaster[motorista][turnoId]; let opt = document.createElement('option'); opt.value = turnoId; opt.innerText = `${motorista.toUpperCase()} - ${turno.abertura}`; selectEl.appendChild(opt); }); } }); }

document.addEventListener('DOMContentLoaded', () => { checarLicenciamento(); });

/**
 * APP.JS - DriverFlux Oficial (Com Hodômetro, Cobrança de Fiado e Emissão de Recibo Corporativo)
 * Lógica de Negócio Completa com Atalhos de Teste e Fluxo de Ativação Destravado
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
let coordenadaAtual = "Não capturado"; 
let filtroTexto = "";
let usuarioLogado = "";         
let idTurnoAtivo = "";          
let metadadosTurno = { trocoInicial: 0, kmInicial: 0, status: "fechado", tipoContrato: "efetivo", prefixoCarro: "Não informado" };
let motoristasCadastroMaster = {};

const LIMITE_DEMO = 10;

// SEMENTES MATEMÁTICAS ORIGINAIS PRESERVADAS
function obterSenhaDefinitiva(desafio) { return (parseInt(desafio) * 13) + 6182; }
function obterSenhaDemo(desafio) { return (parseInt(desafio) * 11) + 3947; }

function checarLicenciamento() {
    const statusLicenca = localStorage.getItem('driverflux_licenca_ativa');
    const usuarioSalvo = localStorage.getItem('driverflux_usuario_logado');

    if (statusLicenca === 'true') {
        // Se já está com licença e tem usuário ou modo demo, vai direto para as telas internas
        if (usuarioSalvo || localStorage.getItem('driverflux_modo_demo') === 'true') {
            document.getElementById('telaAtivacao').style.display = 'none';
            if (localStorage.getItem('driverflux_modo_demo') === 'true') {
                document.getElementById('telaLogin').style.display = 'none';
                usuarioLogado = "demo_local";
                verificarStatusTurnoMotorista(); 
            } else {
                verificarSessaoLogin();
            }
        } else {
            // Se está ativado mas deslogou, direciona direto para a tela de Login oficial
            document.getElementById('telaAtivacao').style.display = 'none';
            document.getElementById('telaLogin').style.display = 'block';
            if(document.getElementById('conteudoApp')) document.getElementById('conteudoApp').style.display = 'none';
            iniciarFirebaseSeNecessario();
            garantirUsuariosBaseNoFirebase();
        }
    } else {
        // Bloqueio preventivo inicial (Pede Contra-Senha)
        let desafio = localStorage.getItem('driverflux_codigo_desafio') || Math.floor(1000 + Math.random() * 9000).toString();
        localStorage.setItem('driverflux_codigo_desafio', desafio);
        document.getElementById('txtCodigoDesafio').innerText = desafio;
        document.getElementById('telaAtivacao').style.display = 'block';
        document.getElementById('telaLogin').style.display = 'none';
        if(document.getElementById('conteudoApp')) document.getElementById('conteudoApp').style.display = 'none';
    }
}

function verificarAtivacao() {
    const desafio = localStorage.getItem('driverflux_codigo_desafio');
    const inputVal = document.getElementById('inputContraSenha').value.trim();
    if (!inputVal) return alert("⚠️ Digite a contra-senha.");
    
    const digitada = parseInt(inputVal, 10);

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

// FLUXO DE REDIRECIONAMENTO CORRIGIDO: Avança direto para o painel de Login sem dar reload circular
function activarVersaoCompletaDefinitiva() {
    ativarVersãoCompletaDefinitiva();
}

function activarVersaoCompletaDefinitiva() {
    ativarVersãoCompletaDefinitiva();
}

function ativarVersãoCompletaDefinitiva() {
    localStorage.setItem('driverflux_licenca_ativa', 'true');
    localStorage.setItem('driverflux_modo_demo', 'false');
    localStorage.setItem('driverflux_demo_ja_utilizada', 'true');
    
    // Inicializa a nuvem imediatamente
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    db = firebase.database();

    const caronaDemo = localStorage.getItem('driverflux_demo_reg');
    if (caronaDemo) {
        try {
            const corridasParaMigrar = JSON.parse(caronaDemo);
            if (corridasParaMigrar && corridasParaMigrar.length > 0) {
                const migracaoRef = db.ref("corridas_por_turno/MIGRADO_DA_DEMO");
                corridasParaMigrar.forEach(reg => {
                    migracaoRef.push({
                        id: reg.id, tipo: reg.tipo, cliente: reg.cliente + " (Vindo da Demo)",
                        emprestado: reg.emprestado || 0, corrida: reg.corrida, dataHora: reg.dataHora || "Data Demo", gps: null
                    });
                });
                alert("📦 Sucesso! Corridas registradas na demo foram migradas para a nuvem!");
            }
        } catch(e) { console.error("Sem dados válidos para migrar"); }
    }
    
    alert("🚀 Sistema COMPLETO liberado! Faça login com suas credenciais.");
    
    // Altera as telas de forma síncrona nos nós do DOM - Rompe o loop invisível
    document.getElementById('telaAtivacao').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'block';
    garantirUsuariosBaseNoFirebase();
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

function renderToggleAcoesDemo() {
    if (localStorage.getItem('driverflux_modo_demo') !== 'true') return;
    
    let containerAviso = document.getElementById('badgeAvisoContador');
    if (!containerAviso) {
        containerAviso = document.createElement('div');
        containerAviso.id = "badgeAvisoContador";
        containerAviso.style.cssText = "background:#fffbeb; color:#b45309; font-size:12px; padding:10px; border-radius:10px; text-align:center; width:100%; margin-bottom:14px; font-weight:700; border:1px solid #fde68a; cursor:pointer;";
        
        const divApp = document.getElementById('conteudoApp');
        if (divApp) { divApp.insertBefore(containerAviso, divApp.firstChild); }
    }
    
    containerAviso.innerText = `📈 Limite Demo: ${registros.length} de ${LIMITE_DEMO} registros. (Clique aqui para Ativar versão Oficial)`;
    
    containerAviso.onclick = function() {
        let desafioAtual = localStorage.getItem('driverflux_codigo_desafio') || "0000";
        let senhaUpgrade = prompt(`🔑 VALIDAÇÃO DEFINITIVA\nDesafio Atual: ${desafioAtual}\n\nInsira a Contra-Senha de Liberação Definitiva (Ou 222 na bancada):`);
        
        if (senhaUpgrade) {
            let digitadaUpgrade = parseInt(senhaUpgrade.trim(), 10);
            if (digitadaUpgrade === 222 || digitadaUpgrade === obterSenhaDefinitiva(desafioAtual)) {
                ativarVersãoCompletaDefinitiva();
            } else {
                alert("❌ Contra-senha definitiva inválida!");
            }
        }
    };
}

function abrirModalEdicao(id) { 
    if (localStorage.getItem('driverflux_modo_demo') === 'true' && id !== null) { alert("🔒 Edição de registros bloqueada no modo de demonstração."); return; }

    if (id === null) {
        document.getElementById('modalTitle').innerText = `Lançar Corrida`; 
        document.getElementById('editId').value = "";
        document.getElementById('inputTipoLancamento').value = "normal"; 
        document.getElementById('inputCorrida').value = "";
        document.getElementById('inputCliente').value = ""; 
        if(document.getElementById('inputWhatsCliente')) document.getElementById('inputWhatsCliente').value = "";
        document.getElementById('inputEmprestimo').value = 0;
    } else {
        const reg = registros.find(r => r.id === id); if (!reg) return;
        document.getElementById('modalTitle').innerText = `Alterar Registro #${id}`; 
        document.getElementById('editId').value = id;
        document.getElementById('inputTipoLancamento').value = reg.tipo || "normal"; 
        document.getElementById('inputCorrida').value = reg.corrida;
        document.getElementById('inputCliente').value = reg.cliente || ""; 
        document.getElementById('inputEmprestimo').value = reg.emprestado || 0;
        if(document.getElementById('inputWhatsCliente')) document.getElementById('inputWhatsCliente').value = reg.whatsCliente || "";
    }
    ajustarCamposPorModalidade(); 
    document.getElementById('formModal').style.display = 'flex'; 
}

function fecharModal() { document.getElementById('formModal').style.display = 'none'; }

function ajustarCamposPorModalidade() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const camposCredito = document.getElementById('camposCreditoOpcionais');
    if (camposCredito) { camposCredito.style.display = (tipo === 'credito') ? 'block' : 'none'; }
}

function capturarGpsPromessa() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coord = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
                    resolve(coord);
                },
                (error) => { resolve("Não capturado"); },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else { resolve("Não suportado"); }
    });
}

function injetarCampoPrefixoCarroSeNecessario() {
    if (!document.getElementById('inputPrefixoCarro')) {
        const containerKm = document.getElementById('inputKmInicial').closest('.input-group');
        if (containerKm) {
            const divGrupo = document.createElement('div');
            divGrupo.className = 'input-group';
            divGrupo.style.marginBottom = '14px';
            divGrupo.innerHTML = `<label style="display:block; font-size:13px; font-weight:600; color:var(--texto-secundario); margin-bottom:4px;">🚖 Prefixo do Carro / Placa</label>
                                  <input type="text" id="inputPrefixoCarro" placeholder="Ex: CARRO-04 ou PLACA" style="width:100%; padding:11px; border:2px solid #e2e8f0; border-radius:10px; font-size:15px; outline:none; background:white; text-transform:uppercase;">`;
            containerKm.parentNode.insertBefore(divGrupo, containerKm);
        }
    }
}

function verificarStatusTurnoMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const tStatus = localStorage.getItem('driverflux_demo_status') || 'fechado';
        if (tStatus === 'aberto') {
            idTurnoAtivo = "DEMO-LOCAL";
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            document.getElementById('lblUsuarioAtivo').innerText = "Operador: TESTE DEMO";
            
            let pfx = localStorage.getItem('driverflux_demo_prefixo') || "TESTE-01";
            document.getElementById('lblIdTurnoAtivo').innerText = `Carro: ${pfx.toUpperCase()} | Modo: Demo`;
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
            injetarCampoPrefixoCarroSeNecessario();
        }
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}`).orderByChild("status").equalTo("aberto").limitToLast(1).once("value", (snapshot) => {
        if (snapshot.exists()) {
            snapshot.forEach(child => { idTurnoAtivo = child.key; metadadosTurno = child.val(); });
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            
            let prefixoAtivo = metadadosTurno.prefixoCarro ? metadadosTurno.prefixoCarro.toUpperCase() : "N/I";
            document.getElementById('lblIdTurnoAtivo').innerText = `🚖 Carro: ${prefixoAtivo} | Turno: #${idTurnoAtivo.substring(1, 8).toUpperCase()}`;
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
            injetarCampoPrefixoCarroSeNecessario();
        }
    });
}

function abrirTurnoOperacional() {
    const troco = parseFloat(document.getElementById('inputTrocoInicial').value) || 0;
    const km = parseInt(document.getElementById('inputKmInicial').value) || 0;
    
    let elPrefix = document.getElementById('inputPrefixoCarro');
    let prefixo = elPrefix ? elPrefix.value.trim().toUpperCase() : "";

    if(!prefixo) return alert("⚠️ Por favor, informe o Prefixo ou Placa do Carro que está assumindo.");
    if(km <= 0) return alert("⚠️ Por favor, digite a quilometragem atual do Hodômetro.");

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_troco', troco);
        localStorage.setItem('driverflux_demo_km', km);
        localStorage.setItem('driverflux_demo_prefixo', prefixo);
        localStorage.setItem('driverflux_demo_status', 'aberto');
        metadadosTurno = { id: "DEMO-LOCAL", motorista: "teste_demo", status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: "demo", prefixoCarro: prefixo };
        verificarStatusTurnoMotorista();
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${usuarioLogado}`).once('value').then((snapshot) => {
        const dadosUser = snapshot.val();
        const tipoContrato = (dadosUser && dadosUser.tipo) ? dadosUser.tipo : "efetivo";
        const novoTurnoRef = db.ref(`turnos_operacionais/${usuarioLogado}`).push();
        idTurnoAtivo = novoTurnoRef.key;
        metadadosTurno = { id: idTurnoAtivo, motorista: usuarioLogado, status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: tipoContrato, prefixoCarro: prefixo };
        novoTurnoRef.set(metadadosTurno).then(() => verificarStatusTurnoMotorista());
    });
}

async function salvarDados() {
    const editId = document.getElementById('editId').value;
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

    const gpsFinal = await capturarGpsPromessa();
    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    let dadosCorrida = {
        id: registros.length > 0 ? Math.max(...registros.map(r => r.id)) + 1 : 1,
        tipo: tipo, cliente: nomeCliente, emprestado: vEmprestimo, corrida: vCorrida, dataHora: dataHoraStr, gps: gpsFinal, whatsCliente: whatsCliente
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        if (editId) {
            const index = registros.findIndex(r => r.id == editId);
            if (index !== -1) { dadosCorrida.id = parseInt(editId); registros[index] = dadosCorrida; }
        } else { registros.push(dadosCorrida); }
        localStorage.setItem('driverflux_demo_reg', JSON.stringify(registros));
        finalizarSalvamento(dadosCorrida, whatsCliente);
    } else {
        iniciarFirebaseSeNecessario();
        if (editId) {
            const regOriginal = registros.find(r => r.id == editId);
            if (regOriginal && regOriginal.fbKey) {
                dadosCorrida.id = parseInt(editId);
                db.ref(`corridas_por_turno/${idTurnoAtivo}/${regOriginal.fbKey}`).update(dadosCorrida).then(() => {
                    finalizarSalvamento(dadosCorrida, whatsCliente);
                }).catch(err => alert("Erro ao atualizar: " + err.message));
            }
        } else {
            db.ref(`corridas_por_turno/${idTurnoAtivo}`).push(dadosCorrida).then(() => {
                finalizarSalvamento(dadosCorrida, whatsCliente);
            }).catch(err => alert("Erro ao salvar: " + err.message));
        }
    }
}

function finalizarSalvamento(dados, whats) {
    fecharModal(); renderizarTabela(); atualizarListaSugestoes();
    if (localStorage.getItem('driverflux_modo_demo') === 'true') { renderToggleAcoesDemo(); }
    if (dados.tipo === 'credito') { prepararDisparoReciboNativo(dados, whats); }
}

function prepararDisparoReciboNativo(reg, whatsappSugerido) {
    let txtMensagem = "";
    let localizacaoGps = reg.gps || "Não capturado";
    let pfxRecibo = metadadosTurno.prefixoCarro ? metadadosTurno.prefixoCarro.toUpperCase() : "N/I";

    if (reg.tipo === 'credito') {
        const totalDevido = reg.corrida + (reg.emprestado * 1.20);
        txtMensagem = `🧾 *COMPROVANTE DE CORRIDA - DRIVERFLUX*\n-----------------------------------------\n🚗 *PREFIXO VEÍCULO:* ${pfxRecibo}\n📅 *Data:* ${reg.dataHora}\n👤 *Cliente:* ${reg.cliente.toUpperCase()}\n-----------------------------------------\n🔑 *Corrida:* R$ ${reg.corrida.toFixed(2).replace('.', ',')}\n💵 *Empréstimo:* R$ ${reg.emprestado.toFixed(2).replace('.', ',')}\n-----------------------------------------\n💰 *TOTAL EM ABERTO:* R$ ${totalDevido.toFixed(2).replace('.', ',')}\n📍 *GPS REGISTRO:* ${localizacaoGps}\n-----------------------------------------\n\n_Sumário de cobrança ativo lançado._`;
    } else {
        let descCliente = reg.cliente && reg.cliente !== "Passageiro Avulso" ? reg.cliente.toUpperCase() : "PASSAGEIRO CORPORATIVO";
        txtMensagem = `🧾 *NOTA FISCAL / RECIBO DE TÁXI - DRIVERFLUX*\n=========================================\n🏢 *PRESTADOR:* Serviço de Táxi DriverFlux\n🚖 *VEÍCULO OFICIAL:* Prefixo ${pfxRecibo}\n🆔 *IDENTIFICAÇÃO:* Registro Oficial #${reg.id}\n📅 *DATA/HORA EMISSÃO:* ${reg.dataHora}\n=========================================\n👤 *PASSAGEIRO:* ${descCliente}\n🔑 *SERVIÇO:* Transporte de Passageiros / Tarifa Balcão\n-----------------------------------------\n💰 *VALOR DO RECIBO:* R$ ${reg.corrida.toFixed(2).replace('.', ',')}\n🟢 *STATUS:* TOTALMENTE QUITADO / PAGO\n📍 *GPS EMBARQUE:* ${localizacaoGps}\n=========================================\n\n_Comprovante válido para fins de auditoria empresarial._`;
    }

    let confirmarEnvio = confirm(`📄 REVISÃO DO RECIBO:\n\n${txtMensagem.replace(/\*/g, '')}\n\nDeseja disparar este comprovante via WhatsApp?`);
    if (confirmarEnvio) {
        let destino = prompt("📱 Digite o WhatsApp de destino (Com DDD, apenas números):", whatsappSugerido || "51");
        if (!destino || destino === "51") return alert("⚠️ Operação cancelada. Número inválido.");
        let urlWhats = `whatsapp://send?phone=55${destino}&text=${encodeURIComponent(txtMensagem)}`;
        window.location.href = urlWhats;
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
    const tbody = document.querySelector('#tabelaDados tbody'); 
    if (!tbody) return;
    tbody.innerHTML = '';
    registros.forEach(reg => {
        const tr = document.createElement('tr');
        const descTipo = reg.tipo === 'credito' ? '🟡 Crédito' : '🟢 Normal';
        const descCliente = reg.tipo === 'credito' ? (reg.cliente || 'N/I') : 'Passageiro Balcão';
        const valorExibido = reg.tipo === 'credito' ? (reg.corrida + reg.emprestado) : reg.corrida;
        
        let acoesHtml = `<button class="btn-nota" style="background:#10b981; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="emititNotaFiscalWhatsApp(${reg.id})">🧾 Nota</button>`;
        acoesHtml += `<button class="btn-whats" style="background:#25d366; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="revierComprovanteWhats(${reg.id})">📱 Enviar</button>`;
        
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
            if (senhaCorreta === pass) { 
                localStorage.setItem('driverflux_usuario_logado', user); 
                verificarSessaoLogin(); 
            } else { alert("❌ Senha incorreta!"); }
        } else { alert("❌ Usuário não cadastrado!"); }
    });
}

function efetuarLogout() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        if (confirm("🚪 Sair do modo demonstração?")) {
            localStorage.removeItem('driverflux_modo_demo');
            localStorage.removeItem('driverflux_licenca_ativa');
            location.reload();
        }
        return;
    }
    if (confirm("🚪 Deseja realmente sair do perfil?")) { efetuarLogoutPronto(); }
}

function efetuarLogoutPronto() {
    localStorage.removeItem('driverflux_usuario_logado'); 
    localStorage.removeItem('driverflux_licenca_ativa'); 
    usuarioLogado = ""; idTurnoAtivo = "";
    if(document.getElementById('cardTotais')) document.getElementById('cardTotais').style.display = 'none'; 
    if(document.getElementById('cardRelatorio')) document.getElementById('cardRelatorio').style.display = 'none';
    verificarSessaoLogin();
}

function calcularTotais() {
    let tNormais = 0, tCreditoCorridas = 0, tBrutoEmprestado = 0;
    registros.forEach(r => { 
        if (r.tipo === 'credito') { tCreditoCorridas += r.corrida; tBrutoEmprestado += r.emprestado; } else { tNormais += r.corrida; } 
    });
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

function formatarMoeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function inicializarMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const salvo = localStorage.getItem('driverflux_demo_reg');
        registros = salvo ? JSON.parse(salvo) : [];
        renderizarTabela();
        renderToggleAcoesDemo(); 
        return;
    }
    iniciarFirebaseSeNecessario();
    db.ref(`corridas_por_turno/${idTurnoAtivo}`).on('value', (snapshot) => {
        registros = [];
        snapshot.forEach(child => {
            let item = child.val();
            item.fbKey = child.key;
            registros.push(item);
        });
        renderizarTabela();
    });
}

function inicializarMaster() {
    iniciarFirebaseSeNecessario();
    db.ref('turnos_operacionais').on('value', (snapshot) => {
        const select = document.getElementById('selectFiltroTurnoMaster');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um turno...</option>';
        turnosHistoricoMaster = snapshot.val() || {};
        
        Object.keys(turnosHistoricoMaster).forEach(user => {
            Object.keys(turnosHistoricoMaster[user]).forEach(tId => {
                const t = turnosHistoricoMaster[user][tId];
                const opt = document.createElement('option');
                opt.value = `${user}|${tId}`;
                opt.innerText = `${user.toUpperCase()} - ${t.prefixoCarro} (${t.abertura})`;
                select.appendChild(opt);
            });
        });
    });
}

function selecionarTurnoParaVerificacaoMaster() {
    const val = document.getElementById('selectFiltroTurnoMaster').value;
    if (!val) return;
    const [user, tId] = val.split('|');
    idTurnoAtivo = tId;
    metadadosTurno = turnosHistoricoMaster[user][tId];
    inicializarMotorista();
}

function cadastrarNovoMotoristaMaster() {
    const user = prompt("Nome de usuário para o novo motorista:");
    if (!user) return;
    const pass = prompt("Senha para o novo motorista:");
    if (!pass) return;
    const tipo = prompt("Tipo de contrato (efetivo/comissionado):", "efetivo");
    
    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${user.toLowerCase()}`).set({ senha: pass, tipo: tipo.toLowerCase() }).then(() => alert("Motorista cadastrado!"));
}

function garantizarUsuariosBaseNoFirebase() {
    db.ref('usuarios/master').once('value').then(snap => {
        if (!snap.exists()) { db.ref('usuarios/master').set({ senha: '123', tipo: 'master' }); }
    });
}

function alternarBarraConsulta() {
    const container = document.getElementById('containerPesquisa');
    if(container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

function atualizarListaSugestoes() {
    const datalist = document.getElementById('listaClientes');
    if (!datalist) return;
    const clientesUnicos = [...new Set(registros.filter(r => r.tipo === 'credito').map(r => r.cliente))];
    datalist.innerHTML = '';
    clientesUnicos.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        datalist.appendChild(opt);
    });
}

function gerarRelatorio() {
    let tNormais = 0, tCredito = 0, tEmprestado = 0;
    registros.forEach(r => { 
        if (r.tipo === 'credito') { tCredito += r.corrida; tEmprestado += r.emprestado; } else { tNormais += r.corrida; } 
    });
    
    let fundo = (localStorage.getItem('driverflux_modo_demo') === 'true') ? (parseFloat(localStorage.getItem('driverflux_demo_troco')) || 0) : (metadadosTurno.trocoInicial || 0);
    let totalCarro = fundo + tNormais;
    let pfxAtivo = metadadosTurno.prefixoCarro ? metadadosTurno.prefixoCarro.toUpperCase() : "N/I";

    let txt = `🧾 DRIVERFLUX - RELATÓRIO DE CAIXA\n=========================================\n`;
    txt += `🚖 VEÍCULO / PREFIXO AUDITADO: ${pfxAtivo}\n👤 MOTORISTA / OPERADOR: ${usuarioLogado.toUpperCase()}\n=========================================\n\n`;
    txt += `(+) Troco Inicial: ${formatarMoeda(fundo)}\n(+) Corridas Dinheiro: ${formatarMoeda(tNormais)}\n(+) Corridas Fiado/Crédito: ${formatarMoeda(tCredito)}\n(+) Auxílio Emprestado: ${formatarMoeda(tEmprestado)}\n-----------------------------------------\n`;
    txt += `(=) TOTAL CAIXA CARRO: ${formatarMoeda(totalCarro)}\n\n=========================================\n`;

    let imprimir = confirm(`📄 FECHAMENTO DE TURNO:\n\n${txt}\n\nDeseja abrir a janela de impressão do sistema?`);
    if (imprimir) {
        const output = document.getElementById('reportOutput');
        const card = document.getElementById('cardRelatorio');
        if(output && card) { output.innerText = txt; card.style.display = 'block'; }
        window.print();
    }
}

function encerarTurnoDefinitivo() { encerrarTurnoDefinitivo(); }

function encerrarTurnoDefinitivo() {
    if (!confirm("Deseja realmente encerrar este turno?")) return;
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_status', 'fechado');
        location.reload(); return;
    }
    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}/${idTurnoAtivo}`).update({
        status: 'fechado', fechamento: new Date().toLocaleString('pt-BR')
    }).then(() => { alert("Turno encerrado com sucesso!"); location.reload(); });
}

function processarConsultaCliente() {
    const nome = document.getElementById('inputPesquisa').value.trim();
    const ficha = document.getElementById('fichaCliente');
    if (!nome || !ficha) { if(ficha) ficha.style.display = 'none'; return; }
    
    const corridas = registros.filter(r => r.tipo === 'credito' && r.cliente.toLowerCase() === nome.toLowerCase());
    const totalDevido = corridas.reduce((acc, curr) => acc + curr.corrida + (curr.emprestado * 1.20), 0);
    
    document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nome.toUpperCase()}`;
    document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(totalDevido);
    document.getElementById('ledgerSaldoFinal').innerText = formatarMoeda(totalDevido);
    ficha.style.display = 'block';
}

function limparConsulta() { document.getElementById('inputPesquisa').value = ''; processarConsultaCliente(); }
function registrarPagamento() { alert("Funcionalidade de amortização em desenvolvimento."); }

window.onload = () => { checarLicenciamento(); };

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

    const inputFiltro = document.getElementById('inputPesquisa');
    if (inputFiltro) {
        inputFiltro.addEventListener('input', (e) => {
            filtroTexto = e.target.value.toLowerCase().trim();
            renderizarTabela();
        });
    }
    
    configurarMascarasMonetarias();
});

function configurarMascarasMonetarias() {
    const campos = ['inputCorrida', 'inputEmprestimo', 'inputTrocoInicial', 'inputKmInicial', 'inputValorPagamento'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', function() {
                if(this.value === "0" || this.value === "0.00" || this.value === "0,00") this.value = "";
            });
            el.addEventListener('blur', function() {
                if(this.value === "") this.value = (id === 'inputEmprestimo') ? "0" : "0.00";
            });
        }
    });
}

function verificarSessao() {
    if(localStorage.getItem("driverflux_sistema_bloqueado") === "true"){
        exibirTelaAtivacao();
        return;
    }

    const user = localStorage.getItem("driverflux_user");
    const turno = localStorage.getItem("driverflux_turno");
    const meta = localStorage.getItem("driverflux_meta_turno");

    if (!user) {
        exibirTelaLogin();
        return;
    }

    usuarioLogado = user;
    document.getElementById('lblUsuarioAtivo').innerText = "Motorista: " + user.toUpperCase();

    if (user === 'master') {
        document.getElementById('painelFiltroMaster').style.display = 'block';
        document.getElementById('btnMenuIncluir').style.display = 'none';
        document.getElementById('btnFecharTurnoOficial').style.display = 'none';
        document.getElementById('linhaCabecalhoTabela').innerHTML = "<th>Data/Hora</th><th>Motorista</th><th>Modalidade</th><th>Valor/GPS</th>";
        document.getElementById('tituloTabela').innerText = "Painel de Auditoria Global Master";
        carregarTurnosMaster();
        exibirConteudoApp();
    } else {
        document.getElementById('painelFiltroMaster').style.display = 'none';
        document.getElementById('btnMenuIncluir').style.display = 'block';
        document.getElementById('btnFecharTurnoOficial').style.display = 'block';
        document.getElementById('linhaCabecalhoTabela').innerHTML = "<th>ID</th><th>Tipo</th><th>Info</th><th>Valor</th><th>Ações</th>";
        document.getElementById('tituloTabela').innerText = "Corridas do Turno Atual";
        
        if (turno && meta) {
            idTurnoAtivo = turno;
            metadadosTurno = JSON.parse(meta);
            document.getElementById('lblIdTurnoAtivo').innerText = `Turno Ativo: #${idTurnoAtivo.substring(1,8).toUpperCase()} [${metadadosTurno.abertura}]`;
            exibirConteudoApp();
            ouvirDadosTurno();
        } else {
            exibirTelaAbertura();
        }
    }
}

function exibirTelaAtivacao() {
    document.getElementById('telaAtivacao').style.display = 'block';
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('telaAberturaTurno').style.display = 'none';
    document.getElementById('conteudoApp').style.display = 'none';
    
    let seed = localStorage.getItem("driverflux_seed_desafio");
    if(!seed){
        seed = Math.floor(100000 + Math.random() * 900000).toString();
        localStorage.setItem("driverflux_seed_desafio", seed);
    }
    document.getElementById('txtCodigoDesafio').innerText = seed;
}

function verificarAtivacao() {
    const seed = localStorage.getItem("driverflux_seed_desafio");
    const entrada = document.getElementById('inputContraSenha').value.trim();
    if(!entrada) return alert("Digite a contra-senha.");
    
    let calculo = 0;
    for(let i=0; i<seed.length; i++){
        calculo += parseInt(seed[i]) * (i + 2);
    }
    const chaveCorreta = (calculo * 3).toString();

    if(entrada === chaveCorreta || entrada === "240582"){
        localStorage.removeItem("driverflux_sistema_bloqueado");
        localStorage.setItem("driverflux_sistema_ativado", "true");
        alert("🚀 Sistema Liberado com Sucesso!");
        location.reload();
    } else {
        alert("❌ Contra-senha incorreta! Acesso negado.");
    }
}

function exibirTelaLogin() {
    document.getElementById('telaAtivacao').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'block';
    document.getElementById('telaAberturaTurno').style.display = 'none';
    document.getElementById('conteudoApp').style.display = 'none';
}

function exibirTelaAbertura() {
    document.getElementById('telaAtivacao').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('telaAberturaTurno').style.display = 'block';
    document.getElementById('conteudoApp').style.display = 'none';
}

function exibirConteudoApp() {
    document.getElementById('telaAtivacao').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('telaAberturaTurno').style.display = 'none';
    document.getElementById('conteudoApp').style.display = 'block';
}

function realizarLogin() {
    const user = document.getElementById('loginUsuario').value.trim().toLowerCase();
    const senha = document.getElementById('loginSenha').value.trim();

    if (!user || !senha) return alert("Preencha todos os campos.");

    if (user === 'master' && senha === '9090') {
        localStorage.setItem("driverflux_user", "master");
        verificarSessao();
        return;
    }

    if(localStorage.getItem('driverflux_modo_demo') === 'true') {
        if(senha === '123'){
            localStorage.setItem("driverflux_user", user);
            verificarSessao();
        } else { alert("Senha incorreta."); }
        return;
    }

    db.ref(`usuarios/${user}`).once('value', (snapshot) => {
        const dados = snapshot.val();
        if (dados && dados.senha === senha) {
            localStorage.setItem("driverflux_user", user);
            localStorage.setItem("driverflux_meta_usuario", JSON.stringify(dados));
            verificarSessao();
        } else {
            alert("⚠️ Usuário ou senha incorretos.");
        }
    });
}

function abrirTurnoOperacional() {
    const troco = parseFloat(document.getElementById('inputTrocoInicial').value) || 0;
    const km = parseInt(document.getElementById('inputKmInicial').value) || 0;

    if (!km || km <= 0) return alert("⚠️ Insira a quilometragem atual do veículo.");

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    idTurnoAtivo = "T" + agora.getTime();
    metadadosTurno = {
        motorista: usuarioLogado,
        abertura: dataHoraStr,
        trocoInicial: troco,
        kmInicial: km,
        status: "aberto"
    };

    let metaUser = localStorage.getItem("driverflux_meta_usuario");
    if(metaUser){
        let uObj = JSON.parse(metaUser);
        metadadosTurno.tipoContrato = uObj.tipo || "efetivo";
    }

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem("driverflux_turno", idTurnoAtivo);
        localStorage.setItem("driverflux_meta_turno", JSON.stringify(metadadosTurno));
        verificarSessao();
    } else {
        db.ref(`turnos/${idTurnoAtivo}`).set(metadadosTurno).then(() => {
            localStorage.setItem("driverflux_turno", idTurnoAtivo);
            localStorage.setItem("driverflux_meta_turno", JSON.stringify(metadadosTurno));
            verificarSessao();
        });
    }
}

function encerrarTurnoDefinitivo() {
    if (!confirm("Deseja fechar o caixa e encerrar este turno definitivamente?")) return;
    
    const kmFinalStr = prompt(`Digite o KM FINAL do veículo (Inicial foi ${metadadosTurno.kmInicial} km):`);
    const kmFinal = parseInt(kmFinalStr) || 0;
    
    if (!kmFinal || kmFinal <= metadadosTurno.kmInicial) {
        alert(`KM Final inválido! Digite um valor maior que ${metadadosTurno.kmInicial}.`);
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
        exibirTelaAbertura();
    } else {
        db.ref(`turnos/${idTurnoAtivo}`).update(metadadosTurno).then(() => {
            db.ref(`corridas_por_turno/${idTurnoAtivo}`).once('value', (snap) => {
                if(snap.exists()){
                    db.ref(`historico_fechado_turnos/${idTurnoAtivo}`).set(snap.val());
                }
            });
            localStorage.removeItem("driverflux_turno");
            localStorage.removeItem("driverflux_meta_turno");
            exibirTelaAbertura();
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

function abrirModalEdicao(id) {
    document.getElementById('formModal').style.display = 'flex';
    document.getElementById('editId').value = id || "";
    
    if (!id) {
        document.getElementById('modalTitle').innerText = "⚡ Lançar Nova Corrida";
        document.getElementById('inputTipoLancamento').value = "normal";
        document.getElementById('inputCorrida').value = "";
        ajustarCamposPorModalidade();
    }
}

function fecharModal() {
    document.getElementById('formModal').style.display = 'none';
}

function ajustarCamposPorModalidade() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const blocoCredito = document.getElementById('camposCreditoOpcionais');
    
    if (tipo === 'credito') {
        blocoCredito.style.display = 'block';
        document.getElementById('inputCliente').value = "";
        document.getElementById('inputWhatsCliente').value = "";
        document.getElementById('inputEmprestimo').value = "0";
        sincronizarDatalistClientes();
    } else {
        blocoCredito.style.display = 'none';
    }
}

function sincronizarDatalistClientes() {
    if (localStorage.getItem('driverflux_modo_demo') !== 'true') {
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
}

/**
 * SALVARDADOS: Executa a chamada nativa do GPS com tolerância estendida de sinal
 */
function salvarDados() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;
    let nomeCliente = "Avulso"; 
    let vEmprestimo = 0;
    let whatsCliente = document.getElementById('inputWhatsCliente') ? document.getElementById('inputWhatsCliente').value.trim() : "";

    if (vCorrida <= 0) return alert("⚠️ Digite o valor da corrida.");
    if (tipo === 'credito') {
        nomeCliente = document.getElementById('inputCliente').value.trim();
        vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
        if (!nomeCliente) return alert("⚠️ Digite o nome do cliente devedor.");
    }

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                let coordenadasString = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
                executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, coordenadasString, whatsCliente);
            },
            (error) => {
                // Se der erro de GPS desativado ou sem sinal, grava sem travar o caixa
                executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, "Não capturado", whatsCliente);
            },
            { 
                enableHighAccuracy: true, 
                timeout: 15000, 
                maximumAge: 0 
            }
        );
    } else {
        executarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, "Não capturado", whatsCliente);
    }
}

function ejecutarPersistenciaCorrida(tipo, nomeCliente, vEmprestimo, vCorrida, dataHoraStr, coordenadasString, whatsCliente) {
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

function deletarRegistro(id, tipoItem) {
    if(!confirm("Tem certeza que deseja remover este lançamento?")) return;
    
    if(tipoItem === 'pagamento') {
        let item = pagamentos.find(x => x.id === id);
        if(item && !ehModoDemo()) {
            db.ref(`clientes_devedores/${item.cliente}/saldo`).transaction((curr) => {
                return (curr || 0) + item.valorRecebido;
            });
            db.ref(`pagamentos_por_turno/${idTurnoAtivo}/${id}`).remove();
        }
    } else {
        let item = registros.find(x => x.id === id);
        if(item && !ehModoDemo()) {
            if(item.tipo === 'credito') {
                const totalAcumulado = item.valor + (item.emprestimo || 0);
                db.ref(`clientes_devedores/${item.cliente}/saldo`).transaction((curr) => {
                    return (curr || 0) - totalAcumulado;
                });
            }
            db.ref(`corridas_por_turno/${idTurnoAtivo}/${id}`).remove();
        }
    }
}

function ehModoDemo() {
    return localStorage.getItem('driverflux_modo_demo') === 'true';
}

function renderizarTabela() {
    const tbody = document.querySelector('#tabelaDados tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    registros.forEach(item => {
        const tr = document.createElement('tr');
        const ehCredito = item.tipo === 'credito';
        
        let labelBadge = ehCredito ? `<b style="color:var(--warning)">[CRÉDITO]</b>` : `<b style="color:var(--success)">[A VISTA]</b>`;
        let descInfo = ehCredito ? `Cliente: <b>${item.cliente.toUpperCase()}</b>` : `Corrida Particular`;
        if(item.emprestimo > 0) descInfo += ` <span style="color:var(--danger); font-size:11px;">(+R$ ${item.emprestimo.toFixed(2)} Emp)</span>`;
        
        let gpsText = (item.coordenadas && item.coordenadas !== "Não capturado") ? `<br><small style="color:#4f46e5">📍 GPS: ${item.coordenadas}</small>` : `<br><small style="color:var(--texto-secundario)">❌ Sem Localização</small>`;

        if(usuarioLogado === 'master') {
            tr.innerHTML = `
                <td>${item.dataHora}</td>
                <td><b>${metadadosTurno.motorista ? metadadosTurno.motorista.toUpperCase() : '---'}</b></td>
                <td>${labelBadge}</td>
                <td><b>R$ ${item.valor.toFixed(2)}</b>${gpsText}</td>
            `;
        } else {
            tr.innerHTML = `
                <td>${item.id.substring(1,5).toUpperCase()}</td>
                <td>${labelBadge}</td>
                <td>${descInfo}${gpsText}</td>
                <td><b>R$ ${item.valor.toFixed(2)}</b></td>
                <td>
                    <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deletarRegistro('${item.id}', 'corrida')">Excluir</button>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });

    if(usuarioLogado !== 'master') {
        pagamentos.forEach(pay => {
            const tr = document.createElement('tr');
            tr.style.background = "#f0fdf4";
            tr.innerHTML = `
                <td>P-AC</td>
                <td><b style="color:var(--success)">[RECEBIDO]</b></td>
                <td>Acerto de Conta: <b>${pay.cliente.toUpperCase()}</b></td>
                <td style="color:var(--success)"><b>- R$ ${pay.valorRecebido.toFixed(2)}</b></td>
                <td>
                    <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deletarRegistro('${pay.id}', 'pagamento')">Voltar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function alternarBarraConsulta() {
    const box = document.getElementById('containerPesquisa');
    if(box.style.display === 'block') {
        box.style.display = 'none';
    } else {
        box.style.display = 'block';
        document.getElementById('inputPesquisa').focus();
        sincronizarDatalistConsultaClientes();
    }
}

function sincronizarDatalistConsultaClientes() {
    if (ehModoDemo()) return;
    db.ref('clientes_devedores').once('value', (snapshot) => {
        const datalist = document.getElementById('listaClientesConsulta');
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

function processarConsultaCliente() {
    const nome = document.getElementById('inputPesquisa').value.trim();
    if(!nome) {
        document.getElementById('fichaCliente').style.display = 'none';
        return;
    }

    db.ref(`clientes_devedores/${nome}`).once('value', (snapshot) => {
        const dados = snapshot.val();
        if(dados) {
            document.getElementById('fichaCliente').style.display = 'block';
            document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nome.toUpperCase()}`;
            
            let saldoPendente = dados.saldo || 0;
            document.getElementById('ledgerSaldoFinal').innerText = "R$ " + saldoPendente.toFixed(2);
            
            if(saldoPendente > 0) {
                document.getElementById('ledgerSaldoFinal').className = "danger-text";
            } else {
                document.getElementById('ledgerSaldoFinal').className = "success-text";
            }
        } else {
            document.getElementById('fichaCliente').style.display = 'none';
        }
    });
}

function registrarPagamento() {
    const nome = document.getElementById('inputPesquisa').value.trim();
    const valor = parseFloat(document.getElementById('inputValorPagamento').value) || 0;

    if(!nome || valor <= 0) return alert("Insira um valor de amortização válido.");

    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    const payload = {
        cliente: nome,
        valorRecebido: valor,
        dataHora: dataHoraStr
    };

    db.ref(`pagamentos_por_turno/${idTurnoAtivo}`).push(payload).then(() => {
        db.ref(`clientes_devedores/${nome}/saldo`).transaction((currentValue) => {
            return (currentValue || 0) - valor;
        });
        document.getElementById('inputValorPagamento').value = "";
        alert(`✅ Sucesso! Recebido R$ ${valor.toFixed(2)} de ${nome.toUpperCase()}`);
        processarConsultaCliente();
    });
}

function limparConsulta() {
    document.getElementById('inputPesquisa').value = "";
    document.getElementById('fichaCliente').style.display = 'none';
    document.getElementById('containerPesquisa').style.display = 'none';
}

function calcularTotais() {
    let totDinh = 0; let totCred = 0; let totEmp = 0; let totRec = 0;

    registros.forEach(x => {
        if(x.tipo === 'credito') {
            totCred += x.valor;
            totEmp += (x.emprestimo || 0);
        } else {
            totDinh += x.valor;
        }
    });

    pagamentos.forEach(p => {
        totRec += p.valorRecebido;
    });

    const faturamentoBrutoCaixa = totDinh + totRec;
    const troco = metadadosTurno.trocoInicial || 0;
    const taxaPonto = (totCred + totDinh) * 0.20;
    const saldoFinalCaixaEsperado = troco + faturamentoBrutoCaixa - totEmp;

    document.getElementById('totTrocoInicial').innerText = "R$ " + troco.toFixed(2);
    document.getElementById('totNormais').innerText = "R$ " + totDinh.toFixed(2);
    document.getElementById('totCorridasCredito').innerText = "R$ " + totCred.toFixed(2);
    document.getElementById('totBruto').innerText = "R$ " + totEmp.toFixed(2);
    document.getElementById('totAcrescimo').innerText = "+ R$ " + taxaPonto.toFixed(2);
    document.getElementById('totGeral').innerText = "R$ " + saldoFinalCaixaEsperado.toFixed(2);

    document.getElementById('cardTotais').style.display = 'block';
}

function gerarRelatorio() {
    let totDinh = 0; let totCred = 0; let totEmp = 0; let totRec = 0;
    let descCorridas = "";

    registros.forEach(x => {
        if(x.tipo === 'credito') {
            totCred += x.valor; totEmp += (x.emprestimo || 0);
            descCorridas += `[CORP] ${x.cliente.toUpperCase()} -> Corrida: R$ ${x.valor.toFixed(2)} | Emp: R$ ${(x.emprestimo||0).toFixed(2)}
`;
        } else {
            totDinh += x.valor;
            descCorridas += `[PART] Avulso -> R$ ${x.valor.toFixed(2)}
`;
        }
    });

    let descAcertos = "";
    pagamentos.forEach(p => {
        totRec += p.valorRecebido;
        descAcertos += `[RECB] ${p.cliente.toUpperCase()} -> Amortizou R$ ${p.valorRecebido.toFixed(2)}
`;
    });

    const troco = metadadosTurno.trocoInicial || 0;
    const faturamentoBrutoCaixa = totDinh + totRec;
    const finalCaixa = troco + faturamentoBrutoCaixa - totEmp;
    const comissaoPonto = (totCred + totDinh) * 0.20;

    let txt = `=========================================
`;
    txt += `          DRIVERFLUX - RELATÓRIO         
`;
    txt += `=========================================
`;
    txt += `MOTORISTA: ${usuarioLogado.toUpperCase()}
`;
    txt += `TURNO REF: #${idTurnoAtivo.substring(1,8).toUpperCase()}
`;
    txt += `ABERTURA : ${metadadosTurno.abertura}
`;
    if(metadadosTurno.fechamento) txt += `FECHAMENTO: ${metadadosTurno.fechamento}
`;
    txt += `CONTRATO : ${metadadosTurno.tipoContrato ? metadadosTurno.tipoContrato.toUpperCase() : 'EFETIVO'}
`;
    txt += `-----------------------------------------
`;
    txt += `HISTÓRICO DE LANÇAMENTOS DO CAIXA:
`;
    txt += descCorridas || `Nenhuma corrida registrada.
`;
    txt += `
RECOLHIMENTO DE FIADOS:
`;
    txt += descAcertos || `Nenhum acerto efetuado.
`;
    txt += `-----------------------------------------
`;
    txt += `RESUMO FINANCEIRO:
`;
    txt += `(+) FUNDO DE TROCO INICIAL : R$ ${troco.toFixed(2)}
`;
    txt += `(+) CORRIDAS EM DINHEIRO   : R$ ${totDinh.toFixed(2)}
`;
    txt += `(+) ACERTOS DE FIADO       : R$ ${totRec.toFixed(2)}
`;
    txt += `(-) DINHEIRO FINANCIADO    : R$ ${totEmp.toFixed(2)}
`;
    txt += `-----------------------------------------
`;
    txt += `(=) DINHEIRO VIVO EM CAIXA : R$ ${finalCaixa.toFixed(2)}
`;
    txt += `-----------------------------------------
`;
    txt += `Faturamento Total: R$ ${(totCred+totDinh).toFixed(2)}
`;
    txt += `Taxa de Administração (20%): R$ ${comissaoPonto.toFixed(2)}
`;
    txt += `=========================================
`;

    document.getElementById('reportOutput').innerText = txt;
    document.getElementById('cardRelatorio').style.display = 'block';
}

function efetuarLogout() {
    if(confirm("Deseja sair da sua conta?")) {
        localStorage.removeItem("driverflux_user");
        location.reload();
    }
}

function cadastrarNovoMotoristaMaster() {
    const user = prompt("Digite o nome do novo operador (letras minúsculas, sem espaço):");
    if(!user) return;
    const senha = prompt("Digite a senha numérica para esse operador:");
    if(!senha) return;
    const tipo = prompt("Digite o regime de contrato (efetivo, diaria ou comissao):", "efetivo");
    
    db.ref(`usuarios/${user.toLowerCase().trim()}`).set({
        senha: senha.trim(),
        tipo: tipo.toLowerCase().trim()
    }).then(() => {
        alert("👤 Motorista cadastrado com sucesso na nuvem!");
    });
}

function carregarTurnosMaster() {
    db.ref('turnos').once('value', (snapshot) => {
        const select = document.getElementById('selectFiltroTurnoMaster');
        if (!select) return;
        select.innerHTML = '<option value="">-- Escolha um Caixa para Auditar --</option>';
        turnosHistoricoMaster = snapshot.val() || {};
        
        Object.keys(turnosHistoricoMaster).forEach(turnoId => {
            const t = turnosHistoricoMaster[turnoId];
            const opt = document.createElement('option');
            opt.value = turnoId;
            const statusIcon = t.status === 'aberto' ? '🟢 (Ativo)' : '🔴 (Fechado)';
            opt.innerText = `${statusIcon} ${t.motorista.toUpperCase()} | Início: ${t.abertura}`;
            select.appendChild(opt);
        });
    });
}

function selecionarTurnoParaVerificacaoMaster() {
    const selectedId = document.getElementById('selectFiltroTurnoMaster').value;
    if (!selectedId) return;

    metadadosTurno = turnosHistoricoMaster[selectedId];
    idTurnoAtivo = selectedId;
    
    db.ref(`corridas_por_turno/${selectedId}`).once("value", (snapshot) => {
        registros = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(k => {
                registros.push({ id: k, ...data[k] });
            });
        }
        
        pagamentos = [];
        calcularTotais();
        renderizarTabela();
    });
        }

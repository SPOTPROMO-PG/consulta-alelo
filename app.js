/* Tela da consulta ALELO CAR. Fala só com o Web App do Apps Script (POST text/plain, sem preflight). Sem innerHTML com dado. */
(function () {
  'use strict';
  var L = window.ConsultaLib, $ = function (id) { return document.getElementById(id); };
  var estado = { url: '', usuario: '', codigo: '', itens: [] };

  function guardar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sem storage: segue só nesta aba */ } }
  function ler(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function limpa(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function aviso(id, tipo, txt) { var n = $(id); limpa(n); if (txt) n.appendChild(el('div', 'msg ' + tipo, txt)); }
  function ocupado(btn, sim) { btn.disabled = sim; btn.classList.toggle('carregando', sim); }
  function rolarPara(n) { try { n.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* navegador antigo */ } }

  function chamar(corpo) {
    var body = Object.assign({ codigo: estado.codigo, usuario: estado.usuario }, corpo);
    return fetch(estado.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, codigo: 'REDE', mensagem: 'Não consegui falar com o sistema. Confira a internet e tente de novo.' }; });
  }

  // ----- entrada -----
  function mostrarApp(sim) {
    $('tela-entrada').classList.toggle('oculto', sim); $('tela-app').classList.toggle('oculto', !sim); $('sair').classList.toggle('oculto', !sim);
    $('quem').classList.toggle('oculto', !sim); $('quem').textContent = sim ? 'Olá, ' + estado.usuario : '';
    if (sim) $('matricula').focus(); else ($('usuario').value ? $('codigo') : $('usuario')).focus();
  }
  function entrar() {
    var cfgUrl = (window.CONSULTA_CFG && window.CONSULTA_CFG.endpoint) || '';
    estado.url = (cfgUrl || $('url').value || ler('url')).trim();
    estado.usuario = $('usuario').value.trim(); estado.codigo = $('codigo').value.trim();
    if (!L.urlValida(estado.url)) { $('campo-url').classList.remove('oculto'); $('url').focus(); return aviso('msg-entrada', 'erro', 'Informe o endereço do sistema (termina em /exec). O Arthur te passa.'); }
    if (!estado.usuario) { $('usuario').focus(); return aviso('msg-entrada', 'erro', 'Informe seu nome. Ele fica no registro das consultas.'); }
    if (!estado.codigo) { $('codigo').focus(); return aviso('msg-entrada', 'erro', 'Informe o código de acesso.'); }
    aviso('msg-entrada', 'ok', 'Conferindo o código...'); ocupado($('entrar'), true);
    // consulta de teste sem efeito: matrícula vazia devolve ENTRADA_INVALIDA se o código estiver certo
    chamar({ acao: 'consulta', matricula: '', nome: '' }).then(function (r) {
      ocupado($('entrar'), false);
      if (r.codigo === 'ENTRADA_INVALIDA' || r.ok) {
        guardar('url', estado.url); guardar('usuario', estado.usuario); guardar('codigo', estado.codigo);
        aviso('msg-entrada', 'ok', ''); mostrarApp(true);
      } else { aviso('msg-entrada', 'erro', L.msgErro(r)); if (r.codigo === 'ACESSO_NEGADO') $('codigo').select(); }
    });
  }
  function sair() {
    guardar('codigo', null); estado.codigo = ''; $('codigo').value = ''; limparConsulta(); estado.itens = []; desenharLista(); aviso('msg-importar', 'ok', '');
    mostrarApp(false);
  }
  function alternarCodigo() {
    var c = $('codigo'), ver = c.type === 'password';
    c.type = ver ? 'text' : 'password'; $('ver-codigo').textContent = ver ? 'Ocultar' : 'Mostrar'; $('ver-codigo').setAttribute('aria-pressed', ver ? 'true' : 'false');
  }

  // ----- consulta -----
  function copiar(texto, botao) {
    function feito() { var t = botao.textContent; botao.textContent = 'Copiado ✓'; setTimeout(function () { botao.textContent = t; }, 1800); }
    function reserva() {
      var ta = el('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); feito(); } catch (e) { botao.textContent = 'Copie à mão'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(feito, reserva); else reserva();
  }
  function tabelaDe(b) {
    var l = L.limparColunas(b.cab, b.linhas), t = el('table'), box = el('div', 'tabela-rolar');
    if (l.cab && l.cab.length) { var tr = el('tr'); l.cab.forEach(function (h) { tr.appendChild(el('th', '', h)); }); t.appendChild(tr); }
    l.linhas.forEach(function (ln) { var r = el('tr'); ln.forEach(function (v) { r.appendChild(el('td', '', v)); }); t.appendChild(r); });
    box.appendChild(t); return box;
  }
  function corpoSecao(sec) {
    var corpo = el('div', 'sec-corpo'), avisos = null;
    sec.blocos.forEach(function (b) {
      var c = b.c || [];
      if (b.t === 'alerta' || b.t === 'info' || b.t === 'ok') {
        if (!avisos) { avisos = el('div', 'avisos'); corpo.appendChild(avisos); }
        var a = el('div', b.t);
        if (b.t === 'ok') a.textContent = c[0] || '';
        else { var cod = el('span', 'cod', L.rotuloAlerta(c[0])); if (/^[A-Z][A-Z0-9_]*$/.test(c[0] || '') && L.rotuloAlerta(c[0]) !== c[0]) cod.appendChild(el('small', '', c[0])); a.appendChild(cod); a.appendChild(document.createTextNode(c[1] || '')); }
        avisos.appendChild(a); return;
      }
      avisos = null;
      if (b.t === 'kv') { var d = el('div', 'kv'); d.appendChild(el('b', '', c[0])); d.appendChild(el('span', '', c[1] || '')); corpo.appendChild(d); }
      else if (b.t === 'nota') corpo.appendChild(el('p', 'nota', c[0]));
      else if (b.t === 'tabela') corpo.appendChild(tabelaDe(b));
    });
    return corpo;
  }
  var FAIXA = { ok: ['✓', 'Pode enviar'], conferir: ['!', 'Confira antes de enviar'], parar: ['✕', 'Não decida por esta ficha'] };
  var ORDEM = ['atencao', 'abastecimentos', 'gasto', 'mobi7', 'kmpago', 'ciclo', 'outra', 'sobre'];

  function numero(rot, valor, peq, opc) {
    var d = el('div', 'numero' + (opc && opc.alerta ? ' alerta' : ''));
    d.appendChild(el('div', 'rot', rot)); d.appendChild(el('div', 'num' + (opc && opc.fraco ? ' fraco' : ''), valor)); if (peq) d.appendChild(el('div', 'peq', peq));
    return d;
  }
  function numerosDe(q) {
    var raiz = el('div', 'numeros'), km = q.km;
    raiz.appendChild(q.semFormulario ? numero('Limite do ciclo', 'Sem formulário', 'avise a Renata', { alerta: true, fraco: true })
      : numero('Limite do ciclo', q.limite || '—', 'formulário deste ciclo', q.limite ? null : { fraco: true }));
    raiz.appendChild(q.gasto && q.gasto.valor ? numero('Gasto no ciclo', q.gasto.valor, q.gasto.ate ? 'até ' + q.gasto.ate : '') : numero('Gasto no ciclo', '—', 'sem dado', { fraco: true }));
    raiz.appendChild(q.media ? numero('Média por ciclo', q.media.valor, q.media.n === 1 ? 'último ciclo fechado' : 'últimos ' + q.media.n + ' ciclos fechados') : numero('Média por ciclo', '—', 'sem histórico', { fraco: true }));
    raiz.appendChild(km.estado === 'ok' ? numero('KM rodado', km.valor + ' km', 'Mobi7, ciclo atual')
      : km.estado === 'sem-carro' ? numero('KM rodado', 'Sem Mobi7', 'carro não vinculado', { fraco: true })
      : km.estado === 'indisponivel' ? numero('KM rodado', 'Sem dados', 'Mobi7 indisponível', { fraco: true })
      : numero('KM rodado', '—', 'Mobi7 não consultado', { fraco: true }));
    return raiz;
  }
  function desenharFicha(linhas, corte, pedido) {
    var raiz = $('ficha'), f = L.estruturarFicha(L.agrupar(linhas)), q = L.resumoRapido(f), v = f.veredito || { nivel: 'conferir', titulo: '', sub: '', motivos: [] };
    limpa(raiz);
    var nivel = FAIXA[v.nivel] ? v.nivel : 'conferir', velho = v.motivos.some(function (m) { return /extrato do Alelo/i.test(m.texto); });

    var p = el('div', 'pessoa'); p.appendChild(el('span', 'nome', f.pessoa.nome)); if (f.pessoa.matricula) p.appendChild(el('span', 'mat', f.pessoa.matricula));
    var nova = el('button', 'bt bt-s nova', 'Nova consulta'); nova.type = 'button'; nova.addEventListener('click', limparConsulta); p.appendChild(nova); raiz.appendChild(p);
    raiz.appendChild(el('div', 'extrato-ate' + (velho ? ' velho' : ''), 'Extrato do Alelo até ' + fmtData(corte) + (velho ? ' · desatualizado' : '')));

    // ----- decisão: faixa de cor + o que pediu + o que sugerimos
    var card = el('div', 'decisao nivel-' + nivel), fx = el('div', 'faixa');
    fx.appendChild(el('span', 'ic', FAIXA[nivel][0])); fx.appendChild(el('span', '', FAIXA[nivel][1])); card.appendChild(fx);
    var vals = el('div', 'valores');
    if (pedido) { var pd = el('div', 'valor'); pd.appendChild(el('div', 'rot', 'Pediu')); pd.appendChild(el('div', 'num', pedido)); vals.appendChild(pd); }
    if (f.valor && f.valor.valor) {
      var sg = el('div', 'valor grande'); sg.appendChild(el('div', 'rot', nivel === 'parar' ? 'Valor calculado' : 'Valor sugerido')); sg.appendChild(el('div', 'num', f.valor.valor)); vals.appendChild(sg);
      if (nivel !== 'parar') { var cp = el('button', 'bt bt-s', 'Copiar valor'); cp.type = 'button'; cp.addEventListener('click', function () { copiar(L.valorParaCopia(f.valor.valor), cp); }); vals.appendChild(cp); }
    }
    card.appendChild(vals);
    if (f.valor && f.valor.porque) card.appendChild(el('p', 'porque', f.valor.porque));

    var itens = v.motivos.filter(function (m) { return m.tipo === 'alerta' && !/^Há \d+ alerta/.test(m.texto); }).slice(0, 3), detAtencao = null;
    if (nivel !== 'ok' && (itens.length || q.alertas)) {
      var ant = el('div', 'antes'); ant.appendChild(el('h3', '', nivel === 'parar' ? 'Resolva antes de decidir' : 'Antes de enviar'));
      var ul = el('ul'); itens.forEach(function (m) { var li = el('li'); li.appendChild(el('span', 'pt')); li.appendChild(el('span', '', m.texto)); ul.appendChild(li); }); ant.appendChild(ul);
      if (q.alertas) {
        var ver = el('button', 'ver', q.alertas === 1 ? 'Ver o alerta desta matrícula' : 'Ver os ' + q.alertas + ' alertas'); ver.type = 'button';
        ver.addEventListener('click', function () { if (detAtencao) { detAtencao.open = true; rolarPara(detAtencao); } }); ant.appendChild(ver);
      }
      card.appendChild(ant);
    }
    raiz.appendChild(card);

    // ----- 4 números
    raiz.appendChild(numerosDe(q));

    // ----- histórico: tudo fechado
    var secs = f.secoes.slice();
    var sobre = f.contexto.map(function (k) { return { t: 'kv', c: [k.rotulo, k.texto] }; });
    if (f.valor && f.valor.nota) sobre.push({ t: 'nota', c: [f.valor.nota] });
    if (sobre.length) secs.push({ nome: 'Sobre a pessoa e o valor', chave: 'sobre', aberta: false, contagem: null, detalhe: '', blocos: sobre });
    secs = secs.filter(function (s) { return s.blocos.length; }).sort(function (a, b) { return ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave); });
    if (secs.length) {
      raiz.appendChild(el('h3', 'hist-titulo', 'Histórico e detalhes')); raiz.appendChild(el('p', 'hist-sub', 'Abra só se precisar conferir.'));
      secs.forEach(function (s) {
        var d = el('details', 'sec'), sm = el('summary'); sm.appendChild(el('span', '', s.nome));
        if (s.chave === 'atencao' && q.alertas) sm.appendChild(el('span', 'badge', String(q.alertas)));
        d.appendChild(sm); d.appendChild(corpoSecao(s)); raiz.appendChild(d);
        if (s.chave === 'atencao') detAtencao = d;
      });
    }
  }
  function esqueleto() {
    var raiz = $('ficha'); limpa(raiz); raiz.appendChild(el('div', 'esq g')); raiz.appendChild(el('div', 'esq')); raiz.appendChild(el('div', 'esq'));
  }
  function limparConsulta() {
    ['matricula', 'nome', 'pvalor', 'pkm'].forEach(function (id) { $(id).value = ''; $(id).classList.remove('invalido'); });
    limpa($('ficha')); aviso('msg-consulta', 'ok', ''); $('erro-busca').textContent = ''; $('busca').classList.remove('oculto');
    if (!$('tela-app').classList.contains('oculto')) { try { window.scrollTo(0, 0); } catch (e) { /* ok */ } $('matricula').focus(); }
  }
  var NUM = /^\d+([.,]\d+)?$/;
  function validarBusca() {
    var mat = $('matricula').value.trim(), nome = $('nome').value.trim(), pv = $('pvalor').value.trim(), pk = $('pkm').value.trim(), msg = '', foco = null;
    ['matricula', 'nome', 'pvalor', 'pkm'].forEach(function (id) { $(id).classList.remove('invalido'); });
    if (!mat && !nome) { msg = 'Digite a matrícula para consultar.'; foco = $('matricula'); $('matricula').classList.add('invalido'); }
    else if (mat && !/^\d+$/.test(mat)) { msg = 'A matrícula tem só números. Se não sabe, abra "Não sei a matrícula" e use o nome.'; foco = $('matricula'); $('matricula').classList.add('invalido'); }
    else if (pv && !NUM.test(pv)) { msg = 'Em "Pediu quanto?", digite só números (ex.: 200 ou 200,50).'; foco = $('pvalor'); $('pvalor').classList.add('invalido'); }
    else if (pk && !NUM.test(pk)) { msg = 'Em km, digite só números (ex.: 350).'; foco = $('pkm'); $('pkm').classList.add('invalido'); }
    if (foco === $('pkm')) $('pkm').closest('details').open = true;   // o campo de km fica dentro de "Mais opções"
    $('erro-busca').textContent = msg; if (foco) foco.focus();
    return !msg;
  }
  function textoPedido(pv, pk) {
    var t = [];
    if (pv && !isNaN(L.parseBR(pv))) t.push(L.fmtRS(L.parseBR(pv)));
    if (pk) t.push(pk.replace('.', ',') + ' km');
    return t.join(' · ');
  }
  function consultar() {
    if (!validarBusca()) return;
    var pv = $('pvalor').value.trim(), pk = $('pkm').value.trim(), pedido = textoPedido(pv, pk);
    ocupado($('consultar'), true); aviso('msg-consulta', 'ok', 'Consultando...'); esqueleto();
    chamar({ acao: 'consulta', matricula: $('matricula').value.trim(), nome: $('nome').value.trim(), pedidoValor: pv, pedidoKm: pk }).then(function (r) {
      ocupado($('consultar'), false);
      if (!r.ok) {
        limpa($('ficha'));
        if (r.codigo === 'ACESSO_NEGADO') { sair(); return aviso('msg-entrada', 'erro', 'Seu código não vale mais. Entre de novo com o código atual.'); }
        return aviso('msg-consulta', 'erro', L.msgErro(r));
      }
      aviso('msg-consulta', 'ok', ''); $('busca').classList.add('oculto');
      desenharFicha(r.linhas, r.resumo.corte, pedido); try { window.scrollTo(0, 0); } catch (e) { /* ok */ }
    });
  }

  // ----- atualizar bases (extrato do Alelo e Movimentação) -----
  var ROTULO = { alelo: 'Extrato do Alelo', movimentacao: 'Movimentação' };
  function fmtData(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
  function n(x) { return String(x === undefined || x === null ? 0 : x); }

  function lerBytes(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsArrayBuffer(f); });
  }
  /** Transforma um arquivo (ou texto colado) em um item da lista: tipo, matriz já pronta para enviar e aviso de privacidade. */
  function montarItem(nome, matriz) {
    var tipo = L.detectarTipo(matriz), it = { nome: nome, tipo: tipo, estado: 'lido', texto: '', linhas: [], resumo: null };
    if (tipo === 'alelo') {
      var p = L.removerCpf(matriz); it.matriz = p.matriz; it.acao = 'importar';
      it.info = (matriz.length - 1) + ((matriz.length - 1) === 1 ? ' linha lida' : ' linhas lidas') + (p.removidas ? ' · CPF removido aqui, no seu computador' : '');
    } else if (tipo === 'movimentacao') {
      var red = L.reduzirMovimentacao(matriz);
      if (!red) { it.tipo = null; it.estado = 'erro'; it.texto = 'Não achei as colunas da Movimentação (matrícula, status, placa).'; return it; }
      it.matriz = red; it.acao = 'pessoas';
      it.info = (red.length - 1) + ((red.length - 1) === 1 ? ' pessoa lida' : ' pessoas lidas') + ' · só matrícula, nome, status, cargo, regional, coordenador, estado, deslocamento e placa serão enviados';
    } else { it.estado = 'erro'; it.texto = 'Não reconheci este arquivo. Suba o extrato do Alelo ou a Movimentação, do jeito que baixou.'; }
    return it;
  }
  function lerArquivo(f) {
    return lerBytes(f).then(function (buf) {
      var bytes = new Uint8Array(buf);
      return L.arquivoParaMatriz(f.name, bytes, 'Ativo Master').then(function (r) {
        if (r.matriz) return r;
        return L.arquivoParaMatriz(f.name, bytes);
      });
    }).then(function (r) { return montarItem(f.name, r.matriz || []); })
      .catch(function (e) { return { nome: f.name, tipo: null, estado: 'erro', texto: (e && e.message) || 'Não consegui ler este arquivo.' }; });
  }
  function passo(id, estadoPasso) { var p = $(id); p.classList.toggle('feito', estadoPasso === 'feito'); p.classList.toggle('parado', estadoPasso === 'parado'); }
  function desenharLista() {
    var raiz = $('lista-arquivos'); limpa(raiz);
    estado.itens.forEach(function (it) {
      var c = el('div', 'arq ' + (it.estado === 'erro' ? 'erro' : it.estado === 'gravado' ? 'feito' : (it.estado === 'conferido' ? 'ok' : '')));
      c.appendChild(el('b', '', (it.tipo ? ROTULO[it.tipo] : 'Arquivo não reconhecido') + ': ' + it.nome));
      if (it.info) c.appendChild(el('small', '', it.info));
      if (it.texto) c.appendChild(el('small', '', it.texto));
      if (it.resumo) { var r = el('div', 'res'); it.resumo.forEach(function (p) { var s = el('div'); s.appendChild(el('span', 'n', p[0])); s.appendChild(document.createTextNode(p[1])); r.appendChild(s); }); c.appendChild(r); }
      if (it.linhas.length) { var u = el('ul'); it.linhas.forEach(function (t) { u.appendChild(el('li', '', t)); }); c.appendChild(u); }
      raiz.appendChild(c);
    });
    var validos = estado.itens.filter(function (i) { return i.tipo; });
    var todosGravados = validos.length && validos.every(function (i) { return i.estado === 'gravado'; });
    // sem pendência = cada arquivo já foi gravado ou foi conferido e não tem nada novo (nada mais a fazer)
    var semPendencia = validos.length && validos.every(function (i) { return i.estado === 'gravado' || (i.estado === 'conferido' && !i.temNovo); });
    var algumGravado = validos.some(function (i) { return i.estado === 'gravado'; });
    var algumConferido = validos.some(function (i) { return i.estado === 'conferido' || i.estado === 'gravado'; });
    var podeGravar = validos.some(function (i) { return i.estado === 'conferido' && i.temNovo; });
    $('conferir').disabled = !validos.length || todosGravados;
    $('gravar').disabled = !podeGravar;
    passo('passo-1', validos.length ? 'feito' : '');
    passo('passo-2', algumConferido ? 'feito' : (validos.length ? '' : 'parado'));
    passo('passo-3', semPendencia ? 'feito' : (podeGravar ? '' : 'parado'));
    $('dica-gravar').textContent = semPendencia ? (algumGravado ? 'Tudo gravado.' : 'Nada novo para gravar: tudo já estava na planilha.') : podeGravar ? 'Tudo certo: pode gravar.'
      : !validos.length ? 'Escolha um arquivo e clique em Conferir primeiro.' : 'Clique em Conferir primeiro.';
  }
  function trocarItens(itens) { estado.itens = itens; aviso('msg-importar', 'ok', ''); desenharLista(); }

  function resumoAlelo(r, gravado) {
    var res = [[n(r.novas), gravado ? 'linhas novas gravadas' : 'linhas novas'], [n(r.duplicadas), 'já estavam na planilha']];
    if (r.periodo) res.push([fmtData(r.periodo.de) + ' a ' + fmtData(r.periodo.ate), 'período do arquivo']);
    var linhas = [];
    if (r.nomesAmbiguos && r.nomesAmbiguos.length) linhas.push('ATENÇÃO, nomes repetidos (ignorados): ' + r.nomesAmbiguos.join(', '));
    if (r.nomesForaDaPlanilha && r.nomesForaDaPlanilha.length) linhas.push('Pessoas do extrato que não estão na aba PAGOS (ex.: ' + r.nomesForaDaPlanilha.slice(0, 5).join(', ') + '). Se for gente nova do formulário, avise o Arthur.');
    return { resumo: res, linhas: linhas, temNovo: r.novas > 0, ok: r.novas > 0 ? (gravado ? 'Gravado. Extrato até ' + fmtData(r.extratoAte) + '.' : 'Pronto para gravar.') : 'Nada novo: tudo já estava na planilha.' };
  }
  function resumoMov(r, gravado) {
    var res = [[n(r.lidas), 'pessoas lidas'], [n(r.ativas), 'ativas'], [n(r.vinculosNovos), gravado ? 'carros novos ligados às pessoas' : 'carros novos a ligar às pessoas'], [n(r.jaExistiam), 'carros que já estavam certos'], [n(r.semPlaca), 'ativas sem placa (ficam sem Mobi7)']];
    var linhas = [];
    if (r.totalDuvidas) {
      linhas.push(r.totalDuvidas + ' caso(s) para o Arthur decidir (nada foi alterado neles):');
      r.duvidas.slice(0, 10).forEach(function (d) { linhas.push(d.matricula + ' · ' + d.nome + ' · ' + d.placa + ' — ' + d.motivo); });
      if (r.totalDuvidas > 10) linhas.push('… e mais ' + (r.totalDuvidas - 10) + '. Mande este arquivo para o Arthur.');
    }
    if (gravado && r.vinculosNovos) linhas.push('Próximo passo: dê duplo clique em atualizar_mobi7.bat para buscar o km dos carros novos.');
    return { resumo: res, linhas: linhas, temNovo: true, ok: gravado ? 'Gravado.' : 'Pronto para gravar (a lista de pessoas é sempre atualizada).' };
  }
  function processar(it, simular) {
    return chamar({ acao: it.acao, matriz: it.matriz, simular: simular }).then(function (r) {
      if (!r.ok) { it.estado = 'erro'; it.texto = L.msgErro(r); it.resumo = null; it.linhas = []; return; }
      var x = it.tipo === 'alelo' ? resumoAlelo(r, !simular) : resumoMov(r, !simular);
      it.resumo = x.resumo; it.linhas = x.linhas; it.temNovo = x.temNovo; it.texto = x.ok; it.estado = simular ? 'conferido' : 'gravado';
    });
  }
  function emSequencia(itens, simular) {
    return itens.reduce(function (p, it) { return p.then(function () { return processar(it, simular); }).then(desenharLista); }, Promise.resolve());
  }
  function conferir() {
    var alvo = estado.itens.filter(function (i) { return i.tipo && i.estado !== 'gravado'; });
    ocupado($('conferir'), true); $('gravar').disabled = true; aviso('msg-importar', 'ok', 'Conferindo... nada é gravado nesta etapa.');
    emSequencia(alvo, true).then(function () { ocupado($('conferir'), false); aviso('msg-importar', 'ok', 'Conferido. Nada foi gravado ainda.'); desenharLista(); });
  }
  function gravar() {
    var alvo = estado.itens.filter(function (i) { return i.estado === 'conferido' && i.temNovo; });
    $('conferir').disabled = true; ocupado($('gravar'), true); aviso('msg-importar', 'ok', 'Gravando...');
    emSequencia(alvo, false).then(function () {
      ocupado($('gravar'), false);
      var erros = estado.itens.some(function (i) { return i.estado === 'erro'; });
      aviso('msg-importar', erros ? 'erro' : 'sucesso', erros ? 'Algum arquivo deu erro. Leia o aviso no cartão dele.' : 'Pronto. Tudo gravado.'); desenharLista();
    });
  }
  function aoEscolherArquivos() {
    var fs = Array.prototype.slice.call($('arquivos').files || []);
    $('arquivos').value = '';   // sem isso, escolher o mesmo arquivo de novo não dispara nada no Chrome
    if (!fs.length) return trocarItens([]);
    aviso('msg-importar', 'ok', 'Lendo os arquivos...');
    Promise.all(fs.map(lerArquivo)).then(trocarItens);
  }
  function usarTexto() {
    var m = L.parseTSV($('extrato').value);
    if (m.length < 2) return aviso('msg-importar', 'erro', 'Cole o extrato com o cabeçalho.');
    trocarItens(estado.itens.filter(function (i) { return i.nome !== 'texto colado'; }).concat([montarItem('texto colado', m)]));
  }
  function configurarZona() {
    var z = $('zona');
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('sobre'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('sobre'); }); });
    z.addEventListener('drop', function (e) {
      var fs = e.dataTransfer && e.dataTransfer.files;
      if (!fs || !fs.length) return;
      try { $('arquivos').files = fs; aoEscolherArquivos(); } catch (er) { aviso('msg-importar', 'erro', 'Seu navegador não aceitou arrastar. Clique na área para escolher os arquivos.'); }
    });
  }

  function aba(qual) {
    $('painel-consulta').classList.toggle('oculto', qual !== 'consulta'); $('painel-importar').classList.toggle('oculto', qual !== 'importar');
    $('aba-consulta').classList.toggle('ativa', qual === 'consulta'); $('aba-importar').classList.toggle('ativa', qual === 'importar');
    $('aba-consulta').setAttribute('aria-selected', qual === 'consulta' ? 'true' : 'false'); $('aba-importar').setAttribute('aria-selected', qual === 'importar' ? 'true' : 'false');
  }

  function iniciar() {
    $('entrar').addEventListener('click', entrar); $('sair').addEventListener('click', sair); $('ver-codigo').addEventListener('click', alternarCodigo);
    $('consultar').addEventListener('click', consultar); $('conferir').addEventListener('click', conferir); $('gravar').addEventListener('click', gravar);
    $('arquivos').addEventListener('change', aoEscolherArquivos); $('usar-texto').addEventListener('click', usarTexto); configurarZona();
    $('aba-consulta').addEventListener('click', function () { aba('consulta'); }); $('aba-importar').addEventListener('click', function () { aba('importar'); });
    ['matricula', 'nome', 'pvalor', 'pkm'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') consultar(); }); });
    ['usuario', 'codigo', 'url'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); }); });
    var cfgUrl = (window.CONSULTA_CFG && window.CONSULTA_CFG.endpoint) || '';
    if (!cfgUrl && !ler('url')) $('campo-url').classList.remove('oculto');
    $('url').value = ler('url'); $('usuario').value = ler('usuario'); $('codigo').value = ler('codigo');
    desenharLista();
    if (ler('url') || cfgUrl) { if ($('usuario').value && $('codigo').value) entrar(); else ($('usuario').value ? $('codigo') : $('usuario')).focus(); }
  }
  document.addEventListener('DOMContentLoaded', iniciar);
})();

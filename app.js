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

  function chamar(corpo) {
    var body = Object.assign({ codigo: estado.codigo, usuario: estado.usuario }, corpo);
    return fetch(estado.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, codigo: 'REDE', mensagem: 'Não consegui falar com o sistema. Confira a internet e o endereço.' }; });
  }

  // ----- entrada -----
  function mostrarApp(sim) {
    $('tela-entrada').classList.toggle('oculto', sim); $('tela-app').classList.toggle('oculto', !sim); $('sair').classList.toggle('oculto', !sim);
  }
  function entrar() {
    var cfgUrl = (window.CONSULTA_CFG && window.CONSULTA_CFG.endpoint) || '';
    estado.url = (cfgUrl || $('url').value || ler('url')).trim();
    estado.usuario = $('usuario').value.trim(); estado.codigo = $('codigo').value.trim();
    if (!L.urlValida(estado.url)) { $('campo-url').classList.remove('oculto'); return aviso('msg-entrada', 'erro', 'Informe o endereço do sistema (termina em /exec).'); }
    if (!estado.usuario) return aviso('msg-entrada', 'erro', 'Informe seu nome (fica no registro das consultas).');
    if (!estado.codigo) return aviso('msg-entrada', 'erro', 'Informe o código de acesso.');
    aviso('msg-entrada', 'ok', 'Conferindo...');
    // consulta de teste sem efeito: matrícula vazia devolve ENTRADA_INVALIDA se o código estiver certo
    chamar({ acao: 'consulta', matricula: '', nome: '' }).then(function (r) {
      if (r.codigo === 'ENTRADA_INVALIDA' || r.ok) {
        guardar('url', estado.url); guardar('usuario', estado.usuario); guardar('codigo', estado.codigo);
        aviso('msg-entrada', 'ok', ''); mostrarApp(true);
      } else aviso('msg-entrada', 'erro', L.msgErro(r));
    });
  }
  function sair() { guardar('codigo', null); estado.codigo = ''; $('codigo').value = ''; mostrarApp(false); }

  // ----- consulta -----
  function desenharFicha(linhas) {
    var raiz = $('ficha'); limpa(raiz);
    L.agrupar(linhas).forEach(function (b) {
      if (b.t === 'titulo') raiz.appendChild(el('h2', '', b.c[0]));
      else if (b.t === 'secao') raiz.appendChild(el('div', 'secao', b.c[0]));
      else if (b.t === 'kv') { var d = el('div', 'kv'); d.appendChild(el('b', '', b.c[0])); d.appendChild(el('span', '', b.c[1] || '')); raiz.appendChild(d); }
      else if (b.t === 'veredito') { var v = el('div', 'veredito v-' + b.c[0], b.c[1]); v.appendChild(el('small', '', b.c[2] || '')); raiz.appendChild(v); }
      else if (b.t === 'dest') { var x = el('div', 'dest', b.c[0]); x.appendChild(el('small', '', b.c[1] || '')); raiz.appendChild(x); }
      else if (b.t === 'alerta' || b.t === 'info') { var a = el('div', b.t); a.appendChild(el('b', '', b.c[0] + ': ')); a.appendChild(document.createTextNode(b.c[1] || '')); raiz.appendChild(a); }
      else if (b.t === 'ok' || b.t === 'nota') raiz.appendChild(el('div', b.t, b.c[0]));
      else if (b.t === 'tabela') {
        var t = el('table'), cab = b.cab || [];
        if (cab.length) { var tr = el('tr'); cab.forEach(function (h) { tr.appendChild(el('th', '', h)); }); t.appendChild(tr); }
        b.linhas.forEach(function (ln) { var r = el('tr'); ln.forEach(function (v) { r.appendChild(el('td', '', v)); }); t.appendChild(r); });
        raiz.appendChild(t);
      }
    });
  }
  function consultar() {
    var pv = $('pvalor').value.trim(), pk = $('pkm').value.trim();
    $('consultar').disabled = true; aviso('msg-consulta', 'ok', 'Consultando...'); limpa($('ficha'));
    chamar({ acao: 'consulta', matricula: $('matricula').value.trim(), nome: $('nome').value.trim(), pedidoValor: pv, pedidoKm: pk }).then(function (r) {
      $('consultar').disabled = false;
      if (!r.ok) return aviso('msg-consulta', 'erro', L.msgErro(r));
      aviso('msg-consulta', 'ok', 'Consulta feita. Extrato Alelo até ' + r.resumo.corte.split('-').reverse().join('/') + '.');
      desenharFicha(r.linhas);
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
      it.info = (matriz.length - 1) + ' linhas lidas' + (p.removidas ? ' · CPF removido aqui, no seu computador' : '');
    } else if (tipo === 'movimentacao') {
      var red = L.reduzirMovimentacao(matriz);
      if (!red) { it.tipo = null; it.estado = 'erro'; it.texto = 'Não achei as colunas da Movimentação (matrícula, status, placa).'; return it; }
      it.matriz = red; it.acao = 'pessoas';
      it.info = (red.length - 1) + ' pessoas lidas · só matrícula, nome, status, cargo, regional, coordenador, estado, deslocamento e placa serão enviados';
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
  function desenharLista() {
    var raiz = $('lista-arquivos'); limpa(raiz);
    estado.itens.forEach(function (it) {
      var c = el('div', 'arq ' + (it.estado === 'erro' ? 'erro' : it.estado === 'gravado' ? 'feito' : (it.estado === 'conferido' ? 'ok' : '')));
      c.appendChild(el('b', '', (it.tipo ? ROTULO[it.tipo] : 'Arquivo não reconhecido') + ': ' + it.nome));
      if (it.info) c.appendChild(el('small', '', it.info));
      if (it.texto) c.appendChild(el('small', '', it.texto));
      if (it.resumo) { var r = el('div', 'res'); it.resumo.forEach(function (p) { var s = el('div'); s.appendChild(el('span', 'num', p[0] + ' ')); s.appendChild(document.createTextNode(p[1])); r.appendChild(s); }); c.appendChild(r); }
      if (it.linhas.length) { var u = el('ul'); it.linhas.forEach(function (t) { u.appendChild(el('li', '', t)); }); c.appendChild(u); }
      raiz.appendChild(c);
    });
    var validos = estado.itens.filter(function (i) { return i.tipo; });
    $('conferir').disabled = !validos.length || validos.every(function (i) { return i.estado === 'gravado'; });
    $('gravar').disabled = !validos.length || !validos.some(function (i) { return i.estado === 'conferido' && i.temNovo; });
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
    $('conferir').disabled = true; $('gravar').disabled = true; aviso('msg-importar', 'ok', 'Conferindo...');
    emSequencia(alvo, true).then(function () { aviso('msg-importar', 'ok', 'Conferido. Nada foi gravado ainda.'); desenharLista(); });
  }
  function gravar() {
    var alvo = estado.itens.filter(function (i) { return i.estado === 'conferido' && i.temNovo; });
    $('conferir').disabled = true; $('gravar').disabled = true; aviso('msg-importar', 'ok', 'Gravando...');
    emSequencia(alvo, false).then(function () {
      var erros = estado.itens.some(function (i) { return i.estado === 'erro'; });
      aviso('msg-importar', erros ? 'erro' : 'ok', erros ? 'Algum arquivo deu erro. Leia o aviso no cartão dele.' : 'Pronto. Tudo gravado.'); desenharLista();
    });
  }
  function aoEscolherArquivos() {
    var fs = Array.prototype.slice.call($('arquivos').files || []);
    if (!fs.length) return trocarItens([]);
    aviso('msg-importar', 'ok', 'Lendo os arquivos...');
    Promise.all(fs.map(lerArquivo)).then(trocarItens);
  }
  function usarTexto() {
    var m = L.parseTSV($('extrato').value);
    if (m.length < 2) return aviso('msg-importar', 'erro', 'Cole o extrato com o cabeçalho.');
    trocarItens(estado.itens.filter(function (i) { return i.nome !== 'texto colado'; }).concat([montarItem('texto colado', m)]));
  }

  function aba(qual) {
    $('painel-consulta').classList.toggle('oculto', qual !== 'consulta'); $('painel-importar').classList.toggle('oculto', qual !== 'importar');
    $('aba-consulta').classList.toggle('ativa', qual === 'consulta'); $('aba-importar').classList.toggle('ativa', qual === 'importar');
  }

  function iniciar() {
    $('entrar').addEventListener('click', entrar); $('sair').addEventListener('click', sair);
    $('consultar').addEventListener('click', consultar); $('conferir').addEventListener('click', conferir); $('gravar').addEventListener('click', gravar);
    $('arquivos').addEventListener('change', aoEscolherArquivos); $('usar-texto').addEventListener('click', usarTexto);
    $('aba-consulta').addEventListener('click', function () { aba('consulta'); }); $('aba-importar').addEventListener('click', function () { aba('importar'); });
    ['matricula', 'nome', 'pvalor', 'pkm'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') consultar(); }); });
    $('codigo').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    var cfgUrl = (window.CONSULTA_CFG && window.CONSULTA_CFG.endpoint) || '';
    if (!cfgUrl && !ler('url')) $('campo-url').classList.remove('oculto');
    $('url').value = ler('url'); $('usuario').value = ler('usuario'); $('codigo').value = ler('codigo');
    if (ler('url') || cfgUrl) { if ($('usuario').value && $('codigo').value) entrar(); }
  }
  document.addEventListener('DOMContentLoaded', iniciar);
})();

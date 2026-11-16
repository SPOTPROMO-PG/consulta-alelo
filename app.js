/* Tela da consulta ALELO CAR. Fala só com o Web App do Apps Script (POST text/plain, sem preflight). Sem innerHTML com dado. */
(function () {
  'use strict';
  var L = window.ConsultaLib, $ = function (id) { return document.getElementById(id); };
  var estado = { url: '', usuario: '', codigo: '', conferido: '' };

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

  // ----- importar -----
  function prepararExtrato() {
    var m = L.parseTSV($('extrato').value);
    if (m.length < 2) return null;
    return L.removerCpf(m);
  }
  function desenharResumo(r) {
    var raiz = $('resumo-importar'); limpa(raiz);
    [['Linhas lidas', r.lidas], ['Novas', r.novas], ['Já existiam', r.duplicadas], ['Fora da planilha', r.foraDaPlanilha]].forEach(function (p) {
      var d = el('div'); d.appendChild(el('b', '', String(p[1]))); d.appendChild(document.createTextNode(p[0])); raiz.appendChild(d);
    });
  }
  function textoImportacao(r) {
    var t = (r.periodo ? 'Período ' + r.periodo.de.split('-').reverse().join('/') + ' a ' + r.periodo.ate.split('-').reverse().join('/') + '. ' : '');
    if (r.nomesAmbiguos && r.nomesAmbiguos.length) t += 'ATENÇÃO, nomes repetidos (ignorados): ' + r.nomesAmbiguos.join(', ') + '. ';
    if (r.nomesForaDaPlanilha && r.nomesForaDaPlanilha.length) t += 'Pessoas do extrato que não estão em PAGOS (ex.: ' + r.nomesForaDaPlanilha.slice(0, 5).join(', ') + '). Se for gente nova do formulário, avise o Arthur. ';
    return t;
  }
  function conferir() {
    var p = prepararExtrato();
    if (!p) return aviso('msg-importar', 'erro', 'Cole o extrato com o cabeçalho.');
    $('conferir').disabled = true; $('importar').disabled = true; aviso('msg-importar', 'ok', 'Conferindo...');
    chamar({ acao: 'importar', matriz: p.matriz, simular: true }).then(function (r) {
      $('conferir').disabled = false;
      if (!r.ok) { limpa($('resumo-importar')); return aviso('msg-importar', 'erro', L.msgErro(r)); }
      desenharResumo(r);
      estado.conferido = $('extrato').value;
      if (r.novas === 0) return aviso('msg-importar', 'ok', 'Nada novo para importar (tudo já estava na planilha). ' + textoImportacao(r));
      $('importar').disabled = false;
      aviso('msg-importar', 'ok', 'Conferido, ainda NÃO gravado. ' + (p.removidas ? 'Coluna de CPF removida. ' : '') + textoImportacao(r) + 'Clique em Importar para gravar.');
    });
  }
  function importar() {
    if ($('extrato').value !== estado.conferido) return aviso('msg-importar', 'erro', 'O texto mudou depois da conferência. Clique em Conferir de novo.');
    var p = prepararExtrato();
    $('importar').disabled = true; $('conferir').disabled = true; aviso('msg-importar', 'ok', 'Importando...');
    chamar({ acao: 'importar', matriz: p.matriz }).then(function (r) {
      $('conferir').disabled = false;
      if (!r.ok) return aviso('msg-importar', 'erro', L.msgErro(r));
      desenharResumo(r); estado.conferido = ''; $('extrato').value = '';
      aviso('msg-importar', 'ok', 'Importado: ' + r.novas + ' linhas novas. Extrato até ' + r.extratoAte.split('-').reverse().join('/') + '. ' + textoImportacao(r));
    });
  }

  function aba(qual) {
    $('painel-consulta').classList.toggle('oculto', qual !== 'consulta'); $('painel-importar').classList.toggle('oculto', qual !== 'importar');
    $('aba-consulta').classList.toggle('ativa', qual === 'consulta'); $('aba-importar').classList.toggle('ativa', qual === 'importar');
  }

  function iniciar() {
    $('entrar').addEventListener('click', entrar); $('sair').addEventListener('click', sair);
    $('consultar').addEventListener('click', consultar); $('conferir').addEventListener('click', conferir); $('importar').addEventListener('click', importar);
    $('aba-consulta').addEventListener('click', function () { aba('consulta'); }); $('aba-importar').addEventListener('click', function () { aba('importar'); });
    ['matricula', 'nome', 'pvalor', 'pkm'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') consultar(); }); });
    $('codigo').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    $('extrato').addEventListener('input', function () { $('importar').disabled = true; });
    var cfgUrl = (window.CONSULTA_CFG && window.CONSULTA_CFG.endpoint) || '';
    if (!cfgUrl && !ler('url')) $('campo-url').classList.remove('oculto');
    $('url').value = ler('url'); $('usuario').value = ler('usuario'); $('codigo').value = ler('codigo');
    if (ler('url') || cfgUrl) { if ($('usuario').value && $('codigo').value) entrar(); }
  }
  document.addEventListener('DOMContentLoaded', iniciar);
})();

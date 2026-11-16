/* Funções puras da tela (testadas em Node, ver test/web_lib.test.js). Sem DOM, sem rede. */
(function (raiz) {
  'use strict';

  function norm(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Texto colado do Excel/Google (colunas por TAB, linhas por quebra de linha, células entre aspas) -> matriz. */
  function parseTSV(texto) {
    var linhas = [], linha = [], cel = '', aspas = false, i, c, s = String(texto || '').replace(/\r\n?/g, '\n');
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (aspas) {
        if (c === '"') { if (s.charAt(i + 1) === '"') { cel += '"'; i++; } else aspas = false; }
        else cel += c;
      } else if (c === '"' && cel === '') aspas = true;
      else if (c === '\t') { linha.push(cel); cel = ''; }
      else if (c === '\n') { linha.push(cel); linhas.push(linha); linha = []; cel = ''; }
      else cel += c;
    }
    if (cel !== '' || linha.length) { linha.push(cel); linhas.push(linha); }
    while (linhas.length && linhas[linhas.length - 1].every(function (x) { return x === ''; })) linhas.pop();
    return linhas;
  }

  /** Índice da linha de cabeçalho: 1ª com 5+ células preenchidas (igual ao servidor, que também a procura). */
  function achaCabecalho(m) {
    for (var i = 0; i < Math.min(m.length, 50); i++) {
      if (m[i].filter(function (c) { return String(c).trim() !== ''; }).length >= 5) return i;
    }
    return -1;
  }

  /**
   * Tira a coluna de CPF ANTES de enviar: o CPF não sai do navegador do Felipe.
   * Devolve { matriz, removidas } (removidas = quantas colunas de CPF saíram).
   */
  function removerCpf(m) {
    var h = achaCabecalho(m);
    if (h < 0) return { matriz: m, removidas: 0 };
    var idx = [];
    m[h].forEach(function (c, j) { if (/(^|\b)cpf(\b|$)/.test(norm(c))) idx.push(j); });
    if (!idx.length) return { matriz: m, removidas: 0 };
    var out = m.map(function (row) { return row.filter(function (_, j) { return idx.indexOf(j) < 0; }); });
    return { matriz: out, removidas: idx.length };
  }

  /** Agrupa linhas consecutivas 'th'/'td' da ficha em tabelas: [{t:'tabela', cab:[...], linhas:[[...]]}, ...] */
  function agrupar(linhas) {
    var out = [], atual = null;
    (linhas || []).forEach(function (l) {
      var c = (l.c || []).slice();
      while (c.length && c[c.length - 1] === '') c.pop();
      if (l.t === 'th' || l.t === 'td') {
        if (!atual) { atual = { t: 'tabela', cab: null, linhas: [] }; out.push(atual); }
        if (l.t === 'th') atual.cab = c; else atual.linhas.push(c);
      } else { atual = null; out.push({ t: l.t, c: c }); }
    });
    return out;
  }

  /** Mensagem amigável para os códigos de erro do servidor. */
  function msgErro(r) {
    if (!r) return 'Sem resposta do servidor.';
    if (r.codigo === 'ACESSO_NEGADO') return 'Código inválido. Confira com o Arthur.';
    if (r.codigo === 'BLOQUEADO') return r.mensagem;
    return r.mensagem || ('Erro: ' + (r.codigo || 'desconhecido'));
  }

  /** Aceita só uma URL de Web App do Google (protege contra colar outro endereço por engano). */
  function urlValida(u) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(u || '').trim());
  }

  var api = { norm: norm, parseTSV: parseTSV, achaCabecalho: achaCabecalho, removerCpf: removerCpf, agrupar: agrupar, msgErro: msgErro, urlValida: urlValida };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.ConsultaLib = api;
})(typeof window !== 'undefined' ? window : this);

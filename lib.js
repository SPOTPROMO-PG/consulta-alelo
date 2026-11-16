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

  // ---------------------------------------------------------------------------------------------
  // Leitura de arquivos (.xlsx e .csv) no navegador: sem biblioteca externa, nada sai do computador.
  // ---------------------------------------------------------------------------------------------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  function txt(bytes) { return new TextDecoder('utf-8').decode(bytes); }

  /** Lê o diretório do .zip e devolve { nome: () => Promise<Uint8Array> } (descompacta só o que for pedido). */
  function abrirZip(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), i = b.length - 22, n, off, itens = {};
    while (i >= 0 && !(b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6)) i--;
    if (i < 0) throw new Error('Este arquivo não é um .xlsx válido.');
    n = u16(b, i + 10); off = u32(b, i + 16);
    for (var k = 0; k < n; k++) {
      if (u32(b, off) !== 0x02014b50) throw new Error('Arquivo .xlsx corrompido.');
      var metodo = u16(b, off + 10), comp = u32(b, off + 20), nl = u16(b, off + 28), el_ = u16(b, off + 30), cl = u16(b, off + 32), loc = u32(b, off + 42);
      var nome = txt(b.subarray(off + 46, off + 46 + nl));
      itens[nome] = (function (metodo, comp, loc) {
        return function () {
          var dados = b.subarray(loc + 30 + u16(b, loc + 26) + u16(b, loc + 28), loc + 30 + u16(b, loc + 26) + u16(b, loc + 28) + comp);
          if (metodo === 0) return Promise.resolve(dados);
          if (metodo !== 8) return Promise.reject(new Error('Compressão do .xlsx não suportada.'));
          var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
          w.write(dados); w.close();
          return new Response(ds.readable).arrayBuffer().then(function (a) { return new Uint8Array(a); });
        };
      })(metodo, comp, loc);
      off += 46 + nl + el_ + cl;
    }
    return itens;
  }

  function desxml(t) {
    return String(t).replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function textoDe(xml) {   // junta todos os <t> (texto simples e formatado)
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(xml))) out += desxml(m[1]);
    return out;
  }
  function colIdx(ref) {
    var l = /^([A-Z]+)/.exec(ref)[1], n = 0;
    for (var i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64);
    return n - 1;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** Número de série do Excel -> 'dd/mm/aaaa' ou 'dd/mm/aaaa hh:mm:ss' (sem fuso: é a hora que aparece na planilha). */
  function serialParaTexto(v) {
    var ms = Math.round((v - 25569) * 86400000), d = new Date(ms);
    var dia = pad2(d.getUTCDate()) + '/' + pad2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    if (Math.abs(v - Math.floor(v)) < 1e-9) return dia;
    return dia + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  }
  function numParaTexto(v) {
    var n = Number(v);
    if (!isFinite(n)) return String(v);
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 1e6) / 1e6).replace('.', ',');
  }
  var FMT_DATA_BUILTIN = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };
  function estilosDeData(xml) {   // índices de estilo (cellXfs) que são data/hora
    var custom = {}, re = /<numFmt\s[^>]*?numFmtId="(\d+)"[^>]*?formatCode="([^"]*)"/g, m;
    while ((m = re.exec(xml))) custom[m[1]] = /[dmyhs]/i.test(desxml(m[2]).replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
    var bloco = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml), out = {}, idx = 0;
    if (bloco) {
      var xfs = bloco[1].match(/<xf\b[^>]*?(?:\/>|>)/g) || [];
      xfs.forEach(function (x, i) { var f = /numFmtId="(\d+)"/.exec(x); if (f && (FMT_DATA_BUILTIN[f[1]] || custom[f[1]])) out[i] = true; });
    }
    return out;
  }
  function lerPlanilhaXml(xml, compartilhadas, datas) {
    var linhas = [], reRow = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g, mr;
    while ((mr = reRow.exec(xml))) {
      var linha = [], conteudo = mr[1] || '', reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, mc;
      while ((mc = reC.exec(conteudo))) {
        var at = mc[1], corpo = mc[2] || '', ref = /\br="([A-Z]+\d+)"/.exec(at), t = (/\bt="([^"]*)"/.exec(at) || [])[1], st = (/\bs="(\d+)"/.exec(at) || [])[1];
        var j = ref ? colIdx(ref[1]) : linha.length, v = '', vm = /<v>([\s\S]*?)<\/v>/.exec(corpo);
        if (t === 'inlineStr') v = textoDe(corpo);
        else if (t === 's') v = vm ? (compartilhadas[Number(vm[1])] || '') : '';
        else if (t === 'str') v = vm ? desxml(vm[1]) : '';
        else if (t === 'e') v = '';                                   // #N/A e outros erros viram vazio
        else if (t === 'b') v = vm && vm[1] === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (vm) v = datas[st] ? serialParaTexto(Number(vm[1])) : numParaTexto(vm[1]);
        while (linha.length < j) linha.push('');
        linha[j] = v;
      }
      linhas.push(linha);
    }
    while (linhas.length && linhas[linhas.length - 1].every(function (x) { return x === ''; })) linhas.pop();
    return linhas;
  }
  /** .xlsx -> matriz de texto. nomeAba (opcional): lê essa aba; senão, a primeira. Também devolve a lista de abas. */
  function lerXlsx(buf, nomeAba) {
    var z;
    try { z = abrirZip(buf); } catch (e) { return Promise.reject(e); }
    function ler(n) { if (!z[n]) return Promise.resolve(null); return z[n]().then(txt); }
    return Promise.all([ler('xl/workbook.xml'), ler('xl/_rels/workbook.xml.rels'), ler('xl/sharedStrings.xml'), ler('xl/styles.xml')]).then(function (a) {
      var wb = a[0], rels = a[1] || '', abas = [], re = /<sheet\b([^>]*?)\/?>/g, m;
      while (wb && (m = re.exec(wb))) {
        var nome = /\bname="([^"]*)"/.exec(m[1]), rid = /\br:id="([^"]*)"/.exec(m[1]);
        abas.push({ nome: nome ? desxml(nome[1]) : '', rid: rid ? rid[1] : '' });
      }
      var alvo = abas[0];
      if (nomeAba) { alvo = abas.filter(function (x) { return x.nome === nomeAba; })[0]; if (!alvo) return { abas: abas.map(function (x) { return x.nome; }), matriz: null }; }
      var caminho = 'xl/worksheets/sheet1.xml';
      if (alvo) {
        var rm = new RegExp('<Relationship\\b[^>]*?Id="' + alvo.rid + '"[^>]*?>').exec(rels);
        var tm = rm && /Target="([^"]*)"/.exec(rm[0]);
        if (tm) caminho = tm[1].charAt(0) === '/' ? tm[1].slice(1) : 'xl/' + tm[1];
      }
      var comp = [];
      if (a[2]) { var rs = /<si\b[^>]*>([\s\S]*?)<\/si>/g, ms; while ((ms = rs.exec(a[2]))) comp.push(textoDe(ms[1])); }
      var datas = a[3] ? estilosDeData(a[3]) : {};
      return ler(caminho).then(function (xml) {
        if (xml === null) throw new Error('Não achei a planilha dentro do arquivo.');
        return { abas: abas.map(function (x) { return x.nome; }), matriz: lerPlanilhaXml(xml, comp, datas) };
      });
    });
  }

  /** Texto de CSV (separador ; , ou TAB, detectado pelo cabeçalho; aspas) -> matriz. */
  function parseCSV(texto) {
    var s = String(texto || '').replace(/^﻿/, ''), prim = s.split(/\r?\n/)[0] || '';
    var cont = function (c) { return prim.split(c).length - 1; }, sep = ';';
    if (cont('\t') >= cont(';') && cont('\t') >= cont(',') && cont('\t') > 0) sep = '\t'; else if (cont(',') > cont(';')) sep = ',';
    var out = [], linha = [], cel = '', aspas = false, i, c;
    s = s.replace(/\r\n?/g, '\n');
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (aspas) { if (c === '"') { if (s.charAt(i + 1) === '"') { cel += '"'; i++; } else aspas = false; } else cel += c; }
      else if (c === '"' && cel === '') aspas = true;
      else if (c === sep) { linha.push(cel); cel = ''; }
      else if (c === '\n') { linha.push(cel); out.push(linha); linha = []; cel = ''; }
      else cel += c;
    }
    if (cel !== '' || linha.length) { linha.push(cel); out.push(linha); }
    while (out.length && out[out.length - 1].every(function (x) { return x === ''; })) out.pop();
    return out;
  }
  function decodificarCsv(bytes) {   // UTF-8; se não for válido, Windows-1252 (CSV do Excel em português)
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  /** Arquivo (nome + bytes) -> matriz. Para a Movimentação pede a aba 'Ativo Master'. */
  function arquivoParaMatriz(nome, bytes, nomeAba) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b) return lerXlsx(b, nomeAba);
    if (/\.xls$/i.test(nome)) return Promise.reject(new Error('Arquivo .xls antigo: abra no Excel e salve como .xlsx.'));
    return Promise.resolve({ abas: [], matriz: parseCSV(decodificarCsv(b)) });
  }

  /** Que arquivo é este, pelo cabeçalho? 'alelo' | 'movimentacao' | null. */
  function detectarTipo(m) {
    var h = achaCabecalho(m || []);
    if (h < 0) return null;
    var cab = m[h].map(norm);
    var tem = function (x) { return cab.indexOf(x) >= 0; };
    if (tem('matricula') && tem('placa veiculo') && tem('status')) return 'movimentacao';
    if (tem('motorista') && (tem('valor transacao') || tem('data hora transacao'))) return 'alelo';
    return null;
  }

  var COLS_PESSOAS = [['matricula', ['matricula']], ['nome', ['nome']], ['status', ['status']], ['cargo', ['cargo ajustado', 'cargo']], ['regional', ['regional']],
    ['coordenador', ['coordenador de campo']], ['estado', ['estado']], ['deslocamento', ['deslocamento']], ['placa', ['placa veiculo']]];
  /** Movimentação (aba Ativo Master) -> só as colunas necessárias. CPF, endereço, telefone, e-mail e salário NÃO saem do navegador. */
  function reduzirMovimentacao(m) {
    var h = achaCabecalho(m);
    if (h < 0) return null;
    var cab = m[h].map(norm), idx = COLS_PESSOAS.map(function (c) {
      for (var i = 0; i < c[1].length; i++) { var j = cab.indexOf(c[1][i]); if (j >= 0) return j; }
      return -1;
    });
    if (idx[0] < 0 || idx[2] < 0 || idx[8] < 0) return null;
    var out = [COLS_PESSOAS.map(function (c) { return c[0]; })];
    for (var r = h + 1; r < m.length; r++) {
      var row = idx.map(function (j) { return j < 0 ? '' : String(m[r][j] === undefined ? '' : m[r][j]).trim(); });
      if (row[0] === '') continue;
      out.push(row);
    }
    return out;
  }
  function paraTSV(m) {
    return m.map(function (row) { return row.map(function (c) { c = String(c); return /[\t\n\r"]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join('\t'); }).join('\n');
  }

  var api = { arquivoParaMatriz: arquivoParaMatriz, lerXlsx: lerXlsx, parseCSV: parseCSV, detectarTipo: detectarTipo, reduzirMovimentacao: reduzirMovimentacao, paraTSV: paraTSV, serialParaTexto: serialParaTexto, norm: norm, parseTSV: parseTSV, achaCabecalho: achaCabecalho, removerCpf: removerCpf, agrupar: agrupar, msgErro: msgErro, urlValida: urlValida };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.ConsultaLib = api;
})(typeof window !== 'undefined' ? window : this);

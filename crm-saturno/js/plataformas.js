// =====================================================================
//  SATURNO NFC · CRM — plataformas: assinaturas que a Saturno paga (custo fixo do mês)
//  Tudo editável direto na tabela; cobrança anual entra no mês dividida por 12.
// =====================================================================
'use strict';

const PL = {q: ''};
const CICLO = {mensal: 'Mensal', anual: 'Anual'};
const CATS_PL = ['Infraestrutura', 'Domínio e e-mail', 'Atendimento', 'Automação e IA', 'Design', 'Marketing', 'Financeiro', 'Outros'];
const plMes = p => p.ciclo === 'anual' ? (+p.valor || 0) / 12 : +p.valor || 0;

async function viewPlataformas(silent) {
  if (silent && document.activeElement?.closest?.('#plTbl')) return;
  const [rows, as] = await Promise.all([API.plataformas(), API.assinaturas().catch(() => [])]);
  const mrr = as.filter(a => a.status === 'ativa').reduce((s, a) => s + +a.valor, 0);
  const kpis = () => { const at = rows.filter(p => p.ativo), mes = at.reduce((s, p) => s + plMes(p), 0), sobra = mrr - mes;
    return `<div class="kpi hl"><span>Custo mensal</span><b>${brl(mes)}</b><small>${at.length} plataforma${at.length === 1 ? '' : 's'} ativa${at.length === 1 ? '' : 's'}</small></div>
      <div class="kpi"><span>Custo anual</span><b>${brl(mes * 12)}</b><small>se nada mudar</small></div>
      <div class="kpi"><span>Receita recorrente (mês)</span><b>${brl(mrr)}</b><small>assinaturas ativas dos clientes</small></div>
      <div class="kpi"><span>Sobra da recorrente</span><b style="${sobra < 0 ? 'color:var(--red)' : ''}">${brl(sobra)}</b><small>recorrente − plataformas</small></div>`; };
  $('#view').innerHTML = header('Plataformas', 'Assinaturas que a Saturno NFC paga todo mês. Edite direto na tabela: salva sozinho ao sair do campo.',
    `<button class="btn" id="plCsv">${IC.csv}Exportar CSV</button><button class="btn pri" id="plNovo">+ Plataforma</button>`) + `
    <div class="kpis" id="plKpis">${kpis()}</div>
    <div class="bar"><div></div><div class="search">${ICON_SEARCH}<input class="in" id="plQ" placeholder="Buscar plataforma ou categoria" value="${esc(PL.q)}"></div></div>
    <div class="tbl-wrap" id="plTbl"></div>
    <datalist id="plCats">${CATS_PL.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const pinta = (tr, p) => { tr.querySelector('[data-c="mes"]').textContent = brl(plMes(p)); tr.classList.toggle('dim', !p.ativo); };
  const render = () => {
    const q = PL.q.trim().toLowerCase();
    const list = rows.filter(p => !q || `${p.nome} ${p.categoria || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.ativo - a.ativo) || plMes(b) - plMes(a) || a.nome.localeCompare(b.nome));
    $('#plTbl').innerHTML = `<table>
      <thead><tr><th>Plataforma</th><th>Categoria</th><th class="r">Valor (R$)</th><th>Cobrança</th><th class="r">Por mês</th><th>Ativa</th><th>Link</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr data-id="${p.id}">
        <td><input class="in cell nome" data-f="nome" maxlength="120" value="${esc(p.nome)}"></td>
        <td><input class="in cell txt" data-f="categoria" list="plCats" placeholder="—" value="${esc(p.categoria || '')}"></td>
        <td class="r"><input class="in cell num" data-f="valor" inputmode="decimal" value="${esc(fmtNum(p.valor))}"></td>
        <td><select class="in cell sel" data-f="ciclo">${Object.entries(CICLO).map(([k, l]) => `<option value="${k}" ${k === p.ciclo ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="r num strong" data-c="mes"></td>
        <td><input type="checkbox" data-f="ativo" ${p.ativo ? 'checked' : ''} title="Desmarque se cancelou (sai do custo do mês)"></td>
        <td><input class="in cell txt" data-f="link" placeholder="—" value="${esc(p.link || '')}">${isUrl(p.link) ? `<a class="lk" href="${esc(p.link)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
        <td class="r"><button class="btn sm ghost ic danger" data-dp="${p.id}" title="Excluir">${IC.lixo}</button></td></tr>`).join('')}</tbody>
    </table>${list.length ? '' : `<div class="empty">${rows.length ? 'Nenhuma plataforma encontrada' : 'Nenhuma plataforma ainda: clique em "+ Plataforma"'}</div>`}`;
    const tbl = $('#plTbl');
    tbl.querySelectorAll('tr[data-id]').forEach(tr => pinta(tr, rows.find(x => x.id === tr.dataset.id)));
    tbl.oninput = e => { const tr = e.target.closest('tr[data-id]'); if (!tr || e.target.dataset.f !== 'valor') return;
      const v = parseNum(e.target.value); if (!Number.isNaN(v)) pinta(tr, {...rows.find(x => x.id === tr.dataset.id), valor: v ?? 0}); };
    tbl.onchange = async e => {
      const i = e.target.closest('[data-f]'); if (!i) return;
      const tr = i.closest('tr'), p = rows.find(x => x.id === tr.dataset.id), k = i.dataset.f;
      const volta = () => { if (k === 'ativo') i.checked = p.ativo; else if (k === 'valor') i.value = fmtNum(p.valor); else i.value = p[k] || ''; pinta(tr, p); };
      let v;
      if (k === 'nome') { v = i.value.trim().replace(/\s+/g, ' '); if (!v) { toast('O nome não pode ficar vazio', true); return volta(); } }
      else if (k === 'categoria' || k === 'link') v = i.value.trim() || null;
      else if (k === 'ativo') v = i.checked;
      else if (k === 'ciclo') v = i.value;
      else { v = parseNum(i.value) ?? 0;
        if (Number.isNaN(v) || v < 0) { i.classList.add('bad'); return toast('Valor inválido: use números positivos, ex. 49,90', true); }
        v = Math.round(v * 100) / 100; }
      i.classList.remove('bad');
      if (v === p[k] || (k === 'valor' && +v === +p[k])) return volta();
      const antes = p[k]; p[k] = v; volta();
      try { await API.atualizarPlataforma(p.id, {[k]: v}); toast(`${p.nome}: salvo`); $('#plKpis').innerHTML = kpis();
        if (k === 'link') render(); }
      catch (er) { p[k] = antes; volta(); toast(er.message, true); }
    };
    tbl.onkeydown = e => { const i = e.target.closest('input[data-f]'); if (!i || e.key !== 'Enter') return; e.preventDefault();
      const trs = [...tbl.querySelectorAll('tr[data-id]')], prox = trs[trs.indexOf(i.closest('tr')) + (e.shiftKey ? -1 : 1)];
      const alvo = prox?.querySelector(`[data-f="${i.dataset.f}"]`); alvo ? (alvo.focus(), alvo.select?.()) : i.blur(); };
    tbl.querySelectorAll('[data-dp]').forEach(b => b.onclick = async () => { const p = rows.find(x => x.id === b.dataset.dp);
      if (!confirm(`Excluir "${p.nome}"? Se só cancelou, prefira desmarcar "Ativa".`)) return;
      try { await API.excluirPlataforma(p.id); rows.splice(rows.indexOf(p), 1); toast(`${p.nome} excluída`); render(); $('#plKpis').innerHTML = kpis(); } catch (er) { toast(er.message, true); } });
  };
  render();
  $('#plTbl').addEventListener('focusin', e => { if (e.target.matches('input[data-f]:not([type=checkbox])')) e.target.select(); });
  $('#plQ').oninput = e => { PL.q = e.target.value; render(); };
  // nova linha já entra na tabela com o nome selecionado para digitar
  $('#plNovo').onclick = async e => { const b = e.currentTarget; b.disabled = true;
    try { const n = await API.salvarPlataforma({nome: 'Nova plataforma', valor: 0, ciclo: 'mensal', ativo: true});
      rows.push(n); PL.q = ''; $('#plQ').value = ''; render(); $('#plKpis').innerHTML = kpis();
      const i = $(`#plTbl tr[data-id="${n.id}"] [data-f="nome"]`); i?.focus(); i?.select(); }
    catch (er) { toast(er.message, true); }
    b.disabled = false; };
  $('#plCsv').onclick = () => baixarCsv('plataformas-saturno-nfc.csv', ['Plataforma', 'Categoria', 'Valor', 'Cobrança', 'Por mês', 'Ativa', 'Link'],
    rows.map(p => [p.nome, p.categoria || '', fmtNum(p.valor), CICLO[p.ciclo], fmtNum(plMes(p)), p.ativo ? 'Sim' : 'Não', p.link || '']));
}

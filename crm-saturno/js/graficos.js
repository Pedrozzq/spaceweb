// =====================================================================
//  SATURNO NFC · CRM — gráficos em SVG (sem biblioteca)
//  Cores: --c1 / --c2 do css (paleta validada para os temas claro e escuro).
//  Todos têm dica ao passar o mouse e uma tabela com os números (acessibilidade).
// =====================================================================
'use strict';
const G = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  // escala "bonita" para o eixo: 0..max em 4 passos redondos
  const escala = max => {
    if (!(max > 0)) return {top: 4, passo: 1};
    const bruto = max / 4, p10 = 10 ** Math.floor(Math.log10(bruto)), n = bruto / p10;
    const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p10;
    return {top: passo * Math.ceil(max / passo), passo};
  };
  const tabela = (cab, linhas) => `<details class="chart-tbl"><summary>Ver números</summary><table><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((v, i) => `<td class="${i ? 'r num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
  // dica flutuante dentro do .chart
  function dica(box) {
    let tip = box.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip hidden'; box.appendChild(tip); }
    return {
      mostra(html, x, y) { tip.innerHTML = html; tip.classList.remove('hidden'); tip.style.left = x + 'px'; tip.style.top = y + 'px'; },
      esconde() { tip.classList.add('hidden'); }
    };
  }
  const posRel = (box, el) => { const a = box.getBoundingClientRect(), b = el.getBoundingClientRect(); return [b.left - a.left + b.width / 2, b.top - a.top]; };

  // Barras verticais (uma série). dados: [{k, v}] · fmt: formata valor
  function barras(el, dados, {fmt = v => v, cor = 'var(--c1)', alt = 220, nome = 'Total'} = {}) {
    const W = 560, H = alt, ml = 34, mr = 8, mt = 18, mb = 46;
    const {top, passo} = escala(Math.max(...dados.map(d => d.v), 0));
    const bw = (W - ml - mr) / Math.max(dados.length, 1), larg = Math.min(46, bw * .62);
    const y = v => mt + (H - mt - mb) * (1 - v / top);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(nome)}"><g class="grid">`;
    for (let v = 0; v <= top + 1e-9; v += passo) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v, true))}</text>`;
    s += '</g>';
    dados.forEach((d, i) => {
      const cx = ml + bw * i + bw / 2, h = Math.max(0, y(0) - y(d.v));
      // topo arredondado (4px) apoiado na base
      const r = Math.min(4, h / 2, larg / 2), x0 = cx - larg / 2, yt = y(d.v);
      if (h > 0) s += `<path class="bar-m" data-i="${i}" fill="${cor}" d="M${x0},${y(0)} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + larg - r} Q${x0 + larg},${yt} ${x0 + larg},${yt + r} V${y(0)} Z"/>`;
      if (d.v > 0 && dados.length <= 12) s += `<text class="lbl" x="${cx}" y="${yt - 5}" text-anchor="middle">${esc(fmt(d.v))}</text>`;
      const rot = dados.length > 6;
      s += `<text class="ax" x="${cx}" y="${y(0) + 15}" text-anchor="${rot ? 'end' : 'middle'}" ${rot ? `transform="rotate(-28 ${cx} ${y(0) + 15})"` : ''}>${esc(d.k)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${ml + bw * i}" y="${mt}" width="${bw}" height="${H - mt - mb}"/>`;
    });
    s += `<line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line2)"/></svg>`;
    el.innerHTML = `<div class="chart">${s}</div>` + tabela(['', nome], dados.map(d => [d.k, fmt(d.v)]));
    const box = el.querySelector('.chart'), t = dica(box);
    box.querySelectorAll('.hit').forEach(h => {
      const i = +h.dataset.i, d = dados[i], m = box.querySelector(`.bar-m[data-i="${i}"]`);
      h.onmouseenter = () => { box.classList.add('hov'); m?.classList.add('on'); const [x, yy] = posRel(box, m || h); t.mostra(`<b>${esc(d.k)}</b>${esc(nome)}: ${esc(fmt(d.v))}`, x, yy); };
      h.onmouseleave = () => { box.classList.remove('hov'); m?.classList.remove('on'); t.esconde(); };
    });
  }

  // Barras horizontais (funil / ranking). dados: [{k, v, sub?}]
  function horiz(el, dados, {fmt = v => v, cor = 'var(--c1)', nome = 'Total'} = {}) {
    const max = Math.max(...dados.map(d => d.v), 1);
    el.innerHTML = `<div class="chart">${dados.map((d, i) => `<div class="hbar" data-i="${i}"><span class="small">${esc(d.k)}</span>
        <div class="t"><i style="width:${(d.v / max * 100).toFixed(1)}%;background:${cor}"></i></div>
        <span class="num r small"><b>${esc(fmt(d.v))}</b>${d.sub ? ` <span class="mut">${esc(d.sub)}</span>` : ''}</span></div>`).join('') || '<div class="empty">Sem dados</div>'}</div>`
      + tabela(['', nome], dados.map(d => [d.k, fmt(d.v) + (d.sub ? ` (${d.sub})` : '')]));
  }

  // Linhas (até 3 séries). series: [{nome, cor, valores:[...]}], rotulos: [...]
  function linhas(el, rotulos, series, {fmt = v => v, alt = 230} = {}) {
    const W = 560, H = alt, ml = 34, mr = 14, mt = 16, mb = 30;
    const {top, passo} = escala(Math.max(...series.flatMap(s => s.valores), 0));
    const n = rotulos.length, x = i => ml + (n === 1 ? (W - ml - mr) / 2 : (W - ml - mr) * i / (n - 1));
    const y = v => mt + (H - mt - mb) * (1 - v / top);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(z => z.nome).join(' e '))}"><g class="grid">`;
    for (let v = 0; v <= top + 1e-9; v += passo) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v, true))}</text>`;
    s += '</g>';
    rotulos.forEach((r, i) => { s += `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(r)}</text>`; });
    series.forEach(z => {
      s += `<polyline fill="none" stroke="${z.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${z.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
      z.valores.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${z.cor}" stroke="var(--card)" stroke-width="2"/>`; });
      // rótulo direto no último ponto (identidade não depende só da cor)
      const u = z.valores.length - 1;
      s += `<text class="lbl" x="${x(u) - 6}" y="${y(z.valores[u]) - 9}" text-anchor="end">${esc(fmt(z.valores[u]))}</text>`;
    });
    s += `<line class="cross hidden" y1="${mt}" y2="${H - mb}" stroke="var(--mut2)" stroke-dasharray="3 3"/>`;
    rotulos.forEach((r, i) => { s += `<rect class="hit" data-i="${i}" x="${x(i) - (W - ml - mr) / Math.max(n - 1, 1) / 2}" y="${mt}" width="${(W - ml - mr) / Math.max(n - 1, 1)}" height="${H - mt - mb}"/>`; });
    s += '</svg>';
    el.innerHTML = `<div class="chart">${s}</div><div class="legend">${series.map(z => `<span><i style="background:${z.cor}"></i>${esc(z.nome)}</span>`).join('')}</div>`
      + tabela(['', ...series.map(z => z.nome)], rotulos.map((r, i) => [r, ...series.map(z => fmt(z.valores[i]))]));
    const box = el.querySelector('.chart'), t = dica(box), cross = box.querySelector('.cross');
    box.querySelectorAll('.hit').forEach(h => {
      const i = +h.dataset.i;
      h.onmouseenter = () => {
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.classList.remove('hidden');
        const svgEl = box.querySelector('svg'), k = svgEl.getBoundingClientRect().width / W;
        t.mostra(`<b>${esc(rotulos[i])}</b>${series.map(z => `<div><i style="background:${z.cor}"></i>${esc(z.nome)}: ${esc(fmt(z.valores[i]))}</div>`).join('')}`,
          x(i) * k, y(Math.max(...series.map(z => z.valores[i]))) * k);
      };
      h.onmouseleave = () => { cross.classList.add('hidden'); t.esconde(); };
    });
  }
  return {barras, horiz, linhas};
})();

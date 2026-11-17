/* Poker → Claude : interface. Tout est stocké dans le navigateur (localStorage). */
(function () {
  'use strict';

  const E = window.PokerEngine;
  const HANDS = window.PokerHands;
  const KEY = 'pokercode:v1';
  const HKEY = 'pokercode:hist:v1';
  const HIST_MAX = 60;
  const SUIT_SYM = { p: '♠', c: '♥', k: '♦', t: '♣' };
  const SUIT_NAME = { p: 'pique', c: 'cœur', k: 'carreau', t: 'trèfle' };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /* ------------------------------------------------------------ stockage */

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : on continue en mémoire */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } },
  };
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

  let state = parse(store.get(KEY));
  if (state && state.v !== 1) state = null;
  let hist = parse(store.get(HKEY));
  if (!Array.isArray(hist)) hist = [];

  function save() {
    if (state) store.set(KEY, JSON.stringify(state));
    else store.del(KEY);
    store.set(HKEY, JSON.stringify(hist));
  }

  /* ------------------------------------------------------- état de l'écran */

  const ui = {
    tab: 'main',
    sizing: false,
    amount: '',
    pick: [],
    rank: null,
    sel: [],
    edit: null,
    autoKey: null,
    setup: defaultSetup(),
  };

  function defaultSetup() {
    return {
      n: 6, sb: 10, bb: 20, ante: 0, anteType: 'chacun', me: 0, btn: 0,
      names: Array.from({ length: E.MAX_PLAYERS }, (_, i) => (i === 0 ? 'Moi' : 'Joueur ' + (i + 1))),
      stacks: Array.from({ length: E.MAX_PLAYERS }, () => ''),
    };
  }

  function resetTransient() {
    ui.sizing = false;
    ui.amount = '';
    ui.pick = [];
    ui.rank = null;
    ui.sel = [];
  }

  /* ------------------------------------------------------------ utilitaires */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const player = (id) => state.players.find((p) => p.id === id);
  const fmtNet = (n) => (n > 0 ? '+' + n : '−' + Math.abs(n));
  const K = (k) => `<kbd class="k">${k}</kbd>`; // lettre de raccourci, affichée seulement sur PC

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function copy(text, msg) {
    const done = () => toast(msg || 'Copié ✓');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let okCopy = false;
      try { okCopy = document.execCommand('copy'); } catch (e) { okCopy = false; }
      ta.remove();
      if (okCopy) done();
      else toast('Copie impossible : sélectionne le texte à la main');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function share(text) {
    if (!canShare) return copy(text);
    navigator.share({ text }).catch(() => { /* partage annulé */ });
  }

  // Exécute une modification de la partie : sauvegarde pour « Annuler », restaure si erreur.
  function cmd(fn, opts) {
    if (!state) return null;
    const snap = JSON.stringify(state);
    let r;
    try { r = fn(state); } catch (e) { console.error(e); r = { ok: false, err: 'Erreur : ' + e.message }; }
    if (r && r.ok === false) {
      state = JSON.parse(snap);
      toast(r.err);
      render();
      return r;
    }
    hist.push(snap);
    if (hist.length > HIST_MAX) hist.shift();
    resetTransient();
    save();
    if (!(opts && opts.quiet)) render();
    else $('undo').disabled = false;
    afterChange();
    return r || { ok: true };
  }

  // Quand c'est à moi : copie automatique du message + petite vibration.
  function afterChange() {
    const h = state && state.hand;
    if (!h || h.phase !== 'action' || h.toAct !== h.meId) return;
    const key = h.no + ':' + h.events.length;
    if (ui.autoKey === key) return;
    ui.autoKey = key;
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignoré */ } }
    copy(E.buildMessage(state), 'À toi ! Message copié pour Claude');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------- rendu */

  function cardHtml(c, cls) {
    return `<span class="card s-${c[1]}${cls ? ' ' + cls : ''}"><b>${c[0] === 'T' ? '10' : c[0]}</b><i>${SUIT_SYM[c[1]]}</i></span>`;
  }

  function render() {
    $('undo').disabled = !state || !hist.length;
    const nav = document.querySelector('.nav');
    nav.hidden = !state;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    let html;
    if (!state) html = viewSetup();
    else if (ui.tab === 'table') html = viewTable();
    else if (ui.tab === 'prompt') html = viewPrompt();
    else if (ui.tab === 'settings') html = viewSettings();
    else html = viewMain();
    if (!state || ui.tab !== 'main') html = `<div class="narrow">${html}</div>`;
    $('view').innerHTML = html;
    $('side').innerHTML = viewSide();
  }

  /* ---- nouvelle partie */

  function viewSetup() {
    const s = ui.setup;
    let rows = '';
    for (let i = 0; i < s.n; i++) {
      rows += `<div class="seat-row">
        <span class="seat-no">${i + 1}</span>
        <input class="in" data-setup-name="${i}" value="${esc(s.names[i])}" maxlength="18" aria-label="Pseudo du joueur ${i + 1}">
        <input class="in stack" type="number" inputmode="numeric" min="1" data-setup-stack="${i}" value="${esc(s.stacks[i])}" placeholder="jetons" aria-label="Jetons du joueur ${i + 1}">
      </div>`;
    }
    const opts = (sel) => Array.from({ length: s.n }, (_, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${i + 1}. ${esc(s.names[i])}</option>`).join('');
    return `<section class="panel">
      <h1>Nouvelle partie</h1>
      <div class="field-row">
        <span class="lbl">Nombre de joueurs</span>
        <div class="stepper">
          <button data-a="setup-n" data-d="-1" aria-label="Un joueur de moins">−</button>
          <b>${s.n}</b>
          <button data-a="setup-n" data-d="1" aria-label="Un joueur de plus">+</button>
        </div>
      </div>
      <div class="grid3">
        <label class="field">Petite blinde<input class="in" type="number" inputmode="numeric" min="1" data-setup="sb" value="${esc(s.sb)}"></label>
        <label class="field">Grosse blinde<input class="in" type="number" inputmode="numeric" min="1" data-setup="bb" value="${esc(s.bb)}"></label>
        <label class="field">Ante<input class="in" type="number" inputmode="numeric" min="0" data-setup="ante" value="${esc(s.ante)}"></label>
      </div>
      <label class="field">Qui paie l'ante ?<select class="in" data-setup-str="anteType">
        <option value="chacun" ${s.anteType !== 'bb' ? 'selected' : ''}>Chaque joueur</option>
        <option value="bb" ${s.anteType === 'bb' ? 'selected' : ''}>La grosse blinde, pour toute la table</option>
      </select></label>
      <p class="hint">Ante : petite mise obligatoire en plus des blindes, souvent en tournoi quand les blindes montent. Laisse 0 s'il n'y en a pas. Sur le site, soit chaque joueur pose l'ante avant les cartes, soit seule la grosse blinde la paie pour toute la table.</p>
      <h2>Les joueurs</h2>
      <p class="hint">Recopie ce que tu vois sur le site : le pseudo et les jetons de chaque joueur, en faisant le tour de la table dans le sens des aiguilles d'une montre.</p>
      <div class="seat-row head"><span></span><span>Pseudo</span><span>Jetons</span></div>
      ${rows}

      <label class="field">Lequel de ces joueurs est toi ?<select class="in" data-setup-sel="me">${opts(s.me)}</select></label>
      <label class="field">Qui a le jeton « D » à côté de lui ?<select class="in" data-setup-sel="btn">${opts(s.btn)}</select></label>
      <p class="hint">Sur le site, un petit jeton marqué « D » est posé devant un des joueurs : c'est le « bouton » (BTN). Il sert à savoir qui paie les blindes et qui parle en premier. Il avance d'une place à chaque main : l'appli le suit toute seule.</p>
      <button class="btn primary big" data-a="setup-go">Commencer la partie</button>
    </section>`;
  }

  /* ---- onglet Main */

  function viewMain() {
    const h = state.hand;
    let out = '';
    if (!state.promptCopied) {
      out += `<div class="banner">
        <div><b>D'abord :</b> envoie le prompt de départ à Claude, dans une nouvelle conversation.</div>
        <div class="row">
          <button class="btn primary" data-a="copy-prompt">Copier le prompt</button>
          <button class="btn" data-a="tab" data-tab="prompt">Le voir</button>
        </div>
      </div>`;
    }
    if (!h) return `<div class="narrow">${out}${viewIdle()}</div>`;
    let a = handHead(h);
    if (h.phase === 'spectate') a += viewSpectate(h);
    else if (h.phase === 'cards') a += picker(2, `Tes cartes <span class="muted">(${h.pos[h.meId]})</span>`, [], null);
    else if (h.phase === 'board') a += viewBoard(h);
    else if (h.phase === 'action') a += viewAction(h);
    else if (h.phase === 'showdown') a += viewShowdown(h);
    else if (h.phase === 'done') a += viewDone(h);
    let b = h.phase === 'spectate' ? '' : ptable(h) + strip(h);
    if (h.sent.length) b += sentList(h.sent, 'hand');
    if (!['done', 'spectate'].includes(h.phase)) {
      b += `<div class="row end"><button class="btn ghost danger small" data-a="abort" title="Efface la saisie de cette main : jetons et jeton D reviennent comme avant. Ce n'est pas se coucher.">Effacer cette main (erreur de saisie)</button></div>`;
    }
    return `${out}<div class="hand-grid"><div class="col-a">${a}</div><div class="col-b">${b}</div></div>`;
  }

  function handHead(h) {
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(h.board[i] ? cardHtml(h.board[i], 'sm') : '<span class="card empty sm"></span>');
    const mine = h.cards.length ? h.cards.map((c) => cardHtml(c, 'sm')).join('') : '';
    return `<div class="hand-head">
      <div class="hh-line">
        <span class="tag">Main #${h.no}</span>
        <span class="tag">${h.phase === 'board' ? '→ ' + E.STREET_NAMES[h.street + 1] : E.STREET_NAMES[h.street]}</span>
        <span class="tag">${h.sb}/${h.bb}${h.ante ? (h.anteType === 'bb' ? ' · ante BB ' : ' · ante ') + h.ante : ''}</span>
        <span class="pot">Pot <b>${E.potOf(h)}</b></span>
      </div>
      <div class="hh-cards">
        <div class="hh-mine">${mine}${h.meIn ? `<span class="hh-pos">${h.pos[h.meId]}</span>` : '<span class="muted">hors main</span>'}</div>
        <div class="hh-board">${slots.join('')}</div>
      </div>
    </div>`;
  }

  function strip(h) {
    const ord = h.street === 0 ? h.pre : h.post;
    const done = h.phase === 'done';
    return `<ol class="strip">${ord.map((id) => {
      const cls = [id === h.toAct ? 'cur' : '', h.folded[id] ? 'out' : '', id === h.meId ? 'me' : ''].join(' ');
      let right;
      if (done) {
        const net = h.stack[id] + h.win[id] - h.stacks0[id];
        right = `<span class="stk">${h.stack[id] + h.win[id]}</span><span class="bet ${net < 0 ? 'neg' : ''}">${net ? fmtNet(net) : ''}</span><span class="st"></span>`;
      } else {
        const st = h.folded[id] ? 'couché' : h.allin[id] ? 'tapis' : id === h.toAct ? 'parle' : '';
        right = `<span class="stk">${h.stack[id]}</span><span class="bet">${h.bet[id] || ''}</span><span class="st">${st}</span>`;
      }
      return `<li class="${cls}"><span class="pos">${h.pos[id]}</span><span class="nm">${esc(h.names[id])}${id === h.meId ? ' <em>moi</em>' : ''}</span>${right}</li>`;
    }).join('')}</ol>`;
  }

  // Table de poker vue de dessus (affichée seulement sur PC). Je suis toujours en bas au centre,
  // les autres joueurs suivent dans le sens des aiguilles d'une montre.
  function ptable(h) {
    const n = h.order.length;
    const m = Math.max(0, h.order.indexOf(h.meId));
    const seats = h.order.slice(m).concat(h.order.slice(0, m));
    const done = h.phase === 'done';
    const cand = h.phase === 'showdown' ? E.showdownCandidates(h) : [];
    const RX = 44, RY = 43; // rayon de l'ellipse des places, en % de la zone
    const at = (r, deg) => {
      const a = (deg * Math.PI) / 180;
      return `left:${(50 + RX * r * Math.cos(a)).toFixed(2)}%;top:${(50 + RY * r * Math.sin(a)).toFixed(2)}%`;
    };
    // Jeton D : accroché au cadre du joueur qui a le bouton, sur le coin tourné vers le centre de la table.
    const dealerCorner = (deg) => {
      const a = (deg * Math.PI) / 180;
      if (Math.abs(Math.cos(a)) < 0.2) return 'd-mr'; // place tout en haut ou tout en bas : sur le côté droit
      const v = Math.sin(a) < -0.2 ? 'b' : 't'; // places du haut : coin du bas ; sinon coin du haut
      const h = Math.cos(a) > 0.2 ? 'l' : 'r'; // places de droite : coin gauche ; sinon coin droit
      return 'd-' + v + h;
    };
    const back = '<span class="cb"></span><span class="cb"></span>';
    let html = '<div class="ptable" aria-label="Table"><div class="pt-felt"></div>';
    seats.forEach((id, k) => {
      const deg = 90 + (k * 360) / n;
      const me = id === h.meId;
      const cls = ['seat', id === h.toAct ? 'cur' : '', h.folded[id] ? 'out' : '', me ? 'me' : '',
        cand.includes(id) ? 'pick' : '', ui.sel.includes(id) ? 'picked' : ''].join(' ');
      let cards = '';
      if (!h.folded[id]) cards = me && h.cards.length === 2 ? h.cards.map((c) => cardHtml(c, 'xs')).join('') : back;
      let tag = '';
      let stack = h.stack[id];
      if (done) {
        const net = h.stack[id] + h.win[id] - h.stacks0[id];
        stack = h.stack[id] + h.win[id];
        if (net) tag = `<span class="seat-tag ${net > 0 ? 'win' : 'lose'}">${fmtNet(net)}</span>`;
      } else if (h.folded[id]) tag = '<span class="seat-tag fold">couché</span>';
      else if (h.allin[id]) tag = '<span class="seat-tag allin">tapis</span>';
      else if (id === h.toAct) tag = '<span class="seat-tag">parle</span>';
      const click = cand.includes(id) ? ` data-a="sel" data-id="${id}" title="Choisir comme gagnant"` : '';
      html += `<div class="${cls}" style="${at(1, deg)}"${click}>
        <div class="seat-cards">${cards}</div>
        <div class="seat-box">${id === h.btnId ? `<span class="dealer-badge ${dealerCorner(deg)}" title="Jeton D (bouton)">D</span>` : ''}<span class="seat-pos">${h.pos[id]}</span><b class="seat-name">${esc(h.names[id])}</b><span class="seat-stack">${stack}</span></div>
        ${tag}
      </div>`;
      if (!done && h.bet[id]) html += `<div class="pt-bet" style="${at(0.58, deg)}"><i></i>${h.bet[id]}</div>`;
    });
    const board = Array.from({ length: 5 }, (_, i) => (h.board[i] ? cardHtml(h.board[i], 'sm') : '<span class="card empty sm"></span>')).join('');
    html += `<div class="pt-center"><div class="pt-board">${board}</div><div class="pt-pot">Pot ${E.potOf(h)}</div></div>`;
    return html + '</div>';
  }

  function viewIdle() {
    const S = state.settings;
    const plan = E.planNextHand(state);
    const n = state.handNo + 1;
    let out = `<section class="panel"><h2>Prochaine main <span class="muted">#${n}</span></h2>`;
    if (!plan.ok) out += `<p class="warn">${esc(plan.err)}</p>`;
    else {
      out += `<ol class="strip preview">${plan.pre.map((id) => {
        const p = player(id);
        return `<li class="${p.me ? 'me' : ''}"><span class="pos">${plan.pos[id]}</span><span class="nm">${esc(p.name)}${p.me ? ' <em>moi</em>' : ''}</span><span class="stk">${p.stack}</span></li>`;
      }).join('')}</ol>`;
      const me = state.players.find((p) => p.me);
      if (!me) out += `<p class="warn">Aucun joueur n'est marqué « moi » (onglet Table).</p>`;
      else if (!plan.order.includes(me.id)) out += `<p class="warn">Tu ne joues pas cette main (pause ou 0 jeton).</p>`;
    }
    out += `<p class="hint"><b>BTN</b> = joueur avec le jeton D · <b>SB</b> / <b>BB</b> = petite et grosse blinde (${S.sb}/${S.bb}${S.ante ? (S.anteType === 'bb' ? ', ante BB ' : ', ante ') + S.ante : ''}) · <b>UTG</b> parle en premier. Les jetons ne correspondent plus au site ? Corrige-les dans l'onglet Table.</p>
      <button class="btn primary big" data-a="deal" ${plan.ok ? '' : 'disabled'}>Distribuer la main #${n} ${K('Entrée')}</button>
      <button class="btn ghost wide" data-a="tab" data-tab="table">Un joueur arrive, part, ou recave ?</button>
    </section>`;
    if (state.last) out += lastHand(state.last);
    return out;
  }

  function lastHand(L) {
    return `<section class="panel soft">
      <h3>Main #${L.no}</h3>
      ${L.board.length ? `<div class="mini-board">${L.board.map((c) => cardHtml(c, 'xs')).join('')}</div>` : ''}
      <ul class="res">${L.pots.map((p) => `<li>${p.label} <b>${p.amount}</b> → ${p.winners.map(esc).join(', ')}</li>`).join('')}</ul>
      <p class="nets">${L.nets.map((x) => `<span class="${x.net < 0 ? 'neg' : 'pos'}">${esc(x.name)} ${fmtNet(x.net)}</span>`).join('')}</p>
      ${L.sent.length ? sentList(L.sent, 'last') : ''}
    </section>`;
  }

  function viewSpectate() {
    return `<section class="panel">
      <p>Tu ne joues pas cette main (en pause ou sans jetons). Rien à envoyer à Claude.</p>
      <button class="btn primary big" data-a="next-only">Main suivante ${K('Entrée')}</button>
      <button class="btn ghost wide" data-a="abort">Effacer cette main (le jeton D ne bouge pas)</button>
    </section>`;
  }

  function picker(need, title, used, skipLabel) {
    const taken = new Set(used.concat(ui.pick));
    const ranks = E.RANKS.map((r) => {
      const avail = E.SUITS.some((s) => !taken.has(r + s));
      return `<button class="rk ${ui.rank === r ? 'on' : ''}" data-a="rank" data-r="${r}" ${avail ? '' : 'disabled'}>${r === 'T' ? '10' + K('T') : r}</button>`;
    }).join('');
    const suits = E.SUITS.map((s) => {
      const dis = !ui.rank || taken.has(ui.rank + s);
      return `<button class="su s-${s}" data-a="suit" data-s="${s}" ${dis ? 'disabled' : ''}>${SUIT_SYM[s]}<small>${SUIT_NAME[s]}</small>${K(s.toUpperCase())}</button>`;
    }).join('');
    const slots = Array.from({ length: need }, (_, i) => (ui.pick[i]
      ? `<button class="slot" data-a="unpick" data-i="${i}" title="Retirer">${cardHtml(ui.pick[i])}</button>`
      : '<span class="card empty"></span>')).join('');
    return `<section class="panel picker">
      <div class="pk-title">${title}</div>
      <div class="slots">${slots}</div>
      <p class="hint">${ui.rank ? 'Choisis la couleur.' : 'Touche la valeur, puis la couleur.'} <span class="pc-only">Au clavier : <kbd>A</kbd> puis <kbd>C</kbd> = A♥.</span></p>
      <div class="ranks">${ranks}</div>
      <div class="suits">${suits}</div>
      ${skipLabel ? `<button class="btn ghost wide" data-a="skip-board">${skipLabel}</button>` : ''}
    </section>`;
  }

  function viewBoard(h) {
    const need = h.street === 0 ? 3 : 1;
    const name = ['Flop', 'Turn', 'River'][h.street];
    const skip = E.meLive(h) ? null : 'Passer (cartes inconnues)';
    let out = picker(need, `${name} : ${need === 3 ? 'les 3 cartes' : 'la carte'}`, h.board.concat(h.cards), skip);
    if (!E.meLive(h)) out += foldedBanner();
    return out;
  }

  function foldedBanner() {
    return `<div class="banner muted">
      <div>Tu es couché. Continue la saisie pour suivre les tapis, ou termine directement.</div>
      <div class="row"><button class="btn" data-a="force-sd">Terminer : choisir le gagnant</button></div>
    </div>`;
  }

  function viewAction(h) {
    const id = h.toAct;
    const mine = id === h.meId;
    const meLive = E.meLive(h);
    let out = '';
    if (mine) {
      const msg = E.buildMessage(state);
      out += `<section class="myturn">
        <div class="mt-label">À toi · envoie ceci à Claude</div>
        <pre class="msg" id="msg">${esc(msg)}</pre>
        <div class="row">
          <button class="btn primary" data-a="copy-msg">Copier ${K('C')}</button>
          ${canShare ? '<button class="btn" data-a="share-msg">Partager…</button>' : ''}
        </div>
        <p class="hint">Le message est déjà copié : colle-le dans Claude. Ensuite, touche plus bas ce que tu joues (l'appli en a besoin pour calculer le pot).</p>
      </section>`;
    } else if (h.meIn && !meLive) {
      out += foldedBanner();
    }
    out += actionPanel(h, id, mine, meLive);
    return out;
  }

  function actionPanel(h, id, mine, meLive) {
    const o = E.options(h, id);
    const head = mine ? '<b>Ce que tu joues</b>' : `À <b>${esc(h.names[id])}</b> <span class="pos-inline">${h.pos[id]}</span>`;
    const call = o.canCheck
      ? `<button class="btn" data-a="act" data-t="x">Check ${K('X')}</button>`
      : `<button class="btn" data-a="act" data-t="s">${o.toCall >= o.st ? 'Suit (tapis)' : 'Suit ' + o.toCall} ${K('S')}</button>`;
    let out = `<section class="act ${mine ? 'mine' : ''}">
      <div class="act-head"><span>${head}</span><span class="muted">tapis ${o.st}${o.toCall ? ` · à suivre <b>${o.toCall}</b>` : ''}</span></div>
      <div class="act-btns">
        <button class="btn fold" data-a="act" data-t="f">Couché ${K('F')}</button>
        ${call}
        ${o.canRaise ? `<button class="btn ${ui.sizing ? 'on' : ''}" data-a="sizing">${o.isBet ? 'Mise…' : 'Relance…'} ${K('R')}</button>` : '<span></span>'}
        <button class="btn allin" data-a="act" data-t="AI">Tapis ${K('A')}<small>${o.maxTo}</small></button>
      </div>`;
    if (ui.sizing && o.canRaise) {
      const val = ui.amount || o.minTo;
      const prefix = o.isBet ? 'Miser' : 'Relancer à';
      const hints = E.sizeHints(h, id);
      out += `<div class="sizing">
        ${hints.length ? `<div class="hints">${hints.map((x) => `<button class="chip ${String(x.to) === String(val) ? 'on' : ''}" data-a="hint" data-v="${x.to}">${x.label}<small>${x.to}</small></button>`).join('')}</div>` : ''}
        <div class="row amt-row">
          <input class="in amt" id="amt" type="number" inputmode="numeric" value="${esc(val)}" min="${o.minTo}" max="${o.maxTo}" aria-label="Montant">
          <button class="btn primary" data-a="act" data-t="r" id="amt-go" data-prefix="${prefix}">${prefix} ${esc(val)}</button>
        </div>
        <p class="hint">${o.isBet ? 'Montant de la mise.' : 'Total misé sur ce tour (relance « à »).'} Minimum conseillé : ${o.minTo}.</p>
      </div>`;
    }
    if (!mine && meLive) out += `<button class="btn ghost wide" data-a="skip-to-me">Check / couché jusqu'à moi ${K('J')}</button>`;
    return out + '</section>';
  }

  function viewShowdown(h) {
    const cand = E.showdownCandidates(h);
    const pots = h.pots.map((p, i) => {
      const label = h.pots.length > 1 ? (i === 0 ? 'Pot principal' : 'Pot annexe') : 'Pot';
      const who = p.won ? '→ ' + p.won.map((id) => esc(h.names[id])).join(', ') : p.elig.map((id) => esc(h.names[id])).join(', ');
      return `<li class="${p.won ? 'won' : ''}"><span>${label} <b>${p.amount}</b></span><span class="muted">${who}</span></li>`;
    }).join('');
    return `<section class="panel">
      <h2>Qui gagne ?</h2>
      <ul class="pots">${pots}</ul>
      <p class="hint">Touche la meilleure main. Plusieurs joueurs = partage du pot.</p>
      <div class="cands">${cand.map((id, i) => `<button class="cand ${ui.sel.includes(id) ? 'on' : ''}" data-a="sel" data-id="${id}"><span class="pos">${h.pos[id]}</span>${esc(h.names[id])}${id === h.meId ? ' <em>moi</em>' : ''}${i < 9 ? `<kbd class="k right">${i + 1}</kbd>` : ''}</button>`).join('')}</div>
      <button class="btn primary big" data-a="declare" ${ui.sel.length ? '' : 'disabled'}>Valider ${K('Entrée')}</button>
    </section>`;
  }

  function viewDone(h) {
    const S = E.handSummary(h);
    return `<section class="panel done">
      <h2>Main #${h.no} terminée</h2>
      <ul class="res">${S.pots.map((p) => `<li>${p.label} <b>${p.amount}</b> → ${p.winners.map(esc).join(', ')}</li>`).join('')}</ul>
      <button class="btn primary big" data-a="next">Main suivante ${K('Entrée')}</button>
      <button class="btn ghost wide" data-a="end-only">Modifier la table d'abord</button>
    </section>`;
  }

  function sentList(list, src) {
    return `<details class="sent">
      <summary>Messages envoyés à Claude (${list.length})</summary>
      ${list.map((t, i) => `<div class="sent-item"><pre>${esc(t)}</pre><button class="chip" data-a="copy-sent" data-src="${src}" data-i="${i}">Copier</button></div>`).join('')}
    </details>`;
  }

  /* ---- colonne de droite (PC) : ma main, combinaisons, raccourcis */

  function viewSide() {
    const h = state && state.hand;
    const cur = h && h.cards.length === 2 ? HANDS.describe(h.cards, h.board) : null;
    let out = '<div class="side-a"><section class="side-box"><h3>Ta main</h3>';
    if (cur) {
      out += `<div class="now">${esc(cur.best.name)}</div>`;
      if (cur.note) out += `<p class="hint">${cur.note}</p>`;
      if (cur.shared) out += '<p class="warn small">Cette combinaison est entièrement sur le tableau : tous les joueurs l\'ont aussi.</p>';
      out += cur.draws.map((d) => `<p class="draw">${esc(d)}</p>`).join('');
    } else {
      out += '<p class="hint">Ta combinaison s\'affichera ici dès que tu auras choisi tes cartes.</p>';
    }
    out += '</section>';

    out += `<section class="side-box"><h3>Combinaisons <small>de la plus forte à la plus faible</small></h3><ol class="combos">`;
    out += HANDS.CATEGORIES.slice().reverse().map((c) => `<li class="${cur && cur.best.cat === c.id ? 'on' : ''}">
        <div class="cb-top"><b>${c.name}</b><span>${c.ex.map((x) => cardHtml(x, 'xs')).join('')}</span></div>
        <small>${c.desc}</small>
      </li>`).join('');
    out += '</ol></section></div>';

    out += `<div class="side-b"><section class="side-box keys">
      <h3>Raccourcis clavier</h3>
      <p class="hint">Les mêmes lettres que dans les messages pour Claude.</p>
      <dl>
        <dt><kbd>F</kbd></dt><dd>Couché</dd>
        <dt><kbd>X</kbd></dt><dd>Check</dd>
        <dt><kbd>S</kbd></dt><dd>Suit</dd>
        <dt><kbd>R</kbd></dt><dd>Mise ou relance : tape le montant, puis <kbd>Entrée</kbd></dd>
        <dt><kbd>A</kbd></dt><dd>Tapis</dd>
        <dt><kbd>J</kbd></dt><dd>Check / couché jusqu'à moi</dd>
        <dt><kbd>C</kbd></dt><dd>Copier le message pour Claude</dd>
        <dt>Cartes</dt><dd>La valeur puis la couleur : <kbd>A</kbd> puis <kbd>C</kbd> = A♥.<br>Valeurs A K Q J T 9…2 · couleurs <kbd>P</kbd> ♠ <kbd>C</kbd> ♥ <kbd>K</kbd> ♦ <kbd>T</kbd> ♣ · <kbd>⌫</kbd> efface</dd>
        <dt><kbd>1</kbd> <kbd>2</kbd>…</dt><dd>Qui gagne : choisir le joueur</dd>
        <dt><kbd>Entrée</kbd></dt><dd>Distribuer, valider, main suivante</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Annuler la dernière action</dd>
        <dt><kbd>Échap</kbd></dt><dd>Fermer le montant ou la valeur choisie</dd>
      </dl>
    </section></div>`;
    return out;
  }

  /* ---- onglet Table */

  function viewTable() {
    const h = state.hand;
    const locked = !!h;
    const plan = E.planNextHand(state);
    const btnId = h ? h.btnId : plan.ok ? plan.btnId : null;
    let out = `<section class="panel">
      <h2>Joueurs <span class="muted">${state.players.length}/${E.MAX_PLAYERS}</span></h2>
      <p class="hint">${locked ? 'Main en cours : tu peux ajouter un joueur qui arrive (il jouera à la main suivante) et changer les pseudos. Le reste se modifie entre deux mains.' : 'Les joueurs dans l\'ordre des places. Touche un joueur pour corriger ses jetons (comme affichés sur le site), le mettre en pause, le faire partir ou lui donner le jeton D.'}</p>
      <ul class="players">`;
    state.players.forEach((p) => {
      const pos = h ? h.pos[p.id] : plan.ok ? plan.pos[p.id] : null;
      const badges = [
        p.me ? '<span class="badge me">moi</span>' : '',
        p.id === btnId ? '<span class="badge dealer">D</span>' : '',
        p.paused ? '<span class="badge">pause</span>' : '',
        !p.paused && p.stack === 0 ? '<span class="badge out">0 jeton</span>' : '',
        h && E.isActive(p) && !h.order.includes(p.id) ? '<span class="badge new">prochaine main</span>' : '',
      ].join('');
      const open = ui.edit === p.id;
      out += `<li class="${open ? 'open' : ''} ${E.isActive(p) ? '' : 'inactive'}">
        <button class="pl-row" data-a="edit" data-id="${p.id}">
          <span class="pos">${pos || '—'}</span>
          <span class="nm">${esc(p.name)} ${badges}</span>
          <span class="stk">${p.stack}</span>
        </button>`;
      if (open) {
        out += `<div class="edit">
          <div class="grid2">
            <label class="field">Pseudo<input class="in" id="ed-name" value="${esc(p.name)}" maxlength="18"></label>
            <label class="field">Tapis<input class="in" id="ed-stack" type="number" inputmode="numeric" min="0" value="${p.stack}" ${locked ? 'disabled' : ''}></label>
          </div>
          <div class="btn-grid">
            <button class="btn primary" data-a="ed-save" data-id="${p.id}">Enregistrer</button>
            <button class="btn" data-a="ed-btn" data-id="${p.id}" ${locked ? 'disabled' : ''}>Il a le jeton D à la prochaine main</button>
            <button class="btn" data-a="ed-pause" data-id="${p.id}" ${locked ? 'disabled' : ''}>${p.paused ? 'Revient en jeu' : 'Pause (ne joue pas)'}</button>
            <button class="btn" data-a="ed-me" data-id="${p.id}" ${locked || p.me ? 'disabled' : ''}>C'est moi</button>
            <button class="btn danger" data-a="ed-remove" data-id="${p.id}" ${locked ? 'disabled' : ''}>Il quitte la table</button>
          </div>
        </div>`;
      }
      out += '</li>';
    });
    out += '</ul></section>';

    const full = state.players.length >= E.MAX_PLAYERS;
    out += `<section class="panel">
      <h2>Un joueur arrive</h2>
      <div class="grid2">
        <label class="field">Pseudo<input class="in" id="add-name" placeholder="Pseudo" maxlength="18" ${full ? 'disabled' : ''}></label>
        <label class="field">Jetons<input class="in" id="add-stack" type="number" inputmode="numeric" min="1" placeholder="ex : 2550" ${full ? 'disabled' : ''}></label>
      </div>
      <label class="field">S'assoit après
        <select class="in" id="add-after" ${full ? 'disabled' : ''}>
          ${state.players.map((p, i) => `<option value="${p.id}" ${i === state.players.length - 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </label>
      <button class="btn primary wide" data-a="add" ${full ? 'disabled' : ''}>Ajouter à la table</button>
      ${full ? `<p class="hint">${E.MAX_PLAYERS} joueurs maximum.</p>` : `<p class="hint">${locked ? 'Une main est en cours : il jouera à partir de la main suivante.' : 'Il jouera dès la prochaine main.'}</p>`}
    </section>`;
    return out;
  }

  /* ---- onglet Prompt */

  function viewPrompt() {
    return `<section class="panel">
      <h2>Prompt de départ</h2>
      <p class="hint">À coller au début d'une nouvelle conversation avec Claude (ou dans les instructions d'un projet Claude). Il s'adapte à la table actuelle.</p>
      <pre class="msg prompt">${esc(E.buildPrompt(state))}</pre>
      <div class="row">
        <button class="btn primary" data-a="copy-prompt">Copier</button>
        ${canShare ? '<button class="btn" data-a="share-prompt">Partager…</button>' : ''}
      </div>
      <p class="hint">Tu peux le recopier dans une nouvelle conversation à tout moment, même en cours de partie : les tapis sont redonnés à chaque main.</p>
    </section>`;
  }

  /* ---- onglet Réglages */

  function viewSettings() {
    const S = state.settings;
    return `<section class="panel">
      <h2>Blindes et ante</h2>
      <div class="grid3">
        <label class="field">Petite blinde<input class="in" type="number" inputmode="numeric" min="1" data-set="sb" value="${S.sb}"></label>
        <label class="field">Grosse blinde<input class="in" type="number" inputmode="numeric" min="1" data-set="bb" value="${S.bb}"></label>
        <label class="field">Ante<input class="in" type="number" inputmode="numeric" min="0" data-set="ante" value="${S.ante || 0}"></label>
      </div>
      <label class="field">Qui paie l'ante ?<select class="in" data-set="anteType">
        <option value="chacun" ${S.anteType !== 'bb' ? 'selected' : ''}>Chaque joueur</option>
        <option value="bb" ${S.anteType === 'bb' ? 'selected' : ''}>La grosse blinde, pour toute la table</option>
      </select></label>
      <p class="hint">Quand les blindes ou l'ante changent : le changement s'applique à la main suivante et Claude en est prévenu tout seul. Ante : petite mise obligatoire en plus des blindes, souvent en tournoi quand les blindes montent. Laisse 0 s'il n'y en a pas. Sur le site, soit chaque joueur pose l'ante avant les cartes, soit seule la grosse blinde la paie pour toute la table.</p>
    </section>
    <section class="panel">
      <h2>Partie</h2>
      <button class="btn danger wide" data-a="new-game">Nouvelle partie (efface tout)</button>
      <details class="help">
        <summary>Comment ça marche</summary>
        <ol>
          <li>Copie le prompt de départ dans une nouvelle conversation Claude.</li>
          <li>À chaque main : « Distribuer », choisis tes 2 cartes, puis touche ce que fait chaque joueur, dans l'ordre où il parle.</li>
          <li>Quand c'est à toi, le message est déjà copié : colle-le dans Claude, puis touche ce que tu joues.</li>
          <li>Au flop, à la turn et à la river, choisis les cartes du tableau. Le pot et les tapis se calculent tout seuls.</li>
          <li>En fin de main, touche le gagnant : ses jetons sont mis à jour.</li>
        </ol>
        <p>« ↶ Annuler » revient en arrière d'une action. Tout est enregistré dans ce navigateur, même si tu fermes la page.</p>
      </details>
    </section>`;
  }

  /* ------------------------------------------------------------ actions */

  const handlers = {
    tab(d) {
      ui.tab = d.tab;
      ui.edit = null;
      render();
      window.scrollTo(0, 0);
    },
    undo() {
      if (!hist.length) return;
      state = JSON.parse(hist.pop());
      resetTransient();
      ui.autoKey = null;
      save();
      render();
      toast('Dernière action annulée');
    },

    // nouvelle partie
    'setup-n'(d) {
      const s = ui.setup;
      s.n = Math.max(2, Math.min(E.MAX_PLAYERS, s.n + Number(d.d)));
      if (s.me >= s.n) s.me = 0;
      if (s.btn >= s.n) s.btn = 0;
      render();
    },
    'setup-me'(d) { ui.setup.me = Number(d.i); render(); },

    'setup-btn'(d) { ui.setup.btn = Number(d.i); render(); },
    'setup-go'() {
      const s = ui.setup;
      const sb = Number(s.sb), bb = Number(s.bb), ante = Number(s.ante || 0);
      if (!(sb > 0 && bb > 0)) return toast('Les blindes doivent être positives.');
      if (!(ante >= 0)) return toast("L'ante doit être 0 ou plus.");
      if (sb > bb) return toast('La petite blinde doit être ≤ à la grosse.');
      const stacks = s.stacks.slice(0, s.n).map(Number);
      const missing = stacks.findIndex((x) => !(x > 0));
      if (missing >= 0) return toast(`Indique les jetons de ${s.names[missing] || 'chaque joueur'}.`);
      state = E.newGame({ names: s.names.slice(0, s.n), stacks, meIndex: s.me, btnIndex: s.btn, sb, bb, ante, anteType: s.anteType });
      hist = [];
      ui.tab = 'main';
      save();
      render();
      window.scrollTo(0, 0);
    },

    // prompt
    'copy-prompt'() {
      copy(E.buildPrompt(state), 'Prompt copié : colle-le dans une nouvelle conversation');
      E.markConversationStart(state);
      save();
      render();
    },
    'share-prompt'() {
      share(E.buildPrompt(state));
      E.markConversationStart(state);
      save();
      render();
    },

    // main
    deal() { cmd((s) => E.startHand(s)); },
    rank(d) { ui.rank = d.r; render(); },
    suit(d) {
      const h = state.hand;
      if (!h || !ui.rank) return;
      ui.pick.push(ui.rank + d.s);
      ui.rank = null;
      const need = h.phase === 'cards' ? 2 : h.street === 0 ? 3 : 1;
      if (ui.pick.length < need) return render();
      const cards = ui.pick.slice();
      const r = cmd((s) => (s.hand.phase === 'cards' ? E.chooseCards(s, cards) : E.addStreet(s, cards)));
      if (r && r.ok === false) { ui.pick = []; render(); }
    },
    unpick(d) { ui.pick.splice(Number(d.i), 1); render(); },
    'skip-board'() { cmd((s) => E.addStreet(s, [])); },
    act(d) {
      const a = { type: d.t };
      if (d.t === 'r') {
        const el = $('amt');
        a.to = el ? Number(el.value) : NaN;
      }
      cmd((s) => E.applyAction(s, a));
    },
    sizing() {
      ui.sizing = !ui.sizing;
      ui.amount = '';
      render();
      if (ui.sizing) {
        const el = $('amt');
        if (el) { el.focus(); el.select(); }
      }
    },
    hint(d) { ui.amount = d.v; render(); },
    'skip-to-me'() { cmd((s) => E.checkFoldUntilMe(s)); },
    'force-sd'() { cmd((s) => E.forceShowdown(s)); },
    sel(d) {
      const i = ui.sel.indexOf(d.id);
      if (i >= 0) ui.sel.splice(i, 1);
      else ui.sel.push(d.id);
      render();
    },
    declare() {
      const w = ui.sel.slice();
      cmd((s) => E.declareWinners(s, w));
    },
    next() {
      let warn = null;
      cmd((s) => {
        const r = E.endHand(s);
        if (!r.ok) return r;
        const r2 = E.startHand(s);
        if (!r2.ok) warn = r2.err;
        return { ok: true };
      });
      if (warn) toast(warn);
    },
    'next-only'() { cmd((s) => E.endHand(s)); },
    'end-only'() {
      cmd((s) => E.endHand(s));
      ui.tab = 'table';
      render();
    },
    abort() {
      if (!window.confirm('Effacer la saisie de cette main ? Les jetons et le jeton D reviennent à leur état d\'avant la main. (Pour te coucher, utilise plutôt « Couché ».)')) return;
      cmd((s) => E.abortHand(s));
    },
    'copy-msg'() { copy(E.buildMessage(state), 'Message copié'); },
    'share-msg'() { share(E.buildMessage(state)); },
    'copy-sent'(d) {
      const list = d.src === 'last' ? state.last && state.last.sent : state.hand && state.hand.sent;
      if (list && list[Number(d.i)] != null) copy(list[Number(d.i)]);
    },
    // table
    edit(d) { ui.edit = ui.edit === d.id ? null : d.id; render(); },
    'ed-save'(d) {
      const name = $('ed-name').value;
      const stackEl = $('ed-stack');
      const patch = { name };
      if (stackEl && !stackEl.disabled) patch.stack = stackEl.value;
      const r = cmd((s) => E.updatePlayer(s, d.id, patch));
      if (r && r.ok) { ui.edit = null; render(); toast('Enregistré'); }
    },
    'ed-btn'(d) {
      const r = cmd((s) => E.setButtonNext(s, d.id));
      if (r && r.ok) toast('Jeton D placé pour la prochaine main');
    },
    'ed-pause'(d) { cmd((s) => E.togglePause(s, d.id)); },
    'ed-me'(d) { cmd((s) => E.setMe(s, d.id)); },
    'ed-remove'(d) {
      const p = player(d.id);
      if (!p || !window.confirm(`${p.name} quitte la table ?`)) return;
      const r = cmd((s) => E.removePlayer(s, d.id));
      if (r && r.ok) { ui.edit = null; render(); toast(`${p.name} a quitté la table`); }
    },
    add() {
      const name = $('add-name').value;
      const stack = $('add-stack').value;
      const afterId = $('add-after').value;
      const r = cmd((s) => E.addPlayer(s, { name, stack, afterId }));
      if (r && r.ok) toast('Joueur ajouté : il jouera dès la prochaine main');
    },

    // réglages
    'new-game'() {
      if (!window.confirm('Effacer la partie en cours et en commencer une nouvelle ?')) return;
      const s = defaultSetup();
      s.n = Math.max(2, Math.min(E.MAX_PLAYERS, state.players.length));
      state.players.forEach((p, i) => { s.names[i] = p.name; s.stacks[i] = p.stack; if (p.me) s.me = i; });
      s.sb = state.settings.sb;
      s.bb = state.settings.bb;
      s.ante = state.settings.ante || 0;
      s.anteType = state.settings.anteType || 'chacun';
      ui.setup = s;
      state = null;
      hist = [];
      ui.tab = 'main';
      save();
      render();
    },
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.a];
    if (!fn) return;
    ev.preventDefault();
    fn(el.dataset, el);
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.setupName != null) {
      const i = Number(t.dataset.setupName);
      ui.setup.names[i] = t.value;
      document.querySelectorAll(`[data-setup-sel] option[value="${i}"]`).forEach((o) => { o.textContent = (i + 1) + '. ' + t.value; });
    } else if (t.dataset.setupStack != null) ui.setup.stacks[Number(t.dataset.setupStack)] = t.value;
    else if (t.dataset.setup) ui.setup[t.dataset.setup] = t.value;
    else if (t.id === 'amt') {
      ui.amount = t.value;
      const b = $('amt-go');
      if (b) b.textContent = b.dataset.prefix + ' ' + (t.value || '…');
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.setupSel) { ui.setup[t.dataset.setupSel] = Number(t.value); return; }
    if (t.dataset.setupStr) { ui.setup[t.dataset.setupStr] = t.value; return; }
    const k = t.dataset.set;
    if (!k || !state) return;
    // sans redessiner l'écran, pour ne pas perdre le champ suivant que l'on vient de toucher
    const r = cmd((s) => E.updateSettings(s, { [k]: t.value }), { quiet: true });
    if (r && r.ok) toast('Enregistré pour la prochaine main');
  });

  /* ------------------------------------------------------------ clavier */

  const RANK_KEYS = { a: 'A', k: 'K', q: 'Q', j: 'J', t: 'T', 1: 'T', 0: 'T', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
  const SUIT_KEYS = { p: 'p', c: 'c', k: 'k', t: 't' };

  function onKey(ev) {
    const t = ev.target;
    const k = ev.key;
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k.toLowerCase() === 'z' && !inField) {
      ev.preventDefault();
      return handlers.undo();
    }
    if (inField) {
      if (k === 'Enter') {
        if (t.id === 'amt') { ev.preventDefault(); handlers.act({ t: 'r' }); }
        else if (t.id === 'add-name' || t.id === 'add-stack') { ev.preventDefault(); handlers.add(); }
      } else if (k === 'Escape' && t.id === 'amt') { ui.sizing = false; render(); }
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !state || ui.tab !== 'main') return;
    if (t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return; // le bouton s'en charge
    const h = state.hand;
    const key = k.toLowerCase();
    const run = (fn) => { ev.preventDefault(); fn(); };

    if (!h) { if (k === 'Enter' && E.planNextHand(state).ok) run(handlers.deal); return; }

    if (h.phase === 'cards' || h.phase === 'board') {
      if (k === 'Backspace') return run(() => { if (ui.rank) ui.rank = null; else ui.pick.pop(); render(); });
      if (k === 'Escape') return run(() => { ui.rank = null; render(); });
      if (!ui.rank && RANK_KEYS[key]) return run(() => handlers.rank({ r: RANK_KEYS[key] }));
      if (ui.rank && SUIT_KEYS[key]) {
        const btn = document.querySelector(`[data-a="suit"][data-s="${SUIT_KEYS[key]}"]`);
        if (btn && !btn.disabled) run(() => handlers.suit({ s: SUIT_KEYS[key] }));
        else toast('Cette carte est déjà prise.');
      }
      return;
    }

    if (h.phase === 'action') {
      const o = E.options(h, h.toAct);
      const mine = h.toAct === h.meId;
      if (key === 'f') return run(() => handlers.act({ t: 'f' }));
      if (key === 'x') return run(() => (o.canCheck ? handlers.act({ t: 'x' }) : toast('Check impossible : il faut suivre ou se coucher.')));
      if (key === 's') return run(() => handlers.act({ t: o.canCheck ? 'x' : 's' }));
      if ((key === 'r' || key === 'b') && o.canRaise) return run(() => { if (!ui.sizing) handlers.sizing(); else { const el = $('amt'); if (el) { el.focus(); el.select(); } } });
      if (key === 'a') return run(() => handlers.act({ t: 'AI' }));
      if (key === 'j' && !mine && E.meLive(h)) return run(handlers['skip-to-me']);
      if (key === 'c' && mine) return run(handlers['copy-msg']);
      if (k === 'Escape' && ui.sizing) return run(() => { ui.sizing = false; render(); });
      return;
    }

    if (h.phase === 'showdown') {
      const n = Number(k);
      if (n >= 1 && n <= 9) {
        const id = E.showdownCandidates(h)[n - 1];
        if (id) run(() => handlers.sel({ id }));
        return;
      }
      if (k === 'Enter' && ui.sel.length) return run(handlers.declare);
      return;
    }

    if (k === 'Enter' && h.phase === 'done') return run(handlers.next);
    if (k === 'Enter' && h.phase === 'spectate') return run(handlers['next-only']);
  }

  document.addEventListener('keydown', onKey);

  render();
})();

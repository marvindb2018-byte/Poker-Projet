/* Poker → Claude : interface. Tout est stocké dans le navigateur (localStorage). */
(function () {
  'use strict';

  const E = window.PokerEngine;
  const HANDS = window.PokerHands;
  const ODDS = window.PokerOdds;
  const PROF = window.PokerProfiles;
  const LEARN = window.PokerLearn;
  const ADV = window.PokerAdvisor;
  const KEY = 'pokercode:v1';
  const HKEY = 'pokercode:hist:v1';
  const MKEY = 'pokercode:mode'; // 'manuel' ou 'auto'
  const CKEY = 'pokercode:crop'; // recadrage de la capture (fractions de l'image)
  const PKEY = 'pokercode:profiles:v1'; // façon de jouer de chaque pseudo, gardée d'une partie à l'autre
  const XKEY = 'pokercode:plainOpen'; // explications « En clair » que j'ai laissées ouvertes (par sorte)
  const LKEY = 'pokercode:learned'; // notions que je connais (onglet Apprendre)
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

  if (state && !state.gid) state.gid = Math.random().toString(36).slice(2, 10);
  let profDb = parse(store.get(PKEY));
  if (!profDb || !profDb.p) profDb = { v: 1, p: {}, recent: [] };

  let mode = store.get(MKEY) === 'auto' ? 'auto' : 'manuel';
  const plainOpen = new Set(parse(store.get(XKEY)) || []);
  const learned = new Set(parse(store.get(LKEY)) || []);
  const saveLearned = () => store.set(LKEY, JSON.stringify([...learned]));
  let crop = parse(store.get(CKEY));

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

  // Bulles d'aide : un « ? » à côté d'un mot ; survol (PC) ou toucher (téléphone) pour lire l'explication.
  const TIPS = {
    sb: "Petite blinde (SB) : mise obligatoire payée avant de voir ses cartes par le joueur juste à gauche du jeton D. Elle vaut en général la moitié de la grosse blinde.",
    bb: "Grosse blinde (BB) : mise obligatoire du 2e joueur à gauche du jeton D. C'est le prix minimum pour jouer la main : les autres doivent au moins la suivre pour rester dans le coup. En tournoi, les blindes augmentent régulièrement.",
    ante: "Ante : petite mise obligatoire posée avant la distribution, en plus des blindes. Elle grossit le pot dès le départ, ce qui pousse à jouer plus de mains. On la trouve surtout en tournoi, une fois que les blindes ont bien monté (souvent à partir du milieu du tournoi), et rarement en partie classique. Mets 0 s'il n'y en a pas.",
    anteType: "Ante classique : chaque joueur paie l'ante avant les cartes. Ante grosse blinde (« BB ante ») : seul le joueur en grosse blinde la paie, pour toute la table, en général du montant de la grosse blinde. Cette 2e version est fréquente dans les tournois en ligne récents. Sur le site : si chaque joueur pose un petit jeton avant les cartes, c'est l'ante classique.",
    stack: "Les jetons que le joueur a devant lui (son « tapis »), tels qu'affichés sur le site à côté de son pseudo. Ils comptent beaucoup : on ne joue pas pareil contre quelqu'un qui peut tout miser que contre un joueur qui n'a presque plus rien.",
    dealer: "Le jeton « D » (dealer, ou « bouton ») marque le joueur qui distribue, même si en ligne c'est le logiciel qui le fait. Les deux joueurs à sa gauche paient les blindes. C'est la meilleure place : il parle en dernier après le flop. Il avance d'une place à chaque main.",
    positions: "UTG (« under the gun ») parle en premier avant le flop : c'est la place la plus délicate. MP = milieu de table. CO (cut-off) = juste avant le bouton. BTN = joueur avec le jeton D, il parle en dernier après le flop. SB et BB = les blindes : elles parlent en dernier avant le flop, mais en premier après.",
    actions: "Couché : tu abandonnes la main (et ce que tu as déjà misé). Check : tu passes sans miser, possible seulement si personne n'a misé avant toi. Suit : tu mets autant que la mise en cours. Mise / Relance : tu mets plus que les autres (le montant est le total misé sur ce tour). Tapis : tu mets tous tes jetons.",
    instant: "Calculs faits par l'appli, sans IA, en une fraction de seconde. Avant le flop : le tableau des mains de départ (onglet Mains), adapté au relanceur quand on connaît sa façon de jouer. La probabilité de gagner est calculée contre les mains probables de chacun : un joueur qui a relancé a surtout de bonnes mains, et un joueur qui mise après le flop a souvent touché quelque chose. Plus l'appli a vu jouer un joueur, plus l'estimation est juste. « Il faut x % » : la part du pot qu'il faut gagner pour que suivre soit rentable à long terme.",
    vsraise: "Face à une relance : ce que tu fais quand un joueur a déjà relancé avant toi, à une autre place que la grosse blinde.",
    shown: "Si des joueurs montrent leurs cartes à la fin, tape-les : la valeur puis la couleur (p pique, c cœur, k carreau, t trèfle), ex : « ac kk » = A♥ K♦. Quand toutes les mains sont connues, l'appli trouve seule le gagnant. Surtout, elle vérifie ses prévisions : ce joueur bluffait-il ? Relance-t-il avec des mains plus faibles que prévu ? C'est ce qui affine le plus ses conseils.",
    profiles: "L'appli retient ce que fait chaque joueur à chaque main saisie : combien de mains il joue, combien il en relance, s'il se couche souvent face à une mise. Après 8 mains, son style s'affiche (serré = joue peu de mains, large = en joue beaucoup ; passif = suit plus qu'il ne relance, agressif = relance souvent). Les profils sont rangés par pseudo et gardés d'une partie à l'autre, sur ce navigateur.",
    sidepot: "Pot annexe : un joueur à tapis ne peut gagner, chez chaque adversaire, que ce qu'il a lui-même misé. Le reste forme un pot annexe, disputé seulement entre les joueurs qui avaient plus de jetons. L'appli fait le calcul : désigne juste la meilleure main.",
    hand: "Ta meilleure combinaison avec tes 2 cartes et les cartes du tableau. Un « tirage », c'est quand il te manque une seule carte pour faire une couleur ou une quinte : elle peut encore tomber à la turn ou à la river.",
  };
  const tip = (key) => `<button type="button" class="help-q" data-tip="${key}" aria-label="Explication">?</button>`;

  // Une phrase par position, en bulle au survol (ou au toucher) de l'étiquette
  const POS_TIPS = {
    UTG: "UTG (« under the gun ») : premier à parler avant le flop, la place la plus difficile, on n'y joue que de bonnes mains.",
    'UTG+1': 'UTG+1 : 2e à parler avant le flop, presque aussi mal placé qu\'UTG, on y joue serré.',
    'UTG+2': 'UTG+2 : 3e à parler avant le flop, encore une place où l\'on joue serré.',
    MP: 'MP (« middle position ») : milieu de table, on peut y jouer un peu plus de mains qu\'en UTG.',
    'MP+1': 'MP+1 : milieu de table, un peu mieux placé que MP.',
    'MP+2': 'MP+2 : milieu de table, juste avant le cut-off.',
    CO: 'CO (« cut-off ») : juste avant le bouton, une bonne place où l\'on peut jouer plus de mains.',
    BTN: 'BTN (bouton, jeton D) : parle en dernier après le flop, la meilleure place de la table.',
    SB: 'SB (petite blinde) : paie d\'office la petite blinde et parle en premier après le flop, une place difficile.',
    BB: 'BB (grosse blinde) : paie d\'office la grosse blinde, parle en dernier avant le flop mais en premier après.',
  };
  const posTag = (pos, cls) => (pos ? `<span class="${cls} tipped" data-tip="pos:${pos}">${pos}</span>` : `<span class="${cls}">—</span>`);

  function tipText(key) {
    if (key.startsWith('pos:')) return POS_TIPS[key.slice(4)] || '';
    if (key.startsWith('prof:')) {
      const rec = profDb.p[key.slice(5)];
      if (!rec) return '';
      const pr = PROF.profile(rec);
      if (!pr) return `${rec.name} : seulement ${rec.n} main${rec.n > 1 ? 's' : ''} observée${rec.n > 1 ? 's' : ''}. Son style s'affichera à partir de ${PROF.MIN_HANDS} mains.`;
      return `${rec.name} (${pr.short}, sur ${pr.n} mains) : ${pr.text}`;
    }
    return TIPS[key] || '';
  }

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

  /* ---- profils des joueurs */

  const profRec = (name) => profDb.p[PROF.keyFor(name, state && state.gid)];
  const profOf = (name) => PROF.profile(profRec(name));

  // Main terminée : on ajoute ce que chacun a fait à son profil (une main rejouée après « Annuler » remplace l'ancienne).
  function recordHand(s) {
    const h = s.hand;
    if (!h || h.phase !== 'done' || !h.meIn) return;
    profDb = PROF.record(profDb, s.gid + ':' + h.no, h, s.gid);
    store.set(PKEY, JSON.stringify(profDb));
    eqCache.clear();
  }

  // Nouvelle main : les profils connus vont en tête du premier message pour Claude.
  function startHand(s) {
    const r = E.startHand(s);
    if (r.ok && s.hand && s.hand.meIn) {
      const line = PROF.claudeLine(s.hand, profRec);
      if (line) s.hand.events.push({ t: 'hdr', text: line });
    }
    return r;
  }

  // Étiquette de style (« large · passif ») avec sa bulle d'explication
  function styleTag(name, cls) {
    const pr = profOf(name);
    const rec = profRec(name);
    const key = PROF.keyFor(name, state.gid);
    if (!pr) return rec && rec.n ? `<span class="${cls} unknown tipped" data-tip="prof:${esc(key)}">${rec.n} main${rec.n > 1 ? 's' : ''}</span>` : '';
    return `<span class="${cls} t-${pr.tone} tipped" data-tip="prof:${esc(key)}">${pr.short}</span>`;
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
    hideTip();
    const auto = mode === 'auto';
    document.body.classList.toggle('auto', auto);
    document.querySelectorAll('.mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    $('undo').disabled = !state || !hist.length;
    $('undo').hidden = auto;
    const nav = document.querySelector('.nav');
    nav.hidden = !state || auto;
    if (auto) {
      $('view').innerHTML = viewAuto();
      $('side').innerHTML = viewSide();
      attachPreview();
      return;
    }
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    let html;
    if (!state) html = viewSetup();
    else if (ui.tab === 'table') html = viewTable();
    else if (ui.tab === 'prompt') html = viewPrompt();
    else if (ui.tab === 'settings') html = viewSettings();
    else if (ui.tab === 'charts') html = viewCharts();
    else if (ui.tab === 'learn') html = viewLearn();
    else html = viewMain();
    if (!state || ui.tab !== 'main') html = `<div class="narrow">${html}</div>`;
    $('view').innerHTML = html;
    $('side').innerHTML = viewSide();
    if (ui.tab === 'learn') filterLearn();
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
    return `<section class="panel todo">
      <div class="mt-label">À remplir</div>
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
        <label class="field">Petite blinde ${tip('sb')}<input class="in" type="number" inputmode="numeric" min="1" data-setup="sb" value="${esc(s.sb)}"></label>
        <label class="field">Grosse blinde ${tip('bb')}<input class="in" type="number" inputmode="numeric" min="1" data-setup="bb" value="${esc(s.bb)}"></label>
        <label class="field">Ante ${tip('ante')}<input class="in" type="number" inputmode="numeric" min="0" data-setup="ante" value="${esc(s.ante)}"></label>
      </div>
      <label class="field">Qui paie l'ante ? ${tip('anteType')}<select class="in" data-setup-str="anteType">
        <option value="chacun" ${s.anteType !== 'bb' ? 'selected' : ''}>Chaque joueur</option>
        <option value="bb" ${s.anteType === 'bb' ? 'selected' : ''}>La grosse blinde, pour toute la table</option>
      </select></label>
      <p class="hint">Pas d'ante sur ta table ? Laisse 0.</p>
      <h2>Les joueurs</h2>
      <p class="hint">Recopie ce que tu vois sur le site : le pseudo et les jetons de chaque joueur, en faisant le tour de la table dans le sens des aiguilles d'une montre.</p>
      <div class="seat-row head"><span></span><span>Pseudo</span><span>Jetons ${tip('stack')}</span></div>
      ${rows}

      <label class="field">Lequel de ces joueurs est toi ?<select class="in" data-setup-sel="me">${opts(s.me)}</select></label>
      <label class="field">Qui a le jeton « D » à côté de lui ? ${tip('dealer')}<select class="in" data-setup-sel="btn">${opts(s.btn)}</select></label>
      <button class="btn primary big" data-a="setup-go">Commencer la partie</button>
    </section>`;
  }

  /* ---- onglet Main */

  function viewMain() {
    const h = state.hand;
    let out = '';
    if (!state.promptCopied) {
      out += `<div class="banner todo">
        <div class="mt-label">À faire d'abord</div>
        <div>Envoie le prompt de départ à Claude, dans une nouvelle conversation.</div>
        <div class="row">
          <button class="btn primary" data-a="copy-prompt">Copier le prompt</button>
          <button class="btn" data-a="tab" data-tab="prompt">Le voir</button>
        </div>
      </div>`;
    }
    if (!h) return `<div class="hand-grid"><div class="col-a">${out}${viewIdle(state.promptCopied)}</div><div class="col-b">${ptable(null)}</div></div>`;
    let a = handHead(h);
    if (h.phase === 'spectate') a += viewSpectate(h);
    else if (h.phase === 'cards') a += picker(2, `Tes cartes <span class="muted">(${h.pos[h.meId]})</span>`, [], null);
    else if (h.phase === 'board') a += viewBoard(h);
    else if (h.phase === 'action') a += viewAction(h);
    else if (h.phase === 'showdown') a += viewShowdown(h);
    else if (h.phase === 'done') a += viewDone(h);
    let b = h.phase === 'spectate' ? '' : ptable(h) + strip(h);
    if (h.phase !== 'spectate') b += historyView(E.handHistory(h), true);
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
        <span class="pot">Pot <b>${h.phase === 'done' ? E.contestedPot(h) : E.potOf(h)}</b></span>
      </div>
      <div class="hh-cards">
        <div class="hh-mine">${mine}${h.meIn ? posTag(h.pos[h.meId], 'hh-pos') : '<span class="muted">hors main</span>'}</div>
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
        right = `<span class="stk">${h.stack[id] + h.win[id]}</span><span class="bet"></span><span class="st"></span>`;
      } else {
        const st = h.folded[id] ? 'couché' : h.allin[id] ? 'tapis' : id === h.toAct ? 'parle' : '';
        right = `<span class="stk">${h.stack[id]}</span><span class="bet">${h.bet[id] || ''}</span><span class="st">${st}</span>`;
      }
      return `<li class="${cls}">${posTag(h.pos[id], 'pos')}<span class="nm">${esc(h.names[id])}${id === h.meId ? ' <em>moi</em>' : ''}</span>${right}</li>`;
    }).join('')}</ol>`;
  }

  // Table de poker vue de dessus (affichée seulement sur PC). Je suis toujours en bas au centre,
  // les autres places suivent dans le sens des aiguilles d'une montre. Toutes les places sont dessinées :
  // les joueurs qui ne jouent pas la main (en attente, en pause, sans jetons) apparaissent en grisé.
  // « + » entre deux places pour ajouter un joueur, « − » au survol d'un joueur pour le retirer.
  function ptable(h) {
    const P = state.players;
    const meIdx = Math.max(0, P.findIndex((p) => p.me));
    const seats = P.slice(meIdx).concat(P.slice(0, meIdx));
    const n = seats.length;
    const plan = h ? null : E.planNextHand(state);
    const posOf = (id) => (h ? h.pos[id] : plan && plan.ok ? plan.pos[id] : null);
    const btnId = h ? h.btnId : plan && plan.ok ? plan.btnId : null;
    const done = !!h && h.phase === 'done';
    const cand = h && h.phase === 'showdown' ? E.showdownCandidates(h) : [];
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
      const hz = Math.cos(a) > 0.2 ? 'l' : 'r'; // places de droite : coin gauche ; sinon coin droit
      return 'd-' + v + hz;
    };
    const back = '<span class="cb"></span><span class="cb"></span>';
    let html = '<div class="ptable" aria-label="Table"><div class="pt-felt"></div>';
    seats.forEach((p, k) => {
      const id = p.id;
      const deg = 90 + (k * 360) / n;
      const me = !!p.me;
      const inHand = !!h && h.order.includes(id);
      const folded = inHand && h.folded[id];
      const cls = ['seat', inHand && id === h.toAct ? 'cur' : '', folded ? 'out' : '', !inHand && h ? 'waiting' : '',
        !h && !E.isActive(p) ? 'waiting' : '', me ? 'me' : '', p.leaving ? 'leaving' : '',
        cand.includes(id) ? 'pick' : '', ui.sel.includes(id) ? 'picked' : ''].join(' ');
      let cards = '';
      if (inHand && !folded) cards = me && h.cards.length === 2 ? h.cards.map((c) => cardHtml(c, 'xs')).join('') : back;
      let tag = '';
      let stack = inHand ? h.stack[id] : p.stack;
      if (p.leaving) tag = '<span class="seat-tag lose">part</span>';
      else if (!inHand) {
        if (p.paused) tag = '<span class="seat-tag fold">pause</span>';
        else if (p.stack === 0) tag = '<span class="seat-tag fold">0 jeton</span>';
        else if (h) tag = '<span class="seat-tag new">prochaine main</span>';
      } else if (done) {
        stack = h.stack[id] + h.win[id];
        if (h.pots.some((pt) => !pt.refund && pt.won.includes(id))) tag = '<span class="seat-tag win">gagne</span>';
      } else if (folded) tag = '<span class="seat-tag fold">couché</span>';
      else if (h.allin[id]) tag = '<span class="seat-tag allin">tapis</span>';
      else if (id === h.toAct) tag = '<span class="seat-tag">parle</span>';
      const click = cand.includes(id) ? ` data-a="sel" data-id="${id}" title="Choisir comme gagnant"` : '';
      const pos = posOf(id);
      const remove = me || p.leaving ? '' : `<button type="button" class="seat-remove" data-a="seat-remove" data-id="${id}" title="${esc(p.name)} quitte la table" aria-label="Retirer ${esc(p.name)}">−</button>`;
      html += `<div class="${cls}" style="${at(1, deg)}"${click}>
        <div class="seat-cards">${cards}</div>
        <div class="seat-box">${remove}${id === btnId ? `<span class="dealer-badge ${dealerCorner(deg)}" title="Jeton D (bouton)">D</span>` : ''}${posTag(pos, 'seat-pos')}<b class="seat-name">${esc(p.name)}</b><span class="seat-stack">${stack}</span>${me ? '' : styleTag(p.name, 'seat-style')}</div>
        ${tag}
      </div>`;
      if (inHand && !done && h.bet[id]) html += `<div class="pt-bet" style="${at(0.58, deg)}"><i></i>${h.bet[id]}</div>`;
      // « + » entre cette place et la suivante (dans le sens du jeu)
      if (P.length < E.MAX_PLAYERS) {
        const mid = 90 + ((k + 0.5) * 360) / n;
        html += `<button type="button" class="seat-add ${ui.addAfter === id ? 'on' : ''}" style="${at(1.02, mid)}" data-a="seat-add" data-id="${id}" title="Ajouter un joueur ici" aria-label="Ajouter un joueur ici">+</button>`;
      }
    });
    const board = Array.from({ length: 5 }, (_, i) => (h && h.board[i] ? cardHtml(h.board[i], 'sm') : '<span class="card empty sm"></span>')).join('');
    let center = `<div class="pt-board">${board}</div>`;
    center += h ? `<div class="pt-pot">Pot ${done ? E.contestedPot(h) : E.potOf(h)}</div>` : `<div class="pt-pot muted-pot">Prochaine main #${state.handNo + 1}</div>`;
    html += `<div class="pt-center">${center}</div>`;
    if (ui.addAfter && P.some((x) => x.id === ui.addAfter)) {
      const after = P.find((x) => x.id === ui.addAfter);
      const nextIdx = (P.indexOf(after) + 1) % P.length;
      html += `<div class="seat-form todo" role="dialog" aria-label="Ajouter un joueur">
        <div class="sf-title">Nouveau joueur entre ${esc(after.name)} et ${esc(P[nextIdx].name)}</div>
        <div class="sf-row">
          <input class="in" id="sa-name" placeholder="Pseudo" maxlength="18" autocomplete="off">
          <input class="in" id="sa-stack" type="number" inputmode="numeric" min="1" placeholder="Jetons">
        </div>
        <div class="sf-row">
          <button class="btn primary" data-a="seat-add-ok">Ajouter</button>
          <button class="btn ghost" data-a="seat-add-cancel">Annuler</button>
        </div>
        ${h ? '<p class="hint">Il jouera à partir de la main suivante.</p>' : ''}
      </div>`;
    }
    return html + '</div>';
  }

  function viewIdle(todoOn) {
    const S = state.settings;
    const plan = E.planNextHand(state);
    const n = state.handNo + 1;
    let out = `<section class="panel ${todoOn ? 'todo' : ''}">${todoOn ? '<div class="mt-label">À faire · distribuer</div>' : ''}<h2>Prochaine main <span class="muted">#${n}</span></h2>`;
    if (!plan.ok) out += `<p class="warn">${esc(plan.err)}</p>`;
    else {
      out += `<ol class="strip preview idle-list">${plan.pre.map((id) => {
        const p = player(id);
        return `<li class="${p.me ? 'me' : ''}">${posTag(plan.pos[id], 'pos')}<span class="nm">${esc(p.name)}${p.me ? ' <em>moi</em>' : ''}</span><span class="stk">${p.stack}</span></li>`;
      }).join('')}</ol>`;
      const me = state.players.find((p) => p.me);
      if (!me) out += `<p class="warn">Aucun joueur n'est marqué « moi » (onglet Table).</p>`;
      else if (!plan.order.includes(me.id)) out += `<p class="warn">Tu ne joues pas cette main (pause ou 0 jeton).</p>`;
    }
    out += `<p class="hint"><b>BTN</b> = joueur avec le jeton D · <b>SB</b> / <b>BB</b> = petite et grosse blinde (${S.sb}/${S.bb}${S.ante ? (S.anteType === 'bb' ? ', ante BB ' : ', ante ') + S.ante : ''}) · <b>UTG</b> parle en premier ${tip('positions')}. Les jetons ne correspondent plus au site ? Corrige-les dans l'onglet Table.</p>
      <button class="btn primary big" data-a="deal" ${plan.ok ? '' : 'disabled'}>Distribuer la main #${n} ${K('Entrée')}</button>
      <button class="btn ghost wide" data-a="tab" data-tab="table">Un joueur arrive, part, ou recave ?</button>
    </section>`;
    if (state.last) out += lastHand(state.last);
    return out;
  }

  function lastHand(L) {
    // les parties enregistrées avec une ancienne version n'ont pas « players » ni « history »
    const old = !L.players;
    return `<section class="panel soft">
      <h3>Main #${L.no}</h3>
      ${L.board.length ? `<div class="mini-board">${L.board.map((c) => cardHtml(c, 'xs')).join('')}</div>` : ''}
      ${old ? `<ul class="res">${L.pots.map((p) => `<li>${p.label} <b>${p.amount}</b> → ${p.winners.map(esc).join(', ')}</li>`).join('')}</ul>` : resultList(L)}
      ${old ? '' : historyView(L.history, false)}
    </section>`;
  }

  function viewSpectate() {
    return `<section class="panel todo">
      <div class="mt-label">À faire · main suivante</div>
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
    return `<section class="panel picker todo">
      <div class="mt-label">À faire</div>
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
    const help = meLive && h.cards.length === 2 ? instantHelp(h, mine) : '';
    // à mon tour : l'aide juste avant mes boutons ; sinon, sous le joueur qui parle
    out += mine ? help + actionPanel(h, id, mine, meLive) : actionPanel(h, id, mine, meLive) + help;
    return out;
  }

  /* ---- aide instantanée (sans IA) : tableau des mains de départ, probabilité de gagner, cote du pot */

  const eqCache = new Map();

  // Le « cerveau » (advisor.js) est partagé avec la simulation : ce qui est mesuré là-bas est ce que tu vois ici.
  const oppModels = (h) => ADV.oppModels(h, profRec);
  const preflopCtx = (h, override) => ADV.preflopCtx(h, profRec, override);

  // Chances de gagner (contre les mains probables et au hasard) et, à mon tour, le conseil : calculés une fois par situation
  function myEquity(h, mine) {
    const opps = oppModels(h);
    if (!opps.length) return null;
    const key = (state.gid || '') + h.no + '|' + h.events.length + '|' + h.cards.join('') + '|' + h.board.join('') + '|' + (mine ? 1 : 0);
    if (!eqCache.has(key)) {
      if (eqCache.size > 60) eqCache.clear();
      const advice = mine ? ADV.advise(h, profRec) : null;
      eqCache.set(key, {
        likely: advice && advice.eq != null ? advice.eq : ODDS.equityVs(h.cards, h.board, opps).equity,
        random: ODDS.equity(h.cards, h.board, opps.length).equity,
        advice,
      });
    }
    const c = eqCache.get(key);
    return { nOpp: opps.length, eq: c.likely, random: c.random, advice: c.advice, opps };
  }

  function adviceLine(a, applicable) {
    const btn = applicable ? ` <button class="chip apply" data-a="apply-advice" data-act="${a.action}" data-to="${a.to || ''}">Jouer ça ${K('G')}</button>` : '';
    const close = a.close ? ' <span class="close-tag">décision serrée</span>' : '';
    return `<div class="ins-adv"><b>${a.text}</b>${btn}${close}<small>${esc(a.why)}</small></div>${plain(a.plain, 'advice', 'En clair', a.gains)}`;
  }

  // Explication « En clair » pour un débutant : un menu déroulant sous ce qu'elle explique, fermé par défaut.
  // Une sorte d'explication ouverte (le conseil, la cote du pot…) reste ouverte aux coups suivants, jusqu'à ce que je la referme.
  function plain(text, kind, summary, extra) {
    if (!text) return '';
    const t = String(text);
    const body = esc(t.charAt(0).toUpperCase() + t.slice(1));
    return `<details class="plain" data-kind="${kind}" ${plainOpen.has(kind) ? 'open' : ''}><summary>${esc(summary || 'En clair')}</summary>
      <div><p>${body}</p>${extra ? `<p class="ins-gains">${esc(extra)}</p>` : ''}</div></details>`;
  }

  // « ac kk », « A♥ K♦ », « 10p 9p » → ['Ac', 'Kk'] / ['Tp', '9p']
  function parseCardsText(txt) {
    const AZ = { '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5', '-': '6', 'è': '7', '_': '8', 'ç': '9', 'à': '0' }; // chiffres AZERTY sans Maj
    const t = String(txt || '').replace(/[&é"'(\-è_çà]/g, (c) => AZ[c]).replace(/10/g, 'T').replace(/♠/g, 'p').replace(/♥/g, 'c').replace(/♦/g, 'k').replace(/♣/g, 't');
    return [...t.matchAll(/([AKQJT2-9])\s*([pckt])/gi)].map((m) => m[1].toUpperCase() + m[2].toLowerCase());
  }

  // 0.19 → « un peu moins d'une fois sur 5 »
  function oneIn(p) {
    if (p >= 0.45) return p > 0.55 ? "plus d'une fois sur 2" : 'environ une fois sur 2';
    const x = 1 / p, n = Math.round(x);
    return (x > n + 0.15 ? "un peu moins d'" : x < n - 0.15 ? "un peu plus d'" : 'environ ') + 'une fois sur ' + n;
  }

  function instantHelp(h, mine) {
    let out = `<section class="instant"><div class="ins-title">Aide instantanée <span class="muted">sans IA</span> ${tip('instant')}</div>`;
    if (h.street === 0) {
      if (mine) {
        out += adviceLine(ODDS.preflopAdvice(preflopCtx(h)), true);
      } else {
        // pas encore à moi : le plan du tableau pour les cas les plus fréquents
        const plan = [
          ['Si personne ne relance', ODDS.preflopAdvice(preflopCtx(h, { raises: 0, limpers: 0, cb: h.bb, iRaised: false }))],
          ['Si une relance', ODDS.preflopAdvice(preflopCtx(h, { raises: 1, limpers: 0, cb: h.bb * 3, iRaised: false }))],
          ['Si deux relances', ODDS.preflopAdvice(preflopCtx(h, { raises: 2, limpers: 0, cb: h.bb * 9, iRaised: false }))],
        ];
        out += `<div class="ins-sub">Pas encore à toi. Selon ce que font les joueurs avant toi :</div><ul class="ins-plan">${plan.map(([k, a]) => `<li><span>${k}</span> → <b>${a.text}</b></li>`).join('')}</ul>`
          + plain("le tableau des mains de départ te dit déjà quoi faire dans chaque cas. Regarde ce que font les joueurs qui parlent avant toi : quand ce sera ton tour, le conseil exact s'affichera, avec le bouton « Jouer ça ».", 'plan');
      }
    }
    // Avant le flop, c'est le tableau qui décide : le calcul compterait comme adversaires
    // les joueurs qui n'ont pas encore parlé (ils se coucheront souvent) et contredirait le conseil.
    const e = h.street > 0 ? myEquity(h, mine) : null;
    if (e && e.advice) out += adviceLine(e.advice, true);
    if (h.street === 0) {
      out += plain("tes chances de gagner et le calcul « suivre est rentable » s'affichent à partir du flop. Avant le flop, c'est le tableau des mains de départ qui décide : il tient déjà compte de ta place et de ce qu'ont fait les autres.", 'preflop', 'Et mes chances de gagner ?');
    }
    const opps = e ? e.opps : oppModels(h);
    if (e) {
      const eqPct = Math.round(e.eq * 100);
      out += `<div class="ins-eq">≈ <b>${eqPct} %</b> de gagner contre leurs mains probables <small>(contre des mains au hasard : ${Math.round(e.random * 100)} %)</small></div>`;
      const o = E.options(h, h.meId);
      if (mine && o.toCall > 0) {
        const pot = E.potOf(h);
        const need = ODDS.potOdds(o.toCall, pot);
        const good = e.eq >= need;
        out += `<div class="ins-odds">Pour suivre ${o.toCall}, il faut gagner <b>${Math.round(need * 100)} %</b> du temps → <span class="${good ? 'good' : 'bad'}">${good ? 'suivre est rentable' : 'suivre n\'est pas rentable'}</span> <small>(d'après le seul calcul)</small></div>`;
        out += plain(`il y a ${pot} dans le pot et on te demande ${o.toCall} pour suivre. Tu risques donc ${o.toCall} pour remporter un pot de ${pot + o.toCall}. `
          + `Il te suffit de gagner ${oneIn(need)} (${Math.round(need * 100)} %) pour ne pas perdre de jetons sur la durée. `
          + `Ici tu gagnes environ ${eqPct} fois sur 100 : ${good ? `c'est plus que ${Math.round(need * 100)} %, donc suivre est rentable.` : `c'est moins que ${Math.round(need * 100)} %, donc suivre n'est pas rentable.`}`
          + (e.advice && (good ? e.advice.action === 'fold' : e.advice.action !== 'fold')
            ? ' Le conseil au-dessus va plus loin que ce calcul : il compare aussi ce que rapporteraient une mise ou une relance (qui peuvent faire coucher l\'adversaire), et tient compte de ta place.' : ''), 'odds');
      } else {
        out += plain(`si personne ne se couchait jusqu'à la fin de la main, tu gagnerais environ ${eqPct} fois sur 100. Le chiffre « au hasard » est celui qu'on aurait si les adversaires avaient n'importe quelles cartes.`, 'eq');
      }
    }
    if (opps.length) {
      out += '<div class="ins-sub ins-opps-intro">Mains probables des adversaires</div>';
      out += `<ul class="ins-opps">${opps.map((x) => `<li><b>${esc(x.name)}</b> ${posTag(x.pos, 'pos-inline')} ${styleTag(x.name, 'style-tag') || '<span class="style-tag unknown">pas encore observé</span>'}${x.range || x.acts.length ? `<small>${x.range ? 'Mains probables : ' + x.text : 'N\'importe quelle main au départ'}${x.acts.length ? `, surtout celles qui ont touché le tableau, puisqu'il a ${x.acts.some((y) => y.kind !== 'call') ? 'misé' : 'suivi'}` : ''}</small>` : ''}</li>`).join('')}</ul>`;
    }
    return out + '</section>';
  }

  /* ---- onglet Apprendre : toutes les notions, avec recherche, « Je connais » et « Teste-toi » */

  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function learnProgress() {
    const total = LEARN.all().length;
    const known = LEARN.all().filter((it) => learned.has(it.id)).length;
    return { total, known, pct: Math.round((known / total) * 100) };
  }

  function learnItem(it) {
    const known = learned.has(it.id);
    const cards = it.cards ? `<div class="lr-cards">${it.cards.map((c) => cardHtml(c, 'sm')).join('')}</div>` : '';
    const text = norm([it.t, it.a, it.d, it.ex].join(' '));
    return `<li class="lr-item ${known ? 'known' : ''}" data-id="${it.id}" data-text="${esc(text)}">
      <div class="lr-head"><b class="lr-term">${esc(it.t)}</b>${it.a ? `<span class="lr-alias">${esc(it.a)}</span>` : ''}
        <label class="lr-know"><input type="checkbox" data-know="${it.id}" ${known ? 'checked' : ''}> Je connais</label></div>
      ${cards}<p class="lr-def">${esc(it.d)}</p>${it.ex ? `<p class="lr-ex"><b>Exemple :</b> ${esc(it.ex)}</p>` : ''}
    </li>`;
  }

  function quizCard() {
    const q = ui.quiz;
    const it = LEARN.all().find((x) => x.id === q.id);
    if (!it) return '';
    const left = LEARN.all().filter((x) => !learned.has(x.id)).length;
    return `<section class="panel quiz">
      <div class="quiz-top"><span class="muted">Teste-toi · ${left} notion${left > 1 ? 's' : ''} à apprendre</span><button class="link-btn" data-a="quiz-stop">Arrêter</button></div>
      <div class="quiz-q">Que veut dire <b>« ${esc(it.t)} »</b>${it.a ? ` <span class="lr-alias">${esc(it.a)}</span>` : ''} ?</div>
      ${q.shown ? `<div class="quiz-a">${it.cards ? `<div class="lr-cards">${it.cards.map((c) => cardHtml(c, 'sm')).join('')}</div>` : ''}<p>${esc(it.d)}</p>${it.ex ? `<p class="lr-ex"><b>Exemple :</b> ${esc(it.ex)}</p>` : ''}</div>
        <div class="row"><button class="btn primary" data-a="quiz-yes">Je savais ✓</button><button class="btn" data-a="quiz-no">À revoir</button></div>`
      : `<p class="hint">Réfléchis à la réponse, puis vérifie.</p><button class="btn primary wide" data-a="quiz-show">Voir l'explication</button>`}
    </section>`;
  }

  function pickQuiz(prev) {
    const pool = LEARN.all().filter((x) => !learned.has(x.id) && x.id !== prev);
    const list = pool.length ? pool : LEARN.all().filter((x) => x.id !== prev);
    return { id: list[Math.floor(Math.random() * list.length)].id, shown: false };
  }

  function viewLearn() {
    const pr = learnProgress();
    let out = `<section class="panel">
      <h2>Apprendre</h2>
      <p class="hint">Tous les mots du poker utilisés dans l'appli et par Claude, expliqués simplement. Coche « Je connais » au fur et à mesure, et utilise « Teste-toi » pour réviser.</p>
      <div class="lr-progress"><div class="lr-bar"><i style="width:${pr.pct}%"></i></div><span><b>${pr.known}</b> / ${pr.total} notions connues</span></div>
      <div class="row lr-tools">
        <input class="in" id="learn-q" type="search" placeholder="Chercher : AKo, CO, tapis…" value="${esc(ui.learnQ || '')}" autocomplete="off">
        ${ui.quiz ? '' : '<button class="btn primary" data-a="quiz-start">Teste-toi</button>'}
      </div>
      <p class="hint lr-none" hidden>Aucune notion ne correspond.</p>
    </section>`;
    if (ui.quiz) out += quizCard();
    LEARN.SECTIONS.forEach((sec) => {
      const known = sec.items.filter((it) => learned.has(it.id)).length;
      let combos = '';
      if (sec.combos) {
        combos = `<ol class="lr-combos">${HANDS.CATEGORIES.slice().reverse().map((c) => `<li><b>${esc(c.name)}</b><span class="lr-cards">${c.ex.map((x) => cardHtml(x, 'xs')).join('')}</span><small>${esc(c.desc)}</small></li>`).join('')}</ol>`;
      }
      const open = ui.learnOpen && ui.learnOpen.has(sec.id);
      out += `<details class="panel lr-sec" data-sec="${sec.id}" ${open ? 'open' : ''}>
        <summary><span>${esc(sec.title)}</span><span class="lr-count" data-count="${sec.id}">${known}/${sec.items.length}</span></summary>
        <p class="hint">${esc(sec.intro)}</p>${combos}
        <ul class="lr-list">${sec.items.map(learnItem).join('')}</ul>
      </details>`;
    });
    return out;
  }

  // Filtre sans redessiner (pour garder le curseur dans la recherche)
  function filterLearn() {
    const q = norm(ui.learnQ || '').trim();
    let any = false;
    document.querySelectorAll('.lr-sec').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('.lr-item').forEach((li) => {
        const hit = !q || li.dataset.text.includes(q);
        li.hidden = !hit;
        if (hit) n++;
      });
      const combos = sec.querySelector('.lr-combos');
      if (combos) combos.hidden = !!q;
      sec.hidden = !!q && n === 0;
      if (q && n) sec.open = true;
      else if (!q) sec.open = !!(ui.learnOpen && ui.learnOpen.has(sec.dataset.sec)); // recherche effacée : comme avant
      if (n) any = true;
    });
    const none = document.querySelector('.lr-none');
    if (none) none.hidden = any || !q;
  }

  function updateLearnCounts() {
    const pr = learnProgress();
    const bar = document.querySelector('.lr-bar i');
    if (bar) bar.style.width = pr.pct + '%';
    const lbl = document.querySelector('.lr-progress span');
    if (lbl) lbl.innerHTML = `<b>${pr.known}</b> / ${pr.total} notions connues`;
    LEARN.SECTIONS.forEach((sec) => {
      const el = document.querySelector(`[data-count="${sec.id}"]`);
      if (el) el.textContent = sec.items.filter((it) => learned.has(it.id)).length + '/' + sec.items.length;
    });
  }

  /* ---- onglet Mains : tableaux des mains de départ */

  function viewCharts() {
    const h = state.hand;
    const n = h ? h.order.length : state.players.filter(E.isActive).length;
    const myPos = h && h.meIn ? h.pos[h.meId] : null;
    const myClass = h && h.cards.length === 2 ? ODDS.handClass(h.cards[0], h.cards[1]) : null;
    const views = [['UTG', 'UTG'], ['MP', 'MP'], ['CO', 'CO'], ['BTN', 'BTN'], ['SB', 'SB'], ['BB', 'BB (défense)'], ['vs', 'Face à une relance']];
    let v = ui.chart;
    if (!v) {
      const k = myPos ? (myPos === 'BB' ? 'BB' : ODDS.openRangeKey(myPos, n)) : 'CO';
      v = k === 'UTG9' ? 'UTG' : k || 'CO';
    }
    const R = ODDS.RANGES;
    let cat, legend, text;
    if (v === 'BB') {
      cat = (c) => (R.threeBet.has(c) ? 'r3' : R.callBB.has(c) ? 'call' : 'fold');
      legend = [['r3', 'Sur-relance'], ['call', 'Suis'], ['fold', 'Couche-toi']];
      text = "En grosse blinde, face à une seule relance (jusqu'à 4,5 grosses blindes) : tu as déjà misé, donc tu peux payer avec beaucoup de mains. Si personne n'a relancé : check (ou relance avec TT+, AQs+, AKo).";
    } else if (v === 'vs') {
      cat = (c) => (R.threeBet.has(c) ? 'r3' : R.call.has(c) ? 'call' : 'fold');
      legend = [['r3', 'Sur-relance'], ['call', 'Suis'], ['fold', 'Couche-toi']];
      text = "Face à une seule relance, à une autre place que la grosse blinde. Face à une grosse relance (plus de 4,5 grosses blindes) : continue seulement avec 77+, AJs+, KQs, AQo+. Face à deux relances : relance encore avec AA et KK, suis avec QQ et AK, couche le reste.";
    } else {
      const key = v === 'UTG' && n >= 8 ? 'UTG9' : v;
      const range = R.open[key];
      cat = (c) => (range.has(c) ? 'raise' : 'fold');
      legend = [['raise', 'Relance'], ['fold', 'Couche-toi']];
      text = `Personne n'a relancé avant toi : relance (${v === 'CO' || v === 'BTN' ? '2,5' : '3'} grosses blindes, plus 1 par joueur qui a seulement suivi) avec les mains en vert, couche-toi avec les autres. Soit ${ODDS.pct(range)} % des mains${key === 'UTG9' ? ' (tableau plus serré à 8 joueurs et plus)' : ''}.`;
    }
    const grid = ODDS.grid().map((row) => row.map((c) => `<span class="hc ${cat(c)} ${c === myClass ? 'mine' : ''}">${c.replace(/[so]$/, (m) => `<small>${m}</small>`)}</span>`).join('')).join('');
    return `<section class="panel">
      <h2>Mains de départ</h2>
      <p class="hint">Quoi faire avant le flop, selon ta place. Apprends-les petit à petit : c'est ce qui fait le plus progresser un débutant.</p>
      <div class="chart-tabs">${views.map(([k, l]) => `<button class="chip tipped ${v === k ? 'on' : ''} ${myPos && (k === myPos || (k === 'UTG' && myPos.startsWith('UTG')) || (k === 'MP' && myPos.startsWith('MP'))) ? 'here' : ''}" data-a="chart" data-v="${k}" data-tip="${k === 'vs' ? 'vsraise' : 'pos:' + k}">${l}</button>`).join('')}</div>
      <div class="hc-grid">${grid}</div>
      <div class="hc-legend">${legend.map(([c, l]) => `<span><i class="hc ${c}"></i>${l}</span>`).join('')}${myClass ? `<span><i class="hc mine"></i>Ta main (${myClass})</span>` : ''}</div>
      <p class="hint">${text}</p>
      <p class="hint">Lecture : « s » = cartes de la même couleur (assorties), « o » = couleurs différentes. Au-dessus de la diagonale, les mains assorties ; en dessous, les autres ; sur la diagonale, les paires.</p>
    </section>`;
  }

  function actionPanel(h, id, mine, meLive) {
    const o = E.options(h, id);
    const head = (mine ? '<span class="mt-label">À toi · ce que tu joues</span>' : `<span class="mt-label">À saisir</span> ce que fait <b>${esc(h.names[id])}</b> ${posTag(h.pos[id], 'pos-inline')}`) + ' ' + tip('actions');
    const call = o.canCheck
      ? `<button class="btn" data-a="act" data-t="x">Check ${K('X')}</button>`
      : `<button class="btn" data-a="act" data-t="s">${o.toCall >= o.st ? 'Suit (tapis)' : 'Suit ' + o.toCall} ${K('S')}</button>`;
    let out = `<section class="act todo ${mine ? 'mine' : ''}">
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
      const real = h.pots.filter((x) => !x.refund);
      const label = p.refund ? 'Mise non suivie rendue' : real.length > 1 ? (real.indexOf(p) === 0 ? 'Pot principal' : 'Pot annexe') : 'Pot';
      const who = p.won ? '→ ' + p.won.map((id) => esc(h.names[id])).join(', ') : p.elig.map((id) => esc(h.names[id])).join(', ');
      return `<li class="${p.won ? 'won' : ''}"><span>${label} <b>${p.amount}</b></span><span class="muted">${who}</span></li>`;
    }).join('');
    return `<section class="panel todo">
      <div class="mt-label">À faire</div>
      <h2>Qui gagne ?</h2>
      <ul class="pots">${pots}</ul>
      ${h.pots.filter((x) => !x.refund).length > 1 ? `<p class="hint">Il y a un pot annexe ${tip('sidepot')}</p>` : ''}
      <p class="hint">Touche la meilleure main. Plusieurs joueurs = partage du pot.</p>
      <div class="cands">${cand.map((id, i) => `<button class="cand ${ui.sel.includes(id) ? 'on' : ''}" data-a="sel" data-id="${id}">${posTag(h.pos[id], 'pos')}${esc(h.names[id])}${id === h.meId ? ' <em>moi</em>' : ''}${i < 9 ? `<kbd class="k right">${i + 1}</kbd>` : ''}</button>`).join('')}</div>
      <button class="btn primary big" data-a="declare" ${ui.sel.length ? '' : 'disabled'}>Valider ${K('Entrée')}</button>
      ${showCardsBox(h, cand)}
    </section>`;
  }

  // Cartes montrées (facultatif) : l'appli trouve le gagnant et apprend la façon de jouer de chacun
  function showCardsBox(h, cand) {
    const others = cand.filter((id) => id !== h.meId);
    if (!others.length) return '';
    const fmt = (c) => (c || []).map((x) => (x[0] === 'T' ? '10' : x[0]) + SUIT_SYM[x[1]]).join(' ');
    return `<div class="show-box">
      <div class="sb-title">Cartes montrées <span class="muted">facultatif</span> ${tip('shown')}</div>
      ${others.map((id) => `<label class="sb-row"><span><span class="pos">${h.pos[id]}</span> ${esc(h.names[id])}</span>
        <input class="in" data-show="${id}" placeholder="ex : ac kk" value="${esc(fmt(h.shown && h.shown[id]))}" autocomplete="off"></label>`).join('')}
      ${h.board.length < 5 ? '<p class="hint">Tapis avant la river : choisis le gagnant toi-même (les cartes montrées servent quand même à apprendre).</p>' : ''}
    </div>`;
  }

  function viewDone(h) {
    const S = E.handSummary(h);
    return `<section class="panel done todo">
      <div class="mt-label">À faire · main suivante</div>
      <h2>Main #${h.no} terminée</h2>
      ${resultList(S)}
      <button class="btn primary big" data-a="next">Main suivante ${K('Entrée')}</button>
      <button class="btn ghost wide" data-a="end-only">Modifier la table d'abord</button>
    </section>`;
  }

  // Gagnants + jetons de chaque joueur avant → après la main
  function resultList(S) {
    const pots = S.pots.filter((p) => !p.refund)
      .map((p) => `<li>${p.label} <b>${p.amount}</b> → ${p.winners.map(esc).join(', ')}</li>`).join('');
    const refunds = S.pots.filter((p) => p.refund)
      .map((p) => `<li class="muted">${p.winners.map(esc).join(', ')} récupère ${p.amount} (mise non suivie)</li>`).join('');
    const rows = (S.players || []).map((x) => `<li class="${x.me ? 'me' : ''} ${x.net < 0 ? 'down' : x.net > 0 ? 'up' : 'same'}">
        ${posTag(x.pos, 'pos')}<span class="nm">${esc(x.name)}${x.me ? ' <em>moi</em>' : ''}</span>
        <span class="ba">${x.before} → <b>${x.after}</b></span>
      </li>`).join('');
    return `<ul class="res">${pots}${refunds}</ul>${rows ? `<ul class="before-after">${rows}</ul>` : ''}`;
  }

  // Historique des coups (comme sur les sites de poker)
  function historyView(entries, open) {
    if (!entries || !entries.length) return '';
    const body = entries.map((x) => {
      if (x.kind === 'street') {
        return `<li class="h-street"><b>${x.label}</b>${x.cards && x.cards.length ? ' ' + x.cards.map((c) => cardHtml(c, 'xs')).join('') : ''}${x.pot != null ? ` <span class="muted">pot ${x.pot}</span>` : ''}</li>`;
      }
      if (x.kind === 'result') return `<li class="h-result ${x.me ? 'me' : ''}">${esc(x.text)}</li>`;
      return `<li class="h-line ${x.me ? 'me' : ''}"><span class="h-who">${esc(x.name)}${x.pos ? ' ' + posTag(x.pos, 'h-pos') : ''}</span> ${esc(x.text)}</li>`;
    }).join('');
    return `<details class="history" ${open && ui.histOpen !== false ? 'open' : ''}>
      <summary>Historique de la main</summary>
      <ol>${body}</ol>
    </details>`;
  }

  /* ---- colonne de droite (PC) : ma main, combinaisons, raccourcis */

  function viewSide() {
    if (mode === 'auto') return viewSideAuto();
    const h = state && state.hand;
    const cur = h && h.cards.length === 2 ? HANDS.describe(h.cards, h.board) : null;
    let out = `<div class="side-a"><section class="side-box"><h3>Ta main ${tip('hand')}</h3>`;
    if (cur) {
      const mineSet = new Set(h.cards);
      const show = (c, cls) => `<span class="${cls}${mineSet.has(c) ? ' from-me' : ''}">${cardHtml(c, 'sm')}</span>`;
      out += `<div class="now-cards">${cur.best.main.map((c) => show(c, 'nc')).join('')}${cur.best.kick.map((c) => show(c, 'nc kick')).join('')}</div>`;
      out += `<div class="now">${esc(cur.best.name)}</div>`;
      const eqSide = E.meLive(h) && h.street > 0 ? myEquity(h) : null;
      if (eqSide) out += `<div class="now-eq">≈ <b>${Math.round(eqSide.eq * 100)} %</b> de gagner contre leurs mains probables <small>(au hasard : ${Math.round(eqSide.random * 100)} %)</small></div>`;
      out += '<p class="hint small-legend"><span class="dot"></span> carte de ta main · grisée = carte d\'appoint (kicker)</p>';
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
        <dt><kbd>G</kbd></dt><dd>Jouer le conseil du tableau (avant le flop)</dd>
        <dt>Cartes</dt><dd>La valeur puis la couleur : <kbd>A</kbd> puis <kbd>C</kbd> = A♥.<br>Valeurs A K Q J T 9…2 · couleurs <kbd>P</kbd> ♠ <kbd>C</kbd> ♥ <kbd>K</kbd> ♦ <kbd>T</kbd> ♣ · <kbd>⌫</kbd> efface</dd>
        <dt><kbd>1</kbd> <kbd>2</kbd>…</dt><dd>Qui gagne : choisir le joueur (touches du haut du clavier, avec ou sans Maj)</dd>
        <dt><kbd>Entrée</kbd></dt><dd>Distribuer, valider, main suivante</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Annuler la dernière action</dd>
        <dt><kbd>Échap</kbd></dt><dd>Fermer le montant ou la valeur choisie</dd>
      </dl>
    </section></div>`;
    return out;
  }

  /* ---- mode Auto : captures d'écran lues par Claude */

  const cap = { stream: null, track: null, video: null, lastUrl: null, lastAt: null, busy: false };
  const canCapture = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
  const capLive = () => !!cap.track && cap.track.readyState === 'live';

  function viewAuto() {
    const steps = `<section class="panel">
      <h2>Mode Auto</h2>
      <p class="hint">Claude lit la table sur tes captures d'écran et te donne les probabilités et un plan pour chaque situation. Rien à saisir dans l'appli.</p>
      <ol class="steps">
        <li><b>Une fois :</b> copie le prompt Auto dans une nouvelle conversation Claude, ou mieux, dans les instructions d'un Projet Claude « Poker Auto ».</li>
        <li><b>Tu reçois tes cartes :</b> capture, puis <kbd>Ctrl</kbd>+<kbd>V</kbd> et Entrée dans Claude.</li>
        <li><b>Flop, turn, river :</b> une capture à chaque nouvelle carte, sans attendre ton tour.</li>
        <li><b>Ton tour :</b> applique la ligne du plan qui correspond. Situation imprévue ? Une nouvelle capture.</li>
      </ol>
      <div class="row">
        <button class="btn primary" data-a="copy-auto-prompt">Copier le prompt Auto</button>
        <button class="btn ghost" data-a="toggle-auto-prompt">${ui.showAutoPrompt ? 'Masquer' : 'Voir'} le prompt</button>
      </div>
      ${ui.showAutoPrompt ? `<pre class="msg prompt">${esc(E.buildAutoPrompt())}</pre>` : ''}
      <p class="hint">Les probabilités de gagner sont des estimations de Claude (il ne voit pas les cartes des autres) ; les calculs de tirages sont fiables.</p>
    </section>`;
    let capture;
    if (!canCapture()) {
      capture = `<section class="panel">
        <h2>Capture de la table</h2>
        <p>La capture depuis l'appli n'est pas disponible ici (téléphone ou navigateur non compatible).</p>
        <p class="hint">Fais une capture d'écran classique et partage-la à Claude. Sur PC Windows : <kbd>Win</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>.</p>
      </section>`;
    } else if (!capLive()) {
      capture = `<section class="panel todo">
        <div class="mt-label">À faire</div>
        <h2>Capture de la table</h2>
        <p>Choisis une seule fois la fenêtre (ou l'onglet) du jeu. Ensuite, un clic ou la touche <kbd>Espace</kbd> copie une image de la table, prête à coller dans Claude.</p>
        <button class="btn primary big" data-a="cap-start">Choisir la fenêtre du jeu</button>
        <p class="hint">Edge affiche un bandeau « partage en cours » : c'est normal, l'image ne sort pas de ton ordinateur, elle va seulement dans ton presse-papiers.</p>
      </section>`;
    } else {
      capture = `<section class="panel todo">
        <div class="mt-label">À chaque carte</div>
        <h2>Capture de la table <span class="ok-dot">fenêtre partagée</span></h2>
        <div id="cap-stage" class="cap-stage ${ui.cropping ? 'cropping' : ''}">
          <div id="cap-slot"></div>
          <div id="cap-rect" class="cap-rect" ${crop && !ui.cropping ? '' : 'hidden'}></div>
        </div>
        <p class="hint">${ui.cropping ? 'Trace un rectangle autour de la table avec la souris.' : crop ? 'Seule la zone encadrée sera copiée.' : "Toute la fenêtre sera copiée. Tu peux recadrer sur la table pour une image plus nette."}</p>
        <button class="btn primary big" data-a="cap-shot" id="cap-shot">Capturer la table <kbd class="k">Espace</kbd></button>
        <div class="row cap-tools">
          <button class="btn small ${ui.cropping ? 'on' : ''}" data-a="cap-crop">${ui.cropping ? 'Annuler le recadrage' : 'Recadrer sur la table'}</button>
          ${crop ? '<button class="btn small" data-a="cap-uncrop">Toute la fenêtre</button>' : ''}
          <button class="btn small ghost" data-a="cap-start">Changer de fenêtre</button>
          <button class="btn small ghost" data-a="cap-stop">Arrêter</button>
        </div>
        ${cap.lastUrl ? `<div class="cap-last"><img src="${cap.lastUrl}" alt="Dernière capture"><span>Copiée à ${cap.lastAt} : colle-la dans Claude avec <kbd>Ctrl</kbd>+<kbd>V</kbd></span></div>` : ''}
      </section>`;
    }
    if (canCapture()) capture += recPanel();
    return `<div class="hand-grid auto-grid"><div class="col-a">${steps}</div><div class="col-b">${capture}</div></div>`;
  }

  function viewSideAuto() {
    let out = `<div class="side-a"><section class="side-box"><h3>Combinaisons <small>de la plus forte à la plus faible</small></h3><ol class="combos">`;
    out += HANDS.CATEGORIES.slice().reverse().map((c) => `<li>
        <div class="cb-top"><b>${c.name}</b><span>${c.ex.map((x) => cardHtml(x, 'xs')).join('')}</span></div>
        <small>${c.desc}</small>
      </li>`).join('');
    out += '</ol></section></div>';
    out += `<div class="side-b"><section class="side-box keys">
      <h3>Raccourcis clavier</h3>
      <dl>
        <dt><kbd>Espace</kbd></dt><dd>Capturer la table (dans l'appli)</dd>
        <dt><kbd>C</kbd></dt><dd>Capturer la table (aussi)</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>V</kbd></dt><dd>Coller la capture dans Claude, puis Entrée</dd>
      </dl>
      <p class="hint">Astuce : garde l'appli et Claude côte à côte sur ton 2e écran, le jeu sur le 1er.</p>
    </section></div>`;
    return out;
  }

  // La vidéo du partage d'écran reste la même entre deux affichages : on la replace dans l'écran.
  function attachPreview() {
    const slot = $('cap-slot');
    if (slot && cap.video) slot.appendChild(cap.video);
    const rect = $('cap-rect');
    if (rect && crop) Object.assign(rect.style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
  }

  async function startCapture() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false, selfBrowserSurface: 'exclude' });
      stopCapture(true);
      cap.stream = stream;
      cap.track = stream.getVideoTracks()[0];
      cap.track.addEventListener('ended', () => { stopCapture(true); render(); toast('Partage de la fenêtre arrêté'); });
      cap.video = document.createElement('video');
      cap.video.muted = true;
      cap.video.playsInline = true;
      cap.video.autoplay = true;
      cap.video.srcObject = stream;
      await cap.video.play().catch(() => {});
      render();
      toast('Fenêtre partagée : clique sur « Capturer la table » ou appuie sur Espace');
    } catch (e) {
      toast('Partage annulé');
    }
  }

  function stopCapture(silent) {
    if (cap.stream) cap.stream.getTracks().forEach((t) => t.stop());
    cap.stream = cap.track = null;
    if (cap.video) { cap.video.srcObject = null; cap.video.remove(); }
    cap.video = null;
    if (!silent) render();
  }

  // Image actuelle de la fenêtre partagée, recadrée, en PNG.
  async function grabPng() {
    let src = null;
    let w = 0;
    let hgt = 0;
    try {
      if (window.ImageCapture) {
        src = await new ImageCapture(cap.track).grabFrame();
        w = src.width;
        hgt = src.height;
      }
    } catch (e) { src = null; }
    if (!src) {
      src = cap.video;
      w = cap.video.videoWidth;
      hgt = cap.video.videoHeight;
    }
    if (!w || !hgt) throw new Error('image vide');
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(c.x * w), sy = Math.round(c.y * hgt);
    const sw = Math.max(1, Math.round(c.w * w)), sh = Math.max(1, Math.round(c.h * hgt));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/png'));
  }

  function shoot() {
    if (!capLive()) return toast("Choisis d'abord la fenêtre du jeu");
    if (cap.busy) return;
    cap.busy = true;
    const blobP = grabPng();
    // L'écriture dans le presse-papiers est lancée tout de suite (pendant le clic), avec l'image à venir.
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })])
      .then(() => blobP)
      .then((blob) => {
        if (cap.lastUrl) URL.revokeObjectURL(cap.lastUrl);
        cap.lastUrl = URL.createObjectURL(blob);
        cap.lastAt = new Date().toLocaleTimeString('fr-FR');
        render();
        toast('Capture copiée : Ctrl+V dans Claude');
      })
      .catch(() => toast('Copie impossible : clique dans l\'appli puis réessaie'))
      .finally(() => { cap.busy = false; });
  }

  /* ---- enregistrement de captures : pour apprendre à l'appli à lire ta table Zynga.
   * Pendant que la fenêtre est partagée, l'appli garde une image à chaque changement à la table
   * (une fois l'image stabilisée, pour éviter les animations), puis les rassemble dans un fichier zip.
   * Les images restent sur l'ordinateur tant que tu ne les envoies pas. */

  const REC_MAX = 250;
  const rec = { on: false, frames: [], bytes: 0, timer: null, prev: null, saved: null, lastSave: 0, changedAt: 0, busy: false };
  const SW = 320, SH = 180; // image réduite pour repérer les changements
  let recCanvas = null;

  function recSample() {
    const v = cap.video;
    if (!v || !v.videoWidth) return null;
    recCanvas = recCanvas || Object.assign(document.createElement('canvas'), { width: SW, height: SH });
    const g = recCanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, SW, SH);
    const d = g.getImageData(0, 0, SW, SH).data;
    const out = new Uint8Array(SW * SH);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
    return out;
  }
  // nombre de points qui ont nettement changé entre deux images réduites
  function recDiff(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) n++;
    return n;
  }

  function recSave(now) {
    const v = cap.video;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    rec.busy = true;
    c.toBlob((blob) => {
      rec.busy = false;
      if (!blob || !rec.on) return;
      const d = new Date();
      const hms = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join('');
      rec.frames.push({ name: `table-${String(rec.frames.length + 1).padStart(3, '0')}-${hms}.jpg`, blob });
      rec.bytes += blob.size;
      rec.lastSave = now;
      if (rec.frames.length >= REC_MAX) { recStop(); toast(REC_MAX + ' captures : enregistrement arrêté. Télécharge le fichier.'); }
      recUpdate();
    }, 'image/jpeg', 0.9);
  }

  function recTick() {
    if (!rec.on || rec.busy) return;
    if (!capLive()) { recStop(); return; }
    const s = recSample();
    if (!s) return;
    const now = Date.now();
    const moving = rec.prev ? recDiff(s, rec.prev) : 0;
    rec.prev = s;
    const changed = !rec.saved || recDiff(s, rec.saved) > 30;
    if (!changed) { rec.changedAt = 0; return; }
    if (!rec.changedAt) rec.changedAt = now;
    // on attend que l'image se pose (fin d'animation), au plus 3 s, et au moins 1,5 s entre deux images
    const settled = moving < 120 || now - rec.changedAt > 3000;
    if (settled && now - rec.lastSave >= 1500) {
      rec.saved = s;
      rec.changedAt = 0;
      recSave(now);
    }
  }

  function recStart() {
    if (!capLive()) return toast("Choisis d'abord la fenêtre du jeu");
    rec.on = true;
    rec.prev = rec.saved = null;
    rec.changedAt = 0;
    clearInterval(rec.timer);
    rec.timer = setInterval(recTick, 500);
    render();
    toast('Enregistrement lancé : joue normalement');
  }
  function recStop() {
    rec.on = false;
    clearInterval(rec.timer);
    rec.timer = null;
    render();
  }
  function recUpdate() {
    const el = $('rec-count');
    if (el) el.textContent = recCountText();
    const dl = $('rec-dl');
    if (dl) dl.disabled = !rec.frames.length;
  }
  const recCountText = () => `${rec.frames.length} capture${rec.frames.length > 1 ? 's' : ''} · ${(rec.bytes / 1048576).toFixed(1)} Mo`;

  function recPanel() {
    return `<section class="panel rec">
      <h2>Apprendre à l'appli à lire ta table ${rec.on ? '<span class="rec-dot">enregistrement</span>' : ''}</h2>
      <p class="hint">Pour que l'appli lise un jour la table toute seule, il me faut des images de ta table Zynga. Lance l'enregistrement, joue normalement une vingtaine de mains : l'appli garde une image à chaque changement à la table. Ensuite, télécharge le fichier et envoie-le moi dans la conversation. Les images restent sur ton ordinateur tant que tu ne les envoies pas.</p>
      <div class="row">
        ${rec.on ? '<button class="btn danger" data-a="rec-stop">Arrêter l\'enregistrement</button>'
          : `<button class="btn primary" data-a="rec-start" ${capLive() ? '' : 'disabled'}>Démarrer l'enregistrement</button>`}
        <span class="rec-count" id="rec-count">${recCountText()}</span>
      </div>
      <div class="row">
        <button class="btn" id="rec-dl" data-a="rec-dl" ${rec.frames.length ? '' : 'disabled'}>Télécharger (fichier zip)</button>
        ${rec.frames.length && !rec.on ? '<button class="btn ghost" data-a="rec-clear">Effacer</button>' : ''}
      </div>
      ${capLive() ? '' : '<p class="hint">Partage d\'abord la fenêtre du jeu (bouton plus haut).</p>'}
      <p class="hint">Partage bien la fenêtre ou l'onglet de Zynga (pas tout l'écran), pour qu'on ne voie que la table.</p>
    </section>`;
  }

  // Petit fichier zip sans compression (les images JPEG sont déjà compressées).
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, x) => a + x.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  async function recDownload() {
    if (!rec.frames.length) return;
    const zip = await makeZip(rec.frames);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = `captures-table-${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Fichier téléchargé : envoie-le moi dans la conversation');
  }

  // Recadrage : tracer un rectangle sur l'aperçu
  let dragFrom = null;
  document.addEventListener('mousedown', (ev) => {
    const stage = ev.target.closest && ev.target.closest('#cap-stage');
    if (!stage || !ui.cropping) return;
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    dragFrom = { r, x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    const rect = $('cap-rect');
    rect.hidden = false;
    Object.assign(rect.style, { left: dragFrom.x * 100 + '%', top: dragFrom.y * 100 + '%', width: '0%', height: '0%' });
  });
  document.addEventListener('mousemove', (ev) => {
    if (!dragFrom) return;
    const { r } = dragFrom;
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    const box = { x: Math.min(x, dragFrom.x), y: Math.min(y, dragFrom.y), w: Math.abs(x - dragFrom.x), h: Math.abs(y - dragFrom.y) };
    dragFrom.box = box;
    Object.assign($('cap-rect').style, { left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%' });
  });
  document.addEventListener('mouseup', () => {
    if (!dragFrom) return;
    const box = dragFrom.box;
    dragFrom = null;
    ui.cropping = false;
    if (box && box.w > 0.03 && box.h > 0.03) {
      crop = box;
      store.set(CKEY, JSON.stringify(crop));
      toast('Recadrage enregistré');
    }
    render();
  });

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
          <span class="nm">${esc(p.name)} ${badges} ${p.me ? '' : styleTag(p.name, 'style-tag')}</span>
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
            ${p.me ? '' : `<button class="btn danger" data-a="seat-remove" data-id="${p.id}">Il quitte la table</button>`}
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
        <label class="field">Petite blinde ${tip('sb')}<input class="in" type="number" inputmode="numeric" min="1" data-set="sb" value="${S.sb}"></label>
        <label class="field">Grosse blinde ${tip('bb')}<input class="in" type="number" inputmode="numeric" min="1" data-set="bb" value="${S.bb}"></label>
        <label class="field">Ante ${tip('ante')}<input class="in" type="number" inputmode="numeric" min="0" data-set="ante" value="${S.ante || 0}"></label>
      </div>
      <label class="field">Qui paie l'ante ? ${tip('anteType')}<select class="in" data-set="anteType">
        <option value="chacun" ${S.anteType !== 'bb' ? 'selected' : ''}>Chaque joueur</option>
        <option value="bb" ${S.anteType === 'bb' ? 'selected' : ''}>La grosse blinde, pour toute la table</option>
      </select></label>
      <p class="hint">Quand les blindes ou l'ante changent : le changement s'applique à la main suivante et Claude en est prévenu tout seul. Pas d'ante ? Laisse 0.</p>
    </section>
    ${viewProfiles()}
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

  function viewProfiles() {
    const list = Object.entries(profDb.p).filter(([k, r]) => r.n > 0 && (!k.includes('|') || k.startsWith(state.gid + '|')))
      .sort((a, b) => b[1].n - a[1].n);
    const rows = list.map(([k, r]) => {
      const pr = PROF.profile(r);
      return `<li><span class="nm">${esc(r.name)}</span><span class="style-cell">${pr ? `<span class="style-tag t-${pr.tone} tipped" data-tip="prof:${esc(k)}">${pr.short}</span>` : '<span class="muted">pas assez de mains</span>'}</span><span class="stk">${r.n} main${r.n > 1 ? 's' : ''}</span></li>`;
    }).join('');
    return `<section class="panel">
      <h2>Profils des joueurs ${tip('profiles')}</h2>
      ${rows ? `<ul class="prof-list">${rows}</ul>` : '<p class="hint">Aucun joueur observé pour l\'instant : les profils se remplissent tout seuls à chaque main saisie en mode Manuel.</p>'}
      ${rows ? '<button class="btn danger wide" data-a="prof-clear">Oublier tous les profils</button>' : ''}
    </section>`;
  }

  /* ------------------------------------------------------------ actions */

  const handlers = {
    mode(d) {
      mode = d.v === 'auto' ? 'auto' : 'manuel';
      store.set(MKEY, mode);
      ui.cropping = false;
      render();
      window.scrollTo(0, 0);
    },
    'copy-auto-prompt'() { copy(E.buildAutoPrompt(), 'Prompt Auto copié : colle-le dans une nouvelle conversation Claude'); },
    'toggle-auto-prompt'() { ui.showAutoPrompt = !ui.showAutoPrompt; render(); },
    'cap-start'() { startCapture(); },
    'cap-stop'() { recStop(); stopCapture(); toast('Partage arrêté'); },
    'rec-start'() { recStart(); },
    'rec-stop'() { recStop(); toast(recCountText() + ' gardées'); },
    'rec-dl'() { recDownload(); },
    'rec-clear'() { if (!window.confirm('Effacer les captures enregistrées ?')) return; rec.frames = []; rec.bytes = 0; render(); },
    'cap-shot'() { shoot(); },
    'cap-crop'() { ui.cropping = !ui.cropping; render(); },
    'cap-uncrop'() { crop = null; store.del(CKEY); render(); },
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
    deal() { cmd((s) => startHand(s)); },
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
        recordHand(s);
        const r = E.endHand(s);
        if (!r.ok) return r;
        const r2 = startHand(s);
        if (!r2.ok) warn = r2.err;
        return { ok: true };
      });
      if (warn) toast(warn);
    },
    'next-only'() { cmd((s) => { recordHand(s); return E.endHand(s); }); },
    'end-only'() {
      cmd((s) => { recordHand(s); return E.endHand(s); });
      ui.tab = 'table';
      render();
    },
    abort() {
      if (!window.confirm('Effacer la saisie de cette main ? Les jetons et le jeton D reviennent à leur état d\'avant la main. (Pour te coucher, utilise plutôt « Couché ».)')) return;
      cmd((s) => E.abortHand(s));
    },
    'copy-msg'() { copy(E.buildMessage(state), 'Message copié'); },
    'share-msg'() { share(E.buildMessage(state)); },
    chart(d) {
      ui.chart = d.v;
      render();
      // téléphone (pas de survol) : la bulle de la place touchée s'ouvre, jusqu'au prochain toucher
      if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
        const el = document.querySelector(`[data-a="chart"][data-v="${d.v}"]`);
        if (el) showTip(el, true);
      }
    },
    'quiz-start'() { ui.quiz = pickQuiz(null); render(); window.scrollTo(0, 0); },
    'quiz-show'() { if (ui.quiz) { ui.quiz.shown = true; render(); } },
    'quiz-yes'() { if (!ui.quiz) return; learned.add(ui.quiz.id); saveLearned(); ui.quiz = pickQuiz(ui.quiz.id); render(); },
    'quiz-no'() { if (!ui.quiz) return; learned.delete(ui.quiz.id); saveLearned(); ui.quiz = pickQuiz(ui.quiz.id); render(); },
    'quiz-stop'() { ui.quiz = null; render(); },
    'prof-clear'() {
      if (!window.confirm('Oublier la façon de jouer de tous les joueurs ?')) return;
      profDb = { v: 1, p: {}, recent: [] };
      store.set(PKEY, JSON.stringify(profDb));
      eqCache.clear();
      render();
      toast('Profils effacés');
    },
    'apply-advice'(d) {
      const a = ADV.toAction({ action: d.act, to: Number(d.to) });
      if (a) cmd((s) => E.applyAction(s, a));
    },
    'show-cards'(d) {
      const h = state.hand;
      if (!h) return;
      const cards = parseCardsText(d.value);
      if (d.value.trim() && cards.length !== 2) return toast('Tape 2 cartes : la valeur puis la couleur (p c k t), ex : « ac kk » = A♥ K♦');
      const before = h.phase;
      const r = cmd((s) => E.showCards(s, d.id, cards));
      if (r && r.ok && before === 'showdown' && state.hand && state.hand.phase === 'done') toast('Gagnant trouvé grâce aux cartes montrées');
    },
    // table de poker (PC) : « + » et « − »
    'seat-add'(d) {
      ui.addAfter = ui.addAfter === d.id ? null : d.id;
      render();
      const el = $('sa-name');
      if (el) el.focus();
    },
    'seat-add-cancel'() { ui.addAfter = null; render(); },
    'seat-add-ok'() {
      const name = $('sa-name').value;
      const stack = $('sa-stack').value;
      const afterId = ui.addAfter;
      const r = cmd((s) => E.addPlayer(s, { name, stack, afterId }));
      if (r && r.ok) {
        ui.addAfter = null;
        render();
        toast(state.hand ? 'Joueur ajouté : il jouera à la main suivante' : 'Joueur ajouté');
      } else {
        const el = $('sa-name');
        if (el) { el.value = name; $('sa-stack').value = stack; el.focus(); }
      }
    },
    'seat-remove'(d) {
      const p = player(d.id);
      if (!p) return;
      const r = cmd((s) => E.leavePlayer(s, d.id));
      if (r && r.ok) toast(r.later ? `${p.name} part : couché quand c'est à lui, retiré à la fin de la main (Ctrl+Z pour annuler)` : `${p.name} a quitté la table (Ctrl+Z pour annuler)`);
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

  /* ------------------------------------------------------------ bulles d'aide */

  const bubble = { for: null, pinned: false };

  function showTip(btn, pinned) {
    const el = $('tip');
    el.textContent = tipText(btn.dataset.tip);
    el.hidden = false;
    el.classList.remove('below');
    const r = btn.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let top = r.top - hgt - 10;
    if (top < 8) { top = r.bottom + 10; el.classList.add('below'); }
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.setProperty('--ax', (r.left + r.width / 2 - left) + 'px');
    document.querySelectorAll('.tip-on').forEach((b) => b.classList.remove('tip-on'));
    btn.classList.add('tip-on'); // pas « on » : sur les boutons de l'onglet Mains, « on » veut dire « choisi »
    bubble.for = btn;
    bubble.pinned = !!pinned;
  }

  function hideTip() {
    const el = $('tip');
    if (el) el.hidden = true;
    if (bubble.for) bubble.for.classList.remove('tip-on');
    bubble.for = null;
    bubble.pinned = false;
  }

  const TIP_SEL = '.help-q, .tipped';
  document.addEventListener('mouseover', (ev) => {
    const q = ev.target.closest && ev.target.closest(TIP_SEL);
    if (q && !bubble.pinned) showTip(q, false);
  });
  document.addEventListener('mouseout', (ev) => {
    const q = ev.target.closest && ev.target.closest(TIP_SEL);
    if (q && !bubble.pinned && !(ev.relatedTarget && q.contains(ev.relatedTarget))) hideTip();
  });
  document.addEventListener('focusin', (ev) => { if (ev.target.classList && ev.target.classList.contains('help-q')) showTip(ev.target, false); });
  document.addEventListener('focusout', (ev) => { if (ev.target.classList && ev.target.classList.contains('help-q') && !bubble.pinned) hideTip(); });
  window.addEventListener('scroll', () => { if (bubble.for) hideTip(); }, { passive: true });
  document.addEventListener('toggle', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('history') && ev.target.closest('.col-b')) ui.histOpen = ev.target.open;
    if (ev.target.classList && ev.target.classList.contains('plain') && ev.target.dataset.kind) {
      if (ev.target.open) plainOpen.add(ev.target.dataset.kind); else plainOpen.delete(ev.target.dataset.kind);
      store.set(XKEY, JSON.stringify([...plainOpen]));
    }
    if (ev.target.classList && ev.target.classList.contains('lr-sec') && !ui.learnQ) {
      ui.learnOpen = ui.learnOpen || new Set();
      if (ev.target.open) ui.learnOpen.add(ev.target.dataset.sec); else ui.learnOpen.delete(ev.target.dataset.sec);
    }
  }, true);
  window.addEventListener('resize', () => { if (bubble.for) hideTip(); });

  document.addEventListener('click', (ev) => {
    let q = ev.target.closest(TIP_SEL);
    if (q && q.classList.contains('tipped') && q.closest('[data-a]')) q = null; // dans un bouton : le bouton d'abord
    if (q) {
      ev.preventDefault();
      if (bubble.for === q && bubble.pinned) hideTip();
      else showTip(q, true); // au toucher (téléphone), la bulle reste ouverte jusqu'au prochain toucher
      return;
    }
    if (bubble.for) hideTip();
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
    else if (t.id === 'learn-q') { ui.learnQ = t.value; filterLearn(); }
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
    if (t.dataset.show) {
      const h = state && state.hand;
      const cur = h && h.shown && h.shown[t.dataset.show] ? h.shown[t.dataset.show].join('') : '';
      if (parseCardsText(t.value).join('') !== cur) handlers['show-cards']({ id: t.dataset.show, value: t.value });
      return;
    }
    if (t.dataset.know) {
      if (t.checked) learned.add(t.dataset.know); else learned.delete(t.dataset.know);
      saveLearned();
      const li = t.closest('.lr-item');
      if (li) li.classList.toggle('known', t.checked);
      updateLearnCounts();
      return;
    }
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
    // Clavier AZERTY sans pavé numérique : la touche « 1 » sans Maj donne « & », « 2 » donne « é »…
    // On se fie à la touche physique (ev.code) : les chiffres marchent avec ou sans Maj, sur tous les claviers.
    const dm = /^Digit(\d)$/.exec(ev.code || '');
    const digit = dm && !ev.ctrlKey && !ev.metaKey && !ev.altKey ? dm[1] : null;
    const k = digit || ev.key;
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    // dans un champ de montant (ou de cartes montrées), on écrit le chiffre même sans Maj
    if (inField && digit && ev.key !== digit && (t.type === 'number' || t.dataset.show)) {
      ev.preventDefault();
      // comme une vraie frappe : remplace le texte sélectionné (le montant proposé est présélectionné)
      let done = false;
      try { done = document.execCommand('insertText', false, digit); } catch (e) { done = false; }
      if (!done) {
        if (t.type === 'number') t.value += digit;
        else t.setRangeText(digit, t.selectionStart, t.selectionEnd, 'end');
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k.toLowerCase() === 'z' && !inField) {
      ev.preventDefault();
      return handlers.undo();
    }
    if (inField) {
      if (k === 'Enter') {
        if (t.id === 'amt') { ev.preventDefault(); handlers.act({ t: 'r' }); }
        else if (t.id === 'add-name' || t.id === 'add-stack') { ev.preventDefault(); handlers.add(); }
        else if (t.id === 'sa-name' || t.id === 'sa-stack') { ev.preventDefault(); handlers['seat-add-ok'](); }
        else if (t.dataset.show) { ev.preventDefault(); handlers['show-cards']({ id: t.dataset.show, value: t.value }); }
      } else if (k === 'Escape' && t.id === 'amt') { ui.sizing = false; render(); }
      else if (k === 'Escape' && (t.id === 'sa-name' || t.id === 'sa-stack')) handlers['seat-add-cancel']();
      return;
    }
    if (mode === 'auto') {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return; // le bouton s'en charge
      if (k === ' ' || k.toLowerCase() === 'c') { ev.preventDefault(); shoot(); }
      else if (k === 'Escape' && ui.cropping) { ui.cropping = false; render(); }
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
      if (key === 'g' && mine) {
        const btn = document.querySelector('[data-a="apply-advice"]');
        if (btn) return run(() => handlers['apply-advice'](btn.dataset));
        return;
      }
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

  /* ------------------------------------------------------------ nouvelle version en ligne */

  // Le navigateur garde parfois l'ancienne version de l'appli quelques minutes. On compare la version de la page
  // ouverte à celle en ligne (version.json, jamais gardée en mémoire) et on propose de mettre à jour d'un clic.
  // Les données de la partie sont dans le navigateur : rien n'est perdu.
  const meta = document.querySelector('meta[name="app-version"]');
  const myVersion = meta ? meta.content : null;
  async function checkVersion() {
    if (!myVersion || $('update-bar')) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { v } = await r.json();
      if (!v || v === myVersion) return;
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.className = 'update-bar';
      bar.innerHTML = '<span>Une nouvelle version de l\'appli est en ligne.</span><button class="btn primary small" type="button">Mettre à jour</button>';
      bar.querySelector('button').addEventListener('click', () => {
        location.replace(location.pathname + '?v=' + encodeURIComponent(v) + location.hash); // adresse nouvelle : la page est rechargée en entier
      });
      document.body.appendChild(bar);
    } catch (e) { /* hors ligne : on réessaiera */ }
  }
  checkVersion();
  setInterval(checkVersion, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

  render();
})();

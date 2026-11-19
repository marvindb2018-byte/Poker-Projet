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
  const QKEY = 'pokercode:quickgame'; // partie rapide de l'onglet Mains : { on, n, btn (siège du jeton D), cls (ma main),
  //   marks { siège: 1 relance normale | 2 grosse relance ou tapis }, st { siège: { c: occasions, r: relances } } }
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
  let qg = parse(store.get(QKEY));
  // Partie rapide : historique des gestes, pour « Annuler » (↶ ou Ctrl+Z sur la page Mains)
  let qgHist = [];
  const qgPush = (label) => { qgHist.push({ s: JSON.stringify(qg), label }); if (qgHist.length > 60) qgHist.shift(); };
  let tourActive = false; // pendant le petit tuto, la partie d'exemple n'est jamais enregistrée
  const TOUR_ON = () => tourActive;
  const saveQg = () => (tourActive ? null : qg ? store.set(QKEY, JSON.stringify(qg)) : store.del(QKEY));
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
  if (qg && qg.on && !state) ui.tab = 'charts'; // partie rapide en cours : on rouvre directement l'onglet Mains

  function defaultSetup() {
    return {
      n: 6, sb: 10, bb: 20, ante: 0, anteType: 'chacun', me: 0, btn: 0, paused: [],
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
    'tab-main': "Partie : la partie en cours. Tes cartes, ce que fait chaque joueur, le message à envoyer à Claude et l'aide instantanée. Touche un joueur pour corriger ses jetons, le mettre en pause, le faire partir ou lui donner le jeton D.",
    'tab-charts': "Mains : les tableaux des mains de départ, quoi faire avant le flop selon ta place. À étudier pour progresser.",
    'tab-learn': "Apprendre : toutes les notions du poker expliquées simplement, avec une recherche et un mode « Teste-toi ».",
    'tab-prompt': "Prompt : le texte de départ à coller dans une nouvelle conversation Claude, pour qu'il comprenne les messages de l'appli.",
    'tab-settings': "Réglages : blindes et ante, profils des joueurs observés, nouvelle partie.",
    'mode-manuel': "Mode Manuel : tu saisis la partie dans l'appli, qui prépare les messages pour Claude et calcule l'aide instantanée.",
    'mode-auto': "Mode Auto : tu envoies des captures d'écran de la table à Claude, qui lit tout lui-même. Rien à saisir dans l'appli.",
    undo: "Annuler : revient en arrière d'une action, en cas d'erreur de saisie (Ctrl+Z).",
    tour: 'Petit tuto : un rappel de comment utiliser cette page, étape par étape (Échap pour quitter).',
    vsraise: "Face à une relance : ce que tu fais quand un joueur a déjà relancé avant toi, à une autre place que la grosse blinde.",
    skip: "Tu n'as pas pu suivre cette main ? Passe-la : le jeton D avance comme sur le site et la main suivante commence. Les jetons reviennent à leur valeur d'avant la main : corrige-les si besoin en touchant un joueur. Ctrl+Z annule.",
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

  const curPage = () => (!state ? (ui.tab === 'charts' || ui.tab === 'learn' ? ui.tab : 'main') : ui.tab);
  // Le mode Auto ne concerne que la page Partie : Mains et Apprendre restent les mêmes
  const autoPage = () => mode === 'auto' && curPage() === 'main';

  // Manuel / Auto : en haut de la page Partie
  function modeBar() {
    return `<div class="mode-bar"><span class="lbl">Saisie de la partie</span><div class="mode-switch" role="group" aria-label="Mode de saisie">
      <button class="tipped ${mode !== 'auto' ? 'on' : ''}" data-a="mode" data-v="manuel" data-tip="mode-manuel">Manuel</button>
      <button class="tipped ${mode === 'auto' ? 'on' : ''}" data-a="mode" data-v="auto" data-tip="mode-auto">Auto</button>
    </div></div>`;
  }

  function render() {
    hideTip();
    // en mode Auto, Prompt et Réglages (qui ne servent qu'à la saisie manuelle) sont masqués : on revient sur Partie
    if (mode === 'auto' && (ui.tab === 'prompt' || ui.tab === 'settings')) ui.tab = 'main';
    document.body.classList.toggle('tab-charts', curPage() === 'charts');
    const auto = autoPage();
    document.body.classList.toggle('auto', auto);
    $('undo').disabled = !state || !hist.length;
    // Annuler ne concerne que la partie de la page Partie : masqué sur Mains et Apprendre (et en mode Auto)
    const gamePage = curPage() === 'main' || curPage() === 'prompt' || curPage() === 'settings';
    $('undo').hidden = auto || !gamePage;
    const nav = document.querySelector('.nav');
    nav.hidden = false;
    $('tour-btn').hidden = curPage() !== 'charts'; // le « ? » : pour l'instant, seulement sur la page Mains
    // sans partie en cours (ou en mode Auto) : Partie, Mains et Apprendre restent accessibles ; Prompt et Réglages, non
    nav.querySelectorAll('[data-tab="prompt"], [data-tab="settings"]').forEach((b) => { b.hidden = !state || mode === 'auto'; });
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === curPage()));
    if (auto) {
      $('view').innerHTML = modeBar() + viewAuto();
      $('side').innerHTML = viewSide();
      attachPreview();
      return;
    }
    let html;
    if (!state) html = ui.tab === 'charts' ? viewCharts() : ui.tab === 'learn' ? viewLearn() : viewSetup();
    else if (ui.tab === 'prompt') html = viewPrompt();
    else if (ui.tab === 'settings') html = viewSettings();
    else if (ui.tab === 'charts') html = viewCharts();
    else if (ui.tab === 'learn') html = viewLearn();
    else { ui.tab = 'main'; html = viewMain(); }
    if (curPage() === 'charts') html = `<div class="wide-page">${html}</div>`; // tableau + table (ou boutons) côte à côte sur PC
    else if (!state || ui.tab !== 'main') html = `<div class="narrow">${curPage() === 'main' ? modeBar() : ''}${html}</div>`;
    if (state && ui.tab === 'main') html = modeBar() + html;
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
      ${quickStart()}
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

  // Démarrage rapide : une capture de la table → Claude répond par une ligne « TABLE … » → collée ici, elle remplit tout
  function quickStart() {
    if (!ui.quickOpen) {
      return `<button class="btn quick-btn wide" data-a="quick-open">⚡ Démarrage rapide <small>une capture de la table, Claude remplit tout</small></button>
        <p class="hint quick-or">ou remplis toi-même ci-dessous :</p>`;
    }
    const r = ui.quickResult;
    let msg = '';
    if (r && !r.ok) msg = `<p class="warn">${esc(r.err)}</p>`;
    else if (r) {
      const me = r.players.find((x) => x.me), btn = r.players.find((x) => x.btn);
      msg = `<p class="quick-ok">✓ Lu : <b>${r.players.length} joueurs</b>${r.sb ? ` · blindes <b>${r.sb}/${r.bb}</b>` : ''}${r.ante ? ` · ante ${r.anteType === 'bb' ? 'BB ' : ''}${r.ante}` : ''} · toi : <b>${esc(me.name)}</b>${btn ? ` · jeton D : <b>${esc(btn.name)}</b>` : ''}${r.players.some((x) => x.paused) ? ` · en pause : ${r.players.filter((x) => x.paused).map((x) => esc(x.name)).join(', ')}` : ''}</p>`
        + (r.warnings.length ? `<ul class="quick-warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '')
        + `<p class="hint">Tout est rempli ci-dessous : jette un œil, puis lance la partie.</p>
          <button class="btn primary big" data-a="setup-go">Commencer la partie</button>`;
    }
    return `<div class="quick">
      <div class="quick-head"><b>⚡ Démarrage rapide</b><button class="link-btn" data-a="quick-close">Fermer</button></div>
      <ol class="steps">
        <li>Fais une capture de la table du site (sur PC : <kbd>Win</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>).</li>
        <li>Copie ce prompt et colle-le dans Claude avec ta capture :
          <button class="btn small" data-a="copy-table-prompt">Copier le prompt « lecture de table »</button></li>
        <li>Colle ici la réponse de Claude (une ligne « TABLE … ») :</li>
      </ol>
      <textarea class="in" id="table-paste" rows="2" placeholder="TABLE blindes 10/20 | ante 0 | Marvin 2000 (moi) | Paul 1850 (D) | …">${esc(ui.tablePaste || '')}</textarea>
      ${msg}
    </div>`;
  }

  // La réponse de Claude collée : on remplit le formulaire de départ
  function applyTableLine(text) {
    ui.tablePaste = text;
    if (!/TABLE/i.test(text) || !text.includes('|')) { ui.quickResult = text.trim().length > 20 ? E.parseTableLine(text) : null; return; }
    const r = E.parseTableLine(text);
    ui.quickResult = r;
    if (!r.ok) return;
    const s = ui.setup;
    s.n = r.players.length;
    r.players.forEach((x, i) => { s.names[i] = x.name; s.stacks[i] = x.stack > 0 ? String(x.stack) : ''; });
    s.me = Math.max(0, r.players.findIndex((x) => x.me));
    s.btn = Math.max(0, r.players.findIndex((x) => x.btn));
    s.paused = r.players.map((x, i) => (x.paused ? i : -1)).filter((i) => i >= 0);
    if (r.sb && r.bb) { s.sb = r.sb; s.bb = r.bb; }
    s.ante = r.ante || 0;
    s.anteType = r.anteType || 'chacun';
  }

  /* ---- onglet Partie (data-tab="main") */

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
    if (!h) return `<div class="hand-grid"><div class="col-a">${out}${viewIdle(state.promptCopied && !ui.edit && !ui.addOpen)}</div><div class="col-b">${ptable(null)}</div></div>`;
    let a = handHead(h);
    if (h.phase === 'spectate') a += viewSpectate(h);
    else if (h.phase === 'cards') a += picker(2, `Tes cartes <span class="muted">(${h.pos[h.meId]})</span>`, [], null);
    else if (h.phase === 'board') a += viewBoard(h);
    else if (h.phase === 'action') a += viewAction(h);
    else if (h.phase === 'showdown') a += viewShowdown(h);
    else if (h.phase === 'done') a += viewDone(h);
    // sur PC, on ajoute un joueur avec le « + » entre deux sièges de la table : pas de bouton en double
    let b = '';
    if (h.phase !== 'spectate') b = wide() ? ptable(h) + strip(h) : ptable(h) + editorPanel() + strip(h) + othersList(h) + arrivalBox();
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
        ${h.phase === 'done' ? '' : `<button class="btn small skip tipped" data-a="skip-hand" data-tip="skip">⏭ Passer le tour</button>`}
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
      return `<li class="${cls} ${ui.edit === id ? 'editing' : ''}" data-a="edit" data-id="${id}" title="Modifier ce joueur">${posTag(h.pos[id], 'pos')}<span class="nm">${esc(h.names[id])}${id === h.meId ? ' <em>moi</em>' : ''}</span>${right}</li>`;
    }).join('')}</ol>`;
  }

  /* ---- joueurs : modifier, ajouter (dans l'onglet Partie, plus d'onglet Table) */

  const wide = () => !!(window.matchMedia && window.matchMedia('(min-width: 1000px)').matches); // PC : la table est affichée

  // Options d'un joueur (comme l'ancien onglet Table). Sur PC : par-dessus la table ; sur téléphone : au-dessus de la liste.
  function playerEditor(p) {
    const h = state.hand;
    const locked = !!h;
    const plan = h ? null : E.planNextHand(state);
    const btnId = h ? h.btnId : plan && plan.ok ? plan.btnId : null;
    const pos = h ? h.pos[p.id] : plan && plan.ok ? plan.pos[p.id] : null;
    const badges = [
      p.me ? '<span class="badge me">moi</span>' : '',
      p.id === btnId ? '<span class="badge dealer">D</span>' : '',
      p.paused ? '<span class="badge">pause</span>' : '',
      !p.paused && p.stack === 0 ? '<span class="badge out">0 jeton</span>' : '',
      h && E.isActive(p) && !h.order.includes(p.id) ? '<span class="badge new">prochaine main</span>' : '',
      p.leaving ? '<span class="badge out">part</span>' : '',
    ].join('');
    return `<div class="pl-edit todo" role="dialog" aria-label="Modifier ${esc(p.name)}">
      <div class="mt-label">À faire · modifier ce joueur</div>
      <div class="pe-head"><b>${esc(p.name)}</b> ${pos ? posTag(pos, 'pos-inline') : ''} ${badges} ${p.me ? '' : styleTag(p.name, 'style-tag')}</div>
      <div class="grid2">
        <label class="field">Pseudo<input class="in" id="ed-name" value="${esc(p.name)}" maxlength="18" autocomplete="off"></label>
        <label class="field">Jetons ${tip('stack')}<input class="in" id="ed-stack" type="number" inputmode="numeric" min="0" value="${p.stack}" ${locked ? 'disabled' : ''}></label>
      </div>
      ${locked ? '<p class="hint">Main en cours : seul le pseudo se change maintenant. Jetons, jeton D, pause et « c\'est moi » : entre deux mains.</p>' : ''}
      <div class="btn-grid">
        <button class="btn primary" data-a="ed-save" data-id="${p.id}">Enregistrer ${K('Entrée')}</button>
        <button class="btn" data-a="ed-btn" data-id="${p.id}" ${locked ? 'disabled' : ''}>Jeton D à la prochaine main</button>
        <button class="btn" data-a="ed-pause" data-id="${p.id}" ${locked ? 'disabled' : ''}>${p.paused ? 'Revient en jeu' : 'Pause (ne joue pas)'}</button>
        <button class="btn" data-a="ed-me" data-id="${p.id}" ${locked || p.me ? 'disabled' : ''}>C'est moi</button>
        ${p.me || p.leaving ? '' : `<button class="btn danger" data-a="seat-remove" data-id="${p.id}">Il quitte la table</button>`}
        <button class="btn ghost" data-a="ed-close">Fermer ${K('Échap')}</button>
      </div>
    </div>`;
  }
  // Téléphone : les options s'ouvrent sous la liste, on les fait venir à l'écran
  function showEditor() {
    const ed = document.querySelector('.pl-edit');
    if (ed && !wide()) ed.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const editorPanel = () => {
    const p = ui.edit && player(ui.edit);
    return p ? playerEditor(p) : '';
  };

  // Joueurs assis qui ne jouent pas la main (pause, arrivés en cours de main, sans jetons) : à toucher aussi
  function othersList(h) {
    const out = state.players.filter((p) => (h ? !h.order.includes(p.id) : !E.isActive(p) || p.leaving));
    if (!out.length) return '';
    return `<div class="others"><div class="ins-sub">Aussi à table</div><ol class="strip">${out.map((p) => {
      const tag = p.leaving ? 'part' : p.paused ? 'pause' : p.stack === 0 ? '0 jeton' : 'prochaine main';
      return `<li class="${ui.edit === p.id ? 'editing' : ''}" data-a="edit" data-id="${p.id}" title="Modifier ce joueur"><span class="pos">—</span><span class="nm">${esc(p.name)}${p.me ? ' <em>moi</em>' : ''}</span><span class="stk">${p.stack}</span><span class="st">${tag}</span></li>`;
    }).join('')}</ol></div>`;
  }

  // « Un joueur arrive » (sur PC, aussi avec les « + » entre les places de la table)
  function arrivalBox() {
    const full = state.players.length >= E.MAX_PLAYERS;
    if (full) return '';
    if (!ui.addOpen) return `<button class="btn ghost wide arrive-btn" data-a="add-open">+ Un joueur arrive</button>`;
    return `<div class="pl-edit todo">
      <div class="mt-label">À faire · un joueur arrive</div>
      <div class="grid2">
        <label class="field">Pseudo<input class="in" id="add-name" placeholder="Pseudo" maxlength="18" autocomplete="off"></label>
        <label class="field">Jetons<input class="in" id="add-stack" type="number" inputmode="numeric" min="1" placeholder="ex : 2550"></label>
      </div>
      <label class="field">S'assoit après
        <select class="in" id="add-after">${state.players.map((p, i) => `<option value="${p.id}" ${i === state.players.length - 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </label>
      <div class="btn-grid">
        <button class="btn primary" data-a="add">Ajouter ${K('Entrée')}</button>
        <button class="btn ghost" data-a="add-close">Annuler</button>
      </div>
      <p class="hint">${state.hand ? 'Une main est en cours : il jouera à partir de la main suivante.' : 'Il jouera dès la prochaine main.'}</p>
    </div>`;
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
      const click = cand.includes(id) ? ` data-a="sel" data-id="${id}" title="Choisir comme gagnant"` : ` data-a="edit" data-id="${id}" title="Modifier ${esc(p.name)}"`;
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
    if (ui.edit && P.some((x) => x.id === ui.edit) && wide()) html += editorPanel();
    else if (ui.addAfter && P.some((x) => x.id === ui.addAfter)) {
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
        return `<li class="${p.me ? 'me' : ''} ${ui.edit === id ? 'editing' : ''}" data-a="edit" data-id="${id}" title="Modifier ce joueur">${posTag(plan.pos[id], 'pos')}<span class="nm">${esc(p.name)}${p.me ? ' <em>moi</em>' : ''}</span><span class="stk">${p.stack}</span></li>`;
      }).join('')}</ol>`;
      const me = state.players.find((p) => p.me);
      if (!me) out += `<p class="warn">Aucun joueur n'est marqué « moi » : touche ton nom, puis « C'est moi ».</p>`;
      else if (!plan.order.includes(me.id)) out += `<p class="warn">Tu ne joues pas cette main (pause ou 0 jeton).</p>`;
    }
    out += `<p class="hint"><b>BTN</b> = joueur avec le jeton D · <b>SB</b> / <b>BB</b> = petite et grosse blinde (${S.sb}/${S.bb}${S.ante ? (S.anteType === 'bb' ? ', ante BB ' : ', ante ') + S.ante : ''}) · <b>UTG</b> parle en premier ${tip('positions')}.</p>
      <button class="btn primary big" data-a="deal" ${plan.ok ? '' : 'disabled'}>Distribuer la main #${n} ${K('Entrée')}</button>
      <p class="hint">Un joueur part, recave ou n'a plus les mêmes jetons que sur le site ? Touche-le${wide() ? ' sur la table' : ' dans la liste'}.${wide() ? ' Un joueur arrive ? Le « + » entre deux sièges.' : ''}</p>
    </section>`;
    if (!wide()) out += editorPanel() + othersList(null) + arrivalBox();
    if (state.last) out += lastHand(state.last);
    return out;
  }

  function lastHand(L) {
    if (L.skipped) return `<section class="panel soft"><h3>Main #${L.no} <span class="muted">passée, non suivie</span></h3></section>`;
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

  // Place de chaque siège (0 = moi, puis dans le sens des aiguilles d'une montre) quand le jeton D est au siège b
  function seatPositions(n, b) {
    const P = E.POSITIONS[n];
    return Array.from({ length: n }, (_, i) => {
      const off = (i - b + n) % n;
      if (n === 2) return off === 0 ? 'BTN' : 'BB';
      return off === 0 ? 'BTN' : off === 1 ? 'SB' : off === 2 ? 'BB' : P[off - 3];
    });
  }

  // Partie rapide (onglet Mains) : je joue avec mes potes, l'appli suit seulement le jeton D et me dit ma place.
  // Même table que la partie normale (sièges, dos de cartes, jeton D), affichée aussi sur téléphone.
  function quickTable() {
    const n = qg.n, b = qg.btn;
    const pos = b == null ? null : seatPositions(n, b);
    const RX = 44, RY = 43;
    const at = (r, deg) => {
      const a = (deg * Math.PI) / 180;
      return `left:${(50 + RX * r * Math.cos(a)).toFixed(2)}%;top:${(50 + RY * r * Math.sin(a)).toFixed(2)}%`;
    };
    const dealerCorner = (deg) => { // comme la table normale : sur le coin tourné vers le centre
      const a = (deg * Math.PI) / 180;
      if (Math.abs(Math.cos(a)) < 0.2) return 'd-mr';
      return 'd-' + (Math.sin(a) < -0.2 ? 'b' : 't') + (Math.cos(a) > 0.2 ? 'l' : 'r');
    };
    const back = '<span class="cb"></span><span class="cb"></span>';
    let seats = '';
    const QA = b == null ? null : qgActs();
    const post = b != null && (qg.board || []).length >= 3 ? postPlan() : null; // après le flop (mes cartes connues)
    const postOn = b != null && (qg.board || []).length >= 3;
    for (let k = 0; k < n; k++) {
      const deg = 90 + (k * 360) / n;
      const me = k === 0;
      const real = me && qg.cards && qg.cards.length === 2 && ODDS.handClass(qg.cards[0], qg.cards[1]) === qg.cls;
      const cards = me ? (real ? qg.cards.map((c) => cardHtml(c, 'xs')).join('') : qg.cls ? `<span class="seat-hand">${qg.cls.replace(/[so]$/, (m) => `<small>${m}</small>`)}</span>` : '') : back;
      const mk = postOn ? (post ? post.acts[k] : null) : QA ? QA.acts[k] : null;
      const afterRaise = postOn ? post && !me && post.betBeforeSeat(k) : QA && !me && QA.raisedBefore(k);
      const sty = me ? null : seatStyle(k);
      const title = b == null ? 'Touche le joueur qui a le jeton D' : me ? `Toi. ${touchUI() ? 'Touche' : 'Clic'} : saisir ou changer tes cartes · ${touchUI() ? 'Appui long' : 'Clic droit'} : le jeton D est chez toi`
        : (postOn ? (afterRaise ? 'Clic : il suit · 2e clic : il relance' : 'Clic : il mise · 2e clic : grosse mise ou tapis')
          : afterRaise ? 'Clic : il suit · 2e clic : il relance la relance' : 'Clic : il relance · 2e clic : grosse relance ou tapis') + ' · 3e clic : annuler · Clic droit (appui long sur téléphone) : le jeton D est chez lui';
      seats += `<div class="seat ${me ? 'me' : ''} ${k === b ? 'is-btn' : ''} ${mk ? (mk === 'c' ? 'called' : 'raised') + ' a-' + (postOn ? { b: 'r', B: 'R', c: 'c', x: 'x' }[mk] : mk) : ''}" style="${at(1, deg)}" data-a="qg-btn" data-i="${k}" title="${title}">
        <div class="seat-cards">${cards}</div>
        <div class="seat-box">${k === b ? `<span class="dealer-badge ${dealerCorner(deg)}">D</span>` : ''}<span class="seat-pos">${pos ? pos[k] : '—'}</span><b class="seat-name">${me ? 'Toi' : 'Joueur ' + (k + 1)}</b>${sty ? `<span class="seat-sty">${sty.tag}</span>` : ''}</div>
        ${mk ? `<span class="seat-act">${postOn ? QP_ACT[mk] : QG_ACT[mk]}</span>` : ''}
      </div>`;
    }
    const mine = pos ? pos[0] : null;
    const bd = qg.board || [];
    const nextSt = NEXT_STREET(bd.length);
    const center = mine ? `<div class="qg-you ${bd.length ? 'small' : ''}">Tu es <b>${mine}</b></div>
        ${bd.length ? `<div class="qg-board">${bd.map((c) => cardHtml(c, 'xs')).join('')}</div>` : ''}
        ${nextSt ? `<button class="qg-street" data-a="qg-board" title="Facultatif : les cartes du ${nextSt.toLowerCase()}, pour un conseil après le flop">${nextSt}</button>` : ''}`
      : '<div class="qg-you qg-ask">Touche le joueur<br>qui a le jeton D</div>';
    // nombre de joueurs (à gauche) et croix pour arrêter (à droite) : dans les coins de la table, pour qu'elle monte
    const head = `<div class="qg-head">
        <div class="qg-n" title="Nombre de joueurs à la table"><div class="stepper">
          <button data-a="qg-n" data-d="-1" aria-label="Un joueur de moins">−</button><b>${n}</b><button data-a="qg-n" data-d="1" aria-label="Un joueur de plus">+</button>
        </div><span class="lbl">joueurs</span></div>
        <div class="qg-tr">
          <button class="qg-undo" data-a="qg-undo" aria-label="Annuler le dernier geste" title="${qgHist.length ? 'Annuler : ' + esc(qgHist[qgHist.length - 1].label) + ' (Ctrl+Z)' : 'Rien à annuler'}" ${qgHist.length ? '' : 'disabled'}>↶</button>
          <button class="qg-x" data-a="qg-stop" aria-label="Arrêter la partie rapide" title="Arrêter la partie rapide">×</button>
        </div></div>`;
    return `<section class="panel qg-box ${b == null ? 'todo' : ''}">
      ${b == null ? '<div class="mt-label">À faire · touche le joueur qui a le jeton D</div>' : ''}
      <div class="ptable qg-pt">${head}<div class="pt-felt"></div>${seats}<div class="pt-center">${center}</div></div>
      ${mine ? `${postOn ? (post ? postBox() : '<p class="q-me-txt">Donne tes cartes (clic sur toi) pour le conseil après le flop.</p>') : `<p class="q-me-txt">${esc(POS_TIPS[mine] || '')}</p>`}
        <button class="btn primary big" data-a="qg-next">Main suivante : le jeton D avance ${K('Entrée')}</button>
        <p class="hint">${postOn ? `Au ${STREET_NAME(bd.length)} : touche un joueur qui mise (1 fois = mise, 2 fois = grosse mise ou tapis) ; après une mise, la tienne comprise, 1 fois = il suit, 2 fois = il relance. Le pot est estimé, sans montants.` : ''}
        ${postOn ? '' : `Touche ta main dans le tableau${wide() ? ' à gauche' : ' en dessous'}. Quelqu'un relance ? Touche-le : 1 fois = relance, 2 fois = grosse relance ou tapis. Ceux qui parlent après une relance (la tienne comprise) : 1 fois = il suit, 2 fois = il relance la relance. 3 fois = annuler. Le jeton D : ${touchUI() ? 'appui long' : 'clic droit'} sur le joueur. Facultatif : « Flop » au milieu de la table pour un conseil après le flop.`}</p>`
        : '<p class="hint">Toi, tu es en bas ; les autres suivent dans le sens des aiguilles d\'une montre.</p>'}
    </section>`;
  }

  const touchUI = () => !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

  // Ce que l'appli a appris d'un siège (partie rapide) : à quelle fréquence il relance quand il parle avant moi
  const QG_MIN = 8; // occasions avant d'en tirer un style
  function seatProfile(k) {
    const t = (qg.st || {})[k];
    if (!t || t.c < QG_MIN) return null;
    const pr = (PROF.PRIOR && PROF.PRIOR.pfr) || 0.12, kk = (PROF.PRIOR && PROF.PRIOR.kHands) || 10;
    return { name: 'Joueur ' + (k + 1), pfr: (t.r + pr * kk) / (t.c + kk), seen: t.c };
  }
  function seatStyle(k) {
    const pf = seatProfile(k);
    if (!pf) return null;
    return pf.pfr >= 0.25 ? { tag: 'relance souvent', cls: 'loose' } : pf.pfr < 0.08 ? { tag: 'relance peu', cls: 'tight' } : null;
  }

  // Ce que veulent dire les clics, dans l'ordre où l'on parle avant le flop :
  // tant que personne n'a relancé, 1 clic = relance (r), 2 clics = grosse relance ou tapis (R) ;
  // après une relance, 1 clic = il suit (c), 2 clics = il relance la relance (x) ; après moi : il relance par-dessus moi (over)
  const QG_ACT = { r: 'Relance', R: 'Grosse relance / tapis', c: 'Suit', x: 'Sur-relance' };
  const QG_VERB = { r: 'a relancé', R: 'a relancé gros (ou tapis)', c: 'a suivi', x: 'a sur-relancé' };
  // Ce que veulent dire les clics, dans l'ordre où l'on parle avant le flop, ma propre action comprise :
  // tant que personne n'a relancé, 1 clic = relance (r), 2 clics = grosse relance ou tapis (R) ;
  // dès que quelqu'un a relancé avant lui (moi compris), 1 clic = il suit (c), 2 clics = il relance la relance (x).
  // cls : ma main (pour savoir si je relance moi-même) ; sans main connue, on suppose que je relance.
  function qgActs(cls) {
    const marks = qg.marks || {};
    const P = seatPositions(qg.n, qg.btn), order = E.POSITIONS[qg.n];
    const ord = (k) => order.indexOf(P[k]);
    const me = ord(0);
    const ks = Object.keys(marks).map(Number).filter((k) => marks[k] && k !== 0 && k < qg.n).sort((x, y) => ord(x) - ord(y));
    const acts = {};
    let raised = false;
    const read = (k) => { if (!raised) { acts[k] = marks[k] === 1 ? 'r' : 'R'; raised = true; } else acts[k] = marks[k] === 1 ? 'c' : 'x'; };
    ks.filter((k) => ord(k) < me).forEach(read); // ceux qui parlent avant moi
    const mine = cls === undefined ? qg.cls : cls;
    const my = mine ? myFirstAdvice(mine, P[0], qg.n, P, ks.filter((k) => ord(k) < me), acts) : null;
    const myRaises = !my || my.action === 'raise' || my.action === 'allin';
    if (myRaises) raised = true;
    ks.filter((k) => ord(k) > me).forEach(read); // ceux qui parlent après moi
    // y a-t-il déjà une relance avant ce siège (moi compris) ? pour savoir ce que voudra dire le prochain clic
    const raisedBefore = (k) => ks.some((j) => ord(j) < ord(k) && ord(j) !== me && 'rRx'.includes(acts[j])) || (ord(k) > me && myRaises);
    return { P, ord, me, ks, acts, raisedBefore, my };
  }
  // Mon premier conseil d'après ce qu'ont fait ceux qui parlent avant moi
  function myFirstAdvice(cls, pos, n, P, beforeKs, acts) {
    const raisers = beforeKs.filter((k) => 'rRx'.includes(acts[k]));
    if (raisers.length >= 2) return chartAdvice(cls, pos, n, 2, 200, { raiserPos: P[raisers[raisers.length - 1]] });
    if (raisers.length === 1) {
      const k = raisers[0];
      const callers = beforeKs.filter((j) => acts[j] === 'c').length;
      return chartAdvice(cls, pos, n, 1, acts[k] === 'r' ? 60 : 100, { raiserPos: P[k], raiser: seatProfile(k), callers });
    }
    return chartAdvice(cls, pos, n, 0, 20);
  }

  // Ce qui s'est passé à la table d'après les joueurs touchés (partie rapide), pour une main donnée
  function quickSituation(cls) {
    if (!qg || !qg.on || qg.btn == null) return null;
    const A = qgActs(cls);
    if (!A.ks.length) return null;
    const beforeKs = A.ks.filter((k) => A.ord(k) < A.me), afterKs = A.ks.filter((k) => A.ord(k) > A.me);
    const before = beforeKs.filter((k) => 'rRx'.includes(A.acts[k])); // relanceurs avant moi, dans l'ordre
    const callers = beforeKs.filter((k) => A.acts[k] === 'c' && before.length && A.ord(k) > A.ord(before[before.length - 1])); // ont suivi la dernière relance
    const after = afterKs.filter((k) => 'rRx'.includes(A.acts[k])); // relancent après moi
    const who = (k) => `Joueur ${k + 1} (${A.P[k]})`;
    const story = A.ks.map((k) => `${who(k)} ${QG_VERB[A.acts[k]]}${A.ord(k) > A.me ? ' après toi' : ''}`).join(', ');
    return { P: A.P, before, callers, after, acts: A.acts, who, story };
  }

  // Petite fenêtre au milieu de l'écran à chaque nouvelle main : 1re carte (valeur puis couleur), puis 2e carte
  function cardPop() {
    const pk = ui.qgPick;
    if (!pk || !qg || !qg.on || qg.btn == null) return '';
    const L = (r) => (r === 'T' ? '10' : r);
    const board = pk.kind === 'board', need = pk.need || 2;
    const street = board ? (need === 3 ? 'Flop' : (qg.board || []).length === 3 ? 'Turn' : 'River') : '';
    const nth = board && need === 1 ? street : (board ? street + ' : ' : '') + ['1re carte', '2e carte', '3e carte'][pk.cards.length];
    const used = pickUsed(pk);
    const slots = Array.from({ length: need }, (_, i) => i).map((i) => (pk.cards[i] ? cardHtml(pk.cards[i])
      : i === pk.cards.length && pk.rank ? `<span class="card empty qp-cur"><b>${L(pk.rank)}</b></span>` : `<span class="card empty ${i === pk.cards.length ? 'qp-cur' : ''}"></span>`)).join('');
    const body = !pk.rank
      ? `<div class="pk-title">${nth} : la valeur</div>
        <div class="ranks">${E.RANKS.map((r) => `<button class="rk" data-a="qp-rank" data-r="${r}" ${E.SUITS.every((x) => used.has(r + x)) ? 'disabled' : ''}>${L(r)}</button>`).join('')}</div>`
      : `<div class="pk-title">${nth} : ${L(pk.rank)} de quelle couleur ?</div>
        <div class="suits">${E.SUITS.map((x) => `<button class="su s-${x}" data-a="qp-suit" data-s="${x}" ${used.has(pk.rank + x) ? 'disabled' : ''}>${SUIT_SYM[x]}<small>${SUIT_NAME[x]}</small>${K(x.toUpperCase())}</button>`).join('')}</div>`;
    const mineSmall = board && qg.cards ? `<span class="qp-mine">${qg.cards.map((c) => cardHtml(c, 'xs')).join('')}${(qg.board || []).length ? '<i>·</i>' + qg.board.map((c) => cardHtml(c, 'xs')).join('') : ''}</span>` : '';
    return `<div class="qp-back"><div class="qp ${pk.cards.length || pk.rank ? '' : 'qp-in'}" role="dialog" aria-label="${board ? street : 'Tes cartes'}">
      <div class="qp-head"><b>${board ? (need === 3 ? 'Le flop' : street === 'Turn' ? 'La turn' : 'La river') : 'Tes cartes'}</b><span class="muted">${board ? '' : 'tu es ' + seatPositions(qg.n, qg.btn)[0]}</span>${mineSmall}
        <button class="link-btn" data-a="qp-close">Passer ${K('Échap')}</button></div>
      <div class="slots qp-slots">${slots}</div>
      ${body}
      <div class="qp-foot">${pk.cards.length || pk.rank ? `<button class="link-btn" data-a="qp-back">← Retour</button>` : '<span></span>'}
        <span class="hint pc-only">Au clavier : <kbd>9</kbd> puis <kbd>P</kbd> = 9♠ (<kbd>T</kbd> = 10)</span></div>
    </div></div>`;
  }
  const openCardPop = () => { ui.qgPick = { kind: 'hand', need: 2, cards: [], rank: null }; };

  // Deux cartes qui représentent une main du tableau (pour l'algorithme : les couleurs exactes ne comptent pas ici)
  function classCards(cls) {
    if (cls.length === 2) return [cls[0] + 'p', cls[1] + 'c'];
    return cls[2] === 's' ? [cls[0] + 'p', cls[1] + 'p'] : [cls[0] + 'p', cls[1] + 'c'];
  }

  // Conseil de l'algorithme (le même que dans l'onglet Partie) pour une main, une place et une relance de cb (blindes 10/20)
  function chartAdvice(cls, pos, n, raises, cb, extra) {
    return ODDS.preflopAdvice(Object.assign({ cards: classCards(cls), pos, n, bb: 20, sb: 10, cb, myBet: pos === 'BB' ? 20 : pos === 'SB' ? 10 : 0, myStack: 2000, raises, limpers: 0, callers: 0 }, extra || {}));
  }
  const catOf = (a) => (a.action === 'raise' || a.action === 'allin' ? 'r3' : a.action === 'call' ? 'call' : a.action === 'check' ? 'call' : 'fold');
  const ACT_TXT = { raise: 'Sur-relance', allin: 'Tapis', call: 'Suis', fold: 'Couche-toi', check: 'Check' };

  // Les lignes du conseil pour la situation touchée sur la table : { head, lines: [{ label, a, again }] }
  function situationLines(cls, pos, n, sit) {
    const { before, after, acts, who, P, callers, story } = sit;
    let lines;
    if (before.length >= 2) {
      lines = [{ label: 'Relance et sur-relance avant toi', a: chartAdvice(cls, pos, n, 2, 200, { raiserPos: P[before[before.length - 1]] }) }];
    } else if (before.length === 1) {
      const k = before[0], extra = { raiserPos: P[k], raiser: seatProfile(k), callers: callers.length };
      const sizes = acts[k] === 'r' ? [[60, "Relance normale (jusqu'à 3 BB)"]]
        : [[100, 'Grosse relance (3 à 6 BB)'], [200, 'Très grosse (6 à 15 BB)'], [2000, 'Plus de 15 BB, ou tapis']];
      // tailles voisines avec le même conseil : une seule ligne
      const merged = [];
      sizes.forEach(([cb, label]) => {
        const a = chartAdvice(cls, pos, n, 1, cb, extra);
        const last = merged[merged.length - 1];
        if (last && ACT_TXT[last.a.action] === ACT_TXT[a.action]) last.labels.push(label);
        else merged.push({ a, labels: [label] });
      });
      lines = merged.map((m) => ({ a: m.a, label: m.labels.length === 1 ? m.labels[0]
        : m.labels.length === 3 ? 'Grosse relance ou tapis, quelle que soit la taille'
          : m.labels[0].startsWith('Grosse') ? 'De 3 à 15 BB' : 'Plus de 6 BB, ou tapis' }));
    } else {
      lines = [{ label: "Personne n'a relancé avant toi", a: chartAdvice(cls, pos, n, 0, 20), open: true }];
    }
    // ceux qui relancent après moi : la décision suivante
    const first = lines[0].a;
    if (after.length && (first.action === 'raise' || first.action === 'call')) {
      const names = after.map(who).join(' puis ');
      if (first.action === 'raise') {
        lines.push({ label: after.length === 1 ? `${names} relance par-dessus ta relance` : `${names} relancent par-dessus ta relance`,
          a: chartAdvice(cls, pos, n, 2, first.to * 3, { iRaised: true, reraises: after.length }), again: true, dec: true });
      } else {
        lines.push({ label: `${names} relance après toi (tu avais suivi)`, a: chartAdvice(cls, pos, n, 2, 300, { raiserPos: P[after[after.length - 1]] }), dec: true });
      }
    }
    return { head: story, lines };
  }
  // La ligne qui décide pour cette main (la dernière décision à prendre)
  const decisive = (L) => L.lines.find((l) => l.dec) || L.lines[0];


  /* ---- partie rapide : après le flop (facultatif). Rien n'est saisi en jetons : pot et mises sont estimés */
  // ordre de parole après le flop : les blindes d'abord, le bouton en dernier
  const POST_ORDER = (n) => (n === 2 ? ['BB', 'BTN'] : ['SB', 'BB'].concat(E.POSITIONS[n].filter((x) => x !== 'SB' && x !== 'BB')));
  const QP_ACT = { b: 'Mise', B: 'Grosse mise / tapis', c: 'Suit', x: 'Relance' };
  const QP_VERB = { b: 'mise', B: 'mise gros (ou tapis)', c: 'suit', x: 'relance' };
  const STREET_NAME = (len) => (len <= 3 ? 'flop' : len === 4 ? 'turn' : 'river');
  const NEXT_STREET = (len) => (len === 0 ? 'Flop' : len === 3 ? 'Turn' : len === 4 ? 'River' : null);
  const STREET_NO = (len) => (len <= 3 ? 1 : len === 4 ? 2 : 3);

  // Avant le flop : niveau de mise (relance ≈ 3 BB, grosse ≈ 5,5 BB, sur-relance ×3) et pot estimé
  function prePot() {
    const A = qgActs();
    let level = 20;
    const step = (k) => {
      const a = A.acts[k];
      if (a === 'r') level = Math.max(level, 60); else if (a === 'R') level = Math.max(level, 110); else if (a === 'x') level = Math.round(level * 3);
    };
    A.ks.filter((k) => A.ord(k) < A.me).forEach(step);
    if (A.my && (A.my.action === 'raise' || A.my.action === 'allin')) level = Math.max(level, A.my.to || level * 3);
    A.ks.filter((k) => A.ord(k) > A.me).forEach(step);
    const meIn = !A.my || A.my.action !== 'fold';
    return { A, level, pot: level * (Math.max(1, A.ks.length) + (meIn ? 1 : 0)) + 10 };
  }

  // Les adversaires encore dans le coup : ceux touchés avant le flop (ou après), corrigé par − / +
  function postOpps(A, level) {
    const P = A.P, n = qg.n, sm = qg.smarks || {};
    const seen = new Set((qg.seenPost || []).concat(Object.keys(sm).filter((k) => sm[k]).map(Number)));
    let ids = A.ks.slice();
    seen.forEach((k) => { if (k !== 0 && !ids.includes(k)) ids.push(k); });
    const want = qg.opp != null ? qg.opp : Math.max(1, ids.length);
    const prio = (k) => (seen.has(k) ? 2 : 0) + ('rRx'.includes(A.acts[k] || '-') ? 1 : 0);
    ids = ids.sort((a, b) => prio(b) - prio(a)).slice(0, want);
    const st = PROF.stats(null);
    const past = (k) => (qg.past || []).filter((x) => x.acts[k]).map((x) => (x.acts[k] === 'c' ? { street: x.street, kind: 'call' }
      : { street: x.street, kind: x.acts[k] === 'x' ? 'raise' : 'bet', frac: x.acts[k] === 'B' ? 1 : 0.5 }));
    const model = (k, generic) => {
      const pa = generic ? null : A.acts[k];
      const act = pa === 'r' || pa === 'R' ? { raised: true, raiseOver: false, reraiseCount: 0, openKey: ODDS.openRangeKey(P[k], n) }
        : pa === 'x' ? { raised: true, raiseOver: true, reraiseCount: 1 } : { called: true, facingRaise: level > 20 };
      const pf = generic ? null : seatProfile(k);
      const r = ODDS.playerRange(act, pf ? { vpip: Math.min(0.9, Math.max(0.15, pf.pfr * 2.6)), pfr: pf.pfr } : null);
      return { seat: generic ? null : k, name: generic ? 'Adversaire' : `Joueur ${k + 1}`, pos: generic ? null : P[k], range: r.range, minus: r.minus,
        acts: generic ? [] : past(k), bluff: st.bluff, loose: st.loose, mix: st.mix, fold: null, allin: false, bet: 0, stack: 2000 - level, toCall: 0 };
    };
    return { list: ids.map((k) => model(k)).concat(Array.from({ length: Math.max(0, want - ids.length) }, () => model(null, true))), ids, want };
  }

  // Le conseil pour le tour en cours (flop, turn ou river), d'après les clics sur les joueurs ; mis en cache
  const postCache = new Map();
  function postPlan() {
    if (!qg || !qg.on || qg.btn == null || !qg.cards || !qg.board || qg.board.length < 3) return null;
    const key = JSON.stringify([qg.cards, qg.board, qg.smarks, qg.marks, qg.opp, qg.n, qg.btn, qg.past, qg.pot, qg.stack, qg.seenPost]);
    if (postCache.has(key)) return postCache.get(key);
    const pre = prePot(), A = pre.A, P = A.P;
    const len = qg.board.length, sno = STREET_NO(len);
    const pot0 = len === 3 ? pre.pot : qg.pot || pre.pot;
    const stack0 = Math.max(20, len === 3 ? 2000 - pre.level : qg.stack || 2000 - pre.level);
    const O = postOpps(A, pre.level);
    const order = POST_ORDER(qg.n), ord = (k) => order.indexOf(P[k]), me = ord(0);
    const sm = qg.smarks || {};
    const ks = Object.keys(sm).map(Number).filter((k) => sm[k] && k !== 0 && k < qg.n).sort((a, b) => ord(a) - ord(b));
    const before = ks.filter((k) => ord(k) < me), after = ks.filter((k) => ord(k) > me);
    const d = HANDS.describe(qg.cards, qg.board);
    const handName = d ? HANDS.shortText(d) : '';
    const inPos = O.ids.every((k) => ord(k) < me) && (O.list.length === O.ids.length || me === order.length - 1);
    let bet = 0, pot = pot0, myBet = 0;
    const acts = {}, put = {}, fracs = {};
    const read = (k) => {
      const m = sm[k];
      if (!bet) { const potB = pot; bet = m === 1 ? Math.max(20, Math.round((pot * 0.5) / 10) * 10) : Math.min(Math.round(pot / 10) * 10, stack0); acts[k] = m === 1 ? 'b' : 'B'; pot += bet; put[k] = bet; fracs[k] = bet / potB; }
      else if (m === 1) { acts[k] = 'c'; pot += bet - (put[k] || 0); put[k] = bet; }
      else { const to = Math.min(bet * 3, stack0); acts[k] = 'x'; pot += to - (put[k] || 0); put[k] = to; bet = to; }
    };
    const oppsNow = () => O.list.map((o) => {
      const a = o.seat != null ? acts[o.seat] : null;
      const cur = !a ? [] : a === 'c' ? [{ street: sno, kind: 'call' }] : [{ street: sno, kind: a === 'x' ? 'raise' : 'bet', frac: fracs[o.seat] || 0.5 }];
      const b = o.seat != null ? put[o.seat] || 0 : 0;
      return Object.assign({}, o, { acts: o.acts.concat(cur), bet: b, toCall: Math.max(0, bet - b) });
    });
    const advise = () => ODDS.postflopAdvice({ cards: qg.cards, board: qg.board, pot, toCall: Math.max(0, bet - myBet), myBet, myStack: stack0 - myBet,
      cb: bet, minRaise: bet ? bet * 2 : 20, unit: 10, inPos, handName, opps: oppsNow() }, 1200);
    const who = (k) => `Joueur ${k + 1} (${P[k]})`;
    before.forEach(read);
    const firstBettor = before.find((k) => acts[k] === 'b' || acts[k] === 'B');
    const a1 = advise();
    const lines = [{ label: bet ? before.filter((k) => acts[k] !== 'c').map((k) => `${who(k)} ${QP_VERB[acts[k]]}`).join(', ') : "Personne n'a misé avant toi", a: a1, potBefore: pot }];
    // ma décision, puis ceux qui parlent après moi
    let myBets = false;
    if (a1.action === 'bet' || a1.action === 'raise' || a1.action === 'allin') { myBets = true; const to = a1.action === 'allin' ? stack0 : a1.to; pot += to - myBet; myBet = to; bet = Math.max(bet, to); }
    else if (a1.action === 'call') { pot += bet - myBet; myBet = bet; }
    if (a1.action !== 'fold') {
      const betBefore = bet;
      after.forEach(read);
      const raisers = after.filter((k) => acts[k] === 'x' || ((acts[k] === 'b' || acts[k] === 'B') && !betBefore));
      if (raisers.length && a1.action !== 'allin') {
        const a2 = advise();
        const lbl = a1.action === 'check' ? `${who(raisers[0])} mise après ton check` : `${raisers.map(who).join(' puis ')} relance par-dessus ${a1.action === 'call' ? 'après toi' : 'ta mise'}`;
        lines.push({ label: lbl, a: a2, potBefore: pot, dec: true });
        if (a2.action === 'call') { pot += bet - myBet; myBet = bet; } else if (a2.action === 'raise' || a2.action === 'allin') { const to = a2.action === 'allin' ? stack0 : a2.to; pot += (to - myBet) + (to - bet); myBet = to; }
      }
    }
    // pour les bulles : ce que voudra dire le prochain clic sur ce joueur
    const betBeforeSeat = (k) => ks.some((j) => ord(j) < ord(k) && ord(j) < me && 'bBx'.includes(acts[j])) || (ord(k) > me && (myBets || ks.some((j) => ord(j) < me && 'bBx'.includes(acts[j])) || ks.some((j) => ord(j) > me && ord(j) < ord(k) && 'bBx'.includes(acts[j]))));
    // pour la carte suivante : ceux qui restent dans le coup ont payé la dernière mise
    let endPot = pot;
    if (a1.action !== 'fold') O.list.forEach((o) => { endPot += Math.max(0, bet - (o.seat != null ? put[o.seat] || 0 : 0)); });
    const res = { name: handName, eq: a1.eq, lines, acts, street: STREET_NAME(len), opps: O.list.length, endPot, endStack: stack0 - myBet, betBeforeSeat, folded: a1.action === 'fold' };
    if (postCache.size > 40) postCache.clear();
    postCache.set(key, res);
    return res;
  }
  // Taille d'une mise en mots (le pot est estimé : on ne donne pas de montant)
  function betWords(a, potBefore) {
    if (a.action === 'allin') return 'Tapis';
    const f = a.to / Math.max(1, potBefore);
    const opts = [[0.33, '1/3 du pot'], [0.5, 'la moitié du pot'], [0.66, '2/3 du pot'], [1, 'le pot'], [1.5, '1,5 fois le pot']];
    const best = opts.reduce((x, y) => (Math.abs(y[0] - f) < Math.abs(x[0] - f) ? y : x));
    return (a.action === 'raise' ? 'Relance' : 'Mise ') + (a.action === 'raise' ? '' : best[1]);
  }
  const POST_TXT = { check: 'Check', call: 'Suis', fold: 'Couche-toi' };
  function postBox() {
    const pl = postPlan();
    if (!pl) return '';
    const txt = (l) => POST_TXT[l.a.action] || betWords(l.a, l.potBefore);
    const cat = (a) => (a.action === 'fold' ? 'fold' : a.action === 'check' || a.action === 'call' ? 'call' : 'r3');
    const dec = pl.lines.find((l) => l.dec) || pl.lines[0];
    return `<div class="size-plan post">
      <div class="sp-head"><span class="v-hand">${esc((pl.name || '').charAt(0).toUpperCase() + (pl.name || '').slice(1))}</span><span class="muted">au ${pl.street} · tes chances ≈ ${Math.round(pl.eq * 100)} %</span></div>
      <div class="qg-opp"><span class="muted">Contre</span><div class="stepper">
        <button data-a="qg-opp" data-d="-1" aria-label="Un adversaire de moins">−</button><b>${pl.opps}</b><button data-a="qg-opp" data-d="1" aria-label="Un adversaire de plus">+</button>
      </div><span class="muted">adversaire${pl.opps > 1 ? 's' : ''} encore dans le coup</span></div>
      <ul>${pl.lines.map((l, i) => `<li class="ps-${cat(l.a)} ${l === dec ? 'main' : ''}"><span>${esc(l.label)}</span><b>${txt(l)}</b></li>`).join('')}</ul>
      ${plain(dec.a.plain, 'qgpost', 'En clair : pourquoi')}
    </div>`;
  }
  // La fenêtre des cartes pour le tableau (flop : 3 cartes, turn et river : 1) ; mes cartes d'abord si je ne les ai pas données
  function openBoardPop() {
    const mine = qg.cards && qg.cards.length === 2 && ODDS.handClass(qg.cards[0], qg.cards[1]) === qg.cls;
    if (!mine) { ui.qgPick = { kind: 'hand', need: 2, cards: [], rank: null, then: 'board' }; return; }
    ui.qgPick = { kind: 'board', need: (qg.board || []).length === 0 ? 3 : 1, cards: [], rank: null };
  }
  const pickUsed = (pk) => new Set(pk.cards.concat(pk.kind === 'board' ? (qg.cards || []).concat(qg.board || []) : []));

  // Le plan selon la taille de la relance, calé sur les tailles les plus courantes : on lit la ligne qui correspond
  const SIZE_ROWS = [[0, 3, 60], [3, 6, 100], [6, 15, 200], [15, Infinity, 2000]]; // [de, à (en BB), relance type en jetons]
  function sizePlan(cls, pos, n) {
    const open = chartAdvice(cls, pos, n, 0, 20);
    const openTxt = { raise: `Relance à ${String(Math.round((open.to / 20) * 10) / 10).replace('.', ',')} BB`, check: 'Check', fold: 'Couche-toi', allin: 'Tapis', call: 'Suis' }[open.action];
    const rows = SIZE_ROWS.map(([lo, hi, cb]) => {
      const a = chartAdvice(cls, pos, n, 1, cb);
      const txt = { raise: 'Sur-relance', allin: 'Tapis', call: 'Suis', fold: 'Couche-toi', check: 'Check' }[a.action];
      return { lo, hi, txt, cat: a.action === 'raise' || a.action === 'allin' ? 'r3' : a.action === 'call' ? 'call' : 'fold' };
    });
    // lignes voisines avec le même conseil : regroupées
    const merged = [];
    rows.forEach((r) => { const last = merged[merged.length - 1]; if (last && last.txt === r.txt) last.hi = r.hi; else merged.push(Object.assign({}, r)); });
    const first = (E.POSITIONS[n] || E.POSITIONS[6])[0] === pos; // je parle en premier : personne n'a pu relancer avant moi
    const label = (r) => (r.lo === 0 && r.hi === Infinity ? 'Quelle que soit la relance' : r.lo === 0 ? `Relance jusqu'à ${r.hi} BB` : r.hi === Infinity ? `Relance de plus de ${r.lo} BB, ou tapis` : `Relance de ${r.lo} à ${r.hi} BB`);
    const sit = qg && qg.on ? quickSituation(cls) : null;
    if (sit) {
      const { head, lines } = situationLines(cls, pos, n, sit);
      return `<div class="size-plan sit">
      <div class="sp-head"><span class="v-hand">${cls.replace(/[so]$/, (m) => `<small>${m}</small>`)}</span><span class="muted">en ${pos} · ${esc(head)}</span></div>
      <ul>${lines.map((l, i) => `<li class="ps-${catOf(l.a)} ${i === 0 ? 'main' : ''}"><span>${esc(l.label)}</span><b>${l.again && l.a.action === 'raise' ? 'Relance encore' : l.open && l.a.action === 'raise' ? `Relance à ${String(Math.round((l.a.to / 20) * 10) / 10).replace('.', ',')} BB` : ACT_TXT[l.a.action]}</b></li>`).join('')}</ul>
      ${plain(decisive({ lines }).a.plain, 'qgsit', 'En clair : pourquoi')}
    </div>`;
    }
    return `<div class="size-plan">
      <div class="sp-head"><span class="v-hand">${cls.replace(/[so]$/, (m) => `<small>${m}</small>`)}</span><span class="muted">en ${pos} · ${first ? 'tu parles en premier, personne ne peut relancer avant toi' : "lis la ligne qui correspond à ce qui s'est passé avant toi"}</span></div>
      <ul>
        <li class="ps-${open.action === 'raise' ? 'raise' : open.action === 'fold' ? 'fold' : 'call'}"><span>Personne n'a relancé</span><b>${openTxt}</b></li>
        ${first ? '' : merged.map((r) => `<li class="ps-${r.cat}"><span>${label(r)}</span><b>${r.txt}</b></li>`).join('')}
      </ul>
    </div>`;
  }

  function viewCharts() {
    const h = state && state.hand;
    const quick = !!(qg && qg.on);
    let n, myPos, myClass;
    if (quick) {
      n = qg.n;
      myPos = qg.btn == null ? null : seatPositions(n, qg.btn)[0];
      myClass = qg.cls || null;
    } else {
      n = h ? h.order.length : state ? state.players.filter(E.isActive).length : 6;
      myPos = h && h.meIn ? h.pos[h.meId] : null;
      myClass = h && h.cards.length === 2 ? ODDS.handClass(h.cards[0], h.cards[1]) : ui.chartHand || null;
    }
    const views = [['UTG', 'UTG'], ['MP', 'MP'], ['CO', 'CO'], ['BTN', 'BTN'], ['SB', 'SB'], ['BB', 'BB (défense)'], ['vs', 'Face à une relance']];
    const sit = quick && myPos ? quickSituation() : null;
    let v = sit ? 'vs' : ui.chart;
    if (!v) {
      const k = myPos ? (myPos === 'BB' ? 'BB' : ODDS.openRangeKey(myPos, n)) : 'CO';
      v = k === 'UTG9' ? 'UTG' : k || 'CO';
    }
    const R = ODDS.RANGES;
    // place pour « Face à une relance » : la mienne si je la connais, sinon la dernière place choisie
    const vsPos = myPos && myPos !== 'BB' ? myPos : ui.chartPos && ui.chartPos !== 'BB' ? ui.chartPos : 'CO';
    const vsCat = (pos) => (c) => {
      const a = chartAdvice(c, pos, n, 1, 60);
      return a.action === 'raise' || a.action === 'allin' ? 'r3' : a.action === 'call' ? 'call' : 'fold';
    };
    let cat, legend, text;
    if (v === 'BB') {
      cat = vsCat('BB');
      legend = [['r3', 'Sur-relance'], ['call', 'Suis'], ['fold', 'Couche-toi']];
      text = "En grosse blinde, face à une relance normale (jusqu'à 3 grosses blindes) : tu as déjà misé, donc tu peux payer avec beaucoup de mains. Si personne n'a relancé : check (ou relance avec TT+, AQs+, AKo). Relance plus grosse : touche ta main pour voir le plan selon la taille.";
    } else if (v === 'vs') {
      cat = vsCat(vsPos);
      legend = [['r3', 'Sur-relance'], ['call', 'Suis'], ['fold', 'Couche-toi']];
      text = `Face à une relance normale (jusqu'à 3 grosses blindes), ${vsPos === myPos ? 'à ta place' : 'en'} ${vsPos}. Relance plus grosse : touche ta main pour voir le plan selon la taille. Face à deux relances : relance encore avec AA et KK, suis avec QQ et AK, couche le reste.`;
    } else {
      const key = v === 'UTG' && n >= 8 ? 'UTG9' : v;
      const range = R.open[key];
      cat = (c) => (range.has(c) ? 'raise' : 'fold');
      legend = [['raise', 'Relance'], ['fold', 'Couche-toi']];
      text = `Personne n'a relancé avant toi : relance (${String(v === 'CO' || v === 'BTN' ? ODDS.TUNE.openLate : ODDS.TUNE.openEarly).replace('.', ',')} grosses blindes, plus 1 par joueur qui a seulement suivi) avec les mains en vert, couche-toi avec les autres. Soit ${ODDS.pct(range)} % des mains${key === 'UTG9' ? ' (tableau plus serré à 8 joueurs et plus)' : ''}.`;
    }
    if (sit) {
      // les couleurs suivent ce qui s'est passé à la table (le joueur touché, sa place, la taille de sa relance)
      cat = (c) => { const sc = quickSituation(c); return catOf(decisive(situationLines(c, myPos, n, sc || sit)).a); };
      legend = [['r3', 'Sur-relance'], ['call', 'Suis'], ['fold', 'Couche-toi']];
      const big = sit.before.length === 1 && sit.acts[sit.before[0]] === 'R';
      text = `Les couleurs suivent ce que tu as touché sur la table${big ? ' (ici, pour une relance de 3 à 6 BB : touche ta main pour les autres tailles)' : ''}. Retouche le joueur pour changer, ou passe à la main suivante.`;
    }
    const grid = ODDS.grid().map((row) => row.map((c) => `<span class="hc ${cat(c)} ${c === myClass ? 'mine' : ''}" data-a="chart-hand" data-c="${c}">${c.replace(/[so]$/, (m) => `<small>${m}</small>`)}</span>`).join('')).join('');
    const resume = !quick && qgHist.length ? `<button class="btn ghost wide qg-resume" data-a="qg-undo">↶ Reprendre la partie rapide arrêtée</button>` : '';
    const top = quick ? quickTable() : resume + `<button class="btn quick-btn wide" data-a="qg-start">🎯 Partie rapide</button>`;
    const chart = `<section class="panel">
      <h2>Mains de départ</h2>
      ${quick ? '' : '<p class="hint">Quoi faire avant le flop, selon ta place. Apprends-les petit à petit : c\'est ce qui fait le plus progresser un débutant.</p>'}
      <div class="chart-tabs">${views.map(([k, l]) => `<button class="chip tipped ${v === k ? 'on' : ''} ${myPos && (k === myPos || (k === 'UTG' && myPos.startsWith('UTG')) || (k === 'MP' && myPos.startsWith('MP'))) ? 'here' : ''}" data-a="chart" data-v="${k}" data-tip="${k === 'vs' ? 'vsraise' : 'pos:' + k}">${l}</button>`).join('')}</div>
      ${myClass ? sizePlan(myClass, quick && myPos ? myPos : v === 'vs' ? vsPos : v, n) : quick && myPos ? '<p class="v-empty">Touche ta main dans le tableau.</p>' : ''}
      <div class="hc-grid">${grid}</div>
      <div class="hc-legend">${legend.map(([c, l]) => `<span><i class="hc ${c}"></i>${l}</span>`).join('')}${myClass ? `<span><i class="hc mine"></i>Ta main (${myClass})</span>` : ''}</div>
      <p class="hint">${text}</p>
      <p class="hint">Lecture : « s » = cartes de la même couleur (assorties), « o » = couleurs différentes. Au-dessus de la diagonale, les mains assorties ; en dessous, les autres ; sur la diagonale, les paires.</p>
    </section>`;
    // même disposition avec ou sans partie rapide : le tableau à gauche, la table (ou les boutons pour la lancer) au milieu
    return `<div class="charts-play"><div class="cp-a">${quick ? top : `<div class="qg-start-zone">${top}</div>`}</div><div class="cp-b">${chart}</div></div>${quick ? cardPop() : ''}`;
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
    if (autoPage()) return viewSideAuto();
    const h = state && state.hand;
    const cur = h && h.cards.length === 2 ? HANDS.describe(h.cards, h.board) : null;
    // page Apprendre : pas de « Ta main » (rien à y afficher)
    const showHand = curPage() !== 'learn';
    let out = `<div class="side-a">${showHand ? `<section class="side-box"><h3>Ta main ${tip('hand')}</h3>` : ''}`;
    if (!showHand) { /* rien */ } else if (cur) {
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
    if (showHand) out += '</section>';

    out += `<section class="side-box"><h3>Combinaisons <small>de la plus forte à la plus faible</small></h3><ol class="combos">`;
    out += HANDS.CATEGORIES.slice().reverse().map((c) => `<li class="${cur && cur.best.cat === c.id ? 'on' : ''}">
        <div class="cb-top"><b>${c.name}</b><span>${c.ex.map((x) => cardHtml(x, 'xs')).join('')}</span></div>
        <small>${c.desc}</small>
      </li>`).join('');
    out += '</ol></section></div>';

    // onglet Mains : pas de raccourcis (la place va à la table et au tableau)
    if (curPage() !== 'charts') out += `<div class="side-b"><section class="side-box keys">
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
      ui.tab = 'main';
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
      s.paused = (s.paused || []).filter((i) => i < s.n);
      if (s.me >= s.n) s.me = 0;
      if (s.btn >= s.n) s.btn = 0;
      render();
    },
    'setup-me'(d) { ui.setup.me = Number(d.i); render(); },
    'quick-open'() { ui.quickOpen = true; render(); },
    'quick-close'() { ui.quickOpen = false; render(); },
    'copy-table-prompt'() { copy(E.buildTablePrompt(), 'Prompt copié : colle-le dans Claude avec ta capture'); },

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
      (s.paused || []).filter((i) => i < s.n && i !== s.me).forEach((i) => E.togglePause(state, state.players[i].id));
      ui.quickOpen = false; ui.quickResult = null; ui.tablePaste = '';
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
    'skip-hand'() {
      let warn = null;
      const r = cmd((s) => {
        const r1 = E.skipHand(s);
        if (!r1.ok) return r1;
        const r2 = startHand(s);
        if (!r2.ok) warn = r2.err;
        return { ok: true };
      });
      if (r && r.ok) toast(warn || 'Main passée : le jeton D avance. Les jetons ont pu changer sur le site : touche un joueur pour les corriger. (Ctrl+Z pour annuler)');
    },
    'next-only'() { cmd((s) => { recordHand(s); return E.endHand(s); }); },
    'end-only'() {
      cmd((s) => { recordHand(s); return E.endHand(s); });
      toast('Touche un joueur pour le modifier, ou « + Un joueur arrive »');
    },
    abort() {
      if (!window.confirm('Effacer la saisie de cette main ? Les jetons et le jeton D reviennent à leur état d\'avant la main. (Pour te coucher, utilise plutôt « Couché ».)')) return;
      cmd((s) => E.abortHand(s));
    },
    'copy-msg'() { copy(E.buildMessage(state), 'Message copié'); },
    'share-msg'() { share(E.buildMessage(state)); },
    chart(d) {
      ui.chart = d.v;
      if (d.v !== 'vs') ui.chartPos = d.v;
      render();
      // téléphone (pas de survol) : la bulle de la place touchée s'ouvre, jusqu'au prochain toucher
      if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
        const el = document.querySelector(`[data-a="chart"][data-v="${d.v}"]`);
        if (el) showTip(el, true);
      }
    },
    'qg-start'() {
      qgHist = []; // nouvelle partie rapide : on repart de zéro
      qg = { on: true, n: state ? Math.max(2, state.players.filter(E.isActive).length) : 6, btn: null, cls: null, marks: {}, st: {} };
      ui.chart = null; saveQg(); render(); window.scrollTo(0, 0);
    },
    'qg-stop'() {
      qgPush('arrêt de la partie rapide');
      qg = null; ui.chart = null; ui.qgPick = null; saveQg(); render();
      toast('Partie rapide arrêtée · « Reprendre » ou Ctrl+Z pour revenir en arrière');
    },
    // Annuler le dernier geste de la partie rapide (même l'arrêt)
    'qg-undo'() {
      const last = qgHist.pop();
      if (!last) { toast('Rien à annuler'); return; }
      qg = JSON.parse(last.s); ui.qgPick = null; ui.chart = null; saveQg(); render();
      toast('Annulé : ' + last.label);
    },
    'qg-n'(d) {
      const nn = Math.max(2, Math.min(E.MAX_PLAYERS, qg.n + Number(d.d)));
      if (nn === qg.n) return;
      qgPush('nombre de joueurs');
      qg.n = nn;
      if (qg.btn != null && qg.btn >= qg.n) qg.btn = null;
      qg.marks = {}; qg.st = {}; // autres joueurs : on repart de zéro
      ui.chart = null; saveQg(); render();
    },
    // Partie rapide : clic sur un joueur = il a relancé (2e clic : gros ou tapis, 3e : annuler) ; clic droit / appui long = jeton D
    'qg-btn'(d) {
      const i = Number(d.i);
      if (qgLongOf === qgPress) { qgLongOf = -1; return; } // c'est le relâchement de l'appui long : déjà traité
      if (qg.btn == null) { qgSetBtn(i, false, 'jeton D placé'); openCardPop(); render(); return; }
      if (i === 0) { openCardPop(); render(); return; } // clic sur moi : saisir ou changer mes cartes
      if ((qg.board || []).length >= 3) {
        qgPush(`clic sur Joueur ${i + 1} (${STREET_NAME(qg.board.length)})`);
        qg.smarks = qg.smarks || {};
        const m2 = ((qg.smarks[i] || 0) + 1) % 3;
        if (m2) qg.smarks[i] = m2; else delete qg.smarks[i];
        saveQg(); render();
        return;
      }
      qgPush(`clic sur Joueur ${i + 1}`);
      qg.marks = qg.marks || {};
      const m = ((qg.marks[i] || 0) + 1) % 3;
      if (m) qg.marks[i] = m; else delete qg.marks[i];
      saveQg(); render();
    },
    'qg-next'() {
      if (!qg || qg.btn == null) return;
      qgPush('main suivante');
      // je suivais la main (ma main touchée) : les joueurs qui parlaient avant moi et que je n'ai pas touchés n'ont pas relancé
      if (qg.cls) {
        const P = seatPositions(qg.n, qg.btn), order = E.POSITIONS[qg.n], me = order.indexOf(P[0]), QA0 = qgActs();
        qg.st = qg.st || {};
        for (let k = 1; k < qg.n; k++) {
          if (order.indexOf(P[k]) >= me) continue;
          const t = qg.st[k] || (qg.st[k] = { c: 0, r: 0 });
          t.c++;
          if ('rRx'.includes(QA0.acts[k] || '-')) t.r++;
        }
      }
      qg.marks = {};
      qg.btn = (qg.btn + 1) % qg.n; // le jeton D passe au joueur suivant (sens des aiguilles d'une montre)
      qg.cls = null; qg.cards = null; ui.chart = null;
      qg.board = []; qg.smarks = {}; qg.past = []; qg.pot = null; qg.stack = null; qg.opp = null; qg.seenPost = []; // le tableau s'efface
      saveQg();
      openCardPop(); render(); // la fenêtre dit déjà « tu es … »
    },
    'qp-rank'(d) { if (ui.qgPick) { ui.qgPick.rank = d.r; render(); } },
    'qp-suit'(d) {
      const pk = ui.qgPick;
      if (!pk || !pk.rank) return;
      const c = pk.rank + d.s;
      if (pickUsed(pk).has(c)) return;
      pk.cards.push(c); pk.rank = null;
      if (pk.kind === 'board' && pk.cards.length === pk.need) {
        // nouvelle carte du tableau : le tour précédent est rangé (pot estimé, qui a misé), les clics repartent de zéro
        qgPush((qg.board || []).length ? 'la ' + (qg.board.length === 3 ? 'turn' : 'river') : 'le flop');
        const pl = (qg.board || []).length >= 3 ? postPlan() : null;
        if (pl) {
          qg.past = (qg.past || []).concat([{ street: STREET_NO(qg.board.length), acts: Object.fromEntries(Object.entries(pl.acts).filter(([k]) => k !== '0')) }]);
          qg.pot = pl.endPot; qg.stack = pl.endStack;
          qg.seenPost = [...new Set((qg.seenPost || []).concat(Object.keys(qg.smarks || {}).map(Number)))];
        }
        qg.board = (qg.board || []).concat(pk.cards); qg.smarks = {};
        ui.qgPick = null; saveQg(); render();
        if (!wide()) { const el = document.querySelector('.size-plan.post'); if (el) el.scrollIntoView({ block: 'center' }); }
        return;
      }
      if (pk.kind !== 'board' && pk.cards.length === 2) {
        qgPush('tes cartes');
        qg.cards = pk.cards.slice(); qg.cls = ODDS.handClass(qg.cards[0], qg.cards[1]);
        const then = pk.then;
        ui.qgPick = null;
        if (then === 'board') openBoardPop();
        saveQg(); render();
        if (then === 'board') return;
        // sur téléphone : on montre directement le conseil
        if (!wide()) { const el = document.querySelector('.size-plan'); if (el) el.scrollIntoView({ block: 'center' }); }
        return;
      }
      render();
    },
    'qg-board'() { if (!qg || qg.btn == null || (qg.board || []).length >= 5) return; openBoardPop(); render(); },
    'qg-opp'(d) {
      const pl = postPlan();
      const cur = qg.opp != null ? qg.opp : pl ? pl.opps : 1;
      const nn = Math.max(1, Math.min(qg.n - 1, cur + Number(d.d)));
      if (nn === cur) return;
      qgPush("nombre d'adversaires");
      qg.opp = nn; saveQg(); render();
    },
    'qp-back'() { const pk = ui.qgPick; if (!pk) return; if (pk.rank) pk.rank = null; else pk.cards.pop(); render(); },
    'qp-close'() { ui.qgPick = null; render(); },
    'chart-hand'(d) {
      if (qg && qg.on) { qgPush('ta main'); qg.cls = qg.cls === d.c ? null : d.c; qg.cards = null; saveQg(); }
      else ui.chartHand = ui.chartHand === d.c ? null : d.c;
      render();
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
      ui.addOpen = false; ui.edit = null;
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
      if (r && r.ok && ui.edit === d.id) { ui.edit = null; render(); }
      if (r && r.ok) toast(r.later ? `${p.name} part : couché quand c'est à lui, retiré à la fin de la main (Ctrl+Z pour annuler)` : `${p.name} a quitté la table (Ctrl+Z pour annuler)`);
    },
    // table
    edit(d) {
      ui.edit = ui.edit === d.id ? null : d.id;
      ui.addAfter = null; ui.addOpen = false;
      render();
      showEditor();
      const el = $('ed-stack');
      if (el && !el.disabled) { el.focus({ preventScroll: true }); el.select(); } else if ($('ed-name')) $('ed-name').focus({ preventScroll: true });
    },
    'ed-close'() { ui.edit = null; render(); },
    'add-open'() { ui.addOpen = true; ui.edit = null; ui.addAfter = null; render(); showEditor(); const el = $('add-name'); if (el) el.focus({ preventScroll: true }); },
    'add-close'() { ui.addOpen = false; render(); },
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
      if (r && r.ok) { ui.addOpen = false; render(); toast(state.hand ? 'Joueur ajouté : il jouera à la main suivante' : 'Joueur ajouté : il jouera dès la prochaine main'); }
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
  // En haut et dans la barre des onglets, la bulle attend un court instant : pas de bulle en passant juste la souris dessus.
  let tipTimer = null;
  document.addEventListener('mouseover', (ev) => {
    const q = ev.target.closest && ev.target.closest(TIP_SEL);
    clearTimeout(tipTimer);
    if (!q || bubble.pinned) return;
    if (q.closest('.nav, .top-right')) tipTimer = setTimeout(() => { if (q.matches(':hover') && !bubble.pinned) showTip(q, false); }, 350);
    else showTip(q, false);
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

  // Partie rapide : le jeton D se place au clic droit (ordinateur) ou à l'appui long (téléphone)
  let qgPress = 0, qgLongOf = -1, qgTimer = null; // qgPress : moment du dernier appui ; qgLongOf : l'appui qui a placé le jeton D
  function qgSetBtn(i, moved, label) {
    if (!qg || !qg.on) return;
    qgPush(label || 'jeton D déplacé');
    qg.btn = i; qg.marks = {}; ui.chart = null; saveQg(); render();
    if (moved) toast(`Jeton D chez ${i === 0 ? 'toi' : 'Joueur ' + (i + 1)} : tu es ${seatPositions(qg.n, i)[0]}`);
  }
  function qgLongPress(i) {
    if (qgLongOf === qgPress) return; // déjà fait pour cet appui (le téléphone envoie parfois aussi un clic droit)
    qgLongOf = qgPress;
    qgSetBtn(i, true);
    if (navigator.vibrate) navigator.vibrate(25);
  }
  document.addEventListener('contextmenu', (ev) => {
    const el = ev.target.closest('.qg-pt [data-a="qg-btn"]');
    if (!el || !qg || !qg.on) return;
    ev.preventDefault();
    if (touchUI()) qgLongPress(Number(el.dataset.i));
    else qgSetBtn(Number(el.dataset.i), true);
  });
  document.addEventListener('pointerdown', (ev) => {
    qgPress = Date.now();
    if (ev.pointerType === 'mouse') return;
    const el = ev.target.closest('.qg-pt [data-a="qg-btn"]');
    if (!el || !qg || !qg.on) return;
    clearTimeout(qgTimer);
    qgTimer = setTimeout(() => qgLongPress(Number(el.dataset.i)), 550);
  });
  ['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => clearTimeout(qgTimer)));

  document.addEventListener('click', (ev) => {
    let q = ev.target.closest(TIP_SEL);
    // dans un bouton : le bouton d'abord ; sauf dans la ligne d'un joueur, où la position (UTG…) montre sa bulle
    // et le reste de la ligne ouvre les options du joueur
    if (q && q.classList.contains('tipped') && q.closest('[data-a]') && q.closest('[data-a]').dataset.a !== 'edit') q = null;
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
    else if (t.id === 'table-paste') {
      const before = JSON.stringify(ui.quickResult);
      applyTableLine(t.value);
      if (JSON.stringify(ui.quickResult) !== before) {
        render();
        const el = $('table-paste');
        if (el && !(ui.quickResult && ui.quickResult.ok)) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
    }
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
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k.toLowerCase() === 'z' && !inField && curPage() === 'charts' && !TOUR_ON()) {
      ev.preventDefault();
      return handlers['qg-undo']();
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k.toLowerCase() === 'z' && !inField && ['main', 'prompt', 'settings'].includes(curPage()) && !autoPage()) {
      ev.preventDefault();
      return handlers.undo();
    }
    if (inField) {
      if (k === 'Enter') {
        if (t.id === 'amt') { ev.preventDefault(); handlers.act({ t: 'r' }); }
        else if (t.id === 'add-name' || t.id === 'add-stack') { ev.preventDefault(); handlers.add(); }
        else if ((t.id === 'ed-name' || t.id === 'ed-stack') && ui.edit) { ev.preventDefault(); handlers['ed-save']({ id: ui.edit }); }
        else if (t.id === 'sa-name' || t.id === 'sa-stack') { ev.preventDefault(); handlers['seat-add-ok'](); }
        else if (t.dataset.show) { ev.preventDefault(); handlers['show-cards']({ id: t.dataset.show, value: t.value }); }
      } else if (k === 'Escape' && t.id === 'amt') { ui.sizing = false; render(); }
      else if (k === 'Escape' && (t.id === 'sa-name' || t.id === 'sa-stack')) handlers['seat-add-cancel']();
      else if (k === 'Escape' && (t.id === 'ed-name' || t.id === 'ed-stack')) handlers['ed-close']();
      else if (k === 'Escape' && (t.id === 'add-name' || t.id === 'add-stack')) handlers['add-close']();
      return;
    }
    if (autoPage()) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return; // le bouton s'en charge
      if (k === ' ' || k.toLowerCase() === 'c') { ev.preventDefault(); shoot(); }
      else if (k === 'Escape' && ui.cropping) { ui.cropping = false; render(); }
      return;
    }
    if (curPage() === 'charts' && qg && qg.on && qg.btn != null && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (ui.qgPick) {
        const key = k.toLowerCase(), pk = ui.qgPick;
        const run = (fn) => { ev.preventDefault(); fn(); };
        if (k === 'Escape') return run(handlers['qp-close']);
        if (k === 'Backspace') return run(handlers['qp-back']);
        if (!pk.rank && RANK_KEYS[key]) return run(() => handlers['qp-rank']({ r: RANK_KEYS[key] }));
        const sk = pk.rank && (SUIT_KEYS[key] || { 1: 'p', 2: 'c', 3: 'k', 4: 't' }[key]);
        if (sk) return run(() => (pickUsed(pk).has(pk.rank + sk) ? toast('Cette carte est déjà prise.') : handlers['qp-suit']({ s: sk })));
        if (k === 'Enter' || k === ' ') ev.preventDefault(); // pas de main suivante tant que la fenêtre est ouverte
        return;
      }
      if ((k === 'Enter' || k === ' ') && t.tagName !== 'BUTTON') { ev.preventDefault(); handlers['qg-next'](); }
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !state || ui.tab !== 'main') return;
    if (t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return; // le bouton s'en charge
    const h = state.hand;
    const key = k.toLowerCase();
    const run = (fn) => { ev.preventDefault(); fn(); };
    if (k === 'Escape' && (ui.edit || ui.addOpen)) return run(() => { ui.edit = null; ui.addOpen = false; render(); });

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

  /* ------------------------------------------------------------ petit tuto de la page Mains (le « ? » en haut) */
  // Ne se lance jamais tout seul. Il montre une partie d'exemple, puis remet tout comme avant (rien n'est enregistré).
  const TOUR = (() => {
    const L = (txt) => txt; // textes en clair
    const ex = { on: true, n: 6, btn: 1, cls: null, cards: null, marks: {}, st: {}, board: [], smarks: {}, past: [] }; // D chez Joueur 2 : moi en CO
    const steps = [
      { sel: '.qg-n', title: 'Le nombre de joueurs', set: {},
        text: L("Pour commencer : bouton « Partie rapide » en haut de cette page. Ensuite, règle le nombre de joueurs autour de la table avec − et +. Toi, tu es toujours en bas. En haut à droite : ↶ annule ton dernier geste (Ctrl+Z), la croix rouge arrête la partie rapide.") },
      { sel: '.qg-pt .seat.is-btn', title: 'Le jeton D', set: {},
        text: L(`Au début, touche le joueur qui a le jeton D. Pour le déplacer ensuite : ${touchUI() ? 'appui long' : 'clic droit'} sur le joueur.`) },
      { sel: '.qg-you', title: 'Ta place', set: {},
        text: L("L'appli en déduit ta place (ici CO) et règle le tableau des mains de départ dessus. Survole les places (UTG, BTN…) pour savoir ce qu'elles veulent dire.") },
      { sel: '.qp', title: 'Tes cartes', set: { pick: { cards: ['Ap'], rank: 'J' } },
        text: L("À chaque main, cette fenêtre s'ouvre au milieu de l'écran. Touche la valeur puis la couleur de ta 1re carte, puis pareil pour la 2e. Au clavier : 9 puis P = 9♠ (T = 10). « Passer » ou Échap si tu ne veux pas. Pour les saisir ou les changer à tout moment : clic sur toi, en bas de la table.") },
      { sel: '.size-plan', title: 'Le conseil', set: { cls: 'AJs', cards: ['Ap', 'Jp'] },
        text: L("Ta main est encadrée dans le tableau et le plan s'affiche : quoi faire si personne n'a relancé, et selon la taille de la relance. Tu lis la ligne qui correspond.") },
      { sel: '.qg-pt .seat[data-i="4"]', title: 'Quelqu\'un relance', set: { cls: 'AJs', cards: ['Ap', 'Jp'], marks: { 4: 1 } },
        text: L(`Clic${touchUI() ? '' : ' gauche'} sur le joueur qui relance : 1 fois = relance normale, 2 fois = grosse relance ou tapis, 3 fois = annuler.`) },
      { sel: '.qg-pt .seat[data-i="5"]', title: 'Après une relance', set: { cls: 'AJs', cards: ['Ap', 'Jp'], marks: { 4: 1, 5: 1 } },
        text: L(`Pour ceux qui parlent après une relance (la tienne comprise) : clic${touchUI() ? '' : ' gauche'} 1 fois = il suit, 2 fois = il relance la relance, 3 fois = annuler. Passe la souris sur un joueur : la bulle dit ce que fera ton prochain clic.`) },
      { sel: '.size-plan', title: 'Le conseil s\'adapte', set: { cls: 'AJs', cards: ['Ap', 'Jp'], marks: { 4: 1, 5: 1 } },
        text: L("Il suit ce que tu as touché : qui a relancé, depuis quelle place, et combien de joueurs ont suivi. Le tableau se colore pour cette situation. « En clair » explique pourquoi.") },
      { sel: '.qg-pt .seat[data-i="4"]', title: 'La mémoire', set: { cls: 'AJs', cards: ['Ap', 'Jp'], st: { 4: { c: 12, r: 6 } } },
        text: L("Au fil des mains, l'appli retient qui relance souvent quand il parle avant toi : « relance souvent » ou « relance peu » s'affiche sous son nom, et le conseil en tient compte. Pense à toucher tous ceux qui relancent.") },
      { sel: '.pt-center [data-a="qg-board"]', title: 'Le flop (facultatif)', set: { cls: 'AJs', cards: ['Ap', 'Jp'] },
        text: L("Si tu as le temps : « Flop » ouvre la même fenêtre pour les 3 cartes du milieu, puis « Turn » et « River ». L'appli te dit alors check, mise, suis ou couche-toi ; touche un joueur qui mise (1 fois = mise, 2 fois = grosse mise). Pas le temps ? Ignore-le : rien n'est bloqué.") },
      { sel: '[data-a="qg-next"]', title: 'Main suivante', set: { cls: 'AJs', cards: ['Ap', 'Jp'] },
        text: L("Quand la main est finie : Entrée ou ce bouton. Le jeton D avance, ta place suit, et la fenêtre des cartes revient. Ce rappel se relance avec le « ? » en haut.") },
    ];
    let i = -1, saved = null, root = null;
    const on = () => i >= 0;
    function apply(st) {
      qg = Object.assign({}, ex, { marks: Object.assign({}, st.marks || {}), st: Object.assign({}, st.st || {}), cls: st.cls || null, cards: st.cards || null });
      ui.qgPick = st.pick ? { cards: st.pick.cards.slice(), rank: st.pick.rank } : null;
      ui.chart = null;
      render(); // sans saveQg : la partie d'exemple n'est jamais enregistrée
    }
    function place() {
      if (!on() || !root) return;
      const el = document.querySelector(steps[i].sel);
      const spot = root.querySelector('.t-spot'), bub = root.querySelector('.t-bub');
      const vw = window.innerWidth, vh = window.innerHeight, m = 12;
      if (!el) { spot.style.display = 'none'; bub.style.left = (vw - bub.offsetWidth) / 2 + 'px'; bub.style.top = (vh - bub.offsetHeight) / 2 + 'px'; return; }
      // le cadre englobe aussi l'étiquette sous le joueur (« Relance », « Suit »…)
      const rs = [el, ...el.querySelectorAll('.seat-act')].map((x) => x.getBoundingClientRect());
      const r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      r.width = r.right - r.left; r.height = r.bottom - r.top;
      const pad = 6;
      Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const bw = bub.offsetWidth, bh = bub.offsetHeight;
      let top, left = Math.min(Math.max(m, r.left + r.width / 2 - bw / 2), vw - bw - m);
      if (r.bottom + pad + m + bh < vh) top = r.bottom + pad + m;
      else if (r.top - pad - m - bh > 0) top = r.top - pad - m - bh;
      else if (r.right + pad + m + bw < vw) { left = r.right + pad + m; top = Math.min(Math.max(m, r.top), vh - bh - m); }
      else if (r.left - pad - m - bw > 0) { left = r.left - pad - m - bw; top = Math.min(Math.max(m, r.top), vh - bh - m); }
      else top = vh - bh - m;
      bub.style.left = left + 'px'; bub.style.top = top + 'px';
    }
    function show(k) {
      i = Math.max(0, Math.min(steps.length - 1, k));
      apply(steps[i].set);
      const st = steps[i];
      root.querySelector('.t-bub').innerHTML = `
        <div class="t-head"><span class="t-n">${i + 1} / ${steps.length}</span><b>${esc(st.title)}</b>
          <button class="t-x" data-t="end" aria-label="Fermer le tuto">×</button></div>
        <p>${esc(st.text)}</p>
        <div class="t-foot">${i ? '<button class="btn ghost" data-t="prev">← Précédent</button>' : '<span class="hint pc-only">Échap pour quitter</span>'}
          <button class="btn primary" data-t="${i === steps.length - 1 ? 'end' : 'next'}">${i === steps.length - 1 ? 'Terminé' : 'Suivant →'}</button></div>`;
      const el = document.querySelector(st.sel);
      if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      place(); // tout de suite, puis encore une fois après le défilement
      requestAnimationFrame(() => requestAnimationFrame(place));
    }
    function start() {
      if (on()) return;
      saved = { qg: qg ? JSON.parse(JSON.stringify(qg)) : null, pick: ui.qgPick || null, chart: ui.chart, y: window.scrollY };
      tourActive = true;
      hideTip();
      root = document.createElement('div');
      root.id = 'tour';
      root.innerHTML = '<div class="t-block"></div><div class="t-spot"></div><div class="t-bub" role="dialog" aria-label="Petit tuto"></div>';
      root.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-t]');
        ev.stopPropagation();
        if (!b) return;
        if (b.dataset.t === 'next') show(i + 1); else if (b.dataset.t === 'prev') show(i - 1); else end();
      });
      document.body.appendChild(root);
      show(0);
    }
    function end() {
      if (!on()) return;
      i = -1; tourActive = false;
      if (root) root.remove();
      root = null;
      qg = saved.qg; ui.qgPick = saved.pick; ui.chart = saved.chart;
      render();
      window.scrollTo(0, saved.y);
    }
    // le clavier pendant le tuto : Échap = quitter, flèches / Entrée = étape suivante ou précédente
    window.addEventListener('keydown', (ev) => {
      if (!on()) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.key === 'Escape') end();
      else if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === ' ') (i === steps.length - 1 ? end() : show(i + 1));
      else if (ev.key === 'ArrowLeft' || ev.key === 'Backspace') show(i - 1);
    }, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return { start, end, on };
  })();
  $('tour-btn').addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); TOUR.start(); });

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

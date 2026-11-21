/*
 * Poker → Claude : les notions du poker expliquées simplement (onglet « Apprendre »).
 * Chaque notion : id (unique, sert à retenir celles que tu connais), t = le mot, a = autres noms / abréviation,
 * d = l'explication, ex = un exemple (facultatif), cards = cartes à dessiner (facultatif, format de l'appli : 'Ac' = A♥).
 */
(function (root) {
  'use strict';

  const SECTIONS = [
    {
      id: 'deroule', title: "Le déroulement d'une main",
      intro: "Une main, c'est un coup : du moment où chacun reçoit ses 2 cartes jusqu'à ce que quelqu'un remporte les jetons.",
      items: [
        { id: 'blindes', t: 'Blindes', a: 'SB, BB', d: "Mises obligatoires posées avant de voir ses cartes par les deux joueurs à gauche du jeton D : la petite blinde (SB) et la grosse blinde (BB), en général le double. Elles garantissent qu'il y a toujours quelque chose à gagner.", ex: 'Blindes 10/20 : la petite blinde pose 10, la grosse blinde 20.' },
        { id: 'ante', t: 'Ante', d: "Petite mise obligatoire en plus des blindes, posée avant la distribution. Surtout en tournoi, quand les blindes ont monté. Soit chaque joueur la paie, soit la grosse blinde la paie pour toute la table (« ante BB »)." },
        { id: 'preflop', t: 'Préflop', d: "Le premier tour d'enchères, quand chacun n'a que ses 2 cartes, avant que les cartes communes soient retournées." },
        { id: 'flop', t: 'Flop', d: "Les 3 premières cartes communes, retournées ensemble au milieu de la table. Suivi d'un tour d'enchères.", cards: ['Kc', '7t', '2k'] },
        { id: 'turn', t: 'Turn', d: 'La 4e carte commune, suivie d\'un tour d\'enchères.' },
        { id: 'river', t: 'River', d: "La 5e et dernière carte commune, suivie du dernier tour d'enchères." },
        { id: 'board', t: 'Tableau', a: 'board', d: "Les cartes communes au milieu de la table, que tout le monde utilise. Ta main, c'est la meilleure combinaison de 5 cartes parmi tes 2 cartes et les 5 du tableau (tu peux utiliser 2, 1 ou même 0 de tes cartes)." },
        { id: 'tour', t: "Tour d'enchères", d: "Chacun parle à son tour : check, mise, suit, relance ou se couche. Le tour se termine quand tous les joueurs encore en jeu ont mis la même somme." },
        { id: 'pot', t: 'Pot', d: 'Tous les jetons misés pendant la main. Le gagnant le remporte.' },
        { id: 'abattage', t: 'Abattage', a: 'showdown', d: "Après la river, s'il reste au moins deux joueurs, ils montrent leurs cartes : la meilleure combinaison gagne le pot. Si tout le monde se couche avant, le dernier joueur gagne sans montrer ses cartes." },
        { id: 'partage', t: 'Partage', a: 'split', d: 'Quand deux joueurs ont exactement la même combinaison (kicker compris), ils se partagent le pot.' },
      ],
    },
    {
      id: 'places', title: 'Les places autour de la table',
      intro: "Ta place change à chaque main, car le jeton D avance d'un joueur. Elle compte énormément : parler après les autres est un gros avantage.",
      items: [
        { id: 'jetonD', t: 'Jeton D', a: 'bouton, dealer', d: "Marque le joueur qui « distribue » (en ligne, c'est le logiciel qui le fait). Les deux joueurs à sa gauche paient les blindes. Il avance d'une place à chaque main." },
        { id: 'btn', t: 'BTN', a: 'bouton', d: "Le joueur qui a le jeton D. Il parle en dernier après le flop : c'est la meilleure place de la table, on peut y jouer beaucoup de mains." },
        { id: 'sb', t: 'SB', a: 'petite blinde', d: "Juste à gauche du bouton. Paie d'office la petite blinde et parle en premier après le flop : une place difficile." },
        { id: 'bb', t: 'BB', a: 'grosse blinde', d: "2e à gauche du bouton. Paie d'office la grosse blinde. Parle en dernier avant le flop (et peut checker si personne n'a relancé), mais en premier ou presque après." },
        { id: 'utg', t: 'UTG', a: '« under the gun »', d: "Juste après la grosse blinde : le premier à parler avant le flop. La place la plus difficile, car tous les autres parlent après lui : on n'y joue que de bonnes mains." },
        { id: 'utg1', t: 'UTG+1, UTG+2', d: "Les places juste après UTG, aux tables de 7 joueurs et plus. Encore mal placées : on y joue serré." },
        { id: 'mp', t: 'MP', a: 'MP+1, MP+2, « middle position »', d: "Le milieu de table, entre les premières places et le cut-off. On peut y jouer un peu plus de mains qu'en UTG." },
        { id: 'co', t: 'CO', a: '« cut-off »', d: "Juste avant le bouton. Une bonne place : peu de joueurs parlent après toi, tu peux jouer plus de mains." },
        { id: 'position', t: 'Être en position', d: "Parler après ton adversaire. C'est un gros avantage : tu vois ce qu'il fait avant de décider. Le bouton est toujours en position après le flop.", ex: "Avant le flop, UTG parle en premier et la grosse blinde en dernier. Après le flop, la petite blinde parle en premier et le bouton en dernier." },
        { id: 'headsup', t: 'Heads-up', d: 'Quand il ne reste que 2 joueurs. Le bouton est alors aussi la petite blinde.' },
      ],
    },
    {
      id: 'actions', title: 'Les actions',
      intro: "Entre parenthèses, la lettre utilisée dans l'appli et dans les messages pour Claude. Les montants sont le total misé par le joueur sur le tour en cours.",
      items: [
        { id: 'fold', t: 'Se coucher', a: 'fold, f', d: "Abandonner la main. Tu perds ce que tu as déjà misé, mais rien de plus. C'est l'action la plus fréquente, même chez les bons joueurs." },
        { id: 'check', t: 'Check', a: 'x', d: "Passer sans miser. Possible seulement si personne n'a misé avant toi sur ce tour." },
        { id: 'call', t: 'Suivre', a: 'call, s', d: 'Mettre autant que la mise en cours pour rester dans le coup.' },
        { id: 'bet', t: 'Miser', a: 'bet, b', d: "Mettre des jetons quand personne n'a encore misé sur ce tour.", ex: 'b40 = mise 40.' },
        { id: 'raise', t: 'Relancer', a: 'raise, r', d: "Mettre plus que la mise en cours. Les autres doivent alors payer la différence, relancer encore ou se coucher.", ex: 'r120 = relance à 120 au total.' },
        { id: 'minraise', t: 'Relance minimum', d: "Une relance doit augmenter la mise au moins autant que la relance précédente.", ex: 'Mise de 20, relance à 60 (+40) : la relance suivante doit aller au moins à 100.' },
        { id: '3bet', t: 'Sur-relance', a: '3-bet', d: "Relancer par-dessus une relance. Avant le flop, on dit « 3-bet » : la grosse blinde compte comme la 1re mise, la relance comme la 2e, la sur-relance comme la 3e." },
        { id: '4bet', t: '4-bet', d: 'Relancer par-dessus une sur-relance. Montre presque toujours une très grosse main (AA, KK…).' },
        { id: 'allin', t: 'Tapis', a: 'all-in, AI', d: 'Mettre tous ses jetons. On ne peut plus te forcer à te coucher : tu vas jusqu\'au bout de la main.', ex: 'AI350 = tapis pour 350.' },
        { id: 'limp', t: 'Limper', a: 'limp', d: "Avant le flop, seulement suivre la grosse blinde au lieu de relancer. En général déconseillé : relancer (ou se coucher) est presque toujours mieux." },
        { id: 'checkraise', t: 'Check-relance', a: 'check-raise', d: "Checker, puis relancer quand un adversaire mise. Un piège classique avec une grosse main (ou un bluff)." },
        { id: 'cbet', t: 'Mise de continuation', a: 'c-bet', d: "Le joueur qui a relancé avant le flop mise de nouveau au flop, qu'il ait touché le tableau ou non. Souvent efficace : l'adversaire n'a pas touché 2 fois sur 3." },
        { id: 'uncalled', t: 'Mise non suivie', d: "Si personne ne suit ta mise, la part que personne n'a payée te revient. L'appli l'affiche « récupère … (mise non suivie) »." },
      ],
    },
    {
      id: 'cartes', title: "Les cartes et la façon de les écrire",
      intro: "Les joueurs écrivent les mains de façon très courte. Une fois ce code compris, l'onglet Mains et les conseils deviennent clairs.",
      items: [
        { id: 'valeurs', t: 'Valeurs', a: 'A K Q J T', d: "A = As, K = Roi (King), Q = Dame (Queen), J = Valet (Jack), T = 10 (Ten), puis 9 à 2. L'As est la plus forte, mais compte aussi comme 1 dans la suite A-2-3-4-5." },
        { id: 'couleurs', t: 'Couleurs', d: "♠ pique, ♥ cœur, ♦ carreau, ♣ trèfle. Pour les taper dans l'appli : P pique, C cœur, K carreau, T trèfle." },
        { id: 'suited', t: 'AKs', a: 's = assorties, « suited »', d: 'Le « s » veut dire que les deux cartes sont de la même couleur. Un peu plus fortes que les mêmes valeurs dépareillées, car elles peuvent faire une couleur.', cards: ['Ac', 'Kc'] },
        { id: 'offsuit', t: 'AKo', a: 'o = dépareillées, « offsuit »', d: 'Le « o » veut dire que les deux cartes sont de couleurs différentes.', cards: ['Ac', 'Kp'] },
        { id: 'pocket', t: 'Paire servie', a: '77, « pocket pair »', d: "Deux cartes de même valeur dès le départ. On l'écrit juste avec les deux valeurs : 77 = une paire de 7.", cards: ['7p', '7k'] },
        { id: 'plus', t: 'Le signe +', a: '66+, A9s+', d: "« Cette main et toutes celles au-dessus ». 66+ = 66, 77, 88… jusqu'à AA. A9s+ = A9s, ATs, AJs, AQs, AKs." },
        { id: 'tiret', t: 'Le tiret', a: '98s-65s', d: 'De la première main à la dernière : 98s-65s = 98s, 87s, 76s, 65s.' },
        { id: 'connect', t: 'Connecteurs', d: "Deux cartes qui se suivent (9-8, 7-6…). Elles peuvent faire des quintes ; assorties (98s), elles peuvent aussi faire des couleurs.", cards: ['9t', '8t'] },
        { id: 'premium', t: 'Main premium', d: 'Les toutes meilleures mains de départ : AA, KK, QQ et AK. On les relance presque toujours.' },
        { id: 'kicker', t: "Kicker", a: "carte d'appoint", d: 'La carte qui départage deux joueurs ayant la même combinaison.', ex: "Tableau A♣ 7♥ 2♦. Toi A♥ K♦, lui A♠ Q♣ : vous avez tous les deux une paire d'As, mais ton Roi bat sa Dame. Tu gagnes grâce à ton kicker." },
        { id: 'grille', t: 'Grille des mains de départ', d: "Dans l'onglet Mains : les 169 mains de départ possibles. Au-dessus de la diagonale, les mains assorties (s) ; en dessous, les dépareillées (o) ; sur la diagonale, les paires." },
      ],
    },
    {
      id: 'combis', title: 'Les combinaisons',
      intro: "De la plus forte à la plus faible. Une combinaison bat toujours toutes celles qui sont en dessous.",
      combos: true, // liste générée à partir de hands.js
      items: [
        { id: 'set', t: 'Brelan servi', a: 'set', d: 'Un brelan fait avec une paire servie et une carte du tableau. Très fort et bien caché : personne ne le voit venir.', ex: 'Toi 7♠ 7♥, tableau K♣ 7♦ 2♠ : brelan de 7.' },
        { id: 'toppair', t: 'Paire max', a: 'top pair', d: 'Une paire avec la plus haute carte du tableau. Souvent la meilleure main au flop, mais attention au kicker.', ex: 'Toi K♠ Q♠, tableau K♣ 7♦ 2♥.' },
        { id: 'overpair', t: 'Paire en main au-dessus', a: 'overpair', d: 'Une paire servie plus haute que toutes les cartes du tableau.', ex: 'Toi Q♠ Q♥, tableau J♣ 7♦ 2♥.' },
        { id: 'nuts', t: 'Les nuts', d: "La meilleure main possible avec ce tableau : personne ne peut te battre." },
      ],
    },
    {
      id: 'tirages', title: 'Les tirages',
      intro: "Un tirage, c'est quand il te manque une seule carte pour faire une grosse combinaison. Elle peut encore tomber à la turn ou à la river.",
      items: [
        { id: 'outs', t: 'Outs', d: 'Les cartes encore dans le paquet qui amélioreraient ta main.' },
        { id: 'flushdraw', t: 'Tirage couleur', d: "Tu as 4 cartes de la même couleur, il en manque une. Il reste 9 cartes de cette couleur : 9 outs.", ex: 'Toi A♥ 9♥, tableau K♥ 7♥ 2♣.' },
        { id: 'oesd', t: 'Tirage quinte ouverte', a: 'bilatéral', d: '4 cartes qui se suivent, ouvertes des deux côtés : une carte en dessous ou au-dessus complète la quinte. 8 outs.', ex: 'Toi 8♠ 7♠, tableau 6♥ 5♣ K♦ : un 9 ou un 4.' },
        { id: 'gutshot', t: 'Tirage ventral', a: 'gutshot', d: 'Il manque une carte au milieu de la suite : 4 outs seulement.', ex: 'Toi 9♠ 8♠, tableau 6♥ 5♣ K♦ : seul un 7.' },
        { id: 'regle24', t: 'Règle du 2 et du 4', d: "Pour estimer tes chances de toucher : au flop, outs × 4 = % de chances d'ici la river ; à la turn, outs × 2 = % de chances à la river.", ex: 'Tirage couleur (9 outs) au flop : 9 × 4 ≈ 36 % de la toucher d\'ici la river.' },
        { id: 'semibluff', t: 'Semi-bluff', d: "Miser avec un tirage : soit l'adversaire se couche et tu gagnes tout de suite, soit il suit et tu peux encore toucher ta carte." },
      ],
    },
    {
      id: 'calculs', title: "Les calculs de l'aide instantanée",
      intro: "Ce que l'appli calcule pour toi, sans IA, à chaque coup.",
      items: [
        { id: 'equity', t: 'Chances de gagner', a: 'équité, « equity »', d: "Combien de fois sur 100 tu gagnerais si personne ne se couchait jusqu'à la fin de la main. L'appli les calcule en jouant des milliers de fois la fin de la main au hasard." },
        { id: 'potodds', t: 'Cote du pot', a: '« pot odds »', d: "La part du pot qu'il faut gagner pour que suivre soit rentable : ce que tu paies, divisé par le pot que tu remportes si tu gagnes.", ex: "Il y a 170 dans le pot, on te demande 40. Tu risques 40 pour remporter 210 : il suffit de gagner 40 ÷ 210 ≈ 19 % du temps, un peu moins d'une fois sur 5." },
        { id: 'rentable', t: 'Rentable sur la durée', d: "Au poker, on ne gagne pas chaque coup. Une décision est bonne si, en la répétant 100 fois, tu gagnes plus de jetons que tu n'en perds. Si tes chances de gagner sont plus hautes que la cote du pot, suivre est rentable." },
        { id: 'range', t: 'Mains probables', a: 'fourchette, « range »', d: "L'ensemble des mains qu'un joueur peut avoir d'après ce qu'il a fait. Celui qui relance a surtout de bonnes mains ; celui qui mise après le flop a souvent touché le tableau." },
        { id: 'stackbb', t: 'Tapis en grosses blindes', d: 'On compte souvent ses jetons en nombre de grosses blindes, car c\'est ce qui compte pour décider.', ex: 'Blindes 10/20 et 400 jetons : 20 grosses blindes (20 BB).' },
        { id: 'short', t: 'Tapis court', a: 'short stack', d: "Moins de 12 à 15 grosses blindes. On ne fait plus de petites mises : on met tapis avec une bonne main, ou on se couche." },
        { id: 'sidepot', t: 'Pot annexe', a: 'side pot', d: "Un joueur à tapis ne peut gagner, chez chaque adversaire, que ce qu'il a lui-même misé. Le reste forme un pot annexe, disputé seulement entre les joueurs qui avaient plus de jetons." },
        { id: 'ev', t: 'Gain moyen', a: 'espérance, « EV »', d: "Ce qu'une action rapporte en moyenne si tu la répétais des centaines de fois, en comptant les fois où l'adversaire se couche, paie, gagne ou perd. L'aide instantanée compare le gain moyen de chaque action (check, mise, suivre, relance, couché) et conseille la meilleure.", ex: 'Gain moyen : relance à 120 +23, suivre +7 → relancer rapporte en moyenne 16 jetons de plus.' },
        { id: 'sizing', t: 'Taille des mises', d: 'Avant le flop, on relance en général à 2,5 ou 3 fois la grosse blinde (plus 1 par joueur qui a seulement suivi). Après le flop, on mise souvent entre la moitié et les deux tiers du pot.' },
      ],
    },
    {
      id: 'styles', title: 'Les styles de joueurs et la stratégie',
      intro: "Ce que veulent dire les étiquettes sous les joueurs, et les mots de la stratégie.",
      items: [
        { id: 'serre', t: 'Serré', a: 'tight', d: "Joue peu de mains (moins de 20 %). Quand il entre dans un coup, il a souvent une bonne main : méfie-toi." },
        { id: 'large', t: 'Large', a: 'loose', d: 'Joue beaucoup de mains (plus de 38 %), y compris des faibles. Tu peux miser plus fort tes bonnes mains : il paiera souvent.' },
        { id: 'passif', t: 'Passif', d: "Suit plus qu'il ne relance. Quand un joueur passif relance, il a souvent une très bonne main." },
        { id: 'agressif', t: 'Agressif', d: 'Mise et relance souvent. Ses relances ne veulent pas toujours dire une grosse main.' },
        { id: 'tag', t: 'Serré-agressif', a: 'TAG', d: "Joue peu de mains, mais les joue fort (relance plutôt que suivre). Le style conseillé pour bien débuter : c'est celui des tableaux de l'onglet Mains." },
        { id: 'vpip', t: 'VPIP', d: "% des mains où un joueur met des jetons de lui-même avant le flop (suivre ou relancer, pas les blindes). 1er chiffre des profils envoyés à Claude.", ex: 'profils … UTG 45/8/70 : UTG joue 45 % de ses mains.' },
        { id: 'pfr', t: 'PFR', d: "% des mains où un joueur relance avant le flop. 2e chiffre des profils. Proche du VPIP = agressif ; beaucoup plus bas = passif.", ex: 'UTG 45/8 : il joue 45 % de ses mains mais n\'en relance que 8 % : passif.' },
        { id: 'foldbet', t: 'Se couche face à une mise', d: "% des fois où un joueur abandonne quand on mise contre lui après le flop. L'appli l'affiche dans la bulle de son étiquette, sous son nom (onglet Partie). Élevé : il se bluffe bien. Bas : ne le bluffe pas." },
        { id: 'bluff', t: 'Bluff', d: 'Miser avec une mauvaise main pour faire coucher une meilleure. Marche mal contre les joueurs qui paient tout.' },
        { id: 'protection', t: 'Mise de protection', d: "Miser avec une main correcte mais fragile pour faire coucher les mains qui pourraient te dépasser à la carte suivante (tirages, cartes plus hautes)." },
        { id: 'steal', t: 'Vol des blindes', a: 'steal', d: "Relancer en fin de tour (cut-off, bouton, petite blinde) avec une main moyenne, juste pour gagner les blindes quand les joueurs restants se couchent souvent." },
        { id: 'iso', t: 'Isoler un suiveur', a: 'iso-relance', d: "Quand un joueur a seulement suivi la grosse blinde (souvent avec une main moyenne), relancer pour jouer seul contre lui, avec la meilleure main et l'initiative." },
        { id: 'squeeze', t: 'Squeeze', d: "Sur-relancer quand il y a déjà eu une relance et un ou plusieurs joueurs qui ont suivi. La sur-relance doit être plus grosse, car il y a plus de monde à faire coucher." },
        { id: 'blocker', t: 'Bloqueur', d: "Une carte dans ta main qui rend certaines mains de l'adversaire moins probables. Avec un As, il a moins souvent AA ou AK : c'est pourquoi A5s est un bon candidat pour une sur-relance « bluff »." },
        { id: 'value', t: 'Mise de valeur', a: 'value bet', d: 'Miser avec une bonne main pour être payé par une moins bonne. La plus grande source de gains contre des joueurs qui suivent beaucoup.' },
        { id: 'slowplay', t: 'Jouer lentement', a: 'slowplay', d: 'Checker ou seulement suivre avec une très grosse main pour piéger l\'adversaire et le laisser miser.' },
        { id: 'tilt', t: 'Tilt', d: "Jouer mal sous le coup de l'énervement, souvent après un mauvais coup. Le meilleur remède : faire une pause." },
        { id: 'badbeat', t: 'Bad beat', d: "Perdre un coup où l'on était largement favori, à cause d'une dernière carte. Ça arrive à tout le monde : ce qui compte, c'est d'avoir pris la bonne décision." },
      ],
    },
    {
      id: 'bluffs', title: 'Le bluff : quand et comment',
      intro: "Bluffer, c'est miser avec une main faible pour faire coucher une meilleure. Bien utilisé, c'est rentable ; mal utilisé, c'est la façon la plus rapide de perdre ses jetons. Les règles simples ci-dessous suffisent pour une partie entre amis.",
      items: [
        { id: 'bl-pourquoi', t: 'Pourquoi bluffer un peu', d: "Si tu ne bluffes jamais, les autres le remarquent : ils se couchent dès que tu mises, et tes bonnes mains ne rapportent plus rien. Quelques bluffs bien choisis rendent tes mises crédibles, et on paie plus souvent tes vraies mains." },
        { id: 'bl-qui', t: 'Contre qui bluffer', d: "Contre un seul adversaire, et de préférence un joueur qui se couche souvent quand on mise contre lui. Pour le savoir, dans l'onglet Partie, touche l'étiquette sous son nom (« serré », « large »…) : après quelques mains, la bulle dit par exemple « Se couche souvent face à une mise (65 %) : il se bluffe bien ». Jamais contre un « payeur » qui suit tout : contre lui, mise seulement tes bonnes mains, il les paiera.", ex: "Paul se couche 60 % des fois face à une mise : bon candidat. Léa paie tout : on ne la bluffe pas." },
        { id: 'bl-plusieurs', t: 'Pas contre plusieurs joueurs', d: "Plus il y a de joueurs dans le coup, plus il y a de chances que l'un d'eux ait quelque chose et paie. À trois joueurs ou plus, on ne bluffe (presque) pas." },
        { id: 'bl-cbet', t: 'Le bluff le plus simple : la mise de continuation', a: 'c-bet', d: "Tu as relancé avant le flop, et tu mises au flop même si tu n'as rien touché. Ça marche souvent contre un seul adversaire : lui non plus n'a souvent rien touché, et ta relance d'avant le flop rend ta mise crédible. Une mise du tiers à la moitié du pot suffit.", ex: "Tu relances avec A-K, un joueur suit. Flop 9-6-2 : tu n'as rien, mais une mise de la moitié du pot le fait souvent coucher." },
        { id: 'bl-histoire', t: 'Raconter une histoire crédible', d: "Ton bluff doit correspondre à une main que tu pourrais vraiment avoir. Un As qui tombe au flop après ta relance avant le flop fait peur (tu pourrais avoir A-K) ; une troisième carte de la même couleur aussi. Si ton histoire ne tient pas, il paiera." },
        { id: 'bl-tirage', t: 'Le meilleur bluff : avec un tirage', d: "Bluffe de préférence avec un tirage (couleur, quinte) : c'est le semi-bluff. S'il se couche, tu gagnes tout de suite ; s'il paie, tu peux encore toucher ta carte et gagner. Avec rien du tout, si on te paie, c'est perdu." },
        { id: 'bl-taille', t: 'Combien miser pour bluffer', d: "La même taille que quand tu as une vraie main, sinon les autres te liront. La moitié à deux tiers du pot suffit en général : miser énorme risque beaucoup pour le même résultat." },
        { id: 'bl-seuil', t: "Combien de fois un bluff doit marcher", d: "Une mise de la moitié du pot doit faire coucher l'adversaire au moins 1 fois sur 3 pour être rentable ; une mise du pot, 1 fois sur 2. C'est ce que l'appli calcule quand elle te conseille un bluff : elle estime à quelle fréquence l'adversaire se couche, d'après sa main probable et son profil.", ex: "Pot de 300, tu mises 150 : tu risques 150 pour gagner 300. Il suffit qu'il se couche une fois sur trois." },
        { id: 'bl-abandon', t: 'Savoir abandonner', d: "Si on paie ton bluff au flop et que la carte suivante ne t'aide pas, n'insiste pas : un joueur qui a payé une fois a souvent quelque chose. Un bluff, parfois deux, jamais trois de suite contre le même joueur." },
        { id: 'bl-erreurs', t: 'Les erreurs du débutant', d: "Bluffer un payeur. Bluffer à plusieurs. Bluffer à la river après avoir été payé deux fois. Bluffer avec une main moyenne qui peut gagner sans miser (une petite paire) : là, mieux vaut checker et voir. Et montrer ses bluffs pour frimer : les autres paieront plus souvent ensuite." },
      ],
    },
    {
      id: 'tailles', title: 'Choisir la taille de sa mise',
      intro: "Chaque main a besoin d'un certain prix pour continuer. En choisissant combien tu mises, tu choisis quelles mains peuvent encore payer et lesquelles doivent se coucher.",
      items: [
        { id: 'ts-prix', t: 'Le prix pour payer', d: "Pour savoir si payer une mise est rentable, compare ce qu'il faut payer à ce qu'il y aura dans le pot. La règle : il faut gagner au moins « mise ÷ (pot + 2 × mise) » des fois. Une mise du tiers du pot demande de gagner 1 fois sur 5 (20 %), la moitié du pot 1 fois sur 4 (25 %), les deux tiers 29 %, le pot 1 fois sur 3 (33 %).", ex: "Pot de 300, mise de 100 : tu paies 100 pour un pot de 500. Il faut gagner au moins 100 ÷ 500 = 20 % des fois." },
        { id: 'ts-tirages', t: 'Faire payer cher les tirages', d: "Un tirage couleur a 9 cartes qui l'aident sur 47 : il touche environ 1 fois sur 5 à la carte suivante (19 %), et 1 fois sur 3 en voyant la turn et la river (35 %). Une petite mise (un tiers du pot) lui donne le bon prix pour suivre ; une mise de la moitié du pot ou plus est trop chère pour une seule carte : il devrait se coucher, et s'il paie quand même, il te fait un cadeau.", ex: "Tu as une paire de Rois, le flop a deux cœurs. Mise les deux tiers du pot plutôt qu'un tiers : le joueur avec deux cœurs paie trop cher." },
        { id: 'ts-paires', t: 'Avant le flop : écarter les petites paires', d: "Une petite paire ne gagne vraiment que si elle fait un brelan au flop, environ 1 fois sur 8. Pour que payer soit rentable, il faut pouvoir gagner gros ensuite : en gros 15 fois ce qu'on paie. Plus ta relance est grosse (ou plus les tapis sont petits), moins c'est le cas : les petites paires doivent se coucher.", ex: "Relance à 3 grosses blindes avec 100 devant : une petite paire peut payer (100 = 33 fois sa mise). Relance à 8 grosses blindes avec 60 devant : 60 = 7 fois sa mise seulement, elle doit se coucher." },
        { id: 'ts-hautes', t: 'Faire coucher les cartes hautes', d: "Une main comme A-Q qui n'a rien touché sur un flop 9-6-2 a encore 6 cartes pour te dépasser (3 As, 3 Dames). Une mise de la moitié du pot la fait souvent coucher, alors qu'en checkant, tu la laisses voir la carte suivante gratuitement." },
        { id: 'ts-petite', t: 'Petite mise pour se faire payer', d: "Avec une très grosse main contre un adversaire prudent, une petite mise garde ses mains moyennes dans le coup : il paie, alors qu'une grosse mise l'aurait fait coucher. Contre un joueur qui paie tout, au contraire, mise gros : il paiera quand même." },
        { id: 'ts-revers', t: 'Le revers des grosses mises', d: "Plus tu mises gros, plus tu fais coucher les mains faibles… mais plus tu restes seul face aux mains fortes, et plus tu perds quand on te paie. Choisis la taille selon ce que tu veux : faire coucher (tirages, cartes hautes) ou te faire payer (mains plus faibles que la tienne)." },
        { id: 'ts-appli', t: "Ce que fait l'appli", d: "Après le flop, l'appli essaie plusieurs tailles (un tiers, deux tiers, le pot, une fois et demie le pot) : pour chacune, elle estime quelles mains de l'adversaire paient ou se couchent, puis elle choisit la plus rentable. Avant le flop, elle relance plus gros quand des joueurs ont déjà suivi, et elle ne paie avec les petites paires que s'il reste assez de jetons derrière." },
      ],
    },
    {
      id: 'messages', title: 'Les messages pour Claude',
      intro: "Le code des messages que l'appli prépare. Tu n'as pas besoin de les écrire, mais les comprendre aide à suivre les réponses de Claude.",
      items: [
        { id: 'm-tapis', t: 'tapis UTG 2000, MP 1500…', d: 'Les jetons de chaque place au début de la main, avant les blindes.' },
        { id: 'm-deal', t: 'BTN A♥ K♦ | UTG r60, CO s', d: 'Ta place et tes cartes, puis (après la barre) ce qu\'ont fait les joueurs avant toi. Un joueur non cité s\'est couché.', ex: 'Ici : tu es au bouton avec As-Roi, UTG a relancé à 60, le cut-off a suivi.' },
        { id: 'm-first', t: 'je parle en premier', d: "Personne n'a encore parlé avant toi sur ce tour." },
        { id: 'm-street', t: '+K♥ 7♣ 2♦ pot 200 | BB b100', d: 'Les nouvelles cartes du tableau, le pot, puis les actions des autres.' },
        { id: 'm-moi', t: '(moi r180)', d: "Ce que tu as vraiment joué, rappelé à Claude au début du message suivant." },
        { id: 'm-main', t: '(ma main : paire de Rois)', d: "Ta meilleure combinaison, calculée par l'appli, pour que Claude ne se trompe pas." },
        { id: 'm-profils', t: 'profils … UTG 45/8/70 sur 30', d: "La façon de jouer des joueurs que l'appli connaît : VPIP / PFR / % couché face à une mise, sur 30 mains observées." },
        { id: 'm-reponse', t: 'r180 → relance à 180', d: "La réponse de Claude : le code de l'action, puis sa traduction en clair. Écris « ? » pour qu'il t'explique son choix." },
      ],
    },
  ];

  const all = () => SECTIONS.reduce((a, s) => a.concat(s.items), []);
  const api = { SECTIONS, all };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerLearn = api;
})(typeof window !== 'undefined' ? window : globalThis);

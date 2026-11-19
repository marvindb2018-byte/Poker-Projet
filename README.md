# Poker → Claude

Petite appli web pour suivre une partie de Texas Hold'em No Limit entre amis et générer, à chaque décision, le message à envoyer à Claude.
Elle est faite en HTML, CSS et JavaScript, sans dépendance ni compilation. Tout est enregistré dans le navigateur du téléphone : rien n'est envoyé sur Internet.

## Deux modes

L'interrupteur **Manuel | Auto**, en haut à droite, permet de changer de mode à tout moment, sans rien perdre.

- **Manuel** (parties en vrai, autour d'une table) : tu saisis la partie dans l'appli, qui écrit les messages pour Claude. Voir « Utilisation » ci-dessous.
- **Auto** (parties en ligne) : rien à saisir. Tu envoies à Claude une capture d'écran de la table quand tu reçois tes cartes, puis à chaque nouvelle carte du tableau. Claude lit la table, déduit ce qui s'est passé depuis la capture précédente, et répond avec les probabilités et un plan (« si on checke → mise 300 ; si on relance → couche-toi »).
  - **Copier le prompt Auto** : à coller une fois dans une conversation Claude, ou dans les instructions d'un Projet Claude.
  - **Capture depuis l'appli (PC, Edge/Chrome)** : « Choisir la fenêtre du jeu » une seule fois, éventuellement « Recadrer sur la table », puis un clic sur « Capturer la table » (ou **Espace**) copie l'image ; **Ctrl+V** dans Claude. L'image reste sur ton ordinateur (presse-papiers).
  - Sur téléphone : capture d'écran classique, partagée à Claude.
  - **Apprendre à l'appli à lire ta table** (en préparation) : pendant une partie, « Démarrer l'enregistrement » garde une image de la fenêtre partagée à chaque changement à la table (une fois l'image stabilisée), jusqu'à 250 images, puis « Télécharger » les rassemble dans un fichier zip. Ces images serviront à faire lire la table Zynga par l'appli elle-même, pour qu'elle prépare seule le message pour Claude.

## Utilisation (mode Manuel)

Les onglets : **Partie** (la partie en cours), **Mains** (tableaux des mains de départ et partie rapide), **Apprendre**, **Prompt**, **Réglages**.

**Au départ (une fois)**

Les onglets **Mains** et **Apprendre** sont accessibles même sans partie en cours, pour étudier avant de s'asseoir à une table.

**⚡ Démarrage rapide** (bouton en haut de « Nouvelle partie ») : fais une capture de la table du site, copie le prompt « lecture de table » et colle-le dans Claude avec la capture. Claude répond par une ligne du type `TABLE blindes 10/20 | ante 0 | Marvin 2000 (moi) | Paul 1850 (D) | Léa 2300 | …` : colle-la dans l'appli, tout se remplit (joueurs dans l'ordre, jetons, blindes, ante, toi, jeton D, joueurs en pause). Vérifie, puis « Commencer la partie ». Les montants abrégés (12,5K, 1,2M) sont compris.

Sinon, à la main :
1. « Nouvelle partie » : nombre de joueurs, blindes, ante éventuelle (payée par chaque joueur ou par la grosse blinde pour toute la table), puis le pseudo et les jetons de chaque joueur tels qu'affichés sur le site (dans l'ordre des places), lequel est toi, et qui a le jeton « D ».
2. « Copier le prompt », puis le coller dans une nouvelle conversation Claude.

**À chaque main**
1. « Distribuer la main » : le jeton D (le « bouton ») avance d'une place et les positions sont calculées toutes seules.
2. Choisir tes 2 cartes (la valeur, puis la couleur).
3. L'appli affiche qui doit parler : toucher ce qu'il fait (Couché, Suit, Relance…, Tapis). « Check / couché jusqu'à moi » fait gagner du temps.
4. Quand c'est à toi, le message est déjà copié : le coller dans Claude, puis toucher ce que tu joues.
5. Au flop, à la turn et à la river, choisir les cartes du tableau. Le pot et les tapis se calculent tout seuls.
6. En fin de main, toucher le gagnant (plusieurs = partage). L'appli affiche les jetons de chacun avant → après, puis « Main suivante ».

L'**historique de la main** (blindes, actions de chacun, cartes, pot, gagnant, mise non suivie rendue) s'affiche pendant et après la main.

**Aide instantanée (sans IA)** : dès que tes cartes sont choisies, l'appli affiche sans attendre Claude :
- avant le flop, le conseil du tableau des mains de départ selon ta place et ce qui s'est passé avant toi (« Relance à 180 · AKo : main premium »). Avant ton tour, le plan pour les cas fréquents (personne ne relance / une relance / deux relances). `G` ou « Jouer ça » joue le conseil ;
- à chaque tour, ta probabilité de gagner contre les **mains probables** de chaque joueur encore en jeu : un joueur qui a relancé a surtout de bonnes mains, un joueur qui mise après le flop a souvent touché le tableau (tirage, paire…), sauf quand il bluffe. Le chiffre « au hasard » reste affiché à côté ;
- quand il faut suivre, la cote du pot : « pour suivre 60, il faut gagner 40 % du temps → suivre est rentable ».
Avant le flop, seul le tableau décide (les chances et le « rentable » s'affichent à partir du flop, pour ne pas contredire le conseil). Chaque conseil et chaque calcul a son explication « En clair » avec les chiffres de la main, dans un menu déroulant juste en dessous : fermé par défaut, et une sorte d'explication ouverte (le conseil, la cote du pot…) le reste aux coups suivants jusqu'à ce qu'on la referme. Chaque étape où tu dois saisir ou toucher quelque chose est encadrée en doré avec la mention « À faire » (tes cartes, l'action du joueur qui parle, les cartes du tableau, le gagnant, la main suivante…) : un seul endroit à regarder, deux à ton tour (« Envoie ceci à Claude » et « Ce que tu joues »). Ce sont des estimations : plus l'appli a vu jouer un joueur, plus elles sont justes.

**Conseil après le flop** : à ton tour, l'appli compare le *gain moyen* de chaque action possible (check, mise d'1/3, 2/3 ou du pot, suivre, relancer, tapis, couché). Elle tire des milliers de fois les mains probables des adversaires et les cartes à venir, estime qui se couche ou paie selon la force de sa main et son profil, puis conseille l'action qui rapporte le plus, avec l'explication en clair (mise de valeur, bluff, semi-bluff, protection, cote du pot) et l'écart de gain avec la 2e meilleure action.

**Avant le flop**, le tableau tient aussi compte de la situation comme un bon joueur : sur-relance ou couché en petite blinde, bouton qui paie plus large, sur-relance « bluff » avec A5s/A4s contre une relance tardive, sur-relance plus grosse quand des joueurs ont déjà suivi (squeeze), relance pour isoler les suiveurs ou suivi derrière eux avec les petites paires et connecteurs, tapis ou couché entre 12 et 25 grosses blindes, vol des blindes quand les joueurs restants jouent très peu.

**Taille de la relance** : face à une relance, le conseil dépend de sa taille, calée sur les tailles les plus courantes. Relance normale (jusqu'à 3 grosses blindes) : on défend avec le tableau. Grosse relance (3 à 6) : on continue avec 77+, AJs+, KQs, AQo+. Très grosse (6 à 15) : seulement QQ+, AK. Tapis ou plus de 15 : seulement KK+ (et QQ, AK pour suivre). Contre un joueur qui relance n'importe quoi, la relance compte pour une taille en dessous ; contre un joueur très serré, pour une taille au-dessus. La **place du relanceur** compte aussi : depuis UTG ou MP, on ne relance qu'avec de bonnes mains (on est plus prudent : A10 dépareillés couché en grosse blinde) ; depuis CO, BTN ou SB, avec beaucoup de mains moyennes (on paie ou sur-relance plus large : A10 dépareillés payé). Si l'appli connaît les habitudes du joueur, elles comptent plus que sa place. Résultat : l'appli ne conseille plus de payer un tapis de 100 grosses blindes avec 77 ou KQ.

**Cartes montrées** : à l'abattage, tape les cartes que les joueurs montrent (« ac kk » = A♥ K♦). L'appli trouve seule le gagnant, et surtout vérifie ses prévisions : ce joueur bluffait-il ? Relance-t-il avec des mains plus faibles que prévu ? Ses profils s'ajustent en conséquence.

**Validation** : `node tests/sim.js 12000` fait jouer l'appli contre des robots de différents styles (amis, payeurs, serrés, maniaques, mélange), avec les mêmes cartes pour l'ancienne et la nouvelle version. Sur 12 000 mains par table, la nouvelle gagne nettement plus contre des amis (+65 ± 31 grosses blindes / 100 mains), des payeurs (+303 ± 50) et une table mélangée (+71 ± 33) ; contre des maniaques (+18 ± 31) et des joueurs serrés (+6 ± 21), elle fait au moins aussi bien. `node tests/advice.test.js` vérifie 12 situations classiques (mise de valeur, bluff contre un joueur qui se couche, pas de bluff contre un payeur, paiement contre un maniaque…).

**Profils des joueurs** : à chaque main saisie, l'appli retient ce que fait chaque joueur (mains jouées, relances, s'il se couche face à une mise). Après 8 mains, son style s'affiche sous son nom sur la table (« serré » = joue peu de mains, « large » = en joue beaucoup ; « passif » = suit plus qu'il ne relance, « agressif » = relance souvent), avec une bulle qui explique quoi en faire. Les profils servent :
- au calcul des mains probables et au conseil avant le flop (on se méfie de la relance d'un joueur serré, on paie plus large contre un joueur qui relance tout) ;
- à Claude : une ligne « profils » est ajoutée en tête de main (ex : `profils (…) : UTG 45/8/70 sur 30`) ;
- d'une partie à l'autre : ils sont rangés par pseudo, dans ce navigateur. Réglages → « Profils des joueurs » pour les voir ou les effacer.
En mode Auto, c'est Claude qui retient le style des joueurs au fil des captures.

**Positions** : survole (ou touche) une position (UTG, MP, CO, BTN…) pour voir ce qu'elle veut dire.

**Onglet Apprendre** : toutes les notions du poker utilisées dans l'appli et par Claude (déroulement d'une main, places, actions, écriture des cartes comme AKo / AKs, combinaisons, tirages, calculs, styles de joueurs, code des messages), expliquées simplement avec des exemples. Une recherche, une case « Je connais » avec la progression, et « Teste-toi » pour réviser les notions pas encore connues. Le contenu est dans `learn.js` : facile d'y ajouter une notion.

**🎯 Partie rapide (onglet Mains)** : pour jouer avec tes potes sans rien saisir. Choisis le nombre de joueurs, touche sur la petite table le joueur qui a le jeton D : l'appli te dit ta place (« Tu es SB ») et le tableau des mains de départ se règle tout seul dessus. À chaque main (dès que le jeton D tourne, avec `Entrée` ou « Main suivante »), une petite fenêtre s'ouvre au milieu de l'écran : touche la valeur de ta 1re carte (9), puis sa couleur (♠), puis pareil pour la 2e. La fenêtre disparaît, ta main est encadrée dans le tableau, tes cartes s'affichent sur ton siège et le plan apparaît. Au clavier : `9` puis `P` = 9♠ (`T` = 10 ; couleurs `P` pique, `C` cœur, `K` carreau, `T` trèfle) ; `Retour arrière` pour corriger, `Échap` pour passer. Tu peux aussi toucher ta main directement dans le tableau (AJo, 97s…) : le plan s'affiche, sans rien taper. « Personne n'a relancé → Relance à 3 BB », puis une ligne par taille de relance (« Relance jusqu'à 6 BB → Suis », « Relance de plus de 6 BB, ou tapis → Couche-toi ») : tu lis la ligne qui correspond. C'est le même algorithme que dans l'onglet Partie. Quelqu'un relance ? Touche-le sur la table : 1 fois = relance normale, 2 fois = grosse relance ou tapis, 3 fois = annuler. Ceux qui parlent après une relance : 1 fois = il suit, 2 fois = il relance la relance. Le conseil s'affiche pour ce qui s'est passé (« Joueur 2 (UTG) a relancé, Joueur 4 (CO) a suivi → Suis »), et le tableau se colore pour cette situation. Quand des joueurs ont déjà suivi la relance, l'appli garde plus de paires et de mains assorties (elles gagnent de gros pots à plusieurs), moins de mains dépareillées, et sur-relance plus gros. Le jeton D se place au clic droit (appui long sur téléphone). Au fil des mains, l'appli retient qui relance souvent quand il parle avant toi (« relance souvent », « relance peu » sous son nom) et en tient compte. À chaque nouvelle main, « Main suivante » (ou `Entrée`) : le jeton D avance d'un joueur et ta place suit. Sur la page Mains, le cadre des raccourcis n'est plus affiché, pour laisser la place à la table et au tableau.

**Onglet Mains** : les tableaux des mains de départ (13 × 13) pour chaque place, la défense en grosse blinde et « face à une relance » (calculés par l'algorithme de l'onglet Partie, pour une relance normale et pour ta place), avec ta main encadrée. Pour les apprendre petit à petit.

**Les joueurs** (plus d'onglet Table) : dans l'onglet Partie, touche un joueur (son siège sur la table sur PC, sa ligne dans la liste sur téléphone) pour corriger ses jetons, changer son pseudo, le mettre en pause, lui donner le jeton D pour la prochaine main, dire que c'est toi, ou le faire partir. Pour ajouter quelqu'un, même en pleine main (il jouera à la suivante) : sur PC, le « + » entre deux sièges de la table ; sur téléphone, « + Un joueur arrive » sous la liste. Pendant une main, seul le pseudo se change ; le reste entre deux mains.
**Main trop rapide ?** « ⏭ Passer le tour » (en haut de la main) la passe sans la saisir : le jeton D avance comme sur le site et la main suivante commence ; les jetons reviennent à leur valeur d'avant la main (à corriger en touchant un joueur si besoin) et la main ne compte pas dans les profils. Ctrl+Z annule.

**En cas d'erreur** : « ↶ Annuler » revient en arrière d'une action. « Effacer cette main » efface toute la saisie de la main en cours (ce n'est pas se coucher : pour ça, c'est « Couché »).

## Sur PC (écran large)

À partir de 1000 px de large, l'appli passe en affichage PC. La main en cours est sur deux colonnes : à gauche le message pour Claude et les boutons d'action, au milieu une **table de poker** vue de dessus (aussi entre deux mains ; un « + » discret entre deux places pour ajouter un joueur, un « − » au survol d'un joueur pour le retirer : tout de suite s'il ne joue pas la main, sinon il est couché quand c'est à lui puis retiré à la fin de la main) (toi en bas, les autres joueurs autour avec leurs jetons et leurs mises, le jeton D, le joueur qui parle en surbrillance, le tableau et le pot au centre ; à l'abattage, on clique sur le gagnant). Une colonne à droite affiche :
- **Ta main** : les cartes qui forment ta combinaison (les tiennes marquées d'un point, les cartes d'appoint grisées) et son nom (ex. « Paire de Rois »), les tirages couleur et quinte, et un avertissement si la combinaison est entièrement sur le tableau ;
- **Combinaisons** : de la plus forte à la plus faible, avec un exemple, ta combinaison surlignée ;
- **Raccourcis clavier** : les mêmes lettres que dans les messages pour Claude.

| Touche | Action |
|---|---|
| `F` `X` `S` | Couché, check, suit |
| `R` | Mise ou relance : taper le montant puis `Entrée` |
| `A` | Tapis |
| `J` | Check / couché jusqu'à moi |
| `C` | Copier le message pour Claude |
| `G` | Jouer le conseil du tableau (avant le flop) |
| Cartes | la valeur puis la couleur : `A` puis `C` = A♥ (couleurs `P` ♠ `C` ♥ `K` ♦ `T` ♣), `⌫` efface |
| `1` `2`… | Qui gagne : choisir le joueur |

Sur un clavier AZERTY sans pavé numérique, les chiffres marchent avec ou sans Maj (« & » = 1, « é » = 2…), pour le gagnant, les cartes et les montants.
| `Entrée` | Distribuer, valider, main suivante |
| `Ctrl`+`Z` | Annuler la dernière action |

Sur téléphone, l'affichage ne change pas.

## Exemple de messages générés

Début de main :
```
tapis UTG 2000, MP 1500, CO 2400, BTN 1800, SB 2000, BB 900
BTN A♥ K♦ | UTG r60, CO s
```
Avec une ante, le pot de départ est ajouté : `BTN A♥ K♦ pot 45 | UTG r60, CO s`.
Si personne ne parle avant toi : `BTN A♥ K♦ | je parle en premier`.

Les cartes sont écrites avec les symboles ♠ ♥ ♦ ♣ (et 10 pour le dix) : avec des lettres, Claude confondait « Tt » (dix de trèfle) avec une paire de 10.

Après ta décision, ton coup est rappelé, puis les réactions :
```
(moi r180)
UTG s
+K♥ 7♣ 2♦ pot 450 | UTG x
(ma main : paire de Rois)
```
Après chaque carte du tableau, l'appli rappelle ta meilleure combinaison (et tes tirages), calculée par elle.

Quand la table change : `table 7 joueurs (UTG, UTG+1, MP, CO, BTN, SB, BB), blindes 20/40, ante 5`.

## Mise en ligne sur Netlify

- **Depuis GitHub (recommandé)** : sur Netlify, « Add new project → Import an existing project → GitHub », choisir ce dépôt. Il n'y a pas de commande de build, et le dossier publié est `.` (déjà réglé dans `netlify.toml`). Ensuite, chaque modification poussée sur GitHub est mise en ligne automatiquement.
- **Glisser-déposer** : glisser le dossier sur https://app.netlify.com/drop.

## Mises à jour

Avant chaque mise en ligne : `python3 tools/bump_version.py`. Il met une nouvelle étiquette de version sur les fichiers de la page et dans `version.json`. L'appli ouverte compare sa version à celle en ligne (au chargement, toutes les 3 minutes et quand on revient sur l'onglet) et affiche « Une nouvelle version de l'appli est en ligne · Mettre à jour » : un clic recharge la page, sans perdre la partie. En attendant, `Ctrl`+`F5` force aussi le rechargement.

## Modifier le code

| Fichier | Contenu |
|---|---|
| `engine.js` | Règles de la partie : positions, ordre de parole, mises, pots annexes, texte des messages et du prompt (`buildPrompt`, `buildMessage`) |
| `hands.js` | Les combinaisons du poker et le calcul de « ta main » |
| `odds.js` | Probabilité de gagner (au hasard et contre les mains probables), cote du pot, tableaux des mains de départ (`RANGES`) et conseil avant le flop |
| `learn.js` | Les notions de l'onglet Apprendre (mot, explication, exemple) |
| `advisor.js` | Le « cerveau » de l'aide instantanée : mains probables de chacun, situation avant le flop, conseil à ton tour (partagé avec la simulation) |
| `profiles.js` | Profils des joueurs : statistiques par pseudo, style en mots simples, ligne pour Claude |
| `app.js` | Les écrans, les boutons et les raccourcis clavier |
| `style.css` | L'apparence (couleurs en haut du fichier, affichage PC à la fin) |
| `index.html` | La page qui charge le tout |
| `tests/` | Tests : `node tests/engine.test.js`, `node tests/hands.test.js` et `node tests/messages.fuzz.test.js` (des milliers de mains au hasard pour vérifier les messages), `node tests/odds.test.js` (probabilités et tableaux), `node tests/profiles.test.js` (profils et mains probables), `node tests/advice.test.js` (situations classiques), `node tests/sim.js` (simulation contre des robots) |

Pour essayer en local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

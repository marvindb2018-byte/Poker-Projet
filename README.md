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

## Utilisation (mode Manuel)

**Au départ (une fois)**
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
- à chaque tour, ta probabilité de gagner contre les joueurs encore en jeu (calculée en tirant des milliers de mains au hasard) ;
- quand il faut suivre, la cote du pot : « pour suivre 60, il faut gagner 40 % du temps → suivre est rentable ».
La probabilité suppose des adversaires aux mains quelconques : face à une grosse relance, la vraie chance est plus basse.

**Onglet Mains** : les tableaux des mains de départ (13 × 13) pour chaque place, la défense en grosse blinde et « face à une relance », avec ta main encadrée. Pour les apprendre petit à petit.

**Entre deux mains** : l'onglet Table sert quand un joueur arrive, part, se met en pause ou recave, pour corriger des jetons d'après le site, ou pour déplacer le jeton D.
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

## Modifier le code

| Fichier | Contenu |
|---|---|
| `engine.js` | Règles de la partie : positions, ordre de parole, mises, pots annexes, texte des messages et du prompt (`buildPrompt`, `buildMessage`) |
| `hands.js` | Les combinaisons du poker et le calcul de « ta main » |
| `odds.js` | Probabilité de gagner, cote du pot, tableaux des mains de départ (`RANGES`) et conseil avant le flop |
| `app.js` | Les écrans, les boutons et les raccourcis clavier |
| `style.css` | L'apparence (couleurs en haut du fichier, affichage PC à la fin) |
| `index.html` | La page qui charge le tout |
| `tests/` | Tests : `node tests/engine.test.js`, `node tests/hands.test.js` et `node tests/messages.fuzz.test.js` (des milliers de mains au hasard pour vérifier les messages), `node tests/odds.test.js` (probabilités et tableaux) |

Pour essayer en local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

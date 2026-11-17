# Poker → Claude

Petite appli web pour suivre une partie de Texas Hold'em No Limit entre amis et générer, à chaque décision, le message à envoyer à Claude.
Elle est faite en HTML, CSS et JavaScript, sans dépendance ni compilation. Tout est enregistré dans le navigateur du téléphone : rien n'est envoyé sur Internet.

## Utilisation

**Au départ (une fois)**
1. « Nouvelle partie » : nombre de joueurs, blindes, puis le pseudo et les jetons de chaque joueur tels qu'affichés sur le site (dans l'ordre des places), lequel est toi, et qui a le jeton « D ».
2. « Copier le prompt », puis le coller dans une nouvelle conversation Claude.

**À chaque main**
1. « Distribuer la main » : le jeton D (le « bouton ») avance d'une place et les positions sont calculées toutes seules.
2. Choisir tes 2 cartes (la valeur, puis la couleur).
3. L'appli affiche qui doit parler : toucher ce qu'il fait (Couché, Suit, Relance…, Tapis). « Check / couché jusqu'à moi » fait gagner du temps.
4. Quand c'est à toi, le message est déjà copié : le coller dans Claude, puis toucher ce que tu joues.
5. Au flop, à la turn et à la river, choisir les cartes du tableau. Le pot et les tapis se calculent tout seuls.
6. En fin de main, toucher le gagnant (plusieurs = partage), puis « Main suivante ».

**Entre deux mains** : l'onglet Table sert quand un joueur arrive, part, se met en pause ou recave, pour corriger des jetons d'après le site, ou pour déplacer le jeton D.
**En cas d'erreur** : « ↶ Annuler » revient en arrière d'une action. « Effacer cette main » efface toute la saisie de la main en cours (ce n'est pas se coucher : pour ça, c'est « Couché »).

## Sur PC (écran large)

À partir de 1000 px de large, l'appli passe en affichage PC. La main en cours est sur deux colonnes : à gauche le message pour Claude et les boutons d'action, au milieu une **table de poker** vue de dessus (toi en bas, les autres joueurs autour avec leurs jetons et leurs mises, le jeton D, le joueur qui parle en surbrillance, le tableau et le pot au centre ; à l'abattage, on clique sur le gagnant). Une colonne à droite affiche :
- **Ta main** : ta combinaison actuelle (ex. « Paire de Rois »), les tirages couleur et quinte, et un avertissement si la combinaison est entièrement sur le tableau ;
- **Combinaisons** : de la plus forte à la plus faible, avec un exemple, ta combinaison surlignée ;
- **Raccourcis clavier** : les mêmes lettres que dans les messages pour Claude.

| Touche | Action |
|---|---|
| `F` `X` `S` | Couché, check, suit |
| `R` | Mise ou relance : taper le montant puis `Entrée` |
| `A` | Tapis |
| `J` | Check / couché jusqu'à moi |
| `C` | Copier le message pour Claude |
| Cartes | la valeur puis la couleur : `A` puis `C` = A♥ (couleurs `P` ♠ `C` ♥ `K` ♦ `T` ♣), `⌫` efface |
| `1` `2`… | Qui gagne : choisir le joueur |
| `Entrée` | Distribuer, valider, main suivante |
| `Ctrl`+`Z` | Annuler la dernière action |

Sur téléphone, l'affichage ne change pas.

## Exemple de messages générés

```
tapis UTG 2000, MP 1500, CO 2400, BTN 1800, SB 2000, BB 900
BTN AcKk | UTG r60, CO s
```
puis, après ta décision :
```
UTG s
+Kc7t2k pot 450 | UTG x
```

## Mise en ligne sur Netlify

- **Depuis GitHub (recommandé)** : sur Netlify, « Add new project → Import an existing project → GitHub », choisir ce dépôt. Il n'y a pas de commande de build, et le dossier publié est `.` (déjà réglé dans `netlify.toml`). Ensuite, chaque modification poussée sur GitHub est mise en ligne automatiquement.
- **Glisser-déposer** : glisser le dossier sur https://app.netlify.com/drop.

## Modifier le code

| Fichier | Contenu |
|---|---|
| `engine.js` | Règles de la partie : positions, ordre de parole, mises, pots annexes, texte des messages et du prompt (`buildPrompt`, `buildMessage`) |
| `hands.js` | Les combinaisons du poker et le calcul de « ta main » |
| `app.js` | Les écrans, les boutons et les raccourcis clavier |
| `style.css` | L'apparence (couleurs en haut du fichier, affichage PC à la fin) |
| `index.html` | La page qui charge le tout |
| `tests/` | Tests : `node tests/engine.test.js`, `node tests/hands.test.js` et `node tests/messages.fuzz.test.js` (des milliers de mains au hasard pour vérifier les messages) |

Pour essayer en local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

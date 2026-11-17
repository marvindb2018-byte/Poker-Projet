# Poker → Claude

Petite appli web pour suivre une partie de Texas Hold'em No Limit entre amis et générer, à chaque décision, le message à envoyer à Claude.
Elle est faite en HTML, CSS et JavaScript, sans dépendance ni compilation. Tout est enregistré dans le navigateur du téléphone : rien n'est envoyé sur Internet.

## Utilisation

**Au départ (une fois)**
1. « Nouvelle partie » : nombre de joueurs, blindes, prénoms dans l'ordre des places, jetons de chacun, ta place et le bouton de la première main.
2. « Copier le prompt », puis le coller dans une nouvelle conversation Claude.

**À chaque main**
1. « Distribuer la main » : le bouton et les positions sont calculés tout seuls.
2. Choisir tes 2 cartes (la valeur, puis la couleur).
3. L'appli affiche qui doit parler : toucher ce qu'il fait (Couché, Suit, Relance…, Tapis). « Check / couché jusqu'à moi » fait gagner du temps.
4. Quand c'est à toi, le message est déjà copié : le coller dans Claude, puis toucher ce que tu joues.
5. Au flop, à la turn et à la river, choisir les cartes du tableau. Le pot et les tapis se calculent tout seuls.
6. En fin de main, toucher le gagnant (plusieurs = partage), puis « Main suivante ».

**Entre deux mains** : l'onglet Table sert quand un joueur arrive, part, se met en pause ou recave, ou pour déplacer le bouton.
**En cas d'erreur** : « ↶ Annuler » revient en arrière d'une action.

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
| `app.js` | Les écrans et les boutons |
| `style.css` | L'apparence (couleurs en haut du fichier) |
| `index.html` | La page qui charge le tout |
| `tests/engine.test.js` | Tests du moteur : `node tests/engine.test.js` |

Pour essayer en local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

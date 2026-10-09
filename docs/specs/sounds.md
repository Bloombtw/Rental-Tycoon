# Sons d'ambiance

Statut : approuvé (révision 1). Point prioritaire demandé par le propriétaire.

## Fichiers (`apps/web/public/assets/audio/`, mis en cache par le service worker)

| Fichier             | Usage                        | Volume |
| ------------------- | ---------------------------- | ------ |
| `music-theme.mp3`   | Musique de fond, en boucle   | 0,35   |
| `city-ambience.mp3` | Ambiance de ville, en boucle | 0,25   |
| `cash.mp3`          | À chaque location encaissée  | 0,6    |

## Règles

- Module `apps/web/src/game/audio.ts` (jamais dans la sim) ; URLs préfixées par `import.meta.env.BASE_URL`.
- Rien ne joue avant le premier geste (tap, clic, touche) : l'audio est déverrouillé à ce moment (exigence iOS).
- Musique et ambiance : éléments `<audio>` en boucle passés par des gains Web Audio (iOS ignore `volume` sur les éléments). `cash.mp3` : buffer décodé, lectures superposables sans latence.
- `cash.mp3` : au plus une lecture toutes les 120 ms (à x10, beaucoup de locations tombent ensemble). Seulement en jeu actif (mêmes départs que les « +X € »).
- Bouton son dans le HUD (coin de la caisse) : activé par défaut ; le choix est mémorisé (`localStorage`, try/catch).
- Onglet caché : musique, ambiance et contexte audio en pause ; reprise au retour.
- Fichier manquant, audio bloqué ou Web Audio absent : le jeu continue sans son, sans erreur visible. Aucun `AudioContext` n'est créé dans jsdom.

## Hors périmètre

Vibrations : non faites (Safari iOS ne permet pas `navigator.vibrate`).

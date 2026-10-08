# Questions ouvertes

Les questions qui demandent une décision humaine. Le travail ne bloque pas dessus : chaque entrée donne la recommandation appliquée en attendant.

## agency-view (révision 6, scène 3D Three.js)

1. **Retirer `pixi.js` de `apps/web/package.json` (et du lockfile).** Le manifeste et le lockfile sont protégés, donc la décision revient à un humain. À la fin de la feature, plus aucun fichier de `apps/web/src` n'importe `pixi.js`.
   _Recommandation_ : le retirer dès que la scène Three.js est fusionnée (`npm uninstall pixi.js -w @rt/web`).

2. **Angle de caméra : azimut 30° ou iso « pur » à 45° ?** La spec fixe 30° (élévation 45°) pour mieux occuper un écran portrait ; à 45°, le parking s'élargit et les voitures rapetissent à la vue d'ensemble.
   _Recommandation_ : garder 30°. Ce sont deux constantes de `scene/iso.ts`, faciles à changer après avoir vu les captures.

3. **Mesure de performance sur un vrai iPhone.** Le critère « 30 fps minimum avec 50 voitures » est vérifié en émulation (CPU ralenti 4×). Les agents n'ont pas d'iPhone physique.
   _Recommandation_ : accepter l'émulation pour fusionner, puis faire vérifier par un humain sur iPhone (PWA installée) avant « Ville et vie 3D », qui ajoutera de la charge.

## city-life (révision 1, ville et vie 3D)

1. **Ajouter un kit de personnages (Kenney, CC0) pour les piétons et les clients.** Aucun kit actuel n'a de personnages, et une gélule sans membres serait refusée comme « programmer art ». Les agents ne peuvent pas télécharger d'assets.
   _Recommandation_ : qu'un humain ajoute un kit de personnages Kenney (par ex. « Mini Characters ») dans `apps/web/public/assets/characters/`, avec son `LICENSE.txt`, avant la Phase 2, point 5. En attendant, les piétons d'ambiance sont reportés.

2. **Vitesse de nos voitures et de la circulation.** Nos voitures roulent sur le temps de jeu (un trajet de 60 minutes de jeu dure 2,4 s à x1). La circulation de fond roule sur un « temps d'ambiance » adouci (×1 à ×3). Les nôtres vont donc nettement plus vite que les taxis.
   _Recommandation_ : garder ce choix (nos voitures « foncent » vers leurs clients et l'écran reste lisible à x10), et le revoir sur iPhone après les captures.

3. **Arrêt aux feux rouges.** Les feux sont décoratifs et personne ne s'y arrête (pas de cycle de couleur animé). Faire arrêter les voitures demande des files d'attente, ce qui a un coût moyen.
   _Recommandation_ : ne pas le faire maintenant ; à reconsidérer si un joueur le remarque.

4. **Mesure sur un vrai iPhone (suite de la question 3 d'`agency-view`).** Le budget de 250 draw calls et 1 M de triangles, le palier de qualité automatique et le seuil de 30 fps sont vérifiés en émulation.
   _Recommandation_ : fusionner sur la base de l'émulation, puis faire relever par un humain `data-quality`, `data-draw-calls` et le ressenti sur iPhone (PWA installée, à 20:30 avec beaucoup de voitures) avant la Phase 1.

## city-life (révision 2, constats après implémentation)

5. **Orientation des bandes du passage piéton (`road-crossing`).** La tuile est posée avec le même quart de tour que la route droite ; les captures ne permettent pas de trancher si les bandes sont dans le bon sens.
   _Recommandation_ : regarder au zoom maximal sur iPhone ; si c'est faux, c'est une valeur de `ASSET_TURN_OFFSET` dans `scene/assets.ts`.

6. **Position des halos de l'enseigne « LOCATION ».** Placés à l'estime.
   _Recommandation_ : vérifier à 20:30 sur un appareil.

7. **Couleur du sol.** L'asphalte et la dalle paraissent bleu marine foncé à toute heure (couleur existante `palette.lot`, 0x3d405b).
   _Recommandation_ : la garder pour l'instant (cohérente avec la palette) ; l'éclaircir si le rendu paraît terne sur iPhone.

8. **Flotte de 50 voitures non mesurée.** La caisse de départ ne permet d'acheter qu'une douzaine de voitures : draw calls et fps à 50 voitures restent à relever.
   _Recommandation_ : relever lors du test iPhone (question 4), une fois la sauvegarde disponible pour préparer une partie avancée.

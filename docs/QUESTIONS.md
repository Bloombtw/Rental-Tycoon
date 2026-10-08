# Questions ouvertes

Les questions qui demandent une décision humaine. Le travail ne bloque pas dessus : chaque entrée donne la recommandation appliquée en attendant.

## agency-view (révision 6, scène 3D Three.js)

1. **Retirer `pixi.js` de `apps/web/package.json` (et du lockfile).** Le manifeste et le lockfile sont protégés, donc la décision revient à un humain. À la fin de la feature, plus aucun fichier de `apps/web/src` n'importe `pixi.js`.
   _Recommandation_ : le retirer dès que la scène Three.js est fusionnée (`npm uninstall pixi.js -w @rt/web`).

2. **Angle de caméra : azimut 30° ou iso « pur » à 45° ?** La spec fixe 30° (élévation 45°) pour mieux occuper un écran portrait ; à 45°, le parking s'élargit et les voitures rapetissent à la vue d'ensemble.
   _Recommandation_ : garder 30°. Ce sont deux constantes de `scene/iso.ts`, faciles à changer après avoir vu les captures.

3. **Mesure de performance sur un vrai iPhone.** Le critère « 30 fps minimum avec 50 voitures » est vérifié en émulation (CPU ralenti 4×). Les agents n'ont pas d'iPhone physique.
   _Recommandation_ : accepter l'émulation pour fusionner, puis faire vérifier par un humain sur iPhone (PWA installée) avant « Ville et vie 3D », qui ajoutera de la charge.

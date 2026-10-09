# Refonte de l'interface (UI de tycoon mobile)

Statut : **approuvé par le designer** (révision 1), prêt à implémenter. ROADMAP, Phase 0, « Refonte de l'interface (PRIORITAIRE) » + section ⭐ « UI au niveau ».
Prérequis : `first-playable.md`, `agency-view.md` (rév. 6), `city-life.md`, `autosave.md`.
Périmètre : **`apps/web` uniquement**. Refonte visuelle : aucun changement de sim, de serveur, de règles ni de textes français (sauf exceptions listées en décision 6). Les `data-testid`, rôles ARIA et noms accessibles existants sont conservés.

## Historique des décisions

Choix du designer en révision 1 (option la plus raisonnable pour un tycoon mobile, révocables) :

1. **Scène plein écran, UI flottante.** La scène 3D occupe tout l'écran ; le HUD, les bannières, le bouton de recentrage et la feuille « Gérer l'agence » flottent par-dessus. C'est ce qui fait « tycoon mobile » et ce qui donne un sens au verre dépoli. Pour ne rien cacher, `AgencyView` reçoit les **marges masquées** (`insets`) mesurées sur le HUD et la feuille : la vue d'ensemble se cadre dans la zone libre, comme aujourd'hui quand la scène rétrécit.
2. **Verre dépoli selon le palier de qualité.** `backdrop-filter` sur un canvas WebGL qui se redessine à chaque image coûte cher sur iPhone. Flou 14 px en `high`, 8 px en `medium`, **aucun flou en `low`** (fond opaque à 92 %). Le palier vient de la scène (`onQualityChange`) et est posé en `data-quality` sur `.app`. Au plus 3 surfaces floutées en même temps (HUD, feuille, une bannière ou l'infobulle). Fond flouté du dialogue : seulement en `high`.
3. **Vignettes 3D rendues par la scène existante**, pas par un second contexte WebGL : même renderer, même cache de `.glb`, et le test de frontières (`three` importé seulement par `AgencyScene3D.ts` et `scene/gl/*`) reste vrai. Rendu une fois par session, gardé en mémoire (pas de `localStorage` : 3 images de ~15 Ko se rendent en moins de 50 ms, et elles ne vieillissent jamais quand les assets changent).
4. **Repli des vignettes : une illustration SVG dessinée** (voiture vue de 3/4, vitres, roues, reflet), teintée par modèle. Affichée tant que la scène charge, si WebGL manque, ou si le rendu échoue. Fondu enchaîné vers l'image 3D quand elle arrive.
5. **Pas de webfont.** Pile système avec `ui-rounded` (SF Pro Rounded sur iPhone, la plateforme cible) pour les titres et chiffres, `system-ui` pour le texte. Hors ligne garanti, zéro octet. Une police auto-hébergée est une question humaine (`QUESTIONS.md`).
6. **Textes inchangés, sauf :** les boutons « Fermer » des bannières deviennent des boutons icône (croix) avec `aria-label="Fermer"` (même nom accessible) ; le symbole « ⌖ » et les chevrons « ▾/▴ » deviennent des icônes SVG. Tout autre libellé reste identique au caractère près (« Reprendre », « Pause », « x1 », « Acheter », « Appliquer », « OK »…).
7. **Compteur de caisse** : le chiffre visible s'anime (aria-hidden), le texte exact reste dans l'élément `data-testid="hud-cash"` (visuellement masqué, lu par les lecteurs d'écran et les tests). Les « +90 € » flottants au-dessus des voitures et les pièces qui volent restent pour la Phase 2, point 4.
8. **L'état pressé reste actif en mouvement réduit** (enfoncement de 3 px sans durée : c'est un retour tactile, pas une animation).

Questions ouvertes : `docs/QUESTIONS.md`, section « ui-overhaul ».

## 1. Fantasy

J'ouvre l'appli et la ville occupe tout mon écran ; par-dessus, des boutons dodus qui s'enfoncent sous mon pouce, un compteur de caisse qui défile en vert quand l'argent rentre, et des cartes où ma future berline tourne déjà en 3D : on dirait un vrai jeu de l'App Store.

## 2. Rules

### 2.1 Mise en page (390 × 844 portrait d'abord)

| Zone                     | Position                                                                                                                                                              | Taille                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Scène                    | `position: absolute; inset: 0` sous tout le reste                                                                                                                     | plein écran                                             |
| HUD                      | flottant en haut, marge `8px` + `env(safe-area-inset-top)`, gauche/droite `8px` + safe areas                                                                          | hauteur ≤ 128 px (hors safe area)                       |
| Pile de bannières        | sous le HUD, même marges, empilées (gap 8 px)                                                                                                                         | chaque bannière ≥ 52 px                                 |
| Bouton recentrer         | rond, en bas à gauche de la zone libre (16 px au-dessus de la feuille)                                                                                                | 48 × 48                                                 |
| Feuille                  | flottante en bas, coins haut `--radius-xl`, `padding-bottom: env(safe-area-inset-bottom)`                                                                             | repliée : poignée 64 px ; ouverte : `max-height: 58dvh` |
| Desktop ≥ 900 px paysage | HUD pleine largeur en haut (max 1100 px, centré) ; la feuille devient un panneau flottant à droite, 380 px, marge 12 px, pleine hauteur sous le HUD ; repliée : 72 px | —                                                       |

Marges masquées (`ObscuredInsets` en px) : `top` = bas du HUD + bannières visibles + 8 ; `bottom` = hauteur de la feuille (+ 8) sur téléphone ; `right` = largeur du panneau (+ 12) sur desktop. Mesurées par `ResizeObserver`, valeurs non finies ou négatives = 0, chacune bornée à 70 % de la dimension de la vue (au moins 30 % de scène libre). Le cadrage automatique (`fitCamera`) se fait dans le rectangle libre ; le défilement, le pincement et le tap restent calculés sur le canvas entier (le tap reste exact). L'infobulle se borne au rectangle libre.

### 2.2 Inventaire et nouveau look

| #   | Élément (fichier)                                | Aujourd'hui                              | Nouveau look                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HUD (`Hud.tsx`)                                  | bandeau sombre plein, coins bas arrondis | carte flottante en verre sombre (`--glass-dark`), `--radius-lg`, `--elev-3`, liseré `--c-glass-border`, reflet haut (`--g-sheen`). Ligne 1 : pastille horloge, pastille caisse. Ligne 2 : vitesses. Ligne 3 : bilan.                                                                                                                                                                                                                                                                                         |
| 2   | Horloge                                          | texte gras                               | pastille `--radius-pill` : icône `sun` (09:00–17:59), `sunset` (18:00–19:59), `moon` (20:00–21:00) + « Jour 1 · 15:01 » en `--font-display`, chiffres tabulaires. Sous le texte, **barre de progression de la journée** (3 px, `minute / DAY_MINUTES`, dégradé `--g-day`).                                                                                                                                                                                                                                   |
| 3   | Caisse                                           | « Caisse 4 510,00 € » vert               | pastille à dégradé `--g-money-dark`, icône `coin` 24 px dorée, montant animé `--fs-num` noir 900. Le mot « Caisse » devient l'`aria-label` du groupe et un libellé 11 px au-dessus du montant. Négatif : dégradé `--g-danger`. Hausse : pulse (`scale 1.06`, lueur verte) ; baisse : pulse rouge ; au plus 1 pulse / 600 ms.                                                                                                                                                                                 |
| 4   | Pause / Reprendre (`SpeedControls.tsx`)          | bouton plat texte                        | bouton `primary` (orange, relief) 52 px de haut, icône `play` (« Reprendre ») ou `pause` (« Pause ») + texte. `data-highlight="true"` : halo pulsé (pseudo-élément, opacité seulement).                                                                                                                                                                                                                                                                                                                      |
| 5   | x1 / x2 / x4 / x10                               | 4 boutons séparés                        | **contrôle segmenté** dans une gouttière creuse (`--c-glass-well`, ombre interne), 4 segments ≥ 44 × 44, un « pouce » orange en relief qui **glisse** sous le segment actif (`--dur-base`, `--ease-spring`). Icône `speed` 16 px devant « x1 » seulement sur ≥ 360 px de large.                                                                                                                                                                                                                              |
| 6   | Bilan (`Report` dans `Hud.tsx`)                  | ligne 12,8 px orange                     | ligne 12 px, `--c-on-glass-muted` ; montant du résultat coloré (`--c-money-on-dark` / `--c-danger-on-dark`) précédé d'une icône `trend-up` / `trend-down` ; « Aujourd'hui : +… » dans une mini-pastille verte qui pulse quand la valeur change. Texte identique, retour à la ligne permis.                                                                                                                                                                                                                   |
| 7   | Bannière message (`MessageBanner.tsx`)           | bloc vert/rouge pleine largeur           | **toast** flottant `--radius-lg` : notice = dégradé `--g-money`, icône `check-circle` ; erreur = dégradé `--g-danger`, icône `alert`, secousse une fois. Bouton croix rond 44 × 44 (verre clair). Entrée : glisse du haut + fondu (`--dur-base`, `--ease-spring`).                                                                                                                                                                                                                                           |
| 8   | Avertissement sauvegarde (`SaveWarning.tsx`)     | bande sable                              | toast ambre (`--g-gold`), icône `alert`, bouton « OK » `secondary` 44 × 44, même entrée que 7.                                                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | Toast nouveau jour (`DayBanner.tsx`)             | pilule sombre                            | pilule verre sombre centrée sous le HUD, icône `sun`, texte `--font-display` ; **barre de temps restant** au bas qui se vide en `dayBannerDurationMs(speed)` (animation `scaleX`). Entrée : tombe + rebond léger.                                                                                                                                                                                                                                                                                            |
| 10  | Chargement (`AgencyView.tsx`)                    | texte gris                               | carte verre clair centrée : icône `car` qui roule (translation en boucle), texte inchangé, **barre de progression** alimentée par le même pourcentage.                                                                                                                                                                                                                                                                                                                                                       |
| 11  | Repli scène (`AgencyFallback`)                   | texte gris                               | carte claire centrée, illustration SVG de voiture (repli des vignettes), texte inchangé.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 12  | Recentrer (`camera-reset`)                       | carré orange « ⌖ »                       | bouton rond verre sombre 48 px, icône `recenter` blanche, relief ; position 2.1.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | Infobulle voiture (`CarTooltip.tsx`)             | carte blanche                            | carte verre clair `--radius-lg`, `--elev-3` ; vignette `sm` à gauche (48 × 36), titre gras, statut précédé d'une pastille colorée (vert louée / gris au parking), prix avec icône `tag`. Apparition `scale 0.9→1` + fondu `--dur-fast`. Taille réservée inchangée (220 × 84 mini).                                                                                                                                                                                                                           |
| 14  | Feuille (`ManageDrawer.tsx`)                     | fond sable, ombre dure                   | verre clair (`--glass-light`), `--elev-3`. Poignée : barre grise 40 × 5 centrée en haut ; ligne titre : icône `fleet` + « Gérer l'agence · Flotte 6/50 » + **mini barre** de remplissage 6/50 + chevron SVG qui **pivote** de 180° (`--dur-base`). Ouverture : le contenu glisse du bas (`--dur-slow`, `--ease-out`).                                                                                                                                                                                        |
| 15  | Panneaux (`.card.panel` : flotte, achat, partie) | cartes blanches, ombre dure 6 px         | cartes `--c-surface`, `--radius-lg`, `--elev-1`. En-tête : icône dans un carré arrondi coloré 32 px (`car` orange, `cart` vert, `settings` gris) + titre `--font-display` 20 px 800. `data-highlight="true"` : liseré orange 3 px + halo pulsé.                                                                                                                                                                                                                                                              |
| 16  | État vide de la flotte                           | texte gris                               | illustration de place de parking vide (icône `parking` 40 px dans un cercle pointillé) + texte inchangé centré.                                                                                                                                                                                                                                                                                                                                                                                              |
| 17  | Ligne voiture (`CarRow.tsx`)                     | bloc sable                               | sous-carte `--c-surface-2`, `--radius`. Vignette `sm` 64 × 48 à gauche ; titre à droite ; badge statut avec icône (`key` « Louée » vert, `parking` « Au parking » gris) qui fait un pop quand il change ; chips « Prix : … » (icône `tag`) et « Coût : … » (icône `wrench`), le chip prix pulse quand la valeur change. Entrée d'une nouvelle ligne : glisse + fondu.                                                                                                                                        |
| 18  | Éditeur de prix (`PriceEditor.tsx`)              | label + champ + bouton                   | label 13 px au-dessus ; champ pilule 48 px de haut, suffixe « € » non éditable dans le champ, focus = anneau `--c-focus` ; « Appliquer » bouton `secondary` à droite. Erreur : champ bordé rouge + **secousse** 300 ms + message avec icône `alert`.                                                                                                                                                                                                                                                         |
| 19  | Carte modèle (`BuyCarPanel.tsx`)                 | bloc sable texte                         | sous-carte : en haut, **vignette `md`** (pleine largeur de la carte, ratio 4:3, max 200 px de haut) posée sur un « podium » (dégradé radial `--g-podium` + ombre de contact elliptique) ; nom `--font-display` ; 3 lignes à icônes (`tag` prix d'achat, `wrench` coût/jour, `sparkle` prix conseillé) ; bouton « Acheter » `money` pleine largeur, icône `cart`. Refus : bouton désactivé (gris plat, sans relief) + ligne refus avec icône `lock`. Sur ≥ 900 px : vignette à gauche 120 px, infos à droite. |
| 20  | Section Partie (`NewGameButton.tsx`)             | bouton liseré rouge                      | bouton `danger-quiet` (blanc, liseré rouge, relief rouge clair), icône `restart`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 21  | Dialogue (`NewGameDialog.tsx`)                   | carte blanche, fond noir 55 %            | fond `--c-scrim` (flou 6 px en `high` seulement) ; carte `--radius-xl`, `--elev-3`, entrée `scale 0.92→1` + fondu (`--dur-base`, `--ease-spring`) ; pastille ronde rouge 56 px avec icône `restart` au-dessus du titre ; boutons `secondary` « Annuler » et `danger` « Recommencer », 52 px.                                                                                                                                                                                                                 |
| 22  | Erreur globale (`ErrorBoundary.tsx`)             | texte rouge                              | carte claire centrée sur fond `--c-sand`, icône `alert` 48 px dans un cercle rouge pâle, titre et texte inchangés.                                                                                                                                                                                                                                                                                                                                                                                           |
| 23  | Boutons (`.btn` partout)                         | aplat orange, ombre dure                 | voir 2.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 24  | Focus clavier, barre de défilement de la feuille | contour beige, barre système             | anneau `--c-focus` 3 px décalé de 2 px sur tout élément focusable ; barre de défilement fine (6 px, `--c-ink-muted` à 40 %).                                                                                                                                                                                                                                                                                                                                                                                 |
| 25  | `index.html` : `theme-color`                     | —                                        | `theme-color` = couleur de `--c-asphalt` (barre de statut iOS cohérente avec le verre sombre).                                                                                                                                                                                                                                                                                                                                                                                                               |

### 2.3 Design tokens (tous dans `tokens.css`)

Les tokens existants **restent** (la scène lit `--c-grass`, `--c-road`, `--c-on-dark`, `--c-money-on-dark`, `--c-accent`). `--font` est remplacé par `--font-body`. Valeurs indicatives, à ajuster aux captures (contrastes AA à conserver : texte normal ≥ 4,5:1).

| Famille           | Tokens                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rampes couleur    | `--c-primary-300 #f6a488`, `--c-primary-500` (= `--c-accent` #e07a5f), `--c-primary-700 #b4553c` ; `--c-money-300 #7be08a`, `--c-money-500` (= #3fa34d), `--c-money-700` (= `--c-money-strong`) ; `--c-danger-300 #ff6b78`, `--c-danger-500` (= #d62839), `--c-danger-700 #9e1a28` ; `--c-gold-300 #ffd76a`, `--c-gold-500 #f2b02c`, `--c-gold-700 #b97a0c` ; `--c-neutral-100 #f7f5ec`, `--c-neutral-300 #d9d6c8`, `--c-neutral-500 #8a8ca0` |
| Surfaces          | `--c-surface-2 #f7f5ec` ; `--c-scrim rgb(15 16 28 / 0.55)` ; `--c-focus #ffd76a` ; `--c-on-glass #ffffff` ; `--c-on-glass-muted rgb(255 255 255 / 0.72)` ; `--c-glass-border rgb(255 255 255 / 0.18)` ; `--c-glass-well rgb(0 0 0 / 0.28)` ; modèles (repli SVG) `--c-model-used #8d99a6`, `--c-model-compact #4f9fe0`, `--c-model-hybrid #3dbb8c`                                                                                            |
| Verre             | `--glass-dark rgb(27 29 46 / 0.62)`, `--glass-dark-opaque rgb(27 29 46 / 0.92)`, `--glass-light rgb(250 248 240 / 0.78)`, `--glass-light-opaque rgb(250 248 240 / 0.96)`, `--glass-blur 14px` (8px si `[data-quality="medium"]`, 0 si `low`), `--glass-saturate 160%`                                                                                                                                                                         |
| Dégradés          | `--g-primary` (300→500, 180°), `--g-money` (300→500), `--g-money-dark` (money-700 → asphalt), `--g-danger` (300→500), `--g-gold` (300→500), `--g-neutral` (surface → neutral-100), `--g-sheen` (blanc 22 % → 0 sur la moitié haute), `--g-day` (gold-300 → primary-500 → bleu nuit), `--g-podium` (radial, neutral-100 → transparent)                                                                                                         |
| Rayons            | `--radius-xs 6px`, `--radius-sm 10px`, `--radius 14px` (inchangé), `--radius-lg 20px`, `--radius-xl 28px`, `--radius-pill 999px`                                                                                                                                                                                                                                                                                                              |
| Élévations        | `--elev-1` (0 1px 2px / 12 % + 0 2px 8px / 8 %), `--elev-2` (0 4px 12px / 16 %), `--elev-3` (0 12px 32px / 24 %) ; relief des boutons `--lip-primary 0 4px 0 var(--c-primary-700)`, `--lip-money`, `--lip-danger`, `--lip-neutral` (même forme) ; `--inset-highlight inset 0 1px 0 rgb(255 255 255 / 0.45)` ; `--inset-well inset 0 2px 4px rgb(0 0 0 / 0.35)`                                                                                |
| Mouvement         | `--dur-instant 80ms`, `--dur-fast 140ms`, `--dur-base 220ms`, `--dur-slow 360ms`, `--dur-counter 450ms` ; `--ease-out cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out cubic-bezier(0.65, 0, 0.35, 1)`, `--ease-spring cubic-bezier(0.34, 1.56, 0.64, 1)` ; `--transition` gardé (= `var(--dur-fast) var(--ease-out)`)                                                                                                                         |
| Typo              | `--font-display: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` ; `--font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` ; `--fw-bold 700`, `--fw-heavy 800`, `--fw-black 900` ; `--fs-xs 12px`, `--fs-sm 14px`, `--fs-md 16px`, `--fs-lg 20px`, `--fs-xl 24px`, `--fs-num 22px` ; `--ts-on-dark 0 1px 0 rgb(0 0 0 / 0.35)`       |
| Tailles / couches | `--tap 44px`, `--tap-lg 52px`, `--hud-margin 8px` ; `--z-fab 2`, `--z-tooltip 3`, `--z-hud 5`, `--z-toast 6`, `--z-sheet 7`, `--z-dialog 20`                                                                                                                                                                                                                                                                                                  |

Règles : aucun hex hors de `tokens.css` (test existant). Chiffres de caisse, horloge et prix : `font-variant-numeric: tabular-nums`. Corps de texte 16 px minimum dans les champs (évite le zoom auto d'iOS).

### 2.4 Boutons (classe `.btn` + composant `Button`)

| Variante           | Fond                                 | Texte                                                 | Relief                |
| ------------------ | ------------------------------------ | ----------------------------------------------------- | --------------------- |
| `primary` (défaut) | `--g-primary` + `--g-sheen`          | `--c-ink` (contraste AA ; le blanc sur orange échoue) | `--lip-primary`       |
| `money`            | `--g-money`                          | `--c-ink`                                             | `--lip-money`         |
| `danger`           | `--g-danger`                         | `--c-on-dark` (sur `--c-danger-500`)                  | `--lip-danger`        |
| `danger-quiet`     | `--c-surface`                        | `--c-danger-text`, liseré 2 px `--c-danger-500`       | `--lip-danger` à 40 % |
| `secondary`        | `--g-neutral`                        | `--c-ink`                                             | `--lip-neutral`       |
| `glass`            | `--glass-dark` (+ flou selon palier) | `--c-on-glass`                                        | `--elev-2`            |

Tailles : `md` (44 px de haut, rayon `--radius`), `lg` (52 px, rayon `--radius-lg`), `icon` (44 × 44 ou 48 × 48, rond). Texte `--font-display` 800. Toujours `--inset-highlight`.
États : **pressé** (`:active`, ou `data-pressed` posé au `pointerdown` pour iOS qui n'applique pas `:active` sans écouteur `touchstart`) : `translateY(3px)`, relief réduit à 1 px, luminosité −4 %, `--dur-instant`. Relâché : retour avec `--ease-spring` en `--dur-fast`. **Pas d'effet au survol seul** sauf `@media (hover: hover)` (luminosité +4 %). Désactivé : fond `--c-neutral-300`, texte `--c-ink-muted`, aucun relief, pas de translation, `cursor: not-allowed`.

### 2.5 Icônes (SVG en ligne, aucun fichier ni police)

Module unique `apps/web/src/ui/icons.tsx`. Style commun : `viewBox 0 0 24 24`, trait `currentColor` 2,25 px, bouts et jointures arrondis, remplissage duotone (`currentColor` à 20 % d'opacité) pour le volume ; `coin` et `sparkle` utilisent `--c-gold-*`. Liste `IconName` :

`coin`, `play`, `pause`, `speed`, `sun`, `sunset`, `moon`, `car`, `tag`, `wrench`, `sparkle`, `cart`, `key`, `parking`, `fleet`, `settings`, `restart`, `recenter`, `chevron-up`, `close`, `check-circle`, `alert`, `lock`, `trend-up`, `trend-down`.

Plus l'illustration `CarIllustration` (voiture de 3/4, 160 × 120, teinte via prop) pour le repli des vignettes et de la scène. Icône décorative : `aria-hidden="true"` ; icône seule dans un bouton : nom accessible porté par le bouton (`aria-label`).

### 2.6 Vignettes 3D

- **Clés** : `CarAssetKey` de `scene/assets.ts` (`used`, `compact`, `hybrid` ; `unknown` → repli SVG). Même asset que la scène (`CAR_ASSET`), teinte = première couleur de carrosserie de ce modèle dans la scène.
- **Rendu** : méthode `AgencyScene3D.renderThumbnails` (implémentation dans `scene/gl/thumbnails.ts`). Sur le renderer de la scène, vers un `WebGLRenderTarget` 320 × 240 (affichage 160 × 120 CSS max, ×2), fond transparent, caméra orthographique à l'azimut et l'élévation de la scène (`iso.ts`), voiture cadrée à 8 % de marge, avant tourné vers la gauche ; lumière hémisphère + directionnelle chaude fixe (palette de midi), **sans ombres** ; roues à l'arrêt. Lecture des pixels (Y retourné) dans un canvas 2D → `toDataURL("image/png")`. État du renderer restauré ensuite (cible, viewport, couleur de fond, taille).
- **Quand** : une fois, après la première image de la scène prête, en `requestIdleCallback` (délai max 2 s ; à défaut `setTimeout` 500 ms), jamais pendant un geste. Annulé si la scène est détruite. Si la mémoire contient déjà les vignettes (remontage StrictMode, retour de repli), rien n'est re-rendu.
- **Stockage** : `ui/thumbnailStore.ts`, module sans `three` : état `"pending" | "ready" | "failed"` + `Map<CarAssetKey, string>`. Lu par `useCarThumbnail` (`useSyncExternalStore`).
- **Repli** : `pending` → illustration SVG (fondu vers l'image à l'arrivée, `--dur-base`) ; `failed`, WebGL absent, perte de contexte, ou image qui ne décode pas (`onError`) → illustration SVG définitive. Jamais d'image cassée ni de cadre vide.

### 2.7 Animations

| Déclencheur                                       | Animation                                                                                                                                                 | Durée / courbe                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Caisse change                                     | interpolation du montant affiché (centimes entiers, arrondi), départ de la valeur affichée courante si une nouvelle cible arrive en cours ; pulse couleur | `--dur-counter`, `--ease-out`                  |
| Bouton pressé / relâché                           | enfoncement 3 px / rebond                                                                                                                                 | `--dur-instant` / `--dur-fast` `--ease-spring` |
| Vitesse choisie                                   | pouce du segmenté glisse                                                                                                                                  | `--dur-base` `--ease-spring`                   |
| Pause ↔ Reprendre                                 | icône qui pivote/fond (play ↔ pause)                                                                                                                      | `--dur-fast`                                   |
| Toast / bannière apparaît                         | glisse depuis le haut 16 px + fondu ; erreur : + secousse ±6 px ×3                                                                                        | `--dur-base` `--ease-spring` ; secousse 300 ms |
| Toast nouveau jour                                | barre de temps restant                                                                                                                                    | `dayBannerDurationMs(speed)`, linéaire         |
| Feuille s'ouvre                                   | contenu glisse de 24 px + fondu ; chevron pivote                                                                                                          | `--dur-slow` `--ease-out`                      |
| Nouvelle voiture dans la flotte                   | ligne glisse + fondu                                                                                                                                      | `--dur-base`                                   |
| Badge statut / chip prix / « Aujourd'hui » change | pop `scale 1→1.12→1`                                                                                                                                      | `--dur-base` `--ease-spring`                   |
| Erreur de prix                                    | secousse du champ                                                                                                                                         | 300 ms                                         |
| Infobulle                                         | `scale 0.9→1` + fondu                                                                                                                                     | `--dur-fast`                                   |
| Dialogue                                          | `scale 0.92→1` + fondu ; fond en fondu                                                                                                                    | `--dur-base`                                   |
| Mise en évidence (`data-highlight`)               | halo qui respire (opacité d'un pseudo-élément)                                                                                                            | 1,6 s, en boucle                               |
| Chargement                                        | icône voiture qui roule ; barre de progression                                                                                                            | 0,9 s en boucle ; `--dur-base` par pas         |

Règles : uniquement `transform` et `opacity` (jamais `box-shadow`, `width`, `height`, `filter` animés), au plus 2 animations en boucle visibles à la fois. **`prefers-reduced-motion: reduce`** : plus de translation, d'échelle ni de secousse ; boucles arrêtées (halo fixe) ; compteur de caisse affiché directement à la valeur finale ; pouce et chevron sautent sans transition ; seuls les fondus d'opacité ≤ `--dur-fast` restent ; l'état pressé reste (décision 8). Écouté en direct (`matchMedia` `change`).

### 2.8 Contraintes mobiles

- Conçu pour 390 × 844 portrait ; rien ne déborde horizontalement de 320 à 430 px de large ; HUD sur 3 lignes maximum à 320 px.
- Toutes les cibles ≥ 44 × 44 (y compris segments de vitesse, croix des toasts, poignée de la feuille) ; actions principales 52 px.
- Safe areas : HUD (haut, gauche, droite), feuille (bas, gauche, droite), dialogue (4 côtés), bouton recentrer (gauche).
- Aucune info réservée au survol : l'infobulle s'ouvre au tap (inchangé) ; les motifs de refus sont écrits sous le bouton.
- Performance : coût de l'UI ≤ 2 ms par image en émulation iPhone (CPU ×4) pendant que le temps défile ; flou décidé par palier (décision 2) ; `will-change` posé seulement pendant une animation ; le compteur tourne sur `requestAnimationFrame` et s'arrête à la cible.

## 3. State

Aucun état de sim. État web nouveau, non sauvegardé :

- `QualityTier` courant dans `App` (venu de la scène), posé en `data-quality` sur `.app` ; valeur initiale `initialTier(deviceHints())`.
- `ObscuredInsets { top: number; right: number; bottom: number; left: number }` (px, finis, ≥ 0) mesurées dans `App`.
- `ThumbnailState = { status: "pending" | "ready" | "failed"; images: ReadonlyMap<CarAssetKey, string> }` (module `thumbnailStore`, mémoire seulement).
- Valeur affichée du compteur (`useTweenedCents`, locale au composant).

## 4. Player actions

Aucune action nouvelle ; toutes les actions existantes gardent leurs préconditions, refus et messages. Ce qui change, c'est le retour :

| Action                     | Retour visuel nouveau                                                                                                 | Cas invalides (inchangés, nouveau rendu)                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pause / Reprendre          | enfoncement, icône play ↔ pause                                                                                       | —                                                                                                                   |
| Choisir une vitesse        | pouce qui glisse, segment actif en relief                                                                             | —                                                                                                                   |
| Acheter                    | enfoncement ; toast vert ; caisse qui défile vers le bas + pulse rouge ; nouvelle ligne qui glisse dans « Ma flotte » | fonds insuffisants / flotte complète : bouton gris sans relief + ligne `lock` ; erreur sim : toast rouge qui secoue |
| Appliquer un prix          | enfoncement ; chip prix qui pulse                                                                                     | format ou plage invalide : champ rouge qui secoue + message `alert`                                                 |
| Ouvrir / fermer la feuille | contenu qui glisse, chevron qui pivote                                                                                | —                                                                                                                   |
| Tap sur une voiture        | infobulle qui apparaît avec vignette                                                                                  | tap dans le vide : infobulle fermée (inchangé)                                                                      |
| Recentrer                  | enfoncement ; caméra recadrée dans la zone libre                                                                      | —                                                                                                                   |
| Fermer un toast            | croix enfoncée, toast disparaît en fondu                                                                              | —                                                                                                                   |
| Nouvelle partie            | dialogue qui s'ouvre en zoom                                                                                          | Échap / tap sur le fond / Annuler : inchangé                                                                        |

## 5. UI

Couvert par 2.1 à 2.8. Rendu : section 9.

## 6. Server

Rien.

## 7. Acceptance criteria

1. Sur iPhone 390 × 844, la ville occupe tout l'écran derrière un HUD flottant en verre arrondi et une feuille flottante ; aucun bord de couleur unie ne coupe la scène.
2. Au démarrage (feuille ouverte puis repliée), l'agence et son parking sont entièrement visibles dans la zone libre, jamais cachés sous le HUD ou la feuille ; « Recentrer » redonne ce cadrage.
3. Chaque bouton du jeu a un relief, s'enfonce visiblement sous le doigt et rebondit au relâchement ; un bouton désactivé est plat et gris.
4. Pause, Reprendre, vitesses, caisse, horloge, recentrer, statuts, prix, coûts, achat, nouvelle partie et toasts portent tous une icône SVG dessinée ; il ne reste aucun symbole texte (« ⌖ », « ▾ », « ▴ »).
5. Choisir x4 fait glisser le pouce orange sous « x4 » ; le segment actif reste lisible.
6. Quand une location encaisse ou qu'on achète, le montant de la caisse défile jusqu'à la nouvelle valeur (vers le haut en vert, vers le bas en rouge) et finit exactement sur le montant réel ; une caisse négative est rouge.
7. L'horloge montre un soleil le matin et l'après-midi, un coucher de soleil à 18:00, une lune à 20:00, et une barre qui se remplit au fil de la journée.
8. Chaque carte de modèle montre la vignette 3D de sa voiture (trois voitures différentes, reconnaissables, fond transparent sur podium) une fois la ville chargée.
9. Sans WebGL (ou si le rendu des vignettes échoue), chaque carte montre une illustration de voiture teintée par modèle, jamais une image cassée ni un cadre vide, et le jeu reste jouable.
10. Toucher une voiture affiche une infobulle en verre avec sa vignette, son statut à pastille colorée et son prix.
11. Un message (achat, partie reprise) arrive en toast qui glisse sous le HUD et se ferme par une croix de 44 px ; une erreur arrive en toast rouge qui secoue une fois.
12. Le toast « nouveau jour » montre une barre qui se vide pendant sa durée d'affichage, puis il disparaît.
13. Saisir un prix invalide fait secouer le champ en rouge avec le message habituel ; un prix valide fait pulser le chip « Prix ».
14. Avec « Réduire les animations » activé, plus rien ne glisse, ne rebondit ni ne secoue, la caisse saute directement à sa valeur, et le jeu reste entièrement utilisable.
15. Toutes les cibles tactiles mesurent au moins 44 × 44 px, rien ne déborde horizontalement entre 320 et 430 px de large, et rien n'est caché sous l'encoche ou la barre d'accueil.
16. Sur un appareil de palier `low`, le HUD et la feuille sont opaques (sans flou) et la scène garde ses 30 fps minimum en émulation iPhone pendant que le temps défile.
17. Sur desktop 1280 × 800, la feuille devient un panneau flottant à droite qui ne cache pas l'agence ; repliée, elle ne laisse qu'une colonne de 72 px.
18. Tous les textes français, les messages d'erreur et les comportements des specs précédentes sont inchangés (tests existants verts, noms accessibles identiques).
19. Le jeu fonctionne hors ligne en PWA avec la nouvelle typographie (aucune requête vers une police externe).
20. Captures `screenshots/ui-overhaul/` : avant (UI actuelle, prises avant le changement) et après, en 390 × 844 à 09:00, 15:00 et 20:30, plus feuille ouverte avec cartes de modèles, dialogue « Nouvelle partie », toast d'erreur, et desktop 1280 × 800 ; le `reviewer` compare avant/après.

## 8. Split

**sim-engineer** : rien. **backend-engineer** : rien. **qa-breaker** : après le frontend (test de frontières à garder vert, tween, insets, magasin de vignettes, mouvement réduit, cibles 44 px). Tout le reste : **frontend-engineer**, dans cet ordre (1 bloque le reste ; 2 à 4 indépendants entre eux) :

1. `tokens.css` (2.3) et socle `app.css` : `.btn` et variantes, verre par palier, focus, mouvement réduit global.
2. Modules `ui/` : `icons.tsx`, `Button.tsx`, `tween.ts`, `useReducedMotion.ts`, `AnimatedCents.tsx`, `ProgressBar.tsx`.
3. Vignettes : `scene/gl/thumbnails.ts`, `AgencyScene3D.renderThumbnails`, `ui/thumbnailStore.ts`, `ui/CarThumbnail.tsx`.
4. Mise en page plein écran : `useObscuredInsets`, `fitCameraInRect` (pur, testé), props `insets` et `onQualityChange` d'`AgencyView`.
5. Restyle des composants de l'inventaire 2.2 avec les modules ci-dessus ; captures avant/après.

### Contrat (frontend-engineer)

```ts
// ui/icons.tsx
export type IconName = "coin" | "play" | "pause" | "speed" | "sun" | "sunset" | "moon" | "car" | "tag"
  | "wrench" | "sparkle" | "cart" | "key" | "parking" | "fleet" | "settings" | "restart" | "recenter"
  | "chevron-up" | "close" | "check-circle" | "alert" | "lock" | "trend-up" | "trend-down";
export function Icon(props: { name: IconName; size?: 16 | 20 | 24 | 32 | 40 | 48; className?: string }): JSX.Element; // aria-hidden
export function CarIllustration(props: { tint: "used" | "compact" | "hybrid" | "unknown"; className?: string }): JSX.Element;

// ui/Button.tsx — forwardRef<HTMLButtonElement>, transmet tous les attributs natifs (data-testid, aria-*, onClick, disabled, type)
export type ButtonVariant = "primary" | "money" | "danger" | "danger-quiet" | "secondary" | "glass";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;          // défaut "primary"
  size?: "md" | "lg" | "icon";      // défaut "md" ; "icon" exige aria-label
  icon?: IconName;                  // icône avant le texte
}
// Rendu : <button class="btn btn-{variant} btn-{size}" data-pressed> (classe .btn conservée)

// ui/tween.ts (pur)
export function easeOutCubic(t: number): number;                       // t borné à [0,1]
export function tweenCents(from: Cents, to: Cents, t: number): Cents;  // entier, = to quand t >= 1, robuste aux non-finis (renvoie to)
// ui/useReducedMotion.ts
export function useReducedMotion(): boolean;
// ui/AnimatedCents.tsx — affichage aria-hidden ; le texte exact reste ailleurs (décision 7)
export function AnimatedCents(props: { value: Cents; durationMs?: number; className?: string }): JSX.Element;
// ui/ProgressBar.tsx
export function ProgressBar(props: { value: number; max: number; label: string; tone?: "day" | "money" | "primary"; thin?: boolean }): JSX.Element;
// role="progressbar", aria-valuenow/min/max ; valeurs non finies -> 0 ; borné à [0, max]

// ui/thumbnailStore.ts (sans three)
export type ThumbnailStatus = "pending" | "ready" | "failed";
export function getThumbnailState(): { status: ThumbnailStatus; images: ReadonlyMap<CarAssetKey, string> };
export function publishThumbnails(images: ReadonlyMap<CarAssetKey, string>): void;
export function failThumbnails(): void;
export function subscribeThumbnails(cb: () => void): () => void;
export function useCarThumbnail(model: unknown): { status: ThumbnailStatus; src: string | null; key: CarAssetKey };
// ui/CarThumbnail.tsx
export function CarThumbnail(props: { model: unknown; size: "sm" | "md"; alt: string }): JSX.Element;

// scene/AgencyScene3D.ts (méthode ajoutée)
renderThumbnails(keys: readonly CarAssetKey[], size: { width: number; height: number }): Promise<ReadonlyMap<CarAssetKey, string>>;
// scene/camera.ts (pur)
export function fitCameraInRect(bounds: Rect, view: ScreenRect, insets: ObscuredInsets): Camera;
// cadre dans le rectangle libre, renvoie une caméra exprimée pour la vue entière (setCamera / tap inchangés)

// components/AgencyView.tsx (props ajoutées)
readonly insets: ObscuredInsets;
readonly onQualityChange?: (tier: QualityTier) => void;
// game/useObscuredInsets.ts
export function useObscuredInsets(refs: { hud: RefObject<HTMLElement>; drawer: RefObject<HTMLElement> }): ObscuredInsets;
```

Les composants existants gardent leurs props, `data-testid` et textes ; `Hud` ajoute `data-testid="hud-cash-display"` sur l'`AnimatedCents`, `hud-cash` garde le texte exact (classe `sr-only`). `ManageDrawer` et `Hud` exposent un `ref` (forwardRef) pour la mesure des insets.

## 9. Rendu

- **Ensemble** : la ville low-poly chaude reste la vedette ; l'UI est un calque de verre sombre (haut) et clair (bas), arrondi, avec des couleurs saturées seulement là où l'on agit (orange = action, vert = argent, rouge = danger, or = caisse/avertissement). Pas d'aplats « programmer art » ni d'ombres dures décalées de l'ancienne version.
- **09:00** : verre sombre du HUD lisible sur ciel clair ; icône soleil ; barre de journée presque vide. **15:00** : mêmes contrastes, caisse en défilement visible sur une capture prise juste après un encaissement. **20:30** : la scène s'assombrit, l'UI reste identique (le verre sombre s'y fond, le blanc des textes garde son contraste) ; icône lune ; la feuille claire ne doit pas éblouir (`--glass-light` à 78 %, pas de blanc pur).
- **Vignettes** : trois voitures nettes, même angle que la scène, ombre de contact CSS sous chacune, podium discret ; elles doivent être lisibles à 64 × 48 dans la flotte.
- **Typo** : titres et chiffres arrondis et épais (SF Pro Rounded sur iPhone), ombre de texte légère sur verre sombre.
- **Captures** (`/shot`, `screenshots/ui-overhaul/`) : `before-0900.png`, `before-1500.png`, `before-2030.png`, `before-desktop.png` (UI actuelle), puis `after-0900.png`, `after-1500.png`, `after-2030.png`, `after-drawer-buy.png`, `after-dialog.png`, `after-toast-error.png`, `after-fallback-nowebgl.png`, `after-desktop-1280x800.png`.

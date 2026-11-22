# presentation-workspace — Spec MVP

Extension GNOME Shell pour **celles et ceux qui projettent leur écran**, en présentation
ou dans l'enseignement. Elle complète le **mode étendu** de GNOME : l'écran étendu est
l'écran projeté, et il est répliqué sur le **bureau 1** de l'écran principal. On a ainsi
l'impression que GNOME ne projette que le bureau 1, les autres restant **privés**. Une
gestion intelligente du curseur et des fenêtres rend l'usage aussi fluide que possible.

- **Statut** : draft
- **Date** : 2026-11-09
- **Cible** : GNOME Shell 50 (NixOS)

> Cette spec est rédigée et itérée **en français**. Le reste du dépôt (code,
> commentaires, commits, README) est **en anglais**.

### Vocabulaire

| Terme                | Définition                                  | Rôle                  |
| -------------------- | ------------------------------------------- | --------------------- |
| **écran principal**  | l'écran principal de GNOME (`primaryIndex`) | privé, porte le panel |
| **écran secondaire** | le **premier écran non principal**          | public, projeté       |

L'extension **ne présuppose rien** sur la nature physique des écrans : en salle,
c'est typiquement laptop = principal et projecteur = secondaire, mais seul le choix
d'écran principal fait dans GNOME compte.

---

## 0. Principe directeur — KISS

**Peu de réglages, peu de code, aucune dépendance.** Cette section est la
constitution du projet : en cas de doute entre une fonctionnalité et la simplicité,
c'est la simplicité qui gagne.

- **Le shell fait déjà presque tout.** Le mode étendu, les espaces de travail sur
  l'écran principal uniquement, le déplacement de fenêtres entre écrans, la
  résolution de chaque écran : tout cela est natif. L'extension ne fait que
  **combler le trou** — le retour sur l'écran principal.
- **Pas de capture vidéo.** Ni PipeWire, ni screencast, ni encodage : le retour est
  un clone du graphe de scène, rendu par le compositeur lui-même.
- **Chaque fonctionnalité se paie en maintenance.** Toute API GNOME privée utilisée
  (§5) devra être réparée à chaque version du shell : le §3 (non-objectifs) est ce
  qui protège l'extension du temps qui passe.

---

## 1. Besoin

Contexte : formation en salle, un laptop branché à un projecteur **en mode étendu**
(« joined »). Le projecteur est **derrière le formateur** : il ne le voit pas.

Le workflow actuel, à reproduire :

- **L'écran secondaire est la scène.** Ce qui s'y trouve est projeté. Une fenêtre à
  montrer y est glissée, puis ramenée sur l'écran principal quand c'est fini.
- **Le bureau 1 de l'écran principal est le retour.** Aujourd'hui une fenêtre
  « projecteur » d'OBS y affiche en permanence une copie de l'écran secondaire,
  pour voir ce que voit la salle sans se retourner.
- **Les bureaux 2 et suivants sont privés** : notes de présentation, ressources à ne
  pas montrer, messagerie…
- **Passer de l'un à l'autre est pénible** : il faut faire glisser le pointeur
  jusqu'au bord de l'écran (§4.6).

OBS fonctionne mais il est lourd (capture PipeWire, encodage, une appli de plus à
lancer et à configurer à chaque session). L'extension remplace cet usage.

**Le formateur n'est pas toujours en présentation** : le mode s'allume et s'éteint
à la demande, et son état se voit en permanence dans le panel (§4.1).

---

## 2. Prérequis côté GNOME (natifs, non gérés par l'extension)

| Réglage                                       | Valeur attendue | Effet                                           |
| --------------------------------------------- | --------------- | ----------------------------------------------- |
| Mode d'affichage                              | Étendu (joined) | deux écrans distincts                           |
| Écran principal                               | l'écran privé   | le panel et les bureaux vivent dessus           |
| `org.gnome.mutter workspaces-only-on-primary` | `true` (défaut) | l'écran secondaire ne change pas avec le bureau |
| Résolution de l'écran secondaire              | au choix        | réglée dans Paramètres › Écrans                 |

L'extension **ne modifie pas** ces réglages. Si `workspaces-only-on-primary` est à
`false`, le retour reste exact, mais l'écran secondaire change à chaque changement
de bureau : le workflow n'a plus de sens. On le documente dans le README, on ne le
corrige pas.

---

## 3. Non-objectifs (MVP)

- **Interagir à travers le retour.** Le retour est en lecture seule : on ne clique
  pas dedans pour agir sur l'écran secondaire.
- Plus de deux écrans : on prend **le premier écran non principal**, point.
- **Changer la résolution de l'écran secondaire** : c'est le rôle de Paramètres ›
  Écrans (essayé puis retiré : API D-Bus `Mutter.DisplayConfig` lourde et fragile
  pour un réglage que GNOME fait déjà).
- Vignette flottante, picture-in-picture, retour redimensionnable ou déplaçable.
- Choix du bureau qui porte le retour : c'est **toujours le bureau 1**.
- Activation automatique au branchement d'un écran : le bouton reste manuel.
- Minuteur de présentation, notes, pointeur laser, annotations, zoom.
- Masquage de contenu sur l'écran secondaire (fond d'écran neutre, etc.).

---

## 4. UX

### 4.1 Les réglages rapides — allumer, éteindre, voir l'état

- Un **bouton dans le menu des réglages rapides** de GNOME (en haut à droite, avec
  Wi-Fi, Bluetooth, Style sombre, Ne pas déranger…) : un `QuickMenuToggle` de
  largeur normale. Avec la flèche du sous-menu, « Presentation » est légèrement
  tronqué : accepté, c'est le libellé le plus clair. Écartés : la double largeur
  (`colSpan` 2, peu esthétique), un libellé court (« Present », « Presenting »…),
  un texte plus petit que les autres boutons.
  - Clic sur le bouton : allume ou éteint le mode. Grisé sans écran secondaire, avec
    « No secondary screen » en sous-titre.
  - Sa flèche ouvre un sous-menu avec un en-tête et l'entrée **Preferences**.

  ```text
  ┌───────────────────────┐
  │ ▣ Presentation    ›   │  le bouton, à côté de Wi-Fi, Bluetooth…
  └───────────────────────┘
        › ┌──────────────────────────────────────┐
          │ ▣ Presentation mode                  │  en-tête
          │   Workspace 1 mirrors the secondary… │
          ├──────────────────────────────────────┤
          │ Preferences                          │
          └──────────────────────────────────────┘
  ```

- **Un indicateur dans la topbar, seulement mode allumé** : une icône suivie d'un mot,
  **à droite** parmi les icônes système par défaut, ou **au centre**, juste à gauche de
  l'heure (préférence `indicator-position`, deux choix : `Right`, `Center`). Il répond
  à « la salle voit-elle le bureau que je regarde ? » :
  - bureau 1 : écran et `Mirror` en **rouge**, ce bureau est ce que voit la salle ;
  - autre bureau : cadenas et `Private` en **vert**, ce bureau n'est pas répliqué.

  `Private` ne parle que du bureau courant : la salle voit toujours l'écran secondaire
  et les fenêtres qui s'y trouvent. L'icône et le mot changent avec la couleur, pour
  rester lisibles sans distinguer le rouge du vert. Mode éteint, l'extension n'ajoute
  **rien** à la topbar.
- Historique : un bouton dédié dans la topbar, toujours visible, portait d'abord le
  menu. Les réglages rapides sont l'endroit standard d'un interrupteur de ce genre,
  et une icône permanente pour un mode qu'on utilise en formation seulement
  encombrait la topbar.

- **Une fenêtre de préférences** (`prefs.js`, libadwaita), ouverte de deux
  endroits : l'entrée « Preferences » du sous-menu, et le bouton réglages de
  l'application Extensions de GNOME, comme pour toute extension.
- Elle tient en **cinq lignes**, chacune avec une phrase qui dit ce qu'elle fait :
  - **Smart pointer** : la gestion intelligente du curseur (§4.6, §4.9) ;
  - **Smart windows** : la gestion intelligente des fenêtres (§4.6, §4.7, §4.8) ;
  - **Do Not Disturb while presenting** (§4.5) ;
  - **Indicator position** : un bouton à deux états, `Center` (juste à gauche de
    l'heure) à gauche et `Right` à droite, sélectionné par défaut ;
  - **Share window shortcut** : la combinaison du raccourci (§4.4). On clique la ligne
    et on presse la nouvelle combinaison (au moins un modificateur, Retour arrière
    remet `Super+E`, Échap annule).
- Historique : les options ont d'abord vécu dans le menu du bouton, puis une par
  comportement dans cette fenêtre. Six interrupteurs qu'on activait tous n'aidaient
  personne : ils sont regroupés par intention (§6).

- **Non persistant** : à chaque ouverture de session, le mode est éteint.
- **Débrancher l'écran secondaire éteint le mode** (et restaure ce qu'il a
  modifié, §4.5).

Allumer le mode déclenche le retour sur le bureau 1 (§4.2) avec le curseur dans le
retour (§4.3), et, **selon les réglages (§6)** : la coupure des bannières de
notification (§4.5), la gestion du curseur (§4.6, §4.9) et celle des fenêtres (§4.6,
§4.7, §4.8).

### 4.2 Le retour sur le bureau 1

```text
  Écran principal — bureau 1                       Écran secondaire
┌──────────────────────────────────────┐        ┌────────────────────────────┐
│ panel                                │        │                            │
├──────────────────────────────────────┤        │   fenêtre partagée         │
│░░┌──────────────────────────────┐░░░░│        │                            │
│░░│                              │░░░░│ ◄───── │            ●               │
│░░│  copie de l'écran secondaire │░░░░│ clone  │                            │
│░░│  (mise à l'échelle, ratio    │░░░░│        │                            │
│░░│   conservé)        ●         │░░░░│        └────────────────────────────┘
│░░└──────────────────────────────┘░░░░│
└──────────────────────────────────────┘          ● = position du pointeur
  ░ = bandes noires (letterbox)
```

- Le retour occupe **la zone de travail de l'écran principal** (sous le panel),
  mise à l'échelle **avec ratio conservé**, centré, **bandes noires** autour. Cas
  nominal : principal 1920x1200 (16:10), panel ~32 px → zone 1920x1168 ; secondaire
  1920x1080 (16:9) → `s = 1`, bandes noires de 44 px en haut et en bas. Avec un
  secondaire 4:3 ou un principal 16:9, les bandes passent sur les côtés : même
  calcul.
- **Visible seulement sur le bureau 1**, mode allumé, hors vue d'ensemble
  (Activities). Sur tout autre bureau ou dans la vue d'ensemble, il est masqué et
  ne coûte rien.
- Il montre **les fenêtres et le fond d'écran** de l'écran secondaire, en temps
  réel. Il ne montre pas le chrome du shell (panel, menus, OSD) : en mode étendu,
  ceux-ci sont sur l'écran principal de toute façon.
- **Le bureau 1 ne contient que le retour.** Si, à l'allumage, il porte des
  fenêtres, un **bureau vide est inséré à gauche** et devient le bureau 1 : toutes
  les fenêtres glissent d'un bureau vers la droite (même mécanisme que le dépôt d'une
  fenêtre entre deux bureaux dans la vue d'ensemble, `Main.wm.insertWorkspace(0)`).
  Allumé depuis le bureau 1, on reste sur le nouveau bureau 1 (le retour) ; les
  fenêtres sont sur le bureau 2. Allumé depuis un autre bureau, on reste avec ses
  fenêtres (décalées d'un cran).
- Avec des **bureaux statiques**, l'insertion est impossible (`insertWorkspace` ne
  fait rien) : les fenêtres restent cachées sous le retour.
- **Il capte les clics** et ne les transmet à rien.
- **Le bureau 1 est maintenu en vie** tant que le mode est allumé : avec les
  bureaux dynamiques, GNOME supprime un bureau vide qui n'est pas le dernier, ce qui
  décalerait toute la numérotation (§5.3).
- **Il glisse avec le bureau 1** quand on change de bureau. GNOME dessine son animation
  juste au-dessus des fenêtres, donc sous le retour, qui la cacherait. Pendant
  l'animation, le retour est masqué et une copie vivante est posée dans le groupe du
  bureau 1 de GNOME ; elle disparaît avec lui à la fin. **Effet purement visuel, il ne
  doit jamais casser le changement de bureau** : si une méthode interne manque, le
  glissement n'est pas activé ; si la copie échoue, l'erreur va au journal, le retour
  reste affiché et l'animation de GNOME se termine normalement (passage sec).

### 4.3 Le curseur dans le retour

- Quand le pointeur est **sur l'écran secondaire**, une **pastille** (cercle de la
  couleur d'accent, contour clair) est dessinée à sa position dans le retour.
- Quand le pointeur est sur l'écran principal, la pastille est masquée.
- Une pastille plutôt que le vrai sprite du curseur : le retour est réduit, une
  flèche réduite se perd ; une pastille reste visible et coûte trois lignes de CSS
  au lieu d'un `Clutter.Content` maison (cf. `MouseSpriteContent` de la loupe).
- **Toujours active, pas d'option** : sans elle, le retour ne dit pas où est le
  pointeur côté salle, il perd l'essentiel de son intérêt.

### 4.4 Raccourci partager / reprendre

- Un raccourci clavier agit sur **la fenêtre qui a le focus** :
  - elle est sur l'écran principal → envoyée sur l'écran secondaire ;
  - elle est sur l'écran secondaire → ramenée sur l'écran principal, **sur le
    bureau d'où elle était partie**, et activée (on bascule sur ce bureau). On retient
    le **bureau lui-même**, pas son numéro : l'insertion du bureau du retour (§4.2)
    décale tous les numéros. À défaut
    (fenêtre ouverte directement sur l'écran secondaire, bureau disparu), le bureau
    courant — **jamais le bureau 1 quand le mode est allumé** : elle serait cachée
    sous le retour ; elle va alors sur le bureau 2.
- Défaut : **`Super+E`** (« écran » ; `Super+P` est déjà le sélecteur d'affichage
  de GNOME). **Modifiable dans les préférences** (§4.1), clé `share-window`. Pas
  d'interrupteur : inutilisé, il ne gêne pas ; en conflit, on change la touche.
- Actif **dès qu'un écran secondaire est présent**, mode allumé ou non.
- L'état de la fenêtre (maximisée, plein écran) est conservé : c'est le
  comportement natif de `move_to_monitor`.

> GNOME a déjà `Super+Shift+←/→` (« déplacer la fenêtre vers l'écran de
> gauche/droite »). Le raccourci de l'extension n'apporte qu'une chose : **une seule
> touche, sans réfléchir au sens**, quelle que soit la disposition des écrans. C'est
> ~20 lignes ; si ça ne sert pas, c'est la première chose à retirer.

### 4.5 Ne pas déranger

- Allumer le mode met `org.gnome.desktop.notifications show-banners` à `false` —
  exactement ce que fait le toggle natif « Ne pas déranger ».
- Éteindre le mode (ou désactiver l'extension) **restaure la valeur d'origine**,
  pas `true` en dur : si « Ne pas déranger » était déjà actif, il le reste.
- Si l'utilisateur rallume les bannières à la main pendant le mode, on ne lutte
  pas : à l'extinction, on ne touche à rien si la valeur a déjà été remise.
- **Robustesse au crash** : si le shell meurt mode allumé, `show-banners` resterait
  à `false`. L'extension mémorise donc dans son propre schéma qu'elle a coupé les
  bannières (`banners-muted`), et le `enable()` suivant les restaure.

### 4.6 Le curseur et le clavier suivent le bureau 1

Sans extension, passer d'un écran à l'autre oblige à faire glisser le pointeur
jusqu'au bord. Le bureau 1 étant « l'écran secondaire », le pointeur suit les
changements de bureau, mode allumé et réglage `smart-pointer` actif :

| Transition                        | Pointeur avant   | Effet                            |
| --------------------------------- | ---------------- | -------------------------------- |
| autre bureau → bureau 1           | écran principal  | **point du secondaire montré**   |
| autre bureau → bureau 1           | écran secondaire | rien (on garde sa position)      |
| bureau 1 → autre bureau           | écran secondaire | **sa place dans le retour**      |
| bureau 1 → autre bureau           | écran principal  | rien (ex. scroll sur le panel)   |
| bureau privé → autre bureau privé | peu importe      | rien                             |
| allumage du mode sur le bureau 1  | écran principal  | point du secondaire montré       |
| vue d'ensemble ouverte, bureau 1  | écran secondaire | **sa place dans le retour**      |

- **Le curseur garde sa place à l'écran** : le saut suit la correspondance entre
  l'écran secondaire et le retour. Depuis une bande noire, il va au bord le plus proche
  de l'écran secondaire. Le saut passe par la mi-hauteur des écrans, loin des barrières
  (§4.9).
- Indépendant du moyen de changer de bureau : geste trackpad, scroll sur le panel,
  raccourci clavier, vue d'ensemble.
- **Dans la vue d'ensemble, le curseur reste sur l'écran principal** : le retour y est
  masqué, sur l'écran secondaire il serait invisible. Ouverte depuis le bureau 1 avec
  le curseur sur l'écran secondaire, la vue le ramène sur l'écran principal. Aucun saut
  ensuite tant qu'elle est ouverte : il se fait **à la fermeture**. Fermée sur le
  bureau 1, elle compte comme une arrivée : le curseur passe sur l'écran secondaire et
  la pastille le montre dans le retour.
- `Clutter.Seat.warp_pointer` (API publique, utilisée par la loupe).
- Pas de confinement : sur le bureau 1, le pointeur peut toujours revenir sur
  l'écran principal par le bord (pour atteindre le panel) ; il atterrit alors sur
  le retour, qui ne réagit pas aux clics.
- **Le clavier suit aussi, en quittant le bureau 1** (réglage `smart-windows`, car il
  protège ce qu'on tape, même curseur géré par GNOME) : si le focus est resté sur une
  fenêtre de l'écran secondaire, il passe à la dernière fenêtre utilisée du nouveau
  bureau sur l'écran principal. S'il n'y en a aucune, plus aucune fenêtre n'a le focus :
  une frappe ne doit pas partir dans la fenêtre projetée. Décidé après le changement
  de bureau, pour ne pas écraser une fenêtre activée explicitement. Rien dans la vue
  d'ensemble, où le clic choisit la fenêtre.

**Le geste de changement de bureau marche depuis l'écran secondaire**, mode allumé et
réglage `smart-pointer` actif. GNOME ignore un geste qui démarre hors de l'écran
principal quand les bureaux n'existent que sur celui-ci, ce qui bloquerait le geste sur
le bureau 1. Le geste y est traité comme s'il démarrait sur l'écran principal
(`SwipeTracker._beginGesture`, limité au tracker des bureaux).

### 4.7 Le bureau 1 ouvre sur l'écran secondaire

Le bureau 1 *montre* l'écran secondaire : lancer une appli depuis le bureau 1, c'est
vouloir la montrer. Sans extension, la fenêtre s'ouvre sur l'écran principal, cachée
sous le retour.

- Mode allumé et réglage `smart-windows` actif, **une fenêtre qui arrive sur le bureau
  1 de l'écran principal** est envoyée sur l'écran secondaire : nouvelle fenêtre (lanceur, dash, raccourci) ou
  fenêtre déplacée vers le bureau 1.
- **Les fenêtres déjà sur le bureau 1 à l'allumage du mode ne sont pas projetées** :
  ce serait montrer à la salle des fenêtres privées sans prévenir. Elles passent sur
  le bureau 2 (§4.2).
- Fenêtres `NORMAL` uniquement : un dialogue suit sa fenêtre parente.
- Une nouvelle fenêtre n'est **placée qu'au moment où elle est montrée** : la
  déplacer avant serait annulé par le placement. On attend son signal `shown` ;
  invisible pendant la frame où elle est sur l'écran principal, elle est sous le
  retour.
- La décision est prise **en fin de cycle** (`Meta.LaterType.BEFORE_REDRAW`), pas
  dans le signal : une fenêtre ramenée par le raccourci (§4.4) passe par le bureau 1
  avant d'atteindre son bureau, elle ne doit pas repartir.

### 4.8 Alt+Tab suit le bureau 1

Le sélecteur Alt+Tab ne s'affiche que sur l'écran principal. Réglé sur « toutes les
fenêtres », il mélange depuis le bureau 1 les fenêtres privées et celles de l'écran
secondaire, alors que depuis le bureau 1 on cherche une fenêtre **projetée**.

- Mode allumé **et bureau 1 actif** : l'extension met
  `org.gnome.shell.app-switcher current-workspace-only` à `true`. Avec
  `workspaces-only-on-primary`, les fenêtres de l'écran secondaire sont sur tous les
  bureaux, et le bureau 1 est vide (§4.2) : Alt+Tab ne liste que l'écran secondaire.
- Quitter le bureau 1 ou éteindre le mode **restaure la valeur d'origine**. Si elle
  était déjà à `true`, on n'y touche pas.
- Le réglage est relu par GNOME **à chaque ouverture** du sélecteur
  (`altTab.js`, `AppSwitcher`) : pas d'injection dans le code du shell.
- Mêmes règles que §4.5 : on ne lutte pas contre une modification manuelle, et la
  clé interne `switcher-forced` permet la restauration après un crash du shell.
- Seul le sélecteur d'applications est concerné ; le sélecteur de fenêtres
  (`switch-windows`) garde son propre réglage.
- **Depuis un autre bureau** : choisir avec Alt+Tab une fenêtre de l'écran
  secondaire **bascule sur le bureau 1** (`activate_with_focus`, la fenêtre garde le
  focus) — on ne perd pas le fil de la présentation en restant sur un bureau privé.
  Avec §4.6, le pointeur suit.
- **Alt+Tab seulement, pas le focus** : un clic sur le diaporama projeté depuis le
  bureau 3 (pour passer au slide suivant en lisant ses notes) ne doit pas faire
  disparaître les notes. On s'accroche donc à la fin du sélecteur
  (`AppSwitcherPopup._finish`, via `InjectionManager`), pas à `focus-window`.
- Alt+Tab choisit une **application** : si elle a une fenêtre projetée et une privée,
  la plus récente est activée ; on ne bascule que si c'est la projetée.
- Réglage `smart-windows`. Coupé, c'est l'Alt+Tab de GNOME, sans retouche.

### 4.9 Le bord haut mène à la topbar

Sur le bureau 1, la topbar de l'écran principal est posée juste au-dessus du retour :
le bord haut de l'écran secondaire, vu dans le retour, touche la topbar. Le réflexe
de monter la souris vers la topbar bute pourtant sur le bord haut de l'écran
secondaire, qui n'a pas de topbar.

- **Aller** : mode allumé, réglage `smart-pointer` actif, bureau 1 affiché, hors vue
  d'ensemble. **Pousser** le
  pointeur contre le bord haut de l'écran secondaire le place sur la topbar, **juste
  au-dessus de la pastille** dans le retour : même colonne, calculée avec le
  letterbox du retour (§5.1), au milieu de la hauteur de la topbar.
- Une **poussée**, pas un contact : barrière de pression avec le seuil du coin actif
  de GNOME (100 px en 1 s). Les onglets d'un navigateur maximisé ou la barre d'outils
  d'un diaporama plein écran, en haut de l'écran secondaire, restent utilisables.
- **Retour** : arrivé par une poussée, le pointeur qui **ressort de la topbar par le
  bas** (donc dans le retour) revient sur l'écran secondaire, à la colonne
  correspondante, sur son bord haut. Les bandes noires renvoient aux côtés de
  l'écran.
- Un **menu de la topbar** (calendrier, notifications, réglages rapides…) suspend le
  retour sans l'oublier : il s'ouvre par-dessus le retour, y descendre n'est pas
  revenir. Une fois le menu fermé, le retour reprend **dès que le pointeur est de
  nouveau sur la topbar** — refermer le menu en cliquant à côté, pointeur sous la
  topbar, ne renvoie donc pas sur l'écran secondaire par surprise.
- Le retour est oublié au changement de bureau, à la vue d'ensemble, ou si le
  pointeur quitte la topbar autrement que par le bas.
- Arriver dans le retour par un autre chemin ne fait **rien** : sinon le pointeur ne
  pourrait plus quitter l'écran secondaire. Le retour reste en lecture seule : aucun
  clic ni aucune touche ne le traverse, seul le pointeur est déplacé (comme §4.6).
- **Toute la largeur** du bord haut, coin compris, sauf les parties au-dessus
  desquelles se trouve un autre écran (écrans empilés) : la barrière bloquerait le
  passage normal.
- **Coin actif** : si l'écran secondaire est le plus à gauche, GNOME lui pose un coin
  actif en haut à gauche, qui ouvrirait la vue d'ensemble — précisément là où le
  réflexe « aller vers Activités » emmène le pointeur. Tant que le retour est
  affiché, ce coin est coupé (`hotCorners[i].setBarrierSize(0)`) ; il est réarmé dès
  que le retour disparaît (autre bureau, vue d'ensemble, mode éteint) et quand GNOME
  reconstruit ses coins (`hot-corners-changed`).
- Barrières recalculées à chaque changement de disposition des écrans.
- **Le saut est un mouvement pour Mutter** : un `warp_pointer` en ligne droite est
  arrêté par les barrières sur son trajet. Constaté en vrai : le pointeur, encore
  plaqué contre notre barrière, glissait jusqu'à son extrémité puis tombait dans le
  coin actif de l'écran principal, et toute la distance du saut comptait comme une
  poussée → vue d'ensemble immédiate. Donc :
  - notre barrière est **retirée pendant le saut** et recréée 300 ms après (avec un
    `PressureBarrier` neuf : l'ancien, déclenché, attendrait un `left` qui ne vient
    jamais) ;
  - chaque saut passe par la **mi-hauteur des écrans** (plusieurs `warp_pointer`
    successifs), loin du bord haut et des coins actifs ;
  - au retour, le pointeur atterrit **juste sous** le bord haut : posé dessus, la
    barrière compterait l'arrivée comme une poussée.

### 4.10 La vue d'ensemble montre le bureau 1

En vue d'ensemble, le retour est masqué (§5.2) : il recouvrirait la vue d'ensemble de
l'écran principal. L'aperçu du bureau 1 y apparaissait donc **vide** — le bureau 1
ne contient aucune fenêtre (§4.2), les fenêtres projetées sont sur l'écran
secondaire, donc dans la vue d'ensemble de l'écran secondaire, que l'on ne voit pas.

- Mode allumé, l'aperçu du bureau 1 **de l'écran principal** accepte aussi les
  fenêtres de l'écran secondaire : elles y sont rangées comme toutes les fenêtres de
  la vue d'ensemble.
- Cliquer l'une d'elles l'active et revient sur le bureau 1 ; la glisser sur
  l'aperçu d'un bureau privé la ramène sur l'écran principal, dans ce bureau.
- L'écran secondaire garde sa propre vue d'ensemble : rien ne change pour la salle.
- Un seul filtre décide des fenêtres d'un aperçu, `Workspace._isMyWindow`
  (`workspace.js`) : sur ce bureau **et** sur cet écran. On l'élargit via
  `InjectionManager`, retiré à l'extinction du mode. Pas de réglage : c'est le retour
  lui-même, prolongé dans la vue d'ensemble.
- Limites acceptées : à l'ouverture, les aperçus partent de la position réelle des
  fenêtres, les projetées arrivent donc depuis le côté de l'écran secondaire. Les
  vignettes de bureaux en haut de la vue d'ensemble (`workspaceThumbnail.js`, un
  autre filtre) ne sont pas touchées : celle du bureau 1 reste vide.

---

## 5. Technique

### 5.1 Le clone

Principe repris de la loupe d'accessibilité (`js/ui/magnifier.js`) :

```text
Main.layoutManager.uiGroup
├── global.window_group      ◄── source du Clutter.Clone (fenêtres + fond d'écran)
├── mirror (St.Widget)       ◄── inséré juste au-dessus de window_group
│   └── viewport (clip)
│       ├── Clutter.Clone    ◄── scale s, translaté de (-sec.x·s, -sec.y·s)
│       └── pastille curseur
├── panelBox, popups, OSD…   ◄── restent au-dessus du retour
```

- **Source = `global.window_group`**, pas `uiGroup` : le retour vit dans `uiGroup`,
  cloner `uiGroup` le ferait se contenir lui-même (récursion). La loupe contourne
  le problème en se plaçant sur `global.stage`, au-dessus de tout — ce qui
  masquerait ici le panel, les menus et l'Alt-Tab. Inacceptable.
- `mirror` : géométrie = `workArea` de l'écran principal, fond noir. `viewport` :
  rectangle letterboxé, `clip_to_allocation` (sinon les bandes montreraient ce qui
  entoure l'écran secondaire). `s = min(wa.width / sec.width, wa.height / sec.height)`.
- Le clone ne repeint que si `mirror` est visible : masqué hors bureau 1, coût nul.

### 5.2 Visibilité

`mirror.visible = allumé && bureau actif == 0 && !Main.overview.visible && !glissement`

Pendant une animation de changement de bureau, c'est la copie qui glisse (§4.2).

Signaux : `global.workspace_manager` `active-workspace-changed`, `Main.overview`
`showing`/`hidden`, `Main.layoutManager` `monitors-changed` (recalcul de la
géométrie, extinction du mode s'il n'y a plus d'écran secondaire).

### 5.3 Garder le bureau 1 en vie

Le `WorkspaceTracker` du shell ne supprime pas un bureau qui porte un
`_keepAliveId`. Ce champ est l'**id d'une source GLib** (le shell fait un
`GLib.source_remove` dessus) : y écrire une valeur à la main serait dangereux. On
passe donc par la méthode que le shell expose lui-même,
`Main.wm.keepWorkspaceAlive(workspace, durée)` (minuteur one-shot) :

- à l'allumage, et à chaque changement de bureau : maintien du bureau 0 pour 1 h ;
- un minuteur de l'extension réarme toutes les 10 min ;
- à l'extinction : `keepWorkspaceAlive(workspace, 0)`, le marqueur tombe aussitôt.

Si le shell réarme lui-même le bureau 0 avec une durée courte (lancement d'appli sur
ce bureau), le prochain changement de bureau ou réarmement rétablit le nôtre.
Alternative sans aucun risque : bureaux statiques.

### 5.4 Rendu direct (unredirect)

Une fenêtre plein écran sur l'écran secondaire (diaporama) est **rendue sans passer
par le compositeur** : son contenu n'est plus peint dans le graphe de scène et le
clone se figerait. Le mode appelle `global.compositor.disable_unredirect()` à
l'allumage, `enable_unredirect()` à l'extinction.

### 5.5 Curseur

`global.backend.get_cursor_tracker()`, signal `position-invalidated` (comme la
loupe) → `global.get_pointer()` → test d'appartenance au rectangle de l'écran
secondaire → position de la pastille. Connecté seulement mode allumé.

### 5.6 Raccourci

`Main.wm.addKeybinding` avec une clé `share-window` du schéma de l'extension,
`Shell.ActionMode.NORMAL`. Cible : `global.display.focus_window`, ignorée si
`null` ou de type non `NORMAL`/`DIALOG`. `win.move_to_monitor(index)`.

### 5.7 Réglages rapides

Un `QuickSettings.SystemIndicator` ajouté par
`Main.panel.statusArea.quickSettings.addExternalIndicator()` — l'API publique des
extensions pour les réglages rapides. Il porte :

- l'icône de la topbar (`_addIndicator()`) et son libellé, visibles seulement mode
  allumé : rouge `#e01b24` sur le bureau 1, vert `#33d17a` ailleurs (classes
  `presentation-indicator` et `presentation-mirrored`). Au centre, ils sont portés par
  un `PanelMenu.Button` sans menu, ajouté en position 0 de la boîte centrale
  (`Main.panel.addToStatusArea`, API publique), donc à gauche de l'heure ;
- un `QuickMenuToggle` dans `quickSettingsItems` : `checked` suit le mode,
  `reactive` à `false` et sous-titre « No secondary screen » sans écran secondaire ;
  son menu a un en-tête (`setHeader`) et l'entrée Preferences
  (`extension.openPreferences()`).

### 5.8 Carte des risques

| Élément                  | API                                    | Risque                |
| ------------------------ | -------------------------------------- | --------------------- |
| Clone de `window_group`  | `Clutter.Clone`, publique              | faible                |
| Insertion dans `uiGroup` | `insert_child_above`, usage courant    | faible                |
| Bureau 1 maintenu en vie | `Main.wm.keepWorkspaceAlive`           | moyen, dégradé propre |
| Bureau 1 libéré          | `Main.wm.insertWorkspace`              | faible                |
| Clone d'un plein écran   | `global.compositor.disable_unredirect` | faible                |
| Position du curseur      | `Meta.CursorTracker`, publique         | faible                |
| Réglages rapides         | `addExternalIndicator`, publique       | faible                |
| Indicateur au centre     | `addToStatusArea`, publique            | faible                |
| Raccourci                | `Main.wm.addKeybinding`                | faible                |
| Ne pas déranger          | GSettings, publique                    | faible                |
| Alt+Tab sur le bureau 1  | GSettings, relue à chaque Alt+Tab      | faible                |
| Alt+Tab vers le bureau 1 | `AppSwitcherPopup._finish`, interne    | moyen                 |
| Bureau 1 en vue d'ens.   | `Workspace._isMyWindow`, interne       | moyen                 |
| Geste sur écran second.  | `SwipeTracker._beginGesture`, interne  | moyen                 |
| Clavier vers principal   | `get_tab_list`, `activate`, publiques  | faible                |
| Glissement du retour     | `_prepareWorkspaceSwitch`, interne     | moyen                 |
| Bord haut → topbar       | `Layout.PressureBarrier`, exportée     | moyen                 |
| Coin actif coupé         | `layoutManager.hotCorners`, interne    | moyen                 |

### 5.9 Fichiers

| Fichier                     | Rôle                                             |
| --------------------------- | ------------------------------------------------ |
| `src/extension.js`          | `enable()` / `disable()`, raccourci              |
| `src/mode.js`               | état du mode, visibilité, DND, bureau 1, curseur |
| `src/mirror.js`             | le retour : clone, géométrie, pastille           |
| `src/indicator.js`          | réglages rapides et indicateur de la topbar      |
| `src/prefs.js`              | fenêtre de préférences (§4.1, §6)                |
| `src/topedge.js`            | bord haut ↔ topbar (§4.9)                        |
| `src/geometry.js`           | calculs purs, sans `gi://`, testés sous node     |
| `src/schemas/*.gschema.xml` | les clés du §6                                   |

---

## 6. Réglages

**Règle** : le retour sur le bureau 1 est le cœur de l'extension, il n'est pas
optionnel. **Un réglage n'existe que s'il a un vrai cas d'usage désactivé** : les
comportements annexes sont regroupés par intention, activés par défaut, et chaque
groupe se coupe d'un coup pour retrouver GNOME standard.

| Clé                  | Type | Défaut                | Comportement (§)                    | Préférences |
| -------------------- | ---- | --------------------- | ----------------------------------- | ----------- |
| `smart-pointer`      | bool | `true`                | gestion du curseur (§4.6, §4.9)     | oui         |
| `smart-windows`      | bool | `true`                | gestion des fenêtres (§4.7, §4.8)   | oui         |
| `share-window`       | as   | `['<Super>e']`        | la combinaison du raccourci         | oui         |
| `mute-notifications` | bool | `true`                | Ne pas déranger auto (§4.5)         | oui         |
| `indicator-position` | s    | `'right'`             | position de l'indicateur (§4.1)     | oui         |
| `banners-muted`      | bool | `false`               | état interne de §4.5                | non         |
| `switcher-forced`    | bool | `false`               | état interne de §4.8                | non         |

- `smart-pointer` : le curseur suit le bureau 1 en gardant sa place, le geste marche
  depuis l'écran secondaire, la vue d'ensemble garde le curseur visible (§4.6), le bord
  haut mène à la topbar (§4.9).
- `smart-windows` : ouverture sur l'écran secondaire depuis le bureau 1 (§4.7), Alt+Tab
  (§4.8), le clavier quitte les fenêtres projetées (§4.6).
- **Toujours actif**, car cela fait partie du retour : la pastille (§4.3), la libération
  et le maintien du bureau 1 (§4.2), son glissement (§4.2), son aperçu en vue d'ensemble
  (§4.10), l'indicateur `Mirror` / `Private` (§4.1). Le raccourci aussi (§4.4). Les deux
  réglages coupés, le mode se réduit donc à ça, plus Ne pas déranger selon son réglage.
- Ces deux clés remplacent `warp-pointer`, `auto-share`, `share-shortcut`,
  `switcher-secondary` et `top-edge`. Les anciens choix **ne sont pas repris** : à
  signaler dans les notes de version.

Pas d'option de **paramétrage fin** au-delà : le bureau du retour (toujours le 1),
la couleur de la pastille (accent), le choix de l'écran secondaire (le premier non
principal) sont des choix de l'extension. Un comportement se coupe, il ne se
configure pas — deux exceptions : la combinaison du raccourci (§4.1, §4.4), une touche
étant une affaire de doigts, et la position de l'indicateur (§4.1), limitée à deux
choix.

---

## 7. Questions ouvertes

- **Pas de shell imbriqué (nested)** : essayé puis retiré. Le devkit n'affiche que
  son propre écran ; un second écran (`--virtual-monitor`) reste invisible et Mutter
  en fait l'écran principal. Rien de ce que fait l'extension n'y est testable dans
  des conditions proches du réel : **on teste en session réelle**, avec un vrai
  second écran (`just install` puis redémarrage de session).
- **Verrouillage d'écran** : GNOME désactive les extensions au verrouillage. Une
  pause avec l'écran verrouillé éteint donc le mode (DND restauré, retour retiré) ;
  il faut le rallumer au retour. Garder le mode allumé imposerait
  `session-modes: unlock-dialog`, à justifier auprès d'EGO.
- **Fractional scaling** : principal HiDPI à 200 % + secondaire à 100 % — vérifier
  que le calcul de `s` en coordonnées logiques du stage tient.
- **Fenêtres plein écran sur l'écran principal au bureau 1** : un plein écran passe
  au-dessus du chrome ; à vérifier qu'il ne masque pas le retour (cas marginal, le
  bureau 1 est censé rester vide).
- **Glissement des fenêtres projetées en vue d'ensemble (§4.10)** : GNOME anime chaque
  aperçu depuis la position réelle de sa fenêtre, les projetées arrivent donc depuis
  le côté de l'écran secondaire. Correctif possible (~30 lignes) : pour elles,
  remplacer les accesseurs `boundingBox`/`windowCenter` de `WindowPreview` par leur
  place dans le retour (`mirrorView`) — elles partiraient d'où on les voit. **Écarté
  pour l'instant** : purement cosmétique, et ce serait le hook le plus fragile du
  projet (`Object.defineProperty` sur des accesseurs internes, `InjectionManager` ne
  sait pas le faire). À reprendre si le glissement gêne vraiment en formation.

# presentation-workspace — Spec MVP

Extension GNOME Shell pour **présenter sur un écran secondaire en mode étendu** tout
en gardant sur l'écran principal un **retour** de ce que voit la salle — sans OBS.

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

### 4.1 Le bouton du panel — allumer, éteindre, voir l'état

- Une **icône dans la zone de droite du panel** (status area), présente dès que
  l'extension est activée.
- **L'icône dit l'état**, c'est son rôle principal : couleur normale du panel mode
  éteint, **rouge** mode allumé — le rouge des indicateurs d'enregistrement d'écran
  de GNOME, pour « ce que tu montres est vu ».
- **Clic** : ouvre un menu.

  ```text
  ┌──────────────────────────────────────────────┐
  │ Presentation mode                     [ ●]   │  grisé sans écran secondaire
  ├── Options ───────────────────────────────────┤
  │ Pointer follows workspace 1           [  ]   │  §4.6
  │ Workspace 1 opens on the secondary…   [  ]   │  §4.7
  │ Share window shortcut                 [ ●]   │  §4.4
  │ Do Not Disturb                        [ ●]   │  §4.5
  └──────────────────────────────────────────────┘
  ```

- **Pas de fenêtre de préférences** : les réglages sont les interrupteurs du menu.
  Basculer une option **laisse le menu ouvert** (on en règle souvent plusieurs).

- **Non persistant** : à chaque ouverture de session, le mode est éteint.
- **Débrancher l'écran secondaire éteint le mode** (et restaure ce qu'il a
  modifié, §4.5).

Allumer le mode déclenche le retour sur le bureau 1 (§4.2), et, **chacun selon son
réglage (§6)** : le curseur dans le retour (§4.3), la coupure des bannières de
notification (§4.5), le curseur qui suit le bureau 1 (§4.6) et l'envoi sur l'écran
secondaire des fenêtres ouvertes sur le bureau 1 (§4.7).

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
- Défaut proposé : **`Super+Shift+P`** (`Super+P` est déjà le sélecteur d'affichage
  de GNOME). Activable dans le menu ; la combinaison elle-même ne se change qu'avec
  `gsettings`/dconf (clé `share-window`) — pas de saisie de raccourci dans un menu.
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

### 4.6 Le curseur suit le bureau 1

Sans extension, passer d'un écran à l'autre oblige à faire glisser le pointeur
jusqu'au bord. Le bureau 1 étant « l'écran secondaire », le pointeur suit les
changements de bureau, mode allumé :

| Transition                        | Pointeur avant   | Effet                            |
| --------------------------------- | ---------------- | -------------------------------- |
| autre bureau → bureau 1           | écran principal  | **centre de l'écran secondaire** |
| autre bureau → bureau 1           | écran secondaire | rien (on garde sa position)      |
| bureau 1 → autre bureau           | écran secondaire | **centre de l'écran principal**  |
| bureau 1 → autre bureau           | écran principal  | rien (ex. scroll sur le panel)   |
| bureau privé → autre bureau privé | peu importe      | rien                             |
| allumage du mode sur le bureau 1  | écran principal  | centre de l'écran secondaire     |

- Indépendant du moyen de changer de bureau : geste trackpad, scroll sur le panel,
  raccourci clavier, vue d'ensemble.
- `Clutter.Seat.warp_pointer` (API publique, utilisée par la loupe).
- Pas de confinement : sur le bureau 1, le pointeur peut toujours revenir sur
  l'écran principal par le bord (pour atteindre le panel) ; il atterrit alors sur
  le retour, qui ne réagit pas aux clics.

### 4.7 Le bureau 1 ouvre sur l'écran secondaire

Le bureau 1 *montre* l'écran secondaire : lancer une appli depuis le bureau 1, c'est
vouloir la montrer. Sans extension, la fenêtre s'ouvre sur l'écran principal, cachée
sous le retour.

- Mode allumé, **une fenêtre qui arrive sur le bureau 1 de l'écran principal** est
  envoyée sur l'écran secondaire : nouvelle fenêtre (lanceur, dash, raccourci) ou
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

`mirror.visible = allumé && bureau actif == 0 && !Main.overview.visible`

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

### 5.7 Bouton du panel

`PanelMenu.Button` ajouté par `Main.panel.addToStatusArea(uuid, …)`, menu de
`PopupSwitchMenuItem` : le mode, puis une option par clé booléenne du §6, liée à
GSettings dans les deux sens. Une option remplace `activate` par `toggle()` pour ne
pas émettre `activate`, qui fermerait le menu. État :
classe CSS `presentation-active` (icône rouge `#e01b24`) ; sans écran secondaire,
l'interrupteur est `setSensitive(false)`.

### 5.8 Carte des risques

| Élément                  | API                                    | Risque                |
| ------------------------ | -------------------------------------- | --------------------- |
| Clone de `window_group`  | `Clutter.Clone`, publique              | faible                |
| Insertion dans `uiGroup` | `insert_child_above`, usage courant    | faible                |
| Bureau 1 maintenu en vie | `Main.wm.keepWorkspaceAlive`           | moyen, dégradé propre |
| Bureau 1 libéré          | `Main.wm.insertWorkspace`              | faible                |
| Clone d'un plein écran   | `global.compositor.disable_unredirect` | faible                |
| Position du curseur      | `Meta.CursorTracker`, publique         | faible                |
| Bouton du panel          | `PanelMenu.Button`, stable             | faible                |
| Raccourci                | `Main.wm.addKeybinding`                | faible                |
| Ne pas déranger          | GSettings, publique                    | faible                |

### 5.9 Fichiers

| Fichier                     | Rôle                                             |
| --------------------------- | ------------------------------------------------ |
| `src/extension.js`          | `enable()` / `disable()`, raccourci              |
| `src/mode.js`               | état du mode, visibilité, DND, bureau 1, curseur |
| `src/mirror.js`             | le retour : clone, géométrie, pastille           |
| `src/indicator.js`          | bouton du panel                                  |
| `src/geometry.js`           | calculs purs, sans `gi://`, testés sous node     |
| `src/schemas/*.gschema.xml` | les clés du §6                                   |

---

## 6. Réglages

**Règle** : le retour sur le bureau 1 est le cœur de l'extension, il n'est pas
optionnel. **Chaque comportement annexe** que le mode déclenche a son réglage, pour
pouvoir le couper sans toucher au reste.

| Clé                  | Type | Défaut                | Comportement (§)                    | Menu        |
| -------------------- | ---- | --------------------- | ----------------------------------- | ----------- |
| `warp-pointer`       | bool | `false`               | le curseur suit le bureau 1 (§4.6)  | oui         |
| `auto-share`         | bool | `false`               | bureau 1 → écran secondaire (§4.7)  | oui         |
| `share-shortcut`     | bool | `true`                | raccourci partager/reprendre (§4.4) | oui         |
| `share-window`       | as   | `['<Super><Shift>p']` | la combinaison du raccourci         | non (dconf) |
| `mute-notifications` | bool | `true`                | Ne pas déranger auto (§4.5)         | oui         |
| `banners-muted`      | bool | `false`               | état interne de §4.5                | non         |

La pastille du curseur (§4.3) n'est **pas** une option : sans elle le retour perd
son sens. Les deux comportements qui déplacent pointeur ou fenêtres d'eux-mêmes
(§4.6, §4.7) sont **désactivés par défaut** : surprenants, on les choisit.

Pas d'option de **paramétrage fin** au-delà : le bureau du retour (toujours le 1),
la couleur de la pastille (accent), le choix de l'écran secondaire (le premier non
principal) sont des choix de l'extension. Un comportement se coupe, il ne se
configure pas.

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

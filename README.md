# CALM — Collective Animal Locomotion Models

Un simulateur interactif de modèles de mouvement collectif, destiné à la
vulgarisation : on choisit un modèle, on déplace les curseurs, et la simulation
se réorganise sous la main.

Le logiciel tourne dans le navigateur, sans dépendance ni étape de
compilation : [`Programs/Web`](Programs/Web).

La version de bureau en PyQt5, dont celle-ci est le portage, est archivée sur
la branche **`desktop-pyqt5`** :

```bash
git switch desktop-pyqt5      # la version Qt, dans Programs/Python
git switch master             # revenir à la version web
```

Elle reste la référence contre laquelle les modèles ont été vérifiés, mais
n'est plus maintenue.

## Lancer le logiciel

Aucune dépendance, aucune étape de compilation : les modules ES sont chargés
tels quels par le navigateur. Il faut simplement un serveur HTTP, parce que les
modules ES ne se chargent pas depuis `file://`.

```bash
Programs/Web/serve.py
```

Puis <http://127.0.0.1:8000/> (`serve.py 8080` pour un autre port). Toute
modification est visible au rechargement.

Utilisez bien ce script plutôt que `python3 -m http.server` : il désactive la
mise en cache. Sans cela, le navigateur garde les modules ES et l'on peut se
retrouver à exécuter un mélange d'ancien et de neuf, ce qui ressemble en tout
point à un bug.

## Tests

La suite tourne dans un vrai navigateur (Firefox, piloté par selenium) : c'est
là que le code s'exécute, donc c'est là qu'il est vérifié.

```bash
Programs/Web/tests/run.py                      # les quatre suites, sans fenêtre
Programs/Web/tests/run.py --headed             # en regardant le navigateur
Programs/Web/tests/run.py --only unit          # une seule suite
Programs/Web/tests/run.py --shots /tmp/calm    # avec des captures d'écran
```

Les suites sont `unit`, `ui`, `registry` et `view`. La complète prend quelques
minutes : l'essentiel est la physique, qui fait tourner des milliers de pas
dans les deux dimensions.

Les tests unitaires s'ouvrent aussi à la main dans un navigateur, sur
`tests/unit.html`, où ils s'affichent en texte.

Elle exige `selenium` et `geckodriver`. Sur la machine de développement,
selenium est dans l'environnement du site du LJP :

```bash
/var/www/LJP/.venv/bin/python Programs/Web/tests/run.py
```

## Modèles

Sept modèles sont disponibles :

- **Agents aveugles** — ils ne perçoivent rien et suivent des marches
  aléatoires indépendantes. C'est le modèle nul de la collection, celui qui
  étalonne le regard avant qu'une interaction n'entre en jeu.
- **Alignement métrique (Vicsek)** — les agents prennent l'orientation moyenne de leurs voisins
  dans un rayon *r*. L'alignement est leur seule interaction, et il suffit à
  faire émerger un mouvement d'ensemble. Montez *r*, et le groupe s'ordonne ;
  montez le bruit de réorientation, et l'ordre se défait.
- **Alignement topologique (Ballerini)** — les agents s'alignent sur leurs *k* plus proches voisins,
  quelle que soit la distance : le voisinage se compte, il ne se mesure pas.
  C'est ce que font les étourneaux (Ballerini *et al.*, *PNAS* **105**, 1232,
  2008). Comparez avec Vicsek en réduisant le nombre d'agents : le voisinage
  métrique se vide et l'ordre s'effondre, le topologique ne se vide jamais.
- **Alignement nématique** — des bâtonnets sans tête ni queue, alignés sur un
  *axe* et non une direction. Il en résulte des voies parcourues dans les deux
  sens : le groupe est ordonné alors que sa polarisation reste nulle.
- **Boids (Aoki - Reynolds - Couzin)** — trois zones concentriques : répulsion,
  alignement, attraction, plus un secteur aveugle derrière. La réorientation
  étant plafonnée à chaque pas, le groupe peut se mettre à tourner en tore.
- **Cône de vision (Peruani)** — les agents sont attirés par la *position* des voisins qu'ils voient
  dans un cône de vision, sans aucun alignement des vitesses. Le cône n'étant
  pas réciproque, on obtient des agrégats, des rondes et des files à meneurs.
  D'après Barberis & Peruani, *Phys. Rev. Lett.* **117**, 248001 (2016).
- **Particules actives répulsives (MIPS)** — aucune interaction d'orientation,
  seulement une répulsion entre corps. ⚠️ Ce modèle ne produit pas la
  séparation de phase dont il porte le nom : voir la réserve dans `AGENTS.md`.

## Deux vues

Le sélecteur **2D / 3D**, en haut du panneau, bascule la vue *et* la
simulation : les modèles tournent dans les deux dimensions. En 3D, la vue
tourne lentement d'elle-même jusqu'à ce que vous la saisissiez — glissez pour
l'orienter, molette pour zoomer.

Les agents sont **colorés selon leur orientation**, en direct et dans les deux
vues : un groupe polarisé vire à une seule couleur, une phase nématique montre
deux teintes opposées en voies séparées, un gaz désordonné reste un confetti.
En 3D, la teinte donne l'azimut, et l'élévation éclaircit vers le blanc ou
assombrit vers le noir.

La 3D s'appuie sur three.js, embarqué dans `Programs/Web/vendor/` : rien n'est
chargé depuis un CDN, ni pour les tests ni en production.

Les perceptrons existent dans la version Qt archivée et restent à porter.
Chaque modèle est un fichier de
[`Programs/Web/js/models/`](Programs/Web/js/models) et une ligne dans le
registre ; l'interface s'en déduit.

## Licence

Le dépôt est ouvert. Crafted with ❤️ by Raphaël Candelier.

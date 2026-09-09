# CALM — Collective Animal Locomotion Models

Un simulateur interactif de modèles de mouvement collectif, destiné à la
vulgarisation : on choisit un modèle, on déplace les curseurs, et la simulation
se réorganise sous la main.

Deux implémentations cohabitent le temps du portage :

| Dossier | État | Interface |
| --- | --- | --- |
| [`Programs/Web`](Programs/Web) | en développement | navigateur, JavaScript, sans dépendance |
| [`Programs/Python`](Programs/Python) | référence historique | PyQt5, application de bureau |

La version web est celle qui sera publiée ; la version Python reste la
référence contre laquelle les modèles sont vérifiés.

## Lancer la version web

Aucune dépendance, aucune étape de compilation : les modules ES sont chargés
tels quels par le navigateur. Il faut simplement un serveur HTTP, parce que les
modules ES ne se chargent pas depuis `file://`.

```bash
cd Programs/Web
python3 -m http.server 8000
```

Puis <http://127.0.0.1:8000/>. Toute modification est visible au rechargement.

## Lancer la version Python

```bash
conda install numpy pyqt5 qdarkstyle
cd Programs/Python
python main.py
```

## Tests

La suite tourne dans un vrai navigateur (Firefox, piloté par selenium) : c'est
là que le code s'exécute, donc c'est là qu'il est vérifié.

```bash
Programs/Web/tests/run.py                      # les trois suites, sans fenêtre
Programs/Web/tests/run.py --headed             # en regardant le navigateur
Programs/Web/tests/run.py --only unit          # une seule suite
Programs/Web/tests/run.py --shots /tmp/calm    # avec des captures d'écran
```

Les tests unitaires s'ouvrent aussi à la main dans un navigateur, sur
`tests/unit.html`, où ils s'affichent en texte.

Elle exige `selenium` et `geckodriver`. Sur la machine de développement,
selenium est dans l'environnement du site du LJP :

```bash
/var/www/LJP/.venv/bin/python Programs/Web/tests/run.py
```

## Modèles

Quatre modèles sont disponibles :

- **Agents aveugles** — ils ne perçoivent rien et suivent des marches
  aléatoires indépendantes. C'est le modèle nul de la collection, celui qui
  étalonne le regard avant qu'une interaction n'entre en jeu.
- **Agents de Vicsek** — ils prennent l'orientation moyenne de leurs voisins
  dans un rayon *r*. L'alignement est leur seule interaction, et il suffit à
  faire émerger un mouvement d'ensemble. Montez *r*, et le groupe s'ordonne ;
  montez le bruit de réorientation, et l'ordre se défait.
- **Agents d'Aoki-Reynolds-Couzin** — trois zones concentriques : répulsion,
  alignement, attraction, plus un secteur aveugle derrière. La réorientation
  étant plafonnée à chaque pas, le groupe peut se mettre à tourner en tore.
- **Agents de Peruani** — attirés par la *position* des voisins qu'ils voient
  dans un cône de vision, sans aucun alignement des vitesses. Le cône n'étant
  pas réciproque, on obtient des agrégats, des rondes et des files à meneurs.
  D'après Barberis & Peruani, *Phys. Rev. Lett.* **117**, 248001 (2016).

Les perceptrons existent dans la version Python et restent à porter. Chaque
modèle est un fichier de [`Programs/Web/js/models/`](Programs/Web/js/models) et
une ligne dans le registre ; l'interface s'en déduit.

## Licence

Le dépôt est ouvert. Crafted with ❤️ by Raphaël Candelier.

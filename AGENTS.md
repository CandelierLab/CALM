# CALM — architecture vérifiée

Ce fichier décrit ce qui **est**, vérifié sur la machine. Les intentions sont
dans le README ; les décisions actées sont rappelées en fin de document.

## Le nom

CALM, pour *Collective Animal Locomotion Models*. Le logiciel s'appelait COCOA
(*COmportement COllectif Artificiel*).

Renommage effectué : dépôt GitHub `CandelierLab/CALM`, dossier local
`Vulgarisation/CALM`, et `origin` recalé sur la nouvelle URL.

## Où est quoi

`Programs/Web/` est le logiciel. La version de bureau PyQt5 dont il est le
portage — `Programs/Python/` : `main.py`, `Window.py`, `Animation.py`,
`Engine.py` — est archivée sur la branche **`desktop-pyqt5`** et n'est plus
dans l'arbre de `master`.

Elle reste la référence des modèles, et c'est là qu'il faut aller chercher les
perceptrons :

```bash
git show desktop-pyqt5:Programs/Python/Engine.py
```

Cette version n'utilisait **pas** lib-anim : `Animation.py` embarque sa propre
couche Qt (`item`, `polygon`, `Animation2d`), un ancêtre de lib-anim figé sur
PyQt5, dont les items héritent directement de `QGraphicsPolygonItem`. C'est
pourquoi le portage web est parti de zéro plutôt que d'un backend lib-anim.

## Programs/Web

Aucune dépendance, aucune étape de compilation, aucun `node_modules` : des
modules ES chargés tels quels par le navigateur. Ce qui est testé en local est
littéralement ce qui sera déployé.

```
index.html            le squelette du DOM ; le contenu est généré
serve.py              serveur de développement, sans mise en cache
css/calm.css          thèmes clair et sombre en variables CSS
js/main.js            point d'entrée et boucle d'animation
js/engine.js          l'état des agents et le déplacement sur le tore
js/renderer2d.js      rendu Canvas 2D
js/renderer3d.js      rendu WebGL (three.js)
js/colormap.js        la couleur d'une orientation, en 2D et en 3D
js/ui.js              construction de l'interface depuis le registre
js/common.js          paramètres communs à tous les modèles
js/i18n.js            chaînes bilingues de l'interface
js/models/index.js    le registre
js/models/blind.js    les agents aveugles
js/models/vicsek.js   les agents de Vicsek
js/models/topological.js   alignement sur les k plus proches
js/models/nematic.js  alignement sur un axe
js/models/aoki-reynolds-couzin.js   les trois zones concentriques
js/models/peruani.js  attraction dans un cône de vision
js/models/mips.js     particules actives répulsives
img/                  illustrations, une paire clair/sombre par modèle
vendor/three.min.js   three.js r160, build UMD
tests/                les suites de tests
```

### Le registre de modèles

C'est le point d'architecture central. Un modèle est un objet qui se décrit
lui-même : nom bilingue, description bilingue, illustration, liste de
descripteurs de paramètres, et une fonction `step`. Le `<select>`,
l'illustration, le texte et les curseurs sont **générés** à partir de cette
liste ; `ui.js` ne nomme aucun modèle.

Ajouter un modèle = un fichier dans `js/models/` et une ligne dans
`js/models/index.js`. Aucune modification de l'interface, de la boucle ou du
rendu. Vérifié en pratique : l'ajout de Vicsek n'a touché ni `ui.js`, ni
`main.js`, ni `renderer.js`.

Le contrat exact est documenté en tête de `js/models/index.js`, et vérifié pour
chaque modèle du registre par les tests unitaires : un descripteur incomplet
échoue au test au lieu de produire un panneau vide. La suite d'interface lit
elle aussi le registre et vérifie que le `<select>` en est exactement le reflet,
plutôt que de comparer à une liste écrite en dur qui vieillirait mal.

Un modèle peut en outre déclarer `constrain(p, key)`, appelée après chaque
mouvement de curseur, qui rend les corrections à appliquer aux autres
paramètres. C'est ainsi qu'Aoki-Reynolds-Couzin impose ses rayons emboîtés
sans que `ui.js` sache ce qu'est un rayon. Le curseur que l'on tient gagne
toujours, les autres s'écartent — plus prévisible qu'un curseur qui se bloque
sous la main. La version Qt faisait un mélange des deux (elle bloquait Rrep
contre Ral mais poussait Ral contre Rrep) ; c'est harmonisé.

### Deux dimensions, un seul moteur

L'état est **générique en dimension**, et c'est ce qui a façonné le reste. Une
orientation est un **vecteur unitaire**, plus un angle : la seule
représentation qui vaille dans les deux dimensions — et celle que les modèles
utilisaient déjà sans le dire, puisqu'ils accumulaient des cosinus et des sinus
avant d'appeler `atan2`. Sommer des vecteurs unitaires puis normaliser est la
même opération sans le détour, et c'est moins cher (`atan2` n'est pas gratuit).

Positions et directions sont stockées entrelacées — x,y[,z] par agent — ce qui
garde les coordonnées d'un agent sur la même ligne de cache et donne à three.js
un tampon directement lisible.

Ce que le passage en vectoriel a demandé, modèle par modèle : rien du tout pour
les agents aveugles, une transposition mécanique pour cinq autres, et un vrai
changement de méthode pour un seul. L'alignement **nématique** reposait sur le
doublement d'angle, qui n'existe qu'en 2D ; en dimension quelconque le
directeur est le vecteur propre principal du tenseur d'ordre Σ u⊗u, obtenu par
itération de puissance. Le tenseur est aveugle à la distinction tête/queue
parce que u et −u donnent le même produit extérieur — « modulo π » n'est plus
une opération sur un nombre mais une propriété d'un tenseur.

Deux points de méthode qui se paient comptant si on les oublie :

- **Le bruit angulaire doit être isotrope.** Une rotation d'angle gaussien dans
  un plan tiré au hasard contenant le cap : en 2D il n'y a qu'un plan et cela
  redonne le `a += σ·N(0,1)` de la référence, en 3D cela explore la sphère
  uniformément. Perturber des angles sphériques encombrerait les pôles, et une
  nuée d'agents aveugles dériverait vers l'axe z. Un test le mesure.
- **Il faut renormaliser.** La rotation est exacte sur le papier, mais ce sont
  des flottants 32 bits et l'erreur s'accumule : sur quelques milliers de pas
  la norme dérive assez pour que la vitesse change lentement. `move()` et
  `turnTowards()` renormalisent tous deux.

### Le pas de temps

La simulation avance à 25 Hz — un pas toutes les 40 ms — via un accumulateur
dans `main.js`, tandis que le dessin suit `requestAnimationFrame`.

Les deux sont délibérément découplés : `requestAnimationFrame` tire à 60 Hz, ou
120 Hz sur certains écrans, et un pas par image ferait avancer les agents une
fois et demie plus vite sur un bon moniteur. Le temps crédité à une image est
plafonné à 200 ms, sinon revenir sur un onglet en arrière-plan rejouerait
d'un coup tous les pas manqués.

### Les deux vues

Le sélecteur `2D`/`3D` bascule **la vue et la simulation ensemble** : les
modèles tournent dans la dimension que l'état porte, donc c'est un seul
changement. Les agents sont redistribués au passage — une configuration 2D
relevée en 3D tiendrait dans un plan unique, ce qui se lit comme un bug et met
longtemps à se défaire.

Il y a **deux éléments `<canvas>`**, un seul affiché à la fois : un canvas
porte soit un contexte 2D, soit un contexte WebGL, jamais les deux. Ce n'est
donc pas un mode sur un même élément.

`vendor/three.min.js` est **embarqué, pas chargé depuis un CDN** : les tests
tournent hors ligne et le sous-domaine déployé n'a aucune dépendance tierce à
l'exécution. C'est la build UMD de r160, la dernière que cdnjs propose sous
cette forme ; elle affiche un avertissement de dépréciation et fonctionne. Le
contrôle de caméra (glisser pour tourner, molette pour zoomer) est écrit à la
main plutôt que d'embarquer `OrbitControls`, qui est livré à part : une
vingtaine de lignes contre un second fichier.

La vue 3D tourne lentement d'elle-même jusqu'au premier glissement. Une
projection immobile est très difficile à lire ; le mouvement fournit la
parallaxe qui rend la profondeur intelligible.

### La couleur

Les deux vues encodent **la même chose, l'orientation**, sur la même base HSV.
Une nuée polarisée vire à une seule couleur, une nuée désordonnée reste un
confetti, et la phase nématique montre deux teintes opposées sur la roue — ce
qui est précisément la lecture qui la rend reconnaissable.

En 2D une orientation est un angle et la roue suffit. En 3D elle a deux degrés
de liberté contre un pour la roue, donc l'élévation passe sur les deux autres
axes de HSV, qui est lui-même un cône : cap horizontal → teinte pure, vers le
haut → la saturation tombe vers le blanc, vers le bas → la valeur tombe vers le
noir. Le mélange s'arrête avant le blanc et le noir purs pour qu'il reste
toujours un peu de teinte et qu'un agent vertical ne disparaisse pas dans le
fond de son propre thème.

Ce qui est assumé : l'élévation n'est pas perceptuellement uniforme face à
l'azimut, et les pôles écrasent la teinte — un agent qui monte tout droit est
presque blanc quel que soit son azimut. C'est correct (l'azimut n'y est pas
défini) mais la teinte n'y informe plus.

> Une version antérieure colorait la 3D par la coordonnée z avec la colormap
> cyclique `colorwheel` de colorcet, choisie parce que z vit sur un tore. Elle
> a été retirée quand les deux vues ont été unifiées sur l'orientation ; la
> table des 256 couleurs est récupérable dans l'historique git si la profondeur
> redevient utile.

### Voisinage

`Engine.py` cherche les voisins en testant toutes les paires, ce qui est en
O(N²) : acceptable à la centaine d'agents de la version de bureau, pas au
millier que le curseur autorise.

`NeighbourGrid` dans `engine.js` découpe la boîte en cellules jamais plus
petites que le rayon d'interaction ; les voisins d'un agent sont alors dans les
3^d cellules qui l'entourent — neuf en 2D, vingt-sept en 3D. L'occupation est stockée en listes
chaînées sur deux tableaux d'entiers, donc un pas n'alloue rien.

Deux garde-fous dans le code : le nombre de cellules par côté est plafonné —
64 en 2D, 16 en 3D, soit environ quatre mille cellules dans les deux cas (un
rayon minuscule demanderait sinon une grille énorme à effacer à chaque pas, et
il suffit que les cellules soient au moins aussi larges que le rayon) — et en
dessous de trois cellules par côté le voisinage se replierait sur lui-même : la
grille repasse alors en force brute.

Les tests comparent la grille à la force brute sur neuf rayons couvrant les
deux régimes : **0 désaccord sur 180 944 relations de voisinage**. C'est la
seule question qui compte pour une optimisation.

### Mise à jour synchrone

`State.freezeHeadings()` rend une copie des orientations telles qu'elles
étaient au début du pas, réutilisée d'un pas sur l'autre pour ne rien allouer.

Tout modèle à interaction doit la lire, sans quoi un agent s'alignerait sur des
voisins déjà mis à jour dans le même pas — une mise à jour séquentielle, qui
est un modèle *différent* de celui de la référence. La version Python obtient
la même chose en compilant un champ une fois par pas (`agents.compile()`).

### Géométrie

Le domaine est le tore unité [0,1[², comme dans `Engine.py` : les positions
s'enroulent aux deux bords, il n'y a ni paroi ni effet de bord.

Deux pièges vérifiés par les tests :

- **le reste JavaScript garde le signe du dividende**, donc `v % 1` sur une
  position négative reste négatif. `engine.js` utilise `((v % 1) + 1) % 1`.
- **un agent près d'un bord est aussi près du bord opposé** et doit y être
  dessiné : sans cela les triangles sont tranchés net au bord, ce qui se lit
  comme un mur qui n'existe pas. `renderer.js` peint jusqu'à quatre copies
  d'un agent de coin. C'est le seul écart assumé avec la référence Qt, qui
  laissait les agents se faire couper.

### Représentation graphique

Un triangle orienté par agent, aux proportions de la référence Qt : pointe à
`+s` le long du cap, base de demi-largeur `s/2` à `-s/2`, avec `s = 0.011` en
unités de boîte. La teinte vient de la position `x` au moment du brassage
(HSV(x, 1, 1), soit HSL(x·360°, 100%, 50%)), ce qui fait démarrer le groupe en
arc-en-ciel et donne au regard un moyen de suivre le mélange.

Remplissage et contour sont de la couleur de l'agent, **dans les deux
thèmes** : le contour sert à arrondir la silhouette et à l'épaissir un peu, pas
à la cerner d'une encre contrastée. La référence Qt cernait de noir en thème
clair, ce qui alourdissait les agents et attirait l'œil sur les contours
plutôt que sur le groupe. Seuls le fond et le cadre dépendent du thème.

À une centaine d'agents c'est quelques centaines d'opérations de tracé par
image : Canvas 2D est très loin de saturer et WebGL n'apporterait qu'une
dépendance.

### Coût d'un pas, mesuré

Firefox sur la machine de développement, moyenne sur 100 pas, rendu exclu. Le
budget est de 40 ms, la période de la simulation.

| Modèle | Agents | Rayon | Pas | Budget |
| --- | --- | --- | --- | --- |
| aveugles | 1000 | — | 0,10 ms | 0 % |
| Vicsek | 600 | 0,2 (max) | 3,8 ms | 10 % |
| Vicsek | 1000 | 0,2 (max) | 10,6 ms | 27 % |
| Vicsek | 1500 | 0,2 (max) | 22,1 ms | 55 % |
| Vicsek | 2000 | 0,2 (max) | 41,8 ms | **105 %** |
| Vicsek | 2000 | 0,02 | 3,9 ms | 10 % |

C'est ce qui fixe le maximum du curseur à **1000 agents** (et non 2000, sa
première valeur) : au-delà, la combinaison la plus coûteuse atteignable depuis
l'interface dépasse le budget et l'animation décroche. Les deux dernières
lignes montrent aussi que le facteur limitant à grand rayon est le nombre de
voisins réels, pas l'algorithme — la grille, elle, apporte un facteur dix.

## Tests

`Programs/Web/tests/run.py` pilote Firefox via selenium. **266 assertions** au
dernier passage. La suite complète prend maintenant plus de deux minutes,
l'essentiel étant les tests de physique qui font tourner des milliers de pas ;
`--only unit` en est la part lente.

| Suite | `--only` | Ce qu'elle couvre |
| --- | --- | --- |
| `tests/unit.html` | `unit` | **en 2D et en 3D** : enroulement du tore, redimensionnement, bascule de dimension, `setDirection`/`turnTowards`, isotropie du bruit, équivalence grille / force brute, recherche des k plus proches contre balayage exhaustif, physique des sept modèles, les deux bases de couleur, contrat du registre |
| `registry_suite` | `registry` | le `<select>` et le panneau **générés** : le sélecteur lu depuis le registre, la bascule entre les quatre modèles, la régénération des curseurs, les rayons emboîtés d'ARC, la mémorisation des valeurs, la traduction, et le fait que le `step` exécuté soit celui du modèle sélectionné |
| `ui_suite` | `ui` | paramètres live, pause, brassage, réinitialisation, thème, langue, géométrie du canvas à trois formats de fenêtre |
| `view_suite` | `view` | les deux vues : exclusivité des deux canvas, chargement de three.js, vivacité du rendu 3D, chaque modèle en 3D, géométrie du canvas 3D, retour en 2D |

Trois tests méritent d'être signalés parce qu'ils portent sur la physique et
non sur le code :

- **Vicsek s'ordonne** — grand rayon, faible bruit : la polarisation
  \|⟨e^{iθ}⟩\| monte à 1,00. Fort bruit : elle retombe à 0,23. La transition
  est la raison d'être du modèle ; si elle disparaît, le modèle est cassé.
- **Les agents aveugles ne s'ordonnent pas** — polarisation 0,02, la valeur de
  hasard à 400 agents. C'est ce qui fait d'eux un modèle nul.
- **Vicsek à rayon nul redevient aveugle** — un agent n'a alors que lui-même
  pour voisin. La limite doit être correcte, pas gardée par un cas spécial.
- **Le voisinage topologique résiste à la dilution** là où le métrique cède —
  0,90 contre 0,10 sur le même groupe dilué. Si ce test cesse de séparer les
  deux modèles, la règle topologique est redevenue métrique.
- **La phase nématique est ordonnée sans être polarisée** — 0,99 contre 0,18.
- **Aoki-Reynolds-Couzin fait les trois choses** — zone d'alignement dominante :
  polarisation > 0,5. Zone d'attraction dominante : la distance moyenne au plus
  proche voisin chute de 0,030 à 0,007. Répulsion seule : les paires proches
  deviennent cinq fois plus rares qu'en marche aveugle.
- **Peruani agrège sans aligner** — le cône de vision resserre le groupe
  (0,030 → 0,002), et deux tests déterministes fixent la non-réciprocité :
  celui qui suit tourne, celui qui mène ne tourne pas.

Deux de ces tests ont d'abord échoué sur une **attente fausse de ma part**, pas
sur un défaut du code, et méritent d'être notés parce que le piège se
retendra :

- « la répulsion écarte les agents » est **faux sur un tore** : l'aire est
  fixée, donc la densité moyenne est imposée et rien ne peut l'écarter. Ce que
  la répulsion fait, c'est creuser un trou dans la corrélation de paires *à
  l'échelle de sa propre zone* — la distance de sonde doit donc être mesurée en
  unités de `Rrep`, pas fixée d'avance.
- « fuir un voisin droit devant doit donner +π/6 » est **indéterminé** : c'est
  une bifurcation, gauche et droite se valent. Seul le module est assertable
  là ; le signe se teste sur un voisin latéral.
- « un groupe dilué perd son ordre avec un rayon métrique » est **faux à
  faible bruit** : sur une longue course, chaque agent traverse le tore des
  dizaines de fois et les rencontres rares suffisent (Vicsek à 0,996). La
  comparaison ne vit que là où le bruit est assez fort pour que l'ordre exige
  un alignement à *chaque* pas.
- « la fraction d'agents dans le plus grand amas mesure l'agrégation » est
  **inutilisable ici** : à cette densité la connectivité est au seuil de
  percolation, et deux tirages du *même* modèle aveugle donnent 36 % et 69 %.
  Cette mesure avait fait croire à une agrégation MIPS qui n'existe pas.

Une conséquence de tout cela : le contrat du registre vérifie désormais que
chaque valeur par défaut **tombe sur un cran de son curseur**. Sans quoi le
navigateur l'arrondit et le modèle tourne avec une valeur que son propre
descripteur n'a jamais déclarée. Le test a trouvé deux cas dès son écriture
(`Rrep` à 0,025 sur un pas de 0,002, `α` à 0,393 sur un pas de 0,01).

Le même piège a mordu une seconde fois, ailleurs, et mérite d'être retenu :
**un `<input type="range">` rebase silencieusement toute valeur qu'on lui
donne sur son propre pas**. Les rayons d'ARC n'avaient pas le même pas
(0,001 pour `Rrep`, 0,005 pour les deux autres), donc pousser `Rrep` à 0,037
demandait 0,037 à `Ral`, que son pas rabattait à 0,035 — sous `Rrep`, soit
exactement ce que la contrainte existe pour empêcher. Deux corrections :
`_applyConstraints` arrondit désormais **dans le sens de la poussée** (vers le
haut quand il monte, vers le bas quand il descend), ce qui rend le mécanisme
correct quels que soient les pas, et les trois rayons partagent maintenant le
même pas.

Ce bug est passé sous les tests parce qu'ils utilisaient tous des valeurs
tombant sur les crans de tous les curseurs. Le test qui l'attrape balaie chaque
curseur sur des valeurs volontairement biscornues et vérifie l'invariant après
chaque mouvement — et il a été validé par mutation : en rétablissant l'arrondi
au plus proche, il échoue sur `rrep=0.037 -> [0.037, 0.035, 0.45]`, le cas
observé.

Un détail de mise en œuvre : les tests ne peuvent pas capturer une erreur de
module après coup. `run.py` écrit donc une copie jetable de `index.html`
portant un capteur d'erreurs (`index_test.html`), supprimée en fin de course :
la page livrée reste propre.

**Le serveur de développement `serve.py` n'envoie aucun en-tête de cache**, et
ce n'est pas cosmétique : l'application est faite de modules ES, que les
navigateurs mettent en cache durement, et `python3 -m http.server` répond 304
sur un horodatage. Après avoir édité trois modules on peut se retrouver à
exécuter un mélange d'ancien et de neuf — une interface dont le comportement ne
correspond à aucune version du code sur le disque. Cela ressemble exactement à
un bug.

Lancer la suite exige selenium et geckodriver. Sur cette machine, selenium est
dans l'environnement du site du LJP, et geckodriver dans `/snap/bin` :

```bash
/var/www/LJP/.venv/bin/python Programs/Web/tests/run.py
```

Le sandbox empêche selenium de tuer geckodriver en fin de course : une
`PermissionError` s'affiche **après** le décompte des tests. Elle est sans
effet sur les résultats.

## Le déploiement

**En ligne : <https://calm.labojeanperrin.fr/>**, servi depuis
`~/softwares/calm` sur le compte IONOS, atteint par l'alias SSH `ljp-prod`.
`Programs/Web/deploy.sh` fait tout : suite de tests, `rsync`, puis
vérification que la page répond, que chaque module qu'elle importe répond
aussi, et que les `.js` sortent bien avec un type MIME JavaScript — un seul
404 parmi les modules laisse un écran blanc sans le moindre indice.

Le domaine est **`labojeanperrin.fr`**, pas `laboratoirejeanperrin.fr` : ce
dernier ne résout pas du tout. Le certificat `*.labojeanperrin.fr` couvre une
étiquette et vaut jusqu'au 20 janvier 2027, donc le sous-domaine est protégé
sans démarche supplémentaire.

Sous-domaine statique pur, sans cohérence visuelle avec le site du LJP : le
logiciel est indépendant.

### Les brouillons

Un modèle peut porter `draft: true`. Il reste dans l'arbre et dans les tests,
mais disparaît du sélecteur sur le site public — offrir aux visiteurs un
modèle qui ne fait pas ce qu'il annonce serait leur montrer un phénomène qui
n'existe pas.

La règle est évaluée **à l'exécution**, contre l'hôte de la page, et non par
une étape de compilation : il n'y en a pas, ce qui tourne en développement est
octet pour octet ce qui est déployé, donc la distinction se fait au runtime ou
pas du tout. Les brouillons apparaissent sur un hôte local (`localhost`,
`127.0.0.1`, `*.local`, une page `file://`) et, partout, sur demande explicite
avec `?draft` — ce qui permet de vérifier une correction directement en ligne.

Seul `mips` est un brouillon aujourd'hui, pour la raison consignée plus haut.
Son fichier et ses illustrations partent quand même sur le serveur, ce qui est
volontaire : c'est ce qui rend `?draft` utilisable.

`showsDrafts()` prend un objet `location` en argument, donc le filtrage se
teste sur des hôtes fictifs sans avoir à déployer quoi que ce soit.

Ce qui est vérifié côté hébergement, et qui a déterminé toute l'architecture :

- la production du site LJP est un **hébergement mutualisé IONOS servi en CGI**,
  Python 3.9, **768 Mo d'espace d'adressage par processus**, un processus par
  requête. Aucune simulation ne peut donc tourner côté serveur : pas de
  processus persistant, pas de WebSocket, pas de boucle à 25 Hz maintenue
  entre deux requêtes. **C'est la contrainte qui impose le calcul dans le
  navigateur**, et elle est de l'hébergeur, pas d'un choix de style.
- le certificat TLS est `*.labojeanperrin.fr` et couvre une étiquette, donc
  `calm.labojeanperrin.fr` fonctionne **sans nouveau certificat**.
- un logiciel entièrement client se déploie comme des fichiers statiques :
  un `rsync`, et le contrat CGI n'entre jamais en jeu.

Le site lui-même (Flask, MySQL, blueprints, i18n Flask-Babel, `deployment/deploy.sh`)
n'a **pas** été modifié, conformément à la consigne.

## Décisions actées

1. **CALM** comme nom. Écartés pour collision : SHOAL (`cazala/shoal`, une
   bibliothèque de flocking en JS — collision thématique frontale), SWIRL et
   FLOCK (saturés), BOIDS (appartient à la littérature, Reynolds 1986).
2. **Portage du moteur en JavaScript**, pas Pyodide : le plus rapide pour le
   visiteur, contre 7 à 12 Mo de téléchargement et 2 à 5 s de démarrage.
3. **Sous-domaine statique pur**, indépendant visuellement du site.
4. **lib-anim écartée.** Étendre la librairie au web est faisable — ses items
   *détiennent* un `qitem` au lieu d'en hériter, ce qui est la bonne séparation
   — mais le chantier (couche backend à interposer dans les douze fichiers de
   `anim/plane`, bounding boxes à extraire de Qt, Qt3D et matplotlib non
   portables) coûte plusieurs semaines contre quelques jours pour le logiciel
   lui-même. À reconsidérer si l'objectif devient de publier toutes les
   animations scientifiques du laboratoire depuis une source Python unique.
5. **La version Qt est archivée** sur la branche `desktop-pyqt5` et retirée de
   `master`. Elle reste la référence de vérification des modèles.

## Modèles portés

| Modèle | Paramètres propres | Origine |
| --- | --- | --- |
| Nom affiché | `id` | Paramètres propres | Origine |
| --- | --- | --- | --- |
| Agents aveugles | `blind` | aucun | modèle nul |
| Alignement métrique (Vicsek) | `vicsek` | `r` | version Qt |
| Alignement topologique (Ballerini) | `topological` | `k` | PNAS **105**, 1232 (2008) |
| Alignement nématique | `nematic` | `r` | PRL **104**, 184502 (2010) |
| Boids (Aoki - Reynolds - Couzin) | `aoki-reynolds-couzin` | `Rrep`, `Ral`, `Ratt`, `α` | version Qt |
| Cône de vision (Peruani) | `peruani` | `R`, `β`, `γ` | PRL **117**, 248001 (2016) |
| Séparation de phase (MIPS) | `mips` | `σ`, `A` | voir la réserve ci-dessous |
| Perceptrons | — | `w1`…`w4`, `δ` | **à porter** |

Les noms affichés désignent le **mécanisme** plutôt que les auteurs, avec la
référence entre parenthèses : c'est ce que le visiteur a besoin de savoir pour
choisir, et cela met les trois formes d'alignement côte à côte dans le
sélecteur.

Les `id` ne suivent **pas** les noms affichés, et ne doivent pas les suivre :
ils apparaissent dans le fragment d'URL, donc renommer un modèle dans
l'interface ne doit pas casser un lien que quelqu'un a gardé. `aoki-reynolds-couzin`
reste l'id du modèle affiché « Boids ».

**Boids** porte le nom complet des trois contributions : Aoki (1982) pour les
zones concentriques, Reynolds (1987) pour les trois règles des *boids* — d'où
le nom affiché — et Couzin *et al.* (2002) pour le diagramme de phases. La
version Qt l'appelait « Aoki-Couzin ».

Un écart signalé avec la référence Python : la branche « alignement **et**
attraction » y est écrite `if Nal & Natt`, un *et* bit-à-bit sur deux
effectifs, qui vaut faux pour un voisin d'alignement et deux d'attraction
(`1 & 2 == 0`) et laisse alors tomber l'attraction. Lu comme le *et* logique
manifestement voulu.

**Peruani** est le seul modèle de la liste **sans aucun alignement des
vitesses** : un agent est attiré par la position des voisins qu'il voit, jamais
par leur orientation. Et comme le cône de vision n'est pas réciproque — *i*
peut voir *j* sans être vu de lui — la troisième loi de Newton est violée, ce
qui produit des motifs inaccessibles à un modèle d'alignement. C'est ce qui
justifie sa place à côté des trois autres.

Le bruit du modèle, `√(2Dθ)`, est le curseur général de bruit de
réorientation, et le pas vaut une unité de temps, donc `γ` se lit comme `γ·dt`.

**Les agents topologiques** comptent leur voisinage au lieu de le mesurer :
les `k` plus proches, quelle que soit la distance. C'est ce qu'on observe chez
les étourneaux (Ballerini *et al.*, 2008), et la conséquence est testée
directement — un groupe dilué reste ordonné avec un voisinage topologique
(polarisation 0,90) et se désordonne avec un rayon métrique (0,10).

L'implémentation est en deux étages, dans `KNearest` : la grille cherche dans
un rayon calculé pour contenir `k` voisins à la densité moyenne, et les agents
qui en trouvent moins — ceux des zones clairsemées, précisément ceux dont parle
le modèle — déclenchent un balayage complet. Tronquer aurait silencieusement
rendu le modèle métrique, ce qui est la seule chose qu'il ne doit pas être.

**Les agents nématiques** s'alignent modulo π : le doublement des angles rend
la moyenne aveugle à la distinction tête/queue. Le directeur ne nomme qu'un
axe, donc deux caps opposés ; l'agent garde celui vers lequel il allait déjà.
Le test mesure les deux paramètres d'ordre à la fois — nématique 0,99,
polarisation 0,18 — ce qui est la signature de la phase et la distingue de
Vicsek.

**Les particules actives répulsives** n'ont aucune interaction d'orientation :
seule une répulsion à courte portée, réciproque, et c'est le premier modèle qui
a besoin de `State.displace()` plutôt que du seul `state.move()`.

> **Réserve, à lire avant de présenter ce modèle.** Il ne produit **pas** la
> séparation de phase (MIPS) dont il porte le nom. Mesuré sans ambiguïté : le
> nombre moyen de voisins dans 3σ vaut 18,1 contre 17,9 pour des marches
> aveugles — identique, et reproductible au dixième — sur un balayage en
> densité (φ de 0,28 à 0,63), en intensité de répulsion (`A` de 0,006 à 0,05)
> et en persistance (ℓ_p de 1σ à 1000σ). Le groupe reste homogène.
>
> La raison la plus probable n'est pas réglable : la boîte fait une unité et σ
> vaut 0,03, donc le système mesure une trentaine de diamètres là où la
> littérature en utilise des centaines. Un germe critique n'y tient pas.
>
> Ce que le code fait est correct et testé (répulsion réciproque, aucune
> polarisation, réduction exacte au modèle aveugle quand `A` = 0). Ce qu'il ne
> fait pas, c'est le phénomène. À décider : le garder en le décrivant
> honnêtement, le renommer, ou le retirer.

## Reste à porter

Les perceptrons, dans `agent.update` de la version archivée
(`git show desktop-pyqt5:Programs/Python/Engine.py`, branche `Perceptron`),
demandent le champ de perception en tranches angulaires (`agent.perceive`) — la
grille rend déjà les décalages toroïdaux vers chaque voisin, ce qui en est la
moitié.

## Reste à faire

- Porter les perceptrons, le dernier modèle de la version Qt.

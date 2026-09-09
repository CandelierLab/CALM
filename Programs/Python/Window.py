from PyQt5.QtCore import Qt, QSize
from PyQt5.QtGui import QKeySequence, QPixmap, QPalette, QColor
from PyQt5.QtWidgets import QApplication, QWidget, QShortcut, QGridLayout, QHBoxLayout, QVBoxLayout, QPushButton, QLabel, QSlider, QTabWidget, QCheckBox, QStyle, QProxyStyle
import qdarkstyle

from Animation import Animation

class Window(QWidget):
  
  def __init__(self, N, darkstyle=True):
   
    self.darkstyle = darkstyle

    # Qapplication
    self.app = QApplication([])

    # Widget constructor
    super().__init__()

    # --- GUI parameters ---------------------------------------------------

    # Default language
    self.language = 'fr'

    # Style
    if self.darkstyle:
      QSS = qdarkstyle.load_stylesheet()
      QSS += """
        /* QSlider --------------------------------------  */
        QSlider::handle:horizontal {
            height: 40px;
            width: 40px;
            margin: -20px 0;
            border-radius: 20px;
            padding: -20px 0px;
        }
        QSlider::handle:horizontal:hover {
            background-color: rgb(200, 200, 200);
        }
        QSlider::handle:horizontal:pressed {
            background-color: rgb(255, 255, 255);
        }"""
      self.app.setStyleSheet(QSS)

    # --- Fullscreen
    
    # Check screen size
    screen = self.app.primaryScreen()
    # screen = self.app.secondaryScreen()
    if screen.size().width()>=3840:
      f = 2
      self.setGeometry(0,0,1920*f, 1080*f)      
    else:
      f = 1
      # self.setWindowState(Qt.WindowFullScreen)

    # --- Animation --------------------------------------------------------

    self.animation = Animation(self, N, darkstyle=self.darkstyle)
    self.animation.shuffle()

    # --- Layouts & Widgets ---------------------move windo
    lShuffle = QHBoxLayout()

    self.bShuffle = QPushButton()
    self.bShuffle.setFixedHeight(50*f)
    self.bShuffle.clicked.connect(self.animation.shuffle)

    self.bPlay = QPushButton()
    self.bPlay.setFixedHeight(50*f)
    self.bPlay.setCheckable(True)

    lShuffle.addStretch(3)
    lShuffle.addWidget(self.bShuffle, 3)
    lShuffle.addStretch(1)
    lShuffle.addWidget(self.bPlay, 3)
    lShuffle.addStretch(1)

    # --- General parameters

    lParam = QGridLayout()

    # Speed
    self.tSpeed = QLabel()
    self.tSpeed.setFixedHeight(30*f)
    lParam.addWidget(self.tSpeed, 0, 0)

    self.sSpeed = QSlider(Qt.Horizontal)
    self.sSpeed.setMinimum(0)
    self.sSpeed.setMaximum(100)
    self.sSpeed.setSingleStep(1)
    self.sSpeed.setValue(30)
    self.sSpeed.valueChanged.connect(self.animation.setSpeed)
    lParam.addWidget(self.sSpeed, 0, 1)

    # # Perception noise
    # self.tSigma_in = QLabel()
    # self.tSigma_in.setFixedHeight(30*f)
    # lParam.addWidget(self.tSigma_in, 1, 0)

    # self.sSigma_in = QSlider(Qt.Horizontal)
    # self.sSigma_in.setMinimum(0)
    # self.sSigma_in.setMaximum(100)
    # self.sSigma_in.setSingleStep(1)
    # self.sSigma_in.setValue(20)
    # self.sSigma_in.valueChanged.connect(self.animation.setSigma_in)
    # lParam.addWidget(self.sSigma_in, 1, 1)

    # Orientation noise
    self.tSigma_out = QLabel()
    self.tSigma_out.setFixedHeight(30*f)
    lParam.addWidget(self.tSigma_out, 2, 0)

    self.sSigma_out = QSlider(Qt.Horizontal)
    self.sSigma_out.setMinimum(0)
    self.sSigma_out.setMaximum(100)
    self.sSigma_out.setSingleStep(1)
    self.sSigma_out.setValue(20)
    self.sSigma_out.valueChanged.connect(self.animation.setSigma_out)
    lParam.addWidget(self.sSigma_out, 2, 1)
    
    # --- Agents type

    self.tType = QTabWidget()
    self.tType.setStyleSheet("QTabBar::tab { padding: 15px 25px;}")

    tBlind = QWidget()
    tVicsek = QWidget()
    tAoki = QWidget()
    tPerceptron = QWidget()

    self.tType.addTab(tBlind, '')
    self.tType.addTab(tVicsek, '')
    self.tType.addTab(tAoki, '')
    self.tType.addTab(tPerceptron, '')

    self.tType.currentChanged.connect(self.animation.changeAgent)

    # --- Blind agents

    lBlind = QVBoxLayout()
    lBlind.addSpacing(25*f)

    iBlind = QLabel()
    if self.darkstyle:
      iBlind.setPixmap(QPixmap('Images/Blind_dark.png').scaledToHeight(200*f))
    else:
      iBlind.setPixmap(QPixmap('Images/Blind.png').scaledToHeight(200*f))
    iBlind.setAlignment(Qt.AlignCenter)
    lBlind.addWidget(iBlind)
    lBlind.addSpacing(25*f)

    self.tBlind = QLabel()
    lBlind.addWidget(self.tBlind)

    tBlind.setLayout(lBlind)

    # --- Vicsek agents

    lVicsek = QVBoxLayout()
    lVicsek.addSpacing(25*f)

    iVicsek = QLabel()
    if self.darkstyle:
      iVicsek.setPixmap(QPixmap('Images/Vicsek_dark.png').scaledToHeight(200*f))
    else:
      iVicsek.setPixmap(QPixmap('Images/Vicsek.png').scaledToHeight(200*f))

    iVicsek.setAlignment(Qt.AlignCenter)
    lVicsek.addWidget(iVicsek)
    lVicsek.addSpacing(25*f)

    self.tVicsek = QLabel()
    lVicsek.addWidget(self.tVicsek)
    lVicsek.addSpacing(25*f)

    lVicsekParam = QGridLayout()
    
    # Radius of interaction
    self.tRadius = QLabel("<span style='font-family: Serif'><i>r</i></span> =")
    self.tRadius.setFixedHeight(50*f)
    lVicsekParam.addWidget(self.tRadius, 0, 0)

    self.lRadius = QLabel('0.050')
    lVicsekParam.addWidget(self.lRadius, 0, 1)

    self.sRadius = QSlider(Qt.Horizontal)
    self.sRadius.setMinimum(0)
    self.sRadius.setMaximum(100)
    self.sRadius.setSingleStep(1)
    self.sRadius.setValue(25)
    self.sRadius.valueChanged.connect(self.animation.setRadius)
    lVicsekParam.addWidget(self.sRadius, 0, 2)

    lVicsek.addLayout(lVicsekParam)

    tVicsek.setLayout(lVicsek)

    # --- Aoki-Couzin agents

    lAoki = QVBoxLayout()
    lAoki.addSpacing(25*f)

    iAoki = QLabel()
    if self.darkstyle:
      iAoki.setPixmap(QPixmap('Images/Aoki-Couzin_dark.png').scaledToHeight(300*f))
    else:
      iAoki.setPixmap(QPixmap('Images/Aoki-Couzin.png').scaledToHeight(300*f))

    iAoki.setAlignment(Qt.AlignCenter)
    lAoki.addWidget(iAoki)
    lAoki.addSpacing(25*f)

    self.tAoki = QLabel()
    lAoki.addWidget(self.tAoki)
    lAoki.addSpacing(25*f)

    lAokiParam = QGridLayout()
    
    # Rrep
    tRrep = QLabel("<span style='font-family: Serif'><i>r<sub>rep</sub></i></span> =")
    tRrep.setFixedHeight(50*f)
    lAokiParam.addWidget(tRrep, 0, 0)

    self.lRrep = QLabel('0.025')
    lAokiParam.addWidget(self.lRrep, 0, 1)

    self.sRrep = QSlider(Qt.Horizontal)
    self.sRrep.setMinimum(0)
    self.sRrep.setMaximum(100)
    self.sRrep.setSingleStep(1)
    self.sRrep.setValue(5)
    self.sRrep.valueChanged.connect(self.animation.setRrep)
    lAokiParam.addWidget(self.sRrep, 0, 2)

    # Ral
    tRal = QLabel("<span style='font-family: Serif'><i>r<sub>al</sub></i></span> =")
    tRal.setFixedHeight(50*f)
    lAokiParam.addWidget(tRal, 1, 0)

    self.lRal = QLabel('0.125')
    lAokiParam.addWidget(self.lRal, 1, 1)

    self.sRal = QSlider(Qt.Horizontal)
    self.sRal.setMinimum(0)
    self.sRal.setMaximum(100)
    self.sRal.setSingleStep(1)
    self.sRal.setValue(25)
    self.sRal.valueChanged.connect(self.animation.setRal)
    lAokiParam.addWidget(self.sRal, 1, 2)

    # Ratt
    tRatt = QLabel("<span style='font-family: Serif'><i>r<sub>att</sub></i></span> =")
    tRatt.setFixedHeight(50*f)
    lAokiParam.addWidget(tRatt, 2, 0)

    self.lRatt = QLabel('0.250')
    lAokiParam.addWidget(self.lRatt, 2, 1)

    self.sRatt = QSlider(Qt.Horizontal)
    self.sRatt.setMinimum(0)
    self.sRatt.setMaximum(100)
    self.sRatt.setSingleStep(1)
    self.sRatt.setValue(50)
    self.sRatt.valueChanged.connect(self.animation.setRatt)
    lAokiParam.addWidget(self.sRatt, 2, 2)

    # Alpha
    talpha = QLabel("<span style='font-family: Serif'><i>α</i></span> =")
    talpha.setFixedHeight(50*f)
    lAokiParam.addWidget(talpha, 3, 0)

    self.lalpha = QLabel('0.785')
    lAokiParam.addWidget(self.lalpha, 3, 1)

    self.salpha = QSlider(Qt.Horizontal)
    self.salpha.setMinimum(0)
    self.salpha.setMaximum(100)
    self.salpha.setSingleStep(1)
    self.salpha.setValue(25)
    self.salpha.valueChanged.connect(self.animation.setAlpha)
    lAokiParam.addWidget(self.salpha, 3, 2)

    lAoki.addLayout(lAokiParam)

    tAoki.setLayout(lAoki)

    # --- Perceptrons

    lPerceptron = QVBoxLayout()
    lPerceptron.addSpacing(10*f)

    iPerceptron = QLabel()
    if self.darkstyle:
      iPerceptron.setPixmap(QPixmap('Images/Perceptron_dark.png').scaledToHeight(250*f))
    else:
      iPerceptron.setPixmap(QPixmap('Images/Perceptron.png').scaledToHeight(250*f))

    iPerceptron.setAlignment(Qt.AlignCenter)
    lPerceptron.addWidget(iPerceptron)
    lPerceptron.addSpacing(10*f)

    self.tPerceptron = QLabel()
    lPerceptron.addWidget(self.tPerceptron)
    lPerceptron.addSpacing(25*f)

    lPerceptronSettings = QHBoxLayout()

    self.cSym = QCheckBox()
    self.cSym.setChecked(True)
    self.cSym.setStyleSheet("QCheckBox::indicator { width: 25px; height: 25px;}")
    self.cSym.clicked.connect(self.animation.symmetrize)
    lPerceptronSettings.addWidget(self.cSym)

    self.bReset = QPushButton()
    self.bReset.setFixedSize(QSize(250*f, 25*f))
    self.bReset.clicked.connect(self.animation.resetWeights)
    lPerceptronSettings.addWidget(self.bReset)

    lPerceptron.addLayout(lPerceptronSettings)
    lPerceptron.addSpacing(10*f)

    lPerceptronParam = QGridLayout()
    
    # W1
    tw1 = QLabel("<span style='font-family: Serif'><i>w<sub>1</sub></i></span> =")
    tw1.setFixedHeight(50*f)
    lPerceptronParam.addWidget(tw1, 0, 0)

    self.lw1 = QLabel('0.00')
    lPerceptronParam.addWidget(self.lw1, 0, 1)

    self.sw1 = QSlider(Qt.Horizontal)
    self.sw1.setMinimum(0)
    self.sw1.setMaximum(100)
    self.sw1.setSingleStep(1)
    self.sw1.setValue(50)
    self.sw1.valueChanged.connect(self.animation.setW1)
    lPerceptronParam.addWidget(self.sw1, 0, 2)

    # W2
    tw2 = QLabel("<span style='font-family: Serif'><i>w<sub>2</sub></i></span> =")
    tw2.setFixedHeight(50*f)
    lPerceptronParam.addWidget(tw2, 1, 0)

    self.lw2 = QLabel('0.00')
    lPerceptronParam.addWidget(self.lw2, 1, 1)

    self.sw2 = QSlider(Qt.Horizontal)
    self.sw2.setMinimum(0)
    self.sw2.setMaximum(100)
    self.sw2.setSingleStep(1)
    self.sw2.setValue(50)
    self.sw2.valueChanged.connect(self.animation.setW2)
    lPerceptronParam.addWidget(self.sw2, 1, 2)

    # W3
    tw3 = QLabel("<span style='font-family: Serif'><i>w<sub>3</sub></i></span> =")
    tw3.setFixedHeight(50*f)
    lPerceptronParam.addWidget(tw3, 2, 0)

    self.lw3 = QLabel('0.00')
    self.lw3.setDisabled(True)
    lPerceptronParam.addWidget(self.lw3, 2, 1)

    self.sw3 = QSlider(Qt.Horizontal)
    self.sw3.setMinimum(0)
    self.sw3.setMaximum(100)
    self.sw3.setSingleStep(1)
    self.sw3.setValue(50)
    self.sw3.setDisabled(True)
    self.sw3.valueChanged.connect(self.animation.setW3)
    lPerceptronParam.addWidget(self.sw3, 2, 2)

    # W4
    tw4 = QLabel("<span style='font-family: Serif'><i>w<sub>4</sub></i></span> =")
    tw4.setFixedHeight(50*f)
    lPerceptronParam.addWidget(tw4, 3, 0)

    self.lw4 = QLabel('0.00')
    self.lw4.setDisabled(True)
    lPerceptronParam.addWidget(self.lw4, 3, 1)

    self.sw4 = QSlider(Qt.Horizontal)
    self.sw4.setMinimum(0)
    self.sw4.setMaximum(100)
    self.sw4.setSingleStep(1)
    self.sw4.setValue(50)
    self.sw4.setDisabled(True)
    self.sw4.valueChanged.connect(self.animation.setW4)
    lPerceptronParam.addWidget(self.sw4, 3, 2)

    lPerceptron.addLayout(lPerceptronParam)

    # delta
    tdelta = QLabel("<span style='font-family: Serif'><i>δ</i></span> =")
    tdelta.setFixedHeight(50*f)
    lPerceptronParam.addWidget(tdelta, 4, 0)

    self.ldelta = QLabel('0.00')
    lPerceptronParam.addWidget(self.ldelta, 4, 1)

    self.sdelta = QSlider(Qt.Horizontal)
    self.sdelta.setMinimum(0)
    self.sdelta.setMaximum(100)
    self.sdelta.setSingleStep(1)
    self.sdelta.setValue(50)
    self.sdelta.valueChanged.connect(self.animation.setDelta)
    lPerceptronParam.addWidget(self.sdelta, 4, 2)

    lPerceptron.addLayout(lPerceptronParam)

    tPerceptron.setLayout(lPerceptron)

    # --- Left Menu

    lMenu = QVBoxLayout()

    lMenu.addLayout(lShuffle)
    lMenu.addSpacing(50*f)
    lMenu.addLayout(lParam)
    lMenu.addSpacing(50*f)
    lMenu.addWidget(self.tType)
    lMenu.addStretch(1)
    

    # --- Main layout

    lMain = QHBoxLayout()

    lMain.addLayout(lMenu, 0)
    lMain.addWidget(self.animation.view, 1)

    lMain.setStretch(0, 78)
    lMain.setStretch(1, 100)
    self.setLayout(lMain)

    # --- Language buttons
    
    bEn = QPushButton('', self)
    bEn.setStyleSheet("background-image : url('Images/en.png');")
    bEn.setGeometry(10*f, 10*f, 35, 24)   
    bEn.clicked.connect(lambda: self.setLanguage('en'))

    bFr = QPushButton('', self)    
    bFr.setStyleSheet("background-image : url('Images/fr.png');")
    bFr.setGeometry(35+20*f, 10*f, 35, 24)
    bFr.clicked.connect(lambda: self.setLanguage('fr'))

    # --- Settings ---------------------------------------------------------

    # --- Shortcuts

    self.shortcut = {}

    # Quit
    self.shortcut['esc'] = QShortcut(QKeySequence('Esc'), self)
    self.shortcut['esc'].activated.connect(self.app.quit)

    # --- Language

    self.setLanguage()

    # --- Display

    self.show()
    self.animation.startAnimation()
    self.app.exec()

  def setLanguage(self, language=None):

    if language is not None:
      self.language = language

    match self.language:

      case 'fr':

        # Window title
        self.setWindowTitle('CALM — Modèles de locomotion animale collective')

        # Upper commands
        self.bShuffle.setText('Répartir aléatoirement')
        self.bPlay.setText('Pause')

        # Speed
        self.tSpeed.setText('Vitesse')

        # Noise
        # self.tSigma_in.setText("Bruit de perception")
        self.tSigma_out.setText("Bruit de réorientation")

        # Agents
        self.tType.setTabText(0, 'Agents aveugles')
        self.tType.setTabText(1, 'Agents de Vicsek')
        self.tType.setTabText(2, "Agents d'Aoki-Couzin")
        self.tType.setTabText(3, 'Perceptrons')

        # --- Blind Agents

        self.tBlind.setText("<p>Les agents aveugles ne percoivent pas leurs voisins, et ont des marches aléatoires indépendantes.</p>")

        # --- Vicsek Agents

        self.tVicsek.setText("<p>Les agents de Viscek s'alignent par rapport à leurs voisins proches: à chaque instant ils prennent l'orientation<br><br>moyenne  de tous les agents situés dans un rayon <i>r</i> donné autour d'eux.</p>")
        
        # --- Aoki-Couzin Agents

        self.tAoki.setText("<p>Les agents d'Aoki-Couzin ont 3 zones concentriques autour d'eux: la plus proche est une zone de répulsion,<br><br> la deuxième est une zone d'alignement et la dernière, et la plus éloignée, est une zone d'attraction.</p>")
        
        # --- ANN agents

        self.tPerceptron.setText("<p>Les perceptrons ont un champ perceptif radial. Pour chaque tranche angulaire on calcule un nombre <i>&mu;</i> représentant <br> la proximité des autres agents présents dans la tranche (plus les agents sont proches plus <i>&mu;</i> est grand).<br>Ces nombres servent ensuite d'entrée à un perceptron, un réseau de neurones artificiel très simple dont la sortie<br>donne directement la réorientation de l'agent comme une somme pondérée des entrées.</p>")

        self.cSym.setText('Symétrisation')
        self.bReset.setText('Réinitialiser les poids')

      case 'en':
        
        # Window title
        self.setWindowTitle('CALM — Collective Animal Locomotion Models')

        # Randomization
        self.bShuffle.setText('Shuffle agents')
        self.bPlay.setText('Pause')

        # Speed
        self.tSpeed.setText('Speed')

        # Noise
        # self.tSigma_in.setText("Perception noise")
        self.tSigma_out.setText("Reorientation noise")

        # Agents
        self.tType.setTabText(0, 'Blind agents')
        self.tType.setTabText(1, 'Vicsek agents')
        self.tType.setTabText(2, 'Aoki-Couzin agents')
        self.tType.setTabText(3, 'Perceptrons')

        # --- Blind Agents

        self.tBlind.setText("<p>Blind agents don't perceive their neighbors and have independant random walks.</p>")

        # --- Vicsek Agents

        self.tVicsek.setText("<p>Viscek agents align relatively to their closest neighbors: at each time step they align along the mean orientation<br><br>of all the other agents lying in a disk of radius <i>r</i> around themsleves.</p>")

        # --- Aoki-Couzin Agents

        self.tAoki.setText("<p>Aoki-Couzin agents have 3 concentric zones around them: the closest is a repulsion zone,<br><br> the second is an alignment zone and the last, and furthest, is an attraction zone.</p>")

        # --- ANN agents

        self.tPerceptron.setText("<p>Les réseaux de neurones ont un champs perceptif radial.</p>")

        self.cSym.setText('Symmetrization')
        self.bReset.setText('Reset weights')
# Calibre-Web

Reliez votre bibliothèque [Calibre-Web](https://github.com/janeczku/calibre-web)
(l'interface web d'une bibliothèque de livres numériques Calibre, auto-hébergée)
à Gladys : le nombre de livres, d'auteurs et de séries, le dernier livre ajouté,
les derniers ajouts avec leurs couvertures sur le tableau de bord, et un
événement de scène à chaque nouveau livre.
[Calibre-Web Automated](https://github.com/crocodilestick/calibre-web-automated)
fonctionne de la même façon.

L'intégration a été testée contre de vrais serveurs Calibre-Web 0.6.27 et
Calibre-Web Automated (leurs images Docker), pas encore dans une vraie
installation de Gladys : vos retours sont les bienvenus sur le
[forum Gladys](https://community.gladysassistant.com) ou dans les
[issues](https://github.com/guim31/gladys-calibre-web/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur **Calibre-Web** ou **Calibre-Web Automated** joignable depuis
  Gladys, sur votre réseau (ou derrière un reverse proxy).
- Un **utilisateur Calibre-Web** et son mot de passe. L'intégration lit le
  catalogue OPDS de Calibre-Web au nom de cet utilisateur : elle voit les livres
  qu'il voit. Un compte de lecteur suffit ; un compte dédié est une bonne idée.
  Si la navigation anonyme est activée sur le serveur, l'utilisateur peut
  rester vide.
- Dans les réglages de cet utilisateur, la liste **Ajouts récents** doit rester
  visible (elle l'est par défaut).

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**URL du serveur** avec son port (par
   exemple `http://192.168.1.20:8083` ; derrière un reverse proxy,
   `https://example.org/books`), l'**Utilisateur** et le **Mot de passe**.
3. Si vous le souhaitez, choisissez la fréquence de lecture du serveur (toutes
   les 5 minutes par défaut) et la langue des noms.
4. Enregistrez, puis cliquez sur **Tester la connexion** : elle indique le
   serveur (Calibre-Web ou Calibre-Web Automated), l'utilisateur et les nombres
   trouvés.
5. Dans l'onglet **Découverte**, ajoutez l'appareil **Calibre-Web**.

## Appareil

**Calibre-Web** (un appareil pour le serveur, vu par l'utilisateur configuré) :

| Fonctionnalité           | Signification                                                 |
| ------------------------ | ------------------------------------------------------------- |
| **En ligne**             | 1 tant que l'intégration lit le serveur                       |
| **Livres**               | livres de la bibliothèque                                     |
| **Auteurs**              | auteurs ayant au moins un livre                               |
| **Séries**               | séries ayant au moins un livre                                |
| **Dernier livre ajouté** | titre et auteurs du dernier livre ajouté (« Titre — Auteur ») |

Si la liste des auteurs ou des séries est masquée pour l'utilisateur (réglages
de l'utilisateur dans Calibre-Web), son nombre reste vide.

## Tableau de bord

- **Calibre-Web : derniers ajouts** : une grille des 12 derniers livres
  ajoutés, avec leurs couvertures et leurs auteurs, et les nombres de livres et
  d'auteurs. Le réglage **Afficher les nombres de livres et d'auteurs** masque
  ces deux chiffres.

## Scènes

### Déclencheurs

- **Nouveau livre ajouté** : un nouveau livre apparaît dans la bibliothèque
  Calibre (téléversé dans Calibre-Web, ajouté avec Calibre, ou importé par
  Calibre-Web Automated). Filtre : l'auteur, exactement comme dans Calibre-Web
  (plusieurs auteurs : `Auteur Un, Auteur Deux`). Informations : titre du
  livre, auteur(s).

Rien n'est annoncé au premier démarrage : les livres déjà présents servent de
point de départ.

### Actions

- **Lire les derniers ajouts de Calibre-Web** : une phrase pour une
  notification ou une enceinte, par exemple _« 2 nouveau(x) livre(s) sur
  Calibre-Web ces 7 derniers jours : Pride and Prejudice (Jane Austen) et Twenty
  Years After (Alexandre Dumas). »_ Résultats : la phrase, le nombre de
  nouveaux livres, le titre du dernier (parmi la première page des « Ajouts
  récents », 60 livres par défaut).

### Idées de scènes

- **Un nouveau livre de mon auteur préféré** : quand _Nouveau livre ajouté_
  avec l'auteur renseigné, envoyer une notification « Nouveau livre :
  {title} ».
- **Résumé du dimanche** : chaque dimanche à 10 h, _Lire les derniers ajouts de
  Calibre-Web_, puis envoyer la phrase en message.
- **Bibliothèque familiale** : quand _Nouveau livre ajouté_, dire « Un nouveau
  livre est dans la bibliothèque : {title} » sur l'enceinte du salon.

## Dépannage

- **« le serveur ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Gladys fait tourner l'intégration dans un conteneur :
  `localhost` y désigne le conteneur lui-même, utilisez l'adresse IP de la
  machine.
- **« utilisateur ou mot de passe refusé »** : vérifiez-les en vous connectant
  à Calibre-Web. Un serveur sans navigation anonyme exige un utilisateur.
- **« la liste « Ajouts récents » est masquée pour cet utilisateur »** : dans
  Calibre-Web, Administration → l'utilisateur → réaffichez « Ajouts récents ».
- **« aucun catalogue Calibre-Web (OPDS) à cette adresse »** ou **« l'adresse
  redirige »** : un serveur derrière un reverse proxy demande son chemin de base
  (`https://example.org/books`) ; une page de connexion du proxy bloque le
  catalogue.
- **« certificat refusé »** : le HTTPS avec un certificat auto-signé n'est pas
  pris en charge ; utilisez l'adresse en `http://` de votre réseau.
- Pas de couverture dans le widget : le livre n'en a pas, ou Calibre-Web sert
  une couverture de plus de 300 Ko (Calibre-Web envoie la couverture complète,
  Calibre-Web Automated une petite vignette) : elle est laissée de côté.
- L'intégration ne journalise que son cycle de vie ; avec `LOG_LEVEL=debug`,
  elle journalise aussi chaque nouveau livre, avec son titre.

## Limites

- Calibre-Web n'a pas d'API pour les intégrations : tout vient de son catalogue
  OPDS, celui des liseuses. Le serveur est lu toutes les 1 à 15 minutes (une
  requête légère) ; un nouveau livre arrive dans Gladys dans cet intervalle.
- Le catalogue OPDS ne donne pas de totaux : l'intégration les trouve en
  lisant quelques pages de chaque liste (environ 2 × log2(pages) requêtes), au
  démarrage, toutes les heures et quand les livres récents changent.
- La progression de lecture, les téléchargements et la page de statistiques de
  Calibre-Web ne sont pas accessibles en OPDS sans imiter un navigateur : ils ne
  sont pas lus.
- Au plus 10 événements par lecture (un premier gros import annonce 10 livres,
  pas des centaines), parmi les livres de la première page des « Ajouts
  récents » (60 par défaut).
- Un serveur Calibre-Web et un utilisateur par installation de l'intégration.
- Sans lien avec les projets Calibre-Web et Calibre.

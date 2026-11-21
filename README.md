# Troc Local ♻️

Marketplace locale pour **donner ou échanger des objets** entre voisins : annonces avec photos, carte des objets autour de soi, messagerie en temps réel, profils avec avis et compteur d'impact.

> 🔗 Démo : *(lien à ajouter après déploiement)* · Compte de test : `demo@exemple.fr` / `demo12345` (après `npm run seed`)

![Capture d'écran](docs/screenshot.png)

## Fonctionnalités

- Inscription / connexion sécurisées (bcrypt, sessions httpOnly)
- Publication d'annonces avec jusqu'à 5 photos : format et taille validés, **données GPS supprimées**, variantes 400/800 px générées pour `srcset`
- Recherche plein texte (index FULLTEXT MySQL), filtres par catégorie et ville, pagination
- **Carte des annonces** (Leaflet + OpenStreetMap) : rayon de 2 à 50 km autour de sa ville ou de sa position, liste triée par distance
- **Messagerie en temps réel** (Socket.IO) : messages instantanés, « est en train d'écrire… », notifications sur toutes les pages
- **Profils publics** : note moyenne, avis, badges (« Premier don », « Très fiable »…), objets donnés et récupérés
- **Avis après un don** : le propriétaire indique à qui il a donné l'objet, puis les deux personnes peuvent se noter
- **Compteur d'impact** : kilos d'objets évités à la benne, estimés à partir d'un poids moyen par catégorie
- **Assistant IA (Claude)**, facultatif :
  - **recherche en langage naturel** : « un vélo pour aller au lycée à Ouaga » devient mots-clés + catégorie + ville
  - **modération automatique** des nouvelles annonces (texte et photo) : objets interdits, ventes déguisées, arnaques ; l'auteur reçoit l'explication en temps réel
  - **réponses suggérées** dans la messagerie, à la demande, que l'utilisateur relit avant d'envoyer
- Statut des objets (disponible, réservé, donné) et favoris
- Interface responsive et accessible

## Stack

| Couche | Technologies |
|---|---|
| Front | HTML, CSS, JavaScript (vanilla, Fetch API), Leaflet |
| Back | Node.js, Express, express-session, Multer, Socket.IO, sharp, SDK Anthropic (`@anthropic-ai/sdk`) |
| Base de données | MySQL (mysql2, requêtes préparées) |
| Services externes | [Nominatim](https://nominatim.org) (géocodage des villes et quartiers), tuiles OpenStreetMap |

## Modèle de données

```
users ─┬─< items ─┬─< item_photos
       │          ├─< favorites >─ users
       │          ├─< conversations ─< messages
       │          └─< reviews (reviewer_id / reviewee_id)
       └─────────────────────┘ (buyer_id / seller_id, given_to_id)
categories ─< items           (avg_weight_kg pour le compteur d'impact)
```

## Installation

```bash
git clone <ton-repo> && cd troc-local
npm install
cp .env.example .env          # puis renseigne tes identifiants MySQL
mysql -u root -p < sql/schema.sql
npm run seed                  # optionnel : données de démonstration
npm run dev                   # http://localhost:3000 (port modifiable dans .env)
```

**Pays** : `GEO_COUNTRY` dans `.env` (code ISO à 2 lettres, `bf` par défaut pour le Burkina Faso) limite la recherche des villes à ce pays. Le géocodage respecte les règles d'usage de Nominatim (1 requête par seconde, cache).

**Assistant IA** : renseignez `ANTHROPIC_API_KEY` dans `.env` (clé créée sur [platform.claude.com](https://platform.claude.com)) puis redémarrez. Sans clé, le site fonctionne normalement et les fonctions IA sont simplement masquées. Le modèle par défaut est Claude Opus 5.5 (`AI_MODEL` pour en changer).

**Photos existantes** : `npm run photos:migrate` génère les variantes `srcset` des photos envoyées avant la V2 (relançable sans risque).

**Mise à jour depuis la V1** : `mysql -u root -p troc_local < sql/migration-v2.sql` ajoute les coordonnées, les avis et les poids par catégorie sans perdre les données, puis `sql/migration-v3.sql` ajoute la modération.

### Données de démonstration

`npm run seed` crée 4 comptes à Ouagadougou, Ouaga 2000 et Bobo-Dioulasso (`demo@exemple.fr`, `awa@exemple.fr`, `issouf@exemple.fr`, `mariam@exemple.fr`, mot de passe `demo12345`), 20 annonces illustrées dont 5 déjà données, des conversations et des avis. Le script peut être relancé : il ne remplace que les annonces de ces comptes. Les photos sont dans le domaine public, voir [seed/CREDITS.md](seed/CREDITS.md).

## Choix techniques et sécurité

- **Requêtes préparées** partout (`?`) contre l'injection SQL
- **Échappement HTML** côté front (`esc()`) contre les failles XSS, doublé d'une **Content-Security-Policy** stricte (`script-src 'self'`, aucun script ni style inline)
- **Contrôle d'accès** : seul le propriétaire peut modifier ou supprimer une annonce ; seuls les participants voient une conversation ou reçoivent ses évènements temps réel ; seuls le donneur et le receveur peuvent laisser un avis, une fois par objet
- **Protection CSRF** : chaque requête qui modifie des données doit envoyer le jeton de `/api/csrf` dans l'en-tête `X-CSRF-Token` (géré automatiquement par `api()` côté client)
- **Limite de tentatives** : 8 échecs de connexion par adresse et par email en 15 minutes, 5 créations de compte par heure et par adresse
- **Sessions en base MySQL** : elles survivent au redémarrage du serveur ; le cookie est `Secure` en `NODE_ENV=production`
- **Socket.IO partage la session Express** : pas de jeton supplémentaire, connexion refusée sans session
- **Vie privée** : une annonce est placée au centre de sa commune (jamais l'adresse), légèrement décalée sur la carte ; métadonnées EXIF (dont GPS) retirées des photos
- **Transaction** lors de la création d'une annonce ; photos supprimées du disque si l'enregistrement échoue
- Noms de fichiers générés aléatoirement (UUID), types MIME limités
- **IA** : sorties JSON structurées (`output_config.format`) pour des réponses toujours exploitables ; textes des utilisateurs passés comme données, jamais comme instructions ; repli serveur automatique si le modèle décline une requête ; limite d'appels par adresse IP ; en cas de panne de l'IA, les annonces sont publiées et la recherche classique prend le relais

## Front-End Checklist

Points de la [Front-End Checklist](https://github.com/thedaviddias/Front-End-Checklist) appliqués :

- **Head** : `lang`, `charset`, `viewport`, titre et meta description par page, `theme-color`, favicon SVG, balises Open Graph
- **HTML** : repères sémantiques (`header`, `nav`, `main`, `footer`), lien d'évitement « Aller au contenu », `type` explicite sur les boutons, page 404 dédiée, `robots.txt`
- **JavaScript** : scripts externes chargés en `defer`, aucun script inline
- **Images** : `srcset`/`sizes` avec variantes WebP, `width`/`height` contre les décalages de mise en page, `loading="lazy"` et `decoding="async"`, `alt` renseigné (vide si décoratif)
- **CSS / typo** : polices chargées avec `preconnect` et `display=swap`, `prefers-reduced-motion` respecté, aucune barre de défilement horizontale sur mobile
- **Accessibilité** : focus visible, contrastes AA, onglets ARIA navigables au clavier, notes en étoiles utilisables au clavier, `aria-pressed`/`aria-current`/`aria-live`, messages d'erreur en `role="alert"`, cibles tactiles de 44 px
- **Sécurité** : `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Powered-By` retiré

Restent à faire : HTTPS en production et tests Lighthouse automatisés.

## Pistes d'amélioration

- [x] Messagerie en temps réel avec Socket.IO
- [x] Géolocalisation et recherche par rayon
- [x] Redimensionnement des images (sharp)
- [x] Profils publics avec avis
- [ ] Propositions d'échange (proposer un de ses objets contre un autre)
- [ ] Stockage des images dans le cloud
- [ ] Tests automatisés (Jest + Supertest)
- [x] Protection CSRF et limitation des connexions
- [ ] Limitation générale du nombre de requêtes (reverse proxy ou express-rate-limit)

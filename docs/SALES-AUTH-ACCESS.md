# Connexion réelle et accès Sales

Lot local basé sur main 73a82403c635555902932fc8252c839c4473236d, branche feat/sales-auth-access.

## Fonctionnement livré
- POST /api/v1/auth/login : email normalisé, vérification du mot de passe PBKDF2 existant, utilisateur et appartenance actifs exigés.
- GET /api/v1/auth/me : session et permissions relues en base.
- POST /api/v1/auth/switch-organization : contrôle de l’appartenance active actuelle et cible ; nouveau jeton lié à l’organisation choisie.
- Aucun hash de mot de passe ni jeton de rafraîchissement renvoyé. JWT_SECRET explicite obligatoire.
- Interface sans organisations, permissions ou identifiants fictifs. Jeton uniquement en mémoire ; rechargement du navigateur = nouvelle connexion. Déconnexion locale ; le jeton déjà émis expire au bout d’une heure et n’est pas révoqué par une liste serveur.
- Session relue toutes les 60 secondes pendant l’utilisation. Le backend Delivery Notes relit les permissions à chaque requête ; une révocation est donc immédiate côté serveur.
- Contenu démonté pendant un changement d’organisation ; réponses de connexion/changement reçues après déconnexion ignorées. Une réponse 401 invalide la session correspondante.
- Accès réel aux bons de livraison. Clients/produits locaux filtrés par organisation. Leur synchronisation serveur reste hors périmètre.
- Les pages devis/factures/paiements encore basées sur des données de démonstration sont bloquées dans le layout authentifié jusqu’à leurs lots backend respectifs.

## Préparer une utilisation locale
Depuis la racine du dépôt, installer les dépendances du lockfile, générer le client Prisma correspondant au schéma et compiler l’API :

```powershell
pnpm install --frozen-lockfile
pnpm --filter @nexora/api exec prisma generate --schema src/database/schema.prisma
pnpm --filter @nexora/api build
```

Configurer DATABASE_URL vers une base PostgreSQL locale préparée et JWT_SECRET avec une valeur aléatoire confidentielle. Cette étape ne nécessite aucune nouvelle migration du schéma existant. Pour une base locale neuve uniquement, `prisma db push` peut initialiser le schéma ; ne pas l’appliquer à une base métier existante. La migration Delivery Notes historique contient des contraintes SQL supplémentaires à préserver lors d’une préparation complète.

Provisionnement explicite : renseigner NEXUS_USER_EMAIL, NEXUS_USER_PASSWORD (12 caractères minimum) et NEXUS_ORGANIZATION dans l’environnement du processus, puis lancer :

```powershell
node apps/api/dist/apps/api/src/auth/provision.js
```

La commande crée atomiquement un nouvel utilisateur, une nouvelle organisation et un rôle limité à nexus:delivery-notes:read. Elle refuse de remplacer un email existant et ne fonctionne que sur localhost/127.0.0.1 hors production. Aucun compte ni mot de passe par défaut n’est livré. Retirer NEXUS_USER_PASSWORD de l’environnement après utilisation. Une organisation neuve présente une liste vide de bons de livraison.

Démarrer l’API avec DATABASE_URL et JWT_SECRET, puis le Web avec NEXT_PUBLIC_API_URL pointant sur l’API (défaut http://localhost:3001/api/v1). Se connecter sur /login ; arrivée sur /sales/delivery-notes.

## Validation exécutée
- 36 tests réussis dans 4 suites : auth.integration.test.ts, auth-context.test.ts, delivery-notes-page.test.ts, sales-api.test.ts.
- 6 tests d’intégration sur PostgreSQL réel : connexion et lecture isolée, refus des écritures sans droit, mauvais mot de passe/compte désactivé, retrait des permissions/appartenances, changement d’organisation, rôle d’une autre organisation refusé, tokens altérés/refresh refusés et provisionnement sans écrasement.
- Compilation API et TypeScript Web réussis.
- Programme API compilé démarré : health 200, auth/me sans jeton 401.
- git diff --check réussi.
- Aucun test navigateur visuel exécuté. Les tests UI utilisent React Test Renderer.

Reproduction des tests : préparer une base exclusivement locale auth_test, puis définir AUTH_TEST_DATABASE_URL et exécuter :

```powershell
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand auth.integration.test.ts auth-context.test.ts delivery-notes-page.test.ts sales-api.test.ts
```

La suite PostgreSQL est explicitement ignorée sans AUTH_TEST_DATABASE_URL. Elle crée uniquement des données de test ; ne jamais la diriger vers une base applicative.

## Limites et suite
Lot de développement local, sans déploiement ni publication. Avant exposition publique, compléter notamment la limitation des tentatives de connexion et la gestion de sessions de production (révocation, renouvellement, transport sécurisé). Aucun module devis, CRUD factures, paiement ou synchronisation clients/catalogue ajouté.

Prochain lot : factures Prisma (création, lecture, édition des brouillons), en conservant l’émission et reconcileSalesStock déjà intégrés. PR #10 doublon de #9 ; PR #7 référence métier à adapter, aucune fusion globale recommandée.

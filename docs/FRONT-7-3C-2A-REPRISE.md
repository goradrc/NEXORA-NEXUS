# FRONT-7 Lot 3C-2A — backend Delivery Notes

## Base et périmètre

Branche locale : `feat/front-7-3c-2a-delivery-notes-prisma`.
Base : `4efb67c7df95fca2675954bb6eac11ca7dc49103` (PR #9 fusionnée).
L'arbre de cette base est identique à celui de `60e3bec9a7784ccad2779e60e67513321fd5f0b1`.
Worktree isolé ; aucun ancien stash appliqué. Aucun commit, push ou merge.

## Implémentation

- Module NestJS réellement enregistré, Prisma PostgreSQL, aucun stockage métier en mémoire.
- GET liste (100 éléments, `?offset=100` pour la page suivante), GET détail, POST création, PUT édition, POST `/:id/ship`, `/:id/deliver`, `/:id/cancel`, sous `/api/v1/nexus/delivery-notes`.
- Intégration minimale `POST /api/v1/nexus/invoices/:id/issue` pour une facture DRAFT existante. Pas de CRUD Invoice, Quote ou Payment ajouté.
- Jeton Bearer HS256 vérifié, expiration obligatoire et contexte tenant dérivé du jeton. `JWT_SECRET` doit être configuré ; un refresh token est refusé.
- Membre et utilisateur actifs, rôle global ou du même tenant, permissions chargées en base à chaque opération, y compris lors d'un replay idempotent.
- Permissions `nexus:delivery-notes:read/create/update/manage` et `nexus:invoices:manage`, avec les overrides existants `nexus:admin` et `*`. Migration : enregistrement des codes uniquement, aucun rôle n'est élargi.
- Client, catalogue, facture et devis vérifiés dans le tenant. Lien devis accepté ou converti, client cohérent. `quoteId` ajouté au schéma et au DTO de réponse partagé.
- Numéro BL-YYYY-NNNN par tenant/année, contrainte unique et compteur transactionnel initialisé depuis les numéros existants.
- Seul DRAFT est modifiable. DRAFT → SHIPPED → DELIVERED ; DRAFT/SHIPPED → CANCELLED. Une transition vers le même état est sans effet supplémentaire. Aucun retour après DELIVERED.
- La sortie de stock se produit uniquement à DELIVERED (ou à l'émission de la facture), jamais à SHIPPED. SERVICE n'a aucun mouvement.
- Registre commun Invoice/DeliveryNote par tenant et produit : consommation cumulée des BL livrés tant que la facture est DRAFT ; émission de la facture ne consomme que le complément. Une facture déjà consommée couvre les BL ultérieurs. Le total livré ne peut dépasser les quantités facturées, produits répétés agrégés.
- Transaction Serializable avec reprises bornées pour les conflits de concurrence ; déduction conditionnelle et contrainte SQL contre le stock négatif/non fini. Calcul décimal pour les quantités fractionnaires, en conservant le schéma Float historique.
- Transition, mouvements, allocation, compteur, audit Prisma et enregistrement idempotent sont atomiques.
- Création : clé obligatoire dans `Idempotency-Key` ou `idempotencyKey` du DTO. Les deux doivent correspondre si présents. PUT accepte une clé d'en-tête pour un replay exact ; les transitions et l'émission sont aussi naturellement sans effet répété. Les clés sont persistées par tenant et acteur avec empreinte du payload ; réutilisation avec une autre opération/contenu = 409.
- Historique de stock antérieur sans registre, ou facture déjà émise sans allocation : 409 `LEGACY_STOCK_RECONCILIATION_REQUIRED`, sans tentative de recalcul automatique.

## Validation

Résultat final : 36/36 tests PASS (9 tests unitaires et 27 tests PostgreSQL/HTTP), compilation PASS et git diff --check PASS. Les tests ciblés comprennent : auth HTTP, RBAC de lecture/écriture/replay, accès croisé, validation, états, SERVICE/PRODUCT, idempotence après reconnexion et en concurrence, stock insuffisant, rollback après échec audit, doubles livraisons, livraisons concurrentes avec stock limité, facture/BL dans les deux ordres et simultanément, livraisons partielles et décimales, héritage de stock, contrainte SQL.

Compilation API réelle puis démarrage du programme compilé vérifiés (route protégée HTTP 401 sans jeton).
Les deux imports runtime du Core utilisent son chemin source relatif, compilé dans la sortie API, car le package historique pointe vers `src/index.ts` et n'est pas exécutable directement par Node dans ce contexte. Aucun changement du package Core.

Migration testée depuis le schéma BACKEND-0 dans un schéma PostgreSQL isolé : un numéro existant BL-2026-0070 initialise bien le compteur à 70 ; les cinq permissions sont créées.
Aucune migration appliquée à une base applicative ou distante.

## Reproduire les tests

1. Installer les dépendances du lockfile et générer Prisma 5.22 depuis `apps/api/src/database/schema.prisma`.
2. Préparer une base PostgreSQL locale dédiée nommée `delivery_test`. Ne pas utiliser une base applicative. Le test vérifie le nom et l'hôte local.
3. Initialiser cette base avec le schéma de la base Git `4efb67c7df95fca2675954bb6eac11ca7dc49103`, puis exécuter le SQL de `apps/api/src/database/migrations/20260909_delivery_notes/migration.sql`. Le dossier migrations n'avait pas de baseline ; ce SQL est une évolution du schéma existant, pas une initialisation à vide.
4. Définir `DELIVERY_TEST_DATABASE_URL` vers cette base dédiée.
5. Exécuter : `node --experimental-vm-modules node_modules/jest/bin/jest.js apps/api/test/delivery-notes --runInBand`.
6. Compiler : `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --incremental false`.

Sans `DELIVERY_TEST_DATABASE_URL`, la suite PostgreSQL est explicitement ignorée. Les tests génèrent leurs propres tenants et une clé JWT temporaire ; ne pas les exécuter en production. Le flag VM permet à Jest de charger NestJS 12 ESM.

## Suite après revue

- Revoir le diff et la migration avant toute publication. Le SQL est transactionnel : il refuse les doublons de numéros ou stocks historiques invalides, sans les réparer automatiquement.
- Avant déploiement sur une base existante : vérifier les données, faire la baseline du schéma et décider explicitement de la réconciliation des stocks historiques. Aucun déploiement automatique n'est inclus.
- Le frontend 3C-2B reste hors périmètre : câbler notamment `ship`, `cancel`, la pagination et une clé stable par tentative de création. L'actuel client web contient seulement `deliver` pour les transitions.
- Une facture doit déjà exister pour être liée. Changer le lien Invoice après création ou facturer rétroactivement un BL autonome n'est pas exposé dans ce lot.
- Ne pas autoriser un futur service Invoice/Stock à contourner `reconcileSalesStock` : le test dans les deux ordres doit rester obligatoire.

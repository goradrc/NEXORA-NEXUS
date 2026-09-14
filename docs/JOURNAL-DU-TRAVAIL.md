# Journal du travail

## 14 septembre 2026 — Connexion réelle et accès Sales
Création de la branche isolée feat/sales-auth-access depuis main 73a82403. Ajout de la connexion Prisma, session/permissions et changement d’organisation ; provisionnement local explicite d’un lecteur Sales ; suppression des données fictives de session ; protection du layout et blocage des écrans Sales non branchés au backend ; filtrage tenant des référentiels locaux Delivery Notes.

Validation : 36 tests PASS / 4 suites, compilation API et TypeScript Web PASS, smoke test API compilée PASS, diff --check PASS. Le premier essai d’intégration a dépassé le timeout de démarrage (corrigé à 30 s) ; une requête de test sans clé d’idempotence a été corrigée avant le résultat final. Aucune publication. Voir SALES-AUTH-ACCESS.md pour les limites et instructions.

## Reprise et revue ciblée
Archive vérifiée et comparée aux 96 fichiers du workspace original ; reprise dans une copie indépendante. Correction du contrôle périodique de session après échec du switch-org, avec test de régression. Les 5 tests AuthContext passent. Aucun autre changement fonctionnel ; aucun push, merge, déploiement ni travail Factures Prisma.

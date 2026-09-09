# NEXORA NEXUS — revue ciblée 3C-2A

Verdict : défauts identifiés corrigés ; prêt pour validation du commit. Aucun commit, push, merge ou déploiement effectué.

Base : 4efb67c7df95fca2675954bb6eac11ca7dc49103.
Branche : feat/front-7-3c-2a-delivery-notes-prisma.

## Défauts reproduits puis corrigés

| Priorité | Défaut | Correction et preuve |
|---|---|---|
| P1 | Émettre une facture liée à un ancien BL DELIVERED sans registre ni mouvement identifiable pouvait déduire une seconde fois son stock. | Vérification que les allocations couvrent les livraisons antérieures avant toute déduction. Sinon 409 LEGACY_STOCK_RECONCILIATION_REQUIRED ; statut de facture et stock restent inchangés. Test PostgreSQL échouant avant correction, réussi après. |
| P2 | totalPrice incluait la taxe alors que le contrat Sales et LineItemEditor attendent un total hors taxe. | Calcul décimal HT après remise, arrondi à deux décimales. Exemple : 2 × 10, remise 10 %, taxe 20 % → totalPrice 18, auparavant 21,60. Test reproduit puis passé. |
| P2 | Une référence facture/devis vide pouvait atteindre la contrainte de clé étrangère et provoquer une erreur interne. | Validation non vide dès qu'un identifiant facultatif est fourni. Test reproduit puis passé. |

## Périmètre relu

Services et contrôleurs NestJS, garde d'authentification, autorisation en base, filtrage tenant, contrôle des sources, transitions, idempotence, compteur, allocations Invoice/DeliveryNote, déduction conditionnelle, audit atomique, migration SQL et contrat de ligne partagé.

Les refus RBAC sont appliqués avant la lecture du cache idempotent. Les conflits de transactions sont repris de façon bornée. Le code des mutations interdit la modification du tenant et des liens source. Le registre commun et les transactions sérialisables restent couverts dans les deux ordres facture/BL et en concurrence.

## Vérifications après correction

- 36/36 tests PASS : 9 unitaires et 27 PostgreSQL/HTTP.
- Compilation API PASS.
- git diff --check PASS.
- Les 3 nouveaux tests échouaient avant les corrections.
- La migration SQL n'a pas changé pendant cette revue ; son contrôle précédent sur schéma isolé, y compris compteur initialisé à 70 et permissions, reste valable. Pas de relance inutile.
- Base PostgreSQL locale de test arrêtée après vérification. Aucun accès à une base applicative distante.

## Conditions avant déploiement

La revue est ciblée, effectuée dans cette même session ; ce n'est pas un audit indépendant.
Le schéma applicatif réel et ses données historiques n'ont pas été examinés. La baseline de migration, les doublons de numéros, stocks historiques invalides et allocations manquantes doivent être traités avant une migration applicative. Le code bloque les historiques ambigus au lieu d'inventer une réconciliation.

La création nécessite une clé idempotente stable. Le futur frontend doit aussi intégrer ship/cancel et la pagination. Le CRUD Invoice complet et le rattachement rétroactif d'un BL autonome restent hors périmètre. Aucun blocage supplémentaire identifié dans le périmètre revu, sous ces limites.

Prochaine étape : validation utilisateur du diff corrigé, puis commit local. La publication et la PR nécessitent toujours la validation utilisateur.

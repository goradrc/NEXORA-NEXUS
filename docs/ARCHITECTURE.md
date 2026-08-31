# ARCHITECTURE & SPÉCIFICATION TECHNIQUE FINALE - NEXORA & NEXORA NEXUS

## 1. VISION & STRATÉGIE GLOBALE
NEXORA est une plateforme logicielle modulaire multi-entreprises, conçue pour évoluer à travers divers domaines métiers (**NEXORA NEXUS** pour la gestion d'entreprise, **NEXORA VITALIS** pour la santé, etc.).

Le premier produit à développer est **NEXORA NEXUS**, une solution professionnelle ERP/gestion d'entreprise robuste, moderne, offline-first et hautement évolutive.

---

## 2. CHOIX TECHNOLOGIQUES ET JUSTIFICATION

| Composant | Technologie Choisie | Alternatives considérées | Justification technique |
| :--- | :--- | :--- | :--- |
| **Monorepo & Package Manager** | **pnpm workspaces / Turborepo** | npm workspaces, Lerna | Gestion ultra-rapide des dépendances, partage strict de code entre backend (`apps/api`), frontend (`apps/web`), packages `core`, `nexus`, et `ui-components`. |
| **Frontend Web / PWA** | **React / Next.js (App Router)** + **Tailwind CSS** + **Shadcn UI** | Vue.js, Svelte | Rendu hybride (SSR/Client PWA), typage TypeScript natif, écosystème UI moderne, possibilité de packaging Desktop (Electron/Tauri) sans réécriture. |
| **Backend / API Engine** | **TypeScript + NestJS** | Go (Fastify), Python (FastAPI) | Architecture modulaire basée sur la dépendance d'injection, parfaitement alignée avec l'isolation de `NEXORA CORE` et `NEXORA NEXUS`. Clean Architecture / DDD supporté nativement. |
| **Base de Données Serveur** | **PostgreSQL** avec **Prisma ORM** | MySQL, MongoDB | Gestion relationnelle robuste, contraintes d'intégrité strictes, support JSONB pour configurations dynamiques, et isolation multi-tenant garantie par clés d'organisation et Row Level Security (RLS). |
| **Base de Données Locale (Offline-First Client)** | **Dexie.js / RxDB (IndexedDB)** | SQLite (via WASM) | Intégration PWA native dans le navigateur sans plugin natif lourd, réactivité d'état frontend, support d'index complexes et réplication locale ultra-rapide. |
| **Moteur de Synchronisation** | **Custom Delta-Sync Protocol (JSON Batch Engine)** | CouchDB/PouchDB, CRDTs complexes | Protocole sur-mesure basé sur des files de mutations (`sync_queue`), estampilles UTC, UUIDs clients et réconciliation atomique côté serveur (gestion spécifique des numéros séquentiels et stocks). |
| **Authentification & Sécurité** | **JWT (HttpOnly Cookies)** + **Argon2id** + **RBAC/ABAC** | Supabase Auth, Auth0 | Contrôle 100% autonome du stockage des utilisateurs, isolation multi-tenant immédiate par `organization_id`, sessions révocalement sécurisées et support du mode hors-ligne. |

---

## 3. SEPARATION DES DOMAINES : NEXORA CORE vs NEXORA NEXUS

### A. NEXORA CORE (Couche Centrale Partagée & Indépendante)
NEXORA CORE est la couche socle sur laquelle reposent tous les modules actuels et futurs. **Aucune logique métier spécifique à la gestion d'entreprise (factures, stocks, clients) n'existe dans CORE.**

**Périmètre strict de CORE :**
1. **Multi-Tenancy & Isolation :** Gestion des Organisations / Entreprises (`organization_id`), abonnements, statut d'activité.
2. **Identity & User Management :** Comptes utilisateurs globaux, profils, authentification, sessions, hachage sécurisé.
3. **Sécurité & RBAC/ABAC :** Définition des rôles système/entreprise, permissions granulaires, middleware/guards d'autorisation.
4. **Moteur de Synchronisation Offline-First :** Endpoints de push/pull delta, gestion des files de synchronisation (`sync_queue`), gestion globale des conflits.
5. **Bus d'Événements Inter-Modules (Event Bus) :** Émission/réception d'événements système (`USER_AUTHENTICATED`, `ORGANIZATION_CREATED`).
6. **Journalisation & Traçabilité (Audit Log) :** Capture de toutes les actions sensibles (Qui, Quoi, Quand, IP, Entité).
7. **Paramètres Globaux & Dictionnaires :** Devises, langues, pays, fuseaux horaires.
8. **Services Partagés Infra :** Moteur de génération PDF/Documents, service d'envoi de mail/notifications, stockage de fichiers.

### B. NEXORA NEXUS (Module Métier Gestion d'Entreprise)
NEXORA NEXUS consomme les services de CORE pour fournir les fonctionnalités ERP.

**Périmètre métier de NEXUS :**
1. **Tableau de bord (Dashboard) :** KPIs financiers, ventes, alertes de stock, créances.
2. **Gestion de l'Entreprise :** Profil commercial, logo, identité visuelle, pied de page des documents.
3. **Clients (CRM) :** Annuaire clients, coordonnées, historique des ventes, solde de créances.
4. **Fournisseurs (Achats) :** Annuaire fournisseurs, coordonnées, conditions de paiement, solde de dettes.
5. **Produits & Services :** Catalogues, références SKU, prix d'achat/vente, unités, seuils de réapprovisionnement.
6. **Stocks & Entrepôts :** Entrées, sorties, ajustements, inventaires, transferts.
7. **Commandes Achats (Purchase Orders) :** Bons de commande auprès des fournisseurs.
8. **Devis / Factures Proforma :** Création, statut, conversion en factures/BL.
9. **Ventes Directes :** Prise de commande rapide en caisse ou comptoir.
10. **Bons de Livraison (Delivery Notes) :** Préparation, expédition, confirmation de livraison (`DRAFT`, `SHIPPED`, `DELIVERED`).
11. **Facturation :** Factures de vente, numérotation séquentielle, avoirs, statuts.
12. **Paiements & Encaissements :** Règlements clients, acomptes, paiements partiels/complets, modes de règlement.
13. **Dépenses & Charges :** Saisie des dépenses, catégories, justificatifs numérisés.
14. **Finance & Trésorerie :** Suivi du cash-flow, créances, dettes fournisseurs, résultat financier.
15. **Personnel / Employés :** Fiches employés, affectation aux rôles métier.
16. **Rapports & Analytics :** Synthèses de ventes, stocks, bénéfices, exports Excel/PDF.

---

## 4. ARCHITECTURE DU MONOREPO (`pnpm workspaces`)

```text
nexora/
├── docs/
│   └── ARCHITECTURE.md
├── packages/
│   ├── core/                      # NEXORA CORE (Library centrale)
│   │   ├── src/
│   │   │   ├── auth/              # Tokens, hachage, sessions
│   │   │   ├── security/          # RBAC / Permissions guards
│   │   │   ├── tenant/            # Context multi-tenant & middleware
│   │   │   ├── sync/              # Moteur & protocoles offline
│   │   │   ├── audit/             # Tracé d'audit
│   │   │   ├── events/            # Bus d'événements
│   │   │   └── pdf/               # Moteur de génération de documents PDF
│   │   └── package.json
│   │
│   ├── nexus/                     # NEXORA NEXUS (Domaine ERP)
│   │   ├── src/
│   │   │   ├── company/
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── catalog/
│   │   │   ├── inventory/
│   │   │   ├── sales/
│   │   │   ├── quotes/
│   │   │   ├── delivery/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── expenses/
│   │   │   ├── finance/
│   │   │   ├── employees/
│   │   │   └── reports/
│   │   └── package.json
│   │
│   └── ui-components/             # Design System Nexora (React / Tailwind)
│       ├── src/
│       │   ├── buttons/
│       │   ├── data-tables/
│       │   ├── forms/
│       │   ├── modals/
│       │   └── layout/
│       └── package.json
│
├── apps/
│   ├── api/                       # Service Backend (NestJS + Prisma)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── core/          # Contrôleurs & Services CORE
│   │   │   │   └── nexus/         # Contrôleurs & Services NEXUS
│   │   │   ├── database/          # Prisma Schema, Migrations, Seeds
│   │   │   └── main.ts
│   │   └── package.json
│   │
│   └── web/                       # Application Frontend (Next.js PWA)
│       ├── src/
│       │   ├── app/               # Routes Next.js App Router
│       │   ├── components/        # Composants de pages
│       │   ├── offline/           # Dexie.js (IndexedDB local & Worker)
│       │   └── hooks/
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. MODÈLE DE DONNÉES COMPLET & RELATIONS

### A. ENTITÉS NEXORA CORE (Toutes isolées par ID)

1. **`organizations`**
   - `id` (UUID, PK)
   - `name`, `legal_name`, `logo_url`, `tax_id` (NIF/STAT)
   - `email`, `phone`, `address`, `city`, `country`
   - `currency` (Devise par défaut: EUR, USD, MGA, XOF...), `timezone`
   - `created_at`, `updated_at`

2. **`users`**
   - `id` (UUID, PK)
   - `email` (Unique), `password_hash`
   - `first_name`, `last_name`, `phone`
   - `is_active` (Boolean)
   - `created_at`, `updated_at`

3. **`organization_users`**
   - `id` (UUID, PK)
   - `organization_id` (FK -> `organizations.id`)
   - `user_id` (FK -> `users.id`)
   - `role_id` (FK -> `roles.id`)
   - `status` (`ACTIVE`, `INACTIVE`, `INVITED`)

4. **`roles` & `permissions`**
   - `roles`: `id` (UUID), `organization_id` (NULL si rôle système), `name`, `description`
   - `permissions`: `id` (UUID), `code` (ex: `nexus:invoices:create`), `description`
   - `role_permissions`: `role_id`, `permission_id`

5. **`audit_logs`**
   - `id` (UUID, PK), `organization_id`, `user_id`
   - `action` (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`), `entity_name`, `entity_id`
   - `changes` (JSONB), `ip_address`, `timestamp`

6. **`sync_queue` / `sync_deltas`**
   - `id` (UUID, PK), `organization_id`, `user_id`, `device_id`
   - `entity_type`, `entity_id`, `operation` (`INSERT`, `UPDATE`, `DELETE`)
   - `payload` (JSONB), `client_timestamp`, `server_timestamp`, `status` (`PENDING`, `APPLIED`, `CONFLICT`)

---

### B. ENTITÉS NEXORA NEXUS (Multi-tenant via `organization_id`)

1. **`customers`** (Clients)
   - `id` (UUID, PK), `organization_id` (FK)
   - `code` (ex: `CLI-001`), `name`, `company_name`, `email`, `phone`, `address`, `city`
   - `tax_number`, `balance` (Créance globale accumulée)
   - `created_at`, `updated_at`

2. **`suppliers`** (Fournisseurs - *Module 4/Achats*)
   - `id` (UUID, PK), `organization_id` (FK)
   - `code` (ex: `FOURN-001`), `name`, `company_name`, `email`, `phone`, `address`
   - `tax_number`, `balance_due` (Dette globale envers le fournisseur)
   - `payment_terms` (ex: 30 jours), `created_at`, `updated_at`

3. **`employees`** (Personnel - *Module 13*)
   - `id` (UUID, PK), `organization_id` (FK), `user_id` (FK optionnel -> `users.id`)
   - `employee_number`, `first_name`, `last_name`, `position`, `email`, `phone`
   - `hire_date`, `status` (`ACTIVE`, `INACTIVE`)

4. **`categories`** (Catégories Produits / Services / Dépenses)
   - `id` (UUID, PK), `organization_id` (FK)
   - `name`, `type` (`PRODUCT`, `SERVICE`, `EXPENSE`)

5. **`products_services`** (Catalogues - *Module 5*)
   - `id` (UUID, PK), `organization_id` (FK), `category_id` (FK), `default_supplier_id` (FK optionnel -> `suppliers.id`)
   - `type` (`PRODUCT` / `SERVICE`), `reference` (SKU), `name`, `description`
   - `sale_price`, `purchase_cost`, `tax_rate` (TVA %)
   - `current_stock`, `min_stock_alert`
   - `unit` (Pièce, Kg, Heure, Litre, Mètre)

6. **`stock_movements`** (Gestion des Stocks - *Module 6*)
   - `id` (UUID, PK), `organization_id` (FK), `product_id` (FK -> `products_services.id`)
   - `type` (`IN`, `OUT`, `ADJUSTMENT`)
   - `quantity`, `unit_cost`
   - `reason`, `reference_doc_type` (`INVOICE`, `DELIVERY_NOTE`, `PURCHASE_ORDER`, `MANUAL`), `reference_doc_id`
   - `created_at`, `created_by` (FK -> `users.id`)

7. **`purchase_orders`** (Commandes Achats Fournisseurs)
   - `id` (UUID, PK), `organization_id` (FK), `supplier_id` (FK -> `suppliers.id`)
   - `po_number` (ex: `PO-2025-001`), `status` (`DRAFT`, `ORDERED`, `RECEIVED`, `CANCELLED`)
   - `total_untaxed`, `total_tax`, `total_amount`
   - `order_date`, `expected_date`, `created_at`

8. **`quotes`** (Devis & Proformas - *Module 8*)
   - `id` (UUID, PK), `organization_id` (FK), `customer_id` (FK -> `customers.id`)
   - `quote_number` (ex: `DEV-2025-001`), `status` (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `CONVERTED`)
   - `total_untaxed`, `total_tax`, `total_amount`, `valid_until`, `created_at`

9. **`invoices`** (Factures - *Module 9*)
   - `id` (UUID, PK), `organization_id` (FK), `customer_id` (FK -> `customers.id`), `quote_id` (FK optionnel -> `quotes.id`)
   - `invoice_number` (ex: `FAC-2025-001`), `status` (`DRAFT`, `UNPAID`, `PARTIAL`, `PAID`, `CANCELLED`)
   - `total_untaxed`, `total_tax`, `total_amount`, `amount_paid`, `amount_due`
   - `due_date`, `created_at`

10. **`delivery_notes`** (Bons de Livraison - *Module 8/Logistique*)
    - `id` (UUID, PK), `organization_id` (FK), `customer_id` (FK -> `customers.id`), `invoice_id` (FK optionnel -> `invoices.id`)
    - `delivery_number` (ex: `BL-2025-001`), `status` (`DRAFT`, `SHIPPED`, `DELIVERED`, `CANCELLED`)
    - `shipping_address`, `carrier_name`, `tracking_number`
    - `shipped_at`, `delivered_at`, `notes`, `created_at`

11. **`delivery_items` / `invoice_items` / `quote_items` / `po_items`**
    - `id` (UUID, PK), `parent_id` (FK vers BL, Facture, Devis ou PO)
    - `product_service_id` (FK -> `products_services.id`)
    - `description`, `quantity`, `unit_price`, `tax_rate`, `discount_percent`, `total_price`

12. **`payments`** (Encaissements - *Module 10*)
    - `id` (UUID, PK), `organization_id` (FK), `customer_id` (FK -> `customers.id`), `invoice_id` (FK -> `invoices.id`)
    - `payment_number` (ex: `PAY-2025-001`), `amount`
    - `payment_method` (`CASH`, `BANK_TRANSFER`, `CHECK`, `MOBILE_MONEY`, `CARD`)
    - `reference_code`, `payment_date`, `created_at`

13. **`expenses`** (Dépenses - *Module 11*)
    - `id` (UUID, PK), `organization_id` (FK), `category_id` (FK -> `categories.id`), `supplier_id` (FK optionnel -> `suppliers.id`)
    - `description`, `amount`, `payment_method`, `receipt_url`, `expense_date`, `created_at`

---

## 6. STRATÉGIE OFFLINE-FIRST & SYNCHRONISATION

1. **Génération d'Identifiants Clients (UUID v4) :**
   - Toutes les entités générées hors-ligne possèdent un UUID unique universel dès leur création locale dans IndexedDB.

2. **File de Mutation locale (`sync_queue`) :**
   - Toute opération d'écriture (Création client, vente hors-ligne) enregistre une mutation dans IndexedDB (`operation`: `INSERT`/`UPDATE`/`DELETE`, `payload`, `timestamp_utc`).

3. **Numérotation Séquentielle Légale en Offline :**
   - En mode hors-ligne, les factures et bons de livraison reçoivent un identifiant provisoire (ex: `TEMP-FAC-DEV1-001`).
   - Lors de la synchronisation au serveur, le backend attribue le numéro officiel séquentiel inaltérable (`FAC-2025-042`).

4. **Résolution des Conflits :**
   - **Stratégie générique :** *Last-Write-Wins* basé sur les horodatages UTC vérifiés par le serveur.
   - **Mouvements de Stocks :** Les mouvements de stock sont enregistrés comme des deltas cumulatifs append-only pour éviter l'écrasement de valeur absolue.

---

## 7. PLAN DÉTAILLÉ DE LA PHASE 1 (INITIATION DU PROJET & CORE ENGINE)

Une fois cette spécification validée, la **Phase 1** sera exécutée selon le découpage suivant :

1. **Étape 1.1 — Initialisation du Monorepo pnpm & turborepo**
   - Configuration du `pnpm-workspace.yaml`, du `tsconfig.base.json`, de `.eslintrc` et `.prettierrc`.
   - Structure des dossiers `apps/api`, `apps/web`, `packages/core`, `packages/nexus`, `packages/ui-components`.

2. **Étape 1.2 — Modèle de Données Server (Prisma ORM & PostgreSQL)**
   - Rédaction du fichier `schema.prisma` dans `apps/api/src/database`.
   - Définition des entités CORE (`organizations`, `users`, `organization_users`, `roles`, `permissions`, `audit_logs`, `sync_queue`).
   - Définition des entités NEXUS initiales (`customers`, `suppliers`, `categories`, `products_services`, `stock_movements`, `quotes`, `invoices`, `delivery_notes`, `payments`, `expenses`).
   - Génération des migrations SQL initiales.

3. **Étape 1.3 — Développement du Package `packages/core` & Backend Services**
   - Service d'Authentification (Inscription, Connexion, Hachage Argon2id, JWT Access + Refresh tokens).
   - Middleware Multi-tenant d'isolation par `organization_id`.
   - Système de Sécurité RBAC/ABAC (Guards NestJS et Décorateurs `@RequirePermission()`).
   - Service d'Audit Log (Enregistrement automatique des actions).

4. **Étape 1.4 — Développement du Frontend Base (`apps/web` - Next.js App Router)**
   - Setup du layout principal, intégration Tailwind CSS & Shadcn UI.
   - Écran de Connexion / Inscription / Sélection d'Organisation.
   - Configuration de la base de données locale IndexedDB (`Dexie.js`) pour la préparation offline-first.

5. **Étape 1.5 — Tests & Validation Socle CORE**
   - Tests unitaires backend (Auth, JWT, Middleware isolation multi-tenant).
   - Validation que la tentative d'accès aux données d'une organisation par un utilisateur d'une autre organisation est rejetée (HTTP 403/404).

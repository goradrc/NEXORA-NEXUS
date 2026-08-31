# ARCHITECTURE & SPECIFICATION TECHNIQUE - NEXORA & NEXORA NEXUS

## 1. VISION & STRATÉGIE GLOBAL
NEXORA est une plateforme logicielle modulaire multi-entreprises, conçue pour évoluer à travers divers domaines métiers (NEXUS pour la gestion d'entreprise, VITALIS pour la santé, etc.).

L'objectif premier est de construire **NEXORA NEXUS**, le module d'ERP/gestion d'entreprise robuste, moderne, offline-first et hautement évolutif.

---

## 2. CHOIX TECHNOLOGIQUES & JUSTIFICATION

| Composant | Technologie Proposée | Alternative(s) | Raison du choix |
| :--- | :--- | :--- | :--- |
| **Frontend Web/Desktop** | **React / Next.js (App Router)** + **Tailwind CSS** + **Shadcn UI / Lucide icons** | Vue.js / Svelte | Écosystème riche, rendu hybride (SSR/SSG/Client), typage TypeScript strict, grande maintenabilité et compatibilité PWA/Desktop (Electron/Tauri). |
| **Backend / API** | **Node.js (NestJS / Express)** ou **Go / Fastify** (Recommandation: **TypeScript + NestJS**) | Python (FastAPI), Laravel | NestJS offre une architecture modulaire native par dépendances (parfait pour séparer CORE et NEXUS), support du typage fort TypeScript, décorateurs et architecture DDD/Clean Architecture. |
| **Base de Données Principale (Cloud/Serveur)** | **PostgreSQL** (avec **Prisma ORM** ou **Drizzle ORM**) | MySQL, MongoDB | Gestion relationnelle avancée, support JSONB pour attributs dynamiques, robustesse, contraintes multi-tenancy fortes et support RLS (Row Level Security). |
| **Base de Données Locale (Offline-First Client)** | **RxDB** / **WatermelonDB** / **IndexedDB (Dexie.js)** | SQLite local | RxDB / Dexie.js s'intègre naturellement dans le navigateur avec IndexedDB et offre une réplication réactive bidirectionnelle. |
| **Synchronisation Offline-First** | **CouchDB/PouchDB protocol** ou **Replicated Log / CRDT / Custom Delta-Sync Engine API** | WebSockets bruts | Stratégie d'enregistrements avec numéros de version, horodatage vectoriel ou Log Delta pour résolution des conflits (Last-Write-Wins ou intervention utilisateur). |
| **Authentification & Sécurité** | **JWT (Access + Refresh Token in HttpOnly Cookies)** + **Argon2id/Bcrypt** + **RBAC/ABAC** | OAuth2 / Auth0 / Supabase Auth | Total contrôle sur le multi-tenant, isolation strict par `organization_id`, sessions révocables et support du fonctionnement offline local en cache sécurisé. |

---

## 3. ARCHITECTURE NEXORA CORE vs NEXORA NEXUS

### A. NEXORA CORE (Plateforme Centrale Partagée)
`NEXORA CORE` fournit l'infrastructure sous-jacente indispensable et réutilisable par tous les modules futurs.

**Responsabilités de CORE :**
1. **Multi-Tenancy & Isolation :** Gestion des Organisations / Entreprises, abonnements et périmètres de données (`tenant_id` / `organization_id`).
2. **Gestion des Utilisateurs & Identity Management :** Authentification (AuthN), comptes utilisateurs, profils globalisés.
3. **Sécurité & Contrôle d'Accès (RBAC/ABAC) :** Définition des rôles, permissions granulaires, guardes d'API, middleware d'autorisation.
4. **Moteur de Synchronisation Offline-First :** API de synchronisation delta, gestion de la file d'attente de mutation (`sync_queue`), détection/résolution de conflits.
5. **Bus de Communication Inter-Modules (Event Bus) :** Événements système (ex: `USER_CREATED`, `ORGANIZATION_UPDATED`).
6. **Journalisation et Audit (Audit Log) :** Traçabilité des actions sensibles (qui a fait quoi, quand, sur quelle entité).
7. **Paramètres Globaux & Configuration Système :** Langues, devises globales, préfixes, connecteurs d'intégration.
8. **Services Partagés :** Notifications (Email, SMS, in-app), stockage de fichiers (S3 / stockage local), génération de templates PDF/Documents.

### B. NEXORA NEXUS (Module Métier Gestion d'Entreprise)
`NEXORA NEXUS` est le module ERP fonctionnel qui consomme les services de CORE.

**Responsabilités de NEXUS :**
1. **Tableau de Bord (Dashboard) :** KPIs (CA, dépenses, bénéfices, créances, alertes stock).
2. **Gestion des Clients & Fournisseurs :** Annuaire CRM, historique des transactions, soldes.
3. **Catalogues Produits & Services :** Références, catégories, tarifs, coûts, unités.
4. **Gestion des Stocks :** Entrées, sorties, mouvements, ajustements, seuils d'alerte, réapprovisionnement.
5. **Ventes & Commercial :** Prise de commande, devis / factures proforma, factures de vente.
6. **Facturation & Encaissements :** Génération de factures, paiements (complets/partiels), suivi des restes à payer.
7. **Gestion des Dépenses & Achats :** Suivi des achats fournisseurs, dépenses courantes, justificatifs.
8. **Gestion Financière & Trésorerie :** Flux de trésorerie, compte de résultat simplifié, créances et dettes.
9. **Ressources Humaines / Employés :** Fiches employés, postes, affectation de rôles métier.
10. **Rapports & Analytics :** Exportations et synthèses multi-critères.

---

## 4. STRUCTURE DU PROJET (MONOREPO PROPOSÉ)

```text
nexora/
├── docs/
│   └── ARCHITECTURE.md
├── packages/
│   ├── core/                      # NEXORA CORE (Logique partagée & abstractions)
│   │   ├── src/
│   │   │   ├── auth/              # Authentification & Sessions
│   │   │   ├── security/          # RBAC / Permissions / Encryption
│   │   │   ├── tenant/            # Context Multi-tenant & Isolation
│   │   │   ├── sync/              # Moteur & Protocoles de Synchro Offline
│   │   │   ├── events/            # Bus d'événements interne
│   │   │   ├── audit/             # Tracé et Logs d'audit
│   │   │   └── pdf/               # Moteur de génération de documents PDF
│   │   └── package.json
│   │
│   ├── nexus/                     # NEXORA NEXUS (Module Métier ERP)
│   │   ├── src/
│   │   │   ├── dashboard/
│   │   │   ├── customers/
│   │   │   ├── products/
│   │   │   ├── inventory/
│   │   │   ├── sales/
│   │   │   ├── quotes/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── expenses/
│   │   │   ├── finance/
│   │   │   ├── employees/
│   │   │   └── reports/
│   │   └── package.json
│   │
│   └── ui-components/             # UI Library commune (Design System Nexora)
│       ├── src/
│       │   ├── buttons/
│       │   ├── tables/
│       │   ├── forms/
│       │   └── layout/
│       └── package.json
│
├── apps/
│   ├── api/                       # API Backend (NestJS / Node.js)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── core/          # Contrôleurs & Services CORE
│   │   │   │   └── nexus/         # Contrôleurs & Services NEXUS
│   │   │   ├── database/          # Migrations & Schémas Prisma
│   │   │   └── main.ts
│   │   └── package.json
│   │
│   └── web/                       # Application Frontend (Next.js PWA / Client Web)
│       ├── src/
│       │   ├── app/               # Routes & Pages
│       │   ├── components/        # UI composants spécifiques
│       │   ├── offline/           # Base IndexedDB locale & sync worker
│       │   └── hooks/
│       └── package.json
│
├── package.json
└── README.md
```

---

## 5. MODÈLE DE DONNÉES (ENTITÉS ET RELATIONS INITIALES)

### A. Entités NEXORA CORE
1. **`organizations`** (Entreprises)
   - `id` (UUID, PK)
   - `name`, `legal_name`, `logo_url`, `tax_id` (NIF/STAT)
   - `email`, `phone`, `address`, `city`, `country`
   - `currency` (ex: EUR, USD, MGA, XOF), `timezone`
   - `created_at`, `updated_at`

2. **`users`**
   - `id` (UUID, PK)
   - `email` (Unique), `password_hash`
   - `first_name`, `last_name`, `phone`
   - `is_active` (Boolean)
   - `created_at`, `updated_at`

3. **`organization_users`** (Relation N-N Utilisateurs <-> Entreprises avec Rôles)
   - `id` (UUID, PK)
   - `organization_id` (FK -> `organizations.id`)
   - `user_id` (FK -> `users.id`)
   - `role_id` (FK -> `roles.id`)
   - `status` (ACTIVE, INACTIVE, INVITED)

4. **`roles` & `permissions`**
   - `roles`: `id`, `organization_id` (null si rôle système global), `name`, `description`
   - `permissions`: `id`, `code` (ex: `nexus:invoices:create`), `description`
   - `role_permissions`: `role_id`, `permission_id`

5. **`audit_logs`**
   - `id` (UUID, PK), `organization_id`, `user_id`
   - `action` (CREATE, UPDATE, DELETE, LOGIN), `entity_name`, `entity_id`
   - `changes` (JSONB), `ip_address`, `timestamp`

6. **`sync_queue` / `sync_deltas`**
   - `id` (UUID, PK), `organization_id`, `user_id`, `device_id`
   - `entity_type`, `entity_id`, `operation` (INSERT, UPDATE, DELETE)
   - `payload` (JSONB), `client_timestamp`, `server_timestamp`, `status` (PENDING, APPLIED, CONFLICT)

### B. Entités NEXORA NEXUS
*(Toutes les entités NEXUS contiennent impérativement `organization_id` pour assurer l'isolation multi-tenant)*

1. **`customers`** (Clients)
   - `id` (UUID), `organization_id` (FK)
   - `code`, `name`, `company_name`, `email`, `phone`, `address`
   - `balance` (Créance actuelle), `created_at`, `updated_at`

2. **`employees`** (Personnel)
   - `id` (UUID), `organization_id` (FK), `user_id` (FK optionnel)
   - `employee_number`, `first_name`, `last_name`, `position`, `email`, `phone`, `status`

3. **`categories`** (Produits / Services / Dépenses)
   - `id` (UUID), `organization_id` (FK), `name`, `type` (PRODUCT, SERVICE, EXPENSE)

4. **`products_services`**
   - `id` (UUID), `organization_id` (FK), `category_id` (FK)
   - `type` (PRODUCT / SERVICE), `reference` (SKU), `name`, `description`
   - `sale_price`, `purchase_cost`, `tax_rate`
   - `current_stock`, `min_stock_alert` (Pour les produits)
   - `unit` (ex: Kg, Pièce, Heure)

5. **`stock_movements`**
   - `id` (UUID), `organization_id` (FK), `product_id` (FK)
   - `type` (IN, OUT, ADJUSTMENT), `quantity`, `unit_cost`
   - `reason`, `reference_doc_id` (ex: Facture/Vente ID), `created_at`, `created_by`

6. **`quotes`** (Devis / Proformas)
   - `id` (UUID), `organization_id` (FK), `customer_id` (FK)
   - `quote_number` (ex: DEV-2025-001), `status` (DRAFT, SENT, ACCEPTED, REJECTED, CONVERTED)
   - `total_untaxed`, `total_tax`, `total_amount`, `valid_until`, `created_at`

7. **`invoices`** (Factures)
   - `id` (UUID), `organization_id` (FK), `customer_id` (FK), `quote_id` (FK optionnel)
   - `invoice_number` (ex: FAC-2025-001), `status` (DRAFT, UNPAID, PARTIAL, PAID, CANCELLED)
   - `total_untaxed`, `total_tax`, `total_amount`, `amount_paid`, `amount_due`
   - `due_date`, `created_at`

8. **`invoice_items` / `quote_items`**
   - `id` (UUID), `invoice_id`/`quote_id` (FK), `item_id` (FK product/service)
   - `description`, `quantity`, `unit_price`, `tax_rate`, `discount`, `total_price`

9. **`payments`**
   - `id` (UUID), `organization_id` (FK), `invoice_id` (FK), `customer_id` (FK)
   - `payment_number`, `amount`, `payment_method` (CASH, BANK_TRANSFER, CHECK, MOBILE_MONEY)
   - `reference`, `payment_date`, `created_at`

10. **`expenses`** (Dépenses)
    - `id` (UUID), `organization_id` (FK), `category_id` (FK), `supplier_name`
    - `description`, `amount`, `payment_method`, `receipt_url`, `expense_date`

---

## 6. STRATÉGIE SYNCHRONISATION OFFLINE-FIRST

1. **Stockage Local :**
   - Côté navigateur client, utilisation d'IndexedDB avec Dexie.js ou RxDB.
   - Les données locales sont segmentées par `organization_id`.

2. **File d'attente de mutations (Offline Queue) :**
   - Lorsqu'un utilisateur crée une vente ou une facture en mode hors-ligne, la transaction est écrite en base locale et enregistrée dans la `sync_queue` locale avec un UUID client et une estampille temporelle ISO (UTC).

3. **Synchronisation à la reconnexion :**
   - Dès détection de la connexion Internet (`navigator.onLine` / Ping API), un Web Worker dépile la `sync_queue`.
   - L'API reçoit les requêtes via un point de terminaison batch `POST /api/v1/sync/push`.
   - Le serveur applique les transactions dans une transaction SQL atomic et retourne le statut de chaque transaction.

4. **Gestion des Conflits :**
   - **Stratégie par défaut :** *Last-Write-Wins* basé sur les timestamps du serveur avec vérification d'état (versioning d'entité).
   - **Stratégie spécifique métier :** Pour les stocks et numéros de factures séquentiels, la génération du numéro définitif et l'incrémentation du stock physique sont validées côté serveur à la réconciliation. En local hors-ligne, des numéros temporaires (ex: `TEMP-FAC-001`) sont attribués puis convertis.

---

## 7. ROADMAP D'IMPLÉMENTATION PAR PHASES LOGIQUES

- **Phase 0 — Socle Architecture & Définition** *(Phase actuelle)*
  - Validation du cahier des charges, modélisation conceptuelle, architecture CORE vs NEXUS.

- **Phase 1 — Initialisation du projet & Core Engine**
  - Setup du monorepo (TypeScript, NestJS backend, Next.js frontend, Prisma ORM).
  - Implémentation de NEXORA CORE : Authentification, Multi-tenancy, Gestion des utilisateurs, RBAC & Permissions, Audit Log, et API Client Offline.

- **Phase 2 — Module Entreprise & Référentiels Métier (NEXUS Part 1)**
  - Module 2 (Entreprise & Paramètres).
  - Module 4 (Clients & CRM de base).
  - Module 5 (Produits & Services, Catégories, Tarification).

- **Phase 3 — Stocks & Dépenses (NEXUS Part 2)**
  - Module 6 (Gestion des stocks, mouvements, ajustements & alerte de seuil).
  - Module 11 (Gestion des dépenses & justificatifs).
  - Module 13 (Employés & Gestion des rôles internes).

- **Phase 4 — Cycle Ventes, Facturation & Paiements (NEXUS Part 3)**
  - Module 7 (Ventes directes).
  - Module 8 (Devis & Proformas).
  - Module 9 (Facturation & numérotation automatique).
  - Module 10 (Encaissements, Paiements partiels/complets).
  - Engine de Génération de Documents PDF personnalisables.

- **Phase 5 — Finances, Tableau de Bord & Rapports (NEXUS Part 4)**
  - Module 3 (Tableau de bord dynamique & KPIs).
  - Module 12 (Module Financier & Bilan de trésorerie).
  - Module 14 (Rapports analytiques et exports Excel/PDF).

- **Phase 6 — Synchronisation Avancée Offline-First & Polissage**
  - Validation complète des scenarios hors-ligne, résolution de conflits complexes, tests d'intégration E2E et audit de sécurité.

# NEXORA — Guide de Déploiement & Migrations Base de Données

Ce document décrit la procédure officielle pour appliquer les migrations de base de données PostgreSQL et déployer NEXORA (CORE, NEXUS, VITALIS) dans les environnements de **Staging** et **Production**.

---

## 1. Schéma Prisma & Modèle `User`

Le modèle utilisateur central est défini dans `apps/api/src/database/schema.prisma` :

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  password      String
  defaultModule String?   // "NEXUS" | "VITALIS" (Module par défaut après connexion)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@map("users")
}
```

---

## 2. Procédure de Migration selon l'Environnement

### A. Environnement de Développement Local / Sandbox

En environnement de développement local (avec instance PostgreSQL active) :

```bash
# Générer le client Prisma mis à jour
pnpm prisma generate --schema=apps/api/src/database/schema.prisma

# Pousser directement les changements de schéma vers PostgreSQL
pnpm prisma db push --schema=apps/api/src/database/schema.prisma
```

---

### B. Environnement de Staging

Pour valider la migration du schéma avant la production :

1. Définir la variable d'environnement `DATABASE_URL` pointant sur la base de données de Staging.
2. Exécuter la création de migration :

```bash
npx prisma migrate dev --name add_user_default_module --schema=apps/api/src/database/schema.prisma
```

3. Vérifier que la colonne `default_module VARCHAR(255)` a bien été ajoutée à la table `users`.

---

### C. Environnement de Production

En environnement de production, les migrations doivent être exécutées de manière atomique avant ou pendant le pipeline de déploiement CI/CD :

1. Définir la variable d'environnement `DATABASE_URL` sécurisée.
2. Exécuter les migrations sans risque de perte de données :

```bash
npx prisma migrate deploy --schema=apps/api/src/database/schema.prisma
```

3. Générer le client Prisma de production :

```bash
pnpm prisma generate --schema=apps/api/src/database/schema.prisma
```

---

## 3. Architecture API & Emplacement de la Route `/auth/user/default-module`

Le monorepo NEXORA comprend deux couches d'API :

1. **`apps/api` (Serveur Backend NestJS Centré)** :
   Contient la logique métier centrale, les contrôleurs NestJS, et les services d'arrière-plan.
2. **`apps/web` (Frontend Next.js App Router API Routes)** :
   Utilise l'API Route Handler (`/api/auth/user/default-module/route.ts`) pour gérer de manière synchrone les requêtes de session utilisateur, les tokens JWT et l'accès direct aux données utilisateur via Prisma.

La route `POST /api/auth/user/default-module` est hébergée sur `apps/web/src/app/api/auth/user/default-module/route.ts` afin d'assurer l'autonomie du serveur web Next.js lors du basculement de module, tout en interagissant directement avec la base de données PostgreSQL via Prisma Client. Lors du déploiement de l'API NestJS (`apps/api`), le contrôleur `AuthController` de NestJS pourra directement servir un miroir de cette même route (`/api/v1/auth/user/default-module`) pour la consommation par d'autres clients (ex: applications mobiles ou extensions).

---

## 4. Déploiement de l'API & Frontend

### 1. Variables d'Environnement Obligatoires

- `DATABASE_URL` : Chaine de connexion PostgreSQL (ex: `postgresql://user:pass@localhost:5432/nexora_db`)
- `JWT_SECRET` : Clé secrète de signature des jetons (Requis en production, erreur fatale si absente)
- `PORT` : Port d'écoute de l'API NestJS (défaut : 3000)

### 2. Compilation de l'Application Monorepo

```bash
pnpm build
```

### 3. Démarrage des Services

- **API NestJS** : `node apps/api/dist/main.js` ou `pnpm --filter api start:prod`
- **Frontend Next.js** : `pnpm --filter web start`

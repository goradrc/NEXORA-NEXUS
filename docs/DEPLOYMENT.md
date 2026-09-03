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

## 3. Déploiement de l'API & Frontend

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

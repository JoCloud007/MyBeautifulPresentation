# CI/CD — Règles de vérification obligatoires (TIDET.md)

> **Ce fichier est la source de vérité CI/CD du projet.** Il doit être relu AVANT chaque
> modification de code (pour connaître les commandes et interdits) et APRÈS chaque
> modification (pour exécuter la checklist de non-régression). Toute session de travail
> commence par la lecture de ce fichier ; toute session se termine par la checklist.

## Règle absolue : ZÉRO RÉGRESSION

**Ne jamais faire de régression.** Concrètement :

1. **Avant** de modifier du code : exécuter au minimum `npm run test` pour établir
   l'état de référence. Noter tout test déjà cassé AVANT de commencer (il n'est pas
   de ta faute, mais il doit être signalé, pas caché).
2. **Après** chaque modification de code : exécuter la checklist ci-dessous. Si un
   check qui passait avant échoue après ta modification, c'est une régression :
   **corriger à la racine, pas contourner** (jamais de `skip`, jamais de test
   affaibli, jamais de `as any` pour faire taire TypeScript).
3. **Interdits absolus** :
   - Désactiver ou supprimer un test pour faire passer la suite.
   - `// eslint-disable`, `@ts-ignore`, `@ts-expect-error` ajoutés juste pour passer.
   - Commenter du code "temporairement" pour que ça compile.
   - Marquer une tâche comme terminée avec un check en échec.
4. **Si un check échoue deux fois** : arrêter, réévaluer l'approche, et le signaler
   explicitement à l'utilisateur avec la sortie d'erreur complète — ne pas réessayer
   à l'aveugle une troisième fois.

## Checklist de non-régression (à exécuter après CHAQUE modification de code)

Dans l'ordre, depuis la racine du projet :

```bash
# 1. Types — doit passer sans erreur
npx tsc --noEmit

# 2. Lint — zéro nouvelle erreur par rapport à l'état de référence
npm run lint

# 3. Tests — tout doit passer
npm run test
```

**Critères de succès :**
- `tsc --noEmit` : exit 0, aucune erreur.
- `npm run lint` : exit 0 (ou aucune erreur *nouvelle* si des warnings préexistaient).
- `npm run test` : 100% des tests passent.

**Si la modification touche :**
- `prisma/schema.prisma` → ajouter `npx prisma validate` et `npx prisma generate`.
- `docker-compose.yml` / `Dockerfile` → ajouter `docker compose config` (depuis la
  racine du projet uniquement — voir convention Docker ci-dessous).
- `package.json` (dépendances) → `npm install` puis relancer TOUTE la checklist.
- Un composant visuel (`app/components/…`) → vérifier le rendu réel dans le preview
  (http://localhost:5182) en plus de la checklist.
- `lib/brand/**` ou `app/components/brand/**` → lancer en plus
  `npx vitest run lib/brand __tests__/api/brand`, et vérifier sur au moins une
  charte réelle que les 7 rôles de couleur sont attribués avec leur `evidence`
  (`npm run brand:import -- --css test/fixtures/brand/acme-charte.css --name Test --dry-run`).

## Commandes du projet

```bash
# Démarrage (Toujours Docker Compose — convention du projet)
docker compose up --build        # app sur http://localhost:5182

# Dev local (seulement si explicitement demandé)
npm run dev -- --port 5182

# Charte client → template de marque (hors interface, pour préparer un déploiement)
npm run brand:import -- --css charte.css --pptx charte.pptx --name "Client" --out client.mbpt.json
npm run brand:import -- --help          # toutes les options
```

> `brand:import` passe par le même pipeline que l'assistant d'interface
> (`lib/brand/analyze.ts` → `lib/brand/toTemplate.ts`) : un template produit en
> CLI est identique à un template produit dans le wizard. `--dry-run` affiche
> les tokens sans rien écrire.

## Interdits opérationnels

- **Docker** : toujours exécuter `docker compose` depuis la racine du forge ; ne
  jamais créer de sous-dossier dédié ; ne jamais tuer le Docker Engine macOS
  (`open -a Docker` pour le démarrer, jamais `killall Docker`).
- **Git** : messages de commit en anglais uniquement.
- **Sécurité** : ne jamais committer de secret, token ou mot de passe.

## Gouvernance de ce fichier

- Toute nouvelle règle de vérification ou commande CI/CD doit être ajoutée ICI.
- Si une commande de la checklist devient obsolète, la mettre à jour dans la même
  modification que le changement qui la rend obsolète.
- Ce fichier est relu au début de chaque session et à chaque modification de code.

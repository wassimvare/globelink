# Validation — GlobeLink V11 Beta / Phase 2

Date de préparation : 18 août 2026.

## Résultats obtenus dans l'environnement de contrôle

- Sécurité : **OK**
- Phase 1 : **27/27**
- Phase 2 : **20/20**
- Carte V2 : **10/10**
- Carte V3 : **8/8**
- Carte V4 : **10/10**
- Carte V5 : **13/13**
- Carte V6 : **14/14**
- Carte V7 : **10/10**
- Carte V8 : **13/13**
- Carte V9 : **19/19**
- Carte V10 : **16/16**
- Carte V11 : **15/15**
- Carte V12 : **9/9**
- Parsing des fichiers TypeScript / TSX modifiés : **0 erreur de syntaxe détectée** (les dépendances npm ne sont pas installées dans cet environnement)

## Contrôle npm complet

Le projet inclut toujours le pipeline complet :

```bash
npm run check
```

qui enchaîne sécurité, Phase 1, Phase 2, carte, lint, typecheck, tests et build.

Dans l'environnement ayant servi à préparer cette archive, `npm ci` n'a pas pu terminer car le paquet `zwitch@2.0.4` n'était pas disponible dans le cache npm local et l'accès registre n'a pas abouti dans le délai d'exécution. Par conséquent, **lint + typecheck complet + Vitest + build Vite n'ont pas été annoncés comme exécutés ici**.

Ce point est une limite de l'environnement de validation, pas un contrôle déclaré réussi artificiellement. Sur une machine avec accès normal au registre npm, exécuter :

```bash
npm ci
npm run check
```

Le pipeline refusera la release si l'un de ces contrôles échoue.

## Statut

**Phase 2 intégrée et validée sur les contrôles statiques + non-régression disponibles.**

La validation finale de compilation de production reste à confirmer via `npm run check` dans un environnement npm connecté.


## Correctifs V11.0.1

La validation Phase 2 couvre désormais explicitement :

- photos de l'accueil avec coordonnées pour Google Places ;
- restauration automatique de `GOOGLE_PLACES_API_KEY` entre versions ;
- accueil personnalisé visible même sans voyage futur ;
- onboarding accessible depuis le Fil ;
- explorateur et navigation Destinations ;
- notifications de like et de match Travel Match ;
- création de conversation au match ;
- apparition Realtime du nouveau match dans Messages ;
- présence de la fonction RPC corrigée dans le bootstrap Supabase.

Le parseur PowerShell Windows n'est pas disponible dans l'environnement Linux de préparation ; les scripts PowerShell ont donc été contrôlés statiquement mais pas exécutés ici.

## Hotfix V11.0.2

- Phase 2 : 25/25 contrôles statiques.
- Pages pays : hub urbain réel + fallback viewport.
- Inscription : vérification pseudo via RPC compatible RLS.
- Travel Match public : redirection auth explicite.
- Phase 1 : 27/27 contrôles.
- Carte V2 à V12 : tous les contrôles dédiés passent.
- `tsc --noEmit` atteint uniquement l'absence locale de `vite/client` dans cet environnement de travail ; aucune erreur de syntaxe du projet n'a été signalée avant ce blocage de dépendance.

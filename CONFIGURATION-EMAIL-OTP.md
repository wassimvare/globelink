# Activer le code de vérification par e-mail

Le code de l'application est prêt : après l'inscription, GlobeLink affiche une page à 6 chiffres et vérifie le code avec Supabase Auth.

## 1. Activer la confirmation e-mail

Dans le tableau de bord Supabase du projet `hzsfocphpynxoykfkfaj` :

- Authentication → Providers → Email ;
- laisser l'inscription par e-mail activée ;
- activer la confirmation des adresses e-mail ;
- laisser la protection contre les mots de passe compromis activée lorsqu'elle est disponible.

## 2. Configurer un SMTP personnalisé

Le SMTP par défaut de Supabase est limité au développement. Pour permettre à n'importe quel utilisateur de recevoir son code, configure un fournisseur SMTP dans Authentication → SMTP Settings.

Utilise les identifiants fournis par ton prestataire e-mail. Ne les place jamais dans le code React ou dans une variable `VITE_*`.

## 3. Remplacer le bouton par le code

Dans Authentication → Email Templates → Confirm signup :

- Objet : `{{ .Token }} — ton code GlobeLink`
- Contenu : copier tout le fichier `supabase/email-templates/confirm-signup.html`

Le modèle ne contient volontairement aucun bouton de confirmation. Il affiche uniquement `{{ .Token }}`.

Le fichier `CONFIGURER_EMAIL_OTP.bat` copie automatiquement le HTML dans le presse-papiers et ouvre la bonne page Supabase.

## 4. Déployer la migration V8

Lancer `APPLIQUER_V8_SUPABASE.bat`, se connecter à Supabase, puis confirmer le déploiement.

La migration :

- supprime les profils de démonstration et les profils sans compte Auth ;
- supprime définitivement la colonne et la fonction de démonstration ;
- lie chaque profil à un vrai utilisateur Supabase ;
- synchronise la confirmation e-mail ;
- sécurise les créations et modifications de données par RLS ;
- empêche les comptes non vérifiés de publier, aimer, commenter, suivre ou envoyer des messages.

## 5. Tester

1. Utiliser une adresse e-mail qui n'existe pas encore dans Auth.
2. Créer un compte depuis l'onglet Inscription.
3. Vérifier les spams.
4. Entrer le code reçu dans GlobeLink.
5. Tester un like, un commentaire, un suivi et un message.

Si aucun e-mail n'arrive, le problème vient presque toujours du SMTP, du modèle Confirm signup ou d'une limite d'envoi, pas du formulaire React.

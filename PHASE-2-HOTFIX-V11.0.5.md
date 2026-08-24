# GlobeLink V11.0.5 — Destinations instantanées et catalogue robuste

- Navigation Destinations canonique `/destinations/` + preload au survol.
- La fiche destination affiche le cache de la carte immédiatement s’il existe.
- La première source réelle (Google Places, cache Supabase ou OpenStreetMap navigateur) s’affiche sans attendre les autres.
- Enrichissement complet en arrière-plan.
- Google Places utilise Nearby Search typé autour du hub urbain puis Text Search seulement pour les catégories manquantes.
- Les quelques résultats Google ne sont plus jetés : même une petite réponse est conservée.
- Les cartes destinations sans cover admin utilisent une image Wikipédia/Wikimedia reliée à la destination et affichent un lien d’attribution ; aucun Unsplash générique.

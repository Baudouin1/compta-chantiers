-- ============================================================
-- Ajout du mode de paiement sur les mouvements (livre des recettes)
-- À coller dans Supabase > SQL Editor > New query > Run
-- (on peut le relancer sans risque)
-- ============================================================
alter table mouvements add column if not exists mode_paiement text;

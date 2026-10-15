// Connexion à Supabase (la bibliothèque est chargée par lib/supabase.js dans index.html)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Lance une requête Supabase et renvoie les données, ou affiche l'erreur
export async function q(requete) {
  const { data, error } = await requete;
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  return data;
}

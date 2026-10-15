// Justificatifs : photo d'un ticket ou facture PDF, rattachés à un mouvement.
// Les photos sont réduites et compressées avant l'envoi pour prendre peu de place (≈ 200-300 Ko).
import { db } from './db.js';

const DOSSIER = 'justificatifs';
const TAILLE_MAX_PDF = 5 * 1024 * 1024; // 5 Mo
const COTE_MAX_PHOTO = 1600;            // pixels : assez pour lire un ticket
const QUALITE_PHOTO = 0.7;

async function idUtilisateur() {
  const { data } = await db.auth.getSession();
  return data.session.user.id;
}

// Réduit une photo et la convertit en JPEG
async function compresserPhoto(fichier) {
  const image = await new Promise((ok, echec) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => echec(new Error("Impossible de lire cette photo. Essaie avec une autre."));
    img.src = URL.createObjectURL(fichier);
  });
  const echelle = Math.min(1, COTE_MAX_PHOTO / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  URL.revokeObjectURL(image.src);
  return new Promise(ok => toile.toBlob(ok, 'image/jpeg', QUALITE_PHOTO));
}

// Vérifie et prépare le fichier choisi. Renvoie { blob, extension, type }
export async function preparerFichier(fichier) {
  if (fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name)) {
    if (fichier.size > TAILLE_MAX_PDF) {
      throw new Error(`Ce PDF fait ${(fichier.size / 1048576).toFixed(1).replace(".", ",")} Mo : 5 Mo maximum. Prends plutôt une photo du document.`);
    }
    return { blob: fichier, extension: 'pdf', type: 'application/pdf' };
  }
  if (fichier.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(fichier.name)) {
    return { blob: await compresserPhoto(fichier), extension: 'jpg', type: 'image/jpeg' };
  }
  throw new Error('Format non accepté : choisis une photo ou un PDF.');
}

// Envoie le fichier et renvoie son chemin de stockage
export async function envoyer(prepare, mouvementId) {
  const chemin = `${await idUtilisateur()}/${mouvementId}-${Date.now()}.${prepare.extension}`;
  const { error } = await db.storage.from(DOSSIER).upload(chemin, prepare.blob, { contentType: prepare.type });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error("Le stockage des justificatifs n'est pas encore activé (réglage Supabase à faire).");
    }
    throw new Error(error.message);
  }
  return chemin;
}

export async function supprimer(chemin) {
  if (chemin) await db.storage.from(DOSSIER).remove([chemin]);
}

// Ouvre le justificatif (lien valable 1 heure)
export async function ouvrir(chemin) {
  // On ouvre la fenêtre tout de suite (sinon l'iPhone la bloque), puis on y met le lien
  const fenetre = window.open('', '_blank');
  const { data, error } = await db.storage.from(DOSSIER).createSignedUrl(chemin, 3600);
  if (error) {
    fenetre?.close();
    throw new Error(error.message);
  }
  if (fenetre) fenetre.location.href = data.signedUrl;
  else location.href = data.signedUrl;
}

// Place utilisée par tous les justificatifs (en octets)
export async function espaceUtilise() {
  const dossier = await idUtilisateur();
  let total = 0;
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db.storage.from(DOSSIER).list(dossier, { limit: 1000, offset: debut });
    if (error) return null;
    total += data.reduce((s, f) => s + (f.metadata?.size || 0), 0);
    if (data.length < 1000) return total;
  }
}

export const estPdf = chemin => /\.pdf$/i.test(chemin || '');

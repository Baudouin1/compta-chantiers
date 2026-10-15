// Écran d'accueil : le mois en cours, ce qu'il reste à facturer / encaisser, dernières interventions
import { db, q } from '../db.js';
import { euros, titre, totaux, heuresFr } from '../utils.js';
import { calculer, moyennes } from '../calculs.js';
import { ligneChantier, CHAMPS_LISTE } from './chantiers.js';

export async function afficher(main) {
  titre('BluePrestige');

  const maintenant = new Date();
  const a = maintenant.getFullYear(), m = maintenant.getMonth() + 1;
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  const debutSuivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const [mvtsMois, chantiers, clients] = await Promise.all([
    q(db.from('mouvements').select('sens, montant').gte('date', debutMois).lt('date', debutSuivant)),
    q(db.from('chantiers').select(CHAMPS_LISTE)
      .order('date_debut', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })),
    q(db.from('clients').select('id').limit(1)),
  ]);

  // Interventions du mois (comme une page de l'ancien Excel)
  const duMois = chantiers.filter(c => (c.date_debut || '') >= debutMois && (c.date_debut || '') < debutSuivant);
  const mois = moyennes(duMois);
  const encaisse = totaux(mvtsMois);

  // À facturer / en attente de règlement
  const somme = (liste, k) => liste.reduce((s, c) => s + calculer(c)[k], 0);
  const aFacturer = chantiers.filter(c => c.statut === 'a_facturer');
  const enAttente = chantiers.filter(c => c.statut === 'facture');

  // Première utilisation : petit guide de démarrage
  const bienvenue = !clients.length ? `
    <div class="carte">
      <h2 style="margin-top:0">👋 Bienvenue !</h2>
      <ol class="etapes">
        <li><strong>Réglages › Mes tarifs</strong> : vérifie tes taux horaires et les consommables.</li>
        <li><strong>Crée un client</strong> avec son bateau et son mode de facturation (à l'heure, forfait, devis).</li>
        <li>Après chaque passage, ajoute une <strong>intervention</strong> : les heures, et l'appli calcule la facture,
          ton bénéfice et ton taux horaire net.</li>
      </ol>
      <a class="btn principal" href="#/client/nouveau">+ Créer mon premier client</a>
      <a class="btn lien" href="#/aide">📖 Voir le guide complet</a>
    </div>` : '';

  main.innerHTML = `
    ${bienvenue}
    <div class="resume">
      <div class="etiquette">Bénéfice net · ${nomMois}</div>
      <div class="grand">${euros(mois.benefice)}</div>
      <div class="details">
        <div><span>Facturé</span><strong>${euros(mois.facture)}</strong></div>
        <div><span>Frais réels</span><strong>${euros(mois.fraisReels)}</strong></div>
        <div><span>Heures</span><strong>${heuresFr(mois.heures)}</strong></div>
        <div><span>Taux horaire net</span><strong>${mois.tauxHoraireNet != null ? euros(mois.tauxHoraireNet) + '/h' : '–'}</strong></div>
      </div>
      <a class="lien-bilan" href="#/bilan">💶 Encaissé ce mois : ${euros(encaisse.gains)} · 📊 Voir le bilan ›</a>
    </div>

    <a class="btn principal grand-bouton" href="#/chantier/nouveau">+ Nouvelle intervention</a>

    ${aFacturer.length ? `<a class="alerte rouge" href="#/chantiers?statut=a_facturer">
      🔴 <span><strong>${aFacturer.length} à facturer</strong> · ${euros(somme(aFacturer, 'facture'))}</span> ›</a>` : ''}
    ${enAttente.length ? `<a class="alerte orange" href="#/chantiers?statut=facture">
      🟠 <span><strong>${enAttente.length} en attente de règlement</strong> · ${euros(somme(enAttente, 'resteAEncaisser'))}</span> ›</a>` : ''}

    <h2>Dernières interventions</h2>
    <div class="liste">
      ${chantiers.slice(0, 6).map(c => ligneChantier(c)).join('') || '<p class="vide">Aucune intervention pour l\'instant.</p>'}
    </div>
    ${chantiers.length > 6 ? '<a class="btn" href="#/chantiers">Voir toutes les interventions</a>' : ''}

    <h2>Frais généraux</h2>
    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?sens=gain">+ Gain</a>
    </div>
    <div class="liste">
      <a class="ligne" href="#/frais">
        <span class="pastille">🧾</span>
        <div><strong>Frais généraux</strong><small>Dépenses et gains hors intervention (assurance, outillage…)</small></div>
        <span class="fleche">›</span>
      </a>
    </div>`;
}

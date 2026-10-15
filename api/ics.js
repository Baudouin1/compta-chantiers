// Fabrique un fichier calendrier (.ics) à partir des infos passées dans l'adresse.
// L'iPhone l'ouvre et propose "Ajouter au calendrier".
// Exemples :
//   /api/ics?titre=Nettoyage&date=2026-10-20&heure=09:00&heure_fin=12:00&lieu=Lorient
//   /api/ics?titre=Chantier 1&date=2026-10-20&date_fin=2026-10-22   (journées entières)

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

// Protège le texte selon les règles du format calendrier
function texte(v) {
  return String(v || '').slice(0, 1000)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Coupe les lignes trop longues (le format demande 75 caractères maximum)
function plier(ligne) {
  const morceaux = [];
  while (ligne.length > 70) {
    morceaux.push(ligne.slice(0, 70));
    ligne = ' ' + ligne.slice(70);
  }
  morceaux.push(ligne);
  return morceaux.join('\r\n');
}

const compact = d => d.replace(/-/g, '');

function lendemain(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = (req, res) => {
  const { titre, date, date_fin, heure, heure_fin, lieu, notes } = req.query;

  if (!DATE.test(date || '')) {
    res.status(400).send('Date manquante ou invalide');
    return;
  }

  let debut, fin;
  if (HEURE.test(heure || '')) {
    // Rendez-vous avec une heure (heure locale du téléphone)
    const hFin = HEURE.test(heure_fin || '') && heure_fin > heure ? heure_fin : null;
    const finParDefaut = `${String(Math.min(Number(heure.slice(0, 2)) + 1, 23)).padStart(2, '0')}${heure.slice(3)}`;
    debut = `DTSTART:${compact(date)}T${heure.replace(':', '')}00`;
    fin = `DTEND:${compact(date)}T${hFin ? hFin.replace(':', '') : finParDefaut}00`;
  } else {
    // Journée(s) entière(s) : la fin est le lendemain du dernier jour
    const dernier = DATE.test(date_fin || '') && date_fin >= date ? date_fin : date;
    debut = `DTSTART;VALUE=DATE:${compact(date)}`;
    fin = `DTEND;VALUE=DATE:${compact(lendemain(dernier))}`;
  }

  const maintenant = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Compta Chantiers//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@compta-chantiers`,
    `DTSTAMP:${maintenant}`,
    debut,
    fin,
    `SUMMARY:${texte(titre || 'Chantier')}`,
    lieu ? `LOCATION:${texte(lieu)}` : null,
    notes ? `DESCRIPTION:${texte(notes)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map(plier);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="evenement.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(lignes.join('\r\n') + '\r\n');
};

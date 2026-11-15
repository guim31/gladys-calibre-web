// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, the scene
// action errors and sentences. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './calibre/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Calibre-Web server, and its user and password, in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Calibre-Web, son utilisateur et son mot de passe dans la configuration.",
    de: 'Gib die Adresse deines Calibre-Web-Servers sowie Benutzer und Passwort in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Calibre-Web, su usuario y su contraseña en la configuración.',
  },
  invalid: {
    en: 'The configuration is invalid: an address such as http://192.168.1.2:8083, a user without ":".',
    fr: "La configuration n'est pas valide : une adresse comme http://192.168.1.2:8083, un utilisateur sans « : ».",
    de: 'Die Konfiguration ist ungültig: eine Adresse wie http://192.168.1.2:8083, ein Benutzer ohne „:“.',
    es: 'La configuración no es válida: una dirección como http://192.168.1.2:8083, un usuario sin «:».',
  },
};

// One short explanation per error kind (src/calibre/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the server does not answer',
    fr: 'le serveur ne répond pas',
    de: 'der Server antwortet nicht',
    es: 'el servidor no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'user or password refused',
    fr: 'utilisateur ou mot de passe refusé',
    de: 'Benutzer oder Passwort abgelehnt',
    es: 'usuario o contraseña rechazados',
  },
  [ERROR_KINDS.HIDDEN]: {
    en: 'the "Recently added" list is hidden for this user: show it in the user settings',
    fr: 'la liste « Ajouts récents » est masquée pour cet utilisateur : affichez-la dans ses réglages',
    de: 'die Liste „Kürzlich hinzugefügt“ ist für diesen Benutzer ausgeblendet: Blende sie dort wieder ein',
    es: 'la lista «Añadidos recientemente» está oculta para este usuario: muéstrela en sus ajustes',
  },
  [ERROR_KINDS.NOT_CALIBRE]: {
    en: 'no Calibre-Web catalog (OPDS) at this address',
    fr: 'aucun catalogue Calibre-Web (OPDS) à cette adresse',
    de: 'kein Calibre-Web-Katalog (OPDS) unter dieser Adresse',
    es: 'no hay ningún catálogo Calibre-Web (OPDS) en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its path',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec son chemin",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrem Pfad ein',
    es: 'la dirección redirige: introduzca la dirección final, con su ruta',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (flavor, user) => `${flavor}: connected ${user ? `as ${user}` : 'anonymously'}`,
    books: (count) => `${count} book(s)`,
    authors: (count) => `${count} author(s)`,
    series: (count) => `${count} series`,
  },
  fr: {
    ok: (flavor, user) => `${flavor} : connecté ${user ? `en tant que ${user}` : 'en anonyme'}`,
    books: (count) => `${count} livre(s)`,
    authors: (count) => `${count} auteur(s)`,
    series: (count) => `${count} série(s)`,
  },
  de: {
    ok: (flavor, user) => `${flavor}: verbunden ${user ? `als ${user}` : 'anonym'}`,
    books: (count) => `${count} Buch/Bücher`,
    authors: (count) => `${count} Autor(en)`,
    series: (count) => `${count} Serie(n)`,
  },
  es: {
    ok: (flavor, user) => `${flavor}: conectado ${user ? `como ${user}` : 'de forma anónima'}`,
    books: (count) => `${count} libro(s)`,
    authors: (count) => `${count} autor(es)`,
    series: (count) => `${count} serie(s)`,
  },
};

// The sentence of the "Read the latest additions" scene action.
export const RECENT_TEXT = {
  en: {
    none: (days) => `No new book on Calibre-Web in the last ${days} days.`,
    some: (count, days, titles) =>
      `${count} new book(s) on Calibre-Web in the last ${days} days: ${titles}.`,
    more: (count) => `${count} more`,
    and: ' and ',
  },
  fr: {
    none: (days) => `Aucun nouveau livre sur Calibre-Web ces ${days} derniers jours.`,
    some: (count, days, titles) =>
      `${count} nouveau(x) livre(s) sur Calibre-Web ces ${days} derniers jours : ${titles}.`,
    more: (count) => `${count} autre(s)`,
    and: ' et ',
  },
  de: {
    none: (days) => `Kein neues Buch auf Calibre-Web in den letzten ${days} Tagen.`,
    some: (count, days, titles) =>
      `${count} neue(s) Buch/Bücher auf Calibre-Web in den letzten ${days} Tagen: ${titles}.`,
    more: (count) => `${count} weitere`,
    and: ' und ',
  },
  es: {
    none: (days) => `Ningún libro nuevo en Calibre-Web en los últimos ${days} días.`,
    some: (count, days, titles) =>
      `${count} libro(s) nuevo(s) en Calibre-Web en los últimos ${days} días: ${titles}.`,
    more: (count) => `${count} más`,
    and: ' y ',
  },
};

// Errors of the scene action (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Calibre-Web server is configured.',
    fr: "Aucun serveur Calibre-Web n'est configuré.",
    de: 'Kein Calibre-Web-Server ist konfiguriert.',
    es: 'No hay ningún servidor Calibre-Web configurado.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Every language of a table, rendered by `render(table[language], language)`. */
export const everyLanguage = (table, render) =>
  Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text, language)]),
  );

/** "A, B and 2 more" in the words of a language. */
export function listOf(titles, total, text) {
  const shown = titles.slice(0, 3);
  const rest = total - shown.length;
  const parts = rest > 0 ? [...shown, text.more(rest)] : shown;
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')}${text.and}${parts.at(-1)}`;
}

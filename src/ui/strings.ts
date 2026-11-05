/**
 * Every German UI string lives here. Components import from this file only;
 * server errors travel as codes and are mapped to text via `errorMessage`.
 */

type PluralForms = { one: string; other: string };

/** Replaces `{name}` placeholders; unknown placeholders are left visible. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

const numberFormat = new Intl.NumberFormat('de-DE');

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Picks the German plural form for `count` and fills `{count}`. */
export function plural(count: number, forms: PluralForms): string {
  const template = Math.abs(count) === 1 ? forms.one : forms.other;
  return format(template, { count });
}

export const strings = {
  app: {
    name: 'My Notebook',
    description: 'Quellen sammeln und mit Claude quellengestützt bearbeiten.',
  },
  sidebar: {
    label: 'Notebooks',
    heading: 'Notebooks',
    newNotebook: 'Neues Notebook',
    addSource: 'Quelle hinzufügen',
    empty: 'Noch keine Notebooks. Leg dein erstes an.',
    sourceCount: { one: '{count} Quelle', other: '{count} Quellen' },
  },
  notebook: {
    untitled: 'Unbenanntes Notebook',
    rename: 'Umbenennen',
    renameLabel: 'Titel des Notebooks',
    renameSave: 'Speichern',
    renameCancel: 'Abbrechen',
    delete: 'Notebook löschen',
    deleteConfirm: '„{title}“ und alles darin endgültig löschen?',
    actions: 'Notebook-Aktionen',
    activeSources: '{count} von {total} Quellen aktiv',
    noSources: 'Keine Quellen',
  },
  welcome: {
    title: 'Willkommen bei My Notebook',
    body: 'Sammle Texte, PDFs und Webseiten in einem Notebook und stell Fragen dazu. Jede Antwort zeigt, aus welcher Stelle deiner Quellen sie stammt.',
    cta: 'Erstes Notebook anlegen',
    hint: 'Kein Konto nötig. Deine Notebooks bleiben in diesem Browser gespeichert.',
  },
  conversation: {
    emptyTitle: 'Füge eine erste Quelle hinzu',
    emptyBody:
      'Antworten stützen sich nur auf deine Quellen. Füge einen Text, ein PDF oder eine Webseite hinzu, dann kannst du Fragen stellen.',
    addSource: 'Quelle hinzufügen',
    sourceKinds: ['Text einfügen', 'PDF hochladen', 'Webseite'],
    composerPlaceholder: 'Frage zu deinen Quellen stellen …',
    composerDisabled: 'Füge zuerst eine Quelle hinzu.',
    modeChat: 'Chat',
    modeAgent: 'Agent',
    send: 'Senden',
  },
  drawer: {
    label: 'Seitenbereich',
    toggle: 'Seitenbereich umschalten',
    close: 'Seitenbereich schließen',
    tabs: { sources: 'Quellen', studio: 'Studio', notes: 'Notizen' },
    sourcesEmpty:
      'Keine Quelle geöffnet. Klicke auf ein Zitat in einer Antwort oder auf eine Quelle in der Seitenleiste.',
    studioEmpty: 'Sobald Quellen da sind, kannst du hier ein Briefing erstellen.',
    notesEmpty: 'Noch keine Notizen. Speichere eine Antwort oder schreib selbst eine.',
  },
  notFound: {
    title: 'Notebook nicht gefunden',
    body: 'Dieses Notebook gibt es nicht oder nicht mehr.',
    back: 'Zur Übersicht',
  },
  errors: {
    title: 'Etwas ist schiefgelaufen',
    retry: 'Erneut versuchen',
    codes: {
      invalid_title: 'Der Titel muss zwischen 1 und 120 Zeichen lang sein.',
      not_found: 'Dieses Notebook gibt es nicht mehr.',
      unknown: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    },
  },
} as const;

export type ErrorCode = keyof typeof strings.errors.codes;

export function errorMessage(code: ErrorCode): string {
  return strings.errors.codes[code];
}

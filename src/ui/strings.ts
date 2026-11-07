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
    composerPlaceholder: 'Frage zu deinen Quellen stellen …',
    composerDisabled: 'Füge zuerst eine Quelle hinzu.',
    modeChat: 'Chat',
    modeAgent: 'Agent',
    send: 'Senden',
  },
  chat: {
    label: 'Chat',
    emptyTitle: 'Frag deine Quellen',
    emptyBody:
      'Antworten stützen sich nur auf deine aktiven Quellen. Jede Aussage verweist auf die Passage, aus der sie stammt.',
    noActiveSources: 'Schalte eine Quelle ein, um Fragen zu stellen.',
    question: 'Deine Frage',
    answer: 'Antwort',
    writing: 'Antwort wird geschrieben …',
    stop: 'Antwort stoppen',
    stopped: 'Gestoppt',
    clear: 'Chat leeren',
    clearConfirm: 'Den ganzen Chat dieses Notebooks löschen?',
    citation: 'Zitat {n} aus „{title}“',
    citationDeleted: 'Zitat {n}, Quelle gelöscht',
    sourceDeleted: 'Quelle gelöscht',
    passages: { one: 'Passage {list}', other: 'Passagen {list}' },
    saveAsNote: 'Als Notiz speichern',
  },
  notes: {
    list: 'Alle Notizen',
    new: 'Neue Notiz',
    back: 'Alle Notizen',
    edit: 'Bearbeiten',
    delete: 'Notiz löschen',
    deleteConfirm: '„{title}“ endgültig löschen?',
    save: 'Speichern',
    cancel: 'Abbrechen',
    titleLabel: 'Titel',
    titlePlaceholder: 'z. B. Fristen im Überblick',
    bodyLabel: 'Text',
    bodyPlaceholder: 'Markdown: # Überschrift, **fett**, *kursiv*, - Liste. Zitate stehen als [1].',
    untitled: 'Unbenannte Notiz',
    emptyBody: 'Diese Notiz ist leer.',
    citationCount: { one: '{count} Zitat', other: '{count} Zitate' },
  },
  sources: {
    kinds: { text: 'Text einfügen', pdf: 'PDF hochladen', url: 'Webseite' },
    addText: {
      title: 'Text einfügen',
      description: 'Jeder Absatz wird zu einer Passage, auf die Antworten verweisen können.',
      titleLabel: 'Titel',
      titlePlaceholder: 'z. B. Protokoll der Sitzung vom 3. März',
      textLabel: 'Text',
      textPlaceholder: 'Text hier einfügen …',
      submit: 'Quelle hinzufügen',
      cancel: 'Abbrechen',
    },
    enabledLabel: 'In Antworten verwenden',
    processing: 'Wird verarbeitet …',
    retry: 'Erneut versuchen',
    delete: 'Quelle löschen',
    deleteConfirm: '„{title}“ endgültig löschen?',
  },
  reader: {
    label: 'Quellenleser',
    close: 'Quelle schließen',
    passageCount: { one: '{count} Passage', other: '{count} Passagen' },
    tokenCount: '{count} Tokens',
    processing: 'Diese Quelle wird gerade verarbeitet.',
    disabled: 'Ausgeschaltet: Antworten berücksichtigen diese Quelle nicht.',
    notFound: 'Diese Quelle gibt es nicht mehr. Wähle eine andere in der Seitenleiste.',
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
      invalid_title: 'Der Titel muss zwischen 1 und {max} Zeichen lang sein.',
      not_found: 'Dieses Notebook gibt es nicht mehr.',
      source_not_found: 'Diese Quelle gibt es nicht mehr.',
      invalid_source_title: 'Gib einen Titel mit höchstens {max} Zeichen ein.',
      invalid_source_text: 'Füge einen Text mit höchstens {max} Zeichen ein.',
      token_cap_exceeded:
        'Zu viel Text: Die aktiven Quellen eines Notebooks dürfen zusammen höchstens {cap} Tokens umfassen. Schalte eine andere Quelle aus oder kürze den Text.',
      interrupted: 'Die Verarbeitung wurde unterbrochen.',
      token_count_failed: 'Die Länge des Textes ließ sich nicht bestimmen.',
      invalid_question: 'Stell eine Frage mit höchstens {max} Zeichen.',
      no_active_sources:
        'Schalte zuerst eine Quelle ein, damit sich die Antwort darauf stützen kann.',
      chat_busy: 'Eine Antwort wird noch geschrieben. Warte, bis sie fertig ist, oder stoppe sie.',
      llm_failed: 'Die Antwort ließ sich nicht erstellen. Stell die Frage bitte noch einmal.',
      invalid_note_title: 'Gib einen Titel mit höchstens {max} Zeichen ein.',
      invalid_note_body: 'Die Notiz darf höchstens {max} Zeichen lang sein.',
      note_not_found: 'Diese Notiz gibt es nicht mehr.',
      answer_not_found: 'Diese Antwort lässt sich nicht als Notiz speichern.',
      unknown: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    },
  },
} as const;

export type ErrorCode = keyof typeof strings.errors.codes;

/** Narrows a stored code (e.g. `sources.error_code`) to a known one; anything else is `unknown`. */
export function toErrorCode(code: string | null): ErrorCode {
  return code !== null && isErrorCode(code) ? code : 'unknown';
}

function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(strings.errors.codes, code);
}

/** The text for a server error code, with `{placeholders}` filled from `values`. */
export function errorMessage(
  code: ErrorCode,
  values: Record<string, string | number> = {},
): string {
  return format(strings.errors.codes[code], values);
}

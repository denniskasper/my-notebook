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

const usdFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });

/** Micro-dollars (as stored in `usage_events`) as a German dollar amount: „0,42 $“. */
export function formatUsd(microUsd: number): string {
  return usdFormat.format(microUsd / 1_000_000);
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
    versionLink: 'Diesen Stand auf GitHub ansehen',
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
    modeLabel: 'Modus',
    agentPlaceholder: 'Beschreibe eine Aufgabe für den Agent …',
    agentScope: 'Darf im Web suchen, Quellen hinzufügen und Notizen schreiben',
    send: 'Senden',
  },
  agent: {
    answer: 'Antwort des Agent',
    name: 'Agent',
    working: 'Agent arbeitet …',
    stop: 'Agent stoppen',
    stopped: 'Abgebrochen',
    steps: 'Schritte',
    stepCount: { one: '{count} Schritt', other: '{count} Schritte' },
    stepSummary: '{count} · {cost}',
    costBelowCent: '< {cost}',
    showSteps: 'Schritte anzeigen',
    hideSteps: 'Schritte ausblenden',
    stepStatus: { running: 'läuft', done: 'erledigt', failed: 'fehlgeschlagen' },
    stepLabels: {
      list_sources: { plain: 'Prüft die Quellen', withArgument: 'Prüft die Quellen' },
      read_source: { plain: 'Liest eine Quelle', withArgument: 'Liest Quelle „{argument}“' },
      create_note: { plain: 'Schreibt eine Notiz', withArgument: 'Schreibt Notiz „{argument}“' },
      web_search: { plain: 'Sucht im Web', withArgument: 'Sucht im Web: ‚{argument}‘' },
      read_web_page: { plain: 'Liest eine Webseite', withArgument: 'Liest Webseite {argument}' },
      add_url_source: {
        plain: 'Fügt eine Quelle hinzu',
        withArgument: 'Fügt {argument} als Quelle hinzu',
      },
    },
    stepFallback: 'Arbeitet',
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
  studio: {
    label: 'Studio',
    generate: 'Briefing erstellen',
    intro:
      'Ein Briefing fasst deine aktiven Quellen zusammen: ein kurzer Überblick und die Kernpunkte, jeweils mit Zitaten.',
    noActiveSources: 'Schalte eine Quelle ein, um ein Briefing zu erstellen.',
    briefing: 'Briefing vom {date}',
    generating: 'Briefing wird erstellt …',
    failed: 'Das Briefing ließ sich nicht erstellen. Versuch es bitte noch einmal.',
    empty: 'Dieses Briefing ist leer.',
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
    addPdf: {
      title: 'PDF hochladen',
      description:
        'Der Text jeder Seite wird zu Passagen, auf die Antworten verweisen können. Die Datei selbst wird nicht gespeichert.',
      fileLabel: 'PDF-Datei',
      drop: 'PDF hierher ziehen',
      choose: 'oder eine Datei auswählen',
      hint: 'Bis {max} MB. Nur PDFs mit Text: Gescannte Seiten lassen sich nicht lesen.',
      reading: '„{name}“ wird gelesen …',
      cancel: 'Abbrechen',
    },
    addUrl: {
      title: 'Webseite hinzufügen',
      description:
        'Der Artikel der Seite wird gelesen und in Passagen geteilt. Navigation, Werbung und Fußzeile bleiben außen vor.',
      urlLabel: 'Adresse',
      urlPlaceholder: 'https://',
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
    pageCount: { one: 'auf {count} Seite', other: 'auf {count} Seiten' },
    page: 'Seite {n}',
    tokenCount: '{count} Tokens',
    openOrigin: 'Originalseite in neuem Tab öffnen',
    processing: 'Diese Quelle wird gerade verarbeitet.',
    disabled: 'Ausgeschaltet: Antworten berücksichtigen diese Quelle nicht.',
    notFound: 'Diese Quelle gibt es nicht mehr. Wähle eine andere in der Seitenleiste.',
  },
  drawer: {
    label: 'Seitenbereich',
    toggle: 'Seitenbereich umschalten',
    close: 'Seitenbereich schließen',
    resize: 'Seitenbereich-Breite ändern',
    tabs: { sources: 'Quellen', studio: 'Studio', notes: 'Notizen' },
    sourcesEmpty:
      'Keine Quelle geöffnet. Klicke auf ein Zitat in einer Antwort oder auf eine Quelle in der Seitenleiste.',
    notesEmpty: 'Noch keine Notizen. Speichere eine Antwort oder schreib selbst eine.',
  },
  usage: {
    meterLabel: 'Tageskontingent',
    meterLeft: '{percent} % übrig',
    composerPaused: 'Fragen sind gerade pausiert.',
    meterHint: 'Dein Kontingent für KI-Antworten heute. Neu ab {time} Uhr.',
  },
  status: {
    title: 'Status',
    verdict: {
      ok: 'Alles in Betrieb.',
      down: 'Die Datenbank ist nicht erreichbar.',
    },
    checkedAt: 'Stand {time} Uhr',
    commit: 'Laufende Version',
    database: { label: 'Datenbank', ok: 'erreichbar', down: 'nicht erreichbar' },
    spendToday: 'KI-Ausgaben heute',
    spendTotal: 'KI-Ausgaben insgesamt',
    spendOf: '{spent} von {limit}',
    spendTodayHint: 'Demo-Budget pro Tag, neu ab 00:00 Uhr.',
    spendTotalHint: 'Demo-Budget für die gesamte Demo.',
    spendUnavailable: 'Ohne Datenbank nicht abrufbar.',
    back: 'Zur App',
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
      pdf_invalid: 'Diese Datei ist kein lesbares PDF. Wähle eine PDF-Datei aus.',
      pdf_too_large: 'Das PDF ist größer als {max} MB. Wähle eine kleinere Datei.',
      pdf_no_text:
        'Dieses PDF enthält keinen Text, vermutlich ist es gescannt. Gescannte PDFs werden nicht unterstützt: Lade ein PDF mit Textebene hoch oder füge den Text ein.',
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
      daily_allowance: 'Dein Tageskontingent ist aufgebraucht – ab {time} Uhr wieder verfügbar.',
      demo_budget_daily: 'Das Demo-Budget für heute ist aufgebraucht. Morgen geht’s weiter.',
      demo_budget_total: 'Das Demo-Budget ist aufgebraucht.',
      rate_limited: 'Kurz durchatmen – in {minutes} Min. wieder möglich.',
      agent_busy: 'Agent ist gerade ausgelastet.',
      studio_busy: 'Ein Briefing wird gerade erstellt. Warte, bis es fertig ist.',
      invalid_task: 'Beschreibe eine Aufgabe mit höchstens {max} Zeichen.',
      agent_max_turns: 'Der Agent hat die Höchstzahl an Schritten erreicht.',
      agent_max_budget: 'Der Agent hat sein Kostenlimit für diese Aufgabe erreicht.',
      agent_timeout: 'Der Agent hat sein Zeitlimit von drei Minuten erreicht.',
      visitor_limit:
        'Von deinem Netzwerk aus wurden heute schon zu viele neue Notebooks begonnen. Morgen geht’s weiter.',
      invalid_url: 'Gib eine Webadresse ein, die mit http:// oder https:// beginnt.',
      url_not_allowed: 'Diese Adresse ist nicht erlaubt.',
      url_unreachable: 'Die Seite ist nicht erreichbar. Prüf die Adresse.',
      url_timeout: 'Die Seite hat nicht rechtzeitig geantwortet.',
      url_too_large: 'Die Seite ist zu groß, um sie zu lesen.',
      url_not_html:
        'Unter dieser Adresse liegt keine Webseite. Dateien wie PDFs lassen sich hier nicht hinzufügen.',
      url_http_error: 'Die Seite hat mit einem Fehler geantwortet.',
      url_too_many_redirects: 'Die Seite leitet zu oft weiter.',
      url_no_content: 'Auf der Seite steht kein lesbarer Text.',
      unknown: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    },
  },
} as const;

const clockFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

/** A time of day in Berlin, where the daily caps reset: „00:00“. */
export function formatClock(date: Date): string {
  return clockFormat.format(date);
}

/**
 * `{time}` and `{minutes}` for a Budget guard message, from when the refusal
 * ends (ISO): the Berlin time, and the whole minutes left (at least one).
 */
export function retryValues(retryAt: string, now: Date): { time: string; minutes: number } {
  const at = new Date(retryAt);
  return {
    time: formatClock(at),
    minutes: Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000)),
  };
}

export type ErrorCode = keyof typeof strings.errors.codes;

// Below this a run's cost rounds to 0,00 $: it shows as „< 0,01 $“ instead.
const CENT_MICRO_USD = 10_000;

/**
 * The folded timeline of an Agent run: the number of Steps and, if known, what
 * the run cost („7 Schritte · 0,04 $“).
 */
export function stepSummary(count: number, costMicroUsd: number | null): string {
  const steps = plural(count, strings.agent.stepCount);
  if (costMicroUsd === null) return steps;
  const cost =
    costMicroUsd > 0 && costMicroUsd < CENT_MICRO_USD / 2
      ? format(strings.agent.costBelowCent, { cost: formatUsd(CENT_MICRO_USD) })
      : formatUsd(costMicroUsd);
  return format(strings.agent.stepSummary, { count: steps, cost });
}

/** The timeline label of a Step: the tool in German, with its key argument if it has one. */
export function stepLabel(tool: string, argument: string | null): string {
  const labels: Record<string, { plain: string; withArgument: string }> = strings.agent.stepLabels;
  const label = labels[tool];
  if (!label) return strings.agent.stepFallback;
  return argument === null ? label.plain : format(label.withArgument, { argument });
}

/** Narrows a stored code (e.g. `sources.error_code`) to a known one; anything else is `unknown`. */
export function toErrorCode(code: string | null): ErrorCode {
  return code !== null && isErrorCode(code) ? code : 'unknown';
}

function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(strings.errors.codes, code);
}

/**
 * The text for a failed Briefing: generic failures get Studio wording, since the
 * shared `llm_failed` text speaks of a Chat question.
 */
export function briefingFailureMessage(code: ErrorCode | null): string {
  if (code === null || code === 'llm_failed' || code === 'unknown') return strings.studio.failed;
  return errorMessage(code);
}

/** The text for a server error code, with `{placeholders}` filled from `values`. */
export function errorMessage(
  code: ErrorCode,
  values: Record<string, string | number> = {},
): string {
  return format(strings.errors.codes[code], values);
}

// Every word genkan shows.
// The language is GENKAN_LANG from .env when it's set, or else the TV's menu language
// (webOSSystem.locale, which webOS hands web apps).
// Any language without a translation here gets English.
// Dates and times come from Intl, as the TV's browser carries full locale data, so each
// locale has its own format.

export type Lang = 'pt-BR' | 'en' | 'es';

interface Strings {
  weather: {
    clear: string;
    mainlyClear: string;
    partlyCloudy: string;
    overcast: string;
    fog: string;
    drizzle: string;
    rain: string;
    heavyRain: string;
    snow: string;
    rainShowers: string;
    snowShowers: string;
    thunderstorm: string;
  };
  settings: string; // the TV settings tile
  cantOpen(app: string, why: string): string;
  noAnswer: string; // the TV didn't answer a call in time
  openFailed: string; // the TV refused a launch and gave no reason why
}

const STRINGS: Record<Lang, Strings> = {
  'pt-BR': {
    weather: {
      clear: 'Céu limpo',
      mainlyClear: 'Poucas nuvens',
      partlyCloudy: 'Parcialmente nublado',
      overcast: 'Nublado',
      fog: 'Neblina',
      drizzle: 'Garoa',
      rain: 'Chuva',
      heavyRain: 'Chuva forte',
      snow: 'Neve',
      rainShowers: 'Pancadas de chuva',
      snowShowers: 'Pancadas de neve',
      thunderstorm: 'Tempestade'
    },
    settings: 'Configurações',
    cantOpen: (app, why) => `Não foi possível abrir ${app}: ${why}`,
    noAnswer: 'a TV não respondeu',
    openFailed: 'erro desconhecido'
  },
  en: {
    weather: {
      clear: 'Clear sky',
      mainlyClear: 'Mostly clear',
      partlyCloudy: 'Partly cloudy',
      overcast: 'Cloudy',
      fog: 'Fog',
      drizzle: 'Drizzle',
      rain: 'Rain',
      heavyRain: 'Heavy rain',
      snow: 'Snow',
      rainShowers: 'Rain showers',
      snowShowers: 'Snow showers',
      thunderstorm: 'Thunderstorm'
    },
    settings: 'Settings',
    cantOpen: (app, why) => `Couldn't open ${app}: ${why}`,
    noAnswer: "the TV didn't answer",
    openFailed: 'unknown error'
  },
  es: {
    weather: {
      clear: 'Despejado',
      mainlyClear: 'Poco nuboso',
      partlyCloudy: 'Parcialmente nublado',
      overcast: 'Nublado',
      fog: 'Niebla',
      drizzle: 'Llovizna',
      rain: 'Lluvia',
      heavyRain: 'Lluvia fuerte',
      snow: 'Nieve',
      rainShowers: 'Chubascos',
      snowShowers: 'Chubascos de nieve',
      thunderstorm: 'Tormenta'
    },
    settings: 'Configuración',
    cantOpen: (app, why) => `No se pudo abrir ${app}: ${why}`,
    noAnswer: 'la TV no respondió',
    openFailed: 'error desconocido'
  }
};

const baseOf = (locale: string) => locale.toLowerCase().split('-')[0];

function pick(locale: string): Lang {
  const base = baseOf(locale);
  if (base === 'pt') return 'pt-BR';
  if (base === 'es') return 'es';
  return 'en';
}

declare global {
  interface Window {
    webOSSystem?: {locale?: string};
    PalmSystem?: {locale?: string};
  }
}

export const LOCALE = String(
  import.meta.env.GENKAN_LANG ||
    window.webOSSystem?.locale ||
    window.PalmSystem?.locale ||
    navigator.language ||
    'en'
).replace(/_/g, '-');
export const LANG = pick(LOCALE);

// Dates and times in the locale itself when it's one of ours, so "en-GB" keeps its 24-hour
// clock and "pt-PT" its own Portuguese; in English, like the rest, for any other.
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(baseOf(LOCALE) === baseOf(LANG) ? LOCALE : LANG, options);
  } catch {
    return new Intl.DateTimeFormat(LANG, options); // a malformed GENKAN_LANG
  }
}
const DATE = formatter({weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
const TIME = formatter({hour: 'numeric', minute: '2-digit'});

export const T = {
  ...STRINGS[LANG],
  // "Sexta-feira, 23 de outubro de 2026": Intl writes the weekday in lower case in Portuguese
  // and Spanish, but it starts the line here
  formatDate: (d: Date) => {
    const s = DATE.format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  // "21:12", or "9:12 PM" where the locale keeps a 12-hour clock
  formatTime: (d: Date) => TIME.format(d)
};

document.documentElement.lang = LANG;

// The TV's language was changed in its settings: start over in the new one.
document.addEventListener('webOSLocaleChange', () => location.reload());

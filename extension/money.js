(() => {
  const app = globalThis.goylarpet ??= {};
  const limit = 99_999_999_999_999;
  const cache = new Map();
  const normalize = text => text.normalize('NFKC').replace(/[\u061c\u200b-\u200f\u2060\u2066-\u2069]/gu, '').replace(/[’‘ʼ]/gu, "'");
  const currency = /(?:US\s*\$|\$\s*US|USD|\$)/i;
  const isCurrency = text => currency.test(normalize(text));
  function separators(lang) {
    if (!cache.has(lang)) {
      const parts = new Intl.NumberFormat(lang, { useGrouping: true }).formatToParts(123456789.1);
      const integers = parts.filter(part => part.type === 'integer');
      cache.set(lang, {
        group: normalize(parts.find(part => part.type === 'group').value),
        decimal: parts.find(part => part.type === 'decimal').value,
        middle: integers.at(-2).value.length
      });
    }
    return cache.get(lang);
  }
  function cents(text, lang, decimal = separators(lang).decimal) {
    const sep = separators(lang);
    const [whole, fraction = '', ...extra] = text.split(decimal);
    if (extra.length || (text.includes(decimal) && !/^\d{1,2}$/.test(fraction))) return null;
    const groups = whole.split(sep.group);
    if (!groups.every(part => /^\d+$/.test(part))) return null;
    if (groups.length > 1 && (groups[0].length > sep.middle || groups.at(-1).length !== 3 ||
      groups.slice(1, -1).some(part => part.length !== sep.middle))) return null;
    const result = Number(groups.join('')) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(result) && result <= limit ? result : null;
  }

  // The site also serves US-style dollar strings on localized pages.
  function parse(text, lang = 'en', currencyRequired = true) {
    let raw = app.locales.asciiDigits(normalize(text).trim()).replaceAll('−', '-');
    const accounting = raw.startsWith('(') && raw.endsWith(')');
    if (accounting) raw = raw.slice(1,-1).trim();
    const match = /^([+-]?)\s*(US\s*\$|\$\s*US|USD|\$)?\s*([+-]?)\s*([\d.,' ٬٫]+?)\s*(US\s*\$|\$\s*US|USD|\$)?$/i.exec(raw);
    if (!match || (match[1] && match[3]) || (match[2] && match[5]) || (currencyRequired && !match[2] && !match[5])) return null;
    if (accounting && (match[1] || match[3])) return null;
    const sign = accounting ? '-' : match[1] || match[3];
    const digits = match[4].trim();
    const langs = Array.isArray(lang) ? lang : [lang];
    const order = currencyRequired && match[2] === '$' ? ['en', ...langs] : [...langs, 'en'];
    // Arabic and Persian pages may render either Latin or Arabic separators
    // independently of the browser's default numbering system for that locale.
    if (/[٬٫]/u.test(digits)) {
      order.unshift(langs.some(l => /^fa\b/i.test(l)) ? 'fa-u-nu-arabext' : 'ar-u-nu-arab');
    }
    if (currencyRequired && digits.includes(' ')) order.push('fr');
    if (currencyRequired && digits.includes("'")) order.push('de-CH');
    if (currencyRequired && /,\d{1,2}$/.test(digits)) order.push('de');
    for (const style of new Set(order)) {
      const sep = separators(style);
      // A site may localize its thousands grouping but use a literal decimal
      // point for cents. A space or apostrophe makes that boundary unambiguous.
      const marks = [sep.decimal];
      if ([' ', "'"].includes(sep.group) && digits.includes(sep.group)) marks.push(sep.decimal === ',' ? '.' : ',');
      for (const decimalMark of marks) {
        const value = cents(digits, style, decimalMark);
        if (value !== null) return { value: sign === '-' ? -value : value, style, decimalMark, currency: match[2] || match[5], suffix: Boolean(match[5]), plus: sign === '+' };
      }
    }
    return null;
  }

  function readSite(text, lang) { return parse(text, lang)?.value ?? null; }
  function readInput(text, lang) { return parse(text, lang, false)?.value ?? null; }

  function decimal(value) {
    const absolute = Math.abs(value);
    const fraction = absolute % 100;
    return (value < 0 ? '-' : '') + Math.floor(absolute / 100) + (fraction ? '.' + String(fraction).padStart(2, '0') : '');
  }

  function format(value, parsed, bare = false, separateSign = false, layout = 'grouped') {
    const places = value % 100 === 0 ? 0 : 2;
    const absolute = Math.abs(value) / 100;
    let number;
    if (layout === 'compact') {
      if (places) return null;
      // Fifteen significant digits cover the full supported range of integer
      // cents. Only abbreviate if the exact coefficient is short as written.
      const parts = new Intl.NumberFormat(parsed.style, { notation: 'compact', maximumSignificantDigits: 15 }).formatToParts(absolute);
      if (!parts.some(p => p.type === 'compact') || parts.some(p => p.type === 'fraction' && p.value.length > 2)) return null;
      number = parts.map(p => p.value).join('');
    } else {
      number = new Intl.NumberFormat(parsed.style, {
        useGrouping: layout === 'grouped', minimumFractionDigits: places, maximumFractionDigits: places
      }).format(absolute);
    }
    if (parsed.decimalMark !== separators(parsed.style).decimal) {
      number = number.replace(separators(parsed.style).decimal, parsed.decimalMark);
    }
    const sign = separateSign ? '' : signFor(value, parsed);
    if (bare) return sign + number;
    return sign + (parsed.suffix ? number + '\u00a0' + parsed.currency : parsed.currency + number);
  }

  function signFor(value, parsed) { return value < 0 ? '-' : parsed.plus && value > 0 ? '+' : ''; }
  app.money = { limit, isCurrency, readInput, readSite, parse, decimal, format, signFor };
})();

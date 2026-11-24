// Names used by the portfolio header, summary card, P&L chart and its controls.
// Each row lists the visible names first, followed by accepted aliases.
// Unit columns are hour / day / week / month / year, in that order.
(() => {
  const app = globalThis.goylarpet ??= {};
  const rows = {
    en: ['Portfolio|Portfolio Value', 'Cash|Available to trade|Buying power|Available balance', 'Profit/Loss|Profit & loss|Profit and loss|PnL|P&L', 'h/hour/hours d/day/days w/week/weeks m/mo/month/months y/yr/year/years', 'All|All time|Max', 'YTD|Year to date'],
    ru: ['Портфель|Стоимость портфеля', 'Доступно для торговли|Наличные|Покупательная способность', 'Прибыль/убыток|Прибыль и убыток|Прибыль и убытки|Прибыль/убытки', 'ч/час д/дн/день н/нед/неделя м/мес/месяц г/год', 'Все|Всё|За всё время', 'С начала года|СНГ'],
    es: ['Cartera|Portafolio|Valor de la cartera', 'Disponible para operar|Efectivo|Poder adquisitivo|Disponible para negociar', 'Ganancias/pérdidas|Ganancias y pérdidas|Beneficios/pérdidas', 'h/hora d/día s/sem/semana m/mes a/año', 'Todo|Todos|Máx|Desde el inicio', 'Desde principios de año|En lo que va de año'],
    fr: ['Portefeuille|Valeur du portefeuille', 'Disponible pour le trading|Liquidités|Espèces|Pouvoir d’achat|Disponible pour trader', 'Profits/Pertes|Profit/Perte|Gains/Pertes|Bénéfices/Pertes|Profits et pertes', 'h/heure j/jour s/sem/semaine m/mois a/an', 'Tout|Tous|Depuis le début', 'Depuis le début de l’année'],
    de: ['Portfolio|Portfoliowert', 'Zum Handel verfügbar|Bargeld|Kaufkraft|Verfügbar zum Handeln|Guthaben', 'Gewinn/Verlust|Gewinne/Verluste|Gewinn und Verlust', 'h/std/stunde t/tag w/wo/woche m/monat j/jahr', 'Alle|Alles|Gesamt|Gesamter Zeitraum', 'Seit Jahresbeginn'],
    it: ['Portafoglio|Valore del portafoglio', 'Disponibile per il trading|Contanti|Liquidità|Potere d’acquisto', 'Profitti/Perdite|Profitto/Perdita|Guadagni/Perdite', 'h/ora g/giorno s/sett/settimana m/mese a/anno', 'Tutto|Tutti|Sempre', 'Da inizio anno'],
    pt: ['Portfólio|Carteira|Valor da carteira', 'Disponível para negociar|Dinheiro|Saldo disponível|Poder de compra|Disponível para negociação', 'Lucro/Prejuízo|Lucros/Perdas|Lucro/Perda|Lucros e perdas|Lucro e prejuízo', 'h/hora d/dia s/sem/semana m/mês a/ano', 'Tudo|Todos|Todo o período', 'Desde o início do ano'],
    nl: ['Portefeuille|Portfolio', 'Beschikbaar om te handelen|Contanten|Koopkracht|Beschikbaar saldo', 'Winst/Verlies|Winst en verlies', 'u/uur d/dag w/week m/maand j/jaar', 'Alles|Alle', 'Sinds begin dit jaar'],
    pl: ['Portfel|Wartość portfela', 'Dostępne do handlu|Gotówka|Siła nabywcza', 'Zysk/Strata|Zyski/Straty|Zyski i straty', 'g/godz d/dz/dzień t/tydz/tydzień m/mies/miesiąc r/rok', 'Wszystko|Wszystkie|Cały okres', 'Od początku roku'],
    uk: ['Портфель|Вартість портфеля', 'Доступно для торгівлі|Готівка|Купівельна спроможність', 'Прибуток/збиток|Прибуток і збиток|Прибутки/збитки', 'г/год д/день т/тиж м/міс р/рік', 'Усе|Все|Весь час', 'З початку року'],
    tr: ['Portföy|Portföy Değeri', 'İşlem için kullanılabilir|Nakit|Alım gücü|İşleme hazır', 'Kâr/Zarar|Kar/Zarar|Kâr ve zarar|Kazanç/Kayıp', 'sa/saat g/gün h/hafta a/ay y/yıl', 'Tümü|Hepsi|Tüm zamanlar', 'Yılbaşından bugüne'],
    ja: ['ポートフォリオ|資産総額', '取引可能額|現金|購買力|取引可能残高|取引可能', '損益|利益/損失|利益と損失', '時間/時 日 週/週間 月/ヶ月/か月 年', 'すべて|全て|全期間', '年初来'],
    ko: ['포트폴리오|포트폴리오 가치', '거래 가능 금액|현금|구매력|거래 가능|거래 가능 잔액', '손익|수익/손실|이익/손실', '시간 일 주 개월/달/월 년', '전체|모두|전체 기간', '연초 대비|연초 이후'],
    'zh-Hans': ['投资组合|资产组合|组合', '可用于交易|现金|购买力|可交易余额|可用资金|可交易', '盈亏|损益|利润/亏损|盈利/亏损|收益/损失', '小时/时 天/日 周/星期 月/个月 年', '全部|所有|所有时间', '年初至今|今年以来'],
    'zh-Hant': ['投資組合|資產組合|組合', '可用於交易|現金|購買力|可交易餘額|可用資金|可交易', '盈虧|損益|利潤/虧損|獲利/虧損', '小時/時 天/日 週/周/星期 月/個月 年', '全部|所有|所有時間', '年初至今|今年以來'],
    vi: ['Danh mục đầu tư|Danh mục', 'Có thể giao dịch|Tiền mặt|Sức mua|Khả dụng để giao dịch', 'Lãi/Lỗ|Lợi nhuận/Thua lỗ|Lợi nhuận và thua lỗ', 'g/giờ n/ngày t/tuần th/tháng năm', 'Tất cả|Toàn bộ', 'Từ đầu năm'],
    id: ['Portofolio|Nilai portofolio', 'Tersedia untuk diperdagangkan|Tunai|Uang tunai|Daya beli|Tersedia untuk trading', 'Untung/Rugi|Laba/Rugi|Keuntungan/Kerugian', 'j/jam h/hari m/minggu b/bln/bulan t/thn/tahun', 'Semua|Sepanjang waktu', 'Sejak awal tahun'],
    ms: ['Portfolio', 'Tersedia untuk dagangan|Tunai|Kuasa beli', 'Untung/Rugi|Keuntungan/Kerugian', 'j/jam h/hari m/minggu b/bulan t/tahun', 'Semua', 'Sejak awal tahun'],
    hi: ['पोर्टफोलियो|पोर्टफ़ोलियो', 'ट्रेडिंग के लिए उपलब्ध|नकद|नकदी|क्रय शक्ति', 'लाभ/हानि|मुनाफा/नुकसान|लाभ और हानि', 'घं/घंटा दि/दिन स/सप्ताह मा/महीना व/वर्ष/साल', 'सभी|कुल', 'वर्ष की शुरुआत से'],
    ar: ['المحفظة|محفظة', 'متاح للتداول|النقد|نقد|القوة الشرائية', 'الربح/الخسارة|الأرباح والخسائر|الربح والخسارة', 'س/ساعة ي/يوم أ/أسبوع ش/شهر سنة/عام', 'الكل|الجميع|كل الوقت', 'منذ بداية العام'],
    th: ['พอร์ตโฟลิโอ|พอร์ตการลงทุน', 'พร้อมสำหรับการซื้อขาย|เงินสด|อำนาจซื้อ', 'กำไร/ขาดทุน|กำไรและขาดทุน', 'ชม/ชั่วโมง ว/วัน ส/สัปดาห์ ด/เดือน ป/ปี', 'ทั้งหมด|ตลอดเวลา', 'ตั้งแต่ต้นปี'],
    he: ['תיק השקעות|תיק ההשקעות', 'זמין למסחר|מזומן|כוח קנייה', 'רווח/הפסד|רווח והפסד', 'שעה יום שבוע חודש שנה', 'הכל|הכול', 'מתחילת השנה'],
    ro: ['Portofoliu', 'Disponibil pentru tranzacționare|Numerar|Putere de cumpărare', 'Profit/Pierdere|Profit și pierdere', 'h/oră z/zi s/săptămână l/lună a/an', 'Tot|Toate', 'De la începutul anului'],
    sv: ['Portfölj', 'Tillgängligt för handel|Kontanter|Köpkraft', 'Vinst/Förlust|Vinst och förlust', 'h/tim/timme d/dag v/vecka m/mån/månad å/år', 'Alla|Allt', 'Hittills i år'],
    fa: ['پرتفوی|سبد سرمایه‌گذاری|پورتفولیو', 'موجود برای معامله|وجه نقد|قدرت خرید', 'سود/زیان|سود و زیان', 'ساعت روز هفته ماه سال', 'همه|کل', 'از ابتدای سال']
  };
  const normalize = text => String(text ?? '').normalize('NFKC').toLowerCase().replace(/i\u0307/g, 'i')
    .replace(/[\u061c\u200b-\u200f\u2066-\u2069]/gu, '').replace(/[\s/＆&・.’'_-]+/gu, '');
  function asciiDigits(text) {
    return text.replace(/[٠-٩۰-۹०-९০-৯๐-๙]/gu, char => {
      const code = char.charCodeAt(0);
      const zero = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50].find(start => code >= start && code <= start + 9);
      return String(code - zero);
    });
  }
  const keys = ['portfolio', 'cash', 'pnl'];
  const locales = Object.fromEntries(Object.entries(rows).map(([lang, row]) => {
    const labels = Object.fromEntries(keys.map((key, i) => [key, row[i].split('|')]));
    const units = new Map();
    row[3].split(' ').forEach((group, i) => group.split('/').forEach(unit => units.set(normalize(unit), ['h','d','w','m','y'][i])));
    return [lang, { labels, units, all: row[4].split('|').map(normalize), ytd: row[5].split('|').map(normalize) }];
  }));
  // A translated card can be rendered before the URL or <html lang> changes.
  // Only exact, unambiguous metric names from the language map qualify.
  const labelIndex = new Map();
  for (const [lang, dict] of Object.entries(locales)) {
    for (const [id, aliases] of Object.entries(dict.labels)) {
      for (const alias of aliases) {
        const key = normalize(alias);
        const entry = labelIndex.get(key) || { id, languages: new Set() };
        if (entry.id !== id) entry.id = null;
        entry.languages.add(lang);
        labelIndex.set(key, entry);
      }
    }
  }
  function labelInfo(text) { return text.length < 110 ? labelIndex.get(normalize(text)) : undefined; }
  function labelLanguage(text, preferred) {
    const langs = labelInfo(text)?.languages;
    return !langs || langs.has(preferred) ? preferred : langs.values().next().value;
  }
  function resolve(tag) {
    const code = (tag || '').toLowerCase().replaceAll('_', '-');
    if (/^(zh|cn|tw)(-|$)/.test(code)) return /hant|tw|hk|mo/.test(code) ? 'zh-Hant' : 'zh-Hans';
    const base = code.split('-')[0];
    if (Object.hasOwn(locales, base)) return base;
  }
  function language(pathname, htmlLang) {
    return resolve(pathname.split('/')[1]) || resolve(htmlLang) || 'en';
  }
  const durationNames = { h: 'hour', d: 'day', w: 'week', m: 'month', y: 'year', min: 'minute' };
  const unitFormats = new Map();
  function writtenDuration(value, lang) {
    const digits = value.match(/\d{1,3}/g);
    if (digits?.length !== 1 || Number(digits[0]) < 1) return null;
    if (!unitFormats.has(lang)) {
      const formats = [];
      for (const [id, unit] of Object.entries(durationNames)) {
        for (const unitDisplay of ['long','short']) {
          formats.push([id, new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay })]);
        }
      }
      unitFormats.set(lang, formats);
    }
    const n = Number(digits[0]);
    for (const [id, format] of unitFormats.get(lang)) {
      if (asciiDigits(normalize(format.format(n))) === value) return n + id;
    }
    return null;
  }
  function rangeKey(raw, lang) {
    const value = asciiDigits(normalize(raw));
    if (!value) return null;
    const match = /^(\d{1,3})(\D+)$/.exec(value);
    for (const dict of [locales[lang], locales.en]) {
      if (dict.all.includes(value)) return 'all';
      if (dict.ytd.includes(value)) return 'ytd';
      if (match && Number(match[1]) && dict.units.has(match[2])) return Number(match[1]) + dict.units.get(match[2]);
      if (dict.units.has(value)) return '1' + dict.units.get(value);
    }
    if (['mtd','qtd','wtd'].includes(value)) return value;
    return writtenDuration(value, lang);
  }
  // Resolve a whole strip together. An isolated "1J" has different meanings
  // in French and German. The other controls and their language disambiguate it.
  function rangeKeys(items, preferred, fallback) {
    const canonical = items.map(item => rangeKey(item.canonical, 'en'));
    // A data range can describe a shared chart window (such as one year).
    // Distinct visible controls for that window still need separate offsets.
    const shared = new Set(canonical.filter((id, i) => id && canonical.indexOf(id) !== i));
    const read = lang => items.map((item, i) => {
      const tag = canonical[i];
      if (tag && !shared.has(tag)) return tag;
      return rangeKey(item.label, lang) || rangeKey(item.aria, lang) || tag;
    });
    const score = keys => new Set(keys.filter(Boolean)).size;
    let keys = read(preferred);
    const english = read('en');
    const englishUnit = items.some(item => {
      const unit = normalize(item.label).match(/^\d+([a-z]+)$/)?.[1];
      return unit && locales.en.units.has(unit) && !locales[preferred].units.has(unit);
    });
    // A translated page may keep an entire control strip in English.
    if (score(english) > score(keys) || (englishUnit && english.every(Boolean) && score(english) === items.length)) keys = english;
    if (score(keys) === items.length) return keys;
    let best = score(keys);
    const initial = best;
    let consensus;
    for (const lang of new Set([fallback, ...Object.keys(locales)])) {
      if (lang === preferred || lang === 'en') continue;
      const candidate = read(lang);
      const count = score(candidate);
      if (count > best) {
        best = count;
        consensus = candidate;
      } else if (count === best && count > initial) {
        consensus = consensus.map((id,i) => id === candidate[i] ? id : null);
      }
    }
    return consensus || keys;
  }
  const periodsToDate = { all: 'All time', ytd: 'Year to date', mtd: 'Month to date', qtd: 'Quarter to date', wtd: 'Week to date' };
  function englishName(id) {
    if (Object.hasOwn(locales.en.labels, id)) return locales.en.labels[id][0];
    const key = id.slice(4);
    if (Object.hasOwn(periodsToDate, key)) return periodsToDate[key];
    const duration = /^(\d+)(min|[hdwmy])$/.exec(key);
    if (!duration) return 'Time range';
    return duration[1] + ' ' + durationNames[duration[2]] + (duration[1] === '1' ? '' : 's');
  }
  app.locales = { locales, language, normalize, rangeKey, rangeKeys, asciiDigits, labelInfo, labelLanguage, englishName };
})();

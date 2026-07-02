const cc = require('currency-codes');
const fs = require('fs');

const SYMBOLS = {
  "USD":"$","EUR":"€","GBP":"£","JPY":"¥","CNY":"¥","CHF":"Fr","CAD":"CA$","AUD":"A$",
  "NZD":"NZ$","BRL":"R$","MXN":"MX$","SEK":"kr","NOK":"kr","DKK":"kr","INR":"₹",
  "RUB":"₽","KRW":"₩","SGD":"S$","HKD":"HK$","TWD":"NT$","THB":"฿","MYR":"RM",
  "IDR":"Rp","PHP":"₱","VND":"₫","TRY":"₺","PLN":"zł","CZK":"Kč","HUF":"Ft",
  "RON":"lei","ZAR":"R","NGN":"₦","KES":"KSh","EGP":"E£","MAD":"DH","TND":"DT",
  "XOF":"CFA","XAF":"FCFA","HTG":"G","GHS":"₵","PKR":"₨","BDT":"৳","LKR":"Rs",
  "SAR":"﷼","AED":"د.إ","ILS":"₪","CRC":"₡","UYU":"$U","CLP":"$","COP":"COL$",
  "PEN":"S/","ARS":"AR$","BOB":"Bs","PYG":"₲","UAH":"₴","GEL":"₾","AZN":"₼",
  "KZT":"₸","ISK":"kr","BGN":"лв","XAU":"oz","XAG":"oz","XPT":"oz","XPD":"oz",
  "XDR":"SDR","AFN":"؋","ALL":"L","AMD":"֏","ANG":"ƒ","AOA":"Kz","AWG":"ƒ",
  "BAM":"KM","BBD":"$","BDT":"৳","BHD":".د.ب","BIF":"FBu","BMD":"$","BND":"$",
  "BSD":"$","BTN":"Nu.","BWP":"P","BYN":"Br","BZD":"$","CDF":"FC","CLF":"UF",
  "CNH":"¥","CUP":"₱","CVE":"$","CZK":"Kč","DJF":"Fdj","DOP":"RD$","ERN":"Nfk",
  "ETB":"Br","FJD":"$","FKP":"£","GIP":"£","GMD":"D","GNF":"FG","GTQ":"Q",
  "GYD":"$","HNL":"L","HRK":"kn","HTG":"G","IRR":"﷼","JMD":"$","JOD":"د.ا",
  "KGS":"с","KHR":"៛","KMF":"CF","KPW":"₩","KWD":"د.ك","KYD":"$","LAK":"₭",
  "LBP":"ل.ل","LRD":"$","LSL":"L","LYD":"ل.د","MKD":"ден","MMK":"K","MNT":"₮",
  "MOP":"MOP$","MRU":"UM","MUR":"₨","MVR":"Rf","MWK":"MK","MZN":"MT","NAD":"$",
  "NIO":"C$","NPR":"Rs","OMR":"﷼","PAB":"B/.","PGK":"K","QAR":"﷼","RSD":"дин.",
  "RWF":"FRw","SBD":"$","SCR":"₨","SDG":"ج.س.","SHP":"£","SLE":"Le","SLL":"Le",
  "SOS":"S","SRD":"$","SSP":"£","STN":"Db","SYP":"£","SZL":"E","TJS":"SM",
  "TMT":"T","TOP":"T$","TTD":"$","TZS":"TSh","UGX":"USh","UZS":"лв","VES":"Bs",
  "VUV":"VT","WST":"WS$","YER":"﷼","ZMW":"ZK","ZWL":"$",
  "VED":"Bs","ZWG":"ZiG","XSU":"Su","XUA":"UA","XBA":"EURCO","XBB":"EMU6",
  "XBC":"EUA9","XBD":"EUA17","XTS":"XXX","XXX":"—",
};

// Explicit override for currencies that map to the wrong flag or have no country
const FLAG_OVERRIDES = {
  "EUR":"🇪🇺","USD":"🇺🇸","GBP":"🇬🇧","AUD":"🇦🇺","NZD":"🇳🇿","CAD":"🇨🇦",
  "XOF":"🇸🇳","XAF":"🇨🇲","XPF":"🇵🇫","MDL":"🇲🇩",
  "ANG":"🇨🇼","XCD":"🇦🇬","SVC":"🇸🇻","XDR":"🌐","XAG":"🥈","XAU":"🥇",
  "XPT":"💎","XPD":"💎","XBA":"🏳️","XBB":"🏳️","XBC":"🏳️","XBD":"🏳️",
  "XSU":"🏳️","XTS":"🏳️","XUA":"🏳️","XXX":"🏳️","BOV":"🇧🇴","CUC":"🇨🇺",
  "UYI":"🇺🇾","UYW":"🇺🇾","VED":"🇻🇪","ZWG":"🇿🇼","COU":"🇨🇴","MXV":"🇲🇽",
  "CHE":"🇨🇭","CHW":"🇨🇭","USN":"🇺🇸","USS":"🇺🇸",
  "IRR":"🇮🇷","KMF":"🇰🇲","KPW":"🇰🇵","KRW":"🇰🇷","KYD":"🇰🇾","LAK":"🇱🇦",
  "PHP":"🇵🇭","RUB":"🇷🇺","SDG":"🇸🇩","SHP":"🇸🇭","TRY":"🇹🇷","TZS":"🇹🇿",
  "VES":"🇻🇪","AED":"🇦🇪","BOB":"🇧🇴","BSD":"🇧🇸","DOP":"🇩🇴","FKP":"🇫🇰",
  "GMD":"🇬🇲",
};

// Codes ISO à exclure (devises interbancaires ou de règlement, pas pertinentes pour les utilisateurs)
const EXCLUDED_CODES = new Set(["USN","USS","MXV","CLF","CHE","CHW","UYI","COU","BOV","UYW","XBA","XBB","XBC","XBD","XSU","XTS","XUA","XXX"]);

const LOCALE_MAP = {
  USD:"en-US",EUR:"fr-FR",GBP:"en-GB",JPY:"ja-JP",CNY:"zh-CN",CHF:"de-CH",
  CAD:"en-CA",AUD:"en-AU"
};

const all = cc.codes();
let entries = all.map(code => {
  const e = cc.code(code);
  return {
    code,
    symbol: SYMBOLS[code] || code,
    name: e ? e.currency : code,
    flag: FLAG_OVERRIDES[code] || '🌍',
    locale: LOCALE_MAP[code] || 'en-US'
  };
});

// Now fill remaining 🌍 with country-based flags from the library
const COUNTRY_CODES = {
  "Afghanistan":"AF","Åland Islands":"AX","Albania":"AL","Algeria":"DZ",
  "American Samoa":"AS","Andorra":"AD","Angola":"AO","Anguilla":"AI",
  "Antarctica":"AQ","Antigua and Barbuda":"AG","Argentina":"AR","Armenia":"AM",
  "Aruba":"AW","Australia":"AU","Austria":"AT","Azerbaijan":"AZ",
  "Bahamas":"BS","Bahrain":"BH","Bangladesh":"BD","Barbados":"BB",
  "Belarus":"BY","Belgium":"BE","Belize":"BZ","Benin":"BJ",
  "Bermuda":"BM","Bhutan":"BT","Bolivia (Plurinational State of)":"BO",
  "Bonaire, Sint Eustatius and Saba":"BQ","Bosnia and Herzegovina":"BA",
  "Botswana":"BW","Bouvet Island":"BV","Brazil":"BR",
  "British Indian Ocean Territory":"IO","Brunei Darussalam":"BN",
  "Bulgaria":"BG","Burkina Faso":"BF","Burundi":"BI","Cabo Verde":"CV",
  "Cambodia":"KH","Cameroon":"CM","Canada":"CA","Cayman Islands":"KY",
  "Central African Republic":"CF","Chad":"TD","Chile":"CL","China":"CN",
  "Christmas Island":"CX","Cocos (Keeling) Islands":"CC","Colombia":"CO",
  "Comoros":"KM","Congo":"CG","Congo (The Democratic Republic of The)":"CD",
  "Cook Islands":"CK","Costa Rica":"CR","Côte d'Ivoire":"CI","Croatia":"HR",
  "Cuba":"CU","Curaçao":"CW","Cyprus":"CY","Czechia":"CZ",
  "Denmark":"DK","Djibouti":"DJ","Dominica":"DM","Dominican Republic":"DO",
  "Ecuador":"EC","Egypt":"EG","El Salvador":"SV","Equatorial Guinea":"GQ",
  "Eritrea":"ER","Estonia":"EE","Eswatini":"SZ","Ethiopia":"ET",
  "Falkland Islands (Malvinas)":"FK","Faroe Islands":"FO","Fiji":"FJ",
  "Finland":"FI","France Gest":"GF","French Polynesia":"PF",
  "Gabon":"GA","Gambia":"GM","Georgia":"GE","Germany":"DE","Ghana":"GH",
  "Gibraltar":"GI","Greece":"GR","Greenland":"GL","Grenada":"GD",
  "Guadeloupe":"GP","Guam":"GU","Guatemala":"GT","Guernsey":"GG",
  "Guinea":"GN","Guinea-Bissau":"GW","Guyana":"GY","Haiti":"HT",
  "Heard Island and McDonald Islands":"HM","Holy See (Vatican City State)":"VA",
  "Honduras":"HN","Hong Kong":"HK","Hungary":"HU","Iceland":"IS","India":"IN",
  "Indonesia":"ID","Iran (Islamic Republic of)":"IR","Iraq":"IQ","Ireland":"IE",
  "Isle of Man":"IM","Israel":"IL","Italy":"IT","Jamaica":"JM","Japan":"JP",
  "Jersey":"JE","Jordan":"JO","Kazakhstan":"KZ","Kenya":"KE","Kiribati":"KI",
  "Korea (The Democratic People's Republic of)":"KP",
  "Korea (The Republic of)":"KR","Kuwait":"KW","Kyrgyzstan":"KG",
  "Lao People's Democratic Republic":"LA","Latvia":"LV","Lebanon":"LB",
  "Lesotho":"LS","Liberia":"LR","Libya":"LY","Liechtenstein":"LI",
  "Lithuania":"LT","Luxembourg":"LU","Macao":"MO","Madagascar":"MG",
  "Malawi":"MW","Malaysia":"MY","Maldives":"MV","Mali":"ML","Malta":"MT",
  "Marshall Islands":"MH","Martinique":"MQ","Mauritania":"MR",
  "Mauritius":"MU","Mayotte":"YT","Mexico":"MX","Micronesia (Federated States of)":"FM",
  "Moldova (The Republic of)":"MD","Monaco":"MC","Mongolia":"MN",
  "Montenegro":"ME","Montserrat":"MS","Morocco":"MA","Mozambique":"MZ",
  "Myanmar":"MM","Namibia":"NA","Nauru":"NR","Nepal":"NP","Netherlands":"NL",
  "New Caledonia":"NC","New Zealand":"NZ","Nicaragua":"NI","Niger":"NE",
  "Nigeria":"NG","Niue":"NU","Norfolk Island":"NF","North Macedonia":"MK",
  "Northern Mariana Islands":"MP","Norway":"NO","Oman":"OM","Pakistan":"PK",
  "Palau":"PW","Palestine, State of":"PS","Panama":"PA","Papua New Guinea":"PG",
  "Paraguay":"PY","Peru":"PE","Philippines":"PH","Pitcairn":"PN",
  "Poland":"PL","Portugal":"PT","Puerto Rico":"PR","Qatar":"QA",
  "Réunion":"RE","Romania":"RO","Russian Federation":"RU","Rwanda":"RW",
  "Saint Barthélemy":"BL","Saint Helena, Ascension and Tristan da Cunha":"SH",
  "Saint Kitts and Nevis":"KN","Saint Lucia":"LC","Saint Martin (French part)":"MF",
  "Saint Pierre and Miquelon":"PM","Saint Vincent and the Grenadines":"VC",
  "Samoa":"WS","San Marino":"SM","Sao Tome and Principe":"ST",
  "Saudi Arabia":"SA","Senegal":"SN","Serbia":"RS","Seychelles":"SC",
  "Sierra Leone":"SL","Singapore":"SG","Sint Maarten (Dutch part)":"SX",
  "Slovakia":"SK","Slovenia":"SI","Solomon Islands":"SB","Somalia":"SO",
  "South Africa":"ZA","South Georgia and the South Sandwich Islands":"GS",
  "South Sudan":"SS","Spain":"ES","Sri Lanka":"LK","Sudan":"SD",
  "Suriname":"SR","Svalbard and Jan Mayen":"SJ","Sweden":"SE",
  "Switzerland":"CH","Syrian Arab Republic":"SY","Taiwan (Province of China)":"TW",
  "Tajikistan":"TJ","Tanzania, United Republic of":"TZ","Thailand":"TH",
  "Timor-Leste":"TL","Togo":"TG","Tokelau":"TK","Tonga":"TO",
  "Trinidad and Tobago":"TT","Tunisia":"TN","Turkey":"TR","Turkmenistan":"TM",
  "Turks and Caicos Islands":"TC","Tuvalu":"TV","Uganda":"UG","Ukraine":"UA",
  "United Arab Emirates":"AE","United Kingdom":"GB","United States":"US",
  "United States Minor Outlying Islands":"UM","Uruguay":"UY","Uzbekistan":"UZ",
  "Vanuatu":"VU","Venezuela (Bolivarian Republic of)":"VE","Viet Nam":"VN",
  "Virgin Islands (British)":"VG","Virgin Islands (U.S.)":"VI","Wallis and Futuna":"WF",
  "Western Sahara":"EH","Yemen":"YE","Zambia":"ZM","Zimbabwe":"ZW",
};

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
}

// Fill remaining 🌍 from country names
for (const e of entries) {
  if (e.flag === '🌍') {
    const data = cc.code(e.code);
    if (data && data.countries) {
      for (const country of data.countries) {
        const iso = COUNTRY_CODES[country];
        if (iso) { e.flag = flagEmoji(iso); break; }
      }
    }
  }
}

// Generate file
let lines = [
  '// Auto-generated from currency-codes library — do not edit manually',
  '// Run: node scripts/generate-currencies.cjs',
  'export interface CurrencyInfo { code: string; symbol: string; name: string; flag: string; locale: string; }',
  '',
  'export const CURRENCIES: CurrencyInfo[] = [',
];

for (const e of entries) {
  if (EXCLUDED_CODES.has(e.code)) continue;
  const name = e.name.replace(/'/g, "\\'");
  lines.push(`  { code: '${e.code}', symbol: '${e.symbol}', name: '${name}', flag: '${e.flag}', locale: '${e.locale}' },`);
}

lines.push('];');
lines.push('');
lines.push('export const CURRENCY_MAP: Record<string, CurrencyInfo> = CURRENCIES.reduce((acc, c) => {');
lines.push('  acc[c.code] = c;');
lines.push('  return acc;');
lines.push('}, {} as Record<string, CurrencyInfo>);');

fs.writeFileSync('/Users/steeve/philia_vault_landing/PhiliaVaultApp/constants/currencies.ts', lines.join('\n'));

// Count remaining 🌍
const remaining = entries.filter(e => e.flag === '🌍');
console.log('✅ Written ' + entries.length + ' currencies');
console.log('⚠️  Remaining 🌍: ' + remaining.length + (remaining.length ? ' (' + remaining.map(e=>e.code).join(', ') + ')' : ' — NONE!'));

const CYR = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':"'",'э':'e','ю':'yu','я':'ya',
};
const ARAB = {
  'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j','ح':'H','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'S','ض':'D','ط':'T','ظ':'Z','ع':"'",'غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'a','ة':'h','ء':"'",'لا':'la',
};
const DEVA = {
  'अ':'a','आ':'aa','इ':'i','ई':'ii','उ':'u','ऊ':'uu','ए':'e','ऐ':'ai','ओ':'o','औ':'au','क':'k','ख':'kh','ग':'g','घ':'gh','च':'ch','छ':'chh','ज':'j','झ':'jh','ट':'T','ठ':'Th','ड':'D','ढ':'Dh','ण':'N','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'S','स':'s','ह':'h','ा':'aa','ि':'i','ी':'ii','ु':'u','ू':'uu','े':'e','ै':'ai','ो':'o','ौ':'au','्':'','ं':'m','ः':'h','।':'.',
};
const HEB = {
  'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch','ט':'t','י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s','ע':"'",'פ':'p','ף':'p','צ':'tz','ץ':'tz','ק':'q','ר':'r','ש':'sh','ת':'t',
};
const GR = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o',
};

function mapChars(text, table) {
  return [...text].map((ch) => {
    const lower = ch.toLowerCase();
    const rep = table[ch] ?? table[lower];
    if (rep === undefined) return ch;
    return ch !== lower ? rep.toUpperCase() : rep;
  }).join('');
}

export function romanize(text, kind) {
  if (!text) return '';
  switch (kind) {
    case 'cyrillic': return mapChars(text, CYR);
    case 'arabic': return mapChars(text, ARAB);
    case 'devanagari': return mapChars(text, DEVA);
    case 'hebrew': return mapChars(text, HEB);
    case 'greek': return mapChars(text, GR);
    case 'hangul': return hangulRomanize(text);
    case 'japanese': return text;
    case 'pinyin': return text;
    default: return text;
  }
}

function hangulRomanize(text) {
  return [...text].map((ch) => {
    const code = ch.codePointAt(0);
    if (code < 0xac00 || code > 0xd7a3) return ch;
    const s = code - 0xac00;
    const initials = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
    const medials = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
    const finals = ['','k','kk','ks','n','nj','nh','t','l','lk','lm','lb','ls','lt','lp','lh','m','p','ps','t','ch','t','k','t','p','h'];
    const i = Math.floor(s / 588);
    const m = Math.floor((s % 588) / 28);
    const f = s % 28;
    return initials[i] + medials[m] + finals[f];
  }).join('');
}

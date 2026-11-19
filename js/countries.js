// The countries in the diary. Each has its own albums file, its own region map
// and its own list of regions: [code, slug, English, Japanese, Spanish, group index].
// The code must match the feature id in the map file.
window.COUNTRIES = [
  {
    slug: "japan",
    names: { en: "Japan", ja: "日本", es: "Japón" },
    data: "data/japan.json",
    map: { file: "data/prefectures.topo.json", object: "prefectures" },
    size: [800, 800],
    // Fixed view of the main islands, with Okinawa in a box at the top left.
    extent: [[128.5, 30.8], [146.0, 45.6]],
    inset: "47",
    municipalities: true,
    unit: { en: ["prefecture", "prefectures"], ja: ["都道府県", "都道府県"], es: ["prefectura", "prefecturas"] },
    groups: {
      en: ["Hokkaido", "Tohoku", "Kanto", "Chubu", "Kansai", "Chugoku", "Shikoku", "Kyushu & Okinawa"],
      ja: ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄"],
      es: ["Hokkaido", "Tohoku", "Kanto", "Chubu", "Kansai", "Chugoku", "Shikoku", "Kyushu y Okinawa"]
    },
    regions: window.PREFECTURES
  },
  {
    slug: "china",
    names: { en: "China", ja: "中国", es: "China" },
    data: "data/china.json",
    map: { file: "data/china.geo.json" },
    size: [800, 640],
    unit: { en: ["province", "provinces"], ja: ["省級行政区", "省級行政区"], es: ["provincia", "provincias"] },
    groups: {
      en: ["North China", "Northeast", "East China", "South Central", "Southwest", "Northwest", "Special administrative regions"],
      ja: ["華北", "東北", "華東", "中南", "西南", "西北", "特別行政区"],
      es: ["Norte de China", "Noreste", "Este de China", "Centro-sur", "Suroeste", "Noroeste", "Regiones administrativas especiales"]
    },
    regions: [
      ["CN-BJ", "beijing", "Beijing", "北京市", "Pekín", 0],
      ["CN-TJ", "tianjin", "Tianjin", "天津市", "Tianjin", 0],
      ["CN-HE", "hebei", "Hebei", "河北省", "Hebei", 0],
      ["CN-SX", "shanxi", "Shanxi", "山西省", "Shanxi", 0],
      ["CN-NM", "inner-mongolia", "Inner Mongolia", "内モンゴル自治区", "Mongolia Interior", 0],
      ["CN-LN", "liaoning", "Liaoning", "遼寧省", "Liaoning", 1],
      ["CN-JL", "jilin", "Jilin", "吉林省", "Jilin", 1],
      ["CN-HL", "heilongjiang", "Heilongjiang", "黒竜江省", "Heilongjiang", 1],
      ["CN-SH", "shanghai", "Shanghai", "上海市", "Shanghái", 2],
      ["CN-JS", "jiangsu", "Jiangsu", "江蘇省", "Jiangsu", 2],
      ["CN-ZJ", "zhejiang", "Zhejiang", "浙江省", "Zhejiang", 2],
      ["CN-AH", "anhui", "Anhui", "安徽省", "Anhui", 2],
      ["CN-FJ", "fujian", "Fujian", "福建省", "Fujian", 2],
      ["CN-JX", "jiangxi", "Jiangxi", "江西省", "Jiangxi", 2],
      ["CN-SD", "shandong", "Shandong", "山東省", "Shandong", 2],
      ["CN-HA", "henan", "Henan", "河南省", "Henan", 3],
      ["CN-HB", "hubei", "Hubei", "湖北省", "Hubei", 3],
      ["CN-HN", "hunan", "Hunan", "湖南省", "Hunan", 3],
      ["CN-GD", "guangdong", "Guangdong", "広東省", "Cantón", 3],
      ["CN-GX", "guangxi", "Guangxi", "広西チワン族自治区", "Guangxi", 3],
      ["CN-HI", "hainan", "Hainan", "海南省", "Hainan", 3],
      ["CN-CQ", "chongqing", "Chongqing", "重慶市", "Chongqing", 4],
      ["CN-SC", "sichuan", "Sichuan", "四川省", "Sichuan", 4],
      ["CN-GZ", "guizhou", "Guizhou", "貴州省", "Guizhou", 4],
      ["CN-YN", "yunnan", "Yunnan", "雲南省", "Yunnan", 4],
      ["CN-XZ", "tibet", "Tibet", "チベット自治区", "Tíbet", 4],
      ["CN-SN", "shaanxi", "Shaanxi", "陝西省", "Shaanxi", 5],
      ["CN-GS", "gansu", "Gansu", "甘粛省", "Gansu", 5],
      ["CN-QH", "qinghai", "Qinghai", "青海省", "Qinghai", 5],
      ["CN-NX", "ningxia", "Ningxia", "寧夏回族自治区", "Ningxia", 5],
      ["CN-XJ", "xinjiang", "Xinjiang", "新疆ウイグル自治区", "Xinjiang", 5],
      ["CN-HK", "hong-kong", "Hong Kong", "香港", "Hong Kong", 6],
      ["CN-MO", "macau", "Macau", "マカオ", "Macao", 6]
    ]
  },
  {
    slug: "peru",
    names: { en: "Peru", ja: "ペルー", es: "Perú" },
    data: "data/peru.json",
    map: { file: "data/peru.geo.json" },
    size: [640, 800],
    unit: { en: ["region", "regions"], ja: ["県", "県"], es: ["región", "regiones"] },
    groups: {
      en: ["North", "Centre", "South", "Amazon"],
      ja: ["北部", "中部", "南部", "アマゾン"],
      es: ["Norte", "Centro", "Sur", "Amazonía"]
    },
    regions: [
      ["PE-TUM", "tumbes", "Tumbes", "トゥンベス", "Tumbes", 0],
      ["PE-PIU", "piura", "Piura", "ピウラ", "Piura", 0],
      ["PE-LAM", "lambayeque", "Lambayeque", "ランバイェケ", "Lambayeque", 0],
      ["PE-CAJ", "cajamarca", "Cajamarca", "カハマルカ", "Cajamarca", 0],
      ["PE-AMA", "amazonas", "Amazonas", "アマソナス", "Amazonas", 0],
      ["PE-LAL", "la-libertad", "La Libertad", "ラ・リベルタ", "La Libertad", 0],
      ["PE-SAM", "san-martin", "San Martín", "サン・マルティン", "San Martín", 3],
      ["PE-LOR", "loreto", "Loreto", "ロレト", "Loreto", 3],
      ["PE-ANC", "ancash", "Áncash", "アンカシュ", "Áncash", 1],
      ["PE-HUC", "huanuco", "Huánuco", "ワヌコ", "Huánuco", 1],
      ["PE-PAS", "pasco", "Pasco", "パスコ", "Pasco", 1],
      ["PE-UCA", "ucayali", "Ucayali", "ウカヤリ", "Ucayali", 3],
      ["PE-JUN", "junin", "Junín", "フニン", "Junín", 1],
      ["PE-LMA", "lima-city", "Metropolitan Lima", "リマ首都圏", "Lima Metropolitana", 1],
      ["PE-LIM", "lima", "Lima Region", "リマ県", "Región Lima", 1],
      ["PE-CAL", "callao", "Callao", "カヤオ", "Callao", 1],
      ["PE-HUV", "huancavelica", "Huancavelica", "ワンカベリカ", "Huancavelica", 1],
      ["PE-ICA", "ica", "Ica", "イカ", "Ica", 2],
      ["PE-AYA", "ayacucho", "Ayacucho", "アヤクーチョ", "Ayacucho", 2],
      ["PE-APU", "apurimac", "Apurímac", "アプリマック", "Apurímac", 2],
      ["PE-CUS", "cusco", "Cusco", "クスコ", "Cusco", 2],
      ["PE-MDD", "madre-de-dios", "Madre de Dios", "マドレ・デ・ディオス", "Madre de Dios", 3],
      ["PE-ARE", "arequipa", "Arequipa", "アレキパ", "Arequipa", 2],
      ["PE-MOQ", "moquegua", "Moquegua", "モケグア", "Moquegua", 2],
      ["PE-TAC", "tacna", "Tacna", "タクナ", "Tacna", 2],
      ["PE-PUN", "puno", "Puno", "プーノ", "Puno", 2]
    ]
  }
];

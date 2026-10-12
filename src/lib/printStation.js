// Impression silencieuse des tickets via QZ Tray (application installée sur le
// PC relié à l'imprimante). Les tickets sont envoyés en ESC/POS brut : texte +
// coupe, sans passer par le pilote Windows (donc sans dépendre de sa taille de
// papier ni de ses marges). Le réglage est propre à CHAQUE appareil
// (localStorage) : seul le poste relié à l'imprimante doit être en mode « qz ».

const MODE_KEY = "wegemo_print_mode"; // "browser" (défaut) | "qz" | "off"
const PRINTER_KEY = "wegemo_qz_printer";
const PAPER_KEY = "wegemo_qz_paper"; // "80" (défaut) | "58"

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const CERT_KEY = "wegemo_qz_cert";
const PRIVATE_KEY = "wegemo_qz_key";

export const getPrintMode = () => read(MODE_KEY, "browser");
export const setPrintMode = (m) => write(MODE_KEY, m);
export const getQzPrinter = () => read(PRINTER_KEY, "");
export const setQzPrinter = (p) => write(PRINTER_KEY, p);
export const getPaperWidth = () => read(PAPER_KEY, "80");
export const setPaperWidth = (w) => write(PAPER_KEY, w);

// Colonnes d'une ligne en police A : 48 sur du 80 mm, 32 sur du 58 mm.
export const paperColumns = () => (getPaperWidth() === "58" ? 32 : 48);

// Certificat + clé privée de CE poste, générés dans son navigateur (jamais
// envoyés ailleurs). Sans eux les demandes ne sont pas signées et QZ Tray
// affiche « Untrusted website » à chaque action, sans pouvoir la mémoriser.
export const hasQzCredentials = () => Boolean(read(CERT_KEY, "") && read(PRIVATE_KEY, ""));
export const getQzCertificate = () => read(CERT_KEY, "");

export async function signMessage(message) {
  const forge = (await import("node-forge")).default;
  const key = forge.pki.privateKeyFromPem(read(PRIVATE_KEY, ""));
  const md = forge.md.sha512.create();
  md.update(message, "utf8");
  return forge.util.encode64(key.sign(md));
}

function applySecurity(qz) {
  const signed = hasQzCredentials();
  const cert = getQzCertificate();
  qz.security.setCertificatePromise((resolve) => resolve(signed ? cert : undefined));
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    if (!signed) return resolve();
    signMessage(toSign).then(resolve, reject);
  });
}

export async function generateQzCredentials() {
  const forge = (await import("node-forge")).default;
  await new Promise((r) => setTimeout(r, 30)); // laisse l'écran afficher « génération… »
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000);
  const attrs = [
    { name: "commonName", value: "Wegemo Caisse" },
    { name: "organizationName", value: "Baoma" },
    { name: "countryName", value: "FR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  write(CERT_KEY, forge.pki.certificateToPem(cert));
  write(PRIVATE_KEY, forge.pki.privateKeyToPem(keys.privateKey));
  // La connexion ouverte garde l'ancienne identité : on la referme.
  try {
    const qz = await getQz();
    if (qz.websocket.isActive()) await qz.websocket.disconnect();
  } catch { /* QZ absent : rien à fermer */ }
  return getQzCertificate();
}

export function clearQzCredentials() {
  write(CERT_KEY, "");
  write(PRIVATE_KEY, "");
}

let qzPromise = null;
function getQz() {
  if (!qzPromise) qzPromise = import("qz-tray").then((m) => m.default || m);
  return qzPromise;
}

export async function connectQz() {
  const qz = await getQz();
  applySecurity(qz);
  if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 2, delay: 1 });
  return qz;
}

export async function listQzPrinters() {
  const qz = await connectQz();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found];
}

export async function qzDefaultPrinter() {
  const qz = await connectQz();
  return qz.printers.getDefault();
}

export async function printEscPos(data) {
  const printer = getQzPrinter();
  if (!printer) throw new Error("Aucune imprimante choisie pour ce poste (Paramètres > Ticket de caisse).");
  const qz = await connectQz();
  const config = qz.configs.create(printer, { encoding: "Cp1252" });
  await qz.print(config, [{ type: "raw", format: "command", flavor: "plain", data }]);
}

/* ---------------- Conversion du ticket affiché (DOM) en ESC/POS ------------- */

const ESC = "\x1B";
const GS = "\x1D";

// Caractères hors page de code Windows-1252 : remplacés ou retirés (émojis,
// flèches...), sinon l'imprimante afficherait des symboles parasites.
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function clean(raw) {
  return String(raw ?? "")
    .replace(/[  ]/g, " ")
    .replace(/↳/g, ">")
    .replace(/[×✕]/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .split("")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && (c < 0x7f || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch));
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text, width) {
  if (!text) return [""];
  const out = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (word.length > width) {
      if (line) { out.push(line); line = ""; }
      for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
      continue;
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += " " + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

// 0 = normal, 1 = double hauteur, 2 = double hauteur et largeur.
function sizeOf(fontSizePx) {
  if (fontSizePx >= 24) return 2;
  if (fontSizePx >= 19) return 1;
  return 0;
}

function rowLines(left, right, cols) {
  if (left.length + 1 + right.length <= cols) {
    return [left + " ".repeat(cols - left.length - right.length) + right];
  }
  const parts = wrap(left, Math.max(8, cols - right.length - 1));
  const lines = parts.map((p, i) => (i === 0 ? p + " ".repeat(Math.max(1, cols - p.length - right.length)) + right : "  " + p));
  return lines;
}

function collect(el, lines, cols) {
  for (const child of el.children) {
    if (/^(STYLE|SCRIPT)$/.test(child.tagName)) continue;
    const st = child.style;
    // Styles calculés quand l'élément est dans la page (héritage du centrage et
    // de la taille de police), styles en ligne sinon.
    const cs = child.isConnected ? getComputedStyle(child) : st;
    const text = clean(child.textContent);
    const fontSize = parseFloat(cs.fontSize) || 0;
    const size = sizeOf(fontSize);

    if (st.display === "flex" && st.justifyContent === "space-between" && child.children.length >= 2) {
      const kids = [...child.children];
      const left = clean(kids[0].textContent);
      const right = clean(kids.slice(1).map((k) => k.textContent).join(" "));
      for (const l of rowLines(left, right, cols)) lines.push({ text: l, size });
      continue;
    }
    if (child.tagName === "DIV" && !text && st.borderTop) {
      lines.push({ text: (st.borderTop.includes("2px") ? "=" : "-").repeat(cols), size: 0 });
      continue;
    }
    if ([...child.children].some((c) => c.tagName === "DIV")) {
      collect(child, lines, cols);
      continue;
    }
    if (/^([-=_*])\1{5,}$/.test(text)) {
      lines.push({ text: text[0].repeat(cols), size: 0 });
      continue;
    }
    const width = size === 2 ? Math.floor(cols / 2) : cols;
    const indent = parseFloat(cs.marginLeft) > 0 ? "  " : "";
    for (const part of wrap(text, width - indent.length)) {
      const body = indent + part;
      const pad = cs.textAlign === "center" ? Math.max(0, Math.floor((width - body.length) / 2)) : 0;
      lines.push({ text: " ".repeat(pad) + body, size });
    }
  }
}

// `root` : l'élément #wegemo-ticket-print affiché hors écran pendant l'impression.
export function ticketToEscPos(root, cols = paperColumns()) {
  const lines = [];
  collect(root, lines, cols);
  while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop();

  let data = ESC + "@" + ESC + "t" + "\x10" + ESC + "E" + "\x01"; // init, WPC1252, gras
  for (const { text, size } of lines) {
    data += GS + "!" + String.fromCharCode(size === 2 ? 0x11 : size === 1 ? 0x01 : 0x00) + text + "\n";
  }
  data += GS + "!" + "\x00" + ESC + "d" + "\x05" + GS + "V" + "\x00"; // avance, coupe
  return data;
}

export async function printTicketElement(root) {
  await printEscPos(ticketToEscPos(root));
}

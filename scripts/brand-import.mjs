#!/usr/bin/env node
/**
 * CLI de déploiement : transforme une charte client en template livrable.
 *
 * Deux usages, tous deux hors navigateur :
 *
 *   1. Préparer un `.mbpt.json` à livrer avec le déploiement :
 *      npm run brand:import -- --css charte.css --pptx charte.pptx --name "Client"
 *
 *   2. Semer un template de marque en base pour l'activer au démarrage :
 *      npm run brand:import -- --css charte.css --name "Client" --seed-db
 *
 * Le CLI n'invente rien : il appelle exactement le même pipeline que l'API
 * (`analyzeBrand` → `brandToTemplate`), ce qui garantit qu'un template produit
 * ici est identique à celui du wizard.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, basename, extname, resolve } from "node:path";
import { parseArgs } from "node:util";

const HELP = `
Usage: npm run brand:import -- [options]

Entrées (au moins une) :
  --css <fichier>      Feuille de style de la charte (variables, @font-face)
  --pptx <fichier>     Modèle PowerPoint de la charte (thème Office)
  --pdf <fichier>      Guidelines PDF (couche texte requise)
  --svg <fichier...>   Logo / pictogrammes (répétable)
  --logo <fichier>     Image du logo (SVG, PNG, JPG)

Sortie :
  --name <nom>         Nom de la charte / du client (obligatoire)
  --out <fichier>      Chemin du .mbpt.json (défaut : ./<slug>.mbpt.json)
  --archetype <id>     corporate|tech|minimal|startup|academic|creative|
                       dark-luxury|editorial|dark-tech|bold
  --mode <light|dark>  Force le mode au lieu de le déduire
  --seed-db            Écrit le template en base (Prisma) en plus du fichier
  --dry-run            Analyse et affiche les tokens sans rien écrire
  --json               Sortie machine (pour CI)
  --help               Cette aide

Exemples :
  npm run brand:import -- --css charte.css --pptx client.pptx --name "Acme" --out acme.mbpt.json
  npm run brand:import -- --css charte.css --name "Acme" --seed-db
  npm run brand:import -- --pptx client.pptx --name "Acme" --dry-run --json
`.trim();

/** Lit un fichier et devine son type pour `analyzeBrand`. */
async function readInputFile(path) {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isFile()) {
    throw new Error(`${path} n'est pas un fichier.`);
  }
  const ext = extname(absolute).toLowerCase();
  const buffer = await readFile(absolute);
  const name = basename(absolute);

  const mimeByExt = {
    ".css": "text/css",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
    ".pdf": "application/pdf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };

  const mimeType = mimeByExt[ext];
  if (!mimeType) {
    throw new Error(
      `Extension non reconnue : ${name}. Attendu : .css, .pptx, .pdf, .svg, .png, .jpg.`
    );
  }

  // Le CSS et le SVG sont lus en texte : plus direct pour les parseurs.
  const isText = ext === ".css" || ext === ".svg";
  return {
    name,
    mimeType,
    data: isText ? buffer.toString("utf8") : buffer,
  };
}

/** Charge `lib/brand/*` via le transpileur du projet (TS exécuté par tsx). */
async function loadBrandModules() {
  // Import dynamique pour que `--help` fonctionne même sans dépendances.
  const [{ analyzeBrand }, { brandToTemplate }] = await Promise.all([
    import("../lib/brand/analyze.ts"),
    import("../lib/brand/toTemplate.ts"),
  ]);
  return { analyzeBrand, brandToTemplate };
}

function slugify(value) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "template"
  );
}

/** Rend les tokens lisibles dans le terminal (ou en JSON). */
function describeBrand(brand, perFile) {
  const lines = [];
  lines.push("");
  lines.push(`  Charte        : ${brand.name}`);
  lines.push(`  Sources lues  : ${perFile.filter((f) => f.ok).map((f) => f.name).join(", ") || "—"}`);
  lines.push("");
  lines.push("  Couleurs");
  for (const [role, token] of Object.entries(brand.colors)) {
    if (!token) continue;
    const pct = Math.round(token.confidence * 100);
    lines.push(
      `    ${role.padEnd(12)} ${token.value}  ${String(pct).padStart(3)}%  ${token.evidence ?? ""}`
    );
  }
  lines.push("");
  lines.push("  Polices");
  if (brand.fonts.heading) {
    lines.push(`    titres       ${brand.fonts.heading.value}`);
  }
  if (brand.fonts.body) {
    lines.push(`    corps        ${brand.fonts.body.value}`);
  }
  if (!brand.fonts.heading && !brand.fonts.body) {
    lines.push("    (aucune identifiée — police système)");
  }
  if (brand.fonts.faces.length > 0) {
    lines.push(`    fichiers     ${brand.fonts.faces.map((f) => f.family).join(", ")}`);
  }
  lines.push("");
  if (brand.logos.length > 0) {
    lines.push("  Logos candidats");
    for (const logo of brand.logos) {
      lines.push(`    ${logo.name} (${logo.format}, ${Math.round(logo.bytes / 1024)} Ko)`);
    }
    lines.push("");
  }
  if (brand.icons.length > 0) {
    lines.push(`  Pictogrammes  : ${brand.icons.length} SVG`);
    lines.push("");
  }
  if (brand.warnings.length > 0) {
    lines.push("  Avertissements");
    for (const warning of brand.warnings) {
      lines.push(`    ! ${warning}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      css: { type: "string" },
      pptx: { type: "string" },
      pdf: { type: "string" },
      svg: { type: "string", multiple: true },
      logo: { type: "string" },
      name: { type: "string" },
      out: { type: "string" },
      archetype: { type: "string" },
      mode: { type: "string" },
      "seed-db": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const inputs = [
    values.css && { path: values.css, role: "css" },
    values.pptx && { path: values.pptx, role: "pptx" },
    values.pdf && { path: values.pdf, role: "pdf" },
    values.logo && { path: values.logo, role: "logo" },
    ...(values.svg ?? []).map((path) => ({ path, role: "svg" })),
  ].filter(Boolean);

  if (inputs.length === 0) {
    console.error("Erreur : aucun fichier d'entrée. Utilisez --css, --pptx, --pdf ou --logo.\n");
    console.error(HELP);
    return 2;
  }

  if (!values.name) {
    console.error("Erreur : --name est obligatoire (nom du client ou de la charte).\n");
    return 2;
  }

  if (values.mode && !["light", "dark"].includes(values.mode)) {
    console.error("Erreur : --mode doit valoir light ou dark.\n");
    return 2;
  }

  const { analyzeBrand, brandToTemplate } = await loadBrandModules();

  const files = [];
  for (const input of inputs) {
    try {
      files.push(await readInputFile(input.path));
    } catch (error) {
      console.error(`Erreur de lecture (${input.role}) : ${error.message}`);
      return 1;
    }
  }

  let result;
  try {
    result = await analyzeBrand({
      files,
      name: values.name,
      mode: values.mode,
    });
  } catch (error) {
    console.error(`\nAnalyse impossible : ${error.message}\n`);
    return 1;
  }

  const { brand, perFile } = result;

  // Le logo explicite prime sur les candidats devinés.
  let logoOption;
  if (values.logo) {
    const explicit = brand.logos.find(
      (l) => l.name === basename(resolve(values.logo))
    );
    if (explicit) {
      logoOption = {
        url: explicit.dataUrl,
        alt: values.name,
        placement: "header-left",
        maxHeight: 8,
        opacity: 1,
      };
    }
  }

  const template = brandToTemplate(brand, {
    name: values.name,
    archetype: values.archetype,
    logo: logoOption,
    sourceName: files.map((f) => f.name).join(", "),
  });

  if (!values.json) {
    console.log(describeBrand(brand, perFile));
    console.log(`  Template      : ${template.id}`);
    console.log(`  Archétype     : ${template.slideTheme ? `${template.slideTheme} decor` : "classique"}`);
    console.log("");
  }

  if (values["dry-run"]) {
    if (values.json) {
      console.log(JSON.stringify({ brand, template, perFile }, null, 2));
    } else {
      console.log("  --dry-run : rien n'a été écrit.\n");
    }
    return 0;
  }

  // --- 1. Fichier .mbpt.json ---------------------------------------------
  const outPath = values.out ?? `./${slugify(values.name)}.mbpt.json`;
  const payload = { version: "2.0", template };
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), JSON.stringify(payload, null, 2), "utf8");

  // --- 2. Assets binaires (logo, pictos, polices) ------------------------
  const assetDir = resolve("public", "brand", template.id);
  let assetCount = 0;
  if (template.logo?.url?.startsWith("data:")) {
    await mkdir(assetDir, { recursive: true });
    const match = /^data:([^;]+);base64,(.*)$/.exec(template.logo.url);
    if (match) {
      const [, mime, base64] = match;
      const ext = mime.includes("svg") ? "svg" : mime.split("/")[1] ?? "png";
      const filename = `logo.${ext}`;
      await writeFile(resolve(assetDir, filename), Buffer.from(base64, "base64"));
      // Le template référence le fichier, pas la data URL : allège le JSON.
      template.logo.url = `/brand/${template.id}/${filename}`;
      payload.template = template;
      await writeFile(resolve(outPath), JSON.stringify(payload, null, 2), "utf8");
      assetCount++;
    }
  }
  for (const [index, icon] of (template.iconSet?.icons ?? []).entries()) {
    if (!icon.svg) continue;
    await mkdir(assetDir, { recursive: true });
    const filename = `icon-${index + 1}.svg`;
    await writeFile(resolve(assetDir, filename), icon.svg, "utf8");
    assetCount++;
  }

  if (!values.json) {
    console.log(`  Écrit         : ${resolve(outPath)}`);
    if (assetCount > 0) {
      console.log(`  Assets        : ${assetCount} fichier(s) dans public/brand/${template.id}/`);
    }
  }

  // --- 3. Seed en base (optionnel) ---------------------------------------
  if (values["seed-db"]) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const saved = await prisma.template.upsert({
        where: { id: template.id },
        update: {
          name: template.name,
          description: template.description,
          colors: template.colors,
          fonts: template.fonts,
          layouts: { defaultSlides: template.defaultSlides },
          payload: template,
          brand: template.brand ?? {},
        },
        create: {
          id: template.id,
          name: template.name,
          description: template.description,
          source: "brand",
          colors: template.colors,
          fonts: template.fonts,
          layouts: { defaultSlides: template.defaultSlides },
          payload: template,
          brand: template.brand ?? {},
          isBuiltIn: false,
        },
      });
      await prisma.$disconnect();
      if (!values.json) {
        console.log(`  Base de données : template ${saved.id} enregistré.`);
        console.log("");
      }
    } catch (error) {
      console.error(`\nÉchec du seed en base : ${error.message}`);
      console.error(
        "Le fichier .mbpt.json a bien été écrit ; vous pouvez l'importer via l'interface."
      );
      return 1;
    }
  }

  if (values.json) {
    console.log(JSON.stringify({ ok: true, out: resolve(outPath), template }, null, 2));
  } else {
    console.log("");
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\nErreur inattendue : ${error?.stack ?? error}\n`);
    process.exit(1);
  });

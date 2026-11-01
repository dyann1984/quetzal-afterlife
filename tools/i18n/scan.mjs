// Inventario de textos visibles en los componentes (JSX, atributos y literales). Uso: node tools/i18n/scan.mjs app/page.tsx ...
import ts from 'typescript';
import fs from 'node:fs';

const LETTERS = /[A-Za-zÀ-ÿ]{2,}/;
const out = [];
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = n => {
    if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, ' ').trim(); if (t && LETTERS.test(t.replace(/&\w+;/g, ''))) out.push(`${file}:${line(n)} JSX  ${t}`); }
    else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) { const t = n.initializer.text; if (LETTERS.test(t) && /^(placeholder|title|aria-label|alt|label|aria-description)$/.test(n.name.getText())) out.push(`${file}:${line(n)} ATTR ${n.name.getText()}=${t}`); }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent; if (ts.isJsxAttribute(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) { /* ya tratado */ }
      else if (LETTERS.test(n.text) && /\s|[áéíóúñ¿¡]/i.test(n.text) && n.text.length > 3) out.push(`${file}:${line(n)} STR  ${n.text}`);
    } else if (ts.isTemplateExpression(n)) {
      const t = n.getText().slice(1, -1); if (LETTERS.test(t.replace(/\$\{[^}]*\}/g, ''))) out.push(`${file}:${line(n)} TPL  ${t}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log(out.join('\n'));
console.error(`${out.length} textos`);

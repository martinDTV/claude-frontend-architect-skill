// Structural analysis of a TypeScript / JavaScript / TSX module through the compiler's own parser
// (`ts.createSourceFile`: syntax only, no type checker, nothing executed). Produces imports with
// type-only information, exports, re-exports, dynamic imports, top-of-file directives, identifiers
// used in value position (not property names, not type positions), calls, member calls and JSX tags.
// Line numbers are 1-based and absolute within the given text; callers add block offsets for SFCs.

function scriptKindFor(ts, fileName, lang) {
  const l = (lang ?? '').toLowerCase()
  if (l === 'tsx' || /\.tsx$/.test(fileName)) return ts.ScriptKind.TSX
  if (l === 'jsx' || /\.jsx$/.test(fileName)) return ts.ScriptKind.JSX
  if (l === 'js' || /\.(js|mjs|cjs)$/.test(fileName)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1
}
function colOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).character + 1
}

function literalText(ts, node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

/** Names declared by a binding pattern (destructuring) or identifier. */
function bindingNames(ts, name, out) {
  if (!name) return out
  if (ts.isIdentifier(name)) out.add(name.text)
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(ts, el.name, out)
  }
  return out
}

/** True when `node` sits inside a type annotation / type declaration (compile-time only). */
function inTypePosition(ts, node) {
  let n = node.parent
  while (n && !ts.isSourceFile(n)) {
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeParameterDeclaration(n) || (ts.isHeritageClause(n) && n.token === ts.SyntaxKind.ImplementsKeyword)) return true
    if (ts.isExpressionWithTypeArguments(n) && n.parent && ts.isHeritageClause(n.parent) && n.parent.token === ts.SyntaxKind.ExtendsKeyword && n.parent.parent && ts.isInterfaceDeclaration(n.parent.parent)) return true
    if (ts.isStatement(n) || ts.isExpression(n)) break
    n = n.parent
  }
  return false
}

export function parseModule(ts, text, fileName, { lang } = {}) {
  const kind = scriptKindFor(ts, fileName, lang)
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const out = {
    fileName,
    kind: ts.ScriptKind[kind],
    imports: [],
    exports: [],
    directives: [],
    declared: new Set(),
    valueIdentifiers: new Map(),
    typeIdentifiers: new Map(),
    calls: new Map(),
    memberCalls: [],
    jsxTags: new Map(),
    parseDiagnostics: sf.parseDiagnostics?.length ?? 0,
  }

  // directives: leading expression statements that are string literals
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) out.directives.push(st.expression.text)
    else break
  }

  const addImport = (entry) => out.imports.push(entry)
  const hasExportModifier = (node) => Boolean(ts.canHaveModifiers?.(node) ? ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) : node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
  const hasDefaultModifier = (node) => Boolean(ts.canHaveModifiers?.(node) ? ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) : node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))

  for (const st of sf.statements) {
    const line = lineOf(sf, st.getStart(sf))
    if (ts.isImportDeclaration(st)) {
      const source = literalText(ts, st.moduleSpecifier)
      const clause = st.importClause
      const names = []
      let allType = Boolean(clause?.isTypeOnly)
      if (clause) {
        if (clause.name) {
          names.push({ local: clause.name.text, imported: 'default', typeOnly: Boolean(clause.isTypeOnly) })
          out.declared.add(clause.name.text)
        }
        const nb = clause.namedBindings
        if (nb && ts.isNamespaceImport(nb)) {
          names.push({ local: nb.name.text, imported: '*', typeOnly: Boolean(clause.isTypeOnly) })
          out.declared.add(nb.name.text)
        } else if (nb && ts.isNamedImports(nb)) {
          const specs = nb.elements.map((el) => ({ local: el.name.text, imported: (el.propertyName ?? el.name).text, typeOnly: Boolean(clause.isTypeOnly || el.isTypeOnly) }))
          names.push(...specs)
          for (const s of specs) out.declared.add(s.local)
          if (!clause.isTypeOnly && specs.length && specs.every((s) => s.typeOnly) && !clause.name) allType = true
        }
      }
      addImport({ kind: clause ? 'static' : 'side-effect', source, typeOnly: allType, names, line, col: colOf(sf, st.getStart(sf)) })
    } else if (ts.isExportDeclaration(st)) {
      const source = literalText(ts, st.moduleSpecifier)
      const names = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map((el) => ({ exported: el.name.text, local: (el.propertyName ?? el.name).text, typeOnly: Boolean(st.isTypeOnly || el.isTypeOnly) })) : null
      if (source) {
        addImport({ kind: 're-export', source, typeOnly: Boolean(st.isTypeOnly) || (names ? names.every((n) => n.typeOnly) : false), names: names ? names.map((n) => ({ local: n.exported, imported: n.local, typeOnly: n.typeOnly })) : [{ local: '*', imported: '*', typeOnly: Boolean(st.isTypeOnly) }], line, col: colOf(sf, st.getStart(sf)), namespaceExport: st.exportClause && ts.isNamespaceExport(st.exportClause) ? st.exportClause.name.text : null })
        if (names) for (const n of names) out.exports.push({ name: n.exported, kind: n.typeOnly ? 'type' : 'value', line, reexport: source })
        else out.exports.push({ name: st.exportClause && ts.isNamespaceExport(st.exportClause) ? st.exportClause.name.text : '*', kind: st.isTypeOnly ? 'type' : 'value', line, reexport: source })
      } else if (names) {
        for (const n of names) out.exports.push({ name: n.exported, kind: n.typeOnly ? 'type' : 'value', line, local: n.local })
      }
    } else if (ts.isExportAssignment(st)) {
      out.exports.push({ name: 'default', kind: 'value', line })
    } else if (hasExportModifier(st)) {
      const isDefault = hasDefaultModifier(st)
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) for (const n of bindingNames(ts, d.name, new Set())) out.exports.push({ name: n, kind: 'value', line })
      } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
        out.exports.push({ name: isDefault ? 'default' : st.name?.text ?? 'default', kind: 'value', line })
      } else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) {
        out.exports.push({ name: st.name.text, kind: 'type', line })
      } else if (ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st)) {
        out.exports.push({ name: st.name.text, kind: 'value', line })
      }
    }
  }

  const visit = (node) => {
    // declarations
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) bindingNames(ts, node.name, out.declared)
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isModuleDeclaration(node)) && node.name && ts.isIdentifier(node.name)) out.declared.add(node.name.text)
    // dynamic import / require
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const line = lineOf(sf, node.getStart(sf))
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const source = literalText(ts, node.arguments[0])
        addImport({ kind: 'dynamic', source, typeOnly: false, names: [], line, col: colOf(sf, node.getStart(sf)), unresolvedReason: source ? null : 'non-literal specifier' })
      } else if (ts.isIdentifier(callee) && callee.text === 'require' && node.arguments.length) {
        const source = literalText(ts, node.arguments[0])
        addImport({ kind: 'require', source, typeOnly: false, names: [], line, col: colOf(sf, node.getStart(sf)), unresolvedReason: source ? null : 'non-literal specifier' })
      } else if (ts.isIdentifier(callee)) {
        if (!out.calls.has(callee.text)) out.calls.set(callee.text, [])
        out.calls.get(callee.text).push(line)
      } else if (ts.isPropertyAccessExpression(callee)) {
        const object = ts.isIdentifier(callee.expression) ? callee.expression.text : ts.isPropertyAccessExpression(callee.expression) ? callee.expression.getText(sf).slice(0, 60) : callee.expression.kind === ts.SyntaxKind.ThisKeyword ? 'this' : null
        out.memberCalls.push({ object, name: callee.name.text, line })
      }
    }
    // JSX tags
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      if (!out.jsxTags.has(tag)) out.jsxTags.set(tag, [])
      out.jsxTags.get(tag).push(lineOf(sf, node.getStart(sf)))
    }
    // identifiers in value position
    if (ts.isIdentifier(node)) {
      const p = node.parent
      const isPropertyName = p && ((ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node) || (ts.isPropertySignature(p) && p.name === node) || (ts.isMethodDeclaration(p) && p.name === node) || (ts.isPropertyDeclaration(p) && p.name === node) || (ts.isEnumMember(p) && p.name === node) || (ts.isJsxAttribute(p) && p.name === node) || ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === node) || (ts.isBindingElement(p) && p.propertyName === node) || (ts.isLabeledStatement(p)) || (ts.isQualifiedName(p) && p.right === node))
      const isDeclarationName = p && ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isEnumDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isModuleDeclaration(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isTypeParameterDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassExpression(p) || ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === node)
      if (!isPropertyName && !isDeclarationName) {
        const target = inTypePosition(ts, node) ? out.typeIdentifiers : out.valueIdentifiers
        if (!target.has(node.text)) target.set(node.text, lineOf(sf, node.getStart(sf)))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** Identifiers of an expression text (template bindings): value identifiers only. */
export function expressionIdentifiers(ts, expression, fileName = 'expr.ts') {
  const res = new Map()
  try {
    const info = parseModule(ts, `(${expression});`, fileName)
    for (const [name, line] of info.valueIdentifiers) res.set(name, line)
    for (const [name, lines] of info.calls) if (!res.has(name)) res.set(name, lines[0])
  } catch {
    /* unparsable expression */
  }
  return res
}

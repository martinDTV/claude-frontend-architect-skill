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
    jsxElements: [], // { tag, line, attrs: { name: string|true|'{expr}' }, selfClosing, hasText, parents: [tags], depth }
    browserApiUses: [], // { name, line, topLevel, inFunction, calls: [enclosing callee names], guarded, guard }
    motionUses: [], // 1.5: GSAP calls with their context { kind, name, line, flags, target, effect, ...context }
    threeUses: [], // 1.5: Three.js resource creations and lifecycle calls { kind, cls, name, line, inFrameLoop, frameCallee, guardedBranch, effect, ...context }
    parseDiagnostics: sf.parseDiagnostics?.length ?? 0,
  }
  const BROWSER_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'screen', 'matchMedia', 'requestAnimationFrame', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'customElements', 'indexedDB', 'Notification'])
  const CLIENT_GUARD_RE = /import\.meta\.client|process\.client|typeof\s+window\s*(?:!==?|!=)\s*['"]undefined['"]|typeof\s+document\s*(?:!==?|!=)\s*['"]undefined['"]|\bisClient\b|\bonNuxtReady\b/
  const NONDETERMINISTIC_RE = /^(?:Date\.now|Math\.random|crypto\.randomUUID|performance\.now|new Date)$/

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

  /** Context of a node: enclosing callee names, function nesting, top-level position and client guards. */
  const contextOf = (node) => {
    const calls = []
    let inFunction = false
    let guarded = false
    let guard = null
    let enclosingFunction = null
    let n = node.parent
    while (n && !ts.isSourceFile(n)) {
      if (ts.isCallExpression(n)) {
        const callee = n.expression
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
        if (name) calls.push(name)
      }
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) {
        inFunction = true
        if (!enclosingFunction) enclosingFunction = n.name?.text ?? (n.parent && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : null) ?? '(anonymous)'
      }
      if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
        const cond = n.condition ?? n.expression
        const text = cond ? cond.getText(sf) : ''
        if (CLIENT_GUARD_RE.test(text)) {
          guarded = true
          guard = text.slice(0, 60)
        }
      }
      if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) && CLIENT_GUARD_RE.test(n.left.getText(sf))) {
        guarded = true
        guard = n.left.getText(sf).slice(0, 60)
      }
      n = n.parent
    }
    return { calls, inFunction, enclosingFunction, guarded, guard, topLevel: !inFunction }
  }

  // 1.5: GSAP call records (motion engineering rules). The kind says what the call creates or cleans; the flags
  // come from the configuration object literal (scrollTrigger, scrub, pin, infinite repeat); `effect` describes the
  // nearest enclosing effect or lifecycle call, including whether a React effect returns a cleanup function.
  const MOTION_CALLS = [
    ['tween', /^gsap\.(?:to|from|fromTo|set|quickTo|quickSetter)$/],
    ['timeline', /^gsap\.timeline$/],
    ['scrolltrigger', /^ScrollTrigger\.(?:create|batch)$/],
    ['context', /^gsap\.context$/],
    ['matchmedia', /^gsap\.matchMedia$/],
    ['matchmediarefresh', /^gsap\.matchMediaRefresh$/],
    ['usegsap', /^useGSAP$/],
    ['killall', /^ScrollTrigger\.killAll$/],
    ['getall', /^ScrollTrigger\.getAll$/],
    ['refresh', /^ScrollTrigger\.refresh$/],
  ]
  // lifecycle hooks only: gsap.context(), gsap.matchMedia() and mm.add() are trackers that run where they are called,
  // so the enclosing hook is what decides whether a cleanup exists
  const EFFECT_CALLS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useGSAP', 'onMounted', 'onBeforeMount', 'onUnmounted', 'onBeforeUnmount', 'onScopeDispose', 'onActivated', 'onDeactivated', 'watch', 'watchEffect', 'watchPostEffect', 'onNuxtReady', 'nextTick'])
  const returnsCleanup = (fn) => {
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null
    if (!ts.isBlock(fn.body)) return false
    return fn.body.statements.some((st) => ts.isReturnStatement(st) && st.expression && (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression) || ts.isIdentifier(st.expression) || ts.isPropertyAccessExpression(st.expression) || ts.isCallExpression(st.expression)))
  }
  const effectInfoOf = (node) => {
    let n = node.parent
    while (n && !ts.isSourceFile(n)) {
      if (ts.isCallExpression(n)) {
        const callee = n.expression
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
        if (name && EFFECT_CALLS.has(name)) {
          const info = { hook: name, hasCleanupReturn: null, deps: null }
          if (name === 'useEffect' || name === 'useLayoutEffect' || name === 'useInsertionEffect') {
            info.hasCleanupReturn = returnsCleanup(n.arguments[0])
            const deps = n.arguments[1]
            info.deps = !deps ? 'none' : ts.isArrayLiteralExpression(deps) ? (deps.elements.length ? 'list' : 'empty') : 'expr'
          }
          return info
        }
      }
      n = n.parent
    }
    return null
  }
  const motionFlags = (call) => {
    const flags = { scrollTrigger: false, scrub: false, pin: false, infinite: false }
    const scan = (obj, nested) => {
      if (!obj || !ts.isObjectLiteralExpression(obj)) return
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop) || !prop.name) continue
        const key = prop.name.getText(sf).replace(/^['"]|['"]$/g, '')
        if (key === 'scrollTrigger') {
          flags.scrollTrigger = true
          scan(prop.initializer, true)
        } else if (key === 'scrub') flags.scrub = true
        else if (key === 'pin') flags.pin = true
        else if (key === 'repeat' && ts.isPrefixUnaryExpression(prop.initializer) && prop.initializer.operator === ts.SyntaxKind.MinusToken) flags.infinite = true
        else if (nested && key === 'animation') scan(prop.initializer, false)
      }
    }
    for (const a of call.arguments) scan(a, false)
    return flags
  }

  // 1.5: Three.js records (3D rules). Classes are recognised through the file's own imports from three (namespace or
  // named), never by name alone; frame callbacks are functions passed to the known loop APIs or named in a
  // requestAnimationFrame / setAnimationLoop call anywhere in the file (the recursive rAF pattern).
  const THREE_SOURCE_RE = /^three(?:\/|$)/
  const threeNamespaces = new Set()
  const threeLocals = new Set()
  for (const imp of out.imports) {
    if (!THREE_SOURCE_RE.test(imp.source ?? '') || imp.typeOnly) continue
    for (const n of imp.names ?? []) {
      if (n.imported === '*') threeNamespaces.add(n.local)
      else if (!n.typeOnly) threeLocals.add(n.local)
    }
  }
  const THREE_KINDS = [
    ['renderer', /^(?:WebGLRenderer|WebGL1Renderer|WebGPURenderer|CSS2DRenderer|CSS3DRenderer|SVGRenderer)$/],
    ['renderTarget', /RenderTarget$/],
    ['geometry', /Geometry$/],
    ['material', /Material$/],
    ['texture', /Texture$/],
    ['loader', /Loader$/],
    ['composer', /^(?:EffectComposer|PMREMGenerator|GPUComputationRenderer)$/],
    ['pass', /Pass$/],
    ['object', /^(?:Mesh|InstancedMesh|SkinnedMesh|Points|Line|LineSegments|LineLoop|Sprite|Group|Object3D|Scene|BatchedMesh)$/],
  ]
  const threeClassOf = (expr) => {
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && threeNamespaces.has(expr.expression.text)) return expr.name.text
    if (ts.isIdentifier(expr) && threeLocals.has(expr.text)) return expr.text
    return null
  }
  const FRAME_CALLEES = new Set(['useFrame', 'onBeforeRender', 'onRender', 'onAfterRender', 'onLoop', 'setAnimationLoop', 'requestAnimationFrame', 'useRafFn'])
  const frameFunctions = new Set()
  const collectFrameFunctions = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
      const arg = node.arguments[0]
      if ((name === 'requestAnimationFrame' || name === 'setAnimationLoop') && arg && ts.isIdentifier(arg)) frameFunctions.add(arg.text)
    }
    ts.forEachChild(node, collectFrameFunctions)
  }
  collectFrameFunctions(sf)
  const functionName = (fn) => fn.name?.text ?? (fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : null)
  const frameContextOf = (node) => {
    let n = node.parent
    let guardedBranch = false
    while (n && !ts.isSourceFile(n)) {
      if (ts.isIfStatement(n) || ts.isConditionalExpression(n) || (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken))) guardedBranch = true
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) {
        const name = functionName(n)
        if (name && frameFunctions.has(name)) return { inFrameLoop: true, frameCallee: `${name}()`, guardedBranch }
        const parent = n.parent
        if (parent && ts.isCallExpression(parent) && parent.arguments.includes(n)) {
          const callee = parent.expression
          const calleeName = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
          const calleeText = callee.getText(sf)
          if ((calleeName && FRAME_CALLEES.has(calleeName)) || /(?:^|\.)(?:ticker|loop)\.add$/.test(calleeText)) return { inFrameLoop: true, frameCallee: calleeText.slice(0, 40), guardedBranch }
        }
      }
      n = n.parent
    }
    return { inFrameLoop: false, frameCallee: null, guardedBranch: false }
  }
  const pushThree = (kind, cls, name, node, extra = {}) => {
    out.threeUses.push({ kind, cls, name: name.slice(0, 80), line: lineOf(sf, node.getStart(sf)), ...frameContextOf(node), effect: effectInfoOf(node), ...contextOf(node), ...extra })
  }
  const argText = (node, i = 0) => (node.arguments[i] ? node.arguments[i].getText(sf).replace(/\s+/g, ' ').slice(0, 80) : null)

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
      // GSAP call records (motion engineering rules, 1.5)
      if (ts.isIdentifier(callee) || ts.isPropertyAccessExpression(callee)) {
        const calleeText = callee.getText(sf)
        const kind = MOTION_CALLS.find(([, re]) => re.test(calleeText))?.[0] ?? (ts.isPropertyAccessExpression(callee) && /^(?:revert|kill)$/.test(callee.name.text) ? callee.name.text : null)
        if (kind) out.motionUses.push({ kind, name: calleeText.slice(0, 80), line, flags: kind === 'tween' || kind === 'timeline' || kind === 'scrolltrigger' ? motionFlags(node) : null, target: kind === 'tween' ? argText(node) : null, effect: effectInfoOf(node), ...contextOf(node) })
      }
      // Three.js lifecycle calls (3D rules, 1.5)
      if (ts.isPropertyAccessExpression(callee)) {
        const object = callee.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 60)
        const member = callee.name.text
        if (member === 'dispose') pushThree('dispose', null, `${object}.dispose`, node, { object })
        else if (member === 'setAnimationLoop') pushThree(node.arguments[0] && node.arguments[0].kind === ts.SyntaxKind.NullKeyword ? 'loop-stop' : 'loop-start', null, `${object}.setAnimationLoop`, node, { object })
        else if (member === 'setPixelRatio') pushThree('pixel-ratio', null, `${object}.setPixelRatio`, node, { object, arg: argText(node) })
        else if ((member === 'load' || member === 'loadAsync') && /Loader|loader/.test(object)) pushThree('load', null, `${object}.${member}`, node, { object })
        else if (node.arguments.some((a) => ts.isStringLiteral(a) && a.text === 'webglcontextlost')) pushThree('context-lost-listener', null, `${object}.${member}`, node, { object })
        else if (member === 'traverse') pushThree('traverse', null, `${object}.traverse`, node, { object })
        else if (member === 'forceContextLoss') pushThree('force-context-loss', null, `${object}.forceContextLoss`, node, { object })
      } else if (ts.isIdentifier(callee)) {
        if (node.arguments.some((a) => ts.isStringLiteral(a) && a.text === 'webglcontextlost')) pushThree('context-lost-listener', null, callee.text, node, { object: null })
        else if (callee.text === 'requestAnimationFrame') pushThree('loop-start', null, 'requestAnimationFrame', node, { object: null })
        else if (callee.text === 'cancelAnimationFrame') pushThree('loop-stop', null, 'cancelAnimationFrame', node, { object: null })
        else if (/^(?:useLoader|useGLTF|useTexture|useFBX|useEnvironment)$/.test(callee.text)) pushThree('framework-load', null, callee.text, node, { object: null })
        else if (/^(?:disposeObject|disposeSceneGraph|disposeObject3D)$/.test(callee.text)) pushThree('dispose', null, callee.text, node, { object: argText(node) })
      }
    }
    // Three.js constructions (3D rules, 1.5): only classes imported from three
    if (ts.isNewExpression(node)) {
      const cls = threeClassOf(node.expression)
      if (cls) {
        const kind = THREE_KINDS.find(([, re]) => re.test(cls))?.[0] ?? null
        if (kind) pushThree(kind, cls, `new ${cls}`, node, {})
      }
    }
    // writes a frame loop or a tween may compete over (3D rules, 1.5)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
      const left = node.left
      const member = left.name.text
      const object = left.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 60)
      if (member === 'needsUpdate') pushThree('needs-update', null, `${object}.needsUpdate =`, node, { object })
      else if (/\.uniforms(?:\.|\[)|^uniforms(?:\.|\[)/.test(left.getText(sf)) && ts.isObjectLiteralExpression(node.right)) pushThree('uniform-object', null, `${left.getText(sf).slice(0, 60)} = {…}`, node, { object })
      else if (/^[xyzw]$/.test(member) && /(?:position|rotation|scale|quaternion)$/.test(object)) pushThree('transform-write', null, `${object}.${member} =`, node, { object })
    } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken].includes(node.operatorToken.kind) && ts.isPropertyAccessExpression(node.left)) {
      const object = node.left.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 60)
      if (/^[xyzw]$/.test(node.left.name.text) && /(?:position|rotation|scale|quaternion)$/.test(object)) pushThree('transform-write', null, `${object}.${node.left.name.text} +=`, node, { object })
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(?:set|copy|lerp|setScalar)$/.test(node.expression.name.text)) {
      const object = node.expression.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 60)
      if (/(?:position|rotation|scale|quaternion)$/.test(object)) pushThree('transform-write', null, `${object}.${node.expression.name.text}()`, node, { object })
    }
    // JSX tags and elements (attributes kept for the UI audit)
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      if (!out.jsxTags.has(tag)) out.jsxTags.set(tag, [])
      out.jsxTags.get(tag).push(lineOf(sf, node.getStart(sf)))
      const attrs = {}
      const handlers = {}
      for (const a of node.attributes?.properties ?? []) {
        if (ts.isJsxSpreadAttribute(a)) {
          attrs['...spread'] = '{expr}'
          continue
        }
        if (!ts.isJsxAttribute(a)) continue
        const name = a.name.getText(sf)
        if (!a.initializer) attrs[name] = true
        else if (ts.isStringLiteral(a.initializer)) attrs[name] = a.initializer.text
        else if (ts.isJsxExpression(a.initializer)) attrs[name] = a.initializer.expression && (ts.isStringLiteral(a.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(a.initializer.expression) || ts.isNumericLiteral(a.initializer.expression)) ? a.initializer.expression.text : '{expr}'
        else attrs[name] = '{expr}'
        if (/^on[A-Z]/.test(name) && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) handlers[name.slice(2).toLowerCase()] = a.initializer.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 160)
      }
      const parents = []
      let p = node.parent
      while (p && !ts.isSourceFile(p)) {
        if (ts.isJsxElement(p) && p.openingElement !== node) parents.push(p.openingElement.tagName.getText(sf))
        p = p.parent
      }
      const element = ts.isJsxSelfClosingElement(node) ? node : node.parent
      // text and child tags through the whole subtree (accessible names come from any descendant text)
      let hasText = false
      const childTags = []
      const visitDeep = (children) => {
        for (const c of children) {
          if ((ts.isJsxText(c) && c.text.trim()) || (ts.isJsxExpression(c) && c.expression)) hasText = true
          if (ts.isJsxElement(c)) {
            childTags.push(c.openingElement.tagName.getText(sf))
            visitDeep(c.children)
          } else if (ts.isJsxSelfClosingElement(c)) childTags.push(c.tagName.getText(sf))
          else if (ts.isJsxFragment(c)) visitDeep(c.children)
        }
      }
      if (ts.isJsxElement(element)) visitDeep(element.children)
      out.jsxElements.push({ tag, line: lineOf(sf, node.getStart(sf)), attrs, handlers, selfClosing: ts.isJsxSelfClosingElement(node), hasText, childTags, parents, depth: parents.length })
    }
    // browser globals and non-deterministic values, with the context that decides whether they run on the server
    if (ts.isIdentifier(node) && BROWSER_GLOBALS.has(node.text) && !(node.parent && ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node) || ts.isTypeReferenceNode(node.parent) || (ts.isVariableDeclaration(node.parent) && node.parent.name === node) || (ts.isParameter(node.parent) && node.parent.name === node) || (ts.isTypeOfExpression(node.parent))))) {
      out.browserApiUses.push({ name: node.text, line: lineOf(sf, node.getStart(sf)), ...contextOf(node) })
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const text = node.expression.getText(sf)
      if (NONDETERMINISTIC_RE.test(ts.isNewExpression(node) ? `new ${text}` : text)) out.browserApiUses.push({ name: ts.isNewExpression(node) ? `new ${text}` : text, line: lineOf(sf, node.getStart(sf)), nondeterministic: true, ...contextOf(node) })
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

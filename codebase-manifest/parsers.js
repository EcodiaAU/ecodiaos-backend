"use strict";

const babelParser = require("@babel/parser");

function parseJsTs(content, filePath) {
  const symbols = [];
  const imports = [];
  let ast;
  try {
    ast = babelParser.parse(content, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: [
        "jsx",
        "typescript",
        "decorators-legacy",
        "classProperties",
        "classPrivateProperties",
        "dynamicImport",
        "optionalChaining",
        "nullishCoalescingOperator",
        "topLevelAwait",
      ],
    });
  } catch (err) {
    return { symbols, imports, parseError: err.message };
  }

  const lineOf = (node) => (node && node.loc && node.loc.start ? node.loc.start.line : 1);
  const endLineOf = (node) => (node && node.loc && node.loc.end ? node.loc.end.line : lineOf(node));

  function pushFn(name, node, kind) {
    if (!name) return;
    const params = (node.params || []).map(formatParam).join(", ");
    symbols.push({
      name,
      kind: kind || "function",
      line_start: lineOf(node),
      line_end: endLineOf(node),
      signature: name + "(" + params + ")",
    });
  }

  function formatParam(p) {
    if (!p) return "";
    if (p.type === "Identifier") return p.name;
    if (p.type === "AssignmentPattern" && p.left && p.left.name) return p.left.name + "?";
    if (p.type === "RestElement" && p.argument && p.argument.name) return "..." + p.argument.name;
    if (p.type === "ObjectPattern") return "{}";
    if (p.type === "ArrayPattern") return "[]";
    return p.type;
  }

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node.type) return;

    switch (node.type) {
      case "ImportDeclaration":
        if (node.source && node.source.value) {
          imports.push({ module: node.source.value, line: lineOf(node) });
        }
        break;
      case "CallExpression":
        if (
          node.callee &&
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments &&
          node.arguments[0] &&
          node.arguments[0].type === "StringLiteral"
        ) {
          imports.push({ module: node.arguments[0].value, line: lineOf(node) });
        }
        break;
      case "FunctionDeclaration":
        pushFn(node.id ? node.id.name : null, node, "function");
        break;
      case "ClassDeclaration":
        if (node.id) {
          symbols.push({
            name: node.id.name,
            kind: "class",
            line_start: lineOf(node),
            line_end: endLineOf(node),
            signature: "class " + node.id.name,
          });
        }
        break;
      case "VariableDeclaration":
        for (const decl of node.declarations || []) {
          if (
            decl.id &&
            decl.id.name &&
            decl.init &&
            (decl.init.type === "ArrowFunctionExpression" || decl.init.type === "FunctionExpression")
          ) {
            pushFn(decl.id.name, decl.init, "function");
          }
        }
        break;
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
        if (node.declaration) visit(node.declaration);
        break;
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "range" || key === "leadingComments" || key === "trailingComments") continue;
      const val = node[key];
      if (val && typeof val === "object") visit(val);
    }
  }

  visit(ast);
  return { symbols, imports };
}

function parsePython(content) {
  const symbols = [];
  const imports = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    let m = /^\s*def\s+([a-zA-Z_][\w]*)\s*\(([^)]*)\)/.exec(line);
    if (m) {
      symbols.push({
        name: m[1],
        kind: "function",
        line_start: lineNo,
        line_end: lineNo,
        signature: m[1] + "(" + m[2].trim() + ")",
      });
      continue;
    }
    m = /^\s*async\s+def\s+([a-zA-Z_][\w]*)\s*\(([^)]*)\)/.exec(line);
    if (m) {
      symbols.push({
        name: m[1],
        kind: "function",
        line_start: lineNo,
        line_end: lineNo,
        signature: "async " + m[1] + "(" + m[2].trim() + ")",
      });
      continue;
    }
    m = /^\s*class\s+([a-zA-Z_][\w]*)/.exec(line);
    if (m) {
      symbols.push({
        name: m[1],
        kind: "class",
        line_start: lineNo,
        line_end: lineNo,
        signature: "class " + m[1],
      });
      continue;
    }
    m = /^\s*(?:from\s+([\w.]+)\s+import\s+([\w.,\s*]+)|import\s+([\w.,\s]+))/.exec(line);
    if (m) {
      const mod = m[1] || (m[3] || "").split(",")[0].trim();
      if (mod) imports.push({ module: mod, line: lineNo });
    }
  }
  return { symbols, imports };
}

function parseMarkdown(content) {
  const symbols = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(lines[i]);
    if (m) {
      symbols.push({
        name: m[2].slice(0, 200),
        kind: "heading-h" + m[1].length,
        line_start: i + 1,
        line_end: i + 1,
        signature: lines[i].trim().slice(0, 200),
      });
    }
  }
  return { symbols, imports: [] };
}

function parseFile(content, filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return parseJsTs(content, filePath);
  }
  if (lower.endsWith(".py")) return parsePython(content);
  if (lower.endsWith(".md")) return parseMarkdown(content);
  return { symbols: [], imports: [] };
}

module.exports = { parseFile, parseJsTs, parsePython, parseMarkdown };

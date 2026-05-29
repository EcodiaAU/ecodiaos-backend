// ide-bridge.js
//
// Hot-reloaded by extension.js for every /ide/* request. Edit freely - no
// reload-window needed. This is the focusless IDE-control surface, the
// Chrome-CDP equivalent for VS Code: every operation goes through the
// extension host (a Node process running inside the IDE), so the IDE window
// never needs to come to the foreground. Parallel calls into multiple IDE
// instances are safe because each instance has its own extension host + port.
//
// Tool layering: laptop-agent tools/ide.js routes by reading the registry at
// ~/.ecodia-preview/instances.json (written by extension.js on activate),
// picks an instance, and POSTs here. The keyboard-driven vscode.js/cursor.js
// tools stay as a fallback when this bridge is not reachable.

const path = require('path');

// ----- helpers -----------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('invalid json body: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function ok(res, data) { json(res, 200, { ok: true, ...data }); }
function fail(res, err, status) {
  json(res, status || 500, { ok: false, error: String(err && err.message || err) });
}

function uriFromPath(vscode, p) {
  if (!p) return null;
  return vscode.Uri.file(p);
}

function rangeFromShape(vscode, shape) {
  if (!shape) return null;
  if (Array.isArray(shape) && shape.length === 4) {
    return new vscode.Range(shape[0], shape[1], shape[2], shape[3]);
  }
  if (shape.start && shape.end) {
    return new vscode.Range(
      shape.start.line, shape.start.character,
      shape.end.line, shape.end.character,
    );
  }
  return null;
}

function positionFromShape(vscode, shape) {
  if (!shape) return null;
  if (Array.isArray(shape) && shape.length === 2) {
    return new vscode.Position(shape[0], shape[1]);
  }
  return new vscode.Position(shape.line, shape.character);
}

function serializeRange(r) {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}

function serializeUri(u) {
  return { fsPath: u.fsPath, scheme: u.scheme, path: u.path };
}

function serializeTab(tab, index) {
  const input = tab.input || {};
  const uri = input.uri || input.resource;
  return {
    label: tab.label,
    active: tab.isActive,
    pinned: tab.isPinned,
    dirty: tab.isDirty,
    viewColumn: tab.group && tab.group.viewColumn,
    viewType: input.viewType || null,
    uri: uri ? serializeUri(uri) : null,
    // Position within its group. Stable for the lifetime of the tab unless
    // the user manually drag-reorders or other tabs are inserted/closed
    // around it. Reliable spawn-and-close handle for webview tabs whose
    // labels auto-summarise.
    index: typeof index === 'number' ? index : null,
  };
}

function serializeEditor(vscode, editor, opts) {
  if (!editor) return null;
  opts = opts || {};
  const doc = editor.document;
  const out = {
    uri: serializeUri(doc.uri),
    languageId: doc.languageId,
    lineCount: doc.lineCount,
    isDirty: doc.isDirty,
    isUntitled: doc.isUntitled,
    eol: doc.eol === vscode.EndOfLine.LF ? 'LF' : 'CRLF',
    viewColumn: editor.viewColumn || null,
    selections: editor.selections.map(s => ({
      anchor: { line: s.anchor.line, character: s.anchor.character },
      active: { line: s.active.line, character: s.active.character },
      isReversed: s.isReversed,
      isEmpty: s.isEmpty,
    })),
    visibleRanges: editor.visibleRanges.map(serializeRange),
  };
  if (opts.includeText) {
    const max = opts.maxBytes || 256 * 1024;
    const text = doc.getText();
    if (text.length <= max) {
      out.text = text;
      out.truncated = false;
    } else {
      out.text = text.slice(0, max);
      out.truncated = true;
      out.fullBytes = text.length;
    }
  }
  return out;
}

function serializeDiagnostic(d) {
  return {
    message: d.message,
    severity: ['Error', 'Warning', 'Information', 'Hint'][d.severity] || String(d.severity),
    range: serializeRange(d.range),
    source: d.source || null,
    code: d.code || null,
  };
}

// ----- terminal registry (named lookup) ---------------------------------
// Terminals don't have a name-indexed lookup in the API; only an array. We
// keep a soft map so callers can pass {name} instead of an opaque handle.
// Terminals created outside this bridge are also discoverable by their name.
function findTerminal(vscode, name) {
  if (!name) return null;
  return vscode.window.terminals.find(t => t.name === name) || null;
}

// ----- route handlers ---------------------------------------------------

const routes = {

  // ----- commands -------------------------------------------------------

  // GET /ide/commands?filter=str&internal=true
  'GET /ide/commands': async (req, res, vscode, url) => {
    const filterInternal = !(url.searchParams.get('internal') === 'true');
    const filter = url.searchParams.get('filter');
    let cmds = await vscode.commands.getCommands(filterInternal);
    if (filter) {
      const f = filter.toLowerCase();
      cmds = cmds.filter(c => c.toLowerCase().includes(f));
    }
    return ok(res, { count: cmds.length, commands: cmds });
  },

  // POST /ide/command {cmd, args?, returnResult?}
  // The universal escape hatch - runs any VS Code command.
  'POST /ide/command': async (req, res, vscode) => {
    const body = await readBody(req);
    if (!body.cmd) throw new Error('cmd required');
    const args = Array.isArray(body.args) ? body.args : (body.args ? [body.args] : []);
    // Re-hydrate any {__uri: path} markers into Uri objects so callers can
    // pass file paths through the JSON boundary.
    const hydrated = args.map(a => {
      if (a && typeof a === 'object' && a.__uri) return vscode.Uri.file(a.__uri);
      return a;
    });
    const result = await vscode.commands.executeCommand(body.cmd, ...hydrated);
    if (body.returnResult === false) return ok(res, { cmd: body.cmd });
    let serialized = result;
    try { JSON.stringify(result); }
    catch { serialized = String(result); }
    return ok(res, { cmd: body.cmd, result: serialized === undefined ? null : serialized });
  },

  // ----- workspace ------------------------------------------------------

  'GET /ide/workspace/folders': async (req, res, vscode) => {
    const folders = (vscode.workspace.workspaceFolders || []).map(f => ({
      name: f.name,
      uri: serializeUri(f.uri),
      index: f.index,
    }));
    return ok(res, { folders });
  },

  'GET /ide/workspace/documents': async (req, res, vscode) => {
    const docs = vscode.workspace.textDocuments.map(d => ({
      uri: serializeUri(d.uri),
      languageId: d.languageId,
      isDirty: d.isDirty,
      isUntitled: d.isUntitled,
      lineCount: d.lineCount,
    }));
    return ok(res, { count: docs.length, documents: docs });
  },

  // POST /ide/workspace/find {pattern, exclude?, max?}
  'POST /ide/workspace/find': async (req, res, vscode) => {
    const { pattern, exclude, max } = await readBody(req);
    if (!pattern) throw new Error('pattern required');
    const uris = await vscode.workspace.findFiles(pattern, exclude || null, max || 200);
    return ok(res, { count: uris.length, files: uris.map(serializeUri) });
  },

  // POST /ide/workspace/fs/read {path, encoding?}
  'POST /ide/workspace/fs/read': async (req, res, vscode) => {
    const { path: p, encoding } = await readBody(req);
    if (!p) throw new Error('path required');
    const buf = await vscode.workspace.fs.readFile(uriFromPath(vscode, p));
    if (encoding === 'base64') return ok(res, { path: p, bytes: buf.length, base64: Buffer.from(buf).toString('base64') });
    return ok(res, { path: p, bytes: buf.length, text: Buffer.from(buf).toString('utf8') });
  },

  // POST /ide/workspace/fs/write {path, content, encoding?}
  'POST /ide/workspace/fs/write': async (req, res, vscode) => {
    const { path: p, content, encoding } = await readBody(req);
    if (!p) throw new Error('path required');
    if (typeof content !== 'string') throw new Error('content (string) required');
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uriFromPath(vscode, p), buf);
    return ok(res, { path: p, bytes: buf.length });
  },

  // POST /ide/workspace/fs/stat {path}
  'POST /ide/workspace/fs/stat': async (req, res, vscode) => {
    const { path: p } = await readBody(req);
    if (!p) throw new Error('path required');
    const stat = await vscode.workspace.fs.stat(uriFromPath(vscode, p));
    return ok(res, {
      path: p,
      type: ['Unknown', 'File', 'Directory', null, 'SymbolicLink'][stat.type] || stat.type,
      size: stat.size,
      ctime: stat.ctime,
      mtime: stat.mtime,
    });
  },

  // POST /ide/workspace/fs/list {path}
  'POST /ide/workspace/fs/list': async (req, res, vscode) => {
    const { path: p } = await readBody(req);
    if (!p) throw new Error('path required');
    const entries = await vscode.workspace.fs.readDirectory(uriFromPath(vscode, p));
    return ok(res, {
      path: p,
      entries: entries.map(([name, type]) => ({
        name,
        type: ['Unknown', 'File', 'Directory', null, 'SymbolicLink'][type] || type,
      })),
    });
  },

  // POST /ide/workspace/fs/mkdir {path}
  'POST /ide/workspace/fs/mkdir': async (req, res, vscode) => {
    const { path: p } = await readBody(req);
    if (!p) throw new Error('path required');
    await vscode.workspace.fs.createDirectory(uriFromPath(vscode, p));
    return ok(res, { path: p });
  },

  // POST /ide/workspace/fs/delete {path, recursive?, useTrash?}
  'POST /ide/workspace/fs/delete': async (req, res, vscode) => {
    const { path: p, recursive, useTrash } = await readBody(req);
    if (!p) throw new Error('path required');
    await vscode.workspace.fs.delete(uriFromPath(vscode, p), {
      recursive: !!recursive,
      useTrash: useTrash !== false,
    });
    return ok(res, { path: p });
  },

  // POST /ide/workspace/fs/rename {oldPath, newPath, overwrite?}
  'POST /ide/workspace/fs/rename': async (req, res, vscode) => {
    const { oldPath, newPath, overwrite } = await readBody(req);
    if (!oldPath || !newPath) throw new Error('oldPath and newPath required');
    await vscode.workspace.fs.rename(
      uriFromPath(vscode, oldPath),
      uriFromPath(vscode, newPath),
      { overwrite: !!overwrite },
    );
    return ok(res, { oldPath, newPath });
  },

  // POST /ide/workspace/edit {edits: [{path, range, newText, kind?}], save?}
  // kind: 'replace' (default) | 'insert' | 'delete'
  'POST /ide/workspace/edit': async (req, res, vscode) => {
    const { edits, save } = await readBody(req);
    if (!Array.isArray(edits) || edits.length === 0) throw new Error('edits[] required');
    const wsEdit = new vscode.WorkspaceEdit();
    for (const e of edits) {
      const uri = uriFromPath(vscode, e.path);
      const range = rangeFromShape(vscode, e.range);
      const kind = e.kind || 'replace';
      if (kind === 'insert') {
        wsEdit.insert(uri, positionFromShape(vscode, e.position || e.range.start), e.newText || '');
      } else if (kind === 'delete') {
        wsEdit.delete(uri, range);
      } else {
        wsEdit.replace(uri, range, e.newText || '');
      }
    }
    const applied = await vscode.workspace.applyEdit(wsEdit);
    if (save && applied) {
      const normalize = p => String(p).replace(/\\/g, '/').toLowerCase();
      const paths = [...new Set(edits.map(e => normalize(e.path)))];
      for (const p of paths) {
        const doc = vscode.workspace.textDocuments.find(d => normalize(d.uri.fsPath) === p);
        if (doc && doc.isDirty) await doc.save();
      }
    }
    return ok(res, { applied, count: edits.length });
  },

  // ----- window / editor -----------------------------------------------

  // GET /ide/window/active-editor?includeText=true&maxBytes=N
  'GET /ide/window/active-editor': async (req, res, vscode, url) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return ok(res, { editor: null });
    const includeText = url.searchParams.get('includeText') !== 'false';
    const maxBytes = Number(url.searchParams.get('maxBytes')) || 256 * 1024;
    return ok(res, { editor: serializeEditor(vscode, editor, { includeText, maxBytes }) });
  },

  'GET /ide/window/visible-editors': async (req, res, vscode) => {
    const editors = vscode.window.visibleTextEditors.map(e => serializeEditor(vscode, e, { includeText: false }));
    return ok(res, { count: editors.length, editors });
  },

  // POST /ide/window/show {path, viewColumn?, preview?, preserveFocus?, selection?}
  'POST /ide/window/show': async (req, res, vscode) => {
    const { path: p, viewColumn, preview, preserveFocus, selection } = await readBody(req);
    if (!p) throw new Error('path required');
    const doc = await vscode.workspace.openTextDocument(uriFromPath(vscode, p));
    const opts = {
      preview: preview !== false,
      preserveFocus: !!preserveFocus,
      viewColumn: viewColumn || undefined,
    };
    if (selection) opts.selection = rangeFromShape(vscode, selection);
    const editor = await vscode.window.showTextDocument(doc, opts);
    return ok(res, { editor: serializeEditor(vscode, editor, { includeText: false }) });
  },

  // POST /ide/window/edit-active {edits: [{range, newText, kind?}], save?}
  // Edits the ACTIVE editor with a TextEditor.edit batch (atomic).
  'POST /ide/window/edit-active': async (req, res, vscode) => {
    const { edits, save } = await readBody(req);
    if (!Array.isArray(edits) || edits.length === 0) throw new Error('edits[] required');
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('no active editor');
    const applied = await editor.edit(builder => {
      for (const e of edits) {
        const kind = e.kind || 'replace';
        if (kind === 'insert') {
          builder.insert(positionFromShape(vscode, e.position || e.range.start), e.newText || '');
        } else if (kind === 'delete') {
          builder.delete(rangeFromShape(vscode, e.range));
        } else {
          builder.replace(rangeFromShape(vscode, e.range), e.newText || '');
        }
      }
    });
    if (save && applied && editor.document.isDirty) await editor.document.save();
    return ok(res, { applied, count: edits.length });
  },

  // POST /ide/window/selection {selections: [{start, end}], reveal?}
  'POST /ide/window/selection': async (req, res, vscode) => {
    const { selections, reveal } = await readBody(req);
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('no active editor');
    if (!Array.isArray(selections) || selections.length === 0) throw new Error('selections[] required');
    editor.selections = selections.map(s => new vscode.Selection(
      positionFromShape(vscode, s.start),
      positionFromShape(vscode, s.end),
    ));
    if (reveal) {
      editor.revealRange(
        rangeFromShape(vscode, selections[0]),
        reveal === 'center' ? vscode.TextEditorRevealType.InCenter :
        reveal === 'centerIfOutsideViewport' ? vscode.TextEditorRevealType.InCenterIfOutsideViewport :
        vscode.TextEditorRevealType.Default,
      );
    }
    return ok(res, { count: selections.length });
  },

  // POST /ide/chat/send_message {prompt, session?, submit?, ide_target?}
  //
  // Focusless single-call replacement for dispatch_worker's
  //   newConversation -> clipboard.write -> input.shortcut[ctrl,v] -> input.key[enter]
  // chain. The whole chain has a ~2.5s focus-dependent window between the
  // newConversation tab opening and the Ctrl+V keystroke landing - any focus
  // change in that window pastes the brief into the wrong window (the
  // wrong-prompt-to-friend incident class).
  //
  // This route runs entirely inside the extension host on a single tick:
  //   (1) snapshot tab list (focusless)
  //   (2) commands.executeCommand('claude-vscode.editor.open', session, prompt)
  //       -> opens new CC chat panel + prefills the input box with `prompt`
  //   (3) commands.executeCommand('workbench.action.chat.submit')
  //       -> submits the just-opened chat (which is now the active chat)
  //   (4) re-snapshot tabs, diff for the new CC chat tab, return its identity
  //
  // Steps (2) and (3) execute back-to-back synchronously - the user cannot
  // click away in the microseconds between them. From the operator's POV the
  // new chat just appears with the prompt already running. Net: the 2.5s
  // focus-dependent paste window collapses to ~0ms.
  //
  // Returns {ok, opened_tab: {label, viewColumn, viewType, index, active},
  //          tabs_before, tabs_after, submit_command_ok}
  //
  // Caller is responsible for capturing tab_handle from opened_tab and storing
  // it via coord.setWorkerTabHandle for the close path.
  'POST /ide/chat/send_message': async (req, res, vscode) => {
    const body = await readBody(req);
    if (!body.prompt) throw new Error('prompt required');
    const CC_CHAT_VIEW_TYPE = 'mainThreadWebview-claudeVSCodePanel';
    const session = body.session != null ? body.session : null;
    const doSubmit = body.submit !== false;  // default true

    // Step 1: snapshot
    const tabsBefore = vscode.window.tabGroups.all.flatMap(g =>
      (g.tabs || []).filter(t => t.input && t.input.viewType === CC_CHAT_VIEW_TYPE)
        .map(t => ({ label: t.label, viewColumn: g.viewColumn }))
    );

    // Step 2: open + populate (CC's primaryEditor.open also accepts (session, prompt))
    let openOk = true;
    let openError = null;
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', session, body.prompt);
    } catch (e) {
      openOk = false;
      openError = String(e && e.message || e);
    }

    // Brief wait for the new chat panel to render (CC creates the webview async)
    await new Promise(r => setTimeout(r, 1200));

    // Step 3: submit.
    //
    // NOTE: workbench.action.chat.submit targets VS Code's built-in Copilot
    // chat surface, NOT Claude Code's webview. Extension host cannot dispatch
    // DOM events into another extension's webview iframe, so we have no
    // fully-bridge-side submit primitive for the CC chat panel. The caller
    // (cowork.dispatch_worker) is expected to issue a single input.key('enter')
    // immediately after this bridge call returns. The bridge has already run
    // editor.open synchronously so the new CC chat is now the active editor
    // and its input box is focused with the prompt prefilled - one Enter
    // keystroke submits it. The agent-side Enter keystroke runs on the next
    // Node tick (microseconds after bridge response), so the focus-dependent
    // window between populate and submit is ~25x smaller than the legacy
    // clipboard+Ctrl+V path.
    //
    // We keep the submit param + the workbench.action.chat.submit call as a
    // best-effort attempt in case future VS Code releases unify the chat
    // surfaces, but treat its result as advisory only.
    let submitOk = false;
    let submitError = null;
    if (doSubmit && openOk) {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.submit');
        submitOk = true;
      } catch (e) {
        submitError = String(e && e.message || e);
      }
    }

    // Step 4: diff to identify the new tab
    const beforeKeys = new Set(tabsBefore.map(t => t.viewColumn + '|' + t.label));
    const allAfter = vscode.window.tabGroups.all.flatMap(g =>
      (g.tabs || []).map((t, i) => ({ tab: t, viewColumn: g.viewColumn, index: i }))
    );
    let openedTab = null;
    for (const entry of allAfter) {
      const t = entry.tab;
      if (!t.input || t.input.viewType !== CC_CHAT_VIEW_TYPE) continue;
      const key = entry.viewColumn + '|' + t.label;
      if (beforeKeys.has(key)) continue;
      openedTab = {
        label: t.label,
        viewColumn: entry.viewColumn,
        viewType: CC_CHAT_VIEW_TYPE,
        index: entry.index,
        active: t.isActive,
      };
      break;
    }
    // Fallback: if no diff-detected new tab, pick the active CC chat in vc1
    if (!openedTab) {
      for (const entry of allAfter) {
        const t = entry.tab;
        if (!t.input || t.input.viewType !== CC_CHAT_VIEW_TYPE) continue;
        if (t.isActive) {
          openedTab = {
            label: t.label,
            viewColumn: entry.viewColumn,
            viewType: CC_CHAT_VIEW_TYPE,
            index: entry.index,
            active: true,
            via: 'active_fallback',
          };
          break;
        }
      }
    }

    return ok(res, {
      ok: openOk && (doSubmit ? submitOk : true) && !!openedTab,
      open_command_ok: openOk,
      open_error: openError,
      submit_command_ok: submitOk,
      submit_error: submitError,
      opened_tab: openedTab,
      tabs_before_count: tabsBefore.length,
      tabs_after_count: allAfter.filter(e => e.tab.input && e.tab.input.viewType === CC_CHAT_VIEW_TYPE).length,
    });
  },

  // GET /ide/window/tabs
  'GET /ide/window/tabs': async (req, res, vscode) => {
    const groups = vscode.window.tabGroups.all.map(g => ({
      viewColumn: g.viewColumn,
      isActive: g.isActive,
      tabs: g.tabs.map((t, i) => serializeTab(t, i)),
    }));
    return ok(res, { groups });
  },

  // POST /ide/window/tabs/close {label?, viewColumn?, viewType?, dirty?, tabIndex?, exactLabel?}
  // Closure precedence:
  //   (1) {viewColumn, tabIndex}      -> close exactly tabGroups[vc].tabs[index]
  //                                      stable spawn-and-close handle for
  //                                      webview tabs whose labels auto-retitle.
  //   (2) {label}                     -> case-insensitive substring (legacy).
  //   (2b){exactLabel}                -> case-sensitive exact match (safer).
  //   plus filters: viewColumn / viewType / dirty narrow the candidate set.
  'POST /ide/window/tabs/close': async (req, res, vscode) => {
    const filter = await readBody(req);
    const matched = [];

    // Precedence 1: tabIndex within a specific viewColumn -> single deterministic target.
    if (typeof filter.tabIndex === 'number' && typeof filter.viewColumn === 'number') {
      for (const group of vscode.window.tabGroups.all) {
        if (group.viewColumn !== filter.viewColumn) continue;
        const tab = group.tabs[filter.tabIndex];
        if (!tab) break;
        if (filter.viewType && (!tab.input || tab.input.viewType !== filter.viewType)) {
          return ok(res, { closed: 0, matched: 0, refused: 'viewType_mismatch', actual: (tab.input && tab.input.viewType) || null });
        }
        if (filter.exactLabel && tab.label !== filter.exactLabel) {
          return ok(res, { closed: 0, matched: 0, refused: 'exactLabel_mismatch', actual: tab.label });
        }
        matched.push(tab);
        break;
      }
    } else {
      for (const group of vscode.window.tabGroups.all) {
        if (typeof filter.viewColumn === 'number' && group.viewColumn !== filter.viewColumn) continue;
        for (const tab of group.tabs) {
          if (filter.exactLabel && tab.label !== filter.exactLabel) continue;
          if (filter.label && !filter.exactLabel && !String(tab.label).toLowerCase().includes(String(filter.label).toLowerCase())) continue;
          if (filter.viewType && (!tab.input || tab.input.viewType !== filter.viewType)) continue;
          if (typeof filter.dirty === 'boolean' && tab.isDirty !== filter.dirty) continue;
          matched.push(tab);
        }
      }
    }

    if (matched.length === 0) return ok(res, { closed: 0, matched: 0 });
    const closed = await vscode.window.tabGroups.close(matched, !!filter.force);
    return ok(res, { closed: closed ? matched.length : 0, matched: matched.length });
  },

  // ----- terminals ------------------------------------------------------

  'GET /ide/window/terminals': async (req, res, vscode) => {
    const terms = vscode.window.terminals.map(t => ({
      name: t.name,
      processId: t.processId || null,
    }));
    return ok(res, { count: terms.length, terminals: terms });
  },

  // POST /ide/window/terminals/create {name, cwd?, shellPath?, shellArgs?, env?, show?}
  'POST /ide/window/terminals/create': async (req, res, vscode) => {
    const body = await readBody(req);
    if (!body.name) throw new Error('name required');
    const opts = { name: body.name };
    if (body.cwd) opts.cwd = body.cwd;
    if (body.shellPath) opts.shellPath = body.shellPath;
    if (body.shellArgs) opts.shellArgs = body.shellArgs;
    if (body.env) opts.env = body.env;
    const term = vscode.window.createTerminal(opts);
    if (body.show) term.show(!!body.preserveFocus);
    return ok(res, { name: term.name, processId: (await term.processId) || null });
  },

  // POST /ide/window/terminals/send {name, text, addNewLine?}
  'POST /ide/window/terminals/send': async (req, res, vscode) => {
    const { name, text, addNewLine } = await readBody(req);
    const term = findTerminal(vscode, name);
    if (!term) throw new Error('terminal not found: ' + name);
    term.sendText(text || '', addNewLine !== false);
    return ok(res, { name, sent: (text || '').length });
  },

  // POST /ide/window/terminals/show {name, preserveFocus?}
  'POST /ide/window/terminals/show': async (req, res, vscode) => {
    const { name, preserveFocus } = await readBody(req);
    const term = findTerminal(vscode, name);
    if (!term) throw new Error('terminal not found: ' + name);
    term.show(!!preserveFocus);
    return ok(res, { name });
  },

  // POST /ide/window/terminals/dispose {name}
  'POST /ide/window/terminals/dispose': async (req, res, vscode) => {
    const { name } = await readBody(req);
    const term = findTerminal(vscode, name);
    if (!term) throw new Error('terminal not found: ' + name);
    term.dispose();
    return ok(res, { name });
  },

  // ----- diagnostics ---------------------------------------------------

  // GET /ide/diagnostics?uri=/path/to/file
  // (no uri = all)
  'GET /ide/diagnostics': async (req, res, vscode, url) => {
    const uriParam = url.searchParams.get('uri');
    if (uriParam) {
      const diags = vscode.languages.getDiagnostics(uriFromPath(vscode, uriParam));
      return ok(res, { uri: uriParam, count: diags.length, diagnostics: diags.map(serializeDiagnostic) });
    }
    const all = vscode.languages.getDiagnostics();
    const result = [];
    for (const [uri, diags] of all) {
      if (!diags.length) continue;
      result.push({ uri: serializeUri(uri), count: diags.length, diagnostics: diags.map(serializeDiagnostic) });
    }
    return ok(res, { fileCount: result.length, byFile: result });
  },

  // ----- env -----------------------------------------------------------

  'GET /ide/env/clipboard': async (req, res, vscode) => {
    const text = await vscode.env.clipboard.readText();
    return ok(res, { text, length: text.length });
  },

  'POST /ide/env/clipboard': async (req, res, vscode) => {
    const { text } = await readBody(req);
    await vscode.env.clipboard.writeText(text || '');
    return ok(res, { length: (text || '').length });
  },

  // POST /ide/env/open {uri | path}
  'POST /ide/env/open': async (req, res, vscode) => {
    const { uri, path: p } = await readBody(req);
    const target = uri ? vscode.Uri.parse(uri) : uriFromPath(vscode, p);
    await vscode.env.openExternal(target);
    return ok(res, { opened: uri || p });
  },

  // ----- window UI -----------------------------------------------------

  // POST /ide/window/message {message, level?, items?, wait?}
  // Fire-and-forget by default when no items - showInformationMessage's
  // promise only resolves on dismissal, which hangs the HTTP call. With
  // items[], we block to capture the user's choice (wait=true also forces).
  'POST /ide/window/message': async (req, res, vscode) => {
    const { message, level, items, wait } = await readBody(req);
    const fn = level === 'error' ? vscode.window.showErrorMessage
      : level === 'warning' ? vscode.window.showWarningMessage
      : vscode.window.showInformationMessage;
    const args = items && items.length ? [message, ...items] : [message];
    if (wait || (items && items.length)) {
      const choice = await fn(...args);
      return ok(res, { choice: choice || null, waited: true });
    }
    fn(...args);  // fire and forget
    return ok(res, { choice: null, waited: false });
  },

  // ----- info -----------------------------------------------------------

  'GET /ide/info': async (req, res, vscode) => {
    return ok(res, {
      appName: vscode.env.appName,
      appHost: vscode.env.appHost,
      uriScheme: vscode.env.uriScheme,
      machineId: vscode.env.machineId,
      sessionId: vscode.env.sessionId,
      language: vscode.env.language,
      remoteName: vscode.env.remoteName || null,
      shell: vscode.env.shell,
      version: vscode.version,
      pid: process.pid,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath),
    });
  },

  // GET /ide/routes - introspection: list everything this bridge supports.
  'GET /ide/routes': async (req, res) => {
    return ok(res, { routes: Object.keys(routes).sort() });
  },
};

// ----- dispatch ----------------------------------------------------------

async function handle(req, res, vscode) {
  const url = new URL(req.url, 'http://localhost');
  const key = req.method + ' ' + url.pathname;
  const handler = routes[key];
  if (!handler) {
    return json(res, 404, { ok: false, error: 'no route', route: key });
  }
  try {
    await handler(req, res, vscode, url);
  } catch (e) {
    fail(res, e);
  }
}

module.exports = { handle };

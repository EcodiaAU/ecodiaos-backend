// Hot-reloaded by extension.js on every /open-preview request.
// Edit this file freely - no window reload needed.
//
// Tab-set discipline (Tate verbatim 2026-05-17 Telegram 05:51Z):
// "open a new tab set ONCE, so the maximum is 2 tab sets, one with all the
// claude chats, and one with the previews, but then any subsequent previews
// still open in the previews tab set, so that each set takes up half the
// screen, just for QoL."
//
// Strategy:
// (1) If the file is already open in ANY group, focus that tab. No spawn.
// (2) Otherwise: find the "preview group" = the first editor group that is
//     not the active one (or the highest-numbered viewColumn if multiple).
//     If none exists yet, the FIRST preview spawns a side group via the
//     built-in ToSide commands.
// (3) For subsequent previews: focus the preview group first, then call the
//     non-ToSide variant so the new tab lands inside the preview group
//     instead of spawning a third column.

const path = require('path');

function norm(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

// SAFETY: webview tabs (Claude Code chats are webviews) do not survive
// moveEditorToPreviousGroup - the move triggers disposal of the chat session
// rather than relocating it. If any group contains a Claude Code tab,
// consolidateToMaxTwoGroups must refuse to run. Better to have 3+ editor
// groups than to nuke chats. Origin: 2026-05-17 evening Tate report
// "preview closes all the claude tabs in cursor".
function groupHasClaudeTab(group) {
  if (!group || !group.tabs) return false;
  for (const tab of group.tabs) {
    const viewType = tab && tab.input && tab.input.viewType || '';
    if (typeof viewType === 'string' && /claude/i.test(viewType)) return true;
    const label = String(tab && tab.label || '').toLowerCase();
    if (label.startsWith('claude code') || label === 'claude') return true;
  }
  return false;
}

function findExistingTab(vscode, filePath) {
  const target = norm(filePath);
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (!input) continue;
      const uri = input.uri || input.resource;
      if (uri && norm(uri.fsPath || uri.path) === target) {
        return { group, tab };
      }
      // Markdown preview tabs carry viewType 'mainThreadWebview-markdown.preview'
      // and the label is the basename. Match by viewType + label as fallback.
      if (input.viewType && /markdown/i.test(input.viewType) &&
          tab.label && norm(tab.label) === path.basename(target)) {
        return { group, tab };
      }
    }
  }
  return null;
}

async function focusExisting(vscode, found) {
  try { await vscode.window.tabGroups.activateTab?.(found.tab); } catch {}
  try {
    if (found.group?.viewColumn) {
      await vscode.commands.executeCommand('workbench.action.focusEditorGroup', found.group.viewColumn);
    }
  } catch {}
}

async function tryCommand(vscode, cmd, ...args) {
  try { await vscode.commands.executeCommand(cmd, ...args); return true; }
  catch { return false; }
}

// The "preview group" is the editor group that is NOT the currently-active one.
// VS Code numbers groups by viewColumn starting at 1. If only one group exists
// (or all groups are the active one), this returns null = no preview group yet.
function findPreviewGroup(vscode) {
  const groups = vscode.window.tabGroups.all;
  if (!groups || groups.length < 2) return null;
  const active = groups.find(g => g.isActive);
  const activeCol = active?.viewColumn;
  // Prefer a non-active group; if multiple, use the highest viewColumn so
  // previews stay in a stable rightmost slot.
  const candidates = groups
    .filter(g => g.viewColumn && g.viewColumn !== activeCol)
    .sort((a, b) => (b.viewColumn || 0) - (a.viewColumn || 0));
  return candidates[0] || null;
}

async function focusGroup(vscode, viewColumn) {
  // The focusXXXEditorGroup commands take no args; you have to call the
  // numbered variant. Map viewColumn 1..8 -> 'First'..'Eighth'.
  const named = ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth'];
  const ordinal = named[viewColumn - 1];
  if (ordinal) {
    try { await vscode.commands.executeCommand(`workbench.action.focus${ordinal}EditorGroup`); return; }
    catch {}
  }
  try { await vscode.commands.executeCommand('workbench.action.focusEditorGroup', viewColumn); } catch {}
}

// Enforce the 2-group invariant. If more than 2 editor groups exist after an
// open, merge the rightmost groups back into the preview group by moving
// each surplus group's editors left and closing the empty group.
async function consolidateToMaxTwoGroups(vscode) {
  let groups = vscode.window.tabGroups.all;
  // Wait up to 600ms for VS Code to settle after an async open command.
  for (let i = 0; i < 6 && groups.length <= 2; i++) {
    await new Promise(r => setTimeout(r, 100));
    groups = vscode.window.tabGroups.all;
  }
  // SAFETY GUARD: never consolidate if ANY group holds a Claude Code chat.
  // moveEditorToPreviousGroup disposes webview tabs instead of relocating
  // them, which kills live chat sessions. Accept 3+ groups over killing chats.
  for (const g of vscode.window.tabGroups.all) {
    if (groupHasClaudeTab(g)) return;
  }
  while (vscode.window.tabGroups.all.length > 2) {
    const all = [...vscode.window.tabGroups.all].sort(
      (a, b) => (b.viewColumn || 0) - (a.viewColumn || 0)
    );
    const rightmost = all[0];
    if (!rightmost) break;
    // Focus the rightmost group, then move all its editors to the previous
    // group one at a time. closeAllEditors on the empty group collapses it.
    await focusGroup(vscode, rightmost.viewColumn);
    const tabCount = rightmost.tabs.length;
    if (tabCount === 0) {
      await tryCommand(vscode, 'workbench.action.closeEditorsInGroup');
    } else {
      for (let i = 0; i < tabCount; i++) {
        const ok = await tryCommand(vscode, 'workbench.action.moveEditorToPreviousGroup');
        if (!ok) break;
      }
    }
    // If the group is now empty, close it.
    const refreshed = vscode.window.tabGroups.all.find(g => g.viewColumn === rightmost.viewColumn);
    if (refreshed && refreshed.tabs.length === 0) {
      await tryCommand(vscode, 'workbench.action.closeEditorsInGroup');
    }
    // Bail if the count didn't decrease (avoid infinite loop on weird states).
    if (vscode.window.tabGroups.all.length >= all.length) break;
  }
}

// Open `filePath` in the preview tab set. If a preview group already exists,
// focus it and use the non-ToSide variant so the tab lands in the existing
// group. If no preview group exists yet, use the ToSide variant (spawns it).
async function openInPreviewGroup(vscode, filePath) {
  const uri = vscode.Uri.file(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const previewGroup = findPreviewGroup(vscode);

  // First-preview-ever case: spawn the preview group via ToSide.
  if (!previewGroup) {
    if (ext === '.md' || ext === '.markdown') {
      await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
      return;
    }
    if (ext === '.html' || ext === '.htm' || ext === '.svg') {
      // livePreview / simpleBrowser don't have explicit ToSide variants; open
      // them and then move the new tab to a new side group.
      const opened =
        (await tryCommand(vscode, 'livePreview.start.preview.atFile', uri)) ||
        (await tryCommand(vscode, 'simpleBrowser.show', uri.toString()));
      if (!opened) { await vscode.env.openExternal(uri); return; }
      // Move the just-opened active editor into a new right-hand group.
      await tryCommand(vscode, 'workbench.action.moveEditorToRightGroup');
      return;
    }
    if (ext === '.pdf' || ext === '.ipynb') {
      const doc = await vscode.workspace.openTextDocument(uri).catch(() => null);
      if (doc) {
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      } else {
        await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: vscode.ViewColumn.Beside });
      }
      return;
    }
    // Fallback - text file to side
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    return;
  }

  // Subsequent-preview case: focus the existing preview group, then use the
  // current-group variants so the new tab lands inside it.
  await focusGroup(vscode, previewGroup.viewColumn);

  if (ext === '.md' || ext === '.markdown') {
    await vscode.commands.executeCommand('markdown.showPreview', uri);
    return;
  }
  if (ext === '.html' || ext === '.htm' || ext === '.svg') {
    if (await tryCommand(vscode, 'livePreview.start.preview.atFile', uri)) return;
    if (await tryCommand(vscode, 'simpleBrowser.show', uri.toString())) return;
    await vscode.env.openExternal(uri);
    return;
  }
  if (ext === '.pdf' || ext === '.ipynb') {
    if (await tryCommand(vscode, 'vscode.open', uri, { viewColumn: previewGroup.viewColumn })) return;
    await vscode.env.openExternal(uri);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: true, viewColumn: previewGroup.viewColumn });
}

async function openPreview(filePath, vscode) {
  // Reuse if already open in any group
  const found = findExistingTab(vscode, filePath);
  if (found) {
    await focusExisting(vscode, found);
  } else {
    await openInPreviewGroup(vscode, filePath);
  }

  // Enforce the 2-group invariant. simpleBrowser / livePreview commands
  // sometimes spawn their own column instead of using the focused group; this
  // collapses any surplus column back into the preview group so the screen
  // stays at chat (left) + previews (right), each ~half-screen.
  await consolidateToMaxTwoGroups(vscode);
}

module.exports = { openPreview };

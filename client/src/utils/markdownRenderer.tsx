/**
 * Lightweight markdown renderer for Manager AI chat messages.
 * Supports: tables (pipe-delimited), bullet lists, bold, paragraphs.
 * Shared between ManagerChatPanel and ManagerAIChatPage.
 */

import React from 'react';

function applyInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table block: lines that start and end with |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Filter separator rows (---|)
      const rows = tableLines.filter(l => !l.match(/^\s*\|[\s\-|:]+\|\s*$/));
      elements.push(
        <table key={`t${i}`} className="text-sm border-collapse w-full my-2">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'font-semibold border-b border-current' : ''}>
                {row.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 border-r border-current/20 last:border-0">{applyInline(cell.trim())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Bullet list item
    if (line.match(/^\s*[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside my-2 space-y-1">
          {items.map((item, ii) => <li key={ii}>{applyInline(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered list item
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol${i}`} className="list-decimal list-inside my-2 space-y-1">
          {items.map((item, ii) => <li key={ii}>{applyInline(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<div key={`sp${i}`} className="h-2" />);
    } else {
      elements.push(<p key={`p${i}`}>{applyInline(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

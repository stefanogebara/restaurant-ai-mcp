import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderMarkdown } from '../markdownRenderer';

describe('renderMarkdown', () => {
  it('renders plain text as a paragraph', () => {
    const { container } = render(<div>{renderMarkdown('Hello world')}</div>);
    expect(container.querySelector('p')).toHaveTextContent('Hello world');
  });

  it('renders bold text with ** markers', () => {
    const { container } = render(<div>{renderMarkdown('This is **bold** text')}</div>);
    const strong = container.querySelector('strong');
    expect(strong).toHaveTextContent('bold');
  });

  it('renders bullet lists', () => {
    const text = '- Item one\n- Item two\n- Item three';
    const { container } = render(<div>{renderMarkdown(text)}</div>);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Item one');
  });

  it('renders bullet lists with * prefix', () => {
    const text = '* Alpha\n* Beta';
    const { container } = render(<div>{renderMarkdown(text)}</div>);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders tables with pipe-delimited rows', () => {
    const text = '| Name | Count |\n| --- | --- |\n| Alice | 5 |\n| Bob | 3 |';
    const { container } = render(<div>{renderMarkdown(text)}</div>);
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    const rows = table!.querySelectorAll('tr');
    // header + 2 data rows (separator filtered out)
    expect(rows).toHaveLength(3);
  });

  it('renders empty lines as spacers', () => {
    const text = 'Line one\n\nLine two';
    const { container } = render(<div>{renderMarkdown(text)}</div>);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
  });

  it('handles mixed content', () => {
    const text = '**Summary**\n- Point A\n- Point B\n\nDone.';
    const { container } = render(<div>{renderMarkdown(text)}</div>);
    expect(container.querySelector('strong')).toHaveTextContent('Summary');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty fragment for empty string', () => {
    const { container } = render(<div>{renderMarkdown('')}</div>);
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('li')).toBeNull();
  });
});

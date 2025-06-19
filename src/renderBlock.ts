import { Decoration, WidgetType, EditorView } from '@codemirror/view';
import { RangeSet, StateField } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

import markdoc from '@markdoc/markdoc';

import type { Config } from '@markdoc/markdoc';
import type { DecorationSet } from '@codemirror/view'
import type { EditorState, Range } from '@codemirror/state';

const defaultConfig: Config = {
  nodes: {
    blockquote: {
      render: 'blockquote',
      transform(node, config) {
        const children = node.transformChildren(config);
        return new markdoc.Tag('blockquote', {}, children);
      }
    },
    paragraph: {
      render: 'p',
      transform(node, config) {
        const children = node.transformChildren(config);
        return new markdoc.Tag('p', {}, children);
      }
    },
    softbreak: {
      render: 'br',
      transform() {
        return new markdoc.Tag('br', {});
      }
    },
    hardbreak: {
      render: 'br',
      transform() {
        return new markdoc.Tag('br', {});
      }
    }
  }
};

const patternTag = /{%\s*(?<closing>\/)?(?<tag>[a-zA-Z0-9-_]+)(?<attrs>\s+[^]+)?\s*(?<self>\/)?%}\s*$/m;

class RenderBlockWidget extends WidgetType {
  rendered: string;

  constructor(public source: string, config: Config) {
    super();

    const mergedConfig = {
      ...defaultConfig,
      nodes: { ...defaultConfig.nodes, ...config.nodes },
      tags: { ...defaultConfig.tags, ...config.tags }
    };

    const document = markdoc.parse(source);
    const transformed = markdoc.transform(document, mergedConfig);
    this.rendered = markdoc.renderers.html(transformed);
  }

  eq(widget: RenderBlockWidget): boolean {
    return widget.source === widget.source;
  }

  toDOM(): HTMLElement {
    let content = document.createElement('div');
    content.setAttribute('contenteditable', 'false');
    content.className = 'cm-markdoc-renderBlock';
    content.innerHTML = this.rendered;
    return content;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  imagePath: string;
  nodeFrom: number;

  constructor(public source: string, nodeFrom: number, public showSyntax: boolean = false) {
    super();
    this.nodeFrom = nodeFrom;
    // Extract image path from ![[path]] syntax
    const match = source.match(/!\[\[([^\]]+)\]\]/);
    this.imagePath = match ? match[1] : '';
  }

  eq(widget: ImageWidget): boolean {
    return widget.source === this.source && widget.showSyntax === this.showSyntax && widget.nodeFrom === this.nodeFrom;
  }

  toDOM(): HTMLElement {
    let container = document.createElement('div');
    container.className = 'cm-markdoc-image';
    container.setAttribute('data-image-source', this.source);
    container.setAttribute('data-node-from', this.nodeFrom.toString());
    container.style.cursor = 'text'; // Make entire container clickable

    let img = document.createElement('img');
    img.src = this.imagePath;
    img.alt = this.imagePath;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.cursor = 'text';

    // Handle image load errors
    img.onerror = () => {
      img.style.display = 'none';
      let errorDiv = document.createElement('div');
      errorDiv.className = 'cm-markdoc-image-error';
      errorDiv.style.cursor = 'text'; // Make error div clickable too
      errorDiv.textContent = `"${this.imagePath}" could not be found.`;
      container.appendChild(errorDiv);
    };

    container.appendChild(img);
    return container;
  }

  ignoreEvent(event: Event): boolean {
    // Let CodeMirror handle mouse events - this should position cursor properly
    return false;
  }
}

function replaceBlocks(state: EditorState, config: Config, from?: number, to?: number) {
  const decorations: Range<Decoration>[] = [];
  const [cursor] = state.selection.ranges;

  const tags: [number, number][] = [];
  const stack: number[] = [];

  syntaxTree(state).iterate({
    from, to,
    enter(node) {
      if (node.name === 'MarkdocImage') {
      }
      if (!['Table', 'Blockquote', 'MarkdocTag', 'MarkdocImage'].includes(node.name))
        return;

      if (node.name === 'MarkdocImage') {
        const text = state.doc.sliceString(node.from, node.to);
        // Always add image widget after the text - NEVER replace the text
        const decoration = Decoration.widget({
          widget: new ImageWidget(text, node.from, false),
          block: true,
          side: 1, // Place after the line
        });
        decorations.push(decoration.range(node.to));
        return;
      }

      if (node.name === 'MarkdocTag') {
        const text = state.doc.sliceString(node.from, node.to);
        const match = text.match(patternTag);

        if (match?.groups?.self) {
          tags.push([node.from, node.to]);
          return;
        }

        if (match?.groups?.closing) {
          const last = stack.pop();
          if (last) tags.push([last, node.to]);
          return;
        }

        stack.push(node.from);
        return;
      }

      if (cursor.from >= node.from && cursor.to <= node.to)
        return false;

      const text = state.doc.sliceString(node.from, node.to);
      const decoration = Decoration.replace({
        widget: new RenderBlockWidget(text, config),
        block: true,
      });

      decorations.push(decoration.range(node.from, node.to));
    }
  });

  for (let [from, to] of tags) {
    if (cursor.from >= from && cursor.to <= to) continue;
    const text = state.doc.sliceString(from, to);
    const decoration = Decoration.replace({
      widget: new RenderBlockWidget(text, config),
      block: true,
    });

    decorations.push(decoration.range(from, to));
  }

  return decorations;
}

export default function (config: Config) {
  return StateField.define<DecorationSet>({
    create(state) {
      return RangeSet.of(replaceBlocks(state, config), true);
    },

    update(decorations, transaction) {
      return RangeSet.of(replaceBlocks(transaction.state, config), true);
    },

    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}
import { ViewPlugin } from '@codemirror/view';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';

import tagParser from './tagParser';
import highlightStyle from './highlightStyle';
import RichEditPlugin from './richEdit';
import renderBlock from './renderBlock';

import type { Config } from '@markdoc/markdoc';

export type MarkdocPluginConfig = { lezer?: any, markdoc: Config };

// Transaction filter to auto-snap cursor to image start when navigating with arrow keys
const imageNavigationFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged && tr.selection) {
    const oldCursor = tr.startState.selection.main.from;
    const newCursor = tr.selection.main.from;
    const movementDistance = Math.abs(newCursor - oldCursor);

    let wasInImage = false;
    let newCursorIsInImage = false;
    let snapTarget: number | null = null;

    syntaxTree(tr.startState).iterate({
      enter(node) {
        if (node.name === 'MarkdocImage') {
          if (oldCursor >= node.from && oldCursor <= node.to) {
            wasInImage = true;
          }
          if (newCursor >= node.from && newCursor <= node.to) {
            newCursorIsInImage = true;
          }

          // Snap to image start if coming from outside and landing near it
          if (!wasInImage &&
              newCursor !== node.from &&
              newCursor >= node.from - 2 &&
              newCursor <= node.to + 2) {
            snapTarget = node.from;
          }
        }
      }
    });

    // Allow natural movement if staying within image or clicking within image
    if ((wasInImage && newCursorIsInImage) || 
        (movementDistance > 5 && newCursorIsInImage)) {
      return tr;
    }

    // Snap to image start for arrow navigation
    if (snapTarget !== null && !wasInImage) {
      return [tr, { selection: { anchor: snapTarget } }];
    }
  }

  return tr;
});


export default function (config: MarkdocPluginConfig) {
  const mergedConfig = {
    ...config.lezer ?? [],
    extensions: [tagParser, ...config.lezer?.extensions ?? []]
  };

  return [
    imageNavigationFilter,
    ViewPlugin.fromClass(RichEditPlugin, {
      decorations: plugin => plugin.decorations,
      provide: () => [
        renderBlock(config.markdoc),
        syntaxHighlighting(highlightStyle),
        markdown(mergedConfig)
      ],
      eventHandlers: {
        mousedown(event, view) {
          const { target } = event;
          if (target instanceof Element && target.matches('.cm-markdoc-renderBlock *')) {
            view.dispatch({ selection: { anchor: view.posAtDOM(target) } });
            return true;
          }

          // Handle clicks on image text - fix positioning when CodeMirror calculates wrong position
          if (target instanceof Element && (
              target.classList.contains('cm-markdoc-image-syntax') || 
              (target.textContent && target.textContent.includes('![['))
          )) {
            const clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });

            // Find which image this text belongs to
            let imageNode: { from: number; to: number } | null = null;
            syntaxTree(view.state).iterate({
              enter(node) {
                if (node.name === 'MarkdocImage') {
                  const imageText = view.state.doc.sliceString(node.from, node.to);
                  if (target.textContent && imageText.includes(target.textContent.trim())) {
                    imageNode = { from: node.from, to: node.to };
                  }
                }
              }
            });

            // If click position is outside the correct image bounds, calculate proper offset
            if (imageNode && 
                (clickPos === null || clickPos < imageNode.from || clickPos > imageNode.to)) {

              // Calculate which character was clicked using DOM ranges
              const range = document.createRange();
              const textNode = target.firstChild;
              if (textNode && textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
                let bestOffset = 0;
                let bestDistance = Infinity;

                for (let i = 0; i <= textNode.textContent.length; i++) {
                  range.setStart(textNode, i);
                  range.setEnd(textNode, i);
                  const rect = range.getBoundingClientRect();
                  const distance = Math.abs(rect.left - event.clientX);
                  if (distance < bestDistance) {
                    bestDistance = distance;
                    bestOffset = i;
                  }
                }

                event.preventDefault();
                view.dispatch({ selection: { anchor: imageNode.from + bestOffset } });
                view.focus();
                return true;
              }
            }
          }

          // Handle image widget clicks
          if (target instanceof Element) {
            const imageWidget = target.closest('.cm-markdoc-image');
            if (imageWidget) {
              const nodeFrom = imageWidget.getAttribute('data-node-from');
              if (nodeFrom) {
                event.preventDefault(); // Prevent default cursor positioning
                view.dispatch({ selection: { anchor: parseInt(nodeFrom) } });
                view.focus();
                return true; // Indicate we handled the event
              }
            }
          }
          return false;
        }
      }
    })
  ];
}

import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Resolve CodeMirror dependencies from parent node_modules, to avoid duplicate instances
      '@codemirror/lang-markdown': resolve('../node_modules/@codemirror/lang-markdown'),
      '@codemirror/language': resolve('../node_modules/@codemirror/language'),
      '@codemirror/language-data': resolve('../node_modules/@codemirror/language-data'),
      '@codemirror/state': resolve('../node_modules/@codemirror/state'),
      '@codemirror/view': resolve('../node_modules/@codemirror/view'),
      '@lezer/highlight': resolve('../node_modules/@lezer/highlight'),
      '@lezer/markdown': resolve('../node_modules/@lezer/markdown'),
      '@markdoc/markdoc': resolve('../node_modules/@markdoc/markdoc'),
    }
  }
})

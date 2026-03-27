/**
 * Mock for the Vaul drawer library in unit tests (jsdom).
 * Vaul depends on real DOM measurements that aren't available in jsdom.
 * This mock renders Drawer.Content children directly without portal or animation.
 */
import React from 'react'

const passthrough = ({ children, ...props }: any) =>
  React.createElement('div', props, children)

const handle = (props: any) =>
  React.createElement('div', { 'data-testid': 'sheet-drag-handle', ...props })

const title = ({ children, ...props }: any) =>
  React.createElement('span', props, children)

export function createVaulMock() {
  return {
    Drawer: {
      Root: passthrough,
      Portal: passthrough,
      Overlay: passthrough,
      Content: ({ children, style, ...props }: any) =>
        React.createElement('div', { style: { ...style, overflow: 'hidden' }, ...props }, children),
      Handle: handle,
      Title: title,
      Trigger: passthrough,
    },
  }
}

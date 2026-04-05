/**
 * Fixture-based regression tests for cleanHtmlToText.
 *
 * These tests run the HTML cleaning function against realistic CMS page
 * structures to catch regressions like the Squarespace <article class="has-comments">
 * bug that stripped entire article bodies.
 *
 * Each fixture is a minimal but realistic HTML file from a popular CMS.
 * Tests verify:
 *   1. Article content (place names) is preserved
 *   2. Boilerplate (comments, sidebars, nav, footer) is stripped
 *   3. Output has substantial length (article body not accidentally stripped)
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { cleanHtmlToText } from '../cleanHtmlToText'

function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')
}

describe('cleanHtmlToText — CMS fixture tests', () => {
  it('Squarespace: preserves article body with has-comments class, strips comment divs', () => {
    const html = readFixture('squarespace-blog.html')
    const cleaned = cleanHtmlToText(html)

    // Article content preserved
    expect(cleaned).toContain('Four Ladies Mountain')
    expect(cleaned).toContain('Danba')
    expect(cleaned).toContain('Ganzi Town')
    expect(cleaned).toContain('Ta De Temple')
    expect(cleaned).toContain('Gong Ga Snow Mountain')

    // Boilerplate stripped
    expect(cleaned).not.toContain('Great article!')
    expect(cleaned).not.toContain('Thanks for sharing!')
    expect(cleaned).not.toContain('Navigation here')

    // Substantial content (not accidentally stripped)
    expect(cleaned.length).toBeGreaterThan(200)
  })

  it('WordPress: preserves entry-content, strips sidebar and comments', () => {
    const html = readFixture('wordpress-blog.html')
    const cleaned = cleanHtmlToText(html)

    // Article content preserved
    expect(cleaned).toContain('Tokyo')
    expect(cleaned).toContain('Shibuya')
    expect(cleaned).toContain('Senso-ji')
    expect(cleaned).toContain('Ichiran')

    // Boilerplate stripped
    expect(cleaned).not.toContain('Nice post!')
    expect(cleaned).not.toContain('Recent Posts')
    expect(cleaned).not.toContain('Navigation')

    // Substantial content
    expect(cleaned.length).toBeGreaterThan(200)
  })

  it('Ghost: preserves post-content, strips disqus comments', () => {
    const html = readFixture('ghost-blog.html')
    const cleaned = cleanHtmlToText(html)

    // Article content preserved
    expect(cleaned).toContain('Bangkok')
    expect(cleaned).toContain('Chatuchak')
    expect(cleaned).toContain('Grand Palace')

    // Boilerplate stripped
    expect(cleaned).not.toContain('Comments here')
    expect(cleaned).not.toContain('Navigation')

    // Substantial content
    expect(cleaned.length).toBeGreaterThan(100)
  })

  it('Substack: preserves body markup, strips comment list', () => {
    const html = readFixture('substack-post.html')
    const cleaned = cleanHtmlToText(html)

    // Article content preserved
    expect(cleaned).toContain('Lisbon')
    expect(cleaned).toContain('Time Out Market')
    expect(cleaned).toContain('Pasteis de Belem')

    // Boilerplate stripped
    expect(cleaned).not.toContain('Great read!')

    // Substantial content
    expect(cleaned.length).toBeGreaterThan(100)
  })
})

describe('cleanHtmlToText — article tag safety', () => {
  it('NEVER strips <article> tags regardless of class attributes', () => {
    // This is the exact regression scenario: <article> with boilerplate-matching classes
    const boilerplateClasses = [
      'has-comments', 'social-enabled', 'comment-thread',
      'sidebar-related', 'share-widget', 'newsletter-featured',
    ]
    for (const cls of boilerplateClasses) {
      const html = `<article class="${cls}"><p>Content must survive: ${cls}</p></article>`
      const cleaned = cleanHtmlToText(html)
      expect(cleaned, `Article with class="${cls}" was stripped`).toContain(`Content must survive: ${cls}`)
    }
  })

  it('DOES strip <div> and <section> with boilerplate classes', () => {
    const html = `
      <article><p>Article content</p></article>
      <div class="comments-section"><p>Comment text</p></div>
      <section class="newsletter-signup"><p>Subscribe text</p></section>
      <div class="sidebar-widget"><p>Sidebar text</p></div>
    `
    const cleaned = cleanHtmlToText(html)
    expect(cleaned).toContain('Article content')
    expect(cleaned).not.toContain('Comment text')
    expect(cleaned).not.toContain('Subscribe text')
    expect(cleaned).not.toContain('Sidebar text')
  })
})

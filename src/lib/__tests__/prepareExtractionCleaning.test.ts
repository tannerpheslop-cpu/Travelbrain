/**
 * Tests for the HTML cleaning logic in prepare-extraction Edge Function.
 *
 * Regression test: Squarespace article tags with class="has-comments" were
 * being stripped by the "comment" boilerplate pattern, removing the entire
 * article body. Fix: removed `article` from the tag list in the boilerplate
 * regex so <article> elements are never stripped.
 */
import { describe, it, expect } from 'vitest'

// Mirror the boilerplate patterns and cleaning logic from prepare-extraction
const BOILERPLATE_PATTERNS = [
  "comment", "sidebar", "widget", "newsletter", "subscribe", "signup",
  "cookie", "consent", "popup", "modal", "advertisement", "ad-", "ad_",
  "sponsor", "related-post", "related_post", "share", "social",
  "author-bio", "author_bio", "disqus", "footer-nav", "menu-item",
  "breadcrumb", "pagination", "wp-block-group", "printfriendly",
]

function stripBoilerplate(html: string): string {
  let h = html
  for (const pattern of BOILERPLATE_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // article intentionally excluded from tag list
    const regex = new RegExp(
      `<(div|section|aside|ul|ol|p|span)[^>]*(class|id)="[^"]*${escaped}[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`,
      "gi"
    )
    h = h.replace(regex, "")
  }
  return h
}

describe('boilerplate stripping preserves article content', () => {
  it('does NOT strip <article> with class containing "has-comments" (Squarespace regression)', () => {
    const html = `
      <article class="BlogItem hentry has-categories has-tags has-comments" data-item-id="123">
        <p>Four Ladies Mountain is a stunning peak in Western Sichuan.</p>
        <p>Visit Danba for Tibetan watchtowers.</p>
      </article>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Four Ladies Mountain')
    expect(result).toContain('Danba')
    expect(result).toContain('<article')
  })

  it('does NOT strip <article> with any boilerplate-matching class', () => {
    const html = `
      <article class="post-type-text social-sharing-enabled comment-thread-active">
        <h2>Best restaurants in Tokyo</h2>
        <p>Ichiran Ramen in Shibuya is a must-visit.</p>
      </article>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Ichiran Ramen')
    expect(result).toContain('Best restaurants')
  })

  it('DOES strip <div> with comment-related class', () => {
    const html = `
      <article><p>Main content here.</p></article>
      <div class="comments-section"><p>User comment text</p></div>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Main content here')
    expect(result).not.toContain('User comment text')
  })

  it('DOES strip <div> with sidebar class', () => {
    const html = `
      <article><p>Article body.</p></article>
      <div class="sidebar-widget"><p>Related posts</p></div>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Article body')
    expect(result).not.toContain('Related posts')
  })

  it('DOES strip <section> with newsletter class', () => {
    const html = `
      <article><p>Travel guide content.</p></article>
      <section class="newsletter-signup"><p>Subscribe to our newsletter</p></section>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Travel guide content')
    expect(result).not.toContain('Subscribe to our newsletter')
  })

  it('handles real Squarespace comment sections (div-based)', () => {
    const html = `
      <article class="BlogItem has-comments">
        <p>Genie Holy Mountain is breathtaking at sunrise.</p>
      </article>
      <div class="BlogItem-comments">
        <p>Great article!</p>
      </div>
      <div class="squarespace-comments">
        <p>Loved this guide.</p>
      </div>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Genie Holy Mountain')
    expect(result).not.toContain('Great article!')
    expect(result).not.toContain('Loved this guide')
  })

  it('handles WordPress article with social sharing classes', () => {
    const html = `
      <article class="post entry-content">
        <p>Visit Litang for authentic Tibetan culture.</p>
      </article>
      <div class="social-share-buttons">
        <span>Share on Twitter</span>
      </div>
    `
    const result = stripBoilerplate(html)
    expect(result).toContain('Litang')
    expect(result).not.toContain('Share on Twitter')
  })
})

"""Markdown for the canvas: the text is escaped, links are safe, the usual blocks are there."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mdrender  # noqa: E402


class Render(unittest.TestCase):
    def test_blocks(self):
        out = mdrender.blocks("# T\n\ntext **b** *i* `c<x>`\n\n- a\n  - b\n- c\n\n1. x\n2. y\n\n> q\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n<b>\n```\n\n---\n")
        for part in ("<h1>T</h1>", "<strong>b</strong>", "<em>i</em>", "<code>c&lt;x&gt;</code>", "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>",
                     "<ol><li>x</li><li>y</li></ol>", "<blockquote><p>q</p></blockquote>", "<th>a</th>", "<td>2</td>", "<pre><code>&lt;b&gt;</code></pre>", "<hr>"):
            self.assertIn(part, out)

    def test_safe(self):
        out = mdrender.blocks("<script>x</script>\n\n[a](javascript:alert(1)) [b](https://e.com/p?x=1&y=2) ![i](pic.png)")
        self.assertNotIn("<script>", out)
        self.assertNotIn("javascript:", out)
        self.assertIn('href="https://e.com/p?x=1&amp;y=2"', out)
        self.assertIn('src="pic.png"', out)

    def test_title_and_page(self):
        self.assertEqual(mdrender.title_of("\ntext\n## The *name*\n"), "The name")
        self.assertEqual(mdrender.title_of("no heading"), "")
        page = mdrender.page("# Hello", "file").decode()
        self.assertIn("<title>Hello</title>", page)
        self.assertIn("<main><h1>Hello</h1></main>", page)
        self.assertIn("<title>file</title>", mdrender.page("plain", "file").decode())


if __name__ == "__main__":
    unittest.main()

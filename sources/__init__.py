"""Style sources: one module per site. A source knows its links (what a pasted link means, which styles it lists) and how to read one style page.

A source has:
  host_names - what it answers to, for the settings page ("styles.refero.design");
  matches(url) -> bool - is this link its own;
  allowed(url) -> bool - may the fetcher go to this address (the site itself and its picture host; a redirect elsewhere is refused);
  plan(url, get) -> [ref] - the styles a link stands for; ref = {id, url, lastmod?, image?}; raises SourceError(code);
  parse(page, ref) -> style - {id, name, md, category, tags, site, description, image_url, video_url?, lastmod} from the page text; raises SourceError(code);
  image_ok(url) -> bool - may a preview be fetched from this address;
  cover_url(page, ref) -> str - optional: the address of the moving cover of a style from its page ("" - none); parse() gives it as video_url.
  bind(root, halt) - optional: the library folder and the stop signal, given before plan(); a source that works with files on this machine (a clone) needs them;
  canon(url) -> str - optional: the form of a link that is remembered and compared; remove_traces(root, link) - optional: what the source left besides the styles;
  a ref may carry "record" instead of a page: {file, md, entry, image?, preview?} - the style is made from files (sources/github.py), no parse() for it.
`get(url)` is given by the fetcher: the page text (None - the page is gone); a refusal of the site stops the whole run there."""
from .refero import Refero, SourceError
from .github import GitHub

SOURCES = [Refero(), GitHub()]


def for_url(url, sources=None):
    return next((s for s in (SOURCES if sources is None else sources) if s.matches(url)), None)


def names(sources=None):
    return [n for s in (SOURCES if sources is None else sources) for n in s.host_names]

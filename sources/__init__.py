"""Style sources: one module per site. A source knows its links (what a pasted link means, which styles it lists) and how to read one style page.

A source has:
  host_names - what it answers to, for the settings page ("styles.refero.design");
  matches(url) -> bool - is this link its own;
  allowed(url) -> bool - may the fetcher go to this address (the site itself and its picture host; a redirect elsewhere is refused);
  plan(url, get) -> [ref] - the styles a link stands for; ref = {id, url, lastmod?, image?}; raises SourceError(code);
  parse(page, ref) -> style - {id, name, md, category, tags, site, description, image_url, lastmod} from the page text; raises SourceError(code);
  image_ok(url) -> bool - may a preview be fetched from this address.
`get(url)` is given by the fetcher: the page text (None - the page is gone); a refusal of the site stops the whole run there."""
from .refero import Refero, SourceError

SOURCES = [Refero()]


def for_url(url, sources=None):
    return next((s for s in (SOURCES if sources is None else sources) if s.matches(url)), None)


def names(sources=None):
    return [n for s in (SOURCES if sources is None else sources) for n in s.host_names]

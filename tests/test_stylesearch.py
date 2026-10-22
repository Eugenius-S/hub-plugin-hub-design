"""The search of the style library by labels (stylesearch.py, styles.py with tags.json): ranking, "like X", filters, chips, labels on a card.
Every style here is made up for the test; a brand alias too."""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import styles  # noqa: E402
import stylesearch  # noqa: E402

STYLES = {   # id: (name, category, description, labels)
    "f1": ("Fruitphone", "E-commerce", "clean white phone store", {"theme": "light", "style": ["minimal", "glass"], "mood": ["premium"], "industry": ["ecommerce"]}),
    "r2": ("Rawbank", "Fintech", "concrete bank", {"theme": "dark", "style": ["brutalist"], "mood": ["raw"], "industry": ["fintech"]}),
    "s3": ("Softbank", "Fintech", "friendly bank", {"theme": "light", "style": ["pastel", "playful"], "mood": ["friendly"], "industry": ["fintech"]}),
    "n4": ("Nightcode", "Dev Tools", "terminal docs", {"theme": "dark", "style": ["technical"], "mood": ["serious"], "industry": ["devtools"]}),
    "q5": ("Quietdocs", "SaaS", "a calm notebook", {"theme": "light", "style": ["minimal"], "mood": ["calm"], "industry": ["saas"]}),
}
ALIAS = {"brand": "fruitphone-brand", "match": ["fruitparty", "фруктопати"],
         "add": {"theme": ["light"], "style": ["minimal", "glass"], "mood": ["premium"]}}


def make_labelled(root, tags=True):
    """Five invented styles with an index and (by default) tags.json."""
    os.makedirs(root, exist_ok=True)
    index = {}
    for sid, (name, cat, desc, _) in STYLES.items():
        with open(os.path.join(root, sid + ".md"), "w", encoding="utf-8") as f:
            f.write("# " + name + "\n")
        index[sid] = {"name": name, "file": sid + ".md", "category": cat, "description": desc, "tags": []}
    with open(os.path.join(root, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f)
    if tags:
        with open(os.path.join(root, "tags.json"), "w", encoding="utf-8") as f:
            json.dump({sid: v[3] for sid, v in STYLES.items()}, f)


class Labelled(unittest.TestCase):
    def setUp(self):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-labels-"))
        make_labelled(self.root)
        with open(stylesearch.VOCAB, encoding="utf-8") as f:
            data = json.load(f)
        data["aliases"].append(ALIAS)
        self.keep = stylesearch._cache.get("v")
        stylesearch._cache["v"] = stylesearch.Vocab(data)
        self.lib = styles.load(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)
        if self.keep is None:
            stylesearch._cache.pop("v", None)
        else:
            stylesearch._cache["v"] = self.keep

    def names(self, q, **kw):
        total, items = self.lib.search(q=q, **kw)
        return [i["name"] for i in items]

    def test_the_labels_come_from_tags_json_and_only_known_axes_stay(self):
        self.assertTrue(self.lib.labelled)
        self.assertEqual(self.lib.by_id["r2"]["labels"], {"theme": "dark", "style": ["brutalist"], "mood": ["raw"], "industry": ["fintech"]})
        self.assertEqual(styles._labels({"theme": "dark", "style": "x", "mood": 5, "taste": ["y"], "industry": [" ", "a"] + ["b"] * 20}),
                         {"theme": "dark", "style": ["x"], "industry": ["a"] + ["b"] * 7})
        self.assertEqual(styles._labels("junk"), {})

    def test_russian_words_find_labels(self):
        self.assertEqual(self.names("тёмный брутализм финтех")[0], "Rawbank")   # dark brutalism fintech

    def test_english_words_and_a_russian_ending(self):
        self.assertEqual(self.names("dark developer docs")[0], "Nightcode")
        self.assertEqual(self.names("светлый дружелюбный финтех")[0], "Softbank")   # light friendly fintech

    def test_a_brand_word_stands_for_its_labels(self):
        got = self.names("как фруктопати")   # "like fruitparty"
        self.assertEqual(got[0], "Fruitphone")   # minimal + glass + premium + light

    def test_like_a_style_of_the_library_takes_its_labels_as_a_model(self):
        got = self.names("like Rawbank")
        self.assertEqual(got[0], "Rawbank")
        self.assertEqual(got[1], "Nightcode")   # dark, like the model; the relatives are not cut: they are the point of "like"
        self.assertIn("Softbank", got)   # the same industry

    def test_a_name_and_a_part_of_a_name(self):
        self.assertEqual(self.names("nightcode")[0], "Nightcode")
        self.assertEqual(self.names("quiet"), ["Quietdocs"])   # the start of a word
        self.assertEqual(self.names("etdoc"), ["Quietdocs"])   # a piece in the middle: the plain substring search still finds it

    def test_nothing_known_gives_nothing_and_a_distant_relative_is_cut(self):
        self.assertEqual(self.names("zzzqqq"), [])
        got = self.names("dark brutalist raw fintech")
        self.assertEqual(got, ["Rawbank"])   # Softbank only shares fintech: under the cut

    def test_filters_narrow_the_list_with_or_without_a_query(self):
        self.assertEqual(self.names("", filters={"theme": "dark"}), ["Nightcode", "Rawbank"])
        self.assertEqual(self.names("", filters={"theme": "light", "industry": "fintech"}), ["Softbank"])
        self.assertEqual(self.names("bank", filters={"theme": "dark"}), ["Rawbank"])
        self.assertEqual(self.names("", filters={"theme": "dark", "taste": "x", "style": ""}), ["Nightcode", "Rawbank"])   # unknown axes and empty values are ignored
        self.assertEqual(self.names("", cat="Fintech", filters={"theme": "dark"}), ["Rawbank"])

    def test_without_a_query_it_is_alphabetical_and_paged(self):
        total, items = self.lib.search(offset=1, limit=2)
        self.assertEqual((total, [i["name"] for i in items]), (5, ["Nightcode", "Quietdocs"]))

    def test_the_card_shows_up_to_three_labels_the_wanted_ones_first(self):
        _, items = self.lib.search(q="dark fintech")
        self.assertEqual([x["k"] for x in items[0]["labels"]], ["dark", "fintech", "brutalist"])
        _, items = self.lib.search(q="", filters={"theme": "dark"})
        self.assertEqual([x["k"] for x in items[1]["labels"]], ["dark", "brutalist", "raw"])   # Rawbank: theme, style, mood
        self.assertLessEqual(max(len(i["labels"]) for i in self.lib.search(limit=9)[1]), styles.LABELS_SHOWN)

    def test_label_names_follow_the_language(self):
        _, ru = self.lib.search(q="rawbank", lang="ru")
        _, en = self.lib.search(q="rawbank", lang="en")
        self.assertEqual(en[0]["labels"][0], {"k": "dark", "t": "dark"})
        self.assertEqual(ru[0]["labels"][0]["k"], "dark")
        self.assertNotEqual(ru[0]["labels"][0]["t"], "dark")   # in Russian
        self.assertEqual(stylesearch.vocab().name("glass", "en"), "glass")   # "glass / glossy" is cut to its first part
        self.assertEqual(stylesearch.vocab().name("nope", "ru"), "nope")

    def test_the_card_of_a_style_has_all_its_labels(self):
        d = styles.detail(self.lib, "f1")
        self.assertEqual([x["k"] for x in d["labels"]], ["light", "minimal", "premium", "glass", "ecommerce"])

    def test_chips_are_the_most_frequent_labels_and_the_chosen_one_stays(self):
        f = self.lib.facets()
        self.assertEqual([(x["k"], x["n"]) for x in f["theme"]], [("light", 3), ("dark", 2)])
        self.assertEqual(f["industry"][0], {"k": "fintech", "t": "Fintech", "n": 2})
        self.assertEqual(f["style"][0]["k"], "minimal")
        old = styles.FACETS_TOP["style"]
        styles.FACETS_TOP["style"] = 1
        try:
            self.assertEqual([x["k"] for x in self.lib.facets()["style"]], ["minimal"])
            self.assertEqual([x["k"] for x in self.lib.facets(keep=["glass"])["style"]], ["minimal", "glass"])
        finally:
            styles.FACETS_TOP["style"] = old

    def test_tags_json_changes_are_noticed(self):
        with open(os.path.join(self.root, "tags.json"), "w", encoding="utf-8") as f:
            json.dump({"r2": {"theme": "light"}}, f)
        os.utime(os.path.join(self.root, "tags.json"), ns=(time.time_ns() + 10**9, time.time_ns() + 10**9))
        lib = styles.load(self.root)
        self.assertIsNot(lib, self.lib)
        self.assertEqual(lib.by_id["r2"]["labels"], {"theme": "light"})
        self.assertEqual(lib.by_id["f1"]["labels"], {})


MEDIA = {   # a made-up library with the medium and the density: the same look in a site, a deck and an app
    "w1": ("Fruitphone", "E-commerce", "clean white phone store", {"theme": "light", "style": ["minimal", "glass"], "mood": ["premium"], "medium": ["web"], "density": ["airy"]}),
    "w2": ("Nightcode", "Dev Tools", "terminal docs", {"theme": "dark", "style": ["technical"], "mood": ["serious"], "medium": ["web"], "density": ["dense"]}),
    "s1": ("Pitchwhite", "Slides", "a clean deck", {"theme": "light", "style": ["minimal", "glass"], "mood": ["premium"], "medium": ["slides"], "density": ["airy"]}),
    "s2": ("Deckdark", "Slides", "a dark deck", {"theme": "dark", "style": ["technical"], "mood": ["serious"], "medium": ["slides"], "density": ["dense"]}),
    "i1": ("Pocketpay", "Mobile", "a light pay app", {"theme": "light", "style": ["minimal"], "mood": ["friendly"], "medium": ["ios-app"], "density": ["balanced"]}),
    "m1": ("Androbank", "Mobile", "a bank app", {"theme": "light", "style": ["playful"], "mood": ["friendly"], "medium": ["mobile-app"], "density": ["balanced"]}),
}
MEDIA_ALIAS = {"brand": "fruit", "match": ["fruitparty", "фруктопати"], "add": {"theme": ["light"], "style": ["minimal", "glass"], "mood": ["premium"]}}


class Medium(unittest.TestCase):
    """The medium (what a style is made for) and the density: a word names them, a wrong medium goes down, "like <brand>" does not override them."""

    def setUp(self):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-medium-"))
        index = {}
        for sid, (name, cat, desc, _) in MEDIA.items():
            with open(os.path.join(self.root, sid + ".md"), "w", encoding="utf-8") as f:
                f.write("# " + name + "\n")
            index[sid] = {"name": name, "file": sid + ".md", "category": cat, "description": desc, "tags": []}
        with open(os.path.join(self.root, "index.json"), "w", encoding="utf-8") as f:
            json.dump(index, f)
        with open(os.path.join(self.root, "tags.json"), "w", encoding="utf-8") as f:
            json.dump({sid: v[3] for sid, v in MEDIA.items()}, f)
        with open(stylesearch.VOCAB, encoding="utf-8") as f:
            data = json.load(f)
        data["aliases"].append(MEDIA_ALIAS)
        self.keep = stylesearch._cache.get("v")
        stylesearch._cache["v"] = stylesearch.Vocab(data)
        self.lib = styles.load(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)
        if self.keep is None:
            stylesearch._cache.pop("v", None)
        else:
            stylesearch._cache["v"] = self.keep

    def names(self, q, **kw):
        return [i["name"] for i in self.lib.search(q=q, **kw)[1]]

    def test_the_medium_and_the_density_are_labels(self):
        self.assertEqual(self.lib.by_id["s2"]["labels"]["medium"], ["slides"])
        self.assertEqual(styles._labels({"medium": ["slides", "web"], "density": "airy"}), {"medium": ["slides", "web"], "density": ["airy"]})
        self.assertEqual(stylesearch.parse("слайды", stylesearch.vocab())[0]["medium"], {"slides": 1.0})
        self.assertEqual(stylesearch.parse("плотный дашборд", stylesearch.vocab())[0]["density"], {"dense": 1.0})

    def test_a_medium_asked_for_puts_the_other_media_down(self):
        got = self.names("light minimal slides")
        self.assertEqual(got[0], "Pitchwhite")
        self.assertNotIn("Fruitphone", got)   # the same look, but a site: under the cut
        self.assertEqual(self.names("слайды")[:2], ["Deckdark", "Pitchwhite"])   # "slides" alone: both decks, nothing else

    def test_like_a_brand_does_not_beat_the_medium(self):
        got = self.names("слайды как фруктопати")   # slides like <brand>: the brand's own site is Fruitphone
        self.assertEqual(got[0], "Pitchwhite")
        self.assertNotEqual(got[0], "Fruitphone")
        self.assertEqual(self.names("как фруктопати")[0], "Fruitphone")   # no medium asked: the brand style itself is first

    def test_an_ios_app_is_a_mobile_app_too_but_not_the_other_way_round(self):
        self.assertEqual(set(self.names("mobile app")), {"Pocketpay", "Androbank"})
        self.assertEqual(self.names("ios app"), ["Pocketpay"])

    def test_density_words_rank_and_chips_come_with_the_medium_first(self):
        self.assertEqual(set(self.names("плотный")), {"Nightcode", "Deckdark"})   # dense
        f = self.lib.facets()
        self.assertEqual(list(f)[0], "medium")
        self.assertEqual({x["k"]: x["n"] for x in f["medium"]}, {"web": 2, "slides": 2, "ios-app": 1, "mobile-app": 1})
        self.assertEqual({x["k"] for x in f["density"]}, {"airy", "dense", "balanced"})
        self.assertEqual(self.names("", filters={"medium": "slides", "density": "dense"}), ["Deckdark"])


class Unlabelled(unittest.TestCase):
    def setUp(self):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-labels-"))
        make_labelled(self.root, tags=False)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_no_tags_json_is_the_search_by_name_as_before(self):
        lib = styles.load(self.root)
        self.assertFalse(lib.labelled)
        self.assertEqual(lib.facets(), {})
        total, items = lib.search(q="bank")
        self.assertEqual((total, [i["name"] for i in items], items[0]["labels"]), (2, ["Rawbank", "Softbank"], []))
        self.assertEqual(lib.search(q="dark")[0], 0)   # no labels to understand "dark"

    def test_a_broken_tags_json_is_no_tags(self):
        with open(os.path.join(self.root, "tags.json"), "w") as f:
            f.write("{nope")
        self.assertFalse(styles.load(self.root).labelled)
        with open(os.path.join(self.root, "tags.json"), "w") as f:
            f.write("[1, 2]")
        self.assertFalse(styles.load(self.root).labelled)


class Pure(unittest.TestCase):
    def test_parse_splits_a_query_into_labels_brand_and_free_words(self):
        v = stylesearch.vocab()
        wanted, brands, free, like = stylesearch.parse("dark minimalist zzzqq", v)
        self.assertEqual((wanted["theme"], wanted["style"], free, like), ({"dark": 1.0}, {"minimal": 1.0}, ["zzzqq"], False))
        self.assertEqual(stylesearch.parse("", v)[2:], ([], False))

    def test_an_empty_dictionary_still_searches_by_words(self):
        v = stylesearch.Vocab({})
        rows = stylesearch.prepare([{"id": "1", "name": "Alpha Beta", "tags": [], "labels": {}}], v)
        self.assertEqual([e["name"] for e, _ in stylesearch.rank(rows, v, "beta")], ["Alpha Beta"])
        self.assertEqual(stylesearch.rank(rows, v, "gamma"), [])
        self.assertEqual(stylesearch.rank(rows, v, ""), [])

    def test_the_bundled_dictionary_is_whole(self):
        v = stylesearch.vocab()
        self.assertEqual(sorted(v.axes), sorted(stylesearch.AXES))
        for axis, labels in v.axes.items():
            for key, lab in labels.items():
                self.assertTrue(lab.get("en") and lab.get("ru"), (axis, key))
        keys = [k for labels in v.axes.values() for k in labels]
        self.assertEqual(len(keys), len(set(keys)))   # a label key is unique across the axes: chips and cards address a label by the key alone


if __name__ == "__main__":
    unittest.main()
